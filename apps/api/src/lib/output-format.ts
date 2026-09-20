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
  /**
   * The whole option bag for `toFormat()`, so a route never has to know which
   * encoder it is about to drive: `.toFormat(f.format, f.encoderOptions)`.
   *
   * It carries `quality` plus, for GIF, `reuse: false`. Sharp's GIF writer
   * defaults to reusing the palette libvips read the input with, so a tool that
   * introduces a colour the source never held cannot express it: a green border
   * on a GIF came back as 76,105,113, with a 200 and no warning (issue #1190).
   *
   * A fresh palette is not free, and the cost falls on the tools that needed it
   * least. Reuse hands an unchanged photographic animation back byte for byte,
   * where regenerating moved a channel by up to 36 on animated-simpsons.gif and
   * added 5% to the file, for about a fifth more encode time. That is the price
   * of not deciding per tool whether its settings can introduce a colour, which
   * is a judgement that goes stale: `border` looks like a pure frame until
   * someone sets a colour, and it is wrong for exactly the settings a user
   * would pick.
   *
   * Every other encoder ignores keys it does not know, which is what lets one
   * bag serve them all.
   */
  encoderOptions: EncoderOptions;
}

export interface EncoderOptions {
  quality?: number;
  reuse?: false;
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

  return outputFormatFor(config.format, quality);
}

/**
 * Describe one output format, without asking what the input was.
 *
 * For the handful of routes that pick their format themselves rather than from
 * the input: a transparent background forcing PNG, say. Going through here
 * keeps them on the GIF palette rule (issue #1190) and keeps `quality` and
 * `encoderOptions.quality` from being written out twice by hand and drifting
 * apart, which is what the literals it replaced did.
 */
export function outputFormatFor(format: SharpFormat, quality?: number): OutputFormat {
  const config = FORMAT_MAP[format] ?? PNG_FALLBACK;
  return {
    ...config,
    format,
    quality,
    encoderOptions: format === "gif" ? { quality, reuse: false } : { quality },
  };
}
