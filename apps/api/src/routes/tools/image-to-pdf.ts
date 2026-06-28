import { randomUUID } from "node:crypto";
import { apiToolPath } from "@snapotter/shared";
import archiver from "archiver";
import type { FastifyInstance } from "fastify";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { z } from "zod";
import { autoOrient } from "../../lib/auto-orient.js";
import { formatZodErrors } from "../../lib/errors.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { sanitizeFilename } from "../../lib/filename.js";
import { decodeToSharpCompat, needsCliDecode } from "../../lib/format-decoders.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { getObjectBuffer, putObject } from "../../lib/object-storage.js";
import { decompressSvgz, sanitizeSvg } from "../../lib/svg-sanitize.js";

const targetSizeSchema = z.object({
  value: z.number().positive(),
  unit: z.enum(["KB", "MB"]),
});

const settingsSchema = z.object({
  pageSize: z.enum(["A4", "Letter", "A3", "A5"]).default("A4"),
  orientation: z.enum(["portrait", "landscape"]).default("portrait"),
  margin: z.number().min(0).max(500).default(20),
  targetSize: targetSizeSchema.optional(),
  collate: z.boolean().default(true),
});

const PAGE_SIZES: Record<string, [number, number]> = {
  A4: [595.28, 841.89],
  Letter: [612, 792],
  A3: [841.89, 1190.55],
  A5: [419.53, 595.28],
};

function computeTargetBytes(targetSize: { value: number; unit: "KB" | "MB" }): number {
  return targetSize.unit === "MB"
    ? Math.round(targetSize.value * 1024 * 1024)
    : Math.round(targetSize.value * 1024);
}

const MIN_TARGET_BYTES = 50 * 1024;

