import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { hasServerErrorStatus, IMAGE_EXT_TO_MIME } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { reportEngineUnavailable } from "../../lib/engine-unavailable.js";
import { formatZodErrors } from "../../lib/errors.js";
import {
  buildTagArgs,
  type EditMetadataSettings,
  inspectMetadata,
  writeMetadata,
} from "../../lib/exiftool.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { sanitizeFilename } from "../../lib/filename.js";
import {
  asDecoderOutOfMemory,
  DecoderOutOfMemoryError,
  decodeToSharpCompat,
  isDecoderUnavailable,
} from "../../lib/format-decoders.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { multipartFailure } from "../../lib/multipart-parts.js";
import { normalizeOperationalWriteError, putObject } from "../../lib/object-storage.js";
import {
  decompressSvgz,
  isSvgBuffer,
  isSvgzClientError,
  sanitizeSvg,
} from "../../lib/svg-sanitize.js";
import { engineUnavailable } from "../../modality/image-input.js";
import { registerToolProcessFn } from "../tool-factory.js";

const settingsSchema = z.object({
  title: z.string().optional(),
  author: z.string().optional(),
  artist: z.string().optional(),
  copyright: z.string().optional(),
  imageDescription: z.string().optional(),
  software: z.string().optional(),
  dateTime: z.string().optional(),
  dateTimeOriginal: z.string().optional(),
  clearGps: z.boolean().default(false),
  fieldsToRemove: z
    .array(z.string().regex(/^[a-zA-Z0-9:_-]+$/, "Invalid metadata field name"))
    .default([]),
  gpsLatitude: z.number().min(-90).max(90).optional(),
  gpsLongitude: z.number().min(-180).max(180).optional(),
  gpsAltitude: z.number().optional(),
  keywords: z.array(z.string()).optional(),
  keywordsMode: z.enum(["add", "set"]).default("add"),
  dateShift: z
    .string()
    .regex(/^[+-]\d{1,2}:\d{2}$/)
    .optional(),
  setAllDates: z.string().optional(),
  iptcTitle: z.string().optional(),
  iptcHeadline: z.string().optional(),
  iptcCity: z.string().optional(),
  iptcState: z.string().optional(),
  iptcCountry: z.string().optional(),
});

type Settings = z.infer<typeof settingsSchema>;

// edit-metadata writes tags in place and streams the ORIGINAL bytes back, so
// the download's content-type must match the real format, not a default. A
// previous fallback to image/jpeg made a BMP/PSD/PPM download claim to be a
// JPEG. Map every format validateImageBuffer can report.
const MIME_BY_FORMAT: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  tiff: "image/tiff",
  gif: "image/gif",
  heif: "image/heif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  cur: "image/x-icon",
  psd: "image/vnd.adobe.photoshop",
  jxl: "image/jxl",
  jp2: "image/jp2",
  qoi: "image/qoi",
  dds: "image/vnd.ms-dds",
  exr: "image/x-exr",
  hdr: "image/vnd.radiance",
  dpx: "image/x-dpx",
  fits: "image/fits",
  eps: "application/postscript",
  pbm: "image/x-portable-bitmap",
  pgm: "image/x-portable-graymap",
  ppm: "image/x-portable-pixmap",
  pfm: "image/x-portable-floatmap",
  tga: "image/x-tga",
  cr3: "image/x-canon-cr3",
  raw: "image/x-dcraw",
};

const BROWSER_PREVIEWABLE = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  "image/avif",
]);

