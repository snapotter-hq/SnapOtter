import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({});

export function registerCircleCrop(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "circle-crop",
    settingsSchema,
    process: async (inputBuffer, _settings, filename) => {
      const meta = await sharp(inputBuffer).metadata();
      const w = meta.width ?? 1;
      const h = meta.height ?? 1;
      const d = Math.min(w, h);

      // Extract centered square
      const left = Math.floor((w - d) / 2);
      const top = Math.floor((h - d) / 2);
      const squareBuf = await sharp(inputBuffer)
        .extract({ left, top, width: d, height: d })
        .toBuffer();

      // Create SVG circle mask
      const r = d / 2;
      const mask = Buffer.from(
        `<svg width="${d}" height="${d}"><circle cx="${r}" cy="${r}" r="${r}" fill="white"/></svg>`,
      );

      // Composite with dest-in blend to mask
      const buffer = await sharp(squareBuf)
        .ensureAlpha()
        .composite([{ input: await sharp(mask).resize(d, d).toBuffer(), blend: "dest-in" }])
        .png()
        .toBuffer();

      const base = filename.replace(/\.[^.]+$/, "");
      return {
        buffer,
        filename: `${base}_circle.png`,
        contentType: "image/png",
      };
    },
  });
}
