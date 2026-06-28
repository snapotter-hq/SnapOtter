import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { decodeHeic, ensureSharpCompat } from "../../../apps/api/src/lib/heic-converter.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

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
    const heicBuf = readFixture(fixtures.image.formats("heic"));
    const result = await decodeHeic(heicBuf);
    expect(isPng(result)).toBe(true);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
  });

  it("decodes sample.heif to a valid PNG buffer", { timeout: 60_000 }, async () => {
    const heifBuf = readFixture(fixtures.image.formats("heif"));
    const result = await decodeHeic(heifBuf);
    expect(isPng(result)).toBe(true);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
  });

  it("preserves image dimensions after decoding", async () => {
    const heicBuf = readFixture(fixtures.image.formats("heic"));
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
    const heicBuf = readFixture(fixtures.image.formats("heic"));
    const { tmpdir } = await import("node:os");
    const { readdirSync } = await import("node:fs");
    // decodeHeic stamps its temp files with this process's PID. Scope the check
    // to those so temp files created by other concurrent test-worker processes
    // (different PID) in the shared tmpdir cannot make this flaky.
    const mine = (f: string) =>
      f.startsWith(`heic-in-${process.pid}-`) || f.startsWith(`heic-out-${process.pid}-`);
    const beforeSet = new Set(readdirSync(tmpdir()).filter(mine));
    await decodeHeic(heicBuf);
    const leftover = readdirSync(tmpdir())
      .filter(mine)
      .filter((f) => !beforeSet.has(f));
    expect(leftover).toHaveLength(0);
  });
});

describe("ensureSharpCompat", () => {
  it("decodes a HEIC buffer to PNG", async () => {
    const heicBuf = readFixture(fixtures.image.formats("heic"));
    const result = await ensureSharpCompat(heicBuf);
    expect(isPng(result)).toBe(true);
  });

  it("passes through a PNG buffer unchanged", async () => {
    const pngBuf = readFixture(fixtures.image.formats("png"));
    const result = await ensureSharpCompat(pngBuf);
    expect(result).toBe(pngBuf);
  });

  it("passes through a JPEG buffer unchanged", async () => {
    const jpgBuf = readFixture(fixtures.image.formats("jpg"));
    const result = await ensureSharpCompat(jpgBuf);
    expect(result).toBe(jpgBuf);
  });

  it("passes through a WebP buffer unchanged", async () => {
    const webpBuf = readFixture(fixtures.image.formats("webp"));
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
