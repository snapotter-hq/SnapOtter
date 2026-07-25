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
  // CR3 (Canon ISOBMFF RAW) - ftyp box at offset 4
  { bytes: [0x66, 0x74, 0x79, 0x70], offset: 4, format: "cr3" },
  // Fujifilm RAF: "FUJIFILMCCD-RAW" at offset 0
  {
    bytes: [
      0x46, 0x55, 0x4a, 0x49, 0x46, 0x49, 0x4c, 0x4d, 0x43, 0x43, 0x44, 0x2d, 0x52, 0x41, 0x57,
    ],
    offset: 0,
    format: "raf",
  },
  // Sigma X3F: "FOVb" at offset 0
  { bytes: [0x46, 0x4f, 0x56, 0x62], offset: 0, format: "x3f" },
  // Minolta MRW: "\x00MRM" at offset 0
  { bytes: [0x00, 0x4d, 0x52, 0x4d], offset: 0, format: "mrw" },
  // JP2 box signature
  {
    bytes: [0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a, 0x87, 0x0a],
    offset: 0,
    format: "jp2",
  },
  // J2K raw codestream
  { bytes: [0xff, 0x4f, 0xff, 0x51], offset: 0, format: "jp2" },
  // QOI
  { bytes: [0x71, 0x6f, 0x69, 0x66], offset: 0, format: "qoi" },
  // DDS
  { bytes: [0x44, 0x44, 0x53, 0x20], offset: 0, format: "dds" },
  // CUR
  { bytes: [0x00, 0x00, 0x02, 0x00], offset: 0, format: "cur" },
  // DPX forward
  { bytes: [0x53, 0x44, 0x50, 0x58], offset: 0, format: "dpx" },
  // DPX reverse
  { bytes: [0x58, 0x50, 0x44, 0x53], offset: 0, format: "dpx" },
  // Cineon
  { bytes: [0x80, 0x2a, 0x5f, 0xd7], offset: 0, format: "cin" },
  // FITS
  { bytes: [0x53, 0x49, 0x4d, 0x50, 0x4c, 0x45], offset: 0, format: "fits" },
  // EPS ASCII
  {
    bytes: [0x25, 0x21, 0x50, 0x53, 0x2d, 0x41, 0x64, 0x6f, 0x62, 0x65],
    offset: 0,
    format: "eps",
  },
  // EPS binary (DOS)
  { bytes: [0xc5, 0xd0, 0xd3, 0xc6], offset: 0, format: "eps" },
  // PPM (P3/P6)
  { bytes: [0x50, 0x33], offset: 0, format: "ppm" },
  { bytes: [0x50, 0x36], offset: 0, format: "ppm" },
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
      if (entry.format === "webp") {
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
      // For ftyp, verify CR3 brand at bytes 8-11
      if (entry.format === "cr3") {
        if (buffer.length < 12) continue;
        const brand = buffer.slice(8, 12).toString("ascii");
        if (brand !== "crx ") continue;
      }
      return entry.format;
    }
  }

  return "unknown";
}