async function compressImagesForTarget(
  imageBuffers: Buffer[],
  targetBytes: number,
  pdfOverhead: number,
): Promise<{ buffers: Buffer[]; quality: number; targetMet: boolean }> {
  const budget = targetBytes - pdfOverhead;
  if (budget <= 0) {
    const buffers = await Promise.all(
      imageBuffers.map((buf) => sharp(buf).jpeg({ quality: 10 }).toBuffer()),
    );
    return { buffers, quality: 10, targetMet: false };
  }

  let lo = 10;
  let hi = 95;
  let bestBuffers: Buffer[] | null = null;
  let bestQuality = lo;

  for (let i = 0; i < 8 && lo <= hi; i++) {
    const mid = Math.round((lo + hi) / 2);
    const compressed = await Promise.all(
      imageBuffers.map((buf) => sharp(buf).jpeg({ quality: mid }).toBuffer()),
    );
    const totalSize = compressed.reduce((sum, b) => sum + b.length, 0);

    if (totalSize <= budget) {
      bestBuffers = compressed;
      bestQuality = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (!bestBuffers) {
    bestBuffers = await Promise.all(
      imageBuffers.map((buf) => sharp(buf).jpeg({ quality: 10 }).toBuffer()),
    );
    bestQuality = 10;
  }

  const finalSize = bestBuffers.reduce((sum, b) => sum + b.length, 0);
  return { buffers: bestBuffers, quality: bestQuality, targetMet: finalSize <= budget };
}

/** Case-insensitive check that a filename ends with one of the accepted extensions. */
function matchesAccept(filename: string, accept: string[]): boolean {
  const lower = filename.toLowerCase();
  return accept.some((ext) => lower.endsWith(ext.toLowerCase()));
}

async function flattenAlpha(buf: Buffer): Promise<Buffer> {
  const meta = await sharp(buf).metadata();
  if (meta.hasAlpha) {
    return sharp(buf)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .toBuffer();
  }
  return buf;
}

export function registerImageToPdfRoute(
  app: FastifyInstance,
  opts: { toolId: string; accept?: string[] },
) {
  app.post(apiToolPath(opts.toolId), async (request, reply) => {
    const files: Array<{ buffer: Buffer; filename: string }> = [];
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
          if (buf.length > 0) {
            files.push({
              buffer: buf,
              filename: sanitizeFilename(part.filename ?? `image-${files.length}`),
            });
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

    if (files.length === 0) {
      return reply.status(400).send({ error: "No image files provided" });
    }

    if (opts.accept) {
      const accept = opts.accept;
      const invalid = files.find((file) => !matchesAccept(file.filename, accept));
      if (invalid) {
        return reply.status(400).send({
          error: `Invalid image "${invalid.filename}": this converter only accepts ${accept.join(", ")} files`,
        });
      }
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

    let targetBytes: number | null = null;
    if (settings.targetSize) {
      targetBytes = computeTargetBytes(settings.targetSize);
      if (targetBytes < MIN_TARGET_BYTES) {
        return reply.status(400).send({
          error: "Target size must be at least 50KB",
        });
      }
    }

    try {
      let [pageW, pageH] = PAGE_SIZES[settings.pageSize] ?? PAGE_SIZES.A4;

      if (settings.orientation === "landscape") {
        [pageW, pageH] = [pageH, pageW];
      }

      const margin = settings.margin;
      const contentW = pageW - margin * 2;
      const contentH = pageH - margin * 2;

      const preparedBuffers: Buffer[] = [];
      for (const file of files) {
        let buf = file.buffer;

        const validation = await validateImageBuffer(buf, file.filename);
        if (!validation.valid) {
          return reply.status(400).send({
            error: `Invalid image "${file.filename}": ${validation.reason}`,
          });
        }

        if (validation.format === "heif") {
          try {
            buf = await decodeHeic(buf);
          } catch (err) {
            return reply.status(422).send({
              error: `Failed to decode HEIC file "${file.filename}"`,
              details: err instanceof Error ? err.message : String(err),
            });
          }
        } else if (needsCliDecode(validation.format)) {
          try {
            const fileExt = file.filename.split(".").pop()?.toLowerCase();
            buf = await decodeToSharpCompat(buf, validation.format, fileExt);
          } catch {
            try {
              await sharp(buf).metadata();
            } catch (err) {
              return reply.status(422).send({
                error: `Failed to decode ${validation.format.toUpperCase()} file "${file.filename}"`,
                details: err instanceof Error ? err.message : String(err),
              });
            }
          }
        } else if (validation.format === "svg") {
          try {
            buf = decompressSvgz(buf);
            buf = sanitizeSvg(buf);
          } catch (err) {
            return reply.status(400).send({
              error: `Invalid SVG "${file.filename}": ${err instanceof Error ? err.message : "unknown error"}`,
            });
          }
        }

        preparedBuffers.push(await autoOrient(buf));
      }

      let imageBuffers: Buffer[];
      let compression:
        | { targetRequested: number; targetMet: boolean; jpegQuality: number }
        | undefined;

      if (targetBytes !== null) {
        const flattened = await Promise.all(preparedBuffers.map(flattenAlpha));
        const pdfOverhead = 2048 + files.length * 500;
        const result = await compressImagesForTarget(flattened, targetBytes, pdfOverhead);
        imageBuffers = result.buffers;
        compression = {
          targetRequested: targetBytes,
          targetMet: result.targetMet,
          jpegQuality: result.quality,
        };
      } else {
        imageBuffers = await Promise.all(preparedBuffers.map((buf) => sharp(buf).png().toBuffer()));
      }

      async function buildPdf(buffers: Buffer[]): Promise<Buffer> {
        const doc = new PDFDocument({
          size: [pageW, pageH],
          margin,
          autoFirstPage: false,
          compress: targetBytes !== null,
        });

        const pdfChunks: Buffer[] = [];
        doc.on("data", (chunk: Buffer) => pdfChunks.push(chunk));

        const pdfDone = new Promise<Buffer>((resolve) => {
          doc.on("end", () => resolve(Buffer.concat(pdfChunks)));
        });

        for (const imgBuf of buffers) {
          doc.addPage({ size: [pageW, pageH], margin });
          const meta = await sharp(imgBuf).metadata();
          const imgW = meta.width ?? 100;
          const imgH = meta.height ?? 100;

          const scale = Math.min(contentW / imgW, contentH / imgH, 1);
          const scaledW = imgW * scale;
          const scaledH = imgH * scale;

          const x = margin + (contentW - scaledW) / 2;
          const y = margin + (contentH - scaledH) / 2;

          doc.image(imgBuf, x, y, { width: scaledW, height: scaledH });
        }

        doc.end();
        return pdfDone;
      }

      const jobId = randomUUID();
      const originalSize = files.reduce((s, f) => s + f.buffer.length, 0);

      if (settings.collate) {
        const pdfBuffer = await buildPdf(imageBuffers);

        if (compression && targetBytes !== null) {
          compression.targetMet = pdfBuffer.length <= targetBytes;
        }

        const filename = "images.pdf";
        await putObject(`outputs/${jobId}/${filename}`, pdfBuffer);

        return reply.send({
          jobId,
          downloadUrl: `/api/v1/download/${jobId}/${filename}`,
          originalSize,
          processedSize: pdfBuffer.length,
          pages: files.length,
          ...(compression ? { compression } : {}),
        });
      }

      let totalProcessedSize = 0;
      const pdfNames: string[] = [];

      for (let i = 0; i < imageBuffers.length; i++) {
        const pdfBuffer = await buildPdf([imageBuffers[i]]);
        const baseName = files[i].filename.replace(/\.[^.]+$/, "");
        const pdfName = `${baseName}.pdf`;
        await putObject(`outputs/${jobId}/${pdfName}`, pdfBuffer);
        pdfNames.push(pdfName);
        totalProcessedSize += pdfBuffer.length;
      }

      // Build ZIP by streaming each entry from object storage (O(1-entry) peak)
      const zipFilename = "images.zip";
      const archive = archiver("zip", { zlib: { level: 5 } });
      const zipChunks: Buffer[] = [];
      archive.on("data", (chunk: Buffer) => zipChunks.push(chunk));
      const zipDone = new Promise<void>((resolve, reject) => {
        archive.on("end", resolve);
        archive.on("error", reject);
      });
      for (const name of pdfNames) {
        const buf = await getObjectBuffer(`outputs/${jobId}/${name}`);
        archive.append(buf, { name });
      }
      await archive.finalize();
      await zipDone;
      const zipBuffer = Buffer.concat(zipChunks);
      await putObject(`outputs/${jobId}/${zipFilename}`, zipBuffer);

      return reply.send({
        jobId,
        downloadUrl: `/api/v1/download/${jobId}/${zipFilename}`,
        originalSize,
        processedSize: totalProcessedSize,
        pages: files.length,
        collated: false,
        ...(compression ? { compression } : {}),
      });
    } catch (err) {
      return reply.status(422).send({
        error: "PDF creation failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });
}

export function registerImageToPdf(app: FastifyInstance) {
  registerImageToPdfRoute(app, { toolId: "image-to-pdf" });
}

/**
 * Register an "<image format> to PDF" conversion preset that reuses the
 * image-to-pdf route logic with inputs narrowed to the given extensions.
 */
export function registerImageToPdfPreset(app: FastifyInstance, toolId: string, accept: string[]) {
  registerImageToPdfRoute(app, { toolId, accept });
}
