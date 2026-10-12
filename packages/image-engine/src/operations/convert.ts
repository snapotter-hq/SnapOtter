import type { ConvertOptions, Sharp, SharpFormat } from "../types.js";

/**
 * Maps user-facing format names to Sharp format strings.
 * Note: HEIC is excluded because Sharp cannot encode HEVC.
 * HEIC encoding is handled at the API route level via heif-enc.
 */
const FORMAT_MAP: Partial<Record<ConvertOptions["format"], SharpFormat>> = {
  jpg: "jpeg",
  png: "png",
  webp: "webp",
  avif: "avif",
  tiff: "tiff",
  gif: "gif",
  jxl: "jxl" as const,
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
  if (sharpFormat === "gif") {
    formatOptions.reuse = false;
  }

  return image.toFormat(sharpFormat, formatOptions);
}
