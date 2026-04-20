import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { FastifyInstance } from "fastify";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { z } from "zod";
import { autoOrient } from "../../lib/auto-orient.js";
import { formatZodErrors } from "../../lib/errors.js";
import { ensureSharpCompat } from "../../lib/heic-converter.js";
import { createWorkspace } from "../../lib/workspace.js";

const settingsSchema = z.object({
  pageSize: z.enum(["A4", "Letter", "A3", "A5"]).default("A4"),
  orientation: z.enum(["portrait", "landscape"]).default("portrait"),
  margin: z.number().min(0).max(500).default(20),
});

const PAGE_SIZES: Record<string, [number, number]> = {
  A4: [595.28, 841.89],
  Letter: [612, 792],
  A3: [841.89, 1190.55],
  A5: [419.53, 595.28],
};

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
              filename: basename(part.filename ?? `image-${files.length}`),
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

    try {
      let [pageW, pageH] = PAGE_SIZES[settings.pageSize] ?? PAGE_SIZES.A4;

      if (settings.orientation === "landscape") {
        [pageW, pageH] = [pageH, pageW];
      }

      const margin = settings.margin;
      const contentW = pageW - margin * 2;
      const contentH = pageH - margin * 2;

      // Create PDF
      const doc = new PDFDocument({
        size: [pageW, pageH],
        margin,
        autoFirstPage: false,
      });

      const pdfChunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => pdfChunks.push(chunk));

      const pdfDone = new Promise<Buffer>((resolve) => {
        doc.on("end", () => resolve(Buffer.concat(pdfChunks)));
      });

      for (const file of files) {
        doc.addPage({ size: [pageW, pageH], margin });

        // Decode HEIC/HEIF if needed, normalize EXIF orientation, then convert to PNG for PDFKit
        const compatBuffer = await autoOrient(await ensureSharpCompat(file.buffer));
        const pngBuffer = await sharp(compatBuffer).png().toBuffer();

        const meta = await sharp(pngBuffer).metadata();
        const imgW = meta.width ?? 100;
        const imgH = meta.height ?? 100;

        // Scale to fit within content area
        const scale = Math.min(contentW / imgW, contentH / imgH, 1);
        const scaledW = imgW * scale;
        const scaledH = imgH * scale;

        // Center on page
        const x = margin + (contentW - scaledW) / 2;
        const y = margin + (contentH - scaledH) / 2;

        doc.image(pngBuffer, x, y, {
          width: scaledW,
          height: scaledH,
        });
      }

      doc.end();
      const pdfBuffer = await pdfDone;

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
      });
    } catch (err) {
      return reply.status(422).send({
        error: "PDF creation failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });
}
