import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createToolRoute } from "../tool-factory.js";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const settingsSchema = z.object({
  shadow: hexColor.default("#1e3a8a"),
  highlight: hexColor.default("#fbbf24"),
});

function parseHex(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

export function registerDuotone(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "duotone",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const a = parseHex(settings.shadow);
      const b = parseHex(settings.highlight);

      // Duotone math: output = shadow + (highlight - shadow) * luminance
      // .linear(multipliers, offsets) with per-channel arrays
      const multipliers = [(b.r - a.r) / 255, (b.g - a.g) / 255, (b.b - a.b) / 255];
      const offsets = [a.r, a.g, a.b];

      // Grayscale to single channel, then expand back to 3-channel sRGB
      // so that .linear() can apply per-channel multipliers/offsets
      const grayBuf = await sharp(inputBuffer)
        .removeAlpha()
        .grayscale()
        .toColourspace("srgb")
        .toBuffer();

      const buf = await sharp(grayBuf).linear(multipliers, offsets).toBuffer();

      const outputFormat = await resolveOutputFormat(inputBuffer, filename);
      const buffer = await sharp(buf)
        .toFormat(outputFormat.format, { quality: outputFormat.quality })
        .toBuffer();
      const base = filename.replace(/\.[^.]+$/, "");
      const ext = outputFormat.extension;
      return {
        buffer,
        filename: `${base}_duotone.${ext}`,
        contentType: outputFormat.contentType,
      };
    },
  });
}
