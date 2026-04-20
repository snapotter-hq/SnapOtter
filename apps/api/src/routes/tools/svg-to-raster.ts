import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import archiver from "archiver";
import type { FastifyInstance } from "fastify";
import PQueue from "p-queue";
import sharp from "sharp";
import { z } from "zod";
import { env } from "../../config.js";
import { formatZodErrors } from "../../lib/errors.js";
import { sanitizeFilename } from "../../lib/filename.js";
import { decodeHeic, encodeHeic } from "../../lib/heic-converter.js";
import { isSvgBuffer, sanitizeSvg } from "../../lib/svg-sanitize.js";
import { createWorkspace } from "../../lib/workspace.js";
import { updateJobProgress } from "../progress.js";

const NON_PREVIEWABLE = new Set(["tiff", "heif"]);

const settingsSchema = z.object({
  width: z.number().min(1).max(65536).optional(),
  height: z.number().min(1).max(65536).optional(),
  dpi: z.number().min(36).max(2400).default(300),
  quality: z.number().min(1).max(100).default(90),
  backgroundColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6,8}$/)
    .default("#00000000"),
  outputFormat: z.enum(["png", "jpg", "webp", "avif", "tiff", "gif", "heif"]).default("png"),
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

  const baseName = basename(filename).replace(/\.svg$/i, "");
  return { buffer, filename: `${baseName}.${ext}`, ext };
}

/**
 * SVG to raster conversion.
 * Custom route since input is SVG (not validated as image by magic bytes).
 */
export function registerSvgToRaster(app: FastifyInstance) {
  // --- Batch endpoint (registered first for route priority) ---
  app.post("/api/v1/tools/svg-to-raster/batch", async (request, reply) => {
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
          const buf = Buffer.concat(chunks);
          if (buf.length > 0) {
            files.push({
              buffer: buf,
              filename: sanitizeFilename(part.filename ?? "output"),
            });
          }
        } else if (part.fieldname === "settings") {
          settingsRaw = part.value as string;
        } else if (part.fieldname === "clientJobId") {
          clientJobId = part.value as string;
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

    if (files.length > env.MAX_BATCH_SIZE) {
      return reply.status(400).send({
        error: `Too many files. Maximum batch size is ${env.MAX_BATCH_SIZE}`,
      });
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

    const jobId = clientJobId || randomUUID();
    const queue = new PQueue({ concurrency: env.CONCURRENT_JOBS });
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

        if (!isSvgBuffer(file.buffer)) {
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
          sanitized = sanitizeSvg(file.buffer);
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
    const usedNames = new Set<string>();
    function getUniqueName(name: string): string {
      if (!usedNames.has(name)) {
        usedNames.add(name);
        return name;
      }
      const dotIdx = name.lastIndexOf(".");
      const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
      const ext = dotIdx > 0 ? name.slice(dotIdx) : "";
      let counter = 1;
      let candidate = `${base}_${counter}${ext}`;
      while (usedNames.has(candidate)) {
        counter++;
        candidate = `${base}_${counter}${ext}`;
      }
      usedNames.add(candidate);
      return candidate;
    }

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
      "X-File-Results": JSON.stringify(fileResultsMap),
    });

    const archive = archiver("zip", { zlib: { level: 5 } });

    archive.on("error", (err) => {
      request.log.error({ err }, "Archiver error during SVG batch processing");
      if (!reply.raw.writableEnded) {
        reply.raw.end();
      }
    });

    archive.pipe(reply.raw);

    for (const result of results) {
      if (result) {
        archive.append(result.buffer, { name: result.filename });
      }
    }

    await archive.finalize();
  });

  // --- Single-file endpoint ---
  app.post("/api/v1/tools/svg-to-raster", async (request, reply) => {
    let fileBuffer: Buffer | null = null;
    let filename = "output";
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
          filename = basename(part.filename ?? "output").replace(/\.svg$/i, "");
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

    if (!isSvgBuffer(fileBuffer)) {
      return reply.status(400).send({
        error: "File is not a valid SVG. This tool only accepts SVG files.",
      });
    }

    // Sanitize SVG to prevent XXE, SSRF, and script injection
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

    try {
      const {
        buffer,
        filename: outFilename,
        ext,
      } = await convertSvg(fileBuffer, filename, settings);
      const jobId = randomUUID();
      const workspacePath = await createWorkspace(jobId);
      const outputPath = join(workspacePath, "output", outFilename);
      await writeFile(outputPath, buffer);

      let previewUrl: string | undefined;
      if (NON_PREVIEWABLE.has(ext)) {
        try {
          // Sharp can't decode HEVC-encoded HEIF; decode first
          const previewInput = ext === "heif" ? await decodeHeic(buffer) : buffer;
          const previewBuffer = await sharp(previewInput)
            .resize(1200, 1200, { fit: "inside" })
            .webp({ quality: 80 })
            .toBuffer();
          const previewPath = join(workspacePath, "output", "preview.webp");
          await writeFile(previewPath, previewBuffer);
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
