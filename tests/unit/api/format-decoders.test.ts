import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { decodeToSharpCompat, needsCliDecode } from "../../../apps/api/src/lib/format-decoders.js";
import { encodeQoi } from "../../../apps/api/src/lib/format-encoders.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

function isImageMagickError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.includes("No ImageMagick") || err.message.includes("ENOENT");
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

function isPng(buf: Buffer): boolean {
  return (
    buf[0] === PNG_MAGIC[0] &&
    buf[1] === PNG_MAGIC[1] &&
    buf[2] === PNG_MAGIC[2] &&
    buf[3] === PNG_MAGIC[3]
  );
}

async function assertValidImage(buf: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(buf).metadata();
  expect(meta.width).toBeGreaterThan(0);
  expect(meta.height).toBeGreaterThan(0);
  return { width: meta.width!, height: meta.height! };
}

// ==========================================================================
// needsCliDecode
// ==========================================================================

describe("needsCliDecode", () => {
  it("returns true for raw format", () => {
    expect(needsCliDecode("raw")).toBe(true);
  });

  it("returns true for ico format", () => {
    expect(needsCliDecode("ico")).toBe(true);
  });

  it("returns true for tga format", () => {
    expect(needsCliDecode("tga")).toBe(true);
  });

  it("returns true for psd format", () => {
    expect(needsCliDecode("psd")).toBe(true);
  });

  it("returns true for exr format", () => {
    expect(needsCliDecode("exr")).toBe(true);
  });

  it("returns true for hdr format", () => {
    expect(needsCliDecode("hdr")).toBe(true);
  });

  it("returns false for jpeg format", () => {
    expect(needsCliDecode("jpeg")).toBe(false);
  });

  it("returns false for png format", () => {
    expect(needsCliDecode("png")).toBe(false);
  });

  it("returns false for webp format", () => {
    expect(needsCliDecode("webp")).toBe(false);
  });

  it("returns false for gif format", () => {
    expect(needsCliDecode("gif")).toBe(false);
  });

  it("returns false for avif format", () => {
    expect(needsCliDecode("avif")).toBe(false);
  });

  it("returns false for svg format", () => {
    expect(needsCliDecode("svg")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(needsCliDecode("")).toBe(false);
  });

  it("returns true for bmp format", () => {
    expect(needsCliDecode("bmp")).toBe(true);
  });

  it("returns true for jxl format", () => {
    expect(needsCliDecode("jxl")).toBe(true);
  });

  it("returns false for unknown format", () => {
    expect(needsCliDecode("xyz")).toBe(false);
  });

  it("returns true for jp2 format", () => {
    expect(needsCliDecode("jp2")).toBe(true);
  });
  it("returns true for eps format", () => {
    expect(needsCliDecode("eps")).toBe(true);
  });
  it("returns true for dds format", () => {
    expect(needsCliDecode("dds")).toBe(true);
  });
  it("returns true for cur format", () => {
    expect(needsCliDecode("cur")).toBe(true);
  });
  it("returns true for dpx format", () => {
    expect(needsCliDecode("dpx")).toBe(true);
  });
  it("returns true for fits format", () => {
    expect(needsCliDecode("fits")).toBe(true);
  });
  it("returns true for qoi format", () => {
    expect(needsCliDecode("qoi")).toBe(true);
  });
  it("returns true for ppm format", () => {
    expect(needsCliDecode("ppm")).toBe(true);
  });
  it("returns true for pgm format", () => {
    expect(needsCliDecode("pgm")).toBe(true);
  });
  it("returns true for pbm format", () => {
    expect(needsCliDecode("pbm")).toBe(true);
  });
});

describe("decodeToSharpCompat", () => {
  it("returns buffer unchanged for unknown/native formats", async () => {
    const buf = Buffer.from("test data");
    const result = await decodeToSharpCompat(buf, "jpeg");
    expect(result).toBe(buf);
  });

  it("returns buffer unchanged for png format", async () => {
    const buf = Buffer.from("png data");
    const result = await decodeToSharpCompat(buf, "png");
    expect(result).toBe(buf);
  });

  it("returns buffer unchanged for empty format string", async () => {
    const buf = Buffer.from("some bytes");
    const result = await decodeToSharpCompat(buf, "");
    expect(result).toBe(buf);
  });

  it("returns buffer unchanged for webp format", async () => {
    const buf = Buffer.from("webp");
    const result = await decodeToSharpCompat(buf, "webp");
    expect(result).toBe(buf);
  });

  it("returns buffer unchanged for gif format", async () => {
    const buf = Buffer.from("gif data");
    const result = await decodeToSharpCompat(buf, "gif");
    expect(result).toBe(buf);
  });

  it("returns buffer unchanged for avif format", async () => {
    const buf = Buffer.from("avif data");
    const result = await decodeToSharpCompat(buf, "avif");
    expect(result).toBe(buf);
  });

  it("returns buffer unchanged for tiff format", async () => {
    const buf = Buffer.from("tiff data");
    const result = await decodeToSharpCompat(buf, "tiff");
    expect(result).toBe(buf);
  });

  it("decodes BMP to valid PNG", async () => {
    try {
      const input = readFixture(fixtures.image.formats("bmp"));
      const result = await decodeToSharpCompat(input, "bmp");
      expect(isPng(result)).toBe(true);
      await assertValidImage(result);
    } catch (err) {
      if (isImageMagickError(err)) return;
      throw err;
    }
  });

  it("decodes ICO to valid PNG", async () => {
    try {
      const input = readFixture(fixtures.image.formats("ico"));
      const result = await decodeToSharpCompat(input, "ico");
      expect(isPng(result)).toBe(true);
      await assertValidImage(result);
    } catch (err) {
      if (isImageMagickError(err)) return;
      throw err;
    }
  });

  it("decodes TGA to valid PNG", async () => {
    try {
      const input = readFixture(fixtures.image.formats("tga"));
      const result = await decodeToSharpCompat(input, "tga");
      expect(isPng(result)).toBe(true);
      await assertValidImage(result);
    } catch (err) {
      if (isImageMagickError(err)) return;
      throw err;
    }
  });

  it("decodes PSD to valid PNG", async () => {
    try {
      const input = readFixture(fixtures.image.formats("psd"));
      const result = await decodeToSharpCompat(input, "psd");
      expect(isPng(result)).toBe(true);
      await assertValidImage(result);
    } catch (err) {
      if (isImageMagickError(err)) return;
      throw err;
    }
  });

  it("decodes EXR to valid PNG (requires EXR delegate)", async () => {
    try {
      const input = readFixture(fixtures.image.formats("exr"));
      const result = await decodeToSharpCompat(input, "exr");
      expect(isPng(result)).toBe(true);
      await assertValidImage(result);
    } catch (err) {
      if (isImageMagickError(err)) return;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("no decode delegate")) return;
      throw err;
    }
  });

  it("decodes HDR to valid PNG", async () => {
    try {
      const input = readFixture(fixtures.image.formats("hdr"));
      const result = await decodeToSharpCompat(input, "hdr");
      expect(isPng(result)).toBe(true);
      await assertValidImage(result);
    } catch (err) {
      if (isImageMagickError(err)) return;
      throw err;
    }
  });

  it("decodes JXL to valid PNG", async () => {
    try {
      const input = readFixture(fixtures.image.formats("jxl"));
      const result = await decodeToSharpCompat(input, "jxl");
      expect(isPng(result)).toBe(true);
      await assertValidImage(result);
    } catch (err) {
      if (isImageMagickError(err)) return;
      throw err;
    }
  });

  it("decodes JP2 to valid PNG", async () => {
    try {
      const input = readFixture(fixtures.image.formats("jp2"));
      const result = await decodeToSharpCompat(input, "jp2");
      expect(isPng(result)).toBe(true);
      await assertValidImage(result);
    } catch (err) {
      if (isImageMagickError(err)) return;
      throw err;
    }
  });

  it("decodes DDS to valid PNG", async () => {
    try {
      const input = readFixture(fixtures.image.formats("dds"));
      const result = await decodeToSharpCompat(input, "dds");
      expect(isPng(result)).toBe(true);
      await assertValidImage(result);
    } catch (err) {
      if (isImageMagickError(err)) return;
      throw err;
    }
  });

  it("decodes CUR using ICO decoder to valid PNG", async () => {
    try {
      const input = readFixture(fixtures.image.formats("cur"));
      const result = await decodeToSharpCompat(input, "cur");
      expect(isPng(result)).toBe(true);
      await assertValidImage(result);
    } catch (err) {
      if (isImageMagickError(err)) return;
      throw err;
    }
  });

  it("decodes DPX to valid PNG", async () => {
    try {
      const input = readFixture(fixtures.image.formats("dpx"));
      const result = await decodeToSharpCompat(input, "dpx");
      expect(isPng(result)).toBe(true);
      await assertValidImage(result);
    } catch (err) {
      if (isImageMagickError(err)) return;
      throw err;
    }
  });

  it("decodes FITS to valid PNG (requires FITS delegate)", async () => {
    try {
      const input = readFixture(fixtures.image.formats("fits"));
      const result = await decodeToSharpCompat(input, "fits");
      expect(isPng(result)).toBe(true);
      await assertValidImage(result);
    } catch (err) {
      if (isImageMagickError(err)) return;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("no decode delegate")) return;
      throw err;
    }
  });

  it("decodes PPM to valid PNG", async () => {
    try {
      const input = readFixture(fixtures.image.formats("ppm"));
      const result = await decodeToSharpCompat(input, "ppm");
      expect(isPng(result)).toBe(true);
      await assertValidImage(result);
    } catch (err) {
      if (isImageMagickError(err)) return;
      throw err;
    }
  });

  it("decodes PGM to valid PNG", async () => {
    try {
      const input = readFixture(fixtures.image.formats("pgm"));
      const result = await decodeToSharpCompat(input, "pgm");
      expect(isPng(result)).toBe(true);
      await assertValidImage(result);
    } catch (err) {
      if (isImageMagickError(err)) return;
      throw err;
    }
  });

  it("decodes PBM to valid PNG", async () => {
    try {
      const input = readFixture(fixtures.image.formats("pbm"));
      const result = await decodeToSharpCompat(input, "pbm");
      expect(isPng(result)).toBe(true);
      await assertValidImage(result);
    } catch (err) {
      if (isImageMagickError(err)) return;
      throw err;
    }
  });
});

