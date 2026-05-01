import { resize } from "@snapotter/image-engine";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  fit: z.enum(["contain", "cover", "fill", "inside", "outside"]).default("contain"),
  withoutEnlargement: z.boolean().default(false),
  percentage: z.number().positive().optional(),
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
