import { randomUUID } from "node:crypto";
import { apiToolPath } from "@snapotter/shared";
import archiver from "archiver";
import type { FastifyInstance } from "fastify";
import PQueue from "p-queue";
import sharp from "sharp";
import { z } from "zod";
import { env } from "../../config.js";
import { getSecurityHeaders } from "../../lib/csp.js";
import { resolveConcurrency } from "../../lib/env.js";
import { formatZodErrors } from "../../lib/errors.js";
import { createUniqueNamer, sanitizeFilename } from "../../lib/filename.js";
import { encodeJxl } from "../../lib/format-encoders.js";
import { decodeHeic, encodeHeic } from "../../lib/heic-converter.js";
import { putObject } from "../../lib/object-storage.js";
import { decompressSvgz, isSvgBuffer, sanitizeSvg } from "../../lib/svg-sanitize.js";
import { updateJobProgress } from "../progress.js";

const NON_PREVIEWABLE = new Set(["tiff", "heif"]);

/** Case-insensitive check that a filename ends with one of the accepted extensions. */
function matchesAccept(filename: string, accept: string[]): boolean {
  const lower = filename.toLowerCase();
  return accept.some((ext) => lower.endsWith(ext.toLowerCase()));
}

const settingsSchema = z.object({
  width: z.number().min(1).max(65536).optional(),
  height: z.number().min(1).max(65536).optional(),
  dpi: z.number().min(36).max(2400).default(300),
  quality: z.number().min(1).max(100).default(90),
  backgroundColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6,8}$/)
    .default("#00000000"),
  outputFormat: z.enum(["png", "jpg", "webp", "avif", "tiff", "gif", "heif", "jxl"]).default("png"),
});

interface ParsedSvgFile {
  buffer: Buffer;
  filename: string;
}

/** Convert a sanitized SVG buffer to the requested raster format. */
async function convertSvg(
  svgBuffer: Buffer,
  filename: string,
  settings: z.infer<typeof settingsSchema>,
): Promise<{ buffer: Buffer; filename: string; ext: string }> {
  let image = sharp(svgBuffer, { density: settings.dpi });

  if (settings.width || settings.height) {
    image = image.resize(settings.width, settings.height, { fit: "inside" });
  }

  if (settings.backgroundColor !== "#00000000") {
    const bgR = parseInt(settings.backgroundColor.slice(1, 3), 16);
    const bgG = parseInt(settings.backgroundColor.slice(3, 5), 16);
    const bgB = parseInt(settings.backgroundColor.slice(5, 7), 16);
    image = image.flatten({ background: { r: bgR, g: bgG, b: bgB } });
  }

  let buffer: Buffer;
  let ext: string;

  switch (settings.outputFormat) {
    case "jpg":
      buffer = await image.jpeg({ quality: settings.quality }).toBuffer();
      ext = "jpg";
      break;
    case "webp":
      buffer = await image.webp({ quality: settings.quality }).toBuffer();
      ext = "webp";
      break;
    case "avif":
      buffer = await image.avif({ quality: settings.quality }).toBuffer();
      ext = "avif";
      break;
    case "tiff":
      buffer = await image.tiff({ quality: settings.quality }).toBuffer();
      ext = "tiff";
      break;
    case "gif":
      buffer = await image.gif().toBuffer();
      ext = "gif";
      break;
    case "jxl": {
      const pngBuf = await image.png().toBuffer();
      buffer = await encodeJxl(pngBuf, settings.quality);
      ext = "jxl";
      break;
    }
    case "heif": {
      const pngBuffer = await image.png().toBuffer();
      buffer = await encodeHeic(pngBuffer, settings.quality);
      ext = "heif";
      break;
    }
    default:
      buffer = await image.png().toBuffer();
      ext = "png";
      break;
  }

  const baseName = sanitizeFilename(filename).replace(/\.svgz?$/i, "");
  return { buffer, filename: `${baseName}.${ext}`, ext };
}

/**
 * SVG to raster conversion.
 * Custom route since input is SVG (not validated as image by magic bytes).
 */
