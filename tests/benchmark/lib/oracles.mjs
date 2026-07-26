/**
 * Semantic oracles for benchmark artifacts.
 *
 * `validateArtifact` in job-aware.mjs proves an artifact is a structurally
 * intact file of the declared type. That still lets a fast wrong answer pass:
 * a resize that ignores its width, a page extraction that returns the whole
 * document, a trim that returns the untrimmed audio are all valid PNG/PDF/WAV
 * bytes. These oracles read the property the operation was asked to change out
 * of the output itself, so a benchmark row can only be green when the work was
 * actually done.
 *
 * Everything here is pure and dependency-free (node:zlib only), so the oracles
 * run on the measuring host without needing ffprobe, qpdf or Sharp.
 */
import { inflateSync } from "node:zlib";

function ascii(bytes, start, end) {
  return bytes.subarray(start, end).toString("latin1");
}

/** PNG: the IHDR chunk always sits at byte 16 and is big-endian. */
function pngDimensions(bytes) {
  if (ascii(bytes, 12, 16) !== "IHDR") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * JPEG: walk the marker chain to the first SOFn frame header. SOF4 (0xC4),
 * SOF8 (0xC8) and SOF12 (0xCC) are DHT/JPG/DAC, not frame headers.
 */
function jpegDimensions(bytes) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    const isFrameHeader =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrameHeader) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    if (marker === 0xda) return null;
    offset += 2 + length;
  }
  return null;
}

/** GIF: logical screen descriptor, little-endian, immediately after the header. */
function gifDimensions(bytes) {
  return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
}

/** WebP: simple lossy (VP8), lossless (VP8L) and extended (VP8X) all differ. */
function webpDimensions(bytes) {
  const chunk = ascii(bytes, 12, 16);
  if (chunk === "VP8X") {
    return {
      width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
      height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)),
    };
  }
  if (chunk === "VP8 ") {
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

/** BMP: DIB header dimensions are signed (a negative height is top-down). */
function bmpDimensions(bytes) {
  return { width: bytes.readInt32LE(18), height: Math.abs(bytes.readInt32LE(22)) };
}

/**
 * Pixel dimensions of an encoded image, or null when the format is one this
 * module deliberately does not parse (AVIF, HEIC, TIFF, SVG).
 */
export function imageDimensions(input) {
  const bytes = Buffer.from(input);
  if (bytes.length < 32) return null;
  if (ascii(bytes, 1, 4) === "PNG") return pngDimensions(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegDimensions(bytes);
  if (ascii(bytes, 0, 3) === "GIF") return gifDimensions(bytes);
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return webpDimensions(bytes);
  if (ascii(bytes, 0, 2) === "BM") return bmpDimensions(bytes);
  return null;
}

const PAGE_OBJECT = /\/Type\s*\/Page(?![sA-Za-z])/g;

function countPageObjects(text) {
  return (text.match(PAGE_OBJECT) ?? []).length;
}

/**
 * Number of pages in a PDF.
 *
 * Classic PDFs keep page objects in the clear; anything written through a
 * cross-reference stream (qpdf and pdfcpu both do by default) hides them
 * inside FlateDecode object streams, so raw regex counting silently returns 0
 * there. Inflating every Flate stream first is what makes this oracle work on
 * real tool output rather than only on hand-built fixtures.
 */
export function pdfPageCount(input) {
  const bytes = Buffer.from(input);
  let pages = countPageObjects(bytes.toString("latin1"));

  const open = Buffer.from("stream", "latin1");
  const close = Buffer.from("endstream", "latin1");
  let cursor = 0;
  while (cursor < bytes.length) {
    const start = bytes.indexOf(open, cursor);
    if (start === -1) break;
    // "endstream" contains "stream"; matching it would desynchronise the scan.
    if (start >= 3 && ascii(bytes, start - 3, start) === "end") {
      cursor = start + open.length;
      continue;
    }
    let payload = start + open.length;
    if (bytes[payload] === 0x0d) payload += 1;
    if (bytes[payload] === 0x0a) payload += 1;
    const end = bytes.indexOf(close, payload);
    if (end === -1) break;
    cursor = end + close.length;
    try {
      pages += countPageObjects(inflateSync(bytes.subarray(payload, end)).toString("latin1"));
    } catch {
      // Not a Flate stream (JPEG image data, plain content). Skipping is
      // correct: those streams never carry page objects.
    }
  }
  return pages;
}

/** Duration in seconds of a RIFF/WAVE file, from its fmt and data chunks. */
export function wavDurationS(input) {
  const bytes = Buffer.from(input);
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 12) !== "WAVE") return null;
  let cursor = 12;
  let byteRate = 0;
  while (cursor + 8 <= bytes.length) {
    const id = ascii(bytes, cursor, cursor + 4);
    const size = bytes.readUInt32LE(cursor + 4);
    if (id === "fmt ") byteRate = bytes.readUInt32LE(cursor + 16);
    if (id === "data") return byteRate > 0 ? size / byteRate : null;
    cursor += 8 + size + (size % 2);
  }
  return null;
}

