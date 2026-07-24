import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { isRawExtension, validateImageBuffer } from "../../../apps/api/src/lib/file-validation.js";

// These tests target the magic-byte / structural validation boundary in
// file-validation.ts. The strategy is the one that kills mutants in a
// magic-byte detector: for each format the validator recognizes, build a
// buffer with the EXACT signature and assert the precise verdict; flip one
// signature byte and assert rejection (kills `===` / offset mutants); and
// truncate below each length guard and assert rejection (kills `< N` mutants).
// Assertions check the exact returned format string / reason, never mere
// truthiness, so surviving mutants that swap a constant are caught.

/**
 * Build a fixed-length buffer whose leading bytes are `bytes`. The remainder
 * is left as 0x00 padding, which is harmless for magic-byte detection because
 * the null-byte guard only fires when the WHOLE sampled window is zero.
 */
function withLeadingBytes(bytes: number[], totalLength = 64): Buffer {
  const buf = Buffer.alloc(totalLength);
  Buffer.from(bytes).copy(buf, 0);
  return buf;
}

/**
 * Build an ISOBMFF-style buffer: "ftyp" at offset 4, `brand` (4 ASCII chars)
 * at offset 8. Used for the avif / heif / cr3 major-brand verification arms.
 */
function withFtypBrand(brand: string, totalLength = 64): Buffer {
  const buf = Buffer.alloc(totalLength);
  buf.write("ftyp", 4, "ascii");
  buf.write(brand, 8, "ascii");
  return buf;
}

/** Assert a successful validation with the exact format and dimensions. */
function expectValid(
  result: Awaited<ReturnType<typeof validateImageBuffer>>,
  format: string,
  width: number,
  height: number,
): void {
  expect(result).toEqual({ valid: true, format, width, height });
}

/** Assert a rejection carrying the exact reason string. */
function expectRejected(
  result: Awaited<ReturnType<typeof validateImageBuffer>>,
  reason: string,
): void {
  expect(result).toEqual({ valid: false, reason });
}

// --------------------------------------------------------------------------
// isRawExtension
// --------------------------------------------------------------------------

describe("isRawExtension", () => {
  it("recognizes a bare RAW extension", () => {
    expect(isRawExtension("dng")).toBe(true);
  });

  it("recognizes a dotted RAW extension", () => {
    expect(isRawExtension(".nef")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isRawExtension("CR2")).toBe(true);
    expect(isRawExtension(".ARW")).toBe(true);
  });

  it("rejects a non-RAW extension", () => {
    expect(isRawExtension("jpg")).toBe(false);
    expect(isRawExtension("png")).toBe(false);
  });

  it("rejects the empty string", () => {
    expect(isRawExtension("")).toBe(false);
  });

  it("covers the full RAW extension set", () => {
    const raw = [
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
    ];
    for (const ext of raw) {
      expect(isRawExtension(ext)).toBe(true);
    }
  });
});

// --------------------------------------------------------------------------
// Empty / null-byte guards (validateImageBuffer L205-213, isNullByteBuffer)
// --------------------------------------------------------------------------

describe("validateImageBuffer - empty and null-byte guards", () => {
  it("rejects a zero-length buffer with the exact reason", async () => {
    expectRejected(await validateImageBuffer(Buffer.alloc(0)), "File is empty");
  });

  it("rejects an all-null small buffer (within the 64-byte window)", async () => {
    expectRejected(await validateImageBuffer(Buffer.alloc(32)), "File contains no image data");
  });

  it("rejects an all-null buffer exactly at the 64-byte window", async () => {
    expectRejected(await validateImageBuffer(Buffer.alloc(64)), "File contains no image data");
  });

  it("rejects an all-null large buffer via the spot-check positions", async () => {
    expectRejected(await validateImageBuffer(Buffer.alloc(4096)), "File contains no image data");
  });

  it("does NOT treat a buffer with a non-zero byte in the first window as null", async () => {
    // A non-zero byte at index 3 breaks the leading-window scan, so the buffer
    // is not classified as all-null; it then fails magic detection instead.
    const buf = Buffer.alloc(64);
    buf[3] = 0x42;
    expectRejected(await validateImageBuffer(buf), "Unrecognized image format");
  });

  it("does NOT treat a large buffer with a non-zero spot-check byte as null", async () => {
    // All zero within the first 64 bytes, but a non-zero byte at the exact
    // midpoint spot-check position: the null-byte guard must return false so we
    // fall through to (failed) magic detection, not the null-data rejection.
    const buf = Buffer.alloc(4096);
    buf[Math.floor(buf.length / 2)] = 0x99;
    expectRejected(await validateImageBuffer(buf), "Unrecognized image format");
  });

  it("does NOT treat a large buffer with a non-zero final byte as null", async () => {
    const buf = Buffer.alloc(4096);
    buf[buf.length - 1] = 0x01;
    expectRejected(await validateImageBuffer(buf), "Unrecognized image format");
  });
});

