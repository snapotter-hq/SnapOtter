import type { SharpFormat } from "@snapotter/image-engine";
import sharp from "sharp";

export interface OutputFormat {
  format: SharpFormat;
  extension: string;
  contentType: string;
  /**
   * Undefined for PNG unless explicitly overridden: Sharp reads `quality` on
   * PNG as "quantise down to a palette", which dithers the image and often
   * inflates the file (issue #710). `toFormat(format, { quality: undefined })`
   * behaves exactly like passing no quality at all, so routes can spread this
   * without caring about the format.
   */
  quality?: number;
}

const FORMAT_MAP: Record<string, { format: SharpFormat; extension: string; contentType: string }> =
  {
    jpeg: { format: "jpeg", extension: "jpg", contentType: "image/jpeg" },
    png: { format: "png", extension: "png", contentType: "image/png" },
    webp: { format: "webp", extension: "webp", contentType: "image/webp" },
    gif: { format: "gif", extension: "gif", contentType: "image/gif" },
    tiff: { format: "tiff", extension: "tiff", contentType: "image/tiff" },
    avif: { format: "avif", extension: "avif", contentType: "image/avif" },
    heif: { format: "avif", extension: "avif", contentType: "image/avif" },
    jxl: { format: "jxl", extension: "jxl", contentType: "image/jxl" },
  };

const DEFAULT_QUALITY = 95;
const PNG_FALLBACK = FORMAT_MAP.png;

/** Formats that have no Sharp output encoder — fall back to PNG. */
const PNG_FALLBACK_FORMATS = new Set(["svg", "raw", "tga", "psd", "exr", "hdr"]);

/**
 * Detect the input image format and return matching output config.
 * Falls back to PNG for undetectable or unsupported output formats
 * (SVG, BMP, Camera RAW, TGA, PSD, EXR, HDR, ICO).
 */
export async function resolveOutputFormat(
  inputBuffer: Buffer,
  _filename: string,
  qualityOverride?: number,
): Promise<OutputFormat> {
  let detected: string | undefined;
  try {
    const meta = await sharp(inputBuffer).metadata();
    detected = meta.format;
  } catch {
    // format detection failed
  }

  // Force PNG fallback for formats without a Sharp output encoder
  if (detected && PNG_FALLBACK_FORMATS.has(detected)) {
    detected = undefined;
  }

  const mapped = detected ? FORMAT_MAP[detected] : undefined;
  const config = mapped ?? PNG_FALLBACK;
  // PNG stays lossless unless the caller explicitly asked for a quality;
  // every other encoder wants the default hint.
  const quality = qualityOverride ?? (config.format === "png" ? undefined : DEFAULT_QUALITY);

  return { ...config, quality };
}
