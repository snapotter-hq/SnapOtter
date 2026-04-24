import { crop } from "@snapotter/image-engine";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  left: z.number().min(0),
  top: z.number().min(0),
  width: z.number().positive(),
  height: z.number().positive(),
  unit: z.enum(["px", "percent"]).optional(),
});

export function registerCrop(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "crop",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const outputFormat = await resolveOutputFormat(inputBuffer, filename);
      const image = sharp(inputBuffer);
      const result = await crop(image, settings);
      const buffer = await result
        .toFormat(outputFormat.format, { quality: outputFormat.quality })
        .toBuffer();
      return { buffer, filename, contentType: outputFormat.contentType };
    },
  });
}
