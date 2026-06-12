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
});

export function registerVignette(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "vignette",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const meta = await sharp(inputBuffer).metadata();
      const w = meta.width ?? 1;
      const h = meta.height ?? 1;

      // Build radial-gradient SVG overlay
      const svg = Buffer.from(
        `<svg width="${w}" height="${h}">` +
          `<defs><radialGradient id="v" cx="50%" cy="50%" r="70%">` +
          `<stop offset="50%" stop-color="${settings.color}" stop-opacity="0"/>` +
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
