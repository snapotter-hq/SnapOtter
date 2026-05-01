import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import archiver from "archiver";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { autoOrient } from "../../lib/auto-orient.js";
import { formatZodErrors } from "../../lib/errors.js";
import { sanitizeFilename } from "../../lib/filename.js";
import { ensureSharpCompat } from "../../lib/heic-converter.js";
import { registerToolProcessFn } from "../tool-factory.js";

const settingsSchema = z.object({
  columns: z.number().min(1).max(100).default(3),
  rows: z.number().min(1).max(100).default(3),
  tileWidth: z.number().min(10).optional(),
  tileHeight: z.number().min(10).optional(),
  outputFormat: z.enum(["original", "png", "jpg", "webp", "avif"]).default("original"),
  quality: z.number().min(1).max(100).default(90),
});

function resolveOutputFormat(
  outputFormat: string,
  originalExt: string,
): { sharpFormat: keyof sharp.FormatEnum | null; ext: string } {
  if (outputFormat === "original") {
    return { sharpFormat: null, ext: originalExt };
  }
  const map: Record<string, { sharpFormat: keyof sharp.FormatEnum; ext: string }> = {
    png: { sharpFormat: "png", ext: ".png" },
    jpg: { sharpFormat: "jpeg", ext: ".jpg" },
    webp: { sharpFormat: "webp", ext: ".webp" },
    avif: { sharpFormat: "avif", ext: ".avif" },
  };
  return map[outputFormat] ?? { sharpFormat: null, ext: originalExt };
}

export function registerSplit(app: FastifyInstance) {
  app.post("/api/v1/tools/split", async (request, reply) => {
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
      fileBuffer = await autoOrient(await ensureSharpCompat(fileBuffer));
      const metadata = await sharp(fileBuffer).metadata();
      const fullW = metadata.width ?? 0;
      const fullH = metadata.height ?? 0;

      let cols = settings.columns;
      let rows = settings.rows;
      if (settings.tileWidth && settings.tileHeight) {
        cols = Math.max(1, Math.ceil(fullW / settings.tileWidth));
        rows = Math.max(1, Math.ceil(fullH / settings.tileHeight));
      }
      cols = Math.min(cols, 100);
      rows = Math.min(rows, 100);

      const cellW = Math.floor(fullW / cols);
      const cellH = Math.floor(fullH / rows);
      const originalExt = extname(filename) || ".png";
      const baseName = filename.replace(/\.[^.]+$/, "");
      const { sharpFormat, ext: outputExt } = resolveOutputFormat(
        settings.outputFormat,
        originalExt,
      );
      const jobId = randomUUID();

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="split-${jobId.slice(0, 8)}.zip"`,
        "Transfer-Encoding": "chunked",
      });

      const archive = archiver("zip", { zlib: { level: 5 } });
      archive.pipe(reply.raw);

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          let left: number;
          let top: number;
          let w: number;
          let h: number;

          if (settings.tileWidth && settings.tileHeight) {
            left = col * settings.tileWidth;
            top = row * settings.tileHeight;
            w = col === cols - 1 ? fullW - left : Math.min(settings.tileWidth, fullW - left);
            h = row === rows - 1 ? fullH - top : Math.min(settings.tileHeight, fullH - top);
          } else {
            left = col * cellW;
            top = row * cellH;
            w = col === cols - 1 ? fullW - left : cellW;
            h = row === rows - 1 ? fullH - top : cellH;
          }

          if (left >= fullW || top >= fullH || w <= 0 || h <= 0) continue;

          let pipeline = sharp(fileBuffer).extract({ left, top, width: w, height: h });
          if (sharpFormat) {
            const formatOpts: Record<string, unknown> = {};
            if (sharpFormat === "jpeg" || sharpFormat === "webp" || sharpFormat === "avif") {
              formatOpts.quality = settings.quality;
            }
            if (sharpFormat === "avif") {
              formatOpts.effort = 4;
            }
            pipeline = pipeline.toFormat(sharpFormat, formatOpts);
          }

          const partBuffer = await pipeline.toBuffer();
          archive.append(partBuffer, {
            name: `${baseName}_r${row + 1}_c${col + 1}${outputExt}`,
          });
        }
      }

      await archive.finalize();
    } catch (err) {
      if (!reply.raw.headersSent) {
        return reply.status(422).send({
          error: "Split failed",
          details: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  });

  registerToolProcessFn({
    toolId: "split",
    settingsSchema,
    process: async (inputBuffer, _settings, filename) => {
      const settings = _settings as z.infer<typeof settingsSchema>;
      const metadata = await sharp(inputBuffer).metadata();
      const fullW = metadata.width ?? 0;
      const fullH = metadata.height ?? 0;

      let cols = settings.columns;
      let rows = settings.rows;
      if (settings.tileWidth && settings.tileHeight) {
        cols = Math.max(1, Math.ceil(fullW / settings.tileWidth));
        rows = Math.max(1, Math.ceil(fullH / settings.tileHeight));
      }
      cols = Math.min(cols, 100);
      rows = Math.min(rows, 100);

      const cellW = Math.floor(fullW / cols);
      const cellH = Math.floor(fullH / rows);
      const originalExt = extname(filename) || ".png";
      const baseName = filename.replace(/\.[^.]+$/, "");
      const { sharpFormat, ext: outputExt } = resolveOutputFormat(
        settings.outputFormat,
        originalExt,
      );

      const archive = archiver("zip", { zlib: { level: 5 } });
      const chunks: Buffer[] = [];
      archive.on("data", (chunk: Buffer) => chunks.push(chunk));
      const done = new Promise<void>((resolve, reject) => {
        archive.on("end", resolve);
        archive.on("error", reject);
      });

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          let left: number;
          let top: number;
          let w: number;
          let h: number;

          if (settings.tileWidth && settings.tileHeight) {
            left = col * settings.tileWidth;
            top = row * settings.tileHeight;
            w = col === cols - 1 ? fullW - left : Math.min(settings.tileWidth, fullW - left);
            h = row === rows - 1 ? fullH - top : Math.min(settings.tileHeight, fullH - top);
          } else {
            left = col * cellW;
            top = row * cellH;
            w = col === cols - 1 ? fullW - left : cellW;
            h = row === rows - 1 ? fullH - top : cellH;
          }

          if (left >= fullW || top >= fullH || w <= 0 || h <= 0) continue;

          let pipeline = sharp(inputBuffer).extract({ left, top, width: w, height: h });
          if (sharpFormat) {
            const formatOpts: Record<string, unknown> = {};
            if (sharpFormat === "jpeg" || sharpFormat === "webp" || sharpFormat === "avif") {
              formatOpts.quality = settings.quality;
            }
            if (sharpFormat === "avif") {
              formatOpts.effort = 4;
            }
            pipeline = pipeline.toFormat(sharpFormat, formatOpts);
          }

          const partBuffer = await pipeline.toBuffer();
          archive.append(partBuffer, {
            name: `${baseName}_r${row + 1}_c${col + 1}${outputExt}`,
          });
        }
      }

      await archive.finalize();
      await done;

      return {
        buffer: Buffer.concat(chunks),
        filename: `${baseName}_split.zip`,
        contentType: "application/zip",
      };
    },
  });
}
