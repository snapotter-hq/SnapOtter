import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { z } from "zod";
import { autoOrient } from "../../lib/auto-orient.js";
import { formatZodErrors } from "../../lib/errors.js";
import { sanitizeFilename } from "../../lib/filename.js";
import { ensureSharpCompat } from "../../lib/heic-converter.js";
import { createWorkspace } from "../../lib/workspace.js";

const targetSizeSchema = z.object({
  value: z.number().positive(),
  unit: z.enum(["KB", "MB"]),
});

const settingsSchema = z.object({
  pageSize: z.enum(["A4", "Letter", "A3", "A5"]).default("A4"),
  orientation: z.enum(["portrait", "landscape"]).default("portrait"),
  margin: z.number().min(0).max(500).default(20),
  targetSize: targetSizeSchema.optional(),
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

async function flattenAlpha(buf: Buffer): Promise<Buffer> {
  const meta = await sharp(buf).metadata();
  if (meta.hasAlpha) {
    return sharp(buf)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .toBuffer();
  }
  return buf;
}

export function registerImageToPdf(app: FastifyInstance) {
  app.post("/api/v1/tools/image-to-pdf", async (request, reply) => {
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

      const preparedBuffers: Buffer[] = [];
      for (const file of files) {
        const compatBuffer = await autoOrient(await ensureSharpCompat(file.buffer));
        preparedBuffers.push(compatBuffer);
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

      for (let i = 0; i < imageBuffers.length; i++) {
        doc.addPage({ size: [pageW, pageH], margin });

        const imgBuf = imageBuffers[i];
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
      const pdfBuffer = await pdfDone;

      if (compression && targetBytes !== null) {
        compression.targetMet = pdfBuffer.length <= targetBytes;
      }

      const jobId = randomUUID();
      const workspacePath = await createWorkspace(jobId);
      const filename = "images.pdf";
      const outputPath = join(workspacePath, "output", filename);
      await writeFile(outputPath, pdfBuffer);

      return reply.send({
        jobId,
        downloadUrl: `/api/v1/download/${jobId}/${filename}`,
        originalSize: files.reduce((s, f) => s + f.buffer.length, 0),
        processedSize: pdfBuffer.length,
        pages: files.length,
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
