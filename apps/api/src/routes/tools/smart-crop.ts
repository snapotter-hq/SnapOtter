import { detectFaces } from "@snapotter/ai";
import { SMART_CROP_FACE_PRESETS } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createToolRoute } from "../tool-factory.js";

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
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    padding: z.number().int().min(0).max(50).default(0),
    facePreset: z
      .enum(["closeup", "head-shoulders", "upper-body", "half-body"])
      .default("head-shoulders"),
    sensitivity: z.number().min(0).max(1).default(0.5),
    threshold: z.number().int().min(0).max(255).default(30),
    padToSquare: z.boolean().default(false),
    padColor: z.string().default("#ffffff"),
    targetSize: z.number().int().positive().optional(),
    quality: z.number().int().min(1).max(100).optional(),
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
      .toBuffer();

    const extractLeft = Math.round((oversizeW - w) / 2);
    const extractTop = Math.round((oversizeH - h) / 2);

    return sharp(oversize)
      .extract({ left: extractLeft, top: extractTop, width: w, height: h })
      .toBuffer();
  }

  return sharp(inputBuffer).resize(w, h, { fit: "cover", position: strategy }).toBuffer();
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

  const extracted = await sharp(inputBuffer).extract(region).toBuffer();
  return sharp(extracted).resize(targetW, targetH, { fit: "fill" }).toBuffer();
}

async function processTrim(
  inputBuffer: Buffer,
  settings: z.output<typeof settingsSchema>,
): Promise<Buffer> {
  if (settings.padToSquare || settings.targetSize) {
    const trimmed = await sharp(inputBuffer)
      .trim({ threshold: settings.threshold })
      .toBuffer({ resolveWithObject: true });

    const w = trimmed.info.width;
    const h = trimmed.info.height;
    const target = settings.targetSize || Math.max(w, h);
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
      .toBuffer();
  }

  return sharp(inputBuffer).trim({ threshold: settings.threshold }).toBuffer();
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
        .toFormat(outputFormat.format, { quality: outputFormat.quality })
        .toBuffer();

      const stem = filename.replace(/\.[^.]+$/, "");
      const outputFilename = `${stem}_smartcrop.${outputFormat.extension}`;
      return { buffer: result, filename: outputFilename, contentType: outputFormat.contentType };
    },
  });
}
