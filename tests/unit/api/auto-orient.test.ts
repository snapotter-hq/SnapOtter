import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { autoOrient } from "../../../apps/api/src/lib/auto-orient.js";

async function createImageWithOrientation(orientation: number): Promise<Buffer> {
  return sharp({
    create: {
      width: 100,
      height: 50,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .withMetadata({ orientation })
    .jpeg()
    .toBuffer();
}

/**
 * A JPEG carrying an EXIF orientation, filled with deterministic high-frequency
 * noise so the encoder's quality setting actually moves the file size. A flat
 * fill compresses to the same handful of bytes at any quality, which would hide
 * the very difference this test is about.
 */
async function createDetailedJpegWithOrientation(orientation: number): Promise<Buffer> {
  const width = 128;
  const height = 128;
  const channels = 3;
  const raw = Buffer.alloc(width * height * channels);
  let seed = 12345;
  for (let i = 0; i < raw.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    raw[i] = (seed >> 16) & 0xff;
  }
  return sharp(raw, { raw: { width, height, channels } })
    .withMetadata({ orientation })
    .jpeg()
    .toBuffer();
}

describe("autoOrient", () => {
  it("returns original buffer unchanged when orientation is 1", async () => {
    const buf = await createImageWithOrientation(1);
    const result = await autoOrient(buf);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(50);
  });

  it("returns original buffer unchanged when no EXIF orientation is present", async () => {
    const buf = await sharp({
      create: {
        width: 80,
        height: 60,
        channels: 3,
        background: { r: 0, g: 255, b: 0 },
      },
    })
      .png()
      .toBuffer();
    const result = await autoOrient(buf);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(80);
    expect(meta.height).toBe(60);
  });

  it("rotates image when orientation is 6 (90 CW)", async () => {
    const buf = await createImageWithOrientation(6);
    const meta = await sharp(buf).metadata();
    expect(meta.orientation).toBe(6);
    const result = await autoOrient(buf);
    const resultMeta = await sharp(result).metadata();
    expect(resultMeta.width).toBe(50);
    expect(resultMeta.height).toBe(100);
  });

  it("rotates image when orientation is 8 (270 CW)", async () => {
    const buf = await createImageWithOrientation(8);
    const meta = await sharp(buf).metadata();
    expect(meta.orientation).toBe(8);
    const result = await autoOrient(buf);
    const resultMeta = await sharp(result).metadata();
    expect(resultMeta.width).toBe(50);
    expect(resultMeta.height).toBe(100);
  });

  it("rotates image when orientation is 3 (180)", async () => {
    const buf = await createImageWithOrientation(3);
    const meta = await sharp(buf).metadata();
    expect(meta.orientation).toBe(3);
    const result = await autoOrient(buf);
    const resultMeta = await sharp(result).metadata();
    expect(resultMeta.width).toBe(100);
    expect(resultMeta.height).toBe(50);
  });

  it("handles orientation 2 (horizontal flip)", async () => {
    const buf = await createImageWithOrientation(2);
    const origMeta = await sharp(buf).metadata();
    expect(origMeta.orientation).toBe(2);
    const result = await autoOrient(buf);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(50);
  });

  it("strips orientation tag after rotation", async () => {
    const buf = await createImageWithOrientation(6);
    const beforeMeta = await sharp(buf).metadata();
    expect(beforeMeta.orientation).toBe(6);
    const result = await autoOrient(buf);
    const meta = await sharp(result).metadata();
    expect(meta.orientation === undefined || meta.orientation === 1).toBe(true);
  });

  it("re-encodes a rotated JPEG in its own format at quality 95, not Sharp's default", async () => {
    const buf = await createDetailedJpegWithOrientation(6);
    const result = await autoOrient(buf);

    // Format is preserved: a rotated JPEG stays a JPEG rather than being
    // promoted to PNG.
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("jpeg");

    // The intended encode names quality 95, the same quality the rest of the
    // pipeline uses. A bare toBuffer() re-encodes at Sharp's JPEG default
    // (~80), which on this noisy image is a markedly smaller file. Comparing
    // against both reference encodes computed with the same Sharp keeps this
    // deterministic across platforms.
    const atQuality95 = await sharp(buf).rotate().toFormat("jpeg", { quality: 95 }).toBuffer();
    const atSharpDefault = await sharp(buf).rotate().toBuffer();

    expect(atSharpDefault.length).toBeLessThan(atQuality95.length);
    expect(result.length).toBe(atQuality95.length);
    expect(result.equals(atQuality95)).toBe(true);
  });

  it("returns original buffer for corrupted/invalid input", async () => {
    const invalid = Buffer.from("this is not an image at all");
    const result = await autoOrient(invalid);
    expect(result.equals(invalid)).toBe(true);
  });

  it("returns original buffer for empty buffer", async () => {
    const empty = Buffer.alloc(0);
    const result = await autoOrient(empty);
    expect(result.equals(empty)).toBe(true);
  });
});
