import sharp from "sharp";
import { env } from "../config.js";
import { isSvgBuffer } from "./svg-sanitize.js";

/** Formats we accept as input. */
const SUPPORTED_INPUT_FORMATS = new Set([
  "jpeg",
  "png",
  "webp",
  "gif",
  "tiff",
  "bmp",
  "avif",
  "heif",
  "svg",
  "jxl",
  "ico",
  "raw",
  "tga",
  "psd",
  "exr",
  "hdr",
  "jp2",
  "qoi",
  "eps",
  "dds",
  "cur",
  "dpx",
  "fits",
  "ppm",
  "pgm",
  "pbm",
  "pfm",
]);

interface MagicEntry {
  bytes: number[];
  offset: number;
  format: string;
}

const MAGIC_BYTES: MagicEntry[] = [
  { bytes: [0xff, 0xd8, 0xff], offset: 0, format: "jpeg" },
  { bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0, format: "png" },
  { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0, format: "webp" }, // RIFF; verified below
  { bytes: [0x47, 0x49, 0x46], offset: 0, format: "gif" },
  { bytes: [0x42, 0x4d], offset: 0, format: "bmp" },
  { bytes: [0x49, 0x49, 0x2a, 0x00], offset: 0, format: "tiff" },
  { bytes: [0x4d, 0x4d, 0x00, 0x2a], offset: 0, format: "tiff" },
  { bytes: [0x66, 0x74, 0x79, 0x70], offset: 4, format: "avif" }, // ftyp box; verified below
  { bytes: [0x66, 0x74, 0x79, 0x70], offset: 4, format: "heif" }, // ftyp box; verified below
  { bytes: [0x66, 0x74, 0x79, 0x70], offset: 4, format: "cr3" }, // ftyp box; verified below
  // Fujifilm RAF: "FUJIFILMCCD-RAW" at offset 0
  {
    bytes: [
      0x46, 0x55, 0x4a, 0x49, 0x46, 0x49, 0x4c, 0x4d, 0x43, 0x43, 0x44, 0x2d, 0x52, 0x41, 0x57,
    ],
    offset: 0,
    format: "raw",
  },
  // Sigma X3F: "FOVb" at offset 0
  { bytes: [0x46, 0x4f, 0x56, 0x62], offset: 0, format: "raw" },
  // Minolta MRW: "\x00MRM" at offset 0
  { bytes: [0x00, 0x4d, 0x52, 0x4d], offset: 0, format: "raw" },
  // JXL ISOBMFF container
  { bytes: [0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20], offset: 0, format: "jxl" },
  // JXL raw codestream
  { bytes: [0xff, 0x0a], offset: 0, format: "jxl" },
  // ICO
  { bytes: [0x00, 0x00, 0x01, 0x00], offset: 0, format: "ico" },
  // PSD ("8BPS")
  { bytes: [0x38, 0x42, 0x50, 0x53], offset: 0, format: "psd" },
  // OpenEXR
  { bytes: [0x76, 0x2f, 0x31, 0x01], offset: 0, format: "exr" },
  // TGA has no reliable magic bytes — detected by extension only
  // JPEG 2000 JP2 box signature (NOT ISOBMFF)
  {
    bytes: [0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a, 0x87, 0x0a],
    offset: 0,
    format: "jp2",
  },
  // JPEG 2000 raw codestream (J2K/J2C)
  { bytes: [0xff, 0x4f, 0xff, 0x51], offset: 0, format: "jp2" },
  // QOI: "qoif" at offset 0
  { bytes: [0x71, 0x6f, 0x69, 0x66], offset: 0, format: "qoi" },
  // DDS: "DDS " at offset 0
  { bytes: [0x44, 0x44, 0x53, 0x20], offset: 0, format: "dds" },
  // CUR: Windows cursor (ICO variant, byte 3 = 0x02 vs ICO's 0x01)
  { bytes: [0x00, 0x00, 0x02, 0x00], offset: 0, format: "cur" },
  // DPX forward: "SDPX"
  { bytes: [0x53, 0x44, 0x50, 0x58], offset: 0, format: "dpx" },
  // DPX reverse: "XPDS"
  { bytes: [0x58, 0x50, 0x44, 0x53], offset: 0, format: "dpx" },
  // Cineon
  { bytes: [0x80, 0x2a, 0x5f, 0xd7], offset: 0, format: "dpx" },
  // FITS: "SIMPLE" at offset 0
  { bytes: [0x53, 0x49, 0x4d, 0x50, 0x4c, 0x45], offset: 0, format: "fits" },
  // EPS ASCII header: "%!PS-Adobe"
  {
    bytes: [0x25, 0x21, 0x50, 0x53, 0x2d, 0x41, 0x64, 0x6f, 0x62, 0x65],
    offset: 0,
    format: "eps",
  },
  // EPS binary (DOS EPS)
  { bytes: [0xc5, 0xd0, 0xd3, 0xc6], offset: 0, format: "eps" },
  // Netpbm: P1-P7 headers (these MUST go AFTER the PNG entry to avoid false matches on 0x50)
  { bytes: [0x50, 0x31], offset: 0, format: "pbm" },
  { bytes: [0x50, 0x34], offset: 0, format: "pbm" },
  { bytes: [0x50, 0x32], offset: 0, format: "pgm" },
  { bytes: [0x50, 0x35], offset: 0, format: "pgm" },
  { bytes: [0x50, 0x33], offset: 0, format: "ppm" },
  { bytes: [0x50, 0x36], offset: 0, format: "ppm" },
  { bytes: [0x50, 0x37], offset: 0, format: "ppm" },
  // PFM (Portable FloatMap)
  { bytes: [0x50, 0x46], offset: 0, format: "pfm" },
  { bytes: [0x50, 0x66], offset: 0, format: "pfm" },
];

