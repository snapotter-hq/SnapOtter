import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createToolRoute } from "../tool-factory.js";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const settingsSchema = z.object({
  shadow: hexColor.default("#1e3a8a"),
  highlight: hexColor.default("#fbbf24"),
  intensity: z.number().int().min(0).max(100).default(100),
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
      const k = settings.intensity / 100;

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

      let buf = await sharp(grayBuf).linear(multipliers, offsets).toBuffer();

      // Blend duotone with original when intensity < 100. Both buffers are read
      // through the same removeAlpha + sRGB pipeline so they share channel count
      // and length, and the blended raw buffer is re-encoded to PNG so the final
      // toFormat() step can decode it again.
      if (k < 1) {
        const origRaw = await sharp(inputBuffer)
          .removeAlpha()
          .toColourspace("srgb")
          .raw()
          .toBuffer({ resolveWithObject: true });
        const duo = await sharp(buf).removeAlpha().toColourspace("srgb").raw().toBuffer();
        const pixels = origRaw.data;
        const blended = Buffer.alloc(pixels.length);
        for (let i = 0; i < pixels.length; i++) {
          blended[i] = Math.round(pixels[i] * (1 - k) + duo[i] * k);
        }
        buf = await sharp(blended, {
          raw: {
            width: origRaw.info.width,
            height: origRaw.info.height,
            channels: origRaw.info.channels as 1 | 2 | 3 | 4,
          },
        })
          .png()
          .toBuffer();
      }

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
