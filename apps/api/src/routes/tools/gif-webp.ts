import { extname } from "node:path";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  quality: z.number().int().min(1).max(100).default(80),
  lossless: z.boolean().default(false),
  resizePercent: z.number().int().min(10).max(100).default(100),
});

export function registerGifWebp(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "gif-webp",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const ext = extname(filename).toLowerCase();

      // Route-level extension guard: image modality has no 415 gate
      if (ext !== ".gif" && ext !== ".webp") {
        throw new InputValidationError("Only GIF and WebP inputs are supported");
      }

      let pipeline = sharp(inputBuffer, { animated: true });

      // Apply resize when below 100%
      if (settings.resizePercent < 100) {
        const meta = await sharp(inputBuffer, { animated: true }).metadata();
        const origW = meta.width ?? 1;
        const target = Math.round(origW * (settings.resizePercent / 100));
        pipeline = pipeline.resize(target);
      }

      const base = filename.replace(/\.[^.]+$/, "");

      if (ext === ".gif") {
        // GIF -> WebP (preserving animation)
        const buffer = await pipeline
          .webp({ quality: settings.quality, lossless: settings.lossless })
          .toBuffer();
        return {
          buffer,
          filename: `${base}.webp`,
          contentType: "image/webp",
        };
      }

      // WebP -> GIF (preserving animation)
      // Note: quality and lossless are WebP-only; GIF uses a fixed palette.
      const buffer = await pipeline.gif().toBuffer();
      return {
        buffer,
        filename: `${base}.gif`,
        contentType: "image/gif",
      };
    },
  });
}
