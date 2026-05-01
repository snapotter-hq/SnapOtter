import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { autoOrient } from "../../lib/auto-orient.js";
import { formatZodErrors } from "../../lib/errors.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { sanitizeFilename } from "../../lib/filename.js";
import { ensureSharpCompat } from "../../lib/heic-converter.js";
import { createWorkspace } from "../../lib/workspace.js";

// ── Template definitions (mirrors the frontend) ─────────────────────
// We only need the grid proportions and cell definitions here.

interface TemplateCell {
  gridColumn: string;
  gridRow: string;
}

interface Template {
  id: string;
  imageCount: number;
  gridTemplateColumns: string;
  gridTemplateRows: string;
  cells: TemplateCell[];
}

// Kept in sync with apps/web/src/lib/collage-templates.ts
const TEMPLATES: Template[] = [
  {
    id: "2-h-equal",
    imageCount: 2,
    gridTemplateColumns: "1fr 1fr",
    gridTemplateRows: "1fr",
    cells: [
      { gridColumn: "1", gridRow: "1" },
      { gridColumn: "2", gridRow: "1" },
    ],
  },
  {
    id: "2-v-equal",
    imageCount: 2,
    gridTemplateColumns: "1fr",
    gridTemplateRows: "1fr 1fr",
    cells: [
      { gridColumn: "1", gridRow: "1" },
      { gridColumn: "1", gridRow: "2" },
    ],
  },
  {
    id: "2-h-left-large",
    imageCount: 2,
    gridTemplateColumns: "2fr 1fr",
    gridTemplateRows: "1fr",
    cells: [
      { gridColumn: "1", gridRow: "1" },
      { gridColumn: "2", gridRow: "1" },
    ],
  },
  {
    id: "2-h-right-large",
    imageCount: 2,
    gridTemplateColumns: "1fr 2fr",
    gridTemplateRows: "1fr",
    cells: [
      { gridColumn: "1", gridRow: "1" },
      { gridColumn: "2", gridRow: "1" },
    ],
  },
  {
    id: "3-left-large",
    imageCount: 3,
    gridTemplateColumns: "2fr 1fr",
    gridTemplateRows: "1fr 1fr",
    cells: [
      { gridColumn: "1", gridRow: "1 / 3" },
      { gridColumn: "2", gridRow: "1" },
      { gridColumn: "2", gridRow: "2" },
    ],
  },
  {
    id: "3-right-large",
    imageCount: 3,
    gridTemplateColumns: "1fr 2fr",
    gridTemplateRows: "1fr 1fr",
    cells: [
      { gridColumn: "1", gridRow: "1" },
      { gridColumn: "1", gridRow: "2" },
      { gridColumn: "2", gridRow: "1 / 3" },
    ],
  },
  {
    id: "3-top-large",
    imageCount: 3,
    gridTemplateColumns: "1fr 1fr",
    gridTemplateRows: "2fr 1fr",
    cells: [
      { gridColumn: "1 / 3", gridRow: "1" },
      { gridColumn: "1", gridRow: "2" },
      { gridColumn: "2", gridRow: "2" },
    ],
  },
  {
    id: "3-h-equal",
    imageCount: 3,
    gridTemplateColumns: "1fr 1fr 1fr",
    gridTemplateRows: "1fr",
    cells: [
      { gridColumn: "1", gridRow: "1" },
      { gridColumn: "2", gridRow: "1" },
      { gridColumn: "3", gridRow: "1" },
    ],
  },
  {
    id: "3-v-equal",
    imageCount: 3,
    gridTemplateColumns: "1fr",
    gridTemplateRows: "1fr 1fr 1fr",
    cells: [
      { gridColumn: "1", gridRow: "1" },
      { gridColumn: "1", gridRow: "2" },
      { gridColumn: "1", gridRow: "3" },
    ],
  },
  {
    id: "4-grid",
    imageCount: 4,
    gridTemplateColumns: "1fr 1fr",
    gridTemplateRows: "1fr 1fr",
    cells: [
      { gridColumn: "1", gridRow: "1" },
      { gridColumn: "2", gridRow: "1" },
      { gridColumn: "1", gridRow: "2" },
      { gridColumn: "2", gridRow: "2" },
    ],
  },
  {
    id: "4-left-large",
    imageCount: 4,
    gridTemplateColumns: "2fr 1fr",
    gridTemplateRows: "1fr 1fr 1fr",
    cells: [
      { gridColumn: "1", gridRow: "1 / 4" },
      { gridColumn: "2", gridRow: "1" },
      { gridColumn: "2", gridRow: "2" },
      { gridColumn: "2", gridRow: "3" },
    ],
  },
  {
    id: "4-top-large",
    imageCount: 4,
    gridTemplateColumns: "1fr 1fr 1fr",
    gridTemplateRows: "2fr 1fr",
    cells: [
      { gridColumn: "1 / 4", gridRow: "1" },
      { gridColumn: "1", gridRow: "2" },
      { gridColumn: "2", gridRow: "2" },
      { gridColumn: "3", gridRow: "2" },
    ],
  },
  {
    id: "4-bottom-large",
    imageCount: 4,
    gridTemplateColumns: "1fr 1fr 1fr",
    gridTemplateRows: "1fr 2fr",
    cells: [
      { gridColumn: "1", gridRow: "1" },
      { gridColumn: "2", gridRow: "1" },
      { gridColumn: "3", gridRow: "1" },
      { gridColumn: "1 / 4", gridRow: "2" },
    ],
  },
  {
    id: "5-top2-bottom3",
    imageCount: 5,
    gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr",
    gridTemplateRows: "1fr 1fr",
    cells: [
      { gridColumn: "1 / 4", gridRow: "1" },
      { gridColumn: "4 / 7", gridRow: "1" },
      { gridColumn: "1 / 3", gridRow: "2" },
      { gridColumn: "3 / 5", gridRow: "2" },
      { gridColumn: "5 / 7", gridRow: "2" },
    ],
  },
  {
    id: "5-top3-bottom2",
    imageCount: 5,
    gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr",
    gridTemplateRows: "1fr 1fr",
    cells: [
      { gridColumn: "1 / 3", gridRow: "1" },
      { gridColumn: "3 / 5", gridRow: "1" },
      { gridColumn: "5 / 7", gridRow: "1" },
      { gridColumn: "1 / 4", gridRow: "2" },
      { gridColumn: "4 / 7", gridRow: "2" },
    ],
  },
  {
    id: "5-left-large",
    imageCount: 5,
    gridTemplateColumns: "2fr 1fr",
    gridTemplateRows: "1fr 1fr 1fr 1fr",
    cells: [
      { gridColumn: "1", gridRow: "1 / 5" },
      { gridColumn: "2", gridRow: "1" },
      { gridColumn: "2", gridRow: "2" },
      { gridColumn: "2", gridRow: "3" },
      { gridColumn: "2", gridRow: "4" },
    ],
  },
  {
    id: "5-center-large",
    imageCount: 5,
    gridTemplateColumns: "1fr 2fr 1fr",
    gridTemplateRows: "1fr 1fr",
    cells: [
      { gridColumn: "1", gridRow: "1" },
      { gridColumn: "2", gridRow: "1 / 3" },
      { gridColumn: "3", gridRow: "1" },
      { gridColumn: "1", gridRow: "2" },
      { gridColumn: "3", gridRow: "2" },
    ],
  },
  {
    id: "6-grid-2x3",
    imageCount: 6,
    gridTemplateColumns: "1fr 1fr",
    gridTemplateRows: "1fr 1fr 1fr",
    cells: [
      { gridColumn: "1", gridRow: "1" },
      { gridColumn: "2", gridRow: "1" },
      { gridColumn: "1", gridRow: "2" },
      { gridColumn: "2", gridRow: "2" },
      { gridColumn: "1", gridRow: "3" },
      { gridColumn: "2", gridRow: "3" },
    ],
  },
  {
    id: "6-grid-3x2",
    imageCount: 6,
    gridTemplateColumns: "1fr 1fr 1fr",
    gridTemplateRows: "1fr 1fr",
    cells: [
      { gridColumn: "1", gridRow: "1" },
      { gridColumn: "2", gridRow: "1" },
      { gridColumn: "3", gridRow: "1" },
      { gridColumn: "1", gridRow: "2" },
      { gridColumn: "2", gridRow: "2" },
      { gridColumn: "3", gridRow: "2" },
    ],
  },
  {
    id: "6-top-large",
    imageCount: 6,
    gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
    gridTemplateRows: "2fr 1fr",
    cells: [
      { gridColumn: "1 / 6", gridRow: "1" },
      { gridColumn: "1", gridRow: "2" },
      { gridColumn: "2", gridRow: "2" },
      { gridColumn: "3", gridRow: "2" },
      { gridColumn: "4", gridRow: "2" },
      { gridColumn: "5", gridRow: "2" },
    ],
  },
  {
    id: "7-mosaic",
    imageCount: 7,
    gridTemplateColumns: "1fr 1fr 1fr",
    gridTemplateRows: "1fr 1fr 1fr",
    cells: [
      { gridColumn: "1 / 3", gridRow: "1" },
      { gridColumn: "3", gridRow: "1" },
      { gridColumn: "1", gridRow: "2" },
      { gridColumn: "2", gridRow: "2" },
      { gridColumn: "3", gridRow: "2" },
      { gridColumn: "1", gridRow: "3" },
      { gridColumn: "2 / 4", gridRow: "3" },
    ],
  },
  {
    id: "8-mosaic",
    imageCount: 8,
    gridTemplateColumns: "1fr 1fr 1fr 1fr",
    gridTemplateRows: "1fr 1fr 1fr",
    cells: [
      { gridColumn: "1 / 3", gridRow: "1" },
      { gridColumn: "3", gridRow: "1" },
      { gridColumn: "4", gridRow: "1" },
      { gridColumn: "1", gridRow: "2" },
      { gridColumn: "2", gridRow: "2" },
      { gridColumn: "3 / 5", gridRow: "2" },
      { gridColumn: "1 / 3", gridRow: "3" },
      { gridColumn: "3 / 5", gridRow: "3" },
    ],
  },
  {
    id: "9-grid",
    imageCount: 9,
    gridTemplateColumns: "1fr 1fr 1fr",
    gridTemplateRows: "1fr 1fr 1fr",
    cells: [
      { gridColumn: "1", gridRow: "1" },
      { gridColumn: "2", gridRow: "1" },
      { gridColumn: "3", gridRow: "1" },
      { gridColumn: "1", gridRow: "2" },
      { gridColumn: "2", gridRow: "2" },
      { gridColumn: "3", gridRow: "2" },
      { gridColumn: "1", gridRow: "3" },
      { gridColumn: "2", gridRow: "3" },
      { gridColumn: "3", gridRow: "3" },
    ],
  },
];

