import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { isAnimated, runPerFrame } from "../../lib/animated-image.js";
import { outputFormatFor, resolveOutputFormat } from "../../lib/output-format.js";
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
      const sourceColor = hexToRgb(settings.sourceColor);
      const target = hexToRgb(settings.targetColor);

      const outputFormat = await resolveOutputFormat(inputBuffer, filename);
      const ALPHA_FORMATS = new Set(["png", "webp", "avif"]);
      const needsAlpha = settings.makeTransparent;
      // GIF carries one bit of alpha, so knocking a colour out has to change
      // container. PNG is the right landing place for a still, but it cannot
      // hold frames, and falling back to it discards the animation (#1083).
      // WebP has both full alpha and frames.
      const useFormat =
        needsAlpha && !ALPHA_FORMATS.has(outputFormat.format)
          ? (await isAnimated(inputBuffer))
            ? outputFormatFor("webp", outputFormat.quality)
            : // No quality on the forced PNG: even 100 turns on Sharp's palette
              // quantisation, which is lossy past 256 distinct colours (#710).
              outputFormatFor("png")
          : outputFormat;

      // The result is rebuilt from a raw buffer, which Sharp always reads as a
      // single page, so animation is handled a frame at a time (#1083).
      const core = async (frame: Buffer): Promise<Buffer> => {
        // Get raw RGBA pixels
        const image = sharp(frame).ensureAlpha();
        const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

        const pixels = Buffer.from(data);
        const maxDist = settings.tolerance * 1.73; // sqrt(3) for RGB distance scaling

        for (let i = 0; i < pixels.length; i += 4) {
          const dist = colorDistance(
            pixels[i],
            pixels[i + 1],
            pixels[i + 2],
            sourceColor.r,
            sourceColor.g,
            sourceColor.b,
          );

          if (dist <= maxDist) {
            if (settings.makeTransparent) {
              pixels[i + 3] = 0; // Make transparent
            } else {
              // Blend: closer to source color = more of target color
              const blend = maxDist > 0 ? 1 - dist / maxDist : 1;
              pixels[i] = Math.round(pixels[i] * (1 - blend) + target.r * blend);
              pixels[i + 1] = Math.round(pixels[i + 1] * (1 - blend) + target.g * blend);
              pixels[i + 2] = Math.round(pixels[i + 2] * (1 - blend) + target.b * blend);
            }
          }
        }

        return await sharp(pixels, {
          raw: { width: info.width, height: info.height, channels: 4 },
        })
          .toFormat(useFormat.format, useFormat.encoderOptions)
          .toBuffer();
      };

      const buffer =
        (await runPerFrame(inputBuffer, useFormat.format, core)) ?? (await core(inputBuffer));

      return { buffer, filename, contentType: useFormat.contentType };
    },
  });
}
