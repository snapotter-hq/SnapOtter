import { detectFaces } from "@snapotter/ai";
import { MAX_RESIZE_OUTPUT_PIXELS } from "@snapotter/image-engine";
import {
  MAX_RESIZE_OUTPUT_DIMENSION,
  SMART_CROP_FACE_PRESETS,
  ToolInputError,
} from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { asInputErrorIfUndecodable, withImageEncodeContext } from "../../lib/image-error.js";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createToolRoute } from "../tool-factory.js";

// Cap outputs and intermediate buffers at the same 64 MP limit as resize (#2064, #2203).
const MAX_STEP_PIXELS = MAX_RESIZE_OUTPUT_PIXELS;
const MAX_TRIM_SQUARE_SIDE = Math.floor(Math.sqrt(MAX_STEP_PIXELS));

const dimension = z.number().int().positive().max(MAX_RESIZE_OUTPUT_DIMENSION);
const squareDimension = z.number().int().positive().max(MAX_TRIM_SQUARE_SIDE);

// processTrim slices this into three hex pairs, so anything else used to reach
// Sharp as NaN (a bare Error) or as the wrong colour with a 200 (#2201).
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex color like #ffffff");

const settingsSchema = z
  .object({
    mode: z
      .enum(["subject", "face", "trim", "attention", "content"])
      .default("subject")
      .transform((v) => {
        if (v === "attention") return "subject" as const;
        if (v === "content") return "trim" as const;
        return v;
      }),
    strategy: z.enum(["attention", "entropy"]).default("attention"),
    width: dimension.optional(),
    height: dimension.optional(),
    padding: z.number().int().min(0).max(50).default(0),
    facePreset: z
      .enum(["closeup", "head-shoulders", "upper-body", "half-body"])
      .default("head-shoulders"),
    sensitivity: z.number().min(0).max(1).default(0.5),
    threshold: z.number().int().min(0).max(255).default(30),
    padToSquare: z.boolean().default(false),
    padColor: hexColor.default("#ffffff"),
    targetSize: squareDimension.optional(),
    quality: z.number().int().min(1).max(100).optional(),
  })
  .superRefine((s, ctx) => {
    // Trim ignores width and height. Skip the pair check when a single side already
    // failed its own ceiling so the caller gets one error instead of two.
    if (s.mode === "trim") return;
    const outW = s.width ?? 1080;
    const outH = s.height ?? 1080;
    if (outW > MAX_RESIZE_OUTPUT_DIMENSION || outH > MAX_RESIZE_OUTPUT_DIMENSION) return;
    if (outW * outH > MAX_STEP_PIXELS) {
      ctx.addIssue({
        code: "custom",
        path: ["width"],
        message: `Crop size ${outW} x ${outH} is over the ${MAX_STEP_PIXELS} pixel limit`,
      });
      return;
    }
    if (s.padding === 0) return;
    const scale = 1 + s.padding / 100;
    const w = Math.round(outW * scale);
    const h = Math.round(outH * scale);
    if (w * h > MAX_STEP_PIXELS) {
      ctx.addIssue({
        code: "custom",
        path: ["width"],
        message: `With ${s.padding}% padding the crop is resized to ${w} x ${h}, over the ${MAX_STEP_PIXELS} pixel limit`,
      });
    }
  })
  .transform((s) => ({
    ...s,
    mode: s.mode as "subject" | "face" | "trim",
  }));

function clampRegion(
  left: number,
  top: number,
  cropW: number,
  cropH: number,
  imgW: number,
  imgH: number,
) {
  const width = Math.min(imgW, Math.round(cropW));
  const height = Math.min(imgH, Math.round(cropH));
  return {
    left: Math.min(Math.max(0, Math.round(left)), imgW - width),
    top: Math.min(Math.max(0, Math.round(top)), imgH - height),
    width,
    height,
  };
}

// The three crop strategies below hand their result back as a buffer for the
// route to encode once, at the output format it resolved. Every one of those
// hand-offs names PNG: an intermediate that names no format is written back in
// whatever container the upload arrived in, so a JPEG paid a second lossy
// generation per step and a GIF had the padding colour and the resampled edges
// forced through the palette it was read with (#1190).
async function processSubject(
  inputBuffer: Buffer,
  settings: z.output<typeof settingsSchema>,
): Promise<Buffer> {
  const w = settings.width ?? 1080;
  const h = settings.height ?? 1080;
  const strategy =
    settings.strategy === "entropy" ? sharp.strategy.entropy : sharp.strategy.attention;
  const scale = settings.padding > 0 ? 1 + settings.padding / 100 : 1;
  const resizeW = Math.round(w * scale);
  const resizeH = Math.round(h * scale);

  // Sharp stretches the source to cover the target box and holds that whole
  // intermediate in memory before attention or entropy picks the crop window.
  // When the input and target aspect ratios badly mismatch, even a small output
  // can produce a cover intermediate over the 64 MP limit (#2203).
  const { width: srcW, height: srcH } = await sharp(inputBuffer).metadata();
  if (!srcW || !srcH) {
    throw new ToolInputError("Cannot determine image dimensions for smart crop");
  }
  const coverScale = Math.max(resizeW / srcW, resizeH / srcH);
  const coverW = Math.round(srcW * coverScale);
  const coverH = Math.round(srcH * coverScale);
  if (coverW * coverH > MAX_STEP_PIXELS) {
    throw new ToolInputError(
      `Covering ${resizeW} x ${resizeH} from a ${srcW} x ${srcH} image scales it to ${coverW} x ${coverH}, over the ${MAX_STEP_PIXELS} pixel limit`,
    );
  }

  if (settings.padding > 0) {
    const oversize = await sharp(inputBuffer)
      .resize(resizeW, resizeH, { fit: "cover", position: strategy })
      .png()
      .toBuffer();

    const extractLeft = Math.round((resizeW - w) / 2);
    const extractTop = Math.round((resizeH - h) / 2);

    return sharp(oversize)
      .extract({ left: extractLeft, top: extractTop, width: w, height: h })
      .png()
      .toBuffer();
  }

  return sharp(inputBuffer).resize(w, h, { fit: "cover", position: strategy }).png().toBuffer();
}

