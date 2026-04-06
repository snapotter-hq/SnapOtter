import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  mode: z.enum(["attention", "content"]).default("attention"),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  threshold: z.number().int().min(0).max(255).default(30),
  padToSquare: z.boolean().default(false),
  padColor: z.string().default("#ffffff"),
  targetSize: z.number().int().positive().optional(),
  quality: z.number().int().min(1).max(100).optional(),
});

/**
 * Smart crop with two modes:
 * - "attention": Sharp's entropy/saliency detection to crop to the most interesting region
 * - "content": Trims uniform-color borders (like GIMP's "Crop to Content"),
 *    optionally pads to a square at a target size
 */
export function registerSmartCrop(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "smart-crop",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const outputFormat = await resolveOutputFormat(inputBuffer, filename, settings.quality);
      let result: Buffer;

      if (settings.mode === "content") {
        if (settings.padToSquare || settings.targetSize) {
          // Trim first to get dimensions, then pad to square
          const trimmed = await sharp(inputBuffer)
            .trim({ threshold: settings.threshold })
            .toBuffer({ resolveWithObject: true });

          const w = trimmed.info.width;
          const h = trimmed.info.height;
          const target = settings.targetSize || Math.max(w, h);
          const padR = Math.round(parseInt(settings.padColor.slice(1, 3), 16));
          const padG = Math.round(parseInt(settings.padColor.slice(3, 5), 16));
          const padB = Math.round(parseInt(settings.padColor.slice(5, 7), 16));

          const padded = await sharp(trimmed.data)
            .resize({
              width: target,
              height: target,
              fit: "contain",
              background: { r: padR, g: padG, b: padB, alpha: 1 },
            })
            .toFormat(outputFormat.format, { quality: outputFormat.quality })
            .toBuffer();
          result = padded;
        } else {
          // Simple trim + format in one pass (no intermediate encode)
          result = await sharp(inputBuffer)
            .trim({ threshold: settings.threshold })
            .toFormat(outputFormat.format, { quality: outputFormat.quality })
            .toBuffer();
        }
      } else {
        const w = settings.width ?? 1080;
        const h = settings.height ?? 1080;
        result = await sharp(inputBuffer)
          .resize(w, h, {
            fit: "cover",
            position: sharp.strategy.attention,
          })
          .toFormat(outputFormat.format, { quality: outputFormat.quality })
          .toBuffer();
      }

      const stem = filename.replace(/\.[^.]+$/, "");
      const outputFilename = `${stem}_smartcrop.${outputFormat.extension}`;
      return { buffer: result, filename: outputFilename, contentType: outputFormat.contentType };
    },
  });
}
