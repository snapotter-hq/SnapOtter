import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seamCarve } from "@snapotter/ai";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { autoOrient } from "../../lib/auto-orient.js";
import { formatZodErrors, friendlyError } from "../../lib/errors.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { sanitizeFilename } from "../../lib/filename.js";
import { decodeToSharpCompat, needsCliDecode } from "../../lib/format-decoders.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { putObject } from "../../lib/object-storage.js";
import { InputValidationError } from "../../modality/contract.js";
import { inputHandlerFor } from "../../modality/input-handler.js";
import { registerToolProcessFn } from "../tool-factory.js";

const settingsSchema = z.object({
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  protectFaces: z.boolean().default(false),
  blurRadius: z.number().min(0).max(20).default(4),
  sobelThreshold: z.number().min(1).max(20).default(2),
  square: z.boolean().default(false),
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
        return reply.status(400).send({
          error: "Failed to parse multipart request",
          details: err instanceof Error ? err.message : String(err),
        });
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
          return reply.status(err.statusCode).send({ error: err.message, details: err.details });
        }
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
          return reply.status(400).send({
            error: "Invalid settings",
            details: formatZodErrors(result.error.issues),
          });
        }
        settings = result.data;
      } catch {
        return reply.status(400).send({ error: "Settings must be valid JSON" });
      }

      if (!settings.square && !settings.width && !settings.height) {
        return reply.status(400).send({
          error: "Either width, height, or square mode must be specified",
        });
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
          // Save input to object storage
          await putObject(`uploads/${jobId}/${filename}`, fileBuffer);

          // Process with caire
          const result = await seamCarve(fileBuffer, scratchDir, {
            width: settings.width,
            height: settings.height,
            protectFaces: settings.protectFaces,
            blurRadius: settings.blurRadius,
            sobelThreshold: settings.sobelThreshold,
            square: settings.square,
          });

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
      } catch (err) {
        request.log.error({ err, toolId: "content-aware-resize" }, "Content-aware resize failed");
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
    process: async (inputBuffer, settings, filename, ctx) => {
      const s = settings as Settings;
      // Decode HEIC/HEIF for pipeline/batch mode
      const ext = filename.split(".").pop()?.toLowerCase() ?? "";
      let buf = inputBuffer;
      if (["heic", "heif", "hif"].includes(ext)) {
        buf = await decodeHeic(buf);
      }
      // Decode CLI-decoded formats (RAW, TGA, PSD, EXR, HDR) for pipeline/batch mode
      const cliCheck = await validateImageBuffer(inputBuffer, filename);
      if (cliCheck.valid && needsCliDecode(cliCheck.format)) {
        buf = await decodeToSharpCompat(inputBuffer, cliCheck.format);
      }
      const orientedBuffer = await autoOrient(buf);
      const scratchDir = ctx?.scratchDir ?? join(tmpdir(), "snapotter-scratch", randomUUID());
      const needsCleanup = !ctx?.scratchDir;
      if (needsCleanup) await mkdir(scratchDir, { recursive: true });
      try {
        const result = await seamCarve(orientedBuffer, scratchDir, {
          width: s.width,
          height: s.height,
          protectFaces: s.protectFaces,
          blurRadius: s.blurRadius,
          sobelThreshold: s.sobelThreshold,
          square: s.square,
        });
        const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_seam.png`;
        return { buffer: result.buffer, filename: outputFilename, contentType: "image/png" };
      } finally {
        if (needsCleanup) await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
      }
    },
  });
}
