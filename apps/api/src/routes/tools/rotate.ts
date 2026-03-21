import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";
import { rotate, flip } from "@stirling-image/image-engine";
import sharp from "sharp";
import type { FastifyInstance } from "fastify";

const settingsSchema = z.object({
  angle: z.number().default(0),
  horizontal: z.boolean().default(false),
  vertical: z.boolean().default(false),
});

export function registerRotate(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "rotate",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      let image = sharp(inputBuffer);

      // Apply rotation first
      if (settings.angle !== 0) {
        image = await rotate(image, { angle: settings.angle });
      }

      // Then apply flip/flop
      if (settings.horizontal || settings.vertical) {
        image = await flip(image, {
          horizontal: settings.horizontal,
          vertical: settings.vertical,
        });
      }

      const buffer = await image.toBuffer();
      return { buffer, filename, contentType: "image/png" };
    },
  });
}
