import { extname } from "node:path";
import { convert } from "@snapotter/image-engine";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { encodeHeic } from "../../lib/heic-converter.js";
import { isSvgBuffer } from "../../lib/svg-sanitize.js";
import { createToolRoute } from "../tool-factory.js";

const FORMAT_CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  tiff: "image/tiff",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
};

const settingsSchema = z.object({
  format: z.enum(["jpg", "png", "webp", "avif", "tiff", "gif", "heic", "heif"]),
  quality: z.number().min(1).max(100).optional(),
});

export function registerConvert(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "convert",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const sharpOpts = isSvgBuffer(inputBuffer) ? { density: 300 } : undefined;
      const image = sharp(inputBuffer, sharpOpts);

      let buffer: Buffer;
      if (settings.format === "heic" || settings.format === "heif") {
        // Sharp cannot encode HEVC. Convert to PNG first, then use heif-enc.
        const pngBuffer = await image.png().toBuffer();
        buffer = await encodeHeic(pngBuffer, settings.quality);
      } else {
        const result = await convert(image, settings);
        buffer = await result.toBuffer();
      }

      // Change filename extension to match the output format
      const ext = extname(filename);
      const baseName = ext ? filename.slice(0, -ext.length) : filename;
      const outputFilename = `${baseName}.${settings.format}`;

      const contentType = FORMAT_CONTENT_TYPES[settings.format] || "application/octet-stream";

      return { buffer, filename: outputFilename, contentType };
    },
  });
}