// --------------------------------------------------------------------------
// Offset-0 magic bytes: exact-signature ACCEPT + flip-byte / truncate REJECT
// These formats are all in CLI_DECODED_FORMATS or return before sharp, so the
// verdict is deterministic { valid, format, 0, 0 } without any real decode.
// --------------------------------------------------------------------------

describe("validateImageBuffer - CLI-decoded magic bytes (exact / flip / truncate)", () => {
  // Each row: [label, signature bytes, expected format]
  const cases: Array<[string, number[], string]> = [
    ["bmp", [0x42, 0x4d], "bmp"],
    ["tiff II", [0x49, 0x49, 0x2a, 0x00], "tiff"], // tiff is NOT CLI-decoded; asserted separately
    ["ico", [0x00, 0x00, 0x01, 0x00], "ico"],
    ["psd 8BPS", [0x38, 0x42, 0x50, 0x53], "psd"],
    ["exr", [0x76, 0x2f, 0x31, 0x01], "exr"],
    ["jxl codestream", [0xff, 0x0a], "jxl"],
    ["jxl container", [0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20], "jxl"],
    ["jp2 box", [0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a, 0x87, 0x0a], "jp2"],
    ["jp2 codestream", [0xff, 0x4f, 0xff, 0x51], "jp2"],
    ["qoi", [0x71, 0x6f, 0x69, 0x66], "qoi"],
    ["dds", [0x44, 0x44, 0x53, 0x20], "dds"],
    ["cur", [0x00, 0x00, 0x02, 0x00], "cur"],
    ["dpx SDPX", [0x53, 0x44, 0x50, 0x58], "dpx"],
    ["dpx XPDS", [0x58, 0x50, 0x44, 0x53], "dpx"],
    ["dpx cineon", [0x80, 0x2a, 0x5f, 0xd7], "dpx"],
    ["fits SIMPLE", [0x53, 0x49, 0x4d, 0x50, 0x4c, 0x45], "fits"],
    ["eps ascii", [0x25, 0x21, 0x50, 0x53, 0x2d, 0x41, 0x64, 0x6f, 0x62, 0x65], "eps"],
    ["eps binary", [0xc5, 0xd0, 0xd3, 0xc6], "eps"],
    ["pbm P1", [0x50, 0x31], "pbm"],
    ["pbm P4", [0x50, 0x34], "pbm"],
    ["pgm P2", [0x50, 0x32], "pgm"],
    ["pgm P5", [0x50, 0x35], "pgm"],
    ["ppm P3", [0x50, 0x33], "ppm"],
    ["ppm P6", [0x50, 0x36], "ppm"],
    ["ppm P7", [0x50, 0x37], "ppm"],
  ];

  const cliDecoded = new Set([
    "bmp",
    "ico",
    "psd",
    "exr",
    "jxl",
    "jp2",
    "qoi",
    "dds",
    "cur",
    "dpx",
    "fits",
    "eps",
    "pbm",
    "pgm",
    "ppm",
  ]);

  for (const [label, bytes, format] of cases) {
    if (!cliDecoded.has(format)) continue;

    it(`accepts an exact ${label} signature as ${format}`, async () => {
      expectValid(await validateImageBuffer(withLeadingBytes(bytes)), format, 0, 0);
    });

    it(`rejects ${label} with a flipped first signature byte`, async () => {
      const flipped = [...bytes];
      flipped[0] = (flipped[0] ^ 0xff) & 0xff;
      const result = await validateImageBuffer(withLeadingBytes(flipped));
      expect(result.valid).toBe(false);
    });

    it(`rejects ${label} with a flipped last signature byte`, async () => {
      const flipped = [...bytes];
      const last = flipped.length - 1;
      flipped[last] = (flipped[last] ^ 0xff) & 0xff;
      const result = await validateImageBuffer(withLeadingBytes(flipped));
      expect(result.valid).toBe(false);
    });

    if (bytes.length >= 2) {
      it(`rejects ${label} truncated below its signature length`, async () => {
        // A buffer shorter than the signature must skip this magic entry.
        const truncated = withLeadingBytes(bytes.slice(0, bytes.length - 1), bytes.length - 1);
        const result = await validateImageBuffer(truncated);
        expect(result.valid).toBe(false);
      });
    }
  }
});

