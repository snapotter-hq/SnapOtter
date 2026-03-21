import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";
import { compress } from "@stirling-image/image-engine";
import sharp from "sharp";
import type { FastifyInstance } from "fastify";

const settingsSchema = z.object({
  mode: z.enum(["quality", "targetSize"]).default("quality"),
  quality: z.number().min(1).max(100).optional(),
  targetSizeKb: z.number().positive().optional(),
});

export function registerCompress(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "compress",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const image = sharp(inputBuffer);

      const compressOptions: {
        quality?: number;
        targetSizeBytes?: number;
      } = {};

      if (settings.mode === "targetSize" && settings.targetSizeKb) {
        // Convert KB to bytes for the engine
        compressOptions.targetSizeBytes = settings.targetSizeKb * 1024;
      } else {
        compressOptions.quality = settings.quality ?? 80;
      }

      const result = await compress(image, compressOptions);
      const buffer = await result.toBuffer();
      return { buffer, filename, contentType: "image/jpeg" };
    },
  });
}
