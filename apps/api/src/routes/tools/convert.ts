import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";
import { convert } from "@stirling-image/image-engine";
import sharp from "sharp";
import type { FastifyInstance } from "fastify";
import { extname } from "node:path";

const FORMAT_CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  tiff: "image/tiff",
  gif: "image/gif",
};

const settingsSchema = z.object({
  format: z.enum(["jpg", "png", "webp", "avif", "tiff", "gif"]),
  quality: z.number().min(1).max(100).optional(),
});

export function registerConvert(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "convert",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const image = sharp(inputBuffer);
      const result = await convert(image, settings);
      const buffer = await result.toBuffer();

      // Change filename extension to match the output format
      const ext = extname(filename);
      const baseName = ext ? filename.slice(0, -ext.length) : filename;
      const outputFilename = `${baseName}.${settings.format}`;

      const contentType =
        FORMAT_CONTENT_TYPES[settings.format] || "application/octet-stream";

      return { buffer, filename: outputFilename, contentType };
    },
  });
}
