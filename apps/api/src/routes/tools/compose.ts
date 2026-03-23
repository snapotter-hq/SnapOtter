import { z } from "zod";
import sharp from "sharp";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createWorkspace } from "../../lib/workspace.js";
import { sanitizeFilename } from "../../lib/filename.js";

const settingsSchema = z.object({
  x: z.number().min(0).default(0),
  y: z.number().min(0).default(0),
  opacity: z.number().min(0).max(100).default(100),
  blendMode: z
    .enum([
      "over", "multiply", "screen", "overlay",
      "darken", "lighten", "hard-light", "soft-light",
      "difference", "exclusion",
    ])
    .default("over"),
});

export function registerCompose(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/compose",
    async (request, reply) => {
      let baseBuffer: Buffer | null = null;
      let overlayBuffer: Buffer | null = null;
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
            if (part.fieldname === "overlay") {
              overlayBuffer = buf;
            } else {
              baseBuffer = buf;
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

      if (!baseBuffer || baseBuffer.length === 0) {
        return reply.status(400).send({ error: "No base image provided" });
      }
      if (!overlayBuffer || overlayBuffer.length === 0) {
        return reply.status(400).send({ error: "No overlay image provided" });
      }

      let settings: z.infer<typeof settingsSchema>;
      try {
        const parsed = settingsRaw ? JSON.parse(settingsRaw) : {};
        const result = settingsSchema.safeParse(parsed);
        if (!result.success) {
          return reply.status(400).send({ error: "Invalid settings", details: result.error.issues });
        }
        settings = result.data;
      } catch {
        return reply.status(400).send({ error: "Settings must be valid JSON" });
      }

      try {
        // Apply opacity to overlay if needed
        let processedOverlay = overlayBuffer;
        if (settings.opacity < 100) {
          const overlayImg = sharp(overlayBuffer).ensureAlpha();
          const overlayBuf = await overlayImg.toBuffer();
          const overlayMeta = await sharp(overlayBuf).metadata();
          const oW = overlayMeta.width ?? 100;
          const oH = overlayMeta.height ?? 100;

          const opacityMask = await sharp({
            create: {
              width: oW,
              height: oH,
              channels: 4,
              background: { r: 0, g: 0, b: 0, alpha: settings.opacity / 100 },
            },
          })
            .png()
            .toBuffer();

          processedOverlay = await sharp(overlayBuf)
            .composite([{ input: opacityMask, blend: "dest-in" }])
            .toBuffer();
        }

        const result = await sharp(baseBuffer)
          .composite([{
            input: processedOverlay,
            top: settings.y,
            left: settings.x,
            blend: settings.blendMode as import("sharp").Blend,
          }])
          .toBuffer();

        const jobId = randomUUID();
        const workspacePath = await createWorkspace(jobId);
        const outputPath = join(workspacePath, "output", filename);
        await writeFile(outputPath, result);

        return reply.send({
          jobId,
          downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(filename)}`,
          originalSize: baseBuffer.length,
          processedSize: result.length,
        });
      } catch (err) {
        return reply.status(422).send({
          error: "Processing failed",
          details: err instanceof Error ? err.message : "Image processing failed",
        });
      }
    },
  );
}
