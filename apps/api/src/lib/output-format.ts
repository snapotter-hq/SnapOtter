import sharp from "sharp";

export interface OutputFormat {
  format: keyof sharp.FormatEnum;
  extension: string;
  contentType: string;
  quality: number;
}

const FORMAT_MAP: Record<
  string,
  { format: keyof sharp.FormatEnum; extension: string; contentType: string }
> = {
  jpeg: { format: "jpeg", extension: "jpg", contentType: "image/jpeg" },
  png: { format: "png", extension: "png", contentType: "image/png" },
  webp: { format: "webp", extension: "webp", contentType: "image/webp" },
  gif: { format: "gif", extension: "gif", contentType: "image/gif" },
  tiff: { format: "tiff", extension: "tiff", contentType: "image/tiff" },
  avif: { format: "avif", extension: "avif", contentType: "image/avif" },
  heif: { format: "avif", extension: "avif", contentType: "image/avif" },
};

const DEFAULT_QUALITY = 95;
const PNG_FALLBACK = FORMAT_MAP.png;

/**
 * Detect the input image format and return matching output config.
 * Falls back to PNG for undetectable or unsupported output formats
 * (SVG, BMP, raw camera formats like CR2/NEF).
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

  const mapped = detected ? FORMAT_MAP[detected] : undefined;
  const config = mapped ?? PNG_FALLBACK;
  const quality = qualityOverride ?? DEFAULT_QUALITY;

  return { ...config, quality };
}
