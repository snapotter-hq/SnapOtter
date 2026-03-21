import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";
import { crop } from "@stirling-image/image-engine";
import sharp from "sharp";
import type { FastifyInstance } from "fastify";

const settingsSchema = z.object({
  left: z.number().int().min(0),
  top: z.number().int().min(0),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export function registerCrop(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "crop",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const image = sharp(inputBuffer);
      const result = await crop(image, settings);
      const buffer = await result.toBuffer();
      return { buffer, filename, contentType: "image/png" };
    },
  });
}
