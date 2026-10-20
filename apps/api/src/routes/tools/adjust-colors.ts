import {
  brightness as adjustBrightness,
  contrast as adjustContrast,
  sharpen as adjustSharpen,
  colorChannels,
  grayscale,
  invert,
  type Sharp,
  sepia,
} from "@snapotter/image-engine";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { openAnimated, readAnimationFor, runPerFrame } from "../../lib/animated-image.js";
import { asInputErrorIfUndecodable, withImageEncodeContext } from "../../lib/image-error.js";
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
  hue: z.number().int().min(-180).max(180).default(0),
  // Detail
  sharpness: z.number().min(0).max(100).default(0),
  // Channels
  red: z.number().min(0).max(200).default(100),
  green: z.number().min(0).max(200).default(100),
  blue: z.number().min(0).max(200).default(100),
  // Effects
  effect: z.enum(["none", "grayscale", "sepia", "invert"]).default("none"),
});

type Matrix3x3 = [[number, number, number], [number, number, number], [number, number, number]];

/**
 * Build a 3x3 recomb matrix for color temperature + tint shift.
 * Temperature: cool (blue) <-> warm (orange) on the blue-orange axis.
 * Tint: green <-> magenta on the green-magenta axis.
 */
function colorTempTintMatrix(temp: number, tintVal: number): Matrix3x3 {
  const t = temp / 100;
  const n = tintVal / 100;
  return [
    [1 + t * 0.15 + n * 0.1, 0, 0],
    [0, 1 + t * 0.05 - n * 0.15, 0],
    [0, 0, 1 - t * 0.15 + n * 0.1],
  ];
}

type RecombCarrier = { options?: { recombMatrix?: unknown } };

function readRecombMatrix(image: Sharp): Matrix3x3 | null {
  const flat = (image as unknown as RecombCarrier).options?.recombMatrix;
  if (flat === undefined) return null;
  if (!Array.isArray(flat) || flat.length !== 9 || !flat.every((n) => typeof n === "number")) {
    throw new Error("Expected Sharp options.recombMatrix to be a 9-number array");
  }
  return [
    [flat[0], flat[1], flat[2]],
    [flat[3], flat[4], flat[5]],
    [flat[6], flat[7], flat[8]],
  ];
}

export function multiplyMatrix3x3(a: Matrix3x3, b: Matrix3x3): Matrix3x3 {
  return [
    [
      a[0][0] * b[0][0] + a[0][1] * b[1][0] + a[0][2] * b[2][0],
      a[0][0] * b[0][1] + a[0][1] * b[1][1] + a[0][2] * b[2][1],
      a[0][0] * b[0][2] + a[0][1] * b[1][2] + a[0][2] * b[2][2],
    ],
    [
      a[1][0] * b[0][0] + a[1][1] * b[1][0] + a[1][2] * b[2][0],
      a[1][0] * b[0][1] + a[1][1] * b[1][1] + a[1][2] * b[2][1],
      a[1][0] * b[0][2] + a[1][1] * b[1][2] + a[1][2] * b[2][2],
    ],
    [
      a[2][0] * b[0][0] + a[2][1] * b[1][0] + a[2][2] * b[2][0],
      a[2][0] * b[0][1] + a[2][1] * b[1][1] + a[2][2] * b[2][1],
      a[2][0] * b[0][2] + a[2][1] * b[1][2] + a[2][2] * b[2][2],
    ],
  ];
}

/**
 * Sharp stores a single recombMatrix slot per pipeline instance, so calling
 * .recomb() a second or third time overwrites the earlier matrix (#2608).
 * Multiply the new 3x3 matrix with any previous one so temperature/tint,
 * channel multipliers, and sepia compose in sequence.
 */
