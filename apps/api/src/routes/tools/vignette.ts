import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  strength: z.number().min(0.1).max(1).default(0.5),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#000000"),
  radius: z.number().int().min(0).max(100).default(70),
  softness: z.number().int().min(0).max(100).default(50),
  roundness: z.number().int().min(0).max(100).default(100),
  centerX: z.number().int().min(0).max(100).default(50),
  centerY: z.number().int().min(0).max(100).default(50),
});

export function registerVignette(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "vignette",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const meta = await sharp(inputBuffer).metadata();
      const w = meta.width ?? 1;
      const h = meta.height ?? 1;

      const { radius, softness, roundness, centerX, centerY } = settings;

      // Outer radius of the gradient (percentage of the half-diagonal)
      const outerR = radius / 100;
      // Inner transparent stop: higher softness pushes it inward (more feather)
      const innerStop = Math.max(0, Math.min(1, outerR * (1 - softness / 100)));

      // For roundness < 100, stretch the gradient to match image aspect ratio.
      // At roundness 0 the gradient is fully elliptical (matching the image AR);
      // at roundness 100 it is a perfect circle.
      const ar = w / h;
      const roundFactor = roundness / 100;
      // scaleX: interpolate from aspect ratio to 1 as roundness goes 0..100
      const scaleX = ar >= 1 ? 1 : 1 / (roundFactor + (1 - roundFactor) * ar);
      const scaleY = ar >= 1 ? roundFactor + (1 - roundFactor) / ar : 1;

      const gradientTransform =
        roundness < 100
          ? ` gradientTransform="translate(${centerX / 100} ${centerY / 100}) scale(${scaleX.toFixed(6)} ${scaleY.toFixed(6)}) translate(-${centerX / 100} -${centerY / 100})"`
          : "";

      // Build radial-gradient SVG overlay
      const svg = Buffer.from(
        `<svg width="${w}" height="${h}">` +
          `<defs><radialGradient id="v" cx="${centerX}%" cy="${centerY}%" r="${outerR * 100}%"${gradientTransform}>` +
          `<stop offset="${(innerStop * 100).toFixed(1)}%" stop-color="${settings.color}" stop-opacity="0"/>` +
          `<stop offset="100%" stop-color="${settings.color}" stop-opacity="${settings.strength}"/>` +
          `</radialGradient></defs>` +
          `<rect width="100%" height="100%" fill="url(#v)"/>` +
          `</svg>`,
      );

      const overlay = await sharp(svg).resize(w, h).toBuffer();

      const buf = await sharp(inputBuffer)
        .composite([{ input: overlay, blend: "over" }])
        .toBuffer();

      const outputFormat = await resolveOutputFormat(inputBuffer, filename);
      const buffer = await sharp(buf)
        .toFormat(outputFormat.format, { quality: outputFormat.quality })
        .toBuffer();
      const base = filename.replace(/\.[^.]+$/, "");
      const ext = outputFormat.extension;
      return {
        buffer,
        filename: `${base}_vignette.${ext}`,
        contentType: outputFormat.contentType,
      };
    },
  });
}
