import { extname } from "node:path";
import { optimizeForWeb } from "@snapotter/image-engine";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { autoOrient } from "../../lib/auto-orient.js";
import { formatZodErrors } from "../../lib/errors.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { sanitizeFilename } from "../../lib/filename.js";
import { decodeToSharpCompat, needsCliDecode } from "../../lib/format-decoders.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { sanitizeSvg } from "../../lib/svg-sanitize.js";
import { createToolRoute } from "../tool-factory.js";

const FORMAT_CONTENT_TYPES: Record<string, string> = {
  webp: "image/webp",
  jpeg: "image/jpeg",
  avif: "image/avif",
  png: "image/png",
};

const FORMAT_EXTENSIONS: Record<string, string> = {
  webp: "webp",
  jpeg: "jpg",
  avif: "avif",
  png: "png",
};

const settingsSchema = z.object({
  format: z.enum(["webp", "jpeg", "avif", "png"]).default("webp"),
  quality: z.number().min(1).max(100).default(80),
  maxWidth: z.number().positive().optional(),
  maxHeight: z.number().positive().optional(),
  progressive: z.boolean().default(true),
  stripMetadata: z.boolean().default(true),
});

type Settings = z.infer<typeof settingsSchema>;

async function processImage(inputBuffer: Buffer, settings: Settings, filename: string) {
  const image = sharp(inputBuffer);
  const result = await optimizeForWeb(image, settings);
  const buffer = await result.toBuffer();

  const ext = extname(filename);
  const baseName = ext ? filename.slice(0, -ext.length) : filename;
  const outputFilename = `${baseName}.${FORMAT_EXTENSIONS[settings.format]}`;
  const contentType = FORMAT_CONTENT_TYPES[settings.format];

  return { buffer, filename: outputFilename, contentType };
}

export function registerOptimizeForWeb(app: FastifyInstance) {
  // Lightweight preview route for live parameter tuning
  app.post(
    "/api/v1/tools/optimize-for-web/preview",
    async (request: FastifyRequest, reply: FastifyReply) => {
      let fileBuffer: Buffer | null = null;
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
            fileBuffer = Buffer.concat(chunks);
            filename = sanitizeFilename(part.filename ?? "image");
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

      if (!fileBuffer || fileBuffer.length === 0) {
        return reply.status(400).send({ error: "No image file provided" });
      }

      const validation = await validateImageBuffer(fileBuffer, filename);
      if (!validation.valid) {
        return reply.status(400).send({ error: `Invalid image: ${validation.reason}` });
      }

      // Decode HEIC/HEIF
      if (validation.format === "heif") {
        try {
          fileBuffer = await decodeHeic(fileBuffer);
        } catch (err) {
          return reply.status(422).send({
            error: "Failed to decode HEIC file",
            details: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Decode CLI-decoded formats (RAW, TGA, PSD, EXR, HDR)
      if (needsCliDecode(validation.format)) {
        try {
          fileBuffer = await decodeToSharpCompat(fileBuffer, validation.format);
        } catch (err) {
          return reply.status(422).send({
            error: `Failed to decode ${validation.format} file`,
            details: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Sanitize SVG
      if (validation.format === "svg") {
        try {
          fileBuffer = sanitizeSvg(fileBuffer);
        } catch (err) {
          return reply.status(400).send({
            error: err instanceof Error ? err.message : "Invalid SVG",
          });
        }
      }

      let settings: Settings;
      try {
        const parsed = settingsRaw ? JSON.parse(settingsRaw) : {};
        const result = settingsSchema.safeParse(parsed);
        if (!result.success) {
          return reply.status(400).send({
            error: "Invalid settings",
            details: formatZodErrors(result.error.issues),
          });
        }
        settings = result.data;
      } catch {
        return reply.status(400).send({ error: "Settings must be valid JSON" });
      }

      try {
        const processBuffer =
          validation.format === "svg" ? fileBuffer : await autoOrient(fileBuffer);
        const result = await processImage(processBuffer, settings, filename);

        // Return the optimized image directly as binary with size headers.
        // This avoids workspace creation for ephemeral previews.
        reply.header("Content-Type", result.contentType);
        reply.header("X-Original-Size", String(fileBuffer.length));
        reply.header("X-Processed-Size", String(result.buffer.length));
        reply.header("X-Output-Filename", encodeURIComponent(result.filename));
        return reply.send(result.buffer);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Preview processing failed";
        request.log.error({ err }, "Optimize preview failed");
        return reply.status(422).send({ error: "Preview failed", details: message });
      }
    },
  );

  // Standard processing route via tool factory
  createToolRoute(app, {
    toolId: "optimize-for-web",
    settingsSchema,
    process: processImage,
  });
}
