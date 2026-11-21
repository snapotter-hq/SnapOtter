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
import { runPerFrame } from "../../lib/animated-image.js";
import { isFeatureInstalled } from "../../lib/feature-status.js";
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

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Padding grows the box by that percent of its own size, half on each side, as
// in subject and face modes. Each edge stops at the image border on its own, so
// an object touching the frame keeps its margin on the other sides rather than
// being shifted off centre the way clampRegion would.
export function growTrimBox(box: Box, padding: number, imgW: number, imgH: number): Box {
  const marginX = Math.round((box.width * padding) / 200);
  const marginY = Math.round((box.height * padding) / 200);
  const left = Math.max(0, box.left - marginX);
  const top = Math.max(0, box.top - marginY);
  const right = Math.min(imgW, box.left + box.width + marginX);
  const bottom = Math.min(imgH, box.top + box.height + marginY);
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * The crop a mode picked from page 1, applied to one page.
 *
 * A bare `sharp(inputBuffer)` reads page 1 only, so a multi-page TIFF or an
 * animated GIF came back with one page and a 200 (#4878). Every mode chooses
 * its region once, from page 1, and returns this so runPerFrame can give every
 * page the same crop: the pages stay one size, and face mode pays for one
 * detection rather than one per page.
 *
 * The pages it returns name PNG: an intermediate that names no format is
 * written back in whatever container the upload arrived in, so a JPEG paid a
 * second lossy generation per step and a GIF had the padding colour and the
 * resampled edges forced through the palette it was read with (#1190). The
 * route encodes once, at the output format it resolved.
 */
type PageCrop = (page: Buffer) => Promise<Buffer>;

async function planSubject(
  inputBuffer: Buffer,
  settings: z.output<typeof settingsSchema>,
): Promise<PageCrop> {
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
    throw new ToolInputError("Cannot determine image dimensions for smart crop", {
      code: "IMAGE_UNDECODABLE",
    });
  }
  const coverScale = Math.max(resizeW / srcW, resizeH / srcH);
  const coverW = Math.round(srcW * coverScale);
  const coverH = Math.round(srcH * coverScale);
  if (coverW * coverH > MAX_STEP_PIXELS) {
    throw new ToolInputError(
      `Covering ${resizeW} x ${resizeH} from a ${srcW} x ${srcH} image scales it to ${coverW} x ${coverH}, over the ${MAX_STEP_PIXELS} pixel limit`,
      { code: "RESULT_TOO_LARGE" },
    );
  }

  // Sharp reports where attention or entropy put the window inside the cover
  // intermediate, as negative offsets, and leaves them unset when the aspect
  // ratios already match. Resizing "outside" builds that same intermediate, so
  // extracting the window from it gives every page the pixels page 1 got.
  const { info } = await sharp(inputBuffer)
    .resize(resizeW, resizeH, { fit: "cover", position: strategy })
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Padding crops the target out of the middle of the oversized window.
  const window = {
    left: -(info.cropOffsetLeft ?? 0) + Math.round((resizeW - w) / 2),
    top: -(info.cropOffsetTop ?? 0) + Math.round((resizeH - h) / 2),
    width: w,
    height: h,
  };

  return (page) =>
    sharp(page).resize(resizeW, resizeH, { fit: "outside" }).extract(window).png().toBuffer();
}

const FACE_BUNDLE_ID = "face-detection";

async function planFace(
  inputBuffer: Buffer,
  settings: z.output<typeof settingsSchema>,
  signal?: AbortSignal,
): Promise<PageCrop> {
  // The route answers 501 first; batch and pipeline runs reach this directly.
  if (!isFeatureInstalled(FACE_BUNDLE_ID)) {
    throw new ToolInputError(
      "Face mode needs the Face Detection feature bundle. Install it, or use another mode.",
      { code: "FEATURE_NOT_INSTALLED" },
    );
  }
  const result = await detectFaces(inputBuffer, {
    sensitivity: settings.sensitivity,
    toolId: "smart-crop",
    signal,
  });

  if (result.facesDetected === 0) {
    return planSubject(inputBuffer, { ...settings, strategy: "attention" });
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
    return planSubject(inputBuffer, { ...settings, strategy: "attention" });
  }

  return async (page) => {
    const extracted = await sharp(page).extract(region).png().toBuffer();
    return sharp(extracted).resize(targetW, targetH, { fit: "fill" }).png().toBuffer();
  };
}

async function planTrim(
  inputBuffer: Buffer,
  settings: z.output<typeof settingsSchema>,
): Promise<PageCrop> {
  // Sharp's trim needs each side to be at least 3 pixels. Both sides under 3 trip
  // its own check, and a 2 x 10 strip fails in the 3 x 3 median window libvips
  // runs first (skipped only with lineArt, which this tool never sets). Either way
  // a bare Error reached the worker as a server fault (#2202).
  const { width, height } = await sharp(inputBuffer).metadata();
  if (width < 3 || height < 3) {
    throw new ToolInputError(
      `The image is too small to trim (${width} x ${height} pixels). Both sides have to be at least 3 pixels.`,
      { code: "INVALID_SETTINGS" },
    );
  }

  // Trim finds the box; the margin then comes back from the original pixels,
  // so it is real backdrop rather than a padded canvas.
  const { info } = await sharp(inputBuffer)
    .trim({ threshold: settings.threshold })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const trimmed = {
    left: -(info.trimOffsetLeft ?? 0),
    top: -(info.trimOffsetTop ?? 0),
    width: info.width,
    height: info.height,
  };
  const region = growTrimBox(trimmed, settings.padding, width, height);

  if (!settings.padToSquare && !settings.targetSize) {
    return (page) => sharp(page).extract(region).png().toBuffer();
  }

  const target = settings.targetSize || Math.max(region.width, region.height);
  // The padded square is re-read by the route; one past the 64 MP limit would
  // allocate an oversized intermediate. Only reachable without a targetSize,
  // since that is capped by the schema.
  if (target * target > MAX_STEP_PIXELS) {
    throw new ToolInputError(
      `The trimmed image is too large to pad to a square (${target} x ${target} pixels). Set targetSize to ${MAX_TRIM_SQUARE_SIDE} or less.`,
      { code: "RESULT_TOO_LARGE" },
    );
  }
  const padR = Math.round(Number.parseInt(settings.padColor.slice(1, 3), 16));
  const padG = Math.round(Number.parseInt(settings.padColor.slice(3, 5), 16));
  const padB = Math.round(Number.parseInt(settings.padColor.slice(5, 7), 16));

  return async (page) => {
    const cropped = await sharp(page).extract(region).png().toBuffer();
    return sharp(cropped)
      .resize({
        width: target,
        height: target,
        fit: "contain",
        background: { r: padR, g: padG, b: padB, alpha: 1 },
      })
      .png()
      .toBuffer();
  };
}

function planCrop(
  inputBuffer: Buffer,
  settings: z.output<typeof settingsSchema>,
  signal?: AbortSignal,
): Promise<PageCrop> {
  if (settings.mode === "face") return planFace(inputBuffer, settings, signal);
  if (settings.mode === "trim") return planTrim(inputBuffer, settings);
  return planSubject(inputBuffer, settings);
}

export function registerSmartCrop(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "smart-crop",
    settingsSchema,
    missingBundle: (s) =>
      s.mode === "face" && !isFeatureInstalled(FACE_BUNDLE_ID) ? FACE_BUNDLE_ID : null,
    process: withImageEncodeContext<z.output<typeof settingsSchema>>(
      "Smart crop failed",
      (s) => s?.mode ?? "subject",
      async (inputBuffer, settings, filename, ctx) => {
        const outputFormat = await resolveOutputFormat(inputBuffer, filename, settings.quality);
        let pages: Buffer | undefined;
        let cropped: Buffer;

        try {
          const crop = await planCrop(inputBuffer, settings, ctx?.signal);
          pages = await runPerFrame(inputBuffer, outputFormat, crop);
          cropped = pages ?? (await crop(inputBuffer));
        } catch (err) {
          throw await asInputErrorIfUndecodable(inputBuffer, err);
        }

        const result =
          pages ??
          (await sharp(cropped)
            .toFormat(outputFormat.format, outputFormat.encoderOptions)
            .toBuffer());

        const stem = filename.replace(/\.[^.]+$/, "");
        const outputFilename = `${stem}_smartcrop.${outputFormat.extension}`;
        return { buffer: result, filename: outputFilename, contentType: outputFormat.contentType };
      },
    ),
  });
}
