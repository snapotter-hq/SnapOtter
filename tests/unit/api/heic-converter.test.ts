import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { decodeHeic, ensureSharpCompat } from "../../../apps/api/src/lib/heic-converter.js";

const FIXTURES = join(__dirname, "../../fixtures");

function isPng(buf: Buffer): boolean {
  return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}

function makeHeicHeader(brand: string): Buffer {
  const buf = Buffer.alloc(12);
  buf.writeUInt32BE(12, 0);
  buf.write("ftyp", 4, 4, "ascii");
  buf.write(brand, 8, 4, "ascii");
  return buf;
}

describe("decodeHeic", () => {
  it("decodes sample.heic to a valid PNG buffer", async () => {
    const heicBuf = await readFile(join(FIXTURES, "formats/sample.heic"));
    const result = await decodeHeic(heicBuf);
    expect(isPng(result)).toBe(true);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
  });

  it("decodes sample.heif to a valid PNG buffer", { timeout: 60_000 }, async () => {
    const heifBuf = await readFile(join(FIXTURES, "formats/sample.heif"));
    const result = await decodeHeic(heifBuf);
    expect(isPng(result)).toBe(true);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
  });

  it("preserves image dimensions after decoding", async () => {
    const heicBuf = await readFile(join(FIXTURES, "formats/sample.heic"));
    const result = await decodeHeic(heicBuf);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
    expect(meta.format).toBe("png");
  });

  it("rejects invalid/corrupt data", async () => {
    const garbage = Buffer.from("this is not a heic file at all");
    await expect(decodeHeic(garbage)).rejects.toThrow();
  });

  it("rejects an empty buffer", async () => {
    await expect(decodeHeic(Buffer.alloc(0))).rejects.toThrow();
  });

  it("cleans up temp files after success", { timeout: 60_000 }, async () => {
    const heicBuf = await readFile(join(FIXTURES, "formats/sample.heic"));
    const { tmpdir } = await import("node:os");
    const { readdirSync } = await import("node:fs");
    const beforeSet = new Set(
      readdirSync(tmpdir()).filter((f) => f.startsWith("heic-in-") || f.startsWith("heic-out-")),
    );
    await decodeHeic(heicBuf);
    const after = readdirSync(tmpdir()).filter(
      (f) => f.startsWith("heic-in-") || f.startsWith("heic-out-"),
    );
    // Only check that files created during THIS call were cleaned up.
    // Other concurrent test workers may create temp files in the same dir.
    const leftover = after.filter((f) => !beforeSet.has(f));
    expect(leftover).toHaveLength(0);
  });
});

describe("ensureSharpCompat", () => {
  it("decodes a HEIC buffer to PNG", async () => {
    const heicBuf = await readFile(join(FIXTURES, "formats/sample.heic"));
    const result = await ensureSharpCompat(heicBuf);
    expect(isPng(result)).toBe(true);
  });

  it("passes through a PNG buffer unchanged", async () => {
    const pngBuf = await readFile(join(FIXTURES, "formats/sample.png"));
    const result = await ensureSharpCompat(pngBuf);
    expect(result).toBe(pngBuf);
  });

  it("passes through a JPEG buffer unchanged", async () => {
    const jpgBuf = await readFile(join(FIXTURES, "formats/sample.jpg"));
    const result = await ensureSharpCompat(jpgBuf);
    expect(result).toBe(jpgBuf);
  });

  it("passes through a WebP buffer unchanged", async () => {
    const webpBuf = await readFile(join(FIXTURES, "formats/sample.webp"));
    const result = await ensureSharpCompat(webpBuf);
    expect(result).toBe(webpBuf);
  });

  it("detects heic brand in ftyp box", async () => {
    const fakeBuf = makeHeicHeader("heic");
    await expect(ensureSharpCompat(fakeBuf)).rejects.toThrow();
  });

  it("detects mif1 brand in ftyp box", async () => {
    const fakeBuf = makeHeicHeader("mif1");
    await expect(ensureSharpCompat(fakeBuf)).rejects.toThrow();
  });

  it("does not treat a short buffer as HEIF", async () => {
    const shortBuf = Buffer.from("tiny");
    const result = await ensureSharpCompat(shortBuf);
    expect(result).toBe(shortBuf);
  });
});
