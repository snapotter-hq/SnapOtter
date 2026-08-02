import type { FastifyInstance } from "fastify";
import sharp, { type Sharp } from "sharp";
import { z } from "zod";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  blockSize: z.number().int().min(2).max(128).default(12),
  region: z
    .object({
      left: z.number().int().min(0),
      top: z.number().int().min(0),
      width: z.number().int().min(1),
      height: z.number().int().min(1),
    })
    .optional(),
});

/**
 * Shrink to one pixel per block, then blow it back up with nearest-neighbour.
 *
 * The two resizes have to run as separate pipelines. Sharp holds a single set
 * of resize options per pipeline, so chaining them lets the second call
 * replace the first and the image comes back untouched (issue #678).
 *
 * `fit: "fill"` pins both steps to exact dimensions; the default `cover` would
 * crop whenever the block grid does not divide the image evenly.
 */
async function mosaic(
  source: Sharp,
  width: number,
  height: number,
  blockSize: number,
): Promise<Buffer> {
  const cols = Math.max(1, Math.round(width / blockSize));
  const rows = Math.max(1, Math.round(height / blockSize));

  // The shrink resamples with the default kernel, so a block's colour is drawn
  // from the region it covers rather than one sampled pixel. Nearest-neighbour
  // on the way back up is what keeps the block edges hard.
  const shrunk = await source.resize(cols, rows, { fit: "fill" }).png().toBuffer();

  return sharp(shrunk)
    .resize(width, height, { fit: "fill", kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();
}

/** A fully opaque rectangle, used as a stencil to clear the region being replaced. */
function opaqueRect(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

export function registerPixelate(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "pixelate",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const meta = await sharp(inputBuffer).metadata();
      if (!meta.width || !meta.height) {
        // Defaulting to 1x1 here would hand back a one-pixel image with a 200.
        throw new InputValidationError("Could not read image dimensions");
      }
      const w = meta.width;
      const h = meta.height;
      const bs = settings.blockSize;

      let pixelated: Sharp;

      if (settings.region) {
        // Reject if origin is completely outside image bounds
        if (settings.region.left >= w || settings.region.top >= h) {
          throw new InputValidationError("Region exceeds image bounds");
        }

        // Clamp region dimensions to image edges (handles rounding from normalized coords)
        const r = {
          left: settings.region.left,
          top: settings.region.top,
          width: Math.min(settings.region.width, w - settings.region.left),
          height: Math.min(settings.region.height, h - settings.region.top),
        };

        const region = await mosaic(sharp(inputBuffer).extract(r), r.width, r.height, bs);

        // The mosaic has to REPLACE the region, not blend into it. Compositing
        // straight over means any block whose averaged alpha is below 255 lets
        // the original show through, so a partly transparent image keeps the
        // detail the user asked to hide. Punching the region out with an opaque
        // rectangle first leaves nothing underneath to bleed back in.
        pixelated = sharp(inputBuffer)
          .ensureAlpha()
          .composite([
            {
              input: await opaqueRect(r.width, r.height),
              left: r.left,
              top: r.top,
              blend: "dest-out",
            },
            { input: region, left: r.left, top: r.top },
          ]);
      } else {
        pixelated = sharp(await mosaic(sharp(inputBuffer), w, h, bs));
      }

      const outputFormat = await resolveOutputFormat(inputBuffer, filename);
      // Sharp reads `quality` on PNG as "quantise down to a palette", which
      // dithers the flat blocks this tool exists to produce and inflates the
      // file. Every other encoder wants the hint.
      const encodeOptions = outputFormat.format === "png" ? {} : { quality: outputFormat.quality };
      const buffer = await pixelated.toFormat(outputFormat.format, encodeOptions).toBuffer();
      const base = filename.replace(/\.[^.]+$/, "");
      const ext = outputFormat.extension;
      return {
        buffer,
        filename: `${base}_pixelated.${ext}`,
        contentType: outputFormat.contentType,
      };
    },
  });
}
