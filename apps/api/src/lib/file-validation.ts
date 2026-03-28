import sharp from "sharp";
import { env } from "../config.js";

/** Formats we accept as input. */
const SUPPORTED_INPUT_FORMATS = new Set(["jpeg", "png", "webp", "gif", "tiff", "bmp", "avif"]);

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

/**
 * Validate an uploaded image buffer.
 *
 * Checks:
 * 1. Buffer is not empty
 * 2. Magic bytes match a known image format
 * 3. Format is in the supported input formats list
 * 4. Image dimensions do not exceed MAX_MEGAPIXELS
 */
export async function validateImageBuffer(
  buffer: Buffer,
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

  // 2. Magic byte detection
  const detectedFormat = detectMagicBytes(buffer);
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
  try {
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    const megapixels = (width * height) / 1_000_000;

    if (megapixels > env.MAX_MEGAPIXELS) {
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
      return entry.format;
    }
  }

  return null;
}
