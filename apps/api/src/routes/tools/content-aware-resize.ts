import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { seamCarve } from "@snapotter/ai";
import {
  hasServerErrorStatus,
  isToolInputError,
  MAX_CONTENT_AWARE_RESIZE_PIXELS,
  MAX_RESIZE_OUTPUT_DIMENSION,
} from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { sendInputValidationError } from "../../lib/engine-unavailable.js";
import { formatZodErrors, friendlyError } from "../../lib/errors.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { sanitizeFilename } from "../../lib/filename.js";
import { asDecoderOutOfMemory, isDecoderUnavailable } from "../../lib/format-decoders.js";
import { asInputErrorIfUndecodable, withImageEncodeContext } from "../../lib/image-error.js";
import { prepareRouteImage } from "../../lib/image-input-prep.js";
import { multipartFailure } from "../../lib/multipart-parts.js";
import { normalizeOperationalWriteError, putObject } from "../../lib/object-storage.js";
import { InputValidationError } from "../../modality/contract.js";
import { inputHandlerFor } from "../../modality/input-handler.js";
import { registerToolProcessFn } from "../tool-factory.js";

const MISSING_DIMENSIONS_MESSAGE = "Either width, height, or square mode must be specified";

// caire's -width/-height/-blur/-sobel flags are integer-only; a fractional
// value makes the binary exit with a flag parse error.
const settingsSchema = z
  .object({
    width: z.number().int().positive().max(MAX_RESIZE_OUTPUT_DIMENSION).optional(),
    height: z.number().int().positive().max(MAX_RESIZE_OUTPUT_DIMENSION).optional(),
    protectFaces: z.boolean().default(false),
    blurRadius: z.number().int().min(0).max(20).default(4),
    sobelThreshold: z.number().int().min(1).max(20).default(2),
    square: z.boolean().default(false),
  })
  .superRefine((s, ctx) => {
    if (!s.square && s.width === undefined && s.height === undefined) {
      ctx.addIssue({
        code: "custom",
        message: MISSING_DIMENSIONS_MESSAGE,
      });
      return;
    }
    if (s.square || s.width === undefined || s.height === undefined) return;
    if (s.width > MAX_RESIZE_OUTPUT_DIMENSION || s.height > MAX_RESIZE_OUTPUT_DIMENSION) return;
    if (s.width * s.height > MAX_CONTENT_AWARE_RESIZE_PIXELS) {
      ctx.addIssue({
        code: "custom",
        path: ["width"],
        message: `Target size ${s.width} x ${s.height} is over the ${MAX_CONTENT_AWARE_RESIZE_PIXELS} pixel limit`,
      });
    }
  });

type Settings = z.infer<typeof settingsSchema>;

