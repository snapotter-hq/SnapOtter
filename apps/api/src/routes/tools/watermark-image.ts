import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { autoOrient } from "../../lib/auto-orient.js";
import { formatZodErrors } from "../../lib/errors.js";
import { sanitizeFilename } from "../../lib/filename.js";
import { ensureSharpCompat } from "../../lib/heic-converter.js";

const settingsSchema = z.object({
  position: z
    .enum(["center", "top-left", "top-right", "bottom-left", "bottom-right"])
    .default("bottom-right"),
  opacity: z.number().min(0).max(100).default(50),
  scale: z.number().min(1).max(100).default(25),
});

export function registerWatermarkImage(app: FastifyInstance) {
  // Custom route since we need two file uploads
  app.post("/api/v1/tools/watermark-image", async (request, reply) => {
    let mainBuffer: Buffer | null = null;
    let watermarkBuffer: Buffer | null = null;
    let filename = "image";
    let settingsRaw: string | null = null;

    try {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === "file") {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          const buf = Buffer.concat(chunks);
          if (part.fieldname === "watermark") {
            watermarkBuffer = buf;
          } else {
            mainBuffer = buf;
            filename = sanitizeFilename(part.filename ?? "image");
          }
        } else if (part.fieldname === "settings") {
          settingsRaw = part.value as string;
        }
      }
    } catch (err) {
      return reply.status(400).send({
        error: "Failed to parse multipart request",
        details: err instanceof Error ? err.message : String(err),
      });
    }

    if (!mainBuffer || mainBuffer.length === 0) {
      return reply.status(400).send({ error: "No main image file provided" });
    }

    // Parse settings
    let settings: z.infer<typeof settingsSchema>;
    try {
      const parsed = settingsRaw ? JSON.parse(settingsRaw) : {};
      const result = settingsSchema.safeParse(parsed);
      if (!result.success) {
        return reply
          .status(400)
          .send({ error: "Invalid settings", details: formatZodErrors(result.error.issues) });
      }
      settings = result.data;
    } catch {
      return reply.status(400).send({ error: "Settings must be valid JSON" });
    }

    // If no watermark uploaded, just return the image
    if (!watermarkBuffer || watermarkBuffer.length === 0) {
      return reply.status(400).send({ error: "No watermark image provided" });
    }

    try {
      // Decode HEIC/HEIF if needed, then normalize EXIF orientation
      mainBuffer = await autoOrient(await ensureSharpCompat(mainBuffer));
      watermarkBuffer = await autoOrient(await ensureSharpCompat(watermarkBuffer));

      const mainImage = sharp(mainBuffer);
      const mainMeta = await mainImage.metadata();
      const mainW = mainMeta.width ?? 800;
      const mainH = mainMeta.height ?? 600;

      // Scale watermark
      const wmWidth = Math.round((mainW * settings.scale) / 100);
      let wmImage = sharp(watermarkBuffer).resize({ width: wmWidth });

      // Apply opacity via ensureAlpha + modulate
      if (settings.opacity < 100) {
        const wmBuf = await wmImage.ensureAlpha().toBuffer();
        const wmMeta = await sharp(wmBuf).metadata();
        const wmW = wmMeta.width ?? wmWidth;
        const wmH = wmMeta.height ?? wmWidth;
        // Create an opacity mask
        const opacityOverlay = await sharp({
          create: {
            width: wmW,
            height: wmH,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: settings.opacity / 100 },
          },
        })
          .png()
          .toBuffer();

        wmImage = sharp(wmBuf).composite([{ input: opacityOverlay, blend: "dest-in" }]);
      }

      const wmBuffer = await wmImage.toBuffer();
      const wmMeta = await sharp(wmBuffer).metadata();
      const wmW = wmMeta.width ?? wmWidth;
      const wmH = wmMeta.height ?? 0;

      // Calculate position
      const pad = 20;
      let top = 0;
      let left = 0;

      switch (settings.position) {
        case "top-left":
          top = pad;
          left = pad;
          break;
        case "top-right":
          top = pad;
          left = Math.max(0, mainW - wmW - pad);
          break;
        case "bottom-left":
          top = Math.max(0, mainH - wmH - pad);
          left = pad;
          break;
        case "bottom-right":
          top = Math.max(0, mainH - wmH - pad);
          left = Math.max(0, mainW - wmW - pad);
          break;
        default:
          top = Math.max(0, Math.round((mainH - wmH) / 2));
          left = Math.max(0, Math.round((mainW - wmW) / 2));
          break;
      }

      const result = await sharp(mainBuffer)
        .composite([{ input: wmBuffer, top, left }])
        .toBuffer();

      // Use tool-factory's workspace pattern
      const { randomUUID } = await import("node:crypto");
      const { writeFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const { createWorkspace } = await import("../../lib/workspace.js");

      const jobId = randomUUID();
      const workspacePath = await createWorkspace(jobId);
      const outputPath = join(workspacePath, "output", filename);
      await writeFile(outputPath, result);

      return reply.send({
        jobId,
        downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(filename)}`,
        originalSize: mainBuffer.length,
        processedSize: result.length,
      });
    } catch (err) {
      return reply.status(422).send({
        error: "Processing failed",
        details: err instanceof Error ? err.message : "Image processing failed",
      });
    }
  });
}
