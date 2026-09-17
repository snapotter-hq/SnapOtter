import { flip, rotate } from "@snapotter/image-engine";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { openAnimated, readAnimationFor, runPerFrame } from "../../lib/animated-image.js";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  angle: z.number().finite().default(0),
  horizontal: z.boolean().default(false),
  vertical: z.boolean().default(false),
});

export function registerRotate(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "rotate",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const outputFormat = await resolveOutputFormat(inputBuffer, filename);

      /**
       * Sharp refuses to rotate multi-page input ("Rotate is not supported for
       * multi-page images"), and a vertical flip mirrors the whole strip, which
       * reverses the frame order on top of flipping each frame. Both are avoided
       * by running one frame at a time (#1083).
       */
      const core = async (buffer: Buffer): Promise<Buffer> => {
        let image = sharp(buffer);

        // Apply rotation first
        if (settings.angle !== 0) {
          const angle = ((settings.angle % 360) + 360) % 360;
          image = await rotate(image, { angle });
        }

        // Then apply flip/flop
        if (settings.horizontal || settings.vertical) {
          image = await flip(image, {
            horizontal: settings.horizontal,
            vertical: settings.vertical,
          });
        }

        return await image
          .toFormat(outputFormat.format, { quality: outputFormat.quality })
          .toBuffer();
      };

      // Nothing to turn means nothing to decompose. Re-encoding the animation
      // in one pass keeps every frame without paying a requantisation for a
      // transform that was never asked for.
      if (settings.angle === 0 && !settings.horizontal && !settings.vertical) {
        const animation = await readAnimationFor(inputBuffer, outputFormat.format);
        const buffer = await openAnimated(inputBuffer, animation)
          .toFormat(outputFormat.format, { quality: outputFormat.quality })
          .toBuffer();
        return { buffer, filename, contentType: outputFormat.contentType };
      }

      const buffer =
        (await runPerFrame(inputBuffer, outputFormat.format, core)) ?? (await core(inputBuffer));
      return { buffer, filename, contentType: outputFormat.contentType };
    },
  });
}
