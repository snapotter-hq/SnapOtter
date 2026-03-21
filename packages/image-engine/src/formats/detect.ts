import sharp from "sharp";

const MAGIC_BYTES: Array<{ bytes: number[]; offset: number; format: string }> = [
  { bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0, format: "png" },
  { bytes: [0xff, 0xd8, 0xff], offset: 0, format: "jpeg" },
  { bytes: [0x47, 0x49, 0x46, 0x38], offset: 0, format: "gif" },
  { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0, format: "webp" }, // RIFF header (check WEBP after)
  { bytes: [0x49, 0x49, 0x2a, 0x00], offset: 0, format: "tiff" }, // Little-endian TIFF
  { bytes: [0x4d, 0x4d, 0x00, 0x2a], offset: 0, format: "tiff" }, // Big-endian TIFF
  { bytes: [0x42, 0x4d], offset: 0, format: "bmp" },
];

/**
 * Detect the image format from a buffer.
 * Uses Sharp metadata first, falls back to magic byte detection.
 */
export async function detectFormat(buffer: Buffer): Promise<string> {
  try {
    const metadata = await sharp(buffer).metadata();
    if (metadata.format) {
      return metadata.format;
    }
  } catch {
    // Sharp couldn't parse it; fall through to magic bytes
  }

  return detectByMagicBytes(buffer);
}

function detectByMagicBytes(buffer: Buffer): string {
  for (const entry of MAGIC_BYTES) {
    if (buffer.length < entry.offset + entry.bytes.length) {
      continue;
    }

    let match = true;
    for (let i = 0; i < entry.bytes.length; i++) {
      if (buffer[entry.offset + i] !== entry.bytes[i]) {
        match = false;
        break;
      }
    }

    if (match) {
      // For RIFF, verify it's actually WEBP
      if (entry.format === "webp" && buffer.length >= 12) {
        const webpSignature = buffer.slice(8, 12).toString("ascii");
        if (webpSignature !== "WEBP") {
          continue;
        }
      }
      return entry.format;
    }
  }

  return "unknown";
}
