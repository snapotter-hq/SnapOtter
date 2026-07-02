import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import type { FastifyInstance } from "fastify";
import sharp, { type Blend } from "sharp";
import { z } from "zod";
import { formatZodErrors } from "../../lib/errors.js";
import { sanitizeFilename } from "../../lib/filename.js";
import { putObject } from "../../lib/object-storage.js";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { InputValidationError } from "../../modality/contract.js";
import { inputHandlerFor } from "../../modality/input-handler.js";

const settingsSchema = z.object({
  x: z.number().min(0).default(0),
  y: z.number().min(0).default(0),
  opacity: z.number().min(0).max(100).default(100),
  blendMode: z
    .enum([
      "over",
      "multiply",
      "screen",
      "overlay",
      "darken",
      "lighten",
      "hard-light",
      "soft-light",
      "difference",
      "exclusion",
    ])
    .default("over"),
});

export function registerCompose(app: FastifyInstance) {
  app.post("/api/v1/tools/image/compose", async (request, reply) => {
    let baseBuffer: Buffer | null = null;
    let overlayBuffer: Buffer | null = null;
    let filename = "image";
    let overlayFilename = "overlay";
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
            overlayFilename = sanitizeFilename(part.filename ?? "overlay");
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
        return reply
          .status(400)
          .send({ error: "Invalid settings", details: formatZodErrors(result.error.issues) });
      }
      settings = result.data;
    } catch {
      return reply.status(400).send({ error: "Settings must be valid JSON" });
    }

    try {
      const imageHandler = inputHandlerFor("image");
      const base = await imageHandler.prepare(baseBuffer, filename, {
        scratchDir: tmpdir(),
      });
      const overlay = await imageHandler.prepare(overlayBuffer, overlayFilename, {
        scratchDir: tmpdir(),
      });
      baseBuffer = base.buffer;
      overlayBuffer = overlay.buffer;
      filename = base.filename;

      const left = Math.floor(settings.x);
      const top = Math.floor(settings.y);
      const baseMeta = await sharp(baseBuffer).metadata();
      const baseWidth = baseMeta.width ?? 0;
      const baseHeight = baseMeta.height ?? 0;
      const availableWidth = baseWidth - left;
      const availableHeight = baseHeight - top;
      if (availableWidth <= 0 || availableHeight <= 0) {
        throw new InputValidationError("Overlay position is outside the base image");
      }

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

      const overlayMeta = await sharp(processedOverlay).metadata();
      const overlayWidth = overlayMeta.width ?? 0;
      const overlayHeight = overlayMeta.height ?? 0;
      if (overlayWidth > availableWidth || overlayHeight > availableHeight) {
        processedOverlay = await sharp(processedOverlay)
          .extract({
            left: 0,
            top: 0,
            width: Math.min(overlayWidth, availableWidth),
            height: Math.min(overlayHeight, availableHeight),
          })
          .toBuffer();
      }

      const outputFormat = await resolveOutputFormat(baseBuffer, filename);
      const result = await sharp(baseBuffer)
        .composite([
          {
            input: processedOverlay,
            top,
            left,
            blend: settings.blendMode as Blend,
          },
        ])
        .toFormat(outputFormat.format, { quality: outputFormat.quality })
        .toBuffer();

      const jobId = randomUUID();
      const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_composed.${outputFormat.extension}`;
      await putObject(`outputs/${jobId}/${outputFilename}`, result);

      return reply.send({
        jobId,
        downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(outputFilename)}`,
        originalSize: baseBuffer.length,
        processedSize: result.length,
      });
    } catch (err) {
      if (err instanceof InputValidationError) {
        return reply.status(err.statusCode).send({ error: err.message, details: err.details });
      }
      return reply.status(422).send({
        error: "Processing failed",
        details: err instanceof Error ? err.message : "Image processing failed",
      });
    }
  });
}
