import { extname } from "node:path";
import { MAX_RESIZE_OUTPUT_DIMENSION, optimizeForWeb } from "@snapotter/image-engine";
import { hasServerErrorStatus, isToolInputError } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { openAnimated, readAnimationFor } from "../../lib/animated-image.js";
import { sendInputValidationError } from "../../lib/engine-unavailable.js";
import { formatZodErrors, stripInternalPaths } from "../../lib/errors.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { sanitizeFilename } from "../../lib/filename.js";
import { asDecoderOutOfMemory, isDecoderUnavailable } from "../../lib/format-decoders.js";
import { encodeJxl } from "../../lib/format-encoders.js";
import { asInputErrorIfUndecodable, withImageEncodeContext } from "../../lib/image-error.js";
import { prepareRouteImage } from "../../lib/image-input-prep.js";
import { multipartFailure } from "../../lib/multipart-parts.js";
import { normalizeOperationalWriteError } from "../../lib/object-storage.js";
import { InputValidationError } from "../../modality/contract.js";
import { engineUnavailable } from "../../modality/image-input.js";
import { createToolRoute } from "../tool-factory.js";

const FORMAT_CONTENT_TYPES: Record<string, string> = {
  webp: "image/webp",
  jpeg: "image/jpeg",
  avif: "image/avif",
  png: "image/png",
  jxl: "image/jxl",
};

const FORMAT_EXTENSIONS: Record<string, string> = {
  webp: "webp",
  jpeg: "jpg",
  avif: "avif",
  png: "png",
  jxl: "jxl",
};

const settingsSchema = z.object({
  format: z.enum(["webp", "jpeg", "avif", "png", "jxl"]).default("webp"),
  quality: z.number().int().min(1).max(100).default(80),
  maxWidth: z.number().int().positive().max(MAX_RESIZE_OUTPUT_DIMENSION).optional(),
  maxHeight: z.number().int().positive().max(MAX_RESIZE_OUTPUT_DIMENSION).optional(),
  progressive: z.boolean().default(true),
  stripMetadata: z.boolean().default(true),
});

type Settings = z.infer<typeof settingsSchema>;

async function processImage(inputBuffer: Buffer, settings: Settings, filename: string) {
  const isJxl = settings.format === "jxl";
  const engineSettings = isJxl ? { ...settings, format: "png" as const } : settings;

  // Only WebP among the target formats can hold an animation; the others
  // legitimately flatten to a still, and readAnimationFor keeps them there.
  const image = openAnimated(
    inputBuffer,
    await readAnimationFor(inputBuffer, engineSettings.format),
  );
  const result = await optimizeForWeb(image, engineSettings);
  let buffer: Buffer;
  try {
    buffer = await result.toBuffer();
  } catch (err) {
    throw await asInputErrorIfUndecodable(inputBuffer, err);
  }

  if (isJxl) {
    buffer = await encodeJxl(buffer, settings.quality);
  }

  const ext = extname(filename);
  const baseName = ext ? filename.slice(0, -ext.length) : filename;
  const outputFilename = `${baseName}.${FORMAT_EXTENSIONS[settings.format]}`;
  const contentType = FORMAT_CONTENT_TYPES[settings.format];

  return { buffer, filename: outputFilename, contentType };
}

export function registerOptimizeForWeb(app: FastifyInstance) {
  // Lightweight preview route for live parameter tuning
  app.post(
    "/api/v1/tools/image/optimize-for-web/preview",
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
        const failure = multipartFailure(err);
        return reply.status(failure.status).send(failure.body);
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return reply.status(400).send({ error: "No image file provided" });
      }

      let validation: Awaited<ReturnType<typeof validateImageBuffer>>;
      try {
        validation = await validateImageBuffer(fileBuffer, filename);
      } catch (rawErr) {
        const err = asDecoderOutOfMemory(rawErr);
        if (isDecoderUnavailable(err) || hasServerErrorStatus(err)) {
          return sendInputValidationError(
            reply,
            engineUnavailable(err),
            "optimize-for-web",
            request.log,
          );
        }
        throw rawErr;
      }
      if (!validation.valid) {
        return reply.status(400).send({ error: `Invalid image: ${validation.reason}` });
      }

      try {
        const prepared = await prepareRouteImage(fileBuffer, filename, validation.format, {
          log: request.log,
        });
        fileBuffer = prepared.buffer;
      } catch (rawErr) {
        const err = normalizeOperationalWriteError(asDecoderOutOfMemory(rawErr));
        if (err instanceof InputValidationError) {
          return reply.status(400).send({ error: err.message });
        }
        if (isDecoderUnavailable(err)) {
          return sendInputValidationError(
            reply,
            engineUnavailable(err),
            "optimize-for-web",
            request.log,
          );
        }
        if (hasServerErrorStatus(err)) throw err;
        if (!isToolInputError(err)) {
          request.log.error({ err, toolId: "optimize-for-web" }, "Input decoding failed");
        }
        return reply.status(422).send({
          error:
            validation.format === "heif"
              ? "Failed to decode HEIC file"
              : `Failed to decode ${validation.format} file`,
          details: stripInternalPaths(err instanceof Error ? err.message : String(err)),
        });
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
        const result = await processImage(fileBuffer, settings, filename);

        // Return the optimized image directly as binary with size headers.
        // This avoids workspace creation for ephemeral previews.
        reply.header("Content-Type", result.contentType);
        reply.header("X-Original-Size", String(fileBuffer.length));
        reply.header("X-Processed-Size", String(result.buffer.length));
        reply.header("X-Output-Filename", encodeURIComponent(result.filename));
        return reply.send(result.buffer);
      } catch (rawErr) {
        const err = normalizeOperationalWriteError(asDecoderOutOfMemory(rawErr));
        if (isDecoderUnavailable(err)) {
          return sendInputValidationError(
            reply,
            engineUnavailable(err),
            "optimize-for-web",
            request.log,
          );
        }
        if (hasServerErrorStatus(err)) throw err;
        const message = stripInternalPaths(
          err instanceof Error ? err.message : "Preview processing failed",
        );
        if (!isToolInputError(err)) {
          request.log.error({ err }, "Optimize preview failed");
        }
        return reply.status(422).send({ error: "Preview failed", details: message });
      }
    },
  );

  // Standard processing route via tool factory
  createToolRoute(app, {
    toolId: "optimize-for-web",
    settingsSchema,
    process: withImageEncodeContext<Settings>(
      "Web optimization failed",
      (s) => s?.format ?? "webp",
      processImage,
    ),
  });
}
