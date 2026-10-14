import { colorBlindness } from "@snapotter/image-engine";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { openAnimated, readAnimationFor } from "../../lib/animated-image.js";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  simulationType: z
    .enum([
      "protanopia",
      "deuteranopia",
      "tritanopia",
      "protanomaly",
      "deuteranomaly",
      "tritanomaly",
      "achromatopsia",
      "blueConeMonochromacy",
    ])
    .default("deuteranomaly"),
});

export function registerColorBlindness(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "color-blindness",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const outputFormat = await resolveOutputFormat(inputBuffer, filename);
      const animation = await readAnimationFor(inputBuffer, outputFormat.format);
      const image = openAnimated(inputBuffer, animation);
      const result = await colorBlindness(image, { type: settings.simulationType });
      // vips_recomb outputs 32-bit float bands (0..255), which LZW tiffsave
      // writes as a float scRGB TIFF where values >= 1.0 clamp to white.
      // Materialising through PNG casts back to 8-bit uchar first (#2586).
      const finalImage =
        outputFormat.format === "tiff" ? sharp(await result.png().toBuffer()) : result;
      const buffer = await finalImage
        .toFormat(outputFormat.format, outputFormat.encoderOptions)
        .toBuffer();

      return { buffer, filename, contentType: outputFormat.contentType };
    },
  });
}