// ── Zod schema ──────────────��───────────────────────────────────────

const cellSchema = z.object({
  imageIndex: z.number().int().min(0),
  panX: z.number().min(-100).max(100).default(0),
  panY: z.number().min(-100).max(100).default(0),
  zoom: z.number().min(1).max(10).default(1),
  objectFit: z.enum(["cover", "contain"]).default("cover"),
});

const settingsSchema = z.object({
  templateId: z.string(),
  cells: z.array(cellSchema).optional(),
  gap: z.number().min(0).max(500).default(8),
  cornerRadius: z.number().min(0).max(500).default(0),
  backgroundColor: z.string().default("#FFFFFF"),
  aspectRatio: z.string().default("free"),
  outputFormat: z.enum(["png", "jpeg", "webp", "avif"]).default("png"),
  quality: z.number().min(1).max(100).default(90),
});

// ── Grid math ─────────────���─────────────────────────────────────────

function parseFrValues(template: string): number[] {
  return template
    .trim()
    .split(/\s+/)
    .map((s) => {
      const m = s.match(/^(\d+(?:\.\d+)?)fr$/);
      return m ? Number(m[1]) : 1;
    });
}

function parseGridRange(value: string, trackCount: number): [number, number] {
  const parts = value.split("/").map((s) => s.trim());
  const start = Number(parts[0]) - 1;
  const end = parts.length > 1 ? Number(parts[1]) - 1 : start + 1;
  return [Math.max(0, start), Math.min(trackCount, end)];
}

interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function computeCellRects(
  tmpl: Template,
  canvasW: number,
  canvasH: number,
  gapPx: number,
): CellRect[] {
  const cols = parseFrValues(tmpl.gridTemplateColumns);
  const rows = parseFrValues(tmpl.gridTemplateRows);

  const totalColGaps = (cols.length + 1) * gapPx;
  const totalRowGaps = (rows.length + 1) * gapPx;
  const availW = canvasW - totalColGaps;
  const availH = canvasH - totalRowGaps;

  const colFrTotal = cols.reduce((s, v) => s + v, 0);
  const rowFrTotal = rows.reduce((s, v) => s + v, 0);

  const colWidths = cols.map((fr) => Math.round((fr / colFrTotal) * availW));
  const rowHeights = rows.map((fr) => Math.round((fr / rowFrTotal) * availH));

  const colStarts: number[] = [gapPx];
  for (let i = 1; i < cols.length; i++) {
    colStarts.push(colStarts[i - 1] + colWidths[i - 1] + gapPx);
  }
  const rowStarts: number[] = [gapPx];
  for (let i = 1; i < rows.length; i++) {
    rowStarts.push(rowStarts[i - 1] + rowHeights[i - 1] + gapPx);
  }

  return tmpl.cells.map((cell) => {
    const [cs, ce] = parseGridRange(cell.gridColumn, cols.length);
    const [rs, re] = parseGridRange(cell.gridRow, rows.length);

    const x = colStarts[cs];
    const y = rowStarts[rs];
    const w = colStarts[ce - 1] + colWidths[ce - 1] - colStarts[cs];
    const h = rowStarts[re - 1] + rowHeights[re - 1] - rowStarts[rs];

    return { x, y, w, h };
  });
}