describe("decodeToSharpCompat - individual decoder verification", () => {
  const formats = ["bmp", "ico", "tga", "psd", "hdr", "jxl", "jp2", "dds", "dpx"] as const;

  for (const fmt of formats) {
    it(`${fmt}: output has non-zero dimensions`, async () => {
      try {
        const input = readFixture(fixtures.image.formats(fmt));
        const result = await decodeToSharpCompat(input, fmt);
        const { width, height } = await assertValidImage(result);
        expect(width).toBeGreaterThan(0);
        expect(height).toBeGreaterThan(0);
      } catch (err) {
        if (isImageMagickError(err)) return;
        throw err;
      }
    });
  }

  const delegateFormats = ["exr", "fits"] as const;

  for (const fmt of delegateFormats) {
    it(`${fmt}: output has non-zero dimensions (requires delegate)`, async () => {
      try {
        const input = readFixture(fixtures.image.formats(fmt));
        const result = await decodeToSharpCompat(input, fmt);
        const { width, height } = await assertValidImage(result);
        expect(width).toBeGreaterThan(0);
        expect(height).toBeGreaterThan(0);
      } catch (err) {
        if (isImageMagickError(err)) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("no decode delegate")) return;
        throw err;
      }
    });
  }
});

describe("decodeToSharpCompat - QOI decoder", () => {
  it("decodes QOI fixture to valid PNG", async () => {
    const input = readFixture(fixtures.image.formats("qoi"));
    const result = await decodeToSharpCompat(input, "qoi");
    expect(isPng(result)).toBe(true);
    await assertValidImage(result);
  });

  it("round-trips PNG -> QOI -> PNG", async () => {
    const png = readFixture(fixtures.image.formats("png"));
    const qoi = await encodeQoi(png);
    const decoded = await decodeToSharpCompat(Buffer.from(qoi), "qoi");
    expect(isPng(decoded)).toBe(true);
    const { width, height } = await assertValidImage(decoded);
    const originalMeta = await sharp(png).metadata();
    expect(width).toBe(originalMeta.width);
    expect(height).toBe(originalMeta.height);
  });

  it("decoded QOI produces a buffer sharp can process further", async () => {
    const input = readFixture(fixtures.image.formats("qoi"));
    const decoded = await decodeToSharpCompat(input, "qoi");
    const resized = await sharp(decoded).resize(10, 10).png().toBuffer();
    expect(resized.length).toBeGreaterThan(0);
  });
});

describe("decodeToSharpCompat - EPS size limit", () => {
  it("rejects EPS files over 50MB", async () => {
    const largeBuffer = Buffer.alloc(51 * 1024 * 1024);
    await expect(decodeToSharpCompat(largeBuffer, "eps")).rejects.toThrow(/EPS file too large/);
  });
});
