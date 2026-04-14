import sharp from "sharp";
import type { CompressOptions, Sharp } from "../types.js";

const FORMAT_MAP: Record<string, string> = {
  jpg: "jpeg",
  png: "png",
  webp: "webp",
  avif: "avif",
  tiff: "tiff",
  gif: "gif",
};

export async function compress(image: Sharp, options: CompressOptions): Promise<Sharp> {
  const { quality, targetSizeBytes, format } = options;

  const metadata = await image.metadata();
  const outputFormat = format
    ? (FORMAT_MAP[format] as keyof import("sharp").FormatEnum)
    : ((metadata.format as keyof import("sharp").FormatEnum) ?? "jpeg");

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

  return image.toFormat(outputFormat, { quality: q });
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
    const attempt = sharp(inputBuffer).toFormat(format, { quality: mid });
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

  // If we never found a suitable buffer, compress at lowest quality found
  if (bestBuffer === null) {
    bestBuffer = await sharp(inputBuffer).toFormat(format, { quality: bestQuality }).toBuffer();
  }

  // Preserve format + quality so the caller's .toBuffer() doesn't re-encode at defaults
  return sharp(bestBuffer).toFormat(format, { quality: bestQuality });
}