function getAspectMultiplier(ar: string): number | null {
  const map: Record<string, number> = {
    "1:1": 1,
    "4:3": 3 / 4,
    "3:2": 2 / 3,
    "16:9": 9 / 16,
    "9:16": 16 / 9,
    "4:5": 5 / 4,
  };
  return map[ar] ?? null;
}

// ── Route registration ────────────���─────────────────────────────────

export function registerCollage(app: FastifyInstance) {
  app.post("/api/v1/tools/collage", async (request, reply) => {
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
      return reply.status(400).send({ error: "No images provided" });
    }

    // Validate all files and decode HEIC/HEIF
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
      // Find the template
      const template = TEMPLATES.find((t) => t.id === settings.templateId);
      if (!template) {
        return reply.status(400).send({ error: `Unknown template: ${settings.templateId}` });
      }

      if (files.length > template.imageCount) {
        files.length = template.imageCount;
      }

      // Determine output canvas size
      const BASE_SIZE = 2400;
      const arMultiplier = getAspectMultiplier(settings.aspectRatio);
      let canvasW: number;
      let canvasH: number;
      if (arMultiplier) {
        if (arMultiplier > 1) {
          canvasH = BASE_SIZE;
          canvasW = Math.round(BASE_SIZE / arMultiplier);
        } else {
          canvasW = BASE_SIZE;
          canvasH = Math.round(BASE_SIZE * arMultiplier);
        }
      } else {
        // "free" - use 4:3 default
        canvasW = BASE_SIZE;
        canvasH = Math.round(BASE_SIZE * 0.75);
      }

      const gapPx = settings.gap;
      const cellRects = computeCellRects(template, canvasW, canvasH, gapPx);

      // Parse background color
      const bgIsTransparent = settings.backgroundColor === "transparent";
      let bgColor: { r: number; g: number; b: number };
      if (bgIsTransparent) {
        bgColor = { r: 0, g: 0, b: 0 };
      } else {
        const hex = settings.backgroundColor.replace("#", "");
        bgColor = {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16),
        };
      }

      const channels = bgIsTransparent ? 4 : 3;
      const composites: sharp.OverlayOptions[] = [];
      const cellSettings = settings.cells ?? [];

      for (let i = 0; i < cellRects.length && i < files.length; i++) {
        const rect = cellRects[i];
        const cellW = Math.max(1, Math.round(rect.w));
        const cellH = Math.max(1, Math.round(rect.h));
        const cellSetting = cellSettings[i] ?? { panX: 0, panY: 0, zoom: 1, objectFit: "cover" };

        // Get image metadata for proper crop calculation
        const meta = await sharp(files[i].buffer).metadata();
        const imgW = meta.width ?? cellW;
        const imgH = meta.height ?? cellH;

        const zoom = Math.max(1, cellSetting.zoom);
        const fitMode = cellSetting.objectFit ?? "cover";

        let cellBuffer: Buffer;

        if (fitMode === "contain") {
          // Contain: fit entire image inside the cell, fill rest with background
          const bgColor =
            settings.backgroundColor === "transparent"
              ? { r: 0, g: 0, b: 0, alpha: 0 }
              : (() => {
                  const hex = settings.backgroundColor.replace("#", "");
                  return {
                    r: Number.parseInt(hex.substring(0, 2), 16),
                    g: Number.parseInt(hex.substring(2, 4), 16),
                    b: Number.parseInt(hex.substring(4, 6), 16),
                    alpha: 1,
                  };
                })();
          cellBuffer = await sharp(files[i].buffer)
            .resize(Math.round(cellW * zoom), Math.round(cellH * zoom), {
              fit: "inside",
              withoutEnlargement: false,
            })
            .resize(cellW, cellH, {
              fit: "contain",
              background: bgColor,
            })
            .toBuffer();
        } else {
          // Cover: resize to fully fill the cell, then crop with pan offset
          const scaleToFit = Math.max(cellW / imgW, cellH / imgH);
          const resizedW = Math.round(imgW * scaleToFit * zoom);
          const resizedH = Math.round(imgH * scaleToFit * zoom);

          const overflowX = Math.max(0, resizedW - cellW);
          const overflowY = Math.max(0, resizedH - cellH);
          const extractLeft = Math.round(
            overflowX / 2 - (cellSetting.panX / 100) * (overflowX / 2),
          );
          const extractTop = Math.round(overflowY / 2 - (cellSetting.panY / 100) * (overflowY / 2));

          cellBuffer = await sharp(files[i].buffer)
            .resize(resizedW, resizedH, { fit: "fill" })
            .extract({
              left: Math.max(0, Math.min(extractLeft, resizedW - cellW)),
              top: Math.max(0, Math.min(extractTop, resizedH - cellH)),
              width: cellW,
              height: cellH,
            })
            .toBuffer();
        }

        // Apply corner radius via SVG mask if needed
        if (settings.cornerRadius > 0) {
          const r = settings.cornerRadius;
          const mask = Buffer.from(
            `<svg width="${cellW}" height="${cellH}">
              <rect x="0" y="0" width="${cellW}" height="${cellH}" rx="${r}" ry="${r}" fill="white"/>
            </svg>`,
          );
          cellBuffer = await sharp(cellBuffer)
            .ensureAlpha()
            .composite([{ input: mask, blend: "dest-in" }])
            .toBuffer();
        }

        composites.push({
          input: cellBuffer,
          top: Math.round(rect.y),
          left: Math.round(rect.x),
        });
      }

      // Create canvas and composite
      let pipeline = sharp({
        create: {
          width: canvasW,
          height: canvasH,
          channels: channels as 3 | 4,
          background: bgIsTransparent
            ? { r: 0, g: 0, b: 0, alpha: 0 }
            : { r: bgColor.r, g: bgColor.g, b: bgColor.b },
        },
      }).composite(composites);

      // Output format
      let outputExt: string;
      switch (settings.outputFormat) {
        case "jpeg":
          pipeline = pipeline.jpeg({ quality: settings.quality });
          outputExt = "jpg";
          break;
        case "webp":
          pipeline = pipeline.webp({ quality: settings.quality });
          outputExt = "webp";
          break;
        case "avif":
          pipeline = pipeline.avif({ quality: settings.quality, effort: 4 });
          outputExt = "avif";
          break;
        default:
          pipeline = pipeline.png();
          outputExt = "png";
          break;
      }

      const result = await pipeline.toBuffer();

      const jobId = randomUUID();
      const workspacePath = await createWorkspace(jobId);
      const filename = `collage.${outputExt}`;
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
        error: "Collage creation failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });
}
