import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  sourceColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#FF0000"),
  targetColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#00FF00"),
  makeTransparent: z.boolean().default(false),
  tolerance: z.number().min(0).max(255).default(30),
});

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function colorDistance(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
): number {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

export function registerReplaceColor(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "replace-color",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const source = hexToRgb(settings.sourceColor);
      const target = hexToRgb(settings.targetColor);

      // Get raw RGBA pixels
      const image = sharp(inputBuffer).ensureAlpha();
      const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

      const pixels = Buffer.from(data);
      const maxDist = settings.tolerance * 1.73; // sqrt(3) for RGB distance scaling

      for (let i = 0; i < pixels.length; i += 4) {
        const dist = colorDistance(
          pixels[i],
          pixels[i + 1],
          pixels[i + 2],
          source.r,
          source.g,
          source.b,
        );

        if (dist <= maxDist) {
          if (settings.makeTransparent) {
            pixels[i + 3] = 0; // Make transparent
          } else {
            // Blend: closer to source color = more of target color
            const blend = 1 - dist / maxDist;
            pixels[i] = Math.round(pixels[i] * (1 - blend) + target.r * blend);
            pixels[i + 1] = Math.round(pixels[i + 1] * (1 - blend) + target.g * blend);
            pixels[i + 2] = Math.round(pixels[i + 2] * (1 - blend) + target.b * blend);
          }
        }
      }

      const outputFormat = await resolveOutputFormat(inputBuffer, filename);
      const ALPHA_FORMATS = new Set(["png", "webp", "avif", "tiff"]);
      const needsAlpha = settings.makeTransparent;
      const useFormat =
        needsAlpha && !ALPHA_FORMATS.has(outputFormat.format)
          ? { format: "png" as const, quality: 100, contentType: "image/png" }
          : outputFormat;

      const buffer = await sharp(pixels, {
        raw: { width: info.width, height: info.height, channels: 4 },
      })
        .toFormat(useFormat.format, { quality: useFormat.quality })
        .toBuffer();

      return { buffer, filename, contentType: useFormat.contentType };
    },
  });
}
