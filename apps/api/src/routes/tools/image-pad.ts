import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  target: z.enum(["16:9", "9:16", "1:1", "4:3", "3:4"]).default("1:1"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#ffffff"),
});

/** Compute canvas dimensions for the given target aspect ratio. */
export function canvasFor(w: number, h: number, target: string): { cw: number; ch: number } {
  const [tw, th] = target.split(":").map(Number);
  const targetRatio = tw / th;
  const srcRatio = w / h;

  let cw: number;
  let ch: number;

  if (srcRatio > targetRatio) {
    // Image is wider than target: expand height
    cw = w;
    ch = Math.round(w / targetRatio);
  } else {
    // Image is taller than target: expand width
    ch = h;
    cw = Math.round(h * targetRatio);
  }

  return { cw, ch };
}

function parseHex(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

export function registerImagePad(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "image-pad",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const meta = await sharp(inputBuffer).metadata();
      const w = meta.width ?? 1;
      const h = meta.height ?? 1;

      const { cw, ch } = canvasFor(w, h, settings.target);
      const c = parseHex(settings.color);

      const padTop = Math.floor((ch - h) / 2);
      const padBottom = ch - h - padTop;
      const padLeft = Math.floor((cw - w) / 2);
      const padRight = cw - w - padLeft;

      const buf = await sharp(inputBuffer)
        .extend({
          top: padTop,
          bottom: padBottom,
          left: padLeft,
          right: padRight,
          background: { r: c.r, g: c.g, b: c.b, alpha: 1 },
        })
        .toBuffer();

      const outputFormat = await resolveOutputFormat(inputBuffer, filename);
      const buffer = await sharp(buf)
        .toFormat(outputFormat.format, { quality: outputFormat.quality })
        .toBuffer();
      const base = filename.replace(/\.[^.]+$/, "");
      const ext = outputFormat.extension;
      return {
        buffer,
        filename: `${base}_padded.${ext}`,
        contentType: outputFormat.contentType,
      };
    },
  });
}
