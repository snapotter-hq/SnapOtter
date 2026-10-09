import { detectFaces } from "@snapotter/ai";
import {
  MAX_RESIZE_OUTPUT_DIMENSION,
  SMART_CROP_FACE_PRESETS,
  ToolInputError,
} from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createToolRoute } from "../tool-factory.js";

// Sharp re-reads the buffers this tool hands between its own steps, and refuses one
// over its default input limit (0x3FFF x 0x3FFF) with a bare Error that reaches the
// worker as a server fault. Refuse the request instead (#2064).
const MAX_STEP_PIXELS = 0x3fff * 0x3fff;

const dimension = z.number().int().positive().max(MAX_RESIZE_OUTPUT_DIMENSION);

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
    targetSize: dimension.optional(),
    quality: z.number().int().min(1).max(100).optional(),
  })
  .superRefine((s, ctx) => {
    // With no padding the pair is already inside the per-field ceiling, so only a
    // padded subject resize (also the no-face fallback of face mode) makes an
    // intermediate bigger than the output. Trim ignores width and height.
    if (s.mode === "trim" || s.padding === 0) return;
    const scale = 1 + s.padding / 100;
    const w = Math.round((s.width ?? 1080) * scale);
    const h = Math.round((s.height ?? 1080) * scale);
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
  const w = Math.min(cropW, imgW);
  const h = Math.min(cropH, imgH);
  let l = left;
  let t = top;

  if (l < 0) l = 0;
  if (t < 0) t = 0;
  if (l + w > imgW) l = imgW - w;
  if (t + h > imgH) t = imgH - h;

  return {
    left: Math.round(Math.max(0, l)),
    top: Math.round(Math.max(0, t)),
    width: Math.round(w),
    height: Math.round(h),
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

  if (settings.padding > 0) {
    const scale = 1 + settings.padding / 100;
    const oversizeW = Math.round(w * scale);
    const oversizeH = Math.round(h * scale);

    const oversize = await sharp(inputBuffer)
      .resize(oversizeW, oversizeH, { fit: "cover", position: strategy })
      .png()
      .toBuffer();

    const extractLeft = Math.round((oversizeW - w) / 2);
    const extractTop = Math.round((oversizeH - h) / 2);

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
): Promise<Buffer> {
  const result = await detectFaces(inputBuffer, { sensitivity: settings.sensitivity });

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
    // The padded square is re-read below; one past Sharp's input limit would throw a
    // bare Error. Only reachable without a targetSize, since that is capped by the schema.
    if (target * target > MAX_STEP_PIXELS) {
      throw new ToolInputError(
        `The trimmed image is too large to pad to a square (${target} x ${target} pixels). Set targetSize to ${MAX_RESIZE_OUTPUT_DIMENSION} or less.`,
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
    process: async (inputBuffer, settings, filename) => {
      const outputFormat = await resolveOutputFormat(inputBuffer, filename, settings.quality);
      let result: Buffer;

      if (settings.mode === "face") {
        result = await processFace(inputBuffer, settings);
      } else if (settings.mode === "trim") {
        result = await processTrim(inputBuffer, settings);
      } else {
        result = await processSubject(inputBuffer, settings);
      }

      result = await sharp(result)
        .toFormat(outputFormat.format, outputFormat.encoderOptions)
        .toBuffer();

      const stem = filename.replace(/\.[^.]+$/, "");
      const outputFilename = `${stem}_smartcrop.${outputFormat.extension}`;
      return { buffer: result, filename: outputFilename, contentType: outputFormat.contentType };
    },
  });
}
