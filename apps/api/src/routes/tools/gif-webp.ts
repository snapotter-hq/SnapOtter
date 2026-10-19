import { extname } from "node:path";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { openAnimated, readAnimationFor } from "../../lib/animated-image.js";
import { asInputErrorIfUndecodable, withImageEncodeContext } from "../../lib/image-error.js";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  quality: z.number().int().min(1).max(100).default(80),
  lossless: z.boolean().default(false),
  resizePercent: z.number().int().min(10).max(100).default(100),
});

export function registerGifWebp(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "gif-webp",
    settingsSchema,
    process: withImageEncodeContext<z.infer<typeof settingsSchema>>(
      "GIF/WebP conversion failed",
      (s) => (s?.lossless ? "lossless" : "lossy"),
      async (inputBuffer, settings, filename) => {
        const ext = extname(filename).toLowerCase();

        // Route-level extension guard: image modality has no 415 gate
        if (ext !== ".gif" && ext !== ".webp") {
          throw new InputValidationError("Only GIF and WebP inputs are supported");
        }

        const anim = await readAnimationFor(inputBuffer, ext === ".gif" ? "webp" : "gif");
        let pipeline = openAnimated(inputBuffer, anim);

        const base = filename.replace(/\.[^.]+$/, "");

        try {
          // Apply resize when below 100%
          if (settings.resizePercent < 100) {
            const origW = anim.width || ((await sharp(inputBuffer).metadata()).width ?? 1);
            const target = Math.max(1, Math.round(origW * (settings.resizePercent / 100)));
            pipeline = pipeline.resize(target);
          }

          if (ext === ".gif") {
            // GIF -> WebP (preserving animation)
            const buffer = await pipeline
              .webp({ quality: settings.quality, lossless: settings.lossless })
              .toBuffer();
            return {
              buffer,
              filename: `${base}.webp`,
              contentType: "image/webp",
            };
          }

          // WebP -> GIF (preserving animation)
          // Note: quality and lossless are WebP-only; GIF uses a fixed palette.
          const buffer = await pipeline.gif().toBuffer();
          return {
            buffer,
            filename: `${base}.gif`,
            contentType: "image/gif",
          };
        } catch (err) {
          throw await asInputErrorIfUndecodable(inputBuffer, err);
        }
      },
    ),
  });
}