export function registerSvgToRasterRoute(
  app: FastifyInstance,
  opts: { toolId: string; accept?: string[]; lockedFormat?: string },
) {
  const basePath = apiToolPath(opts.toolId);

  // --- Batch endpoint (registered first for route priority) ---
  app.post(`${basePath}/batch`, async (request, reply) => {
    const files: ParsedSvgFile[] = [];
    let settingsRaw: string | null = null;
    let clientJobId: string | null = null;

    try {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === "file") {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          // Empty parts keep their slot: the client maps results back onto its
          // own file list by index, so dropping one would label a converted
          // file with a different file's name (issue #645). The per-file loop
          // below fails it in place.
          files.push({
            buffer: Buffer.concat(chunks),
            filename: sanitizeFilename(part.filename ?? "output"),
          });
        } else if (part.fieldname === "settings") {
          settingsRaw = part.value as string;
        } else if (part.fieldname === "clientJobId") {
          const raw = part.value as string;
          if (typeof raw === "string" && raw.length > 0 && raw.length <= 128) {
            clientJobId = raw;
          }
        }
      }
    } catch (err) {
      return reply.status(400).send({
        error: "Failed to parse multipart request",
        details: err instanceof Error ? err.message : String(err),
      });
    }

    if (files.length === 0) {
      return reply.status(400).send({ error: "No SVG files provided" });
    }

    if (env.MAX_BATCH_SIZE > 0 && files.length > env.MAX_BATCH_SIZE) {
      return reply.status(400).send({
        error: `Too many files. Maximum batch size is ${env.MAX_BATCH_SIZE}`,
      });
    }

    if (opts.accept) {
      const accept = opts.accept;
      // Empty parts are exempt: they now keep their slot rather than being
      // dropped (issue #645), and a nameless one would otherwise fail this
      // whole-request check and take every valid file down with it. They fail
      // on their own below, where the reason reaches the file it belongs to.
      const invalid = files.find(
        (file) => file.buffer.length > 0 && !matchesAccept(file.filename, accept),
      );
      if (invalid) {
        return reply.status(400).send({
          error: "File is not a valid SVG. This tool only accepts SVG files.",
        });
      }
    }

    let settings: z.infer<typeof settingsSchema>;
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

    if (opts.lockedFormat) {
      settings.outputFormat = opts.lockedFormat as typeof settings.outputFormat;
    }

    const jobId = clientJobId || randomUUID();
    const queue = new PQueue({ concurrency: resolveConcurrency(env) });
    const results: ({ buffer: Buffer; filename: string } | null)[] = new Array(files.length).fill(
      null,
    );
    const errors: { filename: string; error: string }[] = [];
    let completedFiles = 0;

    updateJobProgress({
      jobId,
      status: "processing",
      totalFiles: files.length,
      completedFiles: 0,
      failedFiles: 0,
      errors: [],
    });

    const tasks = files.map((file, index) =>
      queue.add(async () => {
        updateJobProgress({
          jobId,
          status: "processing",
          totalFiles: files.length,
          completedFiles,
          failedFiles: errors.length,
          errors,
          currentFile: file.filename,
        });

        let decompressed: Buffer;
        try {
          decompressed = decompressSvgz(file.buffer);
        } catch (err) {
          errors.push({
            filename: file.filename,
            error: err instanceof Error ? err.message : "Invalid SVGZ file",
          });
          completedFiles++;
          updateJobProgress({
            jobId,
            status: "processing",
            totalFiles: files.length,
            completedFiles,
            failedFiles: errors.length,
            errors,
          });
          return;
        }

        if (!isSvgBuffer(decompressed)) {
          errors.push({ filename: file.filename, error: "Not a valid SVG file" });
          completedFiles++;
          updateJobProgress({
            jobId,
            status: "processing",
            totalFiles: files.length,
            completedFiles,
            failedFiles: errors.length,
            errors,
          });
          return;
        }

        let sanitized: Buffer;
        try {
          sanitized = sanitizeSvg(decompressed);
        } catch (err) {
          errors.push({
            filename: file.filename,
            error: err instanceof Error ? err.message : "Invalid SVG",
          });
          completedFiles++;
          updateJobProgress({
            jobId,
            status: "processing",
            totalFiles: files.length,
            completedFiles,
            failedFiles: errors.length,
            errors,
          });
          return;
        }

        try {
          const result = await convertSvg(sanitized, file.filename, settings);
          results[index] = { buffer: result.buffer, filename: result.filename };
        } catch (err) {
          errors.push({
            filename: file.filename,
            error: err instanceof Error ? err.message : "Conversion failed",
          });
        }
        completedFiles++;
        updateJobProgress({
          jobId,
          status: "processing",
          totalFiles: files.length,
          completedFiles,
          failedFiles: errors.length,
          errors,
        });
      }),
    );

    await Promise.all(tasks);

    updateJobProgress({
      jobId,
      status: errors.length === files.length ? "failed" : "completed",
      totalFiles: files.length,
      completedFiles,
      failedFiles: errors.length,
      errors,
    });

    if (errors.length === files.length) {
      return reply.status(422).send({ error: "All files failed processing", errors });
    }

    // Deduplicate filenames and build X-File-Results header
    const getUniqueName = createUniqueNamer();

    const fileResultsMap: Record<string, string> = {};
    for (let i = 0; i < results.length; i++) {
      const entry = results[i];
      if (entry) {
        const uniqueName = getUniqueName(entry.filename);
        entry.filename = uniqueName;
        fileResultsMap[String(i)] = uniqueName;
      }
    }

    // Hijack and stream the ZIP response
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="batch-svg-to-raster-${jobId.slice(0, 8)}.zip"`,
      "Transfer-Encoding": "chunked",
      "X-Job-Id": jobId,
      "X-File-Results": encodeURIComponent(JSON.stringify(fileResultsMap)),
      ...getSecurityHeaders(),
    });

    const archive = archiver("zip", { zlib: { level: 5 } });

    // Headers are already out, so this cannot change the status. Destroying
    // the socket is the only way to tell the client the archive is incomplete:
    // ending it cleanly reads as success and hands back a ZIP with no central
    // directory. Entries here are in-memory buffers, so unlike the other batch
    // routes there is no storage read to fail, but an archiver fault still has
    // to reach the client.
    let streamFailed = false;
    const failStream = (err: Error, msg: string) => {
      if (streamFailed) return;
      streamFailed = true;
      request.log.error({ err, jobId }, msg);
      archive.abort();
      reply.raw.destroy(err);
    };

    archive.on("error", (err) => failStream(err, "Archiver error during SVG batch processing"));

    archive.pipe(reply.raw);

    // A throw past this point cannot be answered: the reply is hijacked, so
    // Fastify logs and walks away, leaving the socket neither ended nor
    // destroyed and the client waiting forever.
    try {
      for (const result of results) {
        if (result) {
          archive.append(result.buffer, { name: result.filename });
        }
      }
      await archive.finalize();
    } catch (err) {
      failStream(
        err instanceof Error ? err : new Error(String(err)),
        "Failed to finalize ZIP during SVG batch processing",
      );
    }
  });

  // --- Single-file endpoint ---
  app.post(basePath, async (request, reply) => {
    let fileBuffer: Buffer | null = null;
    let filename = "output";
    let uploadFilename = "output";
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
          uploadFilename = sanitizeFilename(part.filename ?? "output");
          filename = uploadFilename.replace(/\.svgz?$/i, "");
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
      return reply.status(400).send({ error: "No SVG file provided" });
    }

    if (opts.accept && !matchesAccept(uploadFilename, opts.accept)) {
      return reply.status(400).send({
        error: "File is not a valid SVG. This tool only accepts SVG files.",
      });
    }

    try {
      fileBuffer = decompressSvgz(fileBuffer);
    } catch (err) {
      return reply.status(400).send({
        error: err instanceof Error ? err.message : "Invalid SVGZ file",
      });
    }

    if (!isSvgBuffer(fileBuffer)) {
      return reply.status(400).send({
        error: "File is not a valid SVG. This tool only accepts SVG files.",
      });
    }

    try {
      fileBuffer = sanitizeSvg(fileBuffer);
    } catch (err) {
      return reply.status(400).send({
        error: err instanceof Error ? err.message : "Invalid SVG",
      });
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

    if (opts.lockedFormat) {
      settings.outputFormat = opts.lockedFormat as typeof settings.outputFormat;
    }

    try {
      const {
        buffer,
        filename: outFilename,
        ext,
      } = await convertSvg(fileBuffer, filename, settings);
      const jobId = randomUUID();
      await putObject(`outputs/${jobId}/${outFilename}`, buffer);

      let previewUrl: string | undefined;
      if (NON_PREVIEWABLE.has(ext)) {
        try {
          // Sharp can't decode HEVC-encoded HEIF; decode first
          const previewInput = ext === "heif" ? await decodeHeic(buffer) : buffer;
          const previewBuffer = await sharp(previewInput)
            .resize(1200, 1200, { fit: "inside" })
            .webp({ quality: 80 })
            .toBuffer();
          await putObject(`outputs/${jobId}/preview.webp`, previewBuffer);
          previewUrl = `/api/v1/download/${jobId}/preview.webp`;
        } catch {
          // Non-fatal - frontend shows success card fallback
        }
      }

      return reply.send({
        jobId,
        downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(outFilename)}`,
        previewUrl,
        originalSize: fileBuffer.length,
        processedSize: buffer.length,
      });
    } catch (err) {
      return reply.status(422).send({
        error: "SVG conversion failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });
}

/**
 * SVG to raster conversion.
 * Custom route since input is SVG (not validated as image by magic bytes).
 */
export function registerSvgToRaster(app: FastifyInstance) {
  registerSvgToRasterRoute(app, { toolId: "svg-to-raster" });
}

/**
 * Register an "SVG to <format>" conversion preset that reuses the svg-to-raster
 * route logic with the output format locked and inputs narrowed to SVG.
 */
export function registerSvgToRasterPreset(
  app: FastifyInstance,
  toolId: string,
  lockedFormat: string,
) {
  registerSvgToRasterRoute(app, { toolId, lockedFormat, accept: [".svg", ".svgz"] });
}