const CLI_DECODE_FORMAT_BY_MIME: Readonly<Record<string, string>> = {
  "image/x-icon": "ico",
  "image/vnd.adobe.photoshop": "psd",
  "image/x-tga": "tga",
  "image/x-targa": "tga",
  "image/jxl": "jxl",
  "image/jp2": "jp2",
  "image/jpx": "jp2",
  "image/qoi": "qoi",
  "image/x-qoi": "qoi",
  "image/x-portable-pixmap": "ppm",
  "image/x-portable-graymap": "pgm",
  "image/x-portable-bitmap": "pbm",
  "image/x-portable-anymap": "ppm",
  "image/vnd.ms-dds": "dds",
  "image/x-dds": "dds",
  "image/x-exr": "exr",
  "image/vnd.radiance": "hdr",
  "image/x-dpx": "dpx",
  "image/x-cineon": "dpx",
  "image/fits": "fits",
  "image/x-eps": "eps",
  "application/postscript": "eps",
  "image/x-dcraw": "raw",
  "image/x-canon-cr3": "raw",
};

export function registerEditMetadata(app: FastifyInstance) {
  // Inspect endpoint - returns parsed metadata via ExifTool
  app.post(
    "/api/v1/tools/image/edit-metadata/inspect",
    async (request: FastifyRequest, reply: FastifyReply) => {
      let fileBuffer: Buffer | null = null;
      let filename = "image";

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
          }
        }
      } catch (err) {
        const failure = multipartFailure(err);
        return reply.status(failure.status).send(failure.body);
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return reply.status(400).send({ error: "No image file provided" });
      }

      let inspectBuffer = fileBuffer;
      if (extname(filename).toLowerCase() === ".svgz" || isSvgBuffer(fileBuffer)) {
        try {
          inspectBuffer = decompressSvgz(fileBuffer);
          if (isSvgBuffer(inspectBuffer)) {
            inspectBuffer = sanitizeSvg(inspectBuffer);
          } else {
            const validation = await validateImageBuffer(inspectBuffer, filename);
            if (!validation.valid) {
              return reply.status(400).send({ error: "Invalid SVGZ file" });
            }
          }
        } catch (err) {
          if (
            isSvgzClientError(err) ||
            (err instanceof Error && err.message.includes("SVGZ file does not contain"))
          ) {
            return reply.status(400).send({
              error: err instanceof Error ? err.message : "Invalid SVG",
            });
          }
          throw err;
        }
      }

      try {
        const result = await inspectMetadata(inspectBuffer, filename);
        return reply.send({ ...result, fileSize: fileBuffer.length });
      } catch (rawErr) {
        const err = normalizeOperationalWriteError(asDecoderOutOfMemory(rawErr));
        if (isDecoderUnavailable(err) || hasServerErrorStatus(err)) throw err;
        return reply.status(422).send({
          error: "Failed to read image metadata",
          details: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
  );

  // Edit endpoint - writes metadata in-place using ExifTool (no pixel re-encoding)
  app.post(
    "/api/v1/tools/image/edit-metadata",
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

      const originalSize = fileBuffer.length;
      const validation = await validateImageBuffer(fileBuffer, filename);
      if (!validation.valid) {
        return reply.status(400).send({ error: `Invalid image: ${validation.reason}` });
      }

      if (validation.format === "svg") {
        try {
          fileBuffer = decompressSvgz(fileBuffer);
          fileBuffer = sanitizeSvg(fileBuffer);
        } catch (err) {
          if (
            isSvgzClientError(err) ||
            (err instanceof Error && err.message.includes("SVGZ file does not contain"))
          ) {
            return reply.status(400).send({
              error: err instanceof Error ? err.message : "Invalid SVG",
            });
          }
          throw err;
        }
      }

      // Parse and validate settings
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
        // Build ExifTool arguments from settings
        const tags = buildTagArgs(settings as EditMetadataSettings);

        // If no changes requested, return the original buffer
        let outputBuffer: Buffer;
        if (tags.length === 0) {
          outputBuffer = fileBuffer;
        } else {
          outputBuffer = await writeMetadata(fileBuffer, filename, tags);
        }

        // Determine content type from validated format
        const contentType = MIME_BY_FORMAT[validation.format] ?? "image/jpeg";

        // Save output to object storage
        const jobId = randomUUID();
        await putObject(`outputs/${jobId}/${filename}`, outputBuffer);

        // Generate preview for non-browser-previewable formats (HEIF, TIFF, CLI-decoded)
        let previewUrl: string | undefined;
        if (!BROWSER_PREVIEWABLE.has(contentType)) {
          try {
            let previewInput: Buffer | null = outputBuffer;
            const cliFormat = CLI_DECODE_FORMAT_BY_MIME[contentType];
            try {
              if (contentType === "image/heif" || contentType === "image/heic") {
                previewInput = await decodeHeic(outputBuffer);
              } else if (cliFormat) {
                const fileExt = extname(filename).toLowerCase().replace(/^\./, "") || undefined;
                try {
                  previewInput = await decodeToSharpCompat(outputBuffer, cliFormat, fileExt);
                } catch (rawDecodeErr) {
                  const decodeErr = normalizeOperationalWriteError(
                    asDecoderOutOfMemory(rawDecodeErr),
                  );
                  if (
                    decodeErr instanceof DecoderOutOfMemoryError ||
                    (hasServerErrorStatus(decodeErr) && !isDecoderUnavailable(decodeErr))
                  ) {
                    throw decodeErr;
                  }
                  // Sharp reads some TIFF-headed RAW files (such as .dng) itself;
                  // only surface a CLI decode failure if Sharp cannot read it either.
                  try {
                    await sharp(outputBuffer).metadata();
                    await sharp(outputBuffer).resize(1).raw().toBuffer();
                  } catch (rawProbeErr) {
                    const probeErr = asDecoderOutOfMemory(rawProbeErr);
                    if (probeErr instanceof DecoderOutOfMemoryError) {
                      throw probeErr;
                    }
                    throw decodeErr;
                  }
                }
              }
            } catch (rawDecodeErr) {
              const decodeErr = normalizeOperationalWriteError(asDecoderOutOfMemory(rawDecodeErr));
              if (isDecoderUnavailable(decodeErr) || hasServerErrorStatus(decodeErr)) {
                reportEngineUnavailable(engineUnavailable(decodeErr), "edit-metadata", request.log);
                previewInput = null;
              } else {
                throw rawDecodeErr;
              }
            }
            if (previewInput) {
              const previewBuffer = await sharp(previewInput).webp({ quality: 80 }).toBuffer();
              await putObject(`outputs/${jobId}/preview.webp`, previewBuffer);
              previewUrl = `/api/v1/download/${jobId}/preview.webp`;
            }
          } catch (err) {
            const decoderErr = asDecoderOutOfMemory(err);
            if (isDecoderUnavailable(decoderErr)) {
              reportEngineUnavailable(engineUnavailable(decoderErr), "edit-metadata", request.log);
            } else {
              request.log.warn(
                { err, jobId, contentType },
                "preview generation failed; result has no renderable preview",
              );
            }
          }
        }

        return reply.send({
          jobId,
          downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(filename)}`,
          previewUrl,
          originalSize,
          processedSize: outputBuffer.length,
        });
      } catch (rawErr) {
        const err = normalizeOperationalWriteError(asDecoderOutOfMemory(rawErr));
        if (isDecoderUnavailable(err) || hasServerErrorStatus(err)) throw err;
        request.log.error({ err, toolId: "edit-metadata" }, "Metadata edit failed");
        return reply.status(422).send({
          error: "Metadata edit failed",
          details: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
  );

  // Register in pipeline/batch registry
  registerToolProcessFn({
    toolId: "edit-metadata",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const s = settings as Settings;
      const tags = buildTagArgs(s as EditMetadataSettings);
      const buffer =
        tags.length > 0 ? await writeMetadata(inputBuffer, filename, tags) : inputBuffer;

      // Determine content type from extension
      const ext = extname(filename).toLowerCase().replace(/^\./, "");

      return {
        buffer,
        filename,
        contentType: IMAGE_EXT_TO_MIME[ext] ?? "image/jpeg",
      };
    },
  });
}
