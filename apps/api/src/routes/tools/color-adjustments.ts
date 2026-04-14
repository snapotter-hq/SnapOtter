import {
  brightness as adjustBrightness,
  contrast as adjustContrast,
  sharpen as adjustSharpen,
  colorChannels,
  grayscale,
  invert,
  sepia,
} from "@ashim/image-engine";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  // Light
  brightness: z.number().min(-100).max(100).default(0),
  contrast: z.number().min(-100).max(100).default(0),
  exposure: z.number().min(-100).max(100).default(0),
  // Color
  saturation: z.number().min(-100).max(100).default(0),
  temperature: z.number().min(-100).max(100).default(0),
  tint: z.number().min(-100).max(100).default(0),
  hue: z.number().min(-180).max(180).default(0),
  // Detail
  sharpness: z.number().min(0).max(100).default(0),
  // Channels
  red: z.number().min(0).max(200).default(100),
  green: z.number().min(0).max(200).default(100),
  blue: z.number().min(0).max(200).default(100),
  // Effects
  effect: z.enum(["none", "grayscale", "sepia", "invert"]).default("none"),
});

/**
 * Build a 3x3 recomb matrix for color temperature + tint shift.
 * Temperature: cool (blue) ←→ warm (orange) on the blue-orange axis.
 * Tint: green ←→ magenta on the green-magenta axis.
 */
function colorTempTintMatrix(
  temp: number,
  tintVal: number,
): [[number, number, number], [number, number, number], [number, number, number]] {
  const t = temp / 100;
  const n = tintVal / 100;
  return [
    [1 + t * 0.15 + n * 0.1, 0, 0],
    [0, 1 + t * 0.05 - n * 0.15, 0],
    [0, 0, 1 - t * 0.15 + n * 0.1],
  ];
}

/**
 * Consolidated color adjustment route.
 *
 * Replaces the old brightness-contrast, saturation, color-channels,
 * and color-effects tools with a single "adjust-colors" endpoint.
 */
async function processColorAdjustments(
  inputBuffer: Buffer,
  settings: z.infer<typeof settingsSchema>,
  filename: string,
) {
  const outputFormat = await resolveOutputFormat(inputBuffer, filename);
  let image = sharp(inputBuffer);

  // Light
  if (settings.brightness !== 0) {
    image = await adjustBrightness(image, { value: settings.brightness });
  }
  if (settings.contrast !== 0) {
    image = await adjustContrast(image, { value: settings.contrast });
  }
  if (settings.exposure !== 0) {
    // Map -100..+100 to gamma 3.0..0.33 (lower gamma = brighter midtones)
    const gamma = 1 / (1 + settings.exposure / 100);
    image = image.gamma(gamma);
  }

  // Color
  if (settings.saturation !== 0 || settings.hue !== 0) {
    const modOpts: { saturation?: number; hue?: number } = {};
    if (settings.saturation !== 0) modOpts.saturation = 1 + settings.saturation / 100;
    if (settings.hue !== 0) modOpts.hue = settings.hue;
    image = image.modulate(modOpts);
  }
  if (settings.temperature !== 0 || settings.tint !== 0) {
    image = image.recomb(colorTempTintMatrix(settings.temperature, settings.tint));
  }

  // Detail
  if (settings.sharpness > 0) {
    image = await adjustSharpen(image, { value: settings.sharpness });
  }

  // Channels
  if (settings.red !== 100 || settings.green !== 100 || settings.blue !== 100) {
    image = await colorChannels(image, {
      red: settings.red,
      green: settings.green,
      blue: settings.blue,
    });
  }

  // Effects
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

  const buffer = await image
    .toFormat(outputFormat.format, { quality: outputFormat.quality })
    .toBuffer();
  return { buffer, filename, contentType: outputFormat.contentType };
}

export function registerColorAdjustments(app: FastifyInstance) {
  const allIds = [
    "adjust-colors",
    "brightness-contrast",
    "saturation",
    "color-channels",
    "color-effects",
  ];
  for (const toolId of allIds) {
    createToolRoute(app, { toolId, settingsSchema, process: processColorAdjustments });
  }
}