async function chainRecomb(
  image: Sharp,
  apply: (img: Sharp) => Promise<Sharp> | Sharp,
): Promise<Sharp> {
  const prev = readRecombMatrix(image);
  const carrier = image as unknown as RecombCarrier;
  if (carrier.options) {
    carrier.options.recombMatrix = undefined;
  }
  const nextImage = await apply(image);
  const next = readRecombMatrix(nextImage);
  if (!next) {
    throw new Error("Expected recomb step to populate Sharp options.recombMatrix");
  }
  if (prev) {
    return nextImage.recomb(multiplyMatrix3x3(next, prev));
  }
  return nextImage;
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
  const hasRecomb =
    settings.temperature !== 0 ||
    settings.tint !== 0 ||
    settings.red !== 100 ||
    settings.green !== 100 ||
    settings.blue !== 100 ||
    settings.effect === "sepia";
  const needsRecombMaterialize =
    hasRecomb &&
    (settings.exposure > 0 || settings.effect === "grayscale" || settings.effect === "invert");

  // Everything here works pixel by pixel except sharpening, which samples
  // neighbouring rows and so reaches into the next frame of Sharp's stacked
  // strip, and intermediate PNG materialisation (needsRecombMaterialize), which
  // would flatten a multi-frame strip into a single tall frame. Those go frame
  // by frame; the rest keep the cheaper single pass over the whole animation
  // (#1083, #3120).
  if (settings.sharpness > 0 || needsRecombMaterialize) {
    try {
      const perFrame = await runPerFrame(inputBuffer, outputFormat.format, async (frame) => {
        const result = await processColorAdjustments(frame, settings, filename);
        return result.buffer;
      });
      if (perFrame) {
        return { buffer: perFrame, filename, contentType: outputFormat.contentType };
      }
    } catch (err) {
      throw await asInputErrorIfUndecodable(inputBuffer, err);
    }
  }

  let buffer: Buffer;
  try {
    let image = openAnimated(inputBuffer, await readAnimationFor(inputBuffer, outputFormat.format));

    // Light
    if (settings.brightness !== 0) {
      image = await adjustBrightness(image, { value: settings.brightness });
    }
    if (settings.exposure < 0) {
      // Sharp's gamma() accepts values between 1.0 and 3.0.
      // Negative exposure -> darken midtones -> apply gamma > 1.0 on input.
      const strength = Math.abs(settings.exposure) / 100;
      const g = 1 + strength * 2; // 1.0..3.0
      image = image.gamma(g, 1);
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
      image = await chainRecomb(image, (img) =>
        colorChannels(img, {
          red: settings.red,
          green: settings.green,
          blue: settings.blue,
        }),
      );
    }

    if (settings.effect === "sepia") {
      image = await chainRecomb(image, (img) => sepia(img));
    }

    // vips_recomb (temperature/tint, colorChannels, sepia) outputs 32-bit float
    // bands (0..255) and runs after .grayscale() in Sharp's internal pipeline.
    // Materialising through PNG casts back to 8-bit uchar before gammaOut
    // (positive exposure), grayscale, invert, or LZW TIFF output (#2586, #3120).
    if (needsRecombMaterialize) {
      image = sharp(await image.png().toBuffer());
    }

    if (settings.exposure > 0) {
      // Positive exposure -> brighten midtones -> apply gamma > 1.0 on output.
      const strength = settings.exposure / 100;
      const g = 1 + strength * 2; // 1.0..3.0
      image = image.gamma(1, g);
    }
    if (settings.contrast !== 0) {
      image = await adjustContrast(image, { value: settings.contrast });
    }

    // Effects
    switch (settings.effect) {
      case "grayscale":
        image = await grayscale(image);
        break;
      case "invert":
        image = await invert(image);
        break;
    }

    const finalImage =
      outputFormat.format === "tiff" && !needsRecombMaterialize
        ? sharp(await image.png().toBuffer())
        : image;
    buffer = await finalImage.toFormat(outputFormat.format, outputFormat.encoderOptions).toBuffer();
  } catch (err) {
    throw await asInputErrorIfUndecodable(inputBuffer, err);
  }
  return { buffer, filename, contentType: outputFormat.contentType };
}

const guardedProcessColorAdjustments = withImageEncodeContext<z.infer<typeof settingsSchema>>(
  "Color adjustment failed",
  (s) => s?.effect ?? "none",
  processColorAdjustments,
);

export function registerColorAdjustments(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "adjust-colors",
    settingsSchema,
    process: guardedProcessColorAdjustments,
  });
  // Backwards-compatible alias routes consolidated into adjust-colors. These
  // ids are not catalog TOOLS, so pass the section explicitly (all image).
  const aliasIds = ["brightness-contrast", "saturation", "color-channels", "color-effects"];
  for (const toolId of aliasIds) {
    createToolRoute(app, {
      toolId,
      section: "image",
      settingsSchema,
      process: guardedProcessColorAdjustments,
    });
  }
}