// --------------------------------------------------------------------------
// PFM: offset-0 magic but NOT CLI-decoded (goes through sharp -> metadata
// failure on synthetic input). Assert the reject reason from the catch arm.
// --------------------------------------------------------------------------

describe("validateImageBuffer - PFM magic detection", () => {
  it("detects the PFM color header 'PF' but fails synthetic sharp decode", async () => {
    // "PF" is recognized as pfm; pfm is not in CLI_DECODED_FORMATS, so it goes
    // to sharp, which cannot decode this stub -> exact metadata-failure reason.
    expectRejected(
      await validateImageBuffer(withLeadingBytes([0x50, 0x46])),
      "Failed to read image metadata",
    );
  });

  it("detects the PFM grayscale header 'Pf' but fails synthetic sharp decode", async () => {
    expectRejected(
      await validateImageBuffer(withLeadingBytes([0x50, 0x66])),
      "Failed to read image metadata",
    );
  });
});

// --------------------------------------------------------------------------
// TIFF: offset-0 magic, NOT CLI-decoded -> sharp path. Both endiannesses, plus
// the RAW-by-extension override (L223) on both sides of the extension test.
// --------------------------------------------------------------------------

describe("validateImageBuffer - TIFF and RAW-by-extension override", () => {
  it("accepts a little-endian TIFF signature (II*\\0) via sharp metadata", async () => {
    const png = await sharp({
      create: { width: 5, height: 4, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .tiff()
      .toBuffer();
    expectValid(await validateImageBuffer(png), "tiff", 5, 4);
  });

  it("rejects a TIFF little-endian magic with a flipped byte", async () => {
    const result = await validateImageBuffer(withLeadingBytes([0x49, 0x49, 0x2b, 0x00]));
    expect(result.valid).toBe(false);
  });

  it("reclassifies TIFF magic as raw when the extension is a RAW extension", async () => {
    // TIFF magic + .dng extension -> detectedFormat becomes "raw", which is
    // CLI-decoded, so it returns {valid, raw, 0, 0} WITHOUT a sharp decode.
    expectValid(
      await validateImageBuffer(withLeadingBytes([0x49, 0x49, 0x2a, 0x00]), "photo.dng"),
      "raw",
      0,
      0,
    );
  });

  it("keeps TIFF as tiff when the extension is NOT a RAW extension", async () => {
    // .txt is not a raw ext, so the override does not fire; still tiff, which
    // goes to sharp and fails to decode this stub.
    expectRejected(
      await validateImageBuffer(withLeadingBytes([0x49, 0x49, 0x2a, 0x00]), "photo.txt"),
      "Failed to read image metadata",
    );
  });

  it("keeps TIFF as tiff when there is no extension at all", async () => {
    expectRejected(
      await validateImageBuffer(withLeadingBytes([0x49, 0x49, 0x2a, 0x00]), "noext"),
      "Failed to read image metadata",
    );
  });

  it("does NOT reclassify a non-TIFF format even with a RAW extension present", async () => {
    // BMP magic + .dng: the L223 guard requires detectedFormat === "tiff", so a
    // BMP stays bmp (CLI-decoded) rather than becoming raw.
    expectValid(
      await validateImageBuffer(withLeadingBytes([0x42, 0x4d]), "weird.dng"),
      "bmp",
      0,
      0,
    );
  });
});

// --------------------------------------------------------------------------
// WEBP: RIFF prefix + "WEBP" verification at bytes 8-11 (L332-335).
// --------------------------------------------------------------------------

describe("validateImageBuffer - WEBP RIFF verification", () => {
  function riff(sig: string, totalLength = 64): Buffer {
    const buf = Buffer.alloc(totalLength);
    Buffer.from([0x52, 0x49, 0x46, 0x46]).copy(buf, 0);
    buf.write(sig, 8, "ascii");
    return buf;
  }

  it("accepts a real WEBP via sharp metadata", async () => {
    const webp = await sharp({
      create: { width: 7, height: 6, channels: 3, background: { r: 9, g: 9, b: 9 } },
    })
      .webp()
      .toBuffer();
    expectValid(await validateImageBuffer(webp), "webp", 7, 6);
  });

  it("rejects RIFF with a wrong WEBP signature at bytes 8-11", async () => {
    // RIFF prefix matches but the "WEBP" check fails -> `continue` -> falls to
    // the unknown path.
    expectRejected(await validateImageBuffer(riff("XEBP")), "Unrecognized image format");
  });

  it("rejects RIFF with a non-WEBP fourcc (e.g. WAVE audio)", async () => {
    expectRejected(await validateImageBuffer(riff("WAVE")), "Unrecognized image format");
  });

  it("rejects a RIFF buffer shorter than 12 bytes (WEBP length guard)", async () => {
    const buf = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expectRejected(await validateImageBuffer(buf), "Unrecognized image format");
  });

  it("rejects a RIFF prefix with a flipped byte before the WEBP check even runs", async () => {
    const result = await validateImageBuffer(riff("WEBP").fill(0x00, 0, 1));
    // First byte 0x00 breaks the RIFF magic -> not detected as webp at all.
    expect(result.valid).toBe(false);
  });
});

// --------------------------------------------------------------------------
// ISOBMFF ftyp brand verification: avif (L339-341), heif (L346-349),
// cr3->raw (L352-356), and the offset-4 length guard (L320).
// --------------------------------------------------------------------------

describe("validateImageBuffer - ftyp brand verification", () => {
  it("accepts the avif brand and returns a real decode when sharp supports AVIF", async () => {
    // Try a real AVIF; if this sharp build lacks the AVIF encoder, fall back to
    // asserting the synthetic ftyp+avif buffer at least detects as avif and
    // then fails the (impossible) synthetic decode. Either way avif is proven.
    let encoded: Buffer | null = null;
    try {
      encoded = await sharp({
        create: { width: 8, height: 8, channels: 3, background: { r: 5, g: 6, b: 7 } },
      })
        .avif()
        .toBuffer();
    } catch {
      encoded = null;
    }

    if (encoded) {
      const result = await validateImageBuffer(encoded);
      expect(result).toMatchObject({ valid: true, format: "avif" });
    } else {
      // Synthetic ftyp+avif: detected as avif, not CLI-decoded, sharp fails.
      expectRejected(
        await validateImageBuffer(withFtypBrand("avif")),
        "Failed to read image metadata",
      );
    }
  });

  it("accepts the avis (avif sequence) brand", async () => {
    // avis is a valid avif brand; on a synthetic buffer it reaches sharp and
    // fails to decode, proving the brand passed the L341 check.
    expectRejected(
      await validateImageBuffer(withFtypBrand("avis")),
      "Failed to read image metadata",
    );
  });

  it("rejects an ftyp buffer whose brand is neither avif nor a heif/cr3 brand", async () => {
    // "zzzz" fails every ftyp brand arm -> no format detected -> unknown.
    expectRejected(await validateImageBuffer(withFtypBrand("zzzz")), "Unrecognized image format");
  });

  it("rejects an ftyp buffer shorter than 12 bytes (brand length guard)", async () => {
    // ftyp present at offset 4 (needs len >= 8) but < 12, so no brand can be
    // read: every brand arm hits `continue` -> unknown.
    const buf = Buffer.alloc(11);
    buf.write("ftyp", 4, "ascii");
    expectRejected(await validateImageBuffer(buf), "Unrecognized image format");
  });

  it("rejects a buffer too short to even contain ftyp at offset 4", async () => {
    // Length 7 < offset(4)+len(4)=8, so the ftyp entries are skipped entirely.
    const buf = Buffer.alloc(7);
    buf.write("fty", 4, "ascii");
    expectRejected(await validateImageBuffer(buf), "Unrecognized image format");
  });

  // Uses a synthetic buffer, not a real fixture, because sharp's metadata()
  // reads HEIF dimensions from the box-level `ispe` data and succeeds on real
  // HEVC-coded fixtures regardless of codec support (only pixel decode needs
  // it). A real fixture here would pass even without the fix below.
  const heifBrands = ["heic", "heix", "mif1", "msf1", "hevc", "hevx"];
  for (const brand of heifBrands) {
    it(`accepts the heif brand "${brand}" and returns early without a sharp decode`, async () => {
      // Each brand must pass the L349 includes() check; heif is CLI-decoded
      // (real HEVC decode happens later via decodeHeic()), so this must return
      // valid immediately, the same as the CR3->raw arm below.
      expectValid(await validateImageBuffer(withFtypBrand(brand)), "heif", 0, 0);
    });
  }

  it('rejects an ftyp buffer with brand "heiz" (one byte off a heif brand)', async () => {
    // "heiz" is not in the heif brand list and not avif/crx -> unknown.
    expectRejected(await validateImageBuffer(withFtypBrand("heiz")), "Unrecognized image format");
  });

  it("maps the CR3 brand 'crx ' to raw and returns early without decoding", async () => {
    // The cr3 arm returns "raw" directly; raw is CLI-decoded -> {valid,raw,0,0}.
    expectValid(await validateImageBuffer(withFtypBrand("crx ")), "raw", 0, 0);
  });

  it("rejects a CR3-like brand with a trailing non-space (crx0)", async () => {
    // "crx0" != "crx " so the cr3 arm's `continue` fires; no other brand
    // matches -> unknown.
    expectRejected(await validateImageBuffer(withFtypBrand("crx0")), "Unrecognized image format");
  });
});

// --------------------------------------------------------------------------
// GIF / JPEG / PNG: offset-0 magic that go through sharp with real fixtures.
// --------------------------------------------------------------------------

describe("validateImageBuffer - sharp-decoded raster formats", () => {
  let png: Buffer;
  let jpeg: Buffer;
  let gif: Buffer;

  beforeAll(async () => {
    png = await sharp({
      create: { width: 12, height: 9, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();
    jpeg = await sharp({
      create: { width: 16, height: 11, channels: 3, background: { r: 40, g: 50, b: 60 } },
    })
      .jpeg()
      .toBuffer();
    gif = await sharp({
      create: { width: 14, height: 8, channels: 3, background: { r: 7, g: 8, b: 9 } },
    })
      .gif()
      .toBuffer();
  });

  it("accepts a real PNG and returns its exact dimensions", async () => {
    expectValid(await validateImageBuffer(png), "png", 12, 9);
  });

  it("accepts a real JPEG and returns its exact dimensions", async () => {
    expectValid(await validateImageBuffer(jpeg), "jpeg", 16, 11);
  });

  it("accepts a real GIF and returns its exact dimensions", async () => {
    expectValid(await validateImageBuffer(gif), "gif", 14, 8);
  });

  it("rejects a JPEG magic with a flipped third byte", async () => {
    // 0xFF 0xD8 0x00 is not a JPEG SOI marker.
    const result = await validateImageBuffer(withLeadingBytes([0xff, 0xd8, 0x00]));
    expect(result.valid).toBe(false);
  });

  it("rejects a PNG magic with a flipped byte", async () => {
    const result = await validateImageBuffer(withLeadingBytes([0x89, 0x50, 0x4e, 0x00]));
    expect(result.valid).toBe(false);
  });

  it("rejects a GIF magic with a flipped byte", async () => {
    const result = await validateImageBuffer(withLeadingBytes([0x47, 0x49, 0x00]));
    expect(result.valid).toBe(false);
  });

  it("returns the metadata-failure reason for a JPEG magic with a garbage body", async () => {
    // Valid SOI marker but no decodable image data -> sharp throws -> catch.
    expectRejected(
      await validateImageBuffer(withLeadingBytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])),
      "Failed to read image metadata",
    );
  });
});

// --------------------------------------------------------------------------
// SVG detection (isSvgBuffer path) + SVG-specific sharp density branch (L273).
// --------------------------------------------------------------------------

describe("validateImageBuffer - SVG detection", () => {
  it("accepts a plain <svg> document and returns its dimensions", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"></svg>',
    );
    expectValid(await validateImageBuffer(svg), "svg", 20, 10);
  });

  it("accepts an XML-prologue SVG document", async () => {
    const svg = Buffer.from(
      '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15"></svg>',
    );
    expectValid(await validateImageBuffer(svg), "svg", 15, 15);
  });

  it("does not detect a plain text buffer as SVG", async () => {
    expectRejected(
      await validateImageBuffer(Buffer.from("just some text, no markup")),
      "Unrecognized image format",
    );
  });
});

// --------------------------------------------------------------------------
// HDR text header (detectHdrText L369-375) with its length guard.
// --------------------------------------------------------------------------

describe("validateImageBuffer - Radiance HDR text header", () => {
  it("accepts a #?RADIANCE header as hdr (CLI-decoded, no sharp)", async () => {
    const buf = Buffer.alloc(64);
    buf.write("#?RADIANCE\n", 0, "ascii");
    expectValid(await validateImageBuffer(buf, "scene.hdr"), "hdr", 0, 0);
  });

  it("accepts a #?RGBE header as hdr", async () => {
    const buf = Buffer.alloc(64);
    buf.write("#?RGBE\n", 0, "ascii");
    expectValid(await validateImageBuffer(buf), "hdr", 0, 0);
  });

  it("rejects a near-miss header (#?RADIANC without the trailing E)", async () => {
    const buf = Buffer.alloc(64);
    buf.write("#?RADIANC \n", 0, "ascii");
    expectRejected(await validateImageBuffer(buf), "Unrecognized image format");
  });

  it("rejects an HDR-like header in a buffer shorter than 10 bytes (length guard)", async () => {
    // detectHdrText returns null for buffers < 10 bytes, so "#?RGBE" (6 chars)
    // in a 9-byte buffer is not detected. It also is not any magic-byte format.
    const buf = Buffer.from("#?RGBE\n\x00\x00");
    expect(buf.length).toBeLessThan(10);
    expectRejected(await validateImageBuffer(buf), "Unrecognized image format");
  });
});

// --------------------------------------------------------------------------
// Extension-driven paths that do not depend on magic bytes:
// SVGZ (L235-238), APNG (L242-244), RAW-by-extension fallback (L249-250),
// TGA override (L228-230), and the ext-extraction edge cases (L216).
// --------------------------------------------------------------------------

describe("validateImageBuffer - extension-driven detection", () => {
  it("accepts a gzip-magic .svgz file as svg with zero dimensions", async () => {
    // gzip magic 0x1f 0x8b + .svgz extension returns early as svg (0x0).
    const buf = Buffer.alloc(32);
    buf[0] = 0x1f;
    buf[1] = 0x8b;
    expectValid(await validateImageBuffer(buf, "icon.svgz"), "svg", 0, 0);
  });

  it("rejects a .svgz file whose first gzip byte is wrong", async () => {
    const buf = Buffer.alloc(32);
    buf[0] = 0x1e; // not 0x1f
    buf[1] = 0x8b;
    // No magic, .svgz branch's inner check fails, no other ext branch matches.
    expectRejected(await validateImageBuffer(buf, "icon.svgz"), "Unrecognized image format");
  });

  it("rejects a .svgz file whose second gzip byte is wrong", async () => {
    const buf = Buffer.alloc(32);
    buf[0] = 0x1f;
    buf[1] = 0x8c; // not 0x8b
    expectRejected(await validateImageBuffer(buf, "icon.svgz"), "Unrecognized image format");
  });

  it("rejects a .svgz file shorter than 2 bytes (svgz length guard)", async () => {
    const buf = Buffer.from([0x1f]);
    expectRejected(await validateImageBuffer(buf, "icon.svgz"), "Unrecognized image format");
  });

  it("does NOT take the svgz branch when a magic byte already matched", async () => {
    // BMP magic + .svgz extension: detectedFormat is already "bmp" (truthy), so
    // the `!detectedFormat && ext === 'svgz'` guard is skipped and it stays bmp.
    expectValid(
      await validateImageBuffer(withLeadingBytes([0x42, 0x4d]), "tricky.svgz"),
      "bmp",
      0,
      0,
    );
  });

  it("accepts an .apng file with no magic as png (goes through sharp)", async () => {
    // No magic + .apng -> detectedFormat = "png". png is not CLI-decoded, so a
    // synthetic no-magic buffer fails the sharp decode with the metadata error.
    // Use a buffer with a non-null leading byte so the null guard passes.
    const buf = Buffer.alloc(32);
    buf[0] = 0x01;
    expectRejected(await validateImageBuffer(buf, "anim.apng"), "Failed to read image metadata");
  });

  it("accepts a real APNG payload flagged by the .apng extension", async () => {
    // A real PNG carries PNG magic, so it is detected as png regardless of the
    // .apng extension; the extension branch is exercised only for no-magic
    // buffers (covered above). This asserts the happy path stays png.
    const png = await sharp({
      create: { width: 3, height: 2, channels: 3, background: { r: 1, g: 1, b: 1 } },
    })
      .png()
      .toBuffer();
    expectValid(await validateImageBuffer(png, "anim.apng"), "png", 3, 2);
  });

  it("falls back to raw for a RAW extension with unrecognized magic bytes", async () => {
    // A .rw2 (Panasonic) buffer with no recognized magic -> raw via L249.
    const buf = Buffer.alloc(32);
    buf[0] = 0x01; // non-null so it is not the all-null case
    expectValid(await validateImageBuffer(buf, "photo.rw2"), "raw", 0, 0);
  });

  it("does NOT fall back to raw for a non-RAW extension with unrecognized magic", async () => {
    const buf = Buffer.alloc(32);
    buf[0] = 0x01;
    expectRejected(await validateImageBuffer(buf, "photo.bin"), "Unrecognized image format");
  });

  it("forces tga for a .tga file even when the bytes match another format", async () => {
    // CUR magic (0x00 0x00 0x02 0x00) but a .tga extension: the tga override
    // (L228-230) wins over magic detection -> format is tga (CLI-decoded).
    expectValid(
      await validateImageBuffer(withLeadingBytes([0x00, 0x00, 0x02, 0x00]), "sprite.tga"),
      "tga",
      0,
      0,
    );
  });

  it("forces tga for a .tga file with no recognizable magic at all", async () => {
    const buf = Buffer.alloc(32);
    buf[0] = 0x01;
    expectValid(await validateImageBuffer(buf, "sprite.tga"), "tga", 0, 0);
  });

  it("uses only the final dotted segment as the extension", async () => {
    // "archive.tar.dng" -> ext "dng" -> RAW fallback fires for a no-magic body.
    const buf = Buffer.alloc(32);
    buf[0] = 0x01;
    expectValid(await validateImageBuffer(buf, "archive.tar.dng"), "raw", 0, 0);
  });

  it("treats a filename with no dot as having no extension", async () => {
    // "READMEnoext" has no dot -> ext "" -> no ext branch fires -> unknown.
    const buf = Buffer.alloc(32);
    buf[0] = 0x01;
    expectRejected(await validateImageBuffer(buf, "READMEnoext"), "Unrecognized image format");
  });

  it("treats an absent filename as having no extension", async () => {
    const buf = Buffer.alloc(32);
    buf[0] = 0x01;
    expectRejected(await validateImageBuffer(buf), "Unrecognized image format");
  });
});

// --------------------------------------------------------------------------
// Megapixel limit (L279-284): exercise both sides of the boundary by
// temporarily overriding env.MAX_MEGAPIXELS.
// --------------------------------------------------------------------------

describe("validateImageBuffer - megapixel limit boundary", () => {
  const original = env.MAX_MEGAPIXELS;

  afterEach(() => {
    env.MAX_MEGAPIXELS = original;
  });

  it("accepts an image exactly at the megapixel limit", async () => {
    // 1000x1000 = 1.0MP. Set the cap to exactly 1.0 so `megapixels > cap` is
    // false at the boundary (kills the `>` -> `>=` mutant).
    const png = await sharp({
      create: { width: 1000, height: 1000, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    env.MAX_MEGAPIXELS = 1;
    expectValid(await validateImageBuffer(png), "png", 1000, 1000);
  });

  it("rejects an image just over the megapixel limit with the exact reason", async () => {
    // 1000x1001 = 1.001MP > 1.0MP cap.
    const png = await sharp({
      create: { width: 1000, height: 1001, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    env.MAX_MEGAPIXELS = 1;
    const result = await validateImageBuffer(png);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toMatch(/^Image exceeds maximum size: 1\.0MP \(limit: 1MP\)$/);
    }
  });

  it("does not enforce a limit when MAX_MEGAPIXELS is 0 (unlimited)", async () => {
    const png = await sharp({
      create: { width: 1000, height: 1000, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    env.MAX_MEGAPIXELS = 0;
    expectValid(await validateImageBuffer(png), "png", 1000, 1000);
  });
});
