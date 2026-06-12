import type { FastifyInstance } from "fastify";
import sharp from "sharp";
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

export function registerPixelate(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "pixelate",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const meta = await sharp(inputBuffer).metadata();
      const w = meta.width ?? 1;
      const h = meta.height ?? 1;
      const bs = settings.blockSize;

      let buf: Buffer;

      if (settings.region) {
        const r = settings.region;
        // Validate region bounds
        if (r.left + r.width > w || r.top + r.height > h) {
          throw new InputValidationError("Region exceeds image bounds");
        }

        // Extract region, pixelate it, composite back
        const rw = Math.max(1, Math.round(r.width / bs));
        const rh = Math.max(1, Math.round(r.height / bs));

        const pixelatedRegion = await sharp(inputBuffer)
          .extract({ left: r.left, top: r.top, width: r.width, height: r.height })
          .resize(rw, rh, { kernel: sharp.kernel.nearest })
          .resize(r.width, r.height, { kernel: sharp.kernel.nearest })
          .toBuffer();

        buf = await sharp(inputBuffer)
          .composite([{ input: pixelatedRegion, left: r.left, top: r.top }])
          .toBuffer();
      } else {
        // Full image pixelation
        const smallW = Math.max(1, Math.round(w / bs));
        const smallH = Math.max(1, Math.round(h / bs));

        buf = await sharp(inputBuffer)
          .resize(smallW, smallH, { kernel: sharp.kernel.nearest })
          .resize(w, h, { kernel: sharp.kernel.nearest })
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
        filename: `${base}_pixelated.${ext}`,
        contentType: outputFormat.contentType,
      };
    },
  });
}
