import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  columns: z.number().int().min(1).max(16).default(4),
  padding: z.number().int().min(0).max(64).default(0),
  background: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#ffffff"),
});

function parseHex(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

export function registerSpriteSheet(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "sprite-sheet",
    maxInputs: 64,
    settingsSchema,
    process: async () => {
      throw new Error("sprite-sheet is v2-only");
    },
    processV2: async (ctx) => {
      if (ctx.inputs.length < 2) {
        throw new InputValidationError("Provide at least two images");
      }

      const settings = settingsSchema.parse(ctx.settings);
      const n = ctx.inputs.length;
      const cols = Math.min(settings.columns, n);
      const rows = Math.ceil(n / cols);

      // Use the FIRST image's dimensions as the cell size
      const firstMeta = await sharp(ctx.inputs[0].buffer).metadata();
      const cellW = firstMeta.width ?? 1;
      const cellH = firstMeta.height ?? 1;

      const pad = settings.padding;
      const canvasW = cols * cellW + (cols - 1) * pad;
      const canvasH = rows * cellH + (rows - 1) * pad;

      const bg = parseHex(settings.background);
      const composites: sharp.OverlayOptions[] = [];
      const frames: Array<{
        index: number;
        left: number;
        top: number;
        width: number;
        height: number;
      }> = [];

      for (let i = 0; i < n; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const left = col * (cellW + pad);
        const top = row * (cellH + pad);

        // Resize each image to cover the cell size (first image keeps its size)
        let cellBuf: Buffer;
        if (i === 0) {
          cellBuf = ctx.inputs[i].buffer;
        } else {
          cellBuf = await sharp(ctx.inputs[i].buffer)
            .resize(cellW, cellH, { fit: "cover" })
            .toBuffer();
        }

        composites.push({ input: cellBuf, left, top });
        frames.push({ index: i, left, top, width: cellW, height: cellH });
      }

      const buffer = await sharp({
        create: {
          width: canvasW,
          height: canvasH,
          channels: 4,
          background: { r: bg.r, g: bg.g, b: bg.b, alpha: 1 },
        },
      })
        .composite(composites)
        .png()
        .toBuffer();

      return {
        buffer,
        filename: "sprite.png",
        contentType: "image/png",
        resultPayload: { frames },
      };
    },
  });
}
