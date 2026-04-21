import sharp from "sharp";

const MAGIC_BYTES: Array<{ bytes: number[]; offset: number; format: string }> = [
  { bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0, format: "png" },
  { bytes: [0xff, 0xd8, 0xff], offset: 0, format: "jpeg" },
  { bytes: [0x47, 0x49, 0x46, 0x38], offset: 0, format: "gif" },
  { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0, format: "webp" }, // RIFF header (check WEBP after)
  { bytes: [0x49, 0x49, 0x2a, 0x00], offset: 0, format: "tiff" }, // Little-endian TIFF
  { bytes: [0x4d, 0x4d, 0x00, 0x2a], offset: 0, format: "tiff" }, // Big-endian TIFF
  { bytes: [0x42, 0x4d], offset: 0, format: "bmp" },
  // AVIF (ftyp box at offset 4, brand verified in detectByMagicBytes)
  { bytes: [0x66, 0x74, 0x79, 0x70], offset: 4, format: "avif" },
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
      // For ftyp, verify AVIF brand at bytes 8-11
      if (entry.format === "avif") {
        if (buffer.length < 12) continue;
        const brand = buffer.slice(8, 12).toString("ascii");
        if (brand !== "avif" && brand !== "avis") continue;
      }
      return entry.format;
    }
  }

  return "unknown";
}
