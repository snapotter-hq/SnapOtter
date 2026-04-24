import { compress } from "@snapotter/image-engine";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createToolRoute } from "../tool-factory.js";

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
      const outputFormat = await resolveOutputFormat(inputBuffer, filename);

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
      return { buffer, filename, contentType: outputFormat.contentType };
    },
  });
}
