import { readFileSync } from "node:fs";
import path from "node:path";
import { detectFormat } from "@snapotter/image-engine";
import { describe, expect, it } from "vitest";
import { fixtureDir, fixtures, readFixture } from "../../fixtures/index.js";

// ---------------------------------------------------------------------------
// Format detection via Sharp metadata + magic byte fallback
// ---------------------------------------------------------------------------
describe("detectFormat", () => {
  // Formats that Sharp can natively detect via metadata
  const sharpNativeFormats: Array<{ file: string; expected: string }> = [
    { file: "sample.jpg", expected: "jpeg" },
    { file: "sample.png", expected: "png" },
    { file: "sample.webp", expected: "webp" },
    { file: "sample.gif", expected: "gif" },
    { file: "sample.avif", expected: "heif" }, // Sharp reports AVIF as "heif"
    { file: "sample.tiff", expected: "tiff" },
    { file: "sample.svg", expected: "svg" },
  ];

  for (const { file, expected } of sharpNativeFormats) {
    it(`detects ${file} as "${expected}" via Sharp metadata`, async () => {
      const buffer = readFileSync(path.join(fixtureDir.formats, file));
      const format = await detectFormat(buffer);
      expect(format).toBe(expected);
    });
  }

  // Formats that require magic byte fallback because Sharp cannot parse them
  const magicByteFormats: Array<{ file: string; expected: string }> = [
    { file: "sample.bmp", expected: "bmp" },
    { file: "sample.ico", expected: "ico" },
    { file: "sample.psd", expected: "psd" },
    { file: "sample.exr", expected: "exr" },
  ];

  for (const { file, expected } of magicByteFormats) {
    it(`detects ${file} as "${expected}" via magic bytes`, async () => {
      const buffer = readFileSync(path.join(fixtureDir.formats, file));
      const format = await detectFormat(buffer);
      expect(format).toBe(expected);
    });
  }

  // HEIC/HEIF - Sharp may or may not handle these depending on libheif
  it("detects sample.heic via Sharp or magic bytes", async () => {
    const buffer = readFixture(fixtures.image.formats("heic"));
    const format = await detectFormat(buffer);
    // Sharp may report "heif" or magic bytes may detect "avif" (ftyp box)
    expect(["heif", "avif"]).toContain(format);
  });

  it("detects sample.heif via Sharp or magic bytes", async () => {
    const buffer = readFixture(fixtures.image.formats("heif"));
    const format = await detectFormat(buffer);
    expect(["heif", "avif"]).toContain(format);
  });

  // JXL detection
  it("detects sample.jxl", async () => {
    const buffer = readFixture(fixtures.image.formats("jxl"));
    const format = await detectFormat(buffer);
    // Sharp may detect "jxl" natively or magic bytes catch it
    expect(["jxl", "unknown"]).toContain(format);
  });

  // ---------------------------------------------------------------------------
  // Synthetic magic byte buffers
  // ---------------------------------------------------------------------------
  describe("magic byte detection with synthetic buffers", () => {
    it("detects PNG magic bytes", async () => {
      const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
      const format = await detectFormat(buf);
      expect(format).toBe("png");
    });

    it("detects JPEG magic bytes", async () => {
      const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
      const format = await detectFormat(buf);
      expect(format).toBe("jpeg");
    });

    it("detects GIF magic bytes", async () => {
      const buf = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0, 0]);
      const format = await detectFormat(buf);
      expect(format).toBe("gif");
    });

    it("detects WEBP magic bytes (RIFF + WEBP)", async () => {
      // RIFF....WEBP
      const buf = Buffer.alloc(16);
      buf[0] = 0x52;
      buf[1] = 0x49;
      buf[2] = 0x46;
      buf[3] = 0x46; // RIFF
      buf[8] = 0x57;
      buf[9] = 0x45;
      buf[10] = 0x42;
      buf[11] = 0x50; // WEBP
      const format = await detectFormat(buf);
      expect(format).toBe("webp");
    });

    it("rejects RIFF without WEBP signature", async () => {
      const buf = Buffer.alloc(16);
      buf[0] = 0x52;
      buf[1] = 0x49;
      buf[2] = 0x46;
      buf[3] = 0x46; // RIFF
      buf[8] = 0x41;
      buf[9] = 0x56;
      buf[10] = 0x49;
      buf[11] = 0x20; // AVI
      const format = await detectFormat(buf);
      // Should not detect as webp; might detect as tiff or unknown
      expect(format).not.toBe("webp");
    });

    it("detects little-endian TIFF magic bytes", async () => {
      const buf = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]);
      const format = await detectFormat(buf);
      expect(format).toBe("tiff");
    });

    it("detects big-endian TIFF magic bytes", async () => {
      const buf = Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 0, 0, 0, 0, 0]);
      const format = await detectFormat(buf);
      expect(format).toBe("tiff");
    });

    it("detects BMP magic bytes", async () => {
      const buf = Buffer.from([0x42, 0x4d, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      const format = await detectFormat(buf);
      expect(format).toBe("bmp");
    });

    it("detects ICO magic bytes", async () => {
      const buf = Buffer.from([0x00, 0x00, 0x01, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]);
      const format = await detectFormat(buf);
      expect(format).toBe("ico");
    });

    it("detects PSD magic bytes", async () => {
      const buf = Buffer.from([0x38, 0x42, 0x50, 0x53, 0, 0, 0, 0, 0, 0, 0, 0]);
      const format = await detectFormat(buf);
      expect(format).toBe("psd");
    });

    it("detects OpenEXR magic bytes", async () => {
      const buf = Buffer.from([0x76, 0x2f, 0x31, 0x01, 0, 0, 0, 0, 0, 0, 0, 0]);
      const format = await detectFormat(buf);
      expect(format).toBe("exr");
    });

    it("detects AVIF magic bytes (ftyp at offset 4 with avif brand)", async () => {
      const buf = Buffer.alloc(16);
      // ftyp at offset 4
      buf[4] = 0x66;
      buf[5] = 0x74;
      buf[6] = 0x79;
      buf[7] = 0x70;
      // brand "avif" at offset 8
      buf[8] = 0x61;
      buf[9] = 0x76;
      buf[10] = 0x69;
      buf[11] = 0x66;
      const format = await detectFormat(buf);
      expect(format).toBe("avif");
    });

    it("detects AVIF magic bytes with avis brand", async () => {
      const buf = Buffer.alloc(16);
      buf[4] = 0x66;
      buf[5] = 0x74;
      buf[6] = 0x79;
      buf[7] = 0x70;
      buf[8] = 0x61;
      buf[9] = 0x76;
      buf[10] = 0x69;
      buf[11] = 0x73; // "avis"
      const format = await detectFormat(buf);
      expect(format).toBe("avif");
    });

    it("rejects ftyp box with non-AVIF brand", async () => {
      const buf = Buffer.alloc(16);
      buf[4] = 0x66;
      buf[5] = 0x74;
      buf[6] = 0x79;
      buf[7] = 0x70;
      buf[8] = 0x69;
      buf[9] = 0x73;
      buf[10] = 0x6f;
      buf[11] = 0x6d; // "isom"
      const format = await detectFormat(buf);
      expect(format).not.toBe("avif");
    });

    it("rejects ftyp box when buffer too short to read brand (< 12 bytes)", async () => {
      // Buffer has ftyp at offset 4 but is only 8 bytes long -- too short for brand
      const buf = Buffer.alloc(8);
      buf[4] = 0x66;
      buf[5] = 0x74;
      buf[6] = 0x79;
      buf[7] = 0x70; // "ftyp"
      const format = await detectFormat(buf);
      expect(format).not.toBe("avif");
    });

    it("detects JXL ISOBMFF container magic bytes", async () => {
      const buf = Buffer.from([0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0, 0, 0, 0]);
      const format = await detectFormat(buf);
      expect(format).toBe("jxl");
    });

    it("detects JXL raw codestream magic bytes", async () => {
      const buf = Buffer.from([0xff, 0x0a, 0, 0, 0, 0, 0, 0]);
      const format = await detectFormat(buf);
      // Note: 0xFF 0x0A starts with 0xFF which also matches JPEG prefix,
      // but JPEG needs 0xFF 0xD8 0xFF, so the JPEG check fails and JXL wins
      expect(format).toBe("jxl");
    });

    it("detects PPM P3 (ASCII) magic bytes", async () => {
      // P3 = 0x50 0x33
      const buf = Buffer.from([0x50, 0x33, 0x0a, 0x23, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(await detectFormat(buf)).toBe("ppm");
    });

    it("detects PPM P6 (binary) magic bytes", async () => {
      // P6 = 0x50 0x36
      const buf = Buffer.from([0x50, 0x36, 0x0a, 0x36, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(await detectFormat(buf)).toBe("ppm");
    });

    it("detects JP2 box signature magic bytes", async () => {
      const buf = Buffer.from([
        0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a, 0x87, 0x0a, 0, 0, 0, 0,
      ]);
      expect(await detectFormat(buf)).toBe("jp2");
    });

    it("detects J2K raw codestream magic bytes", async () => {
      const buf = Buffer.from([0xff, 0x4f, 0xff, 0x51, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(await detectFormat(buf)).toBe("jp2");
    });

    it("returns 'unknown' for unrecognized bytes", async () => {
      const buf = Buffer.from([0xde, 0xad, 0xbe, 0xef, 0, 0, 0, 0, 0, 0, 0, 0]);
      const format = await detectFormat(buf);
      expect(format).toBe("unknown");
    });

    it("returns 'unknown' for empty buffer", async () => {
      const format = await detectFormat(Buffer.alloc(0));
      expect(format).toBe("unknown");
    });

    it("returns 'unknown' for very short buffer", async () => {
      const format = await detectFormat(Buffer.from([0x89]));
      expect(format).toBe("unknown");
    });

    it("detects DDS magic bytes", async () => {
      const buf = Buffer.from([0x44, 0x44, 0x53, 0x20, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(await detectFormat(buf)).toBe("dds");
    });

    it("detects CUR magic bytes", async () => {
      const buf = Buffer.from([0x00, 0x00, 0x02, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(await detectFormat(buf)).toBe("cur");
    });

    it("detects DPX forward magic bytes", async () => {
      const buf = Buffer.from([0x53, 0x44, 0x50, 0x58, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(await detectFormat(buf)).toBe("dpx");
    });

    it("detects FITS magic bytes", async () => {
      const buf = Buffer.from([0x53, 0x49, 0x4d, 0x50, 0x4c, 0x45, 0, 0, 0, 0, 0, 0]);
      expect(await detectFormat(buf)).toBe("fits");
    });

    it("detects EPS ASCII magic bytes", async () => {
      const buf = Buffer.from([0x25, 0x21, 0x50, 0x53, 0x2d, 0x41, 0x64, 0x6f, 0x62, 0x65, 0, 0]);
      expect(await detectFormat(buf)).toBe("eps");
    });

    it("detects EPS DOS binary magic bytes", async () => {
      const buf = Buffer.from([0xc5, 0xd0, 0xd3, 0xc6, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(await detectFormat(buf)).toBe("eps");
    });

    it("detects QOI magic bytes", async () => {
      const buf = Buffer.from([0x71, 0x6f, 0x69, 0x66, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(await detectFormat(buf)).toBe("qoi");
    });
  });

  describe("exotic format detection from fixtures", () => {
    it("detects sample.ppm as ppm (P6 magic bytes)", async () => {
      const buffer = readFixture(fixtures.image.formats("ppm"));
      expect(await detectFormat(buffer)).toBe("ppm");
    });

    it("detects sample.dng as tiff (DNG shares TIFF magic bytes)", async () => {
      const buffer = readFixture(fixtures.image.formats("dng"));
      expect(await detectFormat(buffer)).toBe("tiff");
    });

    it("detects sample.jp2 as jp2 (JPEG 2000 box signature)", async () => {
      const buffer = readFixture(fixtures.image.formats("jp2"));
      expect(await detectFormat(buffer)).toBe("jp2");
    });

    it("detects sample.svgz as svg (Sharp reads gzip-compressed SVG)", async () => {
      const buffer = readFixture(fixtures.image.formats("svgz"));
      expect(await detectFormat(buffer)).toBe("svg");
    });

    // PBM (P4) and PGM (P5) have no magic byte entries and Sharp cannot parse them
    it("cannot detect sample.pbm (no P4 magic bytes registered)", async () => {
      const buffer = readFixture(fixtures.image.formats("pbm"));
      expect(await detectFormat(buffer)).toBe("unknown");
    });

    it("cannot detect sample.pgm (no P5 magic bytes registered)", async () => {
      const buffer = readFixture(fixtures.image.formats("pgm"));
      expect(await detectFormat(buffer)).toBe("unknown");
    });

    // HDR has a text header (#?RGBE) not matched by magic byte table
    it("cannot detect sample.hdr (Radiance text header not in magic bytes)", async () => {
      const buffer = readFixture(fixtures.image.formats("hdr"));
      expect(await detectFormat(buffer)).toBe("unknown");
    });

    // TGA has no reliable magic bytes; its header can collide with other formats
    it("does not reliably detect sample.tga (no TGA-specific magic bytes)", async () => {
      const buffer = readFixture(fixtures.image.formats("tga"));
      // TGA detection is extension-based in validateImageBuffer, not in detectFormat
      expect(await detectFormat(buffer)).not.toBe("tga");
    });
  });

  describe("real fixture format detection", () => {
    const fixtures: Array<{ file: string; expected: string[] }> = [
      { file: "sample.dds", expected: ["dds", "unknown"] },
      { file: "sample.cur", expected: ["cur", "ico", "unknown"] },
      { file: "sample.dpx", expected: ["dpx", "unknown"] },
      { file: "sample.fits", expected: ["fits", "unknown"] },
      { file: "sample.eps", expected: ["eps", "unknown"] },
      { file: "sample.qoi", expected: ["qoi", "unknown"] },
      { file: "sample.apng", expected: ["png"] },
    ];

    for (const { file, expected } of fixtures) {
      it(`detects ${file}`, async () => {
        const buffer = readFileSync(path.join(fixtureDir.formats, file));
        const format = await detectFormat(buffer);
        expect(expected).toContain(format);
      });
    }
  });
});
