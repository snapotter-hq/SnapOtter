import { colorBlindness } from "@snapotter/image-engine";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { openAnimated, readAnimationFor, runPerFrame } from "../../lib/animated-image.js";
import { asInputErrorIfUndecodable, withImageEncodeContext } from "../../lib/image-error.js";
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
    process: withImageEncodeContext<z.infer<typeof settingsSchema>>(
      "Color blindness simulation failed",
      (s) => s?.simulationType ?? "deuteranomaly",
      async (inputBuffer, settings, filename) => {
        const outputFormat = await resolveOutputFormat(inputBuffer, filename);
        const simulate = async (source: Buffer): Promise<Buffer> => {
          const animation = await readAnimationFor(source, outputFormat.format);
          const result = await colorBlindness(openAnimated(source, animation), {
            type: settings.simulationType,
          });
          // vips_recomb outputs 32-bit float bands (0..255), which LZW tiffsave
          // writes as a float scRGB TIFF where values >= 1.0 clamp to white.
          // Materialising through PNG casts back to 8-bit uchar first (#2586).
          const finalImage =
            outputFormat.format === "tiff" ? sharp(await result.png().toBuffer()) : result;
          return await finalImage
            .toFormat(outputFormat.format, outputFormat.encoderOptions)
            .toBuffer();
        };

        let buffer: Buffer;
        try {
          // That PNG step would also flatten a multi-page TIFF's page stack into
          // one tall page, so TIFF goes a page at a time (#4850).
          const perPage =
            outputFormat.format === "tiff"
              ? await runPerFrame(inputBuffer, outputFormat.format, simulate)
              : undefined;
          buffer = perPage ?? (await simulate(inputBuffer));
        } catch (err) {
          throw await asInputErrorIfUndecodable(inputBuffer, err);
        }

        return { buffer, filename, contentType: outputFormat.contentType };
      },
    ),
  });
}
