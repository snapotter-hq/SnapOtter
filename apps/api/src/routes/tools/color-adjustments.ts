import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";
import {
  brightness as adjustBrightness,
  contrast as adjustContrast,
  saturation as adjustSaturation,
  colorChannels,
  grayscale,
  sepia,
  invert,
} from "@stirling-image/image-engine";
import sharp from "sharp";
import type { FastifyInstance } from "fastify";

const settingsSchema = z.object({
  brightness: z.number().min(-100).max(100).default(0),
  contrast: z.number().min(-100).max(100).default(0),
  saturation: z.number().min(-100).max(100).default(0),
  red: z.number().min(0).max(200).default(100),
  green: z.number().min(0).max(200).default(100),
  blue: z.number().min(0).max(200).default(100),
  effect: z
    .enum(["none", "grayscale", "sepia", "invert"])
    .default("none"),
});

/**
 * Combined color adjustment route that handles brightness, contrast,
 * saturation, color channels, and color effects in a single request.
 *
 * Serves tool IDs: brightness-contrast, saturation, color-channels, color-effects
 */
export function registerColorAdjustments(app: FastifyInstance) {
  // Register the same handler under all four color-related tool IDs
  const toolIds = [
    "brightness-contrast",
    "saturation",
    "color-channels",
    "color-effects",
  ];

  for (const toolId of toolIds) {
    createToolRoute(app, {
      toolId,
      settingsSchema,
      process: async (inputBuffer, settings, filename) => {
        let image = sharp(inputBuffer);

        // Apply brightness
        if (settings.brightness !== 0) {
          image = await adjustBrightness(image, {
            value: settings.brightness,
          });
        }

        // Apply contrast
        if (settings.contrast !== 0) {
          image = await adjustContrast(image, { value: settings.contrast });
        }

        // Apply saturation
        if (settings.saturation !== 0) {
          image = await adjustSaturation(image, {
            value: settings.saturation,
          });
        }

        // Apply color channels (only if not default 100/100/100)
        if (
          settings.red !== 100 ||
          settings.green !== 100 ||
          settings.blue !== 100
        ) {
          image = await colorChannels(image, {
            red: settings.red,
            green: settings.green,
            blue: settings.blue,
          });
        }

        // Apply effect
        switch (settings.effect) {
          case "grayscale":
            image = await grayscale(image);
            break;
          case "sepia":
            image = await sepia(image);
            break;
          case "invert":
            image = await invert(image);
            break;
        }

        const buffer = await image.toBuffer();
        return { buffer, filename, contentType: "image/png" };
      },
    });
  }
}
