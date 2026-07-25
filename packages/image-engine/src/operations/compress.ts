import { ToolInputError } from "@snapotter/shared";
import sharp from "sharp";
import type { CompressOptions, Sharp, SharpFormat } from "../types.js";

const FORMAT_MAP: Record<string, SharpFormat> = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
  avif: "avif",
  heif: "avif",
  tiff: "tiff",
  gif: "gif",
  jxl: "jxl",
};

function formatOpts(format: SharpFormat, quality: number): Record<string, unknown> {
  const opts: Record<string, unknown> = { quality };
  if (format === "avif") opts.effort = 4;
  return opts;
}

export async function compress(image: Sharp, options: CompressOptions): Promise<Sharp> {
  const { quality, targetSizeBytes, format } = options;

  const explicitFormat = FORMAT_MAP[format ?? ""];
  if (format !== undefined && explicitFormat === undefined) {
    throw new ToolInputError(`Unsupported compression format: ${format}`);
  }

  if (quality !== undefined) {
    if (!Number.isFinite(quality) || !Number.isInteger(quality)) {
      throw new ToolInputError("Quality must be an integer between 1 and 100");
    }
    if (quality < 1 || quality > 100) {
      throw new ToolInputError("Quality must be between 1 and 100");
    }
  }

  if (targetSizeBytes !== undefined) {
    if (!Number.isSafeInteger(targetSizeBytes)) {
      throw new ToolInputError("Target size must be a positive integer");
    }
    if (targetSizeBytes <= 0) {
      throw new ToolInputError("Target size must be greater than 0");
    }
  }

  const metadata = await image.metadata();
  const detectedFormat = FORMAT_MAP[metadata.format ?? ""] ?? "png";
  const outputFormat = explicitFormat ?? detectedFormat;

  if (targetSizeBytes !== undefined) {
    const inputBuffer = await image.toBuffer();
    return compressToTargetSize(inputBuffer, outputFormat, targetSizeBytes);
  }

  const q = quality ?? 80;
  return image.toFormat(outputFormat, formatOpts(outputFormat, q));
}

interface CompressionCandidate {
  quality: number;
}

async function findBestQuality(
  inputBuffer: Buffer,
  resize: { width: number; height: number } | null,
  format: SharpFormat,
  targetBytes: number,
): Promise<CompressionCandidate | null> {
  let low = 1;
  let high = 100;
  let best: CompressionCandidate | null = null;
  const tolerance = 0.01;

  while (low <= high) {
    const mid = Math.min(100, Math.max(1, Math.round((low + high) / 2)));
    let pipeline = sharp(inputBuffer);
    if (resize) pipeline = pipeline.resize(resize.width, resize.height);
    const resultBuffer = await pipeline.toFormat(format, formatOpts(format, mid)).toBuffer();
    const resultSize = resultBuffer.length;

    if (resultSize <= targetBytes) {
      best = { quality: mid };
      if ((targetBytes - resultSize) / targetBytes <= tolerance) break;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

async function compressToTargetSize(
  inputBuffer: Buffer,
  format: SharpFormat,
  targetBytes: number,
): Promise<Sharp> {
  const fullSizeCandidate = await findBestQuality(inputBuffer, null, format, targetBytes);
  if (fullSizeCandidate !== null) {
    return sharp(inputBuffer).toFormat(format, formatOpts(format, fullSizeCandidate.quality));
  }

  const metadata = await sharp(inputBuffer).metadata();
  const originalWidth = metadata.width ?? 0;
  const originalHeight = metadata.height ?? 0;

  if (originalWidth === 0 || originalHeight === 0) {
    throw new ToolInputError("Cannot determine image dimensions for target-size compression");
  }

  const scaleFactor = 0.75;
  const maxScalePasses = 8;

  for (let pass = 1; pass <= maxScalePasses; pass++) {
    const factor = scaleFactor ** pass;
    const newWidth = Math.round(originalWidth * factor);
    const newHeight = Math.round(originalHeight * factor);
    if (newWidth < 10 || newHeight < 10) break;

    const dims = { width: newWidth, height: newHeight };
    const candidate = await findBestQuality(inputBuffer, dims, format, targetBytes);
    if (candidate !== null) {
      return sharp(inputBuffer)
        .resize(newWidth, newHeight)
        .toFormat(format, formatOpts(format, candidate.quality));
    }
  }

  throw new ToolInputError(
    `Unable to compress image to ${targetBytes} bytes within safe resize limits`,
  );
}
