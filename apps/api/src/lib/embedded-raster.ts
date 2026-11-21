import { readGifCanvasSize } from "./gif-limits.js";

export type EmbeddedRasterType = "png" | "jpeg" | "gif" | "webp";

interface Size {
  width: number;
  height: number;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readPngSize(bytes: Buffer): Size | null {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (bytes.toString("latin1", 12, 16) !== "IHDR") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** SOFn markers carry the frame size; C4 (DHT), C8 (JPG) and CC (DAC) don't. */
function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function readJpegSize(bytes: Buffer): Size | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let pos = 2;
  while (pos + 4 <= bytes.length) {
    if (bytes[pos] !== 0xff) return null;
    const marker = bytes[pos + 1] ?? 0;
    // Fill bytes, and markers that stand alone with no length field.
    if (marker === 0xff) {
      pos += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 2;
      continue;
    }
    // Entropy-coded data follows SOS, so a frame header has to come first.
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = bytes.readUInt16BE(pos + 2);
    if (length < 2) return null;
    if (isStartOfFrame(marker)) {
      if (pos + 9 > bytes.length) return null;
      return { width: bytes.readUInt16BE(pos + 7), height: bytes.readUInt16BE(pos + 5) };
    }
    pos += 2 + length;
  }
  return null;
}

function readWebpSize(bytes: Buffer): Size | null {
  if (bytes.length < 30) return null;
  if (bytes.toString("latin1", 0, 4) !== "RIFF" || bytes.toString("latin1", 8, 12) !== "WEBP") {
    return null;
  }
  const chunk = bytes.toString("latin1", 12, 16);
  if (chunk === "VP8X") {
    return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
  }
  if (chunk === "VP8 ") {
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    if (bytes[20] !== 0x2f) return null;
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

/**
 * The pixel size a decoder will allocate for an embedded raster, read from
 * its header, or null when the bytes are not the declared format. Checking
 * the magic number matters as much as the size: a decoder that sniffs content
 * would otherwise load an SVG or another format behind a `data:image/png` label.
 */
export function readEmbeddedRasterSize(type: EmbeddedRasterType, bytes: Buffer): Size | null {
  switch (type) {
    case "png":
      return readPngSize(bytes);
    case "jpeg":
      return readJpegSize(bytes);
    case "gif":
      return bytes.toString("latin1", 0, 6).match(/^GIF8[79]a$/) ? readGifCanvasSize(bytes) : null;
    case "webp":
      return readWebpSize(bytes);
  }
}