export interface ValidationResult {
  valid: true;
  format: string;
  width: number;
  height: number;
}

export interface ValidationError {
  valid: false;
  reason: string;
}

/** Camera RAW extensions that share TIFF magic bytes. */
const RAW_EXTENSIONS = new Set([
  "dng",
  "cr2",
  "cr3",
  "nef",
  "nrw",
  "arw",
  "orf",
  "rw2",
  "raf",
  "pef",
  "3fr",
  "iiq",
  "srw",
  "x3f",
  "rwl",
  "gpr",
  "fff",
  "mrw",
  "mef",
  "kdc",
  "dcr",
  "erf",
  "ptx",
]);

/** Formats that Sharp cannot decode natively — skip dimension check. */
const CLI_DECODED_FORMATS = new Set([
  "raw",
  "ico",
  "tga",
  "psd",
  "exr",
  "hdr",
  "bmp",
  "jxl",
  "jp2",
  "qoi",
  "eps",
  "dds",
  "cur",
  "dpx",
  "fits",
  "ppm",
  "pgm",
  "pbm",
]);

/**
 * Check whether a file extension corresponds to a Camera RAW format.
 */
export function isRawExtension(ext: string): boolean {
  return RAW_EXTENSIONS.has(ext.toLowerCase().replace(/^\./, ""));
}

/**
 * Validate an uploaded image buffer.
 *
 * Checks:
 * 1. Buffer is not empty
 * 2. Magic bytes match a known image format
 * 3. Format is in the supported input formats list
 * 4. Image dimensions do not exceed MAX_MEGAPIXELS
 *
 * @param buffer - The image file buffer
 * @param filename - Optional original filename, used for extension-based
 *   format detection (Camera RAW, TGA)
 */
export async function validateImageBuffer(
  buffer: Buffer,
  filename?: string,
): Promise<ValidationResult | ValidationError> {
  // 1. Empty / null-byte check
  if (!buffer || buffer.length === 0) {
    return { valid: false, reason: "File is empty" };
  }

  // Reject buffers that are entirely null bytes — they are not valid images
  // and would pass the length check but crash Sharp.
  if (isNullByteBuffer(buffer)) {
    return { valid: false, reason: "File contains no image data" };
  }

  // Extract extension from filename for extension-based detection
  const ext = filename ? (filename.split(".").pop()?.toLowerCase() ?? "") : "";

  // 2. Format detection (magic bytes for raster, text check for SVG, text check for HDR)
  let detectedFormat =
    detectMagicBytes(buffer) || (isSvgBuffer(buffer) ? "svg" : null) || detectHdrText(buffer);

  // RAW formats share TIFF magic bytes — differentiate by extension
  if (detectedFormat === "tiff" && ext && isRawExtension(ext)) {
    detectedFormat = "raw";
  }

  // TGA has no magic bytes and its header can match other formats (e.g. CUR)
  if (ext === "tga") {
    detectedFormat = "tga";
  }

  // SVGZ: gzip-compressed SVG, detected by extension + gzip magic.
  // Return early because Sharp cannot read compressed SVGZ directly;
  // decompression happens later in the route pipeline.
  if (!detectedFormat && ext === "svgz") {
    if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
      return { valid: true, format: "svg", width: 0, height: 0 };
    }
  }

  // APNG: Sharp handles as PNG first frame. Accept .apng extension.
  if (!detectedFormat && ext === "apng") {
    detectedFormat = "png";
  }

  // RAW formats with non-TIFF magic bytes (Panasonic RW2, some Olympus ORF,
  // Pentax PEF, etc.) are not caught by MAGIC_BYTES.  Fall back to
  // extension-based detection for known Camera RAW extensions.
  if (!detectedFormat && ext && isRawExtension(ext)) {
    detectedFormat = "raw";
  }

  if (!detectedFormat) {
    return { valid: false, reason: "Unrecognized image format" };
  }

  // 3. Supported format check
  if (!SUPPORTED_INPUT_FORMATS.has(detectedFormat)) {
    return {
      valid: false,
      reason: `Unsupported format: ${detectedFormat}`,
    };
  }

  // 4. Dimensions check via sharp metadata
  // For formats Sharp can't decode natively, skip the dimension check.
  // The actual decoding happens later in the tool pipeline.
  if (CLI_DECODED_FORMATS.has(detectedFormat)) {
    return { valid: true, format: detectedFormat, width: 0, height: 0 };
  }

  try {
    const sharpOpts = detectedFormat === "svg" ? { density: 72 } : undefined;
    const metadata = await sharp(buffer, sharpOpts).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    const megapixels = (width * height) / 1_000_000;

    if (env.MAX_MEGAPIXELS > 0 && megapixels > env.MAX_MEGAPIXELS) {
      return {
        valid: false,
        reason: `Image exceeds maximum size: ${megapixels.toFixed(1)}MP (limit: ${env.MAX_MEGAPIXELS}MP)`,
      };
    }

    return { valid: true, format: detectedFormat, width, height };
  } catch {
    return { valid: false, reason: "Failed to read image metadata" };
  }
}

