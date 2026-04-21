import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { env } from "../../config.js";
import { autoOrient } from "../../lib/auto-orient.js";
import { formatZodErrors } from "../../lib/errors.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { ensureSharpCompat } from "../../lib/heic-converter.js";
import { createWorkspace } from "../../lib/workspace.js";

const settingsSchema = z.object({
  direction: z.enum(["horizontal", "vertical", "grid"]).default("horizontal"),
  gridColumns: z.number().int().min(2).max(100).default(2),
  resizeMode: z.enum(["fit", "original", "stretch", "crop"]).default("fit"),
  alignment: z.enum(["start", "center", "end"]).default("center"),
  gap: z.number().min(0).max(1000).default(0),
  border: z.number().min(0).max(500).default(0),
  cornerRadius: z.number().min(0).max(500).default(0),
  backgroundColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#FFFFFF"),
  format: z.enum(["png", "jpeg", "webp"]).default("png"),
  quality: z.number().min(1).max(100).default(90),
});

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

interface PreparedImage {
  buffer: Buffer;
  width: number;
  height: number;
}

export function registerStitch(app: FastifyInstance) {
  app.post("/api/v1/tools/stitch", async (request, reply) => {
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

    if (files.length < 2) {
      return reply.status(400).send({ error: "At least 2 images are required for stitching" });
    }

    for (const file of files) {
      const validation = await validateImageBuffer(file.buffer, file.filename);
      if (!validation.valid) {
        return reply
          .status(400)
          .send({ error: `Invalid file "${file.filename}": ${validation.reason}` });
      }
      file.buffer = await autoOrient(await ensureSharpCompat(file.buffer));
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
      const imageMetas = await Promise.all(
        files.map(async (file) => {
          const meta = await sharp(file.buffer).metadata();
          return {
            buffer: file.buffer,
            width: meta.width ?? 0,
            height: meta.height ?? 0,
          };
        }),
      );

      const isHorizontal = settings.direction === "horizontal";
      const isGrid = settings.direction === "grid";

      let prepared: PreparedImage[];

      if (isGrid) {
        prepared = await prepareForGrid(imageMetas, settings);
      } else if (isHorizontal) {
        prepared = await prepareForHorizontal(imageMetas, settings.resizeMode);
      } else {
        prepared = await prepareForVertical(imageMetas, settings.resizeMode);
      }

      let canvasWidth: number;
      let canvasHeight: number;
      const composites: sharp.OverlayOptions[] = [];

      if (isGrid) {
        const cols = Math.min(settings.gridColumns, prepared.length);
        const rows = Math.ceil(prepared.length / cols);
        const cellWidth = Math.max(...prepared.map((img) => img.width));
        const cellHeight = Math.max(...prepared.map((img) => img.height));

        canvasWidth = cols * cellWidth + (cols - 1) * settings.gap + 2 * settings.border;
        canvasHeight = rows * cellHeight + (rows - 1) * settings.gap + 2 * settings.border;

        for (let i = 0; i < prepared.length; i++) {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const img = prepared[i];

          const cellLeft = settings.border + col * (cellWidth + settings.gap);
          const cellTop = settings.border + row * (cellHeight + settings.gap);

          const left = cellLeft + alignOffset(cellWidth, img.width, settings.alignment);
          const top = cellTop + alignOffset(cellHeight, img.height, settings.alignment);

          composites.push({ input: img.buffer, left, top });
        }
      } else if (isHorizontal) {
        const totalImgWidth = prepared.reduce((sum, img) => sum + img.width, 0);
        const maxHeight = Math.max(...prepared.map((img) => img.height));

        canvasWidth = totalImgWidth + (prepared.length - 1) * settings.gap + 2 * settings.border;
        canvasHeight = maxHeight + 2 * settings.border;

        let offset = settings.border;
        for (const img of prepared) {
          const top = settings.border + alignOffset(maxHeight, img.height, settings.alignment);
          composites.push({ input: img.buffer, left: offset, top });
          offset += img.width + settings.gap;
        }
      } else {
        const maxWidth = Math.max(...prepared.map((img) => img.width));
        const totalImgHeight = prepared.reduce((sum, img) => sum + img.height, 0);

        canvasWidth = maxWidth + 2 * settings.border;
        canvasHeight = totalImgHeight + (prepared.length - 1) * settings.gap + 2 * settings.border;

        let offset = settings.border;
        for (const img of prepared) {
          const left = settings.border + alignOffset(maxWidth, img.width, settings.alignment);
          composites.push({ input: img.buffer, left, top: offset });
          offset += img.height + settings.gap;
        }
      }

      const maxCanvasPixels = env.MAX_CANVAS_PIXELS > 0 ? env.MAX_CANVAS_PIXELS : Infinity;
      if (canvasWidth * canvasHeight > maxCanvasPixels) {
        return reply.status(422).send({
          error: `Canvas too large: ${canvasWidth}x${canvasHeight} (${Math.round((canvasWidth * canvasHeight) / 1_000_000)}MP exceeds ${Math.round(maxCanvasPixels / 1_000_000)}MP limit)`,
        });
      }

      const background = parseHexColor(settings.backgroundColor);
      let pipeline = sharp({
        create: {
          width: canvasWidth,
          height: canvasHeight,
          channels: 4,
          background: { r: background.r, g: background.g, b: background.b, alpha: 1 },
        },
      }).composite(composites);

      if (settings.format === "jpeg") {
        pipeline = pipeline.jpeg({ quality: settings.quality });
      } else if (settings.format === "webp") {
        pipeline = pipeline.webp({ quality: settings.quality });
      } else {
        pipeline = pipeline.png();
      }

      let result = await pipeline.toBuffer();

      if (settings.cornerRadius > 0) {
        const meta = await sharp(result).metadata();
        if (!meta.width || !meta.height) throw new Error("Cannot read image dimensions");
        const w = meta.width;
        const h = meta.height;
        const r = Math.min(settings.cornerRadius, Math.floor(Math.min(w, h) / 2));

        const mask = Buffer.from(
          `<svg width="${w}" height="${h}"><rect x="0" y="0" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="white"/></svg>`,
        );

        result = await sharp(result)
          .ensureAlpha()
          .composite([{ input: mask, blend: "dest-in" }])
          .png()
          .toBuffer();

        if (settings.format === "jpeg") {
          result = await sharp(result)
            .flatten({ background: { r: background.r, g: background.g, b: background.b } })
            .jpeg({ quality: settings.quality })
            .toBuffer();
        } else if (settings.format === "webp") {
          result = await sharp(result).webp({ quality: settings.quality }).toBuffer();
        }
      }

      const jobId = randomUUID();
      const workspacePath = await createWorkspace(jobId);
      const filename = `stitch.${settings.format}`;
      const outputPath = join(workspacePath, "output", filename);
      await writeFile(outputPath, result);

      return reply.send({
        jobId,
        downloadUrl: `/api/v1/download/${jobId}/${filename}`,
        originalSize: files.reduce((s, f) => s + f.buffer.length, 0),
        processedSize: result.length,
      });
    } catch (err) {
      return reply.status(422).send({
        error: "Stitch creation failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });
}

function alignOffset(containerSize: number, itemSize: number, alignment: string): number {
  if (alignment === "start") return 0;
  if (alignment === "end") return containerSize - itemSize;
  return Math.round((containerSize - itemSize) / 2);
}

async function prepareForHorizontal(
  images: PreparedImage[],
  resizeMode: string,
): Promise<PreparedImage[]> {
  if (resizeMode === "original") return images;

  const minHeight = Math.min(...images.map((m) => m.height));

  return Promise.all(
    images.map(async (img) => {
      if (img.height === minHeight && resizeMode === "fit") return img;

      if (resizeMode === "fit") {
        const scaledWidth = Math.round((img.width * minHeight) / img.height);
        const resized = await sharp(img.buffer).resize(scaledWidth, minHeight).toBuffer();
        return { buffer: resized, width: scaledWidth, height: minHeight };
      }

      if (resizeMode === "stretch") {
        const resized = await sharp(img.buffer)
          .resize(img.width, minHeight, { fit: "fill" })
          .toBuffer();
        return { buffer: resized, width: img.width, height: minHeight };
      }

      if (resizeMode === "crop") {
        const scaledWidth = Math.round((img.width * minHeight) / img.height);
        const resized = await sharp(img.buffer)
          .resize(scaledWidth, minHeight, { fit: "cover" })
          .toBuffer();
        return { buffer: resized, width: scaledWidth, height: minHeight };
      }

      return img;
    }),
  );
}

async function prepareForVertical(
  images: PreparedImage[],
  resizeMode: string,
): Promise<PreparedImage[]> {
  if (resizeMode === "original") return images;

  const minWidth = Math.min(...images.map((m) => m.width));

  return Promise.all(
    images.map(async (img) => {
      if (img.width === minWidth && resizeMode === "fit") return img;

      if (resizeMode === "fit") {
        const scaledHeight = Math.round((img.height * minWidth) / img.width);
        const resized = await sharp(img.buffer).resize(minWidth, scaledHeight).toBuffer();
        return { buffer: resized, width: minWidth, height: scaledHeight };
      }

      if (resizeMode === "stretch") {
        const resized = await sharp(img.buffer)
          .resize(minWidth, img.height, { fit: "fill" })
          .toBuffer();
        return { buffer: resized, width: minWidth, height: img.height };
      }

      if (resizeMode === "crop") {
        const scaledHeight = Math.round((img.height * minWidth) / img.width);
        const resized = await sharp(img.buffer)
          .resize(minWidth, scaledHeight, { fit: "cover" })
          .toBuffer();
        return { buffer: resized, width: minWidth, height: scaledHeight };
      }

      return img;
    }),
  );
}

async function prepareForGrid(
  images: PreparedImage[],
  settings: { gridColumns: number; resizeMode: string },
): Promise<PreparedImage[]> {
  if (settings.resizeMode === "original") return images;

  const medianWidth = median(images.map((m) => m.width));
  const medianHeight = median(images.map((m) => m.height));

  return Promise.all(
    images.map(async (img) => {
      if (settings.resizeMode === "fit") {
        const scale = Math.min(medianWidth / img.width, medianHeight / img.height);
        if (scale >= 1) return img;
        const newW = Math.round(img.width * scale);
        const newH = Math.round(img.height * scale);
        const resized = await sharp(img.buffer).resize(newW, newH).toBuffer();
        return { buffer: resized, width: newW, height: newH };
      }

      if (settings.resizeMode === "stretch") {
        const resized = await sharp(img.buffer)
          .resize(medianWidth, medianHeight, { fit: "fill" })
          .toBuffer();
        return { buffer: resized, width: medianWidth, height: medianHeight };
      }

      if (settings.resizeMode === "crop") {
        const resized = await sharp(img.buffer)
          .resize(medianWidth, medianHeight, { fit: "cover" })
          .toBuffer();
        return { buffer: resized, width: medianWidth, height: medianHeight };
      }

      return img;
    }),
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}
