import type { Sharp, ConvertOptions, OutputFormat } from "../types.js";

const FORMAT_MAP: Record<OutputFormat, string> = {
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
