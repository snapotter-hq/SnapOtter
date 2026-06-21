import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { applyShadow } from "../../../apps/api/src/lib/beautify/shadow.js";

describe("applyShadow", () => {
  const makeImage = (w: number, h: number) =>
    sharp({
      create: {
        width: w,
        height: h,
        channels: 4,
        background: { r: 100, g: 100, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

  it("returns larger buffer with shadow applied", async () => {
    const img = await makeImage(200, 150);
    const result = await applyShadow(img, {
      blur: 20,
      offsetX: 0,
      offsetY: 10,
      color: "#000000",
      opacity: 30,
    });
    const meta = await sharp(result.buffer).metadata();
    expect(meta.width).toBeGreaterThan(200);
    expect(meta.height).toBeGreaterThan(150);
    expect(result.padLeft).toBeGreaterThanOrEqual(0);
    expect(result.padTop).toBeGreaterThanOrEqual(0);
  });

  it("returns image position within shadow canvas", async () => {
    const img = await makeImage(200, 150);
    const result = await applyShadow(img, {
      blur: 20,
      offsetX: 5,
      offsetY: 10,
      color: "#000000",
      opacity: 50,
    });
    expect(result.imgX).toBeDefined();
    expect(result.imgY).toBeDefined();
  });

  it("handles zero-blur shadow gracefully", async () => {
    const img = await makeImage(100, 100);
    const result = await applyShadow(img, {
      blur: 0,
      offsetX: 0,
      offsetY: 0,
      color: "#000000",
      opacity: 0,
    });
    const meta = await sharp(result.buffer).metadata();
    expect(meta.width).toBeGreaterThanOrEqual(100);
  });

  it("handles negative offsets", async () => {
    const img = await makeImage(200, 150);
    const result = await applyShadow(img, {
      blur: 15,
      offsetX: -10,
      offsetY: -5,
      color: "#ff0000",
      opacity: 40,
    });
    const meta = await sharp(result.buffer).metadata();
    expect(meta.width).toBeGreaterThan(200);
    expect(meta.height).toBeGreaterThan(150);
  });

  it("produces RGBA output with alpha channel", async () => {
    const img = await makeImage(100, 100);
    const result = await applyShadow(img, {
      blur: 10,
      offsetX: 0,
      offsetY: 5,
      color: "#000000",
      opacity: 30,
    });
    const meta = await sharp(result.buffer).metadata();
    expect(meta.hasAlpha).toBe(true);
    expect(meta.channels).toBe(4);
  });
});
