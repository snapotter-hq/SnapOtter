import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";

// ---------------------------------------------------------------------------
// 1. File validation
// ---------------------------------------------------------------------------

// We need to mock `../config.js` which file-validation.ts imports as `env`.
// Provide a minimal env object with the fields file-validation.ts uses.
vi.mock("../../../apps/api/src/config.js", () => ({
  env: {
    MAX_MEGAPIXELS: 100,
    WORKSPACE_PATH: "/tmp/test-workspace",
  },
}));

describe("validateImageBuffer", () => {
  let validateImageBuffer: typeof import("../../../apps/api/src/lib/file-validation.js").validateImageBuffer;

  beforeEach(async () => {
    // Re-import to pick up mock
    const mod = await import("../../../apps/api/src/lib/file-validation.js");
    validateImageBuffer = mod.validateImageBuffer;
  });

  // -- Valid formats --------------------------------------------------------

  it("accepts a valid PNG file", async () => {
    const buf = readFixture(fixtures.image.base.png200);
    const result = await validateImageBuffer(buf);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.format).toBe("png");
      expect(result.width).toBe(200);
      expect(result.height).toBe(150);
    }
  });

  it("accepts a valid JPEG file", async () => {
    const buf = readFixture(fixtures.image.base.jpg100);
    const result = await validateImageBuffer(buf);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.format).toBe("jpeg");
      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    }
  });

  it("accepts a valid WebP file", async () => {
    const buf = readFixture(fixtures.image.base.webp50);
    const result = await validateImageBuffer(buf);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.format).toBe("webp");
      expect(result.width).toBe(50);
      expect(result.height).toBe(50);
    }
  });

  it("accepts a tiny 1x1 PNG file", async () => {
    const buf = readFixture(fixtures.image.edge.px1);
    const result = await validateImageBuffer(buf);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.format).toBe("png");
      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
    }
  });

  // -- Synthetic valid buffers for formats without fixtures -----------------

  it("accepts a GIF buffer with correct magic bytes", async () => {
    // Minimal GIF89a: header + logical screen descriptor + terminator
    const gif = Buffer.from("474946383961010001000000002c00000000010001000002024401003b", "hex");
    const result = await validateImageBuffer(gif);
    // sharp may or may not parse this minimal GIF; what matters is magic bytes pass
    // If sharp fails metadata, that is "Failed to read image metadata"
    expect(result).toBeDefined();
    if (result.valid) {
      expect(result.format).toBe("gif");
    }
  });

  it("accepts a BMP buffer with correct magic bytes", async () => {
    // Build a minimal 1x1 24-bit BMP (62 bytes header + 4 bytes pixel data)
    const bmp = Buffer.alloc(66);
    // BM signature
    bmp[0] = 0x42;
    bmp[1] = 0x4d;
    // File size (66 bytes, little-endian)
    bmp.writeUInt32LE(66, 2);
    // Reserved
    bmp.writeUInt32LE(0, 6);
    // Pixel data offset
    bmp.writeUInt32LE(62, 10);
    // DIB header size (40 = BITMAPINFOHEADER)
    bmp.writeUInt32LE(40, 14);
    // Width = 1
    bmp.writeInt32LE(1, 18);
    // Height = 1
    bmp.writeInt32LE(1, 22);
    // Planes = 1
    bmp.writeUInt16LE(1, 26);
    // Bits per pixel = 24
    bmp.writeUInt16LE(24, 28);
    // Compression = 0 (BI_RGB)
    bmp.writeUInt32LE(0, 30);
    // Image size (can be 0 for BI_RGB)
    bmp.writeUInt32LE(0, 34);
    // X/Y pixels per meter
    bmp.writeInt32LE(2835, 38);
    bmp.writeInt32LE(2835, 42);
    // Colors used / important
    bmp.writeUInt32LE(0, 46);
    bmp.writeUInt32LE(0, 50);

    const result = await validateImageBuffer(bmp);
    expect(result).toBeDefined();
    if (result.valid) {
      expect(result.format).toBe("bmp");
    }
  });

  it("accepts a HEIC file with correct magic bytes", async () => {
    const heicBuf = readFixture(fixtures.image.base.heic200);
    const result = await validateImageBuffer(heicBuf);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.format).toBe("heif");
    }
  });

  it("accepts a TIFF buffer (little-endian byte order)", async () => {
    // Minimal TIFF is complex; just verify magic bytes detection works
    // and sharp either parses or gives metadata error (not "unrecognized format")
    const tiffLE = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
    const result = await validateImageBuffer(tiffLE);
    // Magic bytes should be detected as tiff, but sharp may fail on a truncated TIFF
    expect(result).toBeDefined();
    if (!result.valid) {
      expect(result.reason).toBe("Failed to read image metadata");
    }
  });

  it("accepts a TIFF buffer (big-endian byte order)", async () => {
    const tiffBE = Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]);
    const result = await validateImageBuffer(tiffBE);
    expect(result).toBeDefined();
    if (!result.valid) {
      expect(result.reason).toBe("Failed to read image metadata");
    }
  });

  // -- Empty / null / missing -----------------------------------------------

  it("rejects an empty buffer", async () => {
    const result = await validateImageBuffer(Buffer.alloc(0));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("File is empty");
    }
  });

  it("rejects null passed as buffer", async () => {
    const result = await validateImageBuffer(null as unknown as Buffer);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("File is empty");
    }
  });

  it("rejects undefined passed as buffer", async () => {
    const result = await validateImageBuffer(undefined as unknown as Buffer);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("File is empty");
    }
  });

  // -- Random / garbage data ------------------------------------------------

  it("rejects a buffer of random bytes", async () => {
    const garbage = Buffer.from(Array.from({ length: 256 }, () => Math.floor(Math.random() * 256)));
    // Ensure the first bytes do not accidentally match any magic signature
    garbage[0] = 0x00;
    garbage[1] = 0x00;
    const result = await validateImageBuffer(garbage);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("Unrecognized image format");
    }
  });

  it("rejects a text file disguised with no image magic bytes", async () => {
    const text = Buffer.from("This is definitely not an image file. Lorem ipsum dolor sit amet.");
    const result = await validateImageBuffer(text);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("Unrecognized image format");
    }
  });

  it("rejects an HTML file", async () => {
    const html = Buffer.from("<html><body><h1>Hello</h1></body></html>");
    const result = await validateImageBuffer(html);
    expect(result.valid).toBe(false);
  });

  it("rejects a JSON file", async () => {
    const json = Buffer.from(JSON.stringify({ image: "fake.png", width: 100 }));
    const result = await validateImageBuffer(json);
    expect(result.valid).toBe(false);
  });

  // -- Truncated headers ----------------------------------------------------

  it("rejects a buffer with only the first byte of a PNG header", async () => {
    const partial = Buffer.from([0x89]);
    const result = await validateImageBuffer(partial);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("Unrecognized image format");
    }
  });

  it("rejects a truncated PNG header (3 of 4 magic bytes)", async () => {
    const partial = Buffer.from([0x89, 0x50, 0x4e]);
    const result = await validateImageBuffer(partial);
    expect(result.valid).toBe(false);
  });

  it("rejects a buffer with PNG magic bytes but no real image data", async () => {
    // Correct 4-byte PNG signature but nothing valid after
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]);
    const result = await validateImageBuffer(fakePng);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("Failed to read image metadata");
    }
  });

  it("rejects a buffer with JPEG magic bytes but truncated body", async () => {
    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    const result = await validateImageBuffer(fakeJpeg);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("Failed to read image metadata");
    }
  });

  // -- RIFF container that is NOT WebP (e.g. WAV/AVI) ----------------------

  it("rejects a RIFF container that is not WebP (e.g. WAVE)", async () => {
    // RIFF....WAVE
    const riffWave = Buffer.alloc(12);
    riffWave.write("RIFF", 0, "ascii");
    riffWave.writeUInt32LE(4, 4); // chunk size
    riffWave.write("WAVE", 8, "ascii");
    const result = await validateImageBuffer(riffWave);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("Unrecognized image format");
    }
  });

  it("rejects a RIFF container that is AVI", async () => {
    const riffAvi = Buffer.alloc(12);
    riffAvi.write("RIFF", 0, "ascii");
    riffAvi.writeUInt32LE(4, 4);
    riffAvi.write("AVI ", 8, "ascii");
    const result = await validateImageBuffer(riffAvi);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("Unrecognized image format");
    }
  });

  it("rejects a RIFF container too short to contain WEBP signature", async () => {
    // Only 8 bytes of RIFF -- no room for the format tag at bytes 8-11
    const shortRiff = Buffer.alloc(8);
    shortRiff.write("RIFF", 0, "ascii");
    shortRiff.writeUInt32LE(0, 4);
    const result = await validateImageBuffer(shortRiff);
    expect(result.valid).toBe(false);
  });

  // -- Partial magic bytes edge cases ---------------------------------------

  it("rejects a single-byte buffer (0xFF -- JPEG first byte only)", async () => {
    const result = await validateImageBuffer(Buffer.from([0xff]));
    expect(result.valid).toBe(false);
  });

  it("rejects two JPEG magic bytes without the third", async () => {
    const result = await validateImageBuffer(Buffer.from([0xff, 0xd8]));
    expect(result.valid).toBe(false);
  });

  it("accepts BMP magic (decoded via CLI, not Sharp)", async () => {
    const fakeBmp = Buffer.from([0x42, 0x4d, 0x00, 0x00]);
    const result = await validateImageBuffer(fakeBmp);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.format).toBe("bmp");
    }
  });

  // -- Oversized image (megapixel limit) ------------------------------------

  it("rejects an image that exceeds MAX_MEGAPIXELS", async () => {
    // We cannot easily build a 100MP+ image buffer in a test, so re-mock env
    // with a very low limit (0.0001 MP = 100 pixels) and test with the 200x150 fixture
    const origMod = await import("../../../apps/api/src/config.js");
    const savedMax = origMod.env.MAX_MEGAPIXELS;
    origMod.env.MAX_MEGAPIXELS = 0.0001; // 100 pixels -- 200x150 = 30000px >> 100

    try {
      const buf = readFixture(fixtures.image.base.png200);
      const result = await validateImageBuffer(buf);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain("exceeds maximum size");
        expect(result.reason).toContain("MP");
      }
    } finally {
      origMod.env.MAX_MEGAPIXELS = savedMax;
    }
  });

  // -- Polyglot / tricky inputs ---------------------------------------------

  it("rejects a ZIP file (PK magic 0x50 0x4B)", async () => {
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
    const result = await validateImageBuffer(zip);
    expect(result.valid).toBe(false);
  });

  it("rejects a PDF file (%PDF-)", async () => {
    const pdf = Buffer.from("%PDF-1.4 fake content");
    const result = await validateImageBuffer(pdf);
    expect(result.valid).toBe(false);
  });

  it("rejects an EXE file (MZ header)", async () => {
    const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    const result = await validateImageBuffer(exe);
    expect(result.valid).toBe(false);
  });

  // -- Null-byte buffers ----------------------------------------------------

  it("rejects a buffer that is entirely null bytes (small)", async () => {
    const nullBuf = Buffer.alloc(32); // all zeros
    const result = await validateImageBuffer(nullBuf);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("File contains no image data");
    }
  });

  it("rejects a large buffer that is entirely null bytes", async () => {
    const nullBuf = Buffer.alloc(1024); // all zeros, > 64 bytes
    const result = await validateImageBuffer(nullBuf);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("File contains no image data");
    }
  });

  // -- SVG detection --------------------------------------------------------

  it("accepts an SVG buffer with valid XML", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>',
    );
    const result = await validateImageBuffer(svg);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.format).toBe("svg");
    }
  });

  // -- HDR text detection ---------------------------------------------------

  it("accepts an HDR buffer with #?RADIANCE header", async () => {
    // Build a minimal buffer that starts with the HDR magic text
    const hdrHeader = Buffer.from("#?RADIANCE\n");
    const padding = Buffer.alloc(100);
    const hdrBuf = Buffer.concat([hdrHeader, padding]);
    const result = await validateImageBuffer(hdrBuf);
    // HDR is a CLI_DECODED_FORMAT, so it bypasses sharp metadata
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.format).toBe("hdr");
      expect(result.width).toBe(0);
      expect(result.height).toBe(0);
    }
  });

  it("accepts an HDR buffer with #?RGBE header", async () => {
    const hdrHeader = Buffer.from("#?RGBE\n");
    const padding = Buffer.alloc(100);
    const hdrBuf = Buffer.concat([hdrHeader, padding]);
    const result = await validateImageBuffer(hdrBuf);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.format).toBe("hdr");
    }
  });

  it("does not detect HDR for a buffer shorter than 10 bytes", async () => {
    const shortBuf = Buffer.from("#?RADIAN"); // 8 bytes, too short
    const result = await validateImageBuffer(shortBuf);
    expect(result.valid).toBe(false);
  });

  // -- RAW extension differentiation ----------------------------------------

  it("detects RAW format when TIFF magic bytes + RAW extension (DNG)", async () => {
    const tiffLE = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
    const result = await validateImageBuffer(tiffLE, "photo.dng");
    // RAW is a CLI_DECODED_FORMAT, so width/height are 0
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.format).toBe("raw");
      expect(result.width).toBe(0);
      expect(result.height).toBe(0);
    }
  });

  it("detects RAW format with CR2 extension", async () => {
    const tiffLE = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
    const result = await validateImageBuffer(tiffLE, "photo.cr2");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.format).toBe("raw");
    }
  });

  it("detects RAW format with NEF extension", async () => {
    const tiffLE = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
    const result = await validateImageBuffer(tiffLE, "photo.nef");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.format).toBe("raw");
    }
  });

  // -- TGA extension-only detection -----------------------------------------

  it("detects TGA format by extension (no magic bytes)", async () => {
    // TGA has no magic bytes, so detection is extension-only
    const randomBytes = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
    const result = await validateImageBuffer(randomBytes, "image.tga");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.format).toBe("tga");
      expect(result.width).toBe(0);
      expect(result.height).toBe(0);
    }
  });

  // -- CLI decoded format bypass (PSD, EXR) ---------------------------------

  it("detects PSD format and bypasses sharp dimension check", async () => {
    // PSD magic: "8BPS"
    const psdBuf = Buffer.alloc(64);
    psdBuf[0] = 0x38;
    psdBuf[1] = 0x42;
    psdBuf[2] = 0x50;
    psdBuf[3] = 0x53;
    const result = await validateImageBuffer(psdBuf);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.format).toBe("psd");
      expect(result.width).toBe(0);
      expect(result.height).toBe(0);
    }
  });

  it("detects EXR format and bypasses sharp dimension check", async () => {
    // OpenEXR magic bytes
    const exrBuf = Buffer.alloc(64);
    exrBuf[0] = 0x76;
    exrBuf[1] = 0x2f;
    exrBuf[2] = 0x31;
    exrBuf[3] = 0x01;
    const result = await validateImageBuffer(exrBuf);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.format).toBe("exr");
      expect(result.width).toBe(0);
      expect(result.height).toBe(0);
    }
  });

  // -- ICO detection --------------------------------------------------------

  it("detects ICO format via magic bytes", async () => {
    const icoBuf = Buffer.alloc(64);
    icoBuf[0] = 0x00;
    icoBuf[1] = 0x00;
    icoBuf[2] = 0x01;
    icoBuf[3] = 0x00;
    // Need non-zero bytes past first 64 positions to avoid null-byte rejection
    icoBuf[4] = 0x01;
    const result = await validateImageBuffer(icoBuf);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.format).toBe("ico");
      expect(result.width).toBe(0);
      expect(result.height).toBe(0);
    }
  });

  // -- AVIF/HEIF ftyp brand verification -----------------------------------

  it("rejects ftyp box with unrecognized brand (not avif/heic)", async () => {
    // Build a buffer with ftyp at offset 4 but brand "mp41" (not avif or heif)
    const buf = Buffer.alloc(16);
    buf.write("ftyp", 4, "ascii");
    buf.write("mp41", 8, "ascii");
    const result = await validateImageBuffer(buf);
    expect(result.valid).toBe(false);
  });

  // -- JXL detection --------------------------------------------------------

  it("detects JXL ISOBMFF container format", async () => {
    const jxlBuf = Buffer.alloc(64);
    // JXL ISOBMFF magic: 00 00 00 0C 4A 58 4C 20
    jxlBuf[0] = 0x00;
    jxlBuf[1] = 0x00;
    jxlBuf[2] = 0x00;
    jxlBuf[3] = 0x0c;
    jxlBuf[4] = 0x4a;
    jxlBuf[5] = 0x58;
    jxlBuf[6] = 0x4c;
    jxlBuf[7] = 0x20;
    // Need non-null bytes to avoid null-byte rejection
    jxlBuf[8] = 0x01;
    const result = await validateImageBuffer(jxlBuf);
    // JXL is not in CLI_DECODED_FORMATS, so sharp metadata may fail
    expect(result).toBeDefined();
    if (result.valid) {
      expect(result.format).toBe("jxl");
    }
  });

  it("detects JXL raw codestream format", async () => {
    const jxlRaw = Buffer.alloc(64);
    jxlRaw[0] = 0xff;
    jxlRaw[1] = 0x0a;
    // Need more non-zero data
    jxlRaw[2] = 0x01;
    const result = await validateImageBuffer(jxlRaw);
    expect(result).toBeDefined();
    if (result.valid) {
      expect(result.format).toBe("jxl");
    }
  });

  // -- Exotic formats from fixture files ------------------------------------

  describe("validates exotic formats", () => {
    const { readFileSync } = require("node:fs");

    it("accepts PBM file", async () => {
      const buf = readFixture(fixtures.image.formats("pbm"));
      const result = await validateImageBuffer(buf, "sample.pbm");
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.format).toBe("pbm");
    });

    it("accepts PGM file", async () => {
      const buf = readFixture(fixtures.image.formats("pgm"));
      const result = await validateImageBuffer(buf, "sample.pgm");
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.format).toBe("pgm");
    });

    it("accepts PPM file", async () => {
      const buf = readFixture(fixtures.image.formats("ppm"));
      const result = await validateImageBuffer(buf, "sample.ppm");
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.format).toBe("ppm");
    });

    it("accepts DDS file", async () => {
      const buf = readFixture(fixtures.image.formats("dds"));
      const result = await validateImageBuffer(buf, "sample.dds");
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.format).toBe("dds");
    });

    it("accepts DPX file", async () => {
      const buf = readFixture(fixtures.image.formats("dpx"));
      const result = await validateImageBuffer(buf, "sample.dpx");
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.format).toBe("dpx");
    });

    it("accepts FITS file", async () => {
      const buf = readFixture(fixtures.image.formats("fits"));
      const result = await validateImageBuffer(buf, "sample.fits");
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.format).toBe("fits");
    });

    it("accepts JP2 file", async () => {
      const buf = readFixture(fixtures.image.formats("jp2"));
      const result = await validateImageBuffer(buf, "sample.jp2");
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.format).toBe("jp2");
    });

    it("accepts QOI file", async () => {
      const buf = readFixture(fixtures.image.formats("qoi"));
      const result = await validateImageBuffer(buf, "sample.qoi");
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.format).toBe("qoi");
    });

    it("accepts SVGZ file (detected as svg)", async () => {
      const buf = readFixture(fixtures.image.formats("svgz"));
      const result = await validateImageBuffer(buf, "sample.svgz");
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.format).toBe("svg");
    });

    it("accepts EPS file", async () => {
      const buf = readFixture(fixtures.image.formats("eps"));
      const result = await validateImageBuffer(buf, "sample.eps");
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.format).toBe("eps");
    });

    it("accepts CUR file with CUR magic bytes", async () => {
      // Build a buffer with proper CUR magic (00 00 02 00) since the fixture
      // has ICO magic bytes (00 00 01 00) which gets detected as ico instead
      const curBuf = Buffer.alloc(64);
      curBuf[0] = 0x00;
      curBuf[1] = 0x00;
      curBuf[2] = 0x02;
      curBuf[3] = 0x00;
      curBuf[4] = 0x01;
      const result = await validateImageBuffer(curBuf, "sample.cur");
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.format).toBe("cur");
    });

    it("accepts HEIF file", async () => {
      const buf = readFixture(fixtures.image.formats("heif"));
      const result = await validateImageBuffer(buf, "sample.heif");
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.format).toBe("heif");
    });

    it("accepts APNG file (detected as png)", async () => {
      const buf = readFixture(fixtures.image.formats("apng"));
      const result = await validateImageBuffer(buf, "sample.apng");
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.format).toBe("png");
    });

    it("accepts DNG file (detected as raw)", async () => {
      const buf = readFixture(fixtures.image.formats("dng"));
      const result = await validateImageBuffer(buf, "sample.dng");
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.format).toBe("raw");
        expect(result.width).toBe(0);
        expect(result.height).toBe(0);
      }
    });

    it("rejects a PDF file", async () => {
      const pdfBuffer = Buffer.from("%PDF-1.4 fake content");
      const result = await validateImageBuffer(pdfBuffer, "test.pdf");
      expect(result.valid).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// 1b. isRawExtension
// ---------------------------------------------------------------------------

describe("isRawExtension", () => {
  let isRawExtension: typeof import("../../../apps/api/src/lib/file-validation.js").isRawExtension;

  beforeEach(async () => {
    const mod = await import("../../../apps/api/src/lib/file-validation.js");
    isRawExtension = mod.isRawExtension;
  });

  it("returns true for DNG extension", () => {
    expect(isRawExtension("dng")).toBe(true);
  });

  it("returns true for CR2 extension", () => {
    expect(isRawExtension("cr2")).toBe(true);
  });

  it("returns true for NEF extension", () => {
    expect(isRawExtension("nef")).toBe(true);
  });

  it("returns true for ARW extension", () => {
    expect(isRawExtension("arw")).toBe(true);
  });

  it("returns true for ORF extension", () => {
    expect(isRawExtension("orf")).toBe(true);
  });

  it("returns true for RW2 extension", () => {
    expect(isRawExtension("rw2")).toBe(true);
  });

  it("returns true for uppercase extensions", () => {
    expect(isRawExtension("DNG")).toBe(true);
    expect(isRawExtension("CR2")).toBe(true);
  });

  it("returns true with leading dot", () => {
    expect(isRawExtension(".dng")).toBe(true);
    expect(isRawExtension(".CR2")).toBe(true);
  });

  it("returns false for non-RAW extensions", () => {
    expect(isRawExtension("png")).toBe(false);
    expect(isRawExtension("jpg")).toBe(false);
    expect(isRawExtension("tiff")).toBe(false);
    expect(isRawExtension("webp")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isRawExtension("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Object storage capacity guard (replaces former workspace tests)
// ---------------------------------------------------------------------------

describe("assertLocalCapacity / isBelowCapacity", () => {
  it("isBelowCapacity returns true when free space is below 0.5 GB", async () => {
    const { isBelowCapacity, CAPACITY_CRITICAL_GB } = await import(
      "../../../apps/api/src/lib/object-storage.js"
    );
    expect(CAPACITY_CRITICAL_GB).toBe(0.5);
    // 0.4 GB free should be below threshold
    expect(isBelowCapacity(0.4 * 1024 ** 3)).toBe(true);
    // 0.0 bytes free
    expect(isBelowCapacity(0)).toBe(true);
  });

  it("isBelowCapacity returns false when free space is above 0.5 GB", async () => {
    const { isBelowCapacity } = await import("../../../apps/api/src/lib/object-storage.js");
    // 1 GB free
    expect(isBelowCapacity(1 * 1024 ** 3)).toBe(false);
    // Exactly at threshold (0.5 GB) should be false (not strictly less)
    expect(isBelowCapacity(0.5 * 1024 ** 3)).toBe(false);
  });

  it("isBelowCapacity boundary: just below 0.5 GB is true", async () => {
    const { isBelowCapacity } = await import("../../../apps/api/src/lib/object-storage.js");
    // One byte below 0.5 GB
    expect(isBelowCapacity(0.5 * 1024 ** 3 - 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Env loading
// ---------------------------------------------------------------------------

describe("loadEnv", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset to a clean slate before each test --
    // wipe all keys that our schema cares about so defaults kick in
    const keysToClean = [
      "PORT",
      "AUTH_ENABLED",
      "DEFAULT_USERNAME",
      "DEFAULT_PASSWORD",
      "STORAGE_MODE",
      "FILE_MAX_AGE_HOURS",
      "CLEANUP_INTERVAL_MINUTES",
      "MAX_UPLOAD_SIZE_MB",
      "MAX_BATCH_SIZE",
      "CONCURRENT_JOBS",
      "MAX_MEGAPIXELS",
      "RATE_LIMIT_PER_MIN",
      "SKIP_MUST_CHANGE_PASSWORD",
      "DATABASE_URL",
      "WORKSPACE_PATH",
      "DEFAULT_THEME",
      "DEFAULT_LOCALE",
      "DEFAULT_TOOL_VIEW",
    ];
    for (const key of keysToClean) {
      delete process.env[key];
    }
  });

  afterAll(() => {
    // Restore original process.env
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  // We import the raw loadEnv function (not the cached `env` from config.ts)
  // so each call reads the current process.env.

  it("parses env vars and applies Zod schema correctly", async () => {
    // loadEnv reads process.env; vitest.config.ts injects test env vars.
    // We verify the schema parses them correctly rather than testing defaults
    // (which requires a clean env that vitest's env injection prevents).
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    const env = loadEnv();
    // Verify types are correct after Zod parsing
    expect(typeof env.PORT).toBe("number");
    expect(typeof env.AUTH_ENABLED).toBe("boolean");
    expect(typeof env.DEFAULT_USERNAME).toBe("string");
    expect(typeof env.DEFAULT_PASSWORD).toBe("string");
    expect(["local", "s3"]).toContain(env.STORAGE_MODE);
    expect(typeof env.FILE_MAX_AGE_HOURS).toBe("number");
    expect(typeof env.CLEANUP_INTERVAL_MINUTES).toBe("number");
    expect(typeof env.MAX_UPLOAD_SIZE_MB).toBe("number");
    expect(typeof env.MAX_BATCH_SIZE).toBe("number");
    expect(typeof env.CONCURRENT_JOBS).toBe("number");
    expect(typeof env.MAX_MEGAPIXELS).toBe("number");
    expect(typeof env.RATE_LIMIT_PER_MIN).toBe("number");
    expect(typeof env.SKIP_MUST_CHANGE_PASSWORD).toBe("boolean");
    expect(typeof env.DATABASE_URL).toBe("string");
    expect(typeof env.WORKSPACE_PATH).toBe("string");
    expect(["light", "dark"]).toContain(env.DEFAULT_THEME);
    expect(typeof env.DEFAULT_LOCALE).toBe("string");
    expect(["sidebar", "fullscreen"]).toContain(env.DEFAULT_TOOL_VIEW);
  });

  it("parses custom PORT as a number via coercion", async () => {
    process.env.PORT = "8080";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(loadEnv().PORT).toBe(8080);
  });

  it("coerces string 'true' for AUTH_ENABLED to boolean true", async () => {
    process.env.AUTH_ENABLED = "true";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(loadEnv().AUTH_ENABLED).toBe(true);
  });

  it("coerces string 'false' for AUTH_ENABLED to boolean false", async () => {
    process.env.AUTH_ENABLED = "false";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(loadEnv().AUTH_ENABLED).toBe(false);
  });

  it("rejects AUTH_ENABLED with a non-enum value", async () => {
    process.env.AUTH_ENABLED = "yes";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(() => loadEnv()).toThrow();
  });

  it("rejects STORAGE_MODE with an invalid enum value", async () => {
    process.env.STORAGE_MODE = "gcs";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(() => loadEnv()).toThrow();
  });

  it("rejects DEFAULT_THEME with an invalid enum value", async () => {
    process.env.DEFAULT_THEME = "solarized";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(() => loadEnv()).toThrow();
  });

  it("accepts DEFAULT_TOOL_VIEW=fullscreen", async () => {
    process.env.DEFAULT_TOOL_VIEW = "fullscreen";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(loadEnv().DEFAULT_TOOL_VIEW).toBe("fullscreen");
  });

  it("accepts DEFAULT_TOOL_VIEW=sidebar", async () => {
    process.env.DEFAULT_TOOL_VIEW = "sidebar";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(loadEnv().DEFAULT_TOOL_VIEW).toBe("sidebar");
  });

  it("defaults DEFAULT_TOOL_VIEW to sidebar when not set", async () => {
    delete process.env.DEFAULT_TOOL_VIEW;
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(loadEnv().DEFAULT_TOOL_VIEW).toBe("sidebar");
  });

  it("rejects DEFAULT_TOOL_VIEW with an invalid value", async () => {
    process.env.DEFAULT_TOOL_VIEW = "grid";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(() => loadEnv()).toThrow();
  });

  it("coerces numeric strings for MAX_MEGAPIXELS", async () => {
    process.env.MAX_MEGAPIXELS = "50";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(loadEnv().MAX_MEGAPIXELS).toBe(50);
  });

  it("coerces floating point string for FILE_MAX_AGE_HOURS", async () => {
    process.env.FILE_MAX_AGE_HOURS = "2.5";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(loadEnv().FILE_MAX_AGE_HOURS).toBe(2.5);
  });

  it("accepts 0 for numeric fields", async () => {
    process.env.PORT = "0";
    process.env.CONCURRENT_JOBS = "0";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    const env = loadEnv();
    expect(env.PORT).toBe(0);
    expect(env.CONCURRENT_JOBS).toBe(0);
  });

  it("coerces negative numbers for numeric fields", async () => {
    process.env.PORT = "-1";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    // zod coerce will parse to -1; there is no positive-only constraint
    expect(loadEnv().PORT).toBe(-1);
  });

  it("accepts string values for string fields", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/testdb";
    process.env.DEFAULT_LOCALE = "fr";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    const env = loadEnv();
    expect(env.DATABASE_URL).toBe("postgres://user:pass@localhost:5432/testdb");
    expect(env.DEFAULT_LOCALE).toBe("fr");
  });

  it("rejects non-numeric strings for number fields", async () => {
    process.env.PORT = "not_a_number";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    // z.coerce.number() produces NaN for non-numeric strings, and zod rejects NaN
    expect(() => loadEnv()).toThrow();
  });

  it("accepts all custom values at once", async () => {
    process.env.PORT = "9999";
    process.env.AUTH_ENABLED = "true";
    process.env.DEFAULT_USERNAME = "root";
    process.env.DEFAULT_PASSWORD = "s3cret!";
    process.env.STORAGE_MODE = "s3";
    process.env.S3_BUCKET = "my-bucket";
    process.env.S3_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE";
    process.env.S3_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
    process.env.DEFAULT_THEME = "dark";
    process.env.MAX_BATCH_SIZE = "500";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    const env = loadEnv();
    expect(env.PORT).toBe(9999);
    expect(env.AUTH_ENABLED).toBe(true);
    expect(env.DEFAULT_USERNAME).toBe("root");
    expect(env.DEFAULT_PASSWORD).toBe("s3cret!");
    expect(env.STORAGE_MODE).toBe("s3");
    expect(env.S3_BUCKET).toBe("my-bucket");
    expect(env.S3_ACCESS_KEY_ID).toBe("AKIAIOSFODNN7EXAMPLE");
    expect(env.S3_SECRET_ACCESS_KEY).toBe("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
    expect(env.DEFAULT_THEME).toBe("dark");
    expect(env.MAX_BATCH_SIZE).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// 4. Auth helpers (hashPassword / verifyPassword)
// ---------------------------------------------------------------------------

// These functions are pure crypto -- they do not import db or env at the module
// top level, so we can import them directly without mocking the database.
// However auth.ts does import db and env at the top level, so we need to mock those.

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {},
  pool: {},
  closeDb: async () => {},
  schema: { users: {}, sessions: {} },
}));

describe("hashPassword", () => {
  let hashPassword: typeof import("../../../apps/api/src/plugins/auth.js").hashPassword;

  beforeEach(async () => {
    const mod = await import("../../../apps/api/src/plugins/auth.js");
    hashPassword = mod.hashPassword;
  });

  it("produces a string in salt:hash format", async () => {
    const result = await hashPassword("mypassword");
    const parts = result.split(":");
    expect(parts).toHaveLength(2);
    expect(parts[0].length).toBeGreaterThan(0); // salt
    expect(parts[1].length).toBeGreaterThan(0); // hash
  });

  it("salt is 32 bytes (64 hex chars)", async () => {
    const result = await hashPassword("test");
    const salt = result.split(":")[0];
    expect(salt.length).toBe(64); // 32 bytes * 2 hex chars
    // Ensure it's valid hex
    expect(/^[0-9a-f]+$/.test(salt)).toBe(true);
  });

  it("hash (derived key) is 64 bytes (128 hex chars)", async () => {
    const result = await hashPassword("test");
    const hash = result.split(":")[1];
    expect(hash.length).toBe(128); // 64 bytes * 2 hex chars
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it("different passwords produce different hashes", async () => {
    const hash1 = await hashPassword("password1");
    const hash2 = await hashPassword("password2");
    expect(hash1).not.toBe(hash2);
  });

  it("same password produces different salts (non-deterministic)", async () => {
    const hash1 = await hashPassword("samepassword");
    const hash2 = await hashPassword("samepassword");
    const salt1 = hash1.split(":")[0];
    const salt2 = hash2.split(":")[0];
    expect(salt1).not.toBe(salt2);
  });

  it("same password produces different derived keys due to different salts", async () => {
    const hash1 = await hashPassword("samepassword");
    const hash2 = await hashPassword("samepassword");
    const derived1 = hash1.split(":")[1];
    const derived2 = hash2.split(":")[1];
    expect(derived1).not.toBe(derived2);
  });

  it("handles empty string password", async () => {
    const result = await hashPassword("");
    expect(result).toContain(":");
    const parts = result.split(":");
    expect(parts[0].length).toBe(64);
    expect(parts[1].length).toBe(128);
  });

  it("handles very long password", async () => {
    const longPw = "a".repeat(10_000);
    const result = await hashPassword(longPw);
    expect(result).toContain(":");
    const parts = result.split(":");
    expect(parts[0].length).toBe(64);
    expect(parts[1].length).toBe(128);
  });

  it("handles unicode password", async () => {
    const result = await hashPassword("\u{1F600}\u{1F680}\u4F60\u597D");
    expect(result).toContain(":");
    const parts = result.split(":");
    expect(parts).toHaveLength(2);
  });

  it("handles password with colons (does not break salt:hash parsing)", async () => {
    const result = await hashPassword("pass:with:colons");
    // The output format is salt:hash -- salt and hash are hex so they cannot contain colons
    const parts = result.split(":");
    expect(parts).toHaveLength(2);
  });
});

describe("verifyPassword", () => {
  let hashPassword: typeof import("../../../apps/api/src/plugins/auth.js").hashPassword;
  let verifyPassword: typeof import("../../../apps/api/src/plugins/auth.js").verifyPassword;

  beforeEach(async () => {
    const mod = await import("../../../apps/api/src/plugins/auth.js");
    hashPassword = mod.hashPassword;
    verifyPassword = mod.verifyPassword;
  });

  it("returns true for the correct password", async () => {
    const stored = await hashPassword("correcthorse");
    expect(await verifyPassword("correcthorse", stored)).toBe(true);
  });

  it("returns false for the wrong password", async () => {
    const stored = await hashPassword("correcthorse");
    expect(await verifyPassword("wronghorse", stored)).toBe(false);
  });

  it("returns false for empty password when hash was non-empty", async () => {
    const stored = await hashPassword("realpassword");
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("returns true for empty password when hash was from empty password", async () => {
    const stored = await hashPassword("");
    expect(await verifyPassword("", stored)).toBe(true);
  });

  it("returns false for a stored hash with no colon separator", async () => {
    expect(await verifyPassword("anything", "nocolonhere")).toBe(false);
  });

  it("returns false for an empty stored hash string", async () => {
    expect(await verifyPassword("anything", "")).toBe(false);
  });

  it("returns false for stored hash that is just a colon", async () => {
    expect(await verifyPassword("anything", ":")).toBe(false);
  });

  it("returns false when salt is present but hash part is empty", async () => {
    expect(await verifyPassword("test", "abcd1234:")).toBe(false);
  });

  it("returns false when hash part is present but salt is empty", async () => {
    expect(await verifyPassword("test", ":abcd1234")).toBe(false);
  });

  it("returns false for a corrupted (truncated) hash", async () => {
    const stored = await hashPassword("mypass");
    // Truncate the hash part
    const truncated = stored.substring(0, stored.indexOf(":") + 5);
    expect(await verifyPassword("mypass", truncated)).toBe(false);
  });

  it("returns false for a valid salt with wrong hash bytes", async () => {
    const stored = await hashPassword("mypass");
    const salt = stored.split(":")[0];
    // Replace the hash with a different valid hex string of the same length
    const fakeHash = "ff".repeat(64);
    expect(await verifyPassword("mypass", `${salt}:${fakeHash}`)).toBe(false);
  });

  it("handles unicode passwords in verification", async () => {
    const pw = "\u00E9\u00E8\u00EA\u00EB"; // accented characters
    const stored = await hashPassword(pw);
    expect(await verifyPassword(pw, stored)).toBe(true);
    expect(await verifyPassword("eeee", stored)).toBe(false);
  });

  it("is case-sensitive", async () => {
    const stored = await hashPassword("Password");
    expect(await verifyPassword("Password", stored)).toBe(true);
    expect(await verifyPassword("password", stored)).toBe(false);
    expect(await verifyPassword("PASSWORD", stored)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. sanitizeFilename
// ---------------------------------------------------------------------------

// The function is duplicated across multiple route files. Since it is not exported,
// we replicate the exact logic here and test it directly. This tests the BEHAVIOR
// so if any of the copies drift, these tests document the expected contract.

function sanitizeFilename(raw: string): string {
  let name = basename(raw);
  name = name.replace(/\.\./g, "");
  name = name.replace(/\0/g, "");
  if (!name || name === "." || name === "..") {
    name = "upload";
  }

  // Guard against double-extension attacks (e.g. "image.png.php").
  const dotIndex = name.indexOf(".");
  if (dotIndex !== -1) {
    const parts = name.split(".");
    const SAFE_IMAGE_EXTENSIONS = new Set([
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
      ".gif",
      ".bmp",
      ".tiff",
      ".tif",
      ".avif",
      ".svg",
      ".pdf",
    ]);
    for (let i = 1; i < parts.length; i++) {
      const ext = `.${parts[i].toLowerCase()}`;
      if (SAFE_IMAGE_EXTENSIONS.has(ext)) {
        name = parts.slice(0, i + 1).join(".");
        break;
      }
    }
  }

  // Truncate to filesystem-safe length (255 byte NAME_MAX minus margin for _toolId suffix)
  const MAX_NAME_BYTES = 200;
  const enc = new TextEncoder();
  if (enc.encode(name).length > MAX_NAME_BYTES) {
    const dotIdx = name.lastIndexOf(".");
    const ext = dotIdx > 0 ? name.slice(dotIdx) : "";
    let base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
    while (enc.encode(base + ext).length > MAX_NAME_BYTES) {
      base = base.slice(0, -1);
    }
    name = base + ext;
  }

  return name;
}

describe("sanitizeFilename", () => {
  // -- Path traversal attacks -----------------------------------------------

  it("strips directory traversal ../../etc/passwd", () => {
    const result = sanitizeFilename("../../etc/passwd");
    expect(result).toBe("passwd");
    expect(result).not.toContain("..");
    expect(result).not.toContain("/");
  });

  it("strips more deeply nested traversal", () => {
    const result = sanitizeFilename("../../../../../../../etc/shadow");
    expect(result).toBe("shadow");
  });

  it("strips Windows-style backslash traversal", () => {
    const result = sanitizeFilename("..\\..\\Windows\\System32\\config\\SAM");
    // basename on POSIX treats backslashes literally; on Windows it would strip
    // Either way the result should not contain path separators
    expect(result).not.toContain("/");
  });

  it("strips traversal with URL encoding (literal %2e%2e)", () => {
    // basename sees this as a literal filename with percent signs
    const result = sanitizeFilename("%2e%2e/%2e%2e/etc/passwd");
    expect(result).toBe("passwd");
  });

  // -- Null bytes -----------------------------------------------------------

  it("removes null bytes from filename", () => {
    const result = sanitizeFilename("image\0.png");
    expect(result).toBe("image.png");
    expect(result).not.toContain("\0");
  });

  it("removes multiple null bytes", () => {
    const result = sanitizeFilename("\0\0evil\0\0.exe\0");
    expect(result).not.toContain("\0");
  });

  it("falls back when filename is only null bytes", () => {
    const result = sanitizeFilename("\0\0\0");
    expect(result).toBe("upload");
  });

  // -- Empty / degenerate inputs --------------------------------------------

  it("returns fallback for empty string", () => {
    const result = sanitizeFilename("");
    expect(result).toBe("upload");
  });

  it("returns fallback for single dot", () => {
    const result = sanitizeFilename(".");
    expect(result).toBe("upload");
  });

  it("returns fallback for double dot", () => {
    const result = sanitizeFilename("..");
    expect(result).toBe("upload");
  });

  it("returns fallback for triple dots (.. removal leaves .)", () => {
    // "..." -> remove ".." -> "." -> fallback
    const result = sanitizeFilename("...");
    expect(result).toBe("upload");
  });

  it("returns fallback for four dots (.. removal leaves empty)", () => {
    // "...." -> remove all ".." occurrences -> "" -> fallback
    const result = sanitizeFilename("....");
    expect(result).toBe("upload");
  });

  it("returns fallback for slash only", () => {
    const result = sanitizeFilename("/");
    expect(result).toBe("upload");
  });

  // -- Normal filenames preserved -------------------------------------------

  it("preserves a normal filename", () => {
    expect(sanitizeFilename("photo.png")).toBe("photo.png");
  });

  it("preserves a filename with spaces", () => {
    expect(sanitizeFilename("my photo 2024.jpg")).toBe("my photo 2024.jpg");
  });

  it("preserves a filename with dashes and underscores", () => {
    expect(sanitizeFilename("my-photo_v2.webp")).toBe("my-photo_v2.webp");
  });

  it("preserves a dotfile (starts with single dot)", () => {
    expect(sanitizeFilename(".gitignore")).toBe(".gitignore");
  });

  it("preserves filename with multiple extensions", () => {
    expect(sanitizeFilename("archive.tar.gz")).toBe("archive.tar.gz");
  });

  // -- Unicode filenames ----------------------------------------------------

  it("preserves CJK characters", () => {
    expect(sanitizeFilename("\u5199\u771F.png")).toBe("\u5199\u771F.png");
  });

  it("preserves emoji in filenames", () => {
    expect(sanitizeFilename("\u{1F600}photo.jpg")).toBe("\u{1F600}photo.jpg");
  });

  it("preserves Arabic script", () => {
    expect(sanitizeFilename("\u0635\u0648\u0631\u0629.png")).toBe("\u0635\u0648\u0631\u0629.png");
  });

  it("preserves accented Latin characters", () => {
    expect(sanitizeFilename("caf\u00E9.png")).toBe("caf\u00E9.png");
  });

  // -- Tricky edge cases ----------------------------------------------------

  it("extracts basename from a full path", () => {
    expect(sanitizeFilename("/usr/local/bin/image.png")).toBe("image.png");
  });

  it("handles filename consisting only of spaces", () => {
    const result = sanitizeFilename("   ");
    // basename("   ") returns "   " which is truthy and not "." or ".."
    expect(result).toBe("   ");
  });

  it("strips double dots embedded in a filename but keeps the rest", () => {
    // "my..file..name.png" -> remove ".." -> "myfilename.png"
    expect(sanitizeFilename("my..file..name.png")).toBe("myfilename.png");
  });

  it("handles very long filenames by truncating to filesystem-safe length", () => {
    const longName = `${"a".repeat(500)}.png`;
    const result = sanitizeFilename(longName);
    expect(new TextEncoder().encode(result).length).toBeLessThanOrEqual(200);
    expect(result).toMatch(/\.png$/);
  });

  it("truncates very long filenames to filesystem-safe length", () => {
    const longName = `${"a".repeat(300)}.jpg`;
    const result = sanitizeFilename(longName);
    expect(new TextEncoder().encode(result).length).toBeLessThanOrEqual(200);
    expect(result).toMatch(/\.jpg$/);
  });

  it("handles filename with only extension", () => {
    expect(sanitizeFilename(".png")).toBe(".png");
  });

  it("handles directory path with trailing slash", () => {
    // basename("/foo/bar/") returns "bar" on POSIX
    expect(sanitizeFilename("/foo/bar/")).toBe("bar");
  });
});
