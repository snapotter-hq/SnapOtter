import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { renderFrame } from "../../../apps/api/src/lib/beautify/frames.js";

describe("renderFrame", () => {
  const makeImage = (w: number, h: number) =>
    sharp({
      create: {
        width: w,
        height: h,
        channels: 4,
        background: { r: 200, g: 200, b: 200, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

  it("returns original image for frame 'none'", async () => {
    const img = await makeImage(400, 300);
    const result = await renderFrame(img, "none");
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
  });

  it("renders macOS light frame with title bar above image", async () => {
    const img = await makeImage(400, 300);
    const result = await renderFrame(img, "macos-light", "My App");
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height!).toBeGreaterThan(300);
  });

  it("renders macOS dark frame", async () => {
    const img = await makeImage(400, 300);
    const result = await renderFrame(img, "macos-dark");
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height!).toBeGreaterThan(300);
  });

  it("renders Windows light frame", async () => {
    const img = await makeImage(400, 300);
    const result = await renderFrame(img, "windows-light");
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height!).toBeGreaterThan(300);
  });

  it("renders Windows dark frame", async () => {
    const img = await makeImage(400, 300);
    const result = await renderFrame(img, "windows-dark");
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height!).toBeGreaterThan(300);
  });

  it("renders browser light frame with URL bar", async () => {
    const img = await makeImage(400, 300);
    const result = await renderFrame(img, "browser-light", "example.com");
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height!).toBeGreaterThan(300);
  });

  it("renders browser dark frame", async () => {
    const img = await makeImage(400, 300);
    const result = await renderFrame(img, "browser-dark", "app.test.com");
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height!).toBeGreaterThan(300);
  });

  it("renders iPhone frame with image composited into screen area", async () => {
    const img = await makeImage(400, 800);
    const result = await renderFrame(img, "iphone");
    const meta = await sharp(result).metadata();
    expect(meta.width!).toBeGreaterThan(400);
    expect(meta.height!).toBeGreaterThan(800);
  });

  it("renders MacBook frame", async () => {
    const img = await makeImage(800, 500);
    const result = await renderFrame(img, "macbook");
    const meta = await sharp(result).metadata();
    expect(meta.width!).toBeGreaterThan(800);
  });

  it("renders iPad frame", async () => {
    const img = await makeImage(400, 600);
    const result = await renderFrame(img, "ipad");
    const meta = await sharp(result).metadata();
    expect(meta.width!).toBeGreaterThan(400);
  });

  it("renders iPhone dark frame", async () => {
    const img = await makeImage(400, 800);
    const result = await renderFrame(img, "iphone-dark");
    const meta = await sharp(result).metadata();
    expect(meta.width!).toBeGreaterThan(400);
  });

  it("handles wide images", async () => {
    const img = await makeImage(1920, 1080);
    const result = await renderFrame(img, "macos-light", "Wide App");
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(1920);
    expect(meta.height!).toBeGreaterThan(1080);
  });

  it("handles narrow images", async () => {
    const img = await makeImage(100, 200);
    const result = await renderFrame(img, "browser-light", "narrow.app");
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height!).toBeGreaterThan(200);
  });
});
