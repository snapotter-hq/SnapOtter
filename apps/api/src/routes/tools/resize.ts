import {
  MAX_RESIZE_OUTPUT_DIMENSION,
  MAX_RESIZE_PERCENTAGE,
  resize,
} from "@snapotter/image-engine";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createToolRoute } from "../tool-factory.js";

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
    process: async (inputBuffer, settings, filename) => {
      const outputFormat = await resolveOutputFormat(inputBuffer, filename);
      const image = sharp(inputBuffer);
      const result = await resize(image, settings);
      const buffer = await result
        .toFormat(outputFormat.format, { quality: outputFormat.quality })
        .toBuffer();
      return { buffer, filename, contentType: outputFormat.contentType };
    },
  });
}