/**
 * Fast check whether a buffer is entirely null bytes.
 * Samples the first 64 bytes + a few random positions to avoid
 * a full scan on large buffers.
 */
function isNullByteBuffer(buffer: Buffer): boolean {
  // Check the first 64 bytes (covers all magic byte positions)
  const checkLen = Math.min(buffer.length, 64);
  for (let i = 0; i < checkLen; i++) {
    if (buffer[i] !== 0) return false;
  }
  // For larger buffers, spot-check a few additional positions
  if (buffer.length > 64) {
    const positions = [
      Math.floor(buffer.length / 4),
      Math.floor(buffer.length / 2),
      Math.floor((buffer.length * 3) / 4),
      buffer.length - 1,
    ];
    for (const pos of positions) {
      if (buffer[pos] !== 0) return false;
    }
  }
  return true;
}

function detectMagicBytes(buffer: Buffer): string | null {
  for (const entry of MAGIC_BYTES) {
    if (buffer.length < entry.offset + entry.bytes.length) continue;

    let match = true;
    for (let i = 0; i < entry.bytes.length; i++) {
      if (buffer[entry.offset + i] !== entry.bytes[i]) {
        match = false;
        break;
      }
    }

    if (match) {
      // For RIFF, verify WEBP signature at bytes 8-11
      if (entry.format === "webp") {
        if (buffer.length < 12) continue;
        const sig = buffer.slice(8, 12).toString("ascii");
        if (sig !== "WEBP") continue;
      }
      // For ftyp, verify AVIF brand at bytes 8-11
      if (entry.format === "avif") {
        if (buffer.length < 12) continue;
        const brand = buffer.slice(8, 12).toString("ascii");
        if (brand !== "avif" && brand !== "avis") continue;
      }
      // For ftyp, verify HEIF/HEIC brand at bytes 8-11.
      // Covers HEVC still (heic/heix), HEVC sequence (hevc/hevx),
      // generic HEIF still/sequence (mif1/msf1), and multi-layer profiles.
      if (entry.format === "heif") {
        if (buffer.length < 12) continue;
        const brand = buffer.slice(8, 12).toString("ascii");
        if (!["heic", "heix", "mif1", "msf1", "hevc", "hevx"].includes(brand)) continue;
      }
      // For ftyp, verify CR3 brand at bytes 8-11.
      if (entry.format === "cr3") {
        if (buffer.length < 12) continue;
        const brand = buffer.slice(8, 12).toString("ascii");
        if (brand !== "crx ") continue;
        return "raw"; // CR3 is a RAW format, routed through decodeRaw()
      }
      return entry.format;
    }
  }

  return null;
}

/**
 * Detect Radiance HDR format by text header.
 * HDR files start with "#?RADIANCE" or "#?RGBE".
 */
function detectHdrText(buffer: Buffer): string | null {
  if (buffer.length < 10) return null;
  const header = buffer.slice(0, 11).toString("ascii");
  if (header.startsWith("#?RADIANCE") || header.startsWith("#?RGBE")) {
    return "hdr";
  }
  return null;
}
