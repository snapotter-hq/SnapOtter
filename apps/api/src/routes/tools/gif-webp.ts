import { extname } from "node:path";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({});

export function registerGifWebp(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "gif-webp",
    settingsSchema,
    process: async (inputBuffer, _settings, filename) => {
      const ext = extname(filename).toLowerCase();

      // Route-level extension guard: image modality has no 415 gate
      if (ext !== ".gif" && ext !== ".webp") {
        throw new InputValidationError("Only GIF and WebP inputs are supported");
      }

      if (ext === ".gif") {
        // GIF -> WebP (preserving animation)
        const buffer = await sharp(inputBuffer, { animated: true }).webp().toBuffer();
        const base = filename.replace(/\.[^.]+$/, "");
        return {
          buffer,
          filename: `${base}.webp`,
          contentType: "image/webp",
        };
      }

      // WebP -> GIF (preserving animation)
      const buffer = await sharp(inputBuffer, { animated: true }).gif().toBuffer();
      const base = filename.replace(/\.[^.]+$/, "");
      return {
        buffer,
        filename: `${base}.gif`,
        contentType: "image/gif",
      };
    },
  });
}
