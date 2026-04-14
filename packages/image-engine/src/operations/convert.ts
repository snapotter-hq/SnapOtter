import type { ConvertOptions, Sharp } from "../types.js";

/**
 * Maps user-facing format names to Sharp format strings.
 * Note: HEIC is excluded because Sharp cannot encode HEVC.
 * HEIC encoding is handled at the API route level via heif-enc.
 */
const FORMAT_MAP: Record<string, string> = {
  jpg: "jpeg",
  png: "png",
  webp: "webp",
  avif: "avif",
  tiff: "tiff",
  gif: "gif",
};

export async function convert(image: Sharp, options: ConvertOptions): Promise<Sharp> {
  const { format, quality } = options;

  const sharpFormat = FORMAT_MAP[format];
  if (!sharpFormat) {
    throw new Error(`Unsupported output format: ${format}`);
  }

  const formatOptions: Record<string, unknown> = {};
  if (quality !== undefined) {
    if (quality < 1 || quality > 100) {
      throw new Error("Quality must be between 1 and 100");
    }
    formatOptions.quality = quality;
  }

  return image.toFormat(sharpFormat as keyof import("sharp").FormatEnum, formatOptions);
}
