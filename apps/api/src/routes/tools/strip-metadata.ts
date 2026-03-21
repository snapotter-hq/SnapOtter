import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";
import { stripMetadata } from "@stirling-image/image-engine";
import sharp from "sharp";
import type { FastifyInstance } from "fastify";

const settingsSchema = z.object({
  stripExif: z.boolean().default(false),
  stripGps: z.boolean().default(false),
  stripIcc: z.boolean().default(false),
  stripXmp: z.boolean().default(false),
  stripAll: z.boolean().default(true),
});

export function registerStripMetadata(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "strip-metadata",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const image = sharp(inputBuffer);
      const result = await stripMetadata(image, settings);
      const buffer = await result.toBuffer();
      return { buffer, filename, contentType: "image/png" };
    },
  });
}
