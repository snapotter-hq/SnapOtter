import { createGunzip } from "node:zlib";
import { extToMime, formatToMime } from "@snapotter/image-engine";
import { CAMERA_RAW_INPUTS } from "@snapotter/shared";
import sharp from "sharp";
import { env } from "../config.js";
import { isSvgBuffer, SVG_SNIFF_BYTES } from "./svg-sanitize.js";

/** Formats we accept as input. */
export const SUPPORTED_INPUT_FORMATS: ReadonlySet<string> = new Set([
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
  /**
   * A second check on the header, for a signature text can open with: it is
   * printable ASCII (ORF's "IIRO", BMP's "BM", Netpbm's "P3"), so the bytes
   * after it must also hold a structure only the real format has (#1782,
   * #1859). A buffer that fails is not that format.
   */
  check?: (buffer: Buffer) => boolean;
}

const MAGIC_BYTES: MagicEntry[] = [
  { bytes: [0xff, 0xd8, 0xff], offset: 0, format: "jpeg" },
  { bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0, format: "png" },
  { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0, format: "webp" }, // RIFF; verified below
  { bytes: [0x47, 0x49, 0x46], offset: 0, format: "gif" },
  { bytes: [0x42, 0x4d], offset: 0, format: "bmp", check: hasBmpDibHeader },
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
  { bytes: [0x46, 0x4f, 0x56, 0x62], offset: 0, format: "raw", check: hasX3fVersion },
  // Minolta MRW: "\x00MRM" at offset 0
  { bytes: [0x00, 0x4d, 0x52, 0x4d], offset: 0, format: "raw" },
  // Olympus ORF: a TIFF with its own magic, "IIRO" on most bodies, "IIRS" on
  // some compacts, "MMOR" on the big-endian E-10 and E-20
  { bytes: [0x49, 0x49, 0x52, 0x4f], offset: 0, format: "raw", check: hasTiffIfd },
  { bytes: [0x49, 0x49, 0x52, 0x53], offset: 0, format: "raw", check: hasTiffIfd },
  { bytes: [0x4d, 0x4d, 0x4f, 0x52], offset: 0, format: "raw", check: hasTiffIfd },
  // Panasonic RW2 and RAW, Leica RWL: "IIU\x00"
  { bytes: [0x49, 0x49, 0x55, 0x00], offset: 0, format: "raw", check: hasTiffIfd },
  // JXL ISOBMFF container
  { bytes: [0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20], offset: 0, format: "jxl" },
  // JXL raw codestream
  { bytes: [0xff, 0x0a], offset: 0, format: "jxl" },
  // ICO
  { bytes: [0x00, 0x00, 0x01, 0x00], offset: 0, format: "ico" },
  // PSD ("8BPS")
  { bytes: [0x38, 0x42, 0x50, 0x53], offset: 0, format: "psd", check: hasPsdHeader },
  // OpenEXR
  { bytes: [0x76, 0x2f, 0x31, 0x01], offset: 0, format: "exr" },
  // TGA has no magic bytes: isTgaBuffer() checks its header for a .tga name
  // JPEG 2000 JP2 box signature (NOT ISOBMFF)
  {
    bytes: [0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a, 0x87, 0x0a],
    offset: 0,
    format: "jp2",
  },
  // JPEG 2000 raw codestream (J2K/J2C)
  { bytes: [0xff, 0x4f, 0xff, 0x51], offset: 0, format: "jp2" },
  // QOI: "qoif" at offset 0
  { bytes: [0x71, 0x6f, 0x69, 0x66], offset: 0, format: "qoi", check: hasQoiHeader },
  // DDS: "DDS " at offset 0
  { bytes: [0x44, 0x44, 0x53, 0x20], offset: 0, format: "dds", check: hasDdsHeader },
  // CUR: Windows cursor (ICO variant, byte 3 = 0x02 vs ICO's 0x01)
  { bytes: [0x00, 0x00, 0x02, 0x00], offset: 0, format: "cur" },
  // DPX forward: "SDPX"
  { bytes: [0x53, 0x44, 0x50, 0x58], offset: 0, format: "dpx", check: hasDpxImageOffset },
  // DPX reverse: "XPDS"
  { bytes: [0x58, 0x50, 0x44, 0x53], offset: 0, format: "dpx", check: hasDpxImageOffset },
  // Cineon
  { bytes: [0x80, 0x2a, 0x5f, 0xd7], offset: 0, format: "dpx" },
  // FITS: "SIMPLE" at offset 0
  {
    bytes: [0x53, 0x49, 0x4d, 0x50, 0x4c, 0x45],
    offset: 0,
    format: "fits",
    check: hasFitsSimpleCard,
  },
  // EPS ASCII header: "%!PS-Adobe"
  {
    bytes: [0x25, 0x21, 0x50, 0x53, 0x2d, 0x41, 0x64, 0x6f, 0x62, 0x65],
    offset: 0,
    format: "eps",
  },
  // EPS binary (DOS EPS)
  { bytes: [0xc5, 0xd0, 0xd3, 0xc6], offset: 0, format: "eps" },
  // Netpbm: P1-P7 headers (these MUST go AFTER the PNG entry to avoid false matches on 0x50)
  { bytes: [0x50, 0x31], offset: 0, format: "pbm", check: hasNetpbmDimensions },
  { bytes: [0x50, 0x34], offset: 0, format: "pbm", check: hasNetpbmDimensions },
  { bytes: [0x50, 0x32], offset: 0, format: "pgm", check: hasNetpbmDimensions },
  { bytes: [0x50, 0x35], offset: 0, format: "pgm", check: hasNetpbmDimensions },
  { bytes: [0x50, 0x33], offset: 0, format: "ppm", check: hasNetpbmDimensions },
  { bytes: [0x50, 0x36], offset: 0, format: "ppm", check: hasNetpbmDimensions },
  // PAM spells its header out as KEYWORD value lines
  { bytes: [0x50, 0x37], offset: 0, format: "ppm", check: hasPamWidth },
  // PFM (Portable FloatMap): not CLI-decoded, so Sharp's decode below vets it
  { bytes: [0x50, 0x46], offset: 0, format: "pfm" },
  { bytes: [0x50, 0x66], offset: 0, format: "pfm" },
];

export interface ValidationResult {
  valid: true;
  format: string;
  width: number;
  height: number;
  /**
   * True when the format came from the filename alone, with nothing in the
   * bytes to back it and no decode: a .tga whose header and pixel data don't
   * hold together, a camera RAW extension on bytes with no signature the table
   * knows, and a gzip stream named .svgz that doesn't inflate to an SVG. Such
   * a result is accepted for processing, where the decoder has the final say,
   * but it is no evidence the bytes are an image.
   */
  nameOnly?: true;
}

export interface ValidationError {
  valid: false;
  reason: string;
}

/** Camera RAW extensions that share TIFF magic bytes. */
const RAW_EXTENSIONS = new Set(CAMERA_RAW_INPUTS.map((ext) => ext.slice(1)));

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
  "heif",
]);