async function processFace(
  inputBuffer: Buffer,
  settings: z.output<typeof settingsSchema>,
  signal?: AbortSignal,
): Promise<Buffer> {
  const result = await detectFaces(inputBuffer, {
    sensitivity: settings.sensitivity,
    toolId: "smart-crop",
    signal,
  });

  if (result.facesDetected === 0) {
    return processSubject(inputBuffer, { ...settings, strategy: "attention" });
  }

  const meta = await sharp(inputBuffer).metadata();
  const imgW = meta.width ?? 1;
  const imgH = meta.height ?? 1;
  const targetW = settings.width ?? 1080;
  const targetH = settings.height ?? 1080;

  const faces = result.faces;
  const minX = Math.min(...faces.map((f) => f.x));
  const minY = Math.min(...faces.map((f) => f.y));
  const maxX = Math.max(...faces.map((f) => f.x + f.w));
  const maxY = Math.max(...faces.map((f) => f.y + f.h));

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const unionH = maxY - minY;

  const preset = SMART_CROP_FACE_PRESETS.find((p) => p.id === settings.facePreset);
  const multiplier = preset?.multiplier ?? 2.8;

  const aspectRatio = targetW / targetH;
  let cropH = unionH * multiplier * (1 + settings.padding / 100);
  let cropW = cropH * aspectRatio;

  if (cropW > imgW) {
    cropW = imgW;
    cropH = cropW / aspectRatio;
  }
  if (cropH > imgH) {
    cropH = imgH;
    cropW = cropH * aspectRatio;
  }

  const left = cx - cropW / 2;
  const top = cy - cropH / 2;
  const region = clampRegion(left, top, cropW, cropH, imgW, imgH);

  if (region.width < 1 || region.height < 1) {
    return processSubject(inputBuffer, { ...settings, strategy: "attention" });
  }

  const extracted = await sharp(inputBuffer).extract(region).png().toBuffer();
  return sharp(extracted).resize(targetW, targetH, { fit: "fill" }).png().toBuffer();
}

async function processTrim(
  inputBuffer: Buffer,
  settings: z.output<typeof settingsSchema>,
): Promise<Buffer> {
  // Sharp's trim needs each side to be at least 3 pixels. Both sides under 3 trip
  // its own check, and a 2 x 10 strip fails in the 3 x 3 median window libvips
  // runs first (skipped only with lineArt, which this tool never sets). Either way
  // a bare Error reached the worker as a server fault (#2202).
  const { width, height } = await sharp(inputBuffer).metadata();
  if (width < 3 || height < 3) {
    throw new ToolInputError(
      `The image is too small to trim (${width} x ${height} pixels). Both sides have to be at least 3 pixels.`,
    );
  }

  if (settings.padToSquare || settings.targetSize) {
    const trimmed = await sharp(inputBuffer)
      .trim({ threshold: settings.threshold })
      .png()
      .toBuffer({ resolveWithObject: true });

    const w = trimmed.info.width;
    const h = trimmed.info.height;
    const target = settings.targetSize || Math.max(w, h);
    // The padded square is re-read below; one past the 64 MP limit would allocate
    // an oversized intermediate. Only reachable without a targetSize, since that is
    // capped by the schema.
    if (target * target > MAX_STEP_PIXELS) {
      throw new ToolInputError(
        `The trimmed image is too large to pad to a square (${target} x ${target} pixels). Set targetSize to ${MAX_TRIM_SQUARE_SIDE} or less.`,
      );
    }
    const padR = Math.round(Number.parseInt(settings.padColor.slice(1, 3), 16));
    const padG = Math.round(Number.parseInt(settings.padColor.slice(3, 5), 16));
    const padB = Math.round(Number.parseInt(settings.padColor.slice(5, 7), 16));

    return sharp(trimmed.data)
      .resize({
        width: target,
        height: target,
        fit: "contain",
        background: { r: padR, g: padG, b: padB, alpha: 1 },
      })
      .png()
      .toBuffer();
  }

  return sharp(inputBuffer).trim({ threshold: settings.threshold }).png().toBuffer();
}

export function registerSmartCrop(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "smart-crop",
    settingsSchema,
    process: withImageEncodeContext<z.output<typeof settingsSchema>>(
      "Smart crop failed",
      (s) => s?.mode ?? "subject",
      async (inputBuffer, settings, filename, ctx) => {
        const outputFormat = await resolveOutputFormat(inputBuffer, filename, settings.quality);
        let result: Buffer;

        try {
          if (settings.mode === "face") {
            result = await processFace(inputBuffer, settings, ctx?.signal);
          } else if (settings.mode === "trim") {
            result = await processTrim(inputBuffer, settings);
          } else {
            result = await processSubject(inputBuffer, settings);
          }
        } catch (err) {
          throw await asInputErrorIfUndecodable(inputBuffer, err);
        }

        result = await sharp(result)
          .toFormat(outputFormat.format, outputFormat.encoderOptions)
          .toBuffer();

        const stem = filename.replace(/\.[^.]+$/, "");
        const outputFilename = `${stem}_smartcrop.${outputFormat.extension}`;
        return { buffer: result, filename: outputFilename, contentType: outputFormat.contentType };
      },
    ),
  });
}