/**
 * Duration in seconds of an ISO base media file (MP4/MOV/M4A), from the mvhd
 * box. Version 1 mvhd uses 64-bit times; the low 32 bits are enough for any
 * duration a benchmark produces.
 */
export function isoDurationS(input) {
  const bytes = Buffer.from(input);
  const mvhd = bytes.indexOf(Buffer.from("mvhd", "latin1"));
  if (mvhd === -1) return null;
  const version = bytes[mvhd + 4];
  if (version === 1) {
    if (mvhd + 36 > bytes.length) return null;
    const timescale = bytes.readUInt32BE(mvhd + 24);
    const duration = Number(bytes.readBigUInt64BE(mvhd + 28));
    return timescale > 0 ? duration / timescale : null;
  }
  if (mvhd + 24 > bytes.length) return null;
  const timescale = bytes.readUInt32BE(mvhd + 16);
  const duration = bytes.readUInt32BE(mvhd + 20);
  return timescale > 0 ? duration / timescale : null;
}

/** Number of Matroska/WebM clusters, a cheap "this actually has content" probe. */
export function webmHasClusters(input) {
  return Buffer.from(input).includes(Buffer.from([0x1f, 0x43, 0xb6, 0x75]));
}

function fail(label, expected, actual) {
  throw new Error(`oracle ${label}: expected ${expected}, measured ${actual}`);
}

function assertClose(label, actual, expected, tolerance) {
  if (actual === null || !Number.isFinite(actual)) fail(label, expected, "unreadable");
  if (Math.abs(actual - expected) > tolerance) {
    fail(label, `${expected} +/- ${tolerance}`, actual.toFixed(3));
  }
}

/**
 * Apply a declarative oracle to artifact bytes. Every supported key names a
 * property the tool under benchmark was explicitly asked to produce.
 *
 *   { width: 800 }                image output is exactly 800 px wide
 *   { height: 600 }
 *   { pages: 3 }                  PDF has exactly 3 pages
 *   { durationS: 5, toleranceS: 0.4 }
 *   { minBytes: 1024 }
 *   { json: { key: "value" } }    JSON output contains these fields
 *   { textIncludes: "hello" }
 */
export function assertOracle(input, oracle) {
  if (!oracle) return;
  const bytes = Buffer.from(input);

  if (oracle.width !== undefined || oracle.height !== undefined) {
    const dimensions = imageDimensions(bytes);
    if (!dimensions) fail("dimensions", "a parseable raster header", "unreadable");
    if (oracle.width !== undefined && dimensions.width !== oracle.width) {
      fail("width", oracle.width, dimensions.width);
    }
    if (oracle.height !== undefined && dimensions.height !== oracle.height) {
      fail("height", oracle.height, dimensions.height);
    }
  }

  if (oracle.pages !== undefined) {
    const pages = pdfPageCount(bytes);
    if (pages !== oracle.pages) fail("pages", oracle.pages, pages);
  }

  if (oracle.durationS !== undefined) {
    const tolerance = oracle.toleranceS ?? 0.5;
    const duration = wavDurationS(bytes) ?? isoDurationS(bytes);
    assertClose("durationS", duration, oracle.durationS, tolerance);
  }

  if (oracle.minBytes !== undefined && bytes.length < oracle.minBytes) {
    fail("minBytes", `>= ${oracle.minBytes}`, bytes.length);
  }

  if (oracle.maxBytes !== undefined && bytes.length > oracle.maxBytes) {
    fail("maxBytes", `<= ${oracle.maxBytes}`, bytes.length);
  }

  if (oracle.json !== undefined) {
    let payload;
    try {
      payload = JSON.parse(bytes.toString("utf8"));
    } catch {
      fail("json", "parseable JSON", "unparseable");
    }
    for (const [key, expected] of Object.entries(oracle.json)) {
      const actual = key.split(".").reduce((node, part) => node?.[part], payload);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        fail(`json.${key}`, JSON.stringify(expected), JSON.stringify(actual));
      }
    }
  }

  if (oracle.textIncludes !== undefined) {
    const text = bytes.toString("utf8");
    if (!text.includes(oracle.textIncludes)) {
      fail("textIncludes", JSON.stringify(oracle.textIncludes), "absent");
    }
  }
}