/**
 * Check whether a file extension corresponds to a Camera RAW format.
 */
export function isRawExtension(ext: string): boolean {
  return RAW_EXTENSIONS.has(ext.toLowerCase().replace(/^\./, ""));
}

/**
 * The image/* type to store for bytes validateImageBuffer() accepted, from the
 * format it found in them (#1550), or null when it found the format in the
 * filename alone (`nameOnly`): a type must never be vouched for by a name
 * (#1349), so the caller treats those bytes as unverified.
 *
 * The file library offers a file to image tools by the image/ prefix, so every
 * SUPPORTED_INPUT_FORMATS member must land on one; a format image-engine's
 * table doesn't know falls back to application/octet-stream, and the unit
 * test over that set catches it.
 *
 * The validator folds every camera RAW into "raw" and HEIC into "heif", so for
 * those the extension picks the specific type, but only an extension of the
 * family the bytes proved: HEIF bytes named photo.png stay image/heif.
 *
 * @param validation - What validateImageBuffer() returned for the bytes
 * @param filename - The name the bytes were validated under
 */
export function validatedImageMime(validation: ValidationResult, filename?: string): string | null {
  if (validation.nameOnly) return null;
  const { format } = validation;
  const ext = filename?.includes(".") ? (filename.split(".").pop()?.toLowerCase() ?? "") : "";
  if (format === "raw") {
    const rawMime = isRawExtension(ext) ? extToMime(ext) : "";
    return rawMime.startsWith("image/") ? rawMime : "image/x-dcraw";
  }
  if (format === "heif") return ext === "heic" ? "image/heic" : "image/heif";
  // EPS's registered type is application/postscript, which the library's image
  // filter would hide. image/x-eps is the freedesktop.org name for EPS.
  if (format === "eps") return "image/x-eps";
  return formatToMime(format);
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
 *   format detection (Camera RAW, TGA, SVGZ)
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

  // TGA has no magic bytes, and an uncompressed true-colour header starts
  // like CUR's signature, so the .tga name picks the reading. A .tga is
  // accepted either way; only a header that holds together counts as proof.
  let nameOnly = false;
  if (ext === "tga") {
    detectedFormat = "tga";
    nameOnly = !isTgaBuffer(buffer);
  }

  // SVGZ: gzip-compressed SVG, detected by extension + gzip magic, proven by
  // inflating just enough to find the <svg> root. Return early because Sharp
  // cannot read compressed SVGZ directly; decompression happens later in the
  // route pipeline.
  if (!detectedFormat && ext === "svgz") {
    if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
      return isSvgBuffer(await gunzipHead(buffer, SVG_SNIFF_BYTES))
        ? { valid: true, format: "svg", width: 0, height: 0 }
        : { valid: true, format: "svg", width: 0, height: 0, nameOnly: true };
    }
  }

  // APNG: Sharp handles as PNG first frame. Accept .apng extension.
  if (!detectedFormat && ext === "apng") {
    detectedFormat = "png";
  }

  // A RAW extension on bytes with no signature MAGIC_BYTES knows. Accepted for
  // the decoder to try, but on the name alone.
  if (!detectedFormat && ext && isRawExtension(ext)) {
    detectedFormat = "raw";
    nameOnly = true;
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
    return nameOnly
      ? { valid: true, format: detectedFormat, width: 0, height: 0, nameOnly: true }
      : { valid: true, format: detectedFormat, width: 0, height: 0 };
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
      if (entry.check && !entry.check(buffer)) continue;
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
/** Most entries a first IFD may claim before the claim is taken as noise. */
const TIFF_MAX_IFD_ENTRIES = 1000;

/**
 * Whether a TIFF-style header (byte order from bytes 0-1) points at a first
 * IFD that fits in the buffer: an offset past the 8-byte header, and an entry
 * count of 1 to TIFF_MAX_IFD_ENTRIES whose 12-byte entries all fit. Text that
 * happens to open with "IIRO" or "MMOR" fails it, since ASCII in the offset
 * and count fields reads as numbers far too large.
 */
function hasTiffIfd(buffer: Buffer): boolean {
  if (buffer.length < 8) return false;
  const littleEndian = buffer[0] === 0x49;
  const ifd = littleEndian ? buffer.readUInt32LE(4) : buffer.readUInt32BE(4);
  if (ifd < 8 || ifd + 2 > buffer.length) return false;
  const entries = littleEndian ? buffer.readUInt16LE(ifd) : buffer.readUInt16BE(ifd);
  return entries >= 1 && entries <= TIFF_MAX_IFD_ENTRIES && ifd + 2 + entries * 12 <= buffer.length;
}

/**
 * Whether "BM" opens a BMP: the DIB header size at byte 14 is 12 (OS/2 1.x)
 * or 16 to 124, which spans OS/2 2.x (16 to 64, it may be cut short anywhere
 * in that range) and Windows BITMAPINFOHEADER through BITMAPV5HEADER (40 to
 * 124). Text there reads as a size in the hundreds of millions.
 */
function hasBmpDibHeader(buffer: Buffer): boolean {
  if (buffer.length < 18) return false;
  const size = buffer.readUInt32LE(14);
  return size === 12 || (size >= 16 && size <= 124);
}

/** How far into a Netpbm or PAM file its header is looked for. */
const NETPBM_HEADER_SCAN_BYTES = 64 * 1024;

const isAsciiDigit = (byte: number | undefined): boolean =>
  byte !== undefined && byte >= 0x30 && byte <= 0x39;

/** Netpbm's whitespace: tab, LF, VT, FF, CR and space. */
const isNetpbmSpace = (byte: number | undefined): boolean =>
  byte === 0x20 || (byte !== undefined && byte >= 0x09 && byte <= 0x0d);

/**
 * Whether a P1-P6 magic is followed by a width and a height: unsigned decimal
 * numbers, each after a separator of whitespace and "#" comments (a comment
 * runs to the end of its line). "P3 meeting agenda" fails on the letters. The
 * scan stops NETPBM_HEADER_SCAN_BYTES in, far past any real header.
 */
function hasNetpbmDimensions(buffer: Buffer): boolean {
  const end = Math.min(buffer.length, NETPBM_HEADER_SCAN_BYTES);
  let i = 2;
  for (let field = 0; field < 2; field++) {
    const separatorStart = i;
    while (i < end) {
      if (isNetpbmSpace(buffer[i])) {
        i++;
      } else if (buffer[i] === 0x23) {
        while (i < end && buffer[i] !== 0x0a && buffer[i] !== 0x0d) i++;
      } else {
        break;
      }
    }
    if (i === separatorStart || i >= end || !isAsciiDigit(buffer[i])) return false;
    while (i < end && isAsciiDigit(buffer[i])) i++;
  }
  return true;
}

/**
 * Whether a P7 magic opens a PAM header: a WIDTH line with a number on it
 * before ENDHDR. PAM names its fields on KEYWORD value lines, so P1-P6's bare
 * dimensions don't apply. Only the first NETPBM_HEADER_SCAN_BYTES are read.
 */
function hasPamWidth(buffer: Buffer): boolean {
  const head = buffer.toString("latin1", 0, Math.min(buffer.length, NETPBM_HEADER_SCAN_BYTES));
  const endHdr = head.indexOf("\nENDHDR");
  const header = endHdr === -1 ? head : head.slice(0, endHdr);
  return /\n[ \t]*WIDTH[ \t]+\d/.test(header);
}

/**
 * Whether "SIMPLE" opens a FITS primary header: its first 80-byte card reads
 * SIMPLE, padded to eight columns, then "= " and the logical value T, which
 * ends at a space, a "/" comment or the end of the card. The standard puts
 * the T in column 30; a free-format card is taken too.
 */
function hasFitsSimpleCard(buffer: Buffer): boolean {
  if (buffer.length < 11 || buffer.toString("latin1", 0, 10) !== "SIMPLE  = ") return false;
  const value = buffer.toString("latin1", 10, Math.min(buffer.length, 80)).trimStart();
  return /^T(?:[ /]|$)/.test(value);
}

/** The DPX generic file header, the least the image data can sit past. */
const DPX_GENERIC_HEADER_BYTES = 768;

/**
 * Whether "SDPX" or "XPDS" opens a DPX: the image data offset at byte 4, in
 * the byte order the signature names, lands past the generic file header and
 * inside the buffer. Text there reads as an offset of 538MB or more. The
 * version string isn't checked: writers disagree on it and ImageMagick
 * decodes files whatever it says.
 */
function hasDpxImageOffset(buffer: Buffer): boolean {
  if (buffer.length < 8) return false;
  const offset = buffer[0] === 0x53 ? buffer.readUInt32BE(4) : buffer.readUInt32LE(4);
  return offset >= DPX_GENERIC_HEADER_BYTES && offset <= buffer.length;
}

/** Whether "DDS " opens a DirectDraw Surface: its header size field says 124. */
function hasDdsHeader(buffer: Buffer): boolean {
  return buffer.length >= 8 && buffer.readUInt32LE(4) === 124;
}

/**
 * Whether "qoif" opens a QOI: a non-zero width and height, 3 or 4 channels,
 * and colourspace 0 (sRGB with linear alpha) or 1 (all linear).
 */
function hasQoiHeader(buffer: Buffer): boolean {
  if (buffer.length < 14) return false;
  return (
    buffer.readUInt32BE(4) > 0 &&
    buffer.readUInt32BE(8) > 0 &&
    (buffer[12] === 3 || buffer[12] === 4) &&
    (buffer[13] === 0 || buffer[13] === 1)
  );
}

/**
 * Whether "8BPS" opens a Photoshop file: the big-endian version after it is 1
 * (PSD) or 2 (PSB). Either way its first byte is a NUL, which text never has.
 */
function hasPsdHeader(buffer: Buffer): boolean {
  if (buffer.length < 6) return false;
  const version = buffer.readUInt16BE(4);
  return version === 1 || version === 2;
}

/**
 * Whether "FOVb" opens a Sigma X3F: a little-endian version word follows,
 * minor version in its low half and major in its high half (2.x on the SD9
 * through the Merrills, 3.0 and 4.x on the Quattros). Text in those four
 * bytes reads as versions in the thousands.
 */
function hasX3fVersion(buffer: Buffer): boolean {
  if (buffer.length < 8) return false;
  const minor = buffer.readUInt16LE(4);
  const major = buffer.readUInt16LE(6);
  return major >= 1 && major <= 15 && minor <= 0xff;
}

const TGA_HEADER_BYTES = 18;

/** Legal pixel depths per TGA image type, by the type's low three bits. */
const TGA_PIXEL_DEPTHS: Readonly<Record<number, readonly number[]>> = {
  1: [8, 16], // colour-mapped (indices)
  2: [15, 16, 24, 32], // true-colour
  3: [8, 16], // grayscale
};
const TGA_IMAGE_TYPES = new Set([1, 2, 3, 9, 10, 11]); // +8 is the RLE variant
const TGA_COLOR_MAP_DEPTHS = new Set([15, 16, 24, 32]);
/**
 * Most RLE packets isTgaBuffer() walks, a few milliseconds of work. A packet
 * carries up to 128 pixels, so a real encoder stays under this past 500MP.
 */
export const TGA_MAX_RLE_PACKETS = 4 * 1024 * 1024;

/**
 * Whether the bytes are a TGA: every header field holds a value the format
 * allows, and the pixel data that follows fills width x height (walking the
 * packets of an RLE image). TGA has no magic number, so that structure is
 * the only evidence there is; text and other binaries fail it in the first
 * few bytes.
 *
 * The TGA 2.0 footer ("TRUEVISION-XFILE.") isn't consulted. It is optional,
 * so most writers (ImageMagick among them) leave it off and requiring it
 * would leave real files untyped, and on its own it is 18 bytes anyone can
 * append to anything. A file that carries one passes or fails on its header
 * like any other: the footer sits after the pixel data, which only has to
 * fit, not end the file.
 */
function isTgaBuffer(buffer: Buffer): boolean {
  if (buffer.length < TGA_HEADER_BYTES) return false;
  const idLength = buffer[0];
  const colorMapType = buffer[1];
  const imageType = buffer[2];
  const colorMapLength = buffer.readUInt16LE(5);
  const colorMapDepth = buffer[7];
  const width = buffer.readUInt16LE(12);
  const height = buffer.readUInt16LE(14);
  const pixelDepth = buffer[16];
  const descriptor = buffer[17];

  if (!TGA_IMAGE_TYPES.has(imageType)) return false;
  const isColorMapped = (imageType & 0b111) === 1;
  if (colorMapType > 1 || (isColorMapped && colorMapType !== 1)) return false;
  if (colorMapType === 1 && (colorMapLength === 0 || !TGA_COLOR_MAP_DEPTHS.has(colorMapDepth))) {
    return false;
  }
  if (width === 0 || height === 0) return false;
  if (!TGA_PIXEL_DEPTHS[imageType & 0b111].includes(pixelDepth)) return false;
  // Bits 6-7 of the image descriptor are reserved and must be zero.
  if (descriptor & 0b1100_0000) return false;

  const colorMapBytes = colorMapType === 1 ? colorMapLength * Math.ceil(colorMapDepth / 8) : 0;
  const dataStart = TGA_HEADER_BYTES + idLength + colorMapBytes;
  const bytesPerPixel = Math.ceil(pixelDepth / 8);
  const pixels = width * height;

  if (imageType < 8) return buffer.length >= dataStart + pixels * bytesPerPixel;

  // RLE: each packet is a header byte (high bit set: one pixel repeated; clear:
  // that many literal pixels) and its pixel bytes. The walk runs on the event
  // loop, so it stops at TGA_MAX_RLE_PACKETS rather than at the end of the
  // buffer: a crafted file of one-pixel packets would otherwise hold the loop
  // for its whole length. A file past the budget isn't proven, so it stays
  // name-only and still reaches the decoder.
  let offset = dataStart;
  let remaining = pixels;
  for (let packets = 0; remaining > 0; packets++) {
    if (offset >= buffer.length || packets >= TGA_MAX_RLE_PACKETS) return false;
    const packet = buffer[offset];
    const count = (packet & 0x7f) + 1;
    offset += 1 + (packet & 0x80 ? bytesPerPixel : count * bytesPerPixel);
    remaining -= count;
  }
  return offset <= buffer.length;
}

/**
 * Inflate the start of a gzip stream, at most `limit` bytes of it, and stop.
 * Inflating the whole thing to look at its first few KB is what a
 * decompression bomb counts on; this never holds more than `limit` plus one
 * zlib output chunk.
 *
 * A stream cut short yields what inflated before it ran out. A corrupt one
 * yields at most that, and often nothing: zlib can report the fault before it
 * hands over any output, as it does for a bad checksum on a small file (the
 * same input decompressSvgz() rejects). That isn't an error to report: the
 * caller only wants to know whether the bytes prove a format, and too little
 * output just means they don't.
 */
function gunzipHead(buffer: Buffer, limit: number): Promise<Buffer> {
  return new Promise((resolve) => {
    const gunzip = createGunzip();
    const chunks: Buffer[] = [];
    let inflated = 0;
    const finish = () => {
      gunzip.destroy();
      resolve(Buffer.concat(chunks, Math.min(inflated, limit)));
    };
    gunzip.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      inflated += chunk.length;
      if (inflated >= limit) finish();
    });
    gunzip.on("end", finish);
    gunzip.on("error", finish);
    gunzip.end(buffer);
  });
}
