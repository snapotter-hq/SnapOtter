import {
  MAX_RESIZE_OUTPUT_DIMENSION,
  MAX_RESIZE_PERCENTAGE,
  resize,
  type SharpFormat,
} from "@snapotter/image-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { openAnimated, readAnimationFor, readTiffPagesFor } from "../../lib/animated-image.js";
import { asInputErrorIfUndecodable, withImageEncodeContext } from "../../lib/image-error.js";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createToolRoute } from "../tool-factory.js";

/** Output formats whose encoders keep an alpha channel. */
const ALPHA_OUTPUT_FORMATS: ReadonlySet<SharpFormat> = new Set<SharpFormat>([
  "png",
  "webp",
  "avif",
  "gif",
  "tiff",
  "jxl",
]);

const TRANSPARENT_BACKGROUND = { r: 0, g: 0, b: 0, alpha: 0 } as const;

const settingsSchema = z
  .object({
    width: z.number().int().positive().max(MAX_RESIZE_OUTPUT_DIMENSION).optional(),
    height: z.number().int().positive().max(MAX_RESIZE_OUTPUT_DIMENSION).optional(),
    fit: z.enum(["contain", "cover", "fill", "inside", "outside"]).default("contain"),
    withoutEnlargement: z.boolean().default(false),
    percentage: z.number().finite().positive().max(MAX_RESIZE_PERCENTAGE).optional(),
  })
  .refine((s) => s.width !== undefined || s.height !== undefined || s.percentage !== undefined, {
    message: "At least one of width, height, or percentage is required",
  });

export function registerResize(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "resize",
    settingsSchema,
    process: withImageEncodeContext<z.infer<typeof settingsSchema>>(
      "Image resize failed",
      (s) => s?.fit ?? "contain",
      async (inputBuffer, settings, filename) => {
        const outputFormat = await resolveOutputFormat(inputBuffer, filename);
        // resize is page-aware, so a GIF/WebP animation and a TIFF page stack
        // both keep every frame through it.
        const frames =
          outputFormat.format === "tiff"
            ? await readTiffPagesFor(inputBuffer, outputFormat.format)
            : await readAnimationFor(inputBuffer, outputFormat.format);
        const image = openAnimated(inputBuffer, frames);
        // Sharp pads contain with opaque black. Use transparent padding when
        // the output format can carry alpha; JPEG keeps the opaque default.
        const result = await resize(image, {
          ...settings,
          ...(settings.fit === "contain" && ALPHA_OUTPUT_FORMATS.has(outputFormat.format)
            ? { background: TRANSPARENT_BACKGROUND }
            : {}),
        });
        let buffer: Buffer;
        try {
          buffer = await result
            .toFormat(outputFormat.format, outputFormat.encoderOptions)
            .toBuffer();
        } catch (err) {
          throw await asInputErrorIfUndecodable(inputBuffer, err);
        }
        return { buffer, filename, contentType: outputFormat.contentType };
      },
    ),
  });
}