/** Content-aware resize (seam carving via caire) route. */
export function registerContentAwareResize(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/image/content-aware-resize",
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

      // Shared image input chain (validate, HEIC/RAW decode with filename
      // rewrite, SVG sanitize, AVIF probe, autoOrient): the same handler the
      // factory-based image routes use, replacing an inline copy that had
      // already drifted (it never sanitized SVG or passed the file extension
      // to the RAW decoder).
      try {
        const prepared = await inputHandlerFor("image").prepare(fileBuffer, filename, {
          scratchDir: tmpdir(),
        });
        fileBuffer = prepared.buffer;
        filename = prepared.filename;
      } catch (err) {
        if (err instanceof InputValidationError) {
          return sendInputValidationError(reply, err, "content-aware-resize", request.log);
        }
        if (hasServerErrorStatus(err)) throw err;
        return reply.status(422).send({
          error: "Failed to prepare image",
          details: friendlyError(err instanceof Error ? err.message : String(err)),
        });
      }

      // Validate settings
      let settings: Settings;
      try {
        const parsed = settingsRaw ? JSON.parse(settingsRaw) : {};
        const result = settingsSchema.safeParse(parsed);
        if (!result.success) {
          const issues = result.error.issues;
          if (issues.length === 1 && issues[0]?.message === MISSING_DIMENSIONS_MESSAGE) {
            return reply.status(400).send({ error: MISSING_DIMENSIONS_MESSAGE });
          }
          return reply.status(400).send({
            error: "Invalid settings",
            details: formatZodErrors(issues),
          });
        }
        settings = result.data;
      } catch {
        return reply.status(400).send({ error: "Settings must be valid JSON" });
      }

      try {
        request.log.info(
          {
            toolId: "content-aware-resize",
            imageSize: fileBuffer.length,
            ...settings,
          },
          "Starting content-aware resize",
        );

        const jobId = randomUUID();
        const scratchDir = join(tmpdir(), "snapotter-scratch", jobId);
        await mkdir(scratchDir, { recursive: true });

        try {
          // Process with caire
          let result: Awaited<ReturnType<typeof seamCarve>>;
          try {
            result = await seamCarve(fileBuffer, scratchDir, {
              width: settings.width,
              height: settings.height,
              protectFaces: settings.protectFaces,
              blurRadius: settings.blurRadius,
              sobelThreshold: settings.sobelThreshold,
              square: settings.square,
            });
          } catch (err) {
            throw await asInputErrorIfUndecodable(fileBuffer, err);
          }

          // Save output to object storage
          const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_seam.png`;
          await putObject(`outputs/${jobId}/${outputFilename}`, result.buffer);

          return reply.send({
            jobId,
            downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(outputFilename)}`,
            originalSize: fileBuffer.length,
            processedSize: result.buffer.length,
            width: result.width,
            height: result.height,
          });
        } finally {
          await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
        }
      } catch (rawErr) {
        const err = normalizeOperationalWriteError(asDecoderOutOfMemory(rawErr));
        if (isDecoderUnavailable(err) || hasServerErrorStatus(err)) throw err;
        if (!isToolInputError(err)) {
          request.log.error({ err, toolId: "content-aware-resize" }, "Content-aware resize failed");
        }
        return reply.status(422).send({
          error: "Content-aware resize failed",
          details: friendlyError(err instanceof Error ? err.message : "Unknown error"),
        });
      }
    },
  );

  // Register in the pipeline/batch registry
  registerToolProcessFn({
    toolId: "content-aware-resize",
    settingsSchema,
    process: withImageEncodeContext<unknown>(
      "Content-aware resize failed",
      (s) => ((s as Settings)?.square ? "square" : "custom"),
      async (inputBuffer, settings, filename, ctx) => {
        const s = settings as Settings;
        const cliCheck = await validateImageBuffer(inputBuffer, filename);
        const ext = extname(filename).toLowerCase().replace(/^\./, "");
        const format = cliCheck.valid
          ? cliCheck.format
          : ["heic", "heif", "hif"].includes(ext)
            ? "heif"
            : ext === "svg" || ext === "svgz"
              ? "svg"
              : "png";
        const prepared = await prepareRouteImage(inputBuffer, filename, format, {
          rasterizeSvg: true,
        });
        const orientedBuffer = prepared.buffer;
        const scratchDir = ctx?.scratchDir ?? join(tmpdir(), "snapotter-scratch", randomUUID());
        const needsCleanup = !ctx?.scratchDir;
        if (needsCleanup) await mkdir(scratchDir, { recursive: true });
        try {
          let result: Awaited<ReturnType<typeof seamCarve>>;
          try {
            result = await seamCarve(orientedBuffer, scratchDir, {
              width: s.width,
              height: s.height,
              protectFaces: s.protectFaces,
              blurRadius: s.blurRadius,
              sobelThreshold: s.sobelThreshold,
              square: s.square,
            });
          } catch (err) {
            throw await asInputErrorIfUndecodable(orientedBuffer, err);
          }
          const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_seam.png`;
          return { buffer: result.buffer, filename: outputFilename, contentType: "image/png" };
        } finally {
          if (needsCleanup) await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
        }
      },
    ),
  });
}
