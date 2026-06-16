import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  // Framing: zoom (>=1 crops tighter) + where the circle sits in the image (0..1).
  zoom: z.number().min(1).max(5).default(1),
  offsetX: z.number().min(0).max(1).default(0.5),
  offsetY: z.number().min(0).max(1).default(0.5),
  // Styling.
  borderWidth: z.number().int().min(0).max(200).default(0),
  borderColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#ffffff"),
  // "transparent" leaves the corners clear; a hex fills them.
  background: z
    .string()
    .regex(/^(transparent|#[0-9a-fA-F]{6})$/)
    .default("transparent"),
  // Final output dimension in px (square). Omitted = native size.
  outputSize: z.number().int().min(16).max(4096).optional(),
});

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

export function registerCircleCrop(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "circle-crop",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const meta = await sharp(inputBuffer).metadata();
      const W = meta.width ?? 1;
      const H = meta.height ?? 1;

      // The circle's bounding square, derived from zoom + offsets.
      let d = Math.round(Math.min(W, H) / settings.zoom);
      d = Math.max(8, Math.min(d, W, H));
      let left = Math.round((W - d) * settings.offsetX);
      let top = Math.round((H - d) * settings.offsetY);
      left = Math.max(0, Math.min(left, W - d));
      top = Math.max(0, Math.min(top, H - d));

      const bw = Math.min(settings.borderWidth, Math.floor(d / 2));
      const canvas = d + 2 * bw;

      // Extract the square, mask it to a circle.
      const squareBuf = await sharp(inputBuffer)
        .extract({ left, top, width: d, height: d })
        .toBuffer();
      const circleMask = Buffer.from(
        `<svg width="${d}" height="${d}"><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2}" fill="#fff"/></svg>`,
      );
      const imgCircle = await sharp(squareBuf)
        .ensureAlpha()
        .composite([{ input: circleMask, blend: "dest-in" }])
        .png()
        .toBuffer();

      // Compose: background, optional border ring, then the circular image.
      const bg =
        settings.background === "transparent"
          ? { r: 0, g: 0, b: 0, alpha: 0 }
          : { ...hexToRgb(settings.background), alpha: 1 };
      const layers: sharp.OverlayOptions[] = [];
      if (bw > 0) {
        const ring = Buffer.from(
          `<svg width="${canvas}" height="${canvas}"><circle cx="${canvas / 2}" cy="${canvas / 2}" r="${d / 2 + bw}" fill="${settings.borderColor}"/></svg>`,
        );
        layers.push({ input: ring, left: 0, top: 0 });
      }
      layers.push({ input: imgCircle, left: bw, top: bw });

      let out = await sharp({
        create: { width: canvas, height: canvas, channels: 4, background: bg },
      })
        .composite(layers)
        .png()
        .toBuffer();

      if (settings.outputSize) {
        out = await sharp(out)
          .resize(settings.outputSize, settings.outputSize, { fit: "fill" })
          .png()
          .toBuffer();
      }

      const base = filename.replace(/\.[^.]+$/, "");
      return { buffer: out, filename: `${base}_circle.png`, contentType: "image/png" };
    },
  });
}
