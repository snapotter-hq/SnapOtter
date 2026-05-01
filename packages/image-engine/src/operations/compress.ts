import sharp from "sharp";
import type { CompressOptions, Sharp } from "../types.js";

const FORMAT_MAP: Record<string, string> = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
  avif: "avif",
  heif: "avif",
  tiff: "tiff",
  gif: "gif",
};

/** Formats that Sharp cannot encode — fall back to PNG for output. */
const NO_ENCODER = new Set(["svg", "bmp", "raw", "tga", "psd", "exr", "hdr", "ico"]);

function formatOpts(format: string, quality: number): Record<string, unknown> {
  const opts: Record<string, unknown> = { quality };
  if (format === "avif") opts.effort = 4;
  return opts;
}

export async function compress(image: Sharp, options: CompressOptions): Promise<Sharp> {
  const { quality, targetSizeBytes, format } = options;

  const metadata = await image.metadata();
  const detected = metadata.format ?? "jpeg";
  // Fall back to PNG for formats Sharp cannot encode (SVG, BMP, etc.)
  const safeDetected = NO_ENCODER.has(detected) ? "png" : detected;
  const outputFormat = (FORMAT_MAP[format ?? ""] ??
    FORMAT_MAP[safeDetected] ??
    safeDetected) as keyof import("sharp").FormatEnum;

  if (targetSizeBytes !== undefined) {
    if (targetSizeBytes <= 0) {
      throw new Error("Target size must be greater than 0");
    }
    const inputBuffer = await image.toBuffer();
    return compressToTargetSize(inputBuffer, outputFormat, targetSizeBytes);
  }

  const q = quality ?? 80;
  if (q < 1 || q > 100) {
    throw new Error("Quality must be between 1 and 100");
  }

  return image.toFormat(outputFormat, formatOpts(outputFormat, q));
}

async function compressToTargetSize(
  inputBuffer: Buffer,
  format: keyof import("sharp").FormatEnum,
  targetBytes: number,
): Promise<Sharp> {
  let low = 1;
  let high = 100;
  let bestQuality = 1;
  let bestBuffer: Buffer | null = null;
  const maxIterations = 8;
  const tolerance = 0.05; // 5%

  for (let i = 0; i < maxIterations && low <= high; i++) {
    const mid = Math.min(100, Math.max(1, Math.round((low + high) / 2)));
    const attempt = sharp(inputBuffer).toFormat(format, formatOpts(format, mid));
    const resultBuffer = await attempt.toBuffer();
    const resultSize = resultBuffer.length;

    if (Math.abs(resultSize - targetBytes) / targetBytes <= tolerance) {
      bestQuality = mid;
      bestBuffer = resultBuffer;
      break;
    }

    if (resultSize > targetBytes) {
      high = mid - 1;
    } else {
      low = mid + 1;
      bestQuality = mid;
      bestBuffer = resultBuffer;
    }
  }

  if (bestBuffer === null) {
    bestBuffer = await sharp(inputBuffer)
      .toFormat(format, formatOpts(format, bestQuality))
      .toBuffer();
  }

  return sharp(bestBuffer);
}
