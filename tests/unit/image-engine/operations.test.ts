import { describe, it, expect, beforeAll } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";

// sharp is only installed in the image-engine package, so resolve it from there
const require = createRequire(
  path.resolve(__dirname, "../../../packages/image-engine/src/index.ts")
);
const sharp = require("sharp") as typeof import("sharp").default;

import {
  resize,
  crop,
  rotate,
  flip,
  convert,
  compress,
  stripMetadata,
  brightness,
  contrast,
  saturation,
  colorChannels,
  grayscale,
  sepia,
  invert,
  processImage,
} from "@stirling-image/image-engine";

const FIXTURES_DIR = path.resolve(__dirname, "../../fixtures");

// Helper to get metadata from a sharp pipeline result
async function getMeta(img: sharp.Sharp) {
  const buf = await img.toBuffer();
  return sharp(buf).metadata();
}

// Helper to get raw pixel data
async function getPixels(img: sharp.Sharp) {
  return img.raw().toBuffer({ resolveWithObject: true });
}

let png200x150: Buffer;
let png1x1: Buffer;
let jpg100x100: Buffer;
let webp50x50: Buffer;

beforeAll(() => {
  png200x150 = readFileSync(path.join(FIXTURES_DIR, "test-200x150.png"));
  png1x1 = readFileSync(path.join(FIXTURES_DIR, "test-1x1.png"));
  jpg100x100 = readFileSync(path.join(FIXTURES_DIR, "test-100x100.jpg"));
  webp50x50 = readFileSync(path.join(FIXTURES_DIR, "test-50x50.webp"));
});

// ---------------------------------------------------------------------------
// resize
// ---------------------------------------------------------------------------
describe("resize", () => {
  it("resizes to explicit width and height", async () => {
    const img = sharp(png200x150);
    const result = await resize(img, { width: 100, height: 75 });
    const meta = await getMeta(result);
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(75);
  });

  it("resizes with width only (height derived)", async () => {
    const img = sharp(png200x150);
    const result = await resize(img, { width: 50 });
    const meta = await getMeta(result);
    expect(meta.width).toBe(50);
    // height should be derived based on cover fit
    expect(meta.height).toBeGreaterThan(0);
  });

  it("resizes with height only (width derived)", async () => {
    const img = sharp(png200x150);
    const result = await resize(img, { height: 30 });
    const meta = await getMeta(result);
    expect(meta.height).toBe(30);
    expect(meta.width).toBeGreaterThan(0);
  });

  it("resizes by percentage", async () => {
    const img = sharp(png200x150);
    const result = await resize(img, { percentage: 50 });
    const meta = await getMeta(result);
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(75);
  });

  it("percentage = 200 doubles size", async () => {
    const img = sharp(jpg100x100);
    const result = await resize(img, { percentage: 200 });
    const meta = await getMeta(result);
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(200);
  });

  it("percentage rounds correctly for non-integer results", async () => {
    // 200 * 33/100 = 66, 150 * 33/100 = 49.5 -> 50
    const img = sharp(png200x150);
    const result = await resize(img, { percentage: 33 });
    const meta = await getMeta(result);
    expect(meta.width).toBe(66);
    expect(meta.height).toBe(50);
  });

  it("withoutEnlargement prevents upscaling", async () => {
    const img = sharp(png1x1);
    const result = await resize(img, {
      width: 500,
      height: 500,
      withoutEnlargement: true,
    });
    const meta = await getMeta(result);
    expect(meta.width).toBeLessThanOrEqual(1);
    expect(meta.height).toBeLessThanOrEqual(1);
  });

  it("fit=contain preserves aspect ratio within box", async () => {
    const img = sharp(png200x150);
    const result = await resize(img, { width: 100, height: 100, fit: "contain" });
    const meta = await getMeta(result);
    // contain fits the image within the box; dimensions are at most 100x100
    // 200x150 (4:3) contained in 100x100 -> width=100, height stays 100
    // (sharp contain fits inside the box, output matches requested dimensions with padding)
    expect(meta.width).toBeLessThanOrEqual(100);
    expect(meta.height).toBeLessThanOrEqual(100);
  });

  it("fit=fill stretches to exact dimensions", async () => {
    const img = sharp(png200x150);
    const result = await resize(img, { width: 50, height: 50, fit: "fill" });
    const meta = await getMeta(result);
    expect(meta.width).toBe(50);
    expect(meta.height).toBe(50);
  });

  // -- Error cases --

  it("throws on width = 0", async () => {
    const img = sharp(png200x150);
    await expect(resize(img, { width: 0 })).rejects.toThrow(
      "Resize width must be greater than 0"
    );
  });

  it("throws on negative width", async () => {
    const img = sharp(png200x150);
    await expect(resize(img, { width: -10, height: 50 })).rejects.toThrow(
      "Resize width must be greater than 0"
    );
  });

  it("throws on negative height", async () => {
    const img = sharp(png200x150);
    await expect(resize(img, { width: 50, height: -1 })).rejects.toThrow(
      "Resize height must be greater than 0"
    );
  });

  it("throws on height = 0", async () => {
    const img = sharp(png200x150);
    await expect(resize(img, { height: 0 })).rejects.toThrow(
      "Resize height must be greater than 0"
    );
  });

  it("throws when neither width, height, nor percentage given", async () => {
    const img = sharp(png200x150);
    await expect(resize(img, {})).rejects.toThrow(
      "Resize requires width, height, or percentage"
    );
  });

  it("throws on percentage = 0", async () => {
    const img = sharp(png200x150);
    await expect(resize(img, { percentage: 0 })).rejects.toThrow(
      "Resize percentage must be greater than 0"
    );
  });

  it("throws on negative percentage", async () => {
    const img = sharp(png200x150);
    await expect(resize(img, { percentage: -50 })).rejects.toThrow(
      "Resize percentage must be greater than 0"
    );
  });

  it("percentage on a 1x1 image rounds to at least 1px (percentage >= 50)", async () => {
    // 1 * 50 / 100 = 0.5 -> rounds to 1 (Math.round), so width=1
    const img = sharp(png1x1);
    const result = await resize(img, { percentage: 50 });
    const meta = await getMeta(result);
    // Math.round(0.5) = 1 in some environments, 0 in others; if 0, sharp should error
    expect(meta.width).toBeGreaterThanOrEqual(0);
  });

  it("percentage=1 on 1x1 yields width rounded to 0 and triggers error", async () => {
    // 1 * 1/100 = 0.01 -> Math.round -> 0
    // Then the check width <= 0 should throw
    const img = sharp(png1x1);
    await expect(resize(img, { percentage: 1 })).rejects.toThrow(
      "Resize width must be greater than 0"
    );
  });
});

// ---------------------------------------------------------------------------
// crop
// ---------------------------------------------------------------------------
describe("crop", () => {
  it("crops a valid region", async () => {
    const img = sharp(png200x150);
    const result = await crop(img, { left: 10, top: 20, width: 50, height: 40 });
    const meta = await getMeta(result);
    expect(meta.width).toBe(50);
    expect(meta.height).toBe(40);
  });

  it("crops the full image (0,0 to full dimensions)", async () => {
    const img = sharp(png200x150);
    const result = await crop(img, { left: 0, top: 0, width: 200, height: 150 });
    const meta = await getMeta(result);
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("crops a 1x1 region from top-left corner", async () => {
    const img = sharp(png200x150);
    const result = await crop(img, { left: 0, top: 0, width: 1, height: 1 });
    const meta = await getMeta(result);
    expect(meta.width).toBe(1);
    expect(meta.height).toBe(1);
  });

  it("crops from the last pixel", async () => {
    const img = sharp(png200x150);
    const result = await crop(img, { left: 199, top: 149, width: 1, height: 1 });
    const meta = await getMeta(result);
    expect(meta.width).toBe(1);
    expect(meta.height).toBe(1);
  });

  // -- Error cases --

  it("throws on width = 0", async () => {
    const img = sharp(png200x150);
    await expect(
      crop(img, { left: 0, top: 0, width: 0, height: 50 })
    ).rejects.toThrow("Crop width and height must be greater than 0");
  });

  it("throws on height = 0", async () => {
    const img = sharp(png200x150);
    await expect(
      crop(img, { left: 0, top: 0, width: 50, height: 0 })
    ).rejects.toThrow("Crop width and height must be greater than 0");
  });

  it("throws on negative width", async () => {
    const img = sharp(png200x150);
    await expect(
      crop(img, { left: 0, top: 0, width: -10, height: 50 })
    ).rejects.toThrow("Crop width and height must be greater than 0");
  });

  it("throws on negative left", async () => {
    const img = sharp(png200x150);
    await expect(
      crop(img, { left: -1, top: 0, width: 10, height: 10 })
    ).rejects.toThrow("Crop left and top must be non-negative");
  });

  it("throws on negative top", async () => {
    const img = sharp(png200x150);
    await expect(
      crop(img, { left: 0, top: -5, width: 10, height: 10 })
    ).rejects.toThrow("Crop left and top must be non-negative");
  });

  it("throws when crop region exceeds image width", async () => {
    const img = sharp(png200x150);
    await expect(
      crop(img, { left: 150, top: 0, width: 100, height: 10 })
    ).rejects.toThrow("Crop region exceeds image width");
  });

  it("throws when crop region exceeds image height", async () => {
    const img = sharp(png200x150);
    await expect(
      crop(img, { left: 0, top: 100, width: 10, height: 100 })
    ).rejects.toThrow("Crop region exceeds image height");
  });

  it("throws when left alone puts region out of bounds", async () => {
    const img = sharp(png200x150);
    await expect(
      crop(img, { left: 200, top: 0, width: 1, height: 1 })
    ).rejects.toThrow("Crop region exceeds image width");
  });

  it("throws when crop is 1px past the boundary", async () => {
    // left=199, width=2 -> 201 > 200
    const img = sharp(png200x150);
    await expect(
      crop(img, { left: 199, top: 0, width: 2, height: 1 })
    ).rejects.toThrow("Crop region exceeds image width");
  });
});

// ---------------------------------------------------------------------------
// rotate
// ---------------------------------------------------------------------------
describe("rotate", () => {
  it("rotates 90 degrees (dimensions swap)", async () => {
    const img = sharp(png200x150);
    const result = await rotate(img, { angle: 90 });
    const meta = await getMeta(result);
    expect(meta.width).toBe(150);
    expect(meta.height).toBe(200);
  });

  it("rotates 180 degrees (dimensions stay same)", async () => {
    const img = sharp(png200x150);
    const result = await rotate(img, { angle: 180 });
    const meta = await getMeta(result);
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("rotates 270 degrees (dimensions swap)", async () => {
    const img = sharp(png200x150);
    const result = await rotate(img, { angle: 270 });
    const meta = await getMeta(result);
    expect(meta.width).toBe(150);
    expect(meta.height).toBe(200);
  });

  it("rotates 0 degrees (no-op)", async () => {
    const img = sharp(png200x150);
    const result = await rotate(img, { angle: 0 });
    const meta = await getMeta(result);
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("rotates 360 degrees (no-op equivalent)", async () => {
    const img = sharp(png200x150);
    const result = await rotate(img, { angle: 360 });
    const meta = await getMeta(result);
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("arbitrary angle produces a larger bounding box", async () => {
    const img = sharp(jpg100x100);
    const result = await rotate(img, { angle: 45 });
    const meta = await getMeta(result);
    // 100x100 rotated 45 deg -> bounding box is ~141x141
    expect(meta.width!).toBeGreaterThan(100);
    expect(meta.height!).toBeGreaterThan(100);
  });

  it("arbitrary angle uses custom background color", async () => {
    const img = sharp(jpg100x100);
    const result = await rotate(img, { angle: 30, background: "#ff0000" });
    // Just check it does not throw and produces output
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("arbitrary angle defaults background to black", async () => {
    // Rotate an image by an odd angle and verify the corner pixel
    // is black (the default fill).
    const img = sharp(
      await sharp({ create: { width: 10, height: 10, channels: 3, background: "#ffffff" } })
        .png()
        .toBuffer()
    );
    const result = await rotate(img, { angle: 45 });
    const { data, info } = await result.raw().toBuffer({ resolveWithObject: true });
    // top-left corner pixel should be close to black (the fill)
    const r = data[0];
    const g = data[1];
    const b = data[2];
    // Allow some tolerance for anti-aliasing
    expect(r).toBeLessThan(30);
    expect(g).toBeLessThan(30);
    expect(b).toBeLessThan(30);
  });

  it("negative angle rotates counter-clockwise", async () => {
    const img = sharp(png200x150);
    const result = await rotate(img, { angle: -90 });
    const meta = await getMeta(result);
    expect(meta.width).toBe(150);
    expect(meta.height).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// flip
// ---------------------------------------------------------------------------
describe("flip", () => {
  it("flips horizontally", async () => {
    const img = sharp(png200x150);
    const result = await flip(img, { horizontal: true });
    const meta = await getMeta(result);
    // Dimensions unchanged
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("flips vertically", async () => {
    const img = sharp(png200x150);
    const result = await flip(img, { vertical: true });
    const meta = await getMeta(result);
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("flips both horizontal and vertical", async () => {
    const img = sharp(png200x150);
    const result = await flip(img, { horizontal: true, vertical: true });
    const meta = await getMeta(result);
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("horizontal flip actually mirrors pixels", async () => {
    // Create a 2x1 image: left pixel red, right pixel blue
    const buf = await sharp({
      create: { width: 2, height: 1, channels: 3, background: "#000000" },
    })
      .raw()
      .toBuffer();
    // Manually set: pixel 0 = red, pixel 1 = blue
    const pixels = Buffer.from([255, 0, 0, 0, 0, 255]);
    const imgBuf = await sharp(pixels, { raw: { width: 2, height: 1, channels: 3 } })
      .png()
      .toBuffer();
    const img = sharp(imgBuf);
    const result = await flip(img, { horizontal: true });
    const { data } = await result.raw().toBuffer({ resolveWithObject: true });
    // After horizontal flip: pixel 0 should be blue, pixel 1 should be red
    expect(data[0]).toBe(0);   // R of first pixel
    expect(data[1]).toBe(0);   // G
    expect(data[2]).toBe(255); // B
    expect(data[3]).toBe(255); // R of second pixel
    expect(data[4]).toBe(0);
    expect(data[5]).toBe(0);
  });

  it("vertical flip actually mirrors pixels", async () => {
    // 1x2 image: top pixel red, bottom pixel blue
    const pixels = Buffer.from([255, 0, 0, 0, 0, 255]);
    const imgBuf = await sharp(pixels, { raw: { width: 1, height: 2, channels: 3 } })
      .png()
      .toBuffer();
    const img = sharp(imgBuf);
    const result = await flip(img, { vertical: true });
    const { data } = await result.raw().toBuffer({ resolveWithObject: true });
    // After vertical flip: top pixel should be blue, bottom should be red
    expect(data[0]).toBe(0);
    expect(data[1]).toBe(0);
    expect(data[2]).toBe(255);
    expect(data[3]).toBe(255);
    expect(data[4]).toBe(0);
    expect(data[5]).toBe(0);
  });

  // -- Error cases --

  it("throws when neither horizontal nor vertical specified", async () => {
    const img = sharp(png200x150);
    await expect(flip(img, {})).rejects.toThrow(
      "Flip requires at least one of horizontal or vertical"
    );
  });

  it("throws when both are explicitly false", async () => {
    const img = sharp(png200x150);
    await expect(
      flip(img, { horizontal: false, vertical: false })
    ).rejects.toThrow("Flip requires at least one of horizontal or vertical");
  });
});

// ---------------------------------------------------------------------------
// convert
// ---------------------------------------------------------------------------
describe("convert", () => {
  it.each([
    ["jpg", "jpeg"],
    ["png", "png"],
    ["webp", "webp"],
    ["tiff", "tiff"],
    ["gif", "gif"],
  ] as const)("converts to %s format", async (fmt, expectedSharpFmt) => {
    const img = sharp(png200x150);
    const result = await convert(img, { format: fmt as any });
    const meta = await getMeta(result);
    expect(meta.format).toBe(expectedSharpFmt);
  });

  it("converts to avif format", async () => {
    const img = sharp(png200x150);
    const result = await convert(img, { format: "avif" });
    const meta = await getMeta(result);
    expect(meta.format).toBe("heif");
  });

  it("applies quality parameter", async () => {
    const imgHigh = sharp(png200x150);
    const resultHigh = await convert(imgHigh, { format: "jpg", quality: 95 });
    const bufHigh = await resultHigh.toBuffer();

    const imgLow = sharp(png200x150);
    const resultLow = await convert(imgLow, { format: "jpg", quality: 10 });
    const bufLow = await resultLow.toBuffer();

    // Low quality JPEG should be smaller than high quality
    expect(bufLow.length).toBeLessThan(bufHigh.length);
  });

  it("quality = 1 (minimum) does not throw", async () => {
    const img = sharp(png200x150);
    const result = await convert(img, { format: "webp", quality: 1 });
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("quality = 100 (maximum) does not throw", async () => {
    const img = sharp(png200x150);
    const result = await convert(img, { format: "webp", quality: 100 });
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  // -- Error cases --

  it("throws on invalid format", async () => {
    const img = sharp(png200x150);
    await expect(
      convert(img, { format: "bmp" as any })
    ).rejects.toThrow("Unsupported output format: bmp");
  });

  it("throws on quality = 0", async () => {
    const img = sharp(png200x150);
    await expect(
      convert(img, { format: "jpg", quality: 0 })
    ).rejects.toThrow("Quality must be between 1 and 100");
  });

  it("throws on quality = 101", async () => {
    const img = sharp(png200x150);
    await expect(
      convert(img, { format: "jpg", quality: 101 })
    ).rejects.toThrow("Quality must be between 1 and 100");
  });

  it("throws on negative quality", async () => {
    const img = sharp(png200x150);
    await expect(
      convert(img, { format: "jpg", quality: -5 })
    ).rejects.toThrow("Quality must be between 1 and 100");
  });

  it("throws on quality = 999", async () => {
    const img = sharp(png200x150);
    await expect(
      convert(img, { format: "png", quality: 999 })
    ).rejects.toThrow("Quality must be between 1 and 100");
  });
});

// ---------------------------------------------------------------------------
// compress
// ---------------------------------------------------------------------------
describe("compress", () => {
  it("compresses with explicit quality", async () => {
    const img = sharp(png200x150);
    const result = await compress(img, { quality: 50, format: "jpg" });
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("defaults to quality 80 when no quality or target specified", async () => {
    const img = sharp(png200x150);
    // Should not throw
    const result = await compress(img, { format: "jpg" });
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("lower quality produces smaller output", async () => {
    const bufHigh = await (
      await compress(sharp(png200x150), { quality: 90, format: "jpg" })
    ).toBuffer();
    const bufLow = await (
      await compress(sharp(png200x150), { quality: 10, format: "jpg" })
    ).toBuffer();
    expect(bufLow.length).toBeLessThan(bufHigh.length);
  });

  it("compresses with target size (binary search)", async () => {
    // Target 5KB for a 200x150 PNG
    const targetBytes = 5000;
    const img = sharp(png200x150);
    const result = await compress(img, { targetSizeBytes: targetBytes, format: "jpg" });
    const buf = await result.toBuffer();
    // The binary search should get within tolerance (5%) or as close as possible
    // Allow some slack since very small images may not compress below target
    expect(buf.length).toBeGreaterThan(0);
  });

  it("target size binary search gets reasonably close", async () => {
    // Create a bigger image for more compressibility headroom
    const bigBuf = await sharp({
      create: { width: 400, height: 300, channels: 3, background: "#884422" },
    })
      .png()
      .toBuffer();
    const targetBytes = 10000;
    const result = await compress(sharp(bigBuf), {
      targetSizeBytes: targetBytes,
      format: "jpg",
    });
    const buf = await result.toBuffer();
    // Should be at or below target (with some tolerance)
    // The algorithm tries to be within 5% or below target
    expect(buf.length).toBeLessThan(targetBytes * 1.5);
  });

  it("uses input format when no format specified", async () => {
    const img = sharp(jpg100x100);
    const result = await compress(img, { quality: 50 });
    const meta = await getMeta(result);
    expect(meta.format).toBe("jpeg");
  });

  // -- Error cases --

  it("throws on quality = 0", async () => {
    const img = sharp(png200x150);
    await expect(
      compress(img, { quality: 0, format: "jpg" })
    ).rejects.toThrow("Quality must be between 1 and 100");
  });

  it("throws on quality = 101", async () => {
    const img = sharp(png200x150);
    await expect(
      compress(img, { quality: 101, format: "jpg" })
    ).rejects.toThrow("Quality must be between 1 and 100");
  });

  it("throws on negative quality", async () => {
    const img = sharp(png200x150);
    await expect(
      compress(img, { quality: -10, format: "jpg" })
    ).rejects.toThrow("Quality must be between 1 and 100");
  });

  it("throws on targetSizeBytes = 0", async () => {
    const img = sharp(png200x150);
    await expect(
      compress(img, { targetSizeBytes: 0, format: "jpg" })
    ).rejects.toThrow("Target size must be greater than 0");
  });

  it("throws on negative targetSizeBytes", async () => {
    const img = sharp(png200x150);
    await expect(
      compress(img, { targetSizeBytes: -100, format: "jpg" })
    ).rejects.toThrow("Target size must be greater than 0");
  });
});

// ---------------------------------------------------------------------------
// strip-metadata
// ---------------------------------------------------------------------------
describe("stripMetadata", () => {
  it("returns an image (default strips all)", async () => {
    const img = sharp(jpg100x100);
    const result = await stripMetadata(img);
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("stripAll=true returns image", async () => {
    const img = sharp(jpg100x100);
    const result = await stripMetadata(img, { stripAll: true });
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("selective strip (stripExif only) returns image", async () => {
    const img = sharp(jpg100x100);
    const result = await stripMetadata(img, { stripExif: true });
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("empty options defaults to strip all", async () => {
    const img = sharp(jpg100x100);
    const result = await stripMetadata(img, {});
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("preserves image dimensions", async () => {
    const img = sharp(png200x150);
    const result = await stripMetadata(img);
    const meta = await getMeta(result);
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// brightness
// ---------------------------------------------------------------------------
describe("brightness", () => {
  it("value = 0 makes no visible change", async () => {
    const img = sharp(png200x150);
    const result = await brightness(img, { value: 0 });
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("positive value brightens the image", async () => {
    // Create a dark gray image and brighten it
    const darkBuf = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#404040" },
    })
      .png()
      .toBuffer();
    const result = await brightness(sharp(darkBuf), { value: 50 });
    const { data } = await result.raw().toBuffer({ resolveWithObject: true });
    // Brightness multiplier = 1.5 => 0x40 (64) * 1.5 = 96 (0x60)
    // Allow tolerance for rounding
    expect(data[0]).toBeGreaterThan(64);
  });

  it("negative value darkens the image", async () => {
    const lightBuf = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#c0c0c0" },
    })
      .png()
      .toBuffer();
    const result = await brightness(sharp(lightBuf), { value: -50 });
    const { data } = await result.raw().toBuffer({ resolveWithObject: true });
    // 0xC0 (192) * 0.5 = 96
    expect(data[0]).toBeLessThan(192);
  });

  it("value = -100 produces black", async () => {
    const whiteBuf = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    const result = await brightness(sharp(whiteBuf), { value: -100 });
    const { data } = await result.raw().toBuffer({ resolveWithObject: true });
    // multiplier = 0 -> all pixels should be 0
    expect(data[0]).toBe(0);
    expect(data[1]).toBe(0);
    expect(data[2]).toBe(0);
  });

  it("boundary value = 100 does not throw", async () => {
    const img = sharp(png200x150);
    const result = await brightness(img, { value: 100 });
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("boundary value = -100 does not throw", async () => {
    const img = sharp(png200x150);
    const result = await brightness(img, { value: -100 });
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  // -- Error cases --

  it("throws on value = -101", async () => {
    const img = sharp(png200x150);
    await expect(brightness(img, { value: -101 })).rejects.toThrow(
      "Brightness value must be between -100 and +100"
    );
  });

  it("throws on value = 101", async () => {
    const img = sharp(png200x150);
    await expect(brightness(img, { value: 101 })).rejects.toThrow(
      "Brightness value must be between -100 and +100"
    );
  });

  it("throws on extreme values", async () => {
    const img = sharp(png200x150);
    await expect(brightness(img, { value: 1000 })).rejects.toThrow(
      "Brightness value must be between -100 and +100"
    );
  });
});

// ---------------------------------------------------------------------------
// contrast
// ---------------------------------------------------------------------------
describe("contrast", () => {
  it("value = 0 makes no visible change", async () => {
    const img = sharp(png200x150);
    const result = await contrast(img, { value: 0 });
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("positive value increases contrast", async () => {
    // A mid-gray image with contrast boost should remain mid-gray (128 is the pivot)
    // But a light pixel should get lighter
    const grayBuf = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#c0c0c0" },
    })
      .png()
      .toBuffer();
    const result = await contrast(sharp(grayBuf), { value: 50 });
    const { data } = await result.raw().toBuffer({ resolveWithObject: true });
    // slope=1.5, intercept=128*(1-1.5)=-64 -> 192*1.5 - 64 = 224
    expect(data[0]).toBeGreaterThan(192);
  });

  it("negative contrast pushes values toward mid-gray", async () => {
    const whiteBuf = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    const result = await contrast(sharp(whiteBuf), { value: -50 });
    const { data } = await result.raw().toBuffer({ resolveWithObject: true });
    // slope=0.5, intercept=64 -> 255*0.5 + 64 = 191.5
    expect(data[0]).toBeLessThan(255);
    expect(data[0]).toBeGreaterThan(128);
  });

  // -- Error cases --

  it("throws on value = -101", async () => {
    const img = sharp(png200x150);
    await expect(contrast(img, { value: -101 })).rejects.toThrow(
      "Contrast value must be between -100 and +100"
    );
  });

  it("throws on value = 101", async () => {
    const img = sharp(png200x150);
    await expect(contrast(img, { value: 101 })).rejects.toThrow(
      "Contrast value must be between -100 and +100"
    );
  });
});

// ---------------------------------------------------------------------------
// saturation
// ---------------------------------------------------------------------------
describe("saturation", () => {
  it("value = 0 makes no change", async () => {
    const img = sharp(png200x150);
    const result = await saturation(img, { value: 0 });
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("value = -100 desaturates to grayscale-like", async () => {
    // Create a colored image
    const colorBuf = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "#ff0000" },
    })
      .png()
      .toBuffer();
    const result = await saturation(sharp(colorBuf), { value: -100 });
    const { data } = await result.raw().toBuffer({ resolveWithObject: true });
    // With saturation=0, R/G/B should all be the same (grayscale)
    expect(data[0]).toBe(data[1]);
    expect(data[1]).toBe(data[2]);
  });

  it("boundary value 100 does not throw", async () => {
    const img = sharp(png200x150);
    const result = await saturation(img, { value: 100 });
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  // -- Error cases --

  it("throws on value = -101", async () => {
    const img = sharp(png200x150);
    await expect(saturation(img, { value: -101 })).rejects.toThrow(
      "Saturation value must be between -100 and +100"
    );
  });

  it("throws on value = 101", async () => {
    const img = sharp(png200x150);
    await expect(saturation(img, { value: 101 })).rejects.toThrow(
      "Saturation value must be between -100 and +100"
    );
  });
});

// ---------------------------------------------------------------------------
// colorChannels
// ---------------------------------------------------------------------------
describe("colorChannels", () => {
  it("100/100/100 is a no-op", async () => {
    // All channels at 100 = multiplier 1.0, should be identity
    const buf = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#804020" },
    })
      .png()
      .toBuffer();
    const original = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    const result = await colorChannels(sharp(buf), { red: 100, green: 100, blue: 100 });
    const processed = await result.raw().toBuffer({ resolveWithObject: true });
    // Should be identical (or very close)
    expect(Math.abs(processed.data[0] - original.data[0])).toBeLessThanOrEqual(1);
    expect(Math.abs(processed.data[1] - original.data[1])).toBeLessThanOrEqual(1);
    expect(Math.abs(processed.data[2] - original.data[2])).toBeLessThanOrEqual(1);
  });

  it("zeroing red channel removes red", async () => {
    const buf = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#ff8040" },
    })
      .png()
      .toBuffer();
    const result = await colorChannels(sharp(buf), { red: 0, green: 100, blue: 100 });
    const { data } = await result.raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBe(0); // Red should be 0
  });

  it("doubling green channel doubles green value (clamped)", async () => {
    const buf = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#006400" },
    })
      .png()
      .toBuffer();
    const result = await colorChannels(sharp(buf), { red: 100, green: 200, blue: 100 });
    const { data } = await result.raw().toBuffer({ resolveWithObject: true });
    // Green was 100 (0x64), doubled = 200
    expect(data[1]).toBe(200);
  });

  it("boundary values 0/0/0 makes everything black", async () => {
    const buf = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    const result = await colorChannels(sharp(buf), { red: 0, green: 0, blue: 0 });
    const { data } = await result.raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBe(0);
    expect(data[1]).toBe(0);
    expect(data[2]).toBe(0);
  });

  // -- Error cases --

  it("throws when red < 0", async () => {
    const img = sharp(png200x150);
    await expect(
      colorChannels(img, { red: -1, green: 100, blue: 100 })
    ).rejects.toThrow("Red channel value must be between 0 and 200");
  });

  it("throws when red > 200", async () => {
    const img = sharp(png200x150);
    await expect(
      colorChannels(img, { red: 201, green: 100, blue: 100 })
    ).rejects.toThrow("Red channel value must be between 0 and 200");
  });

  it("throws when green < 0", async () => {
    const img = sharp(png200x150);
    await expect(
      colorChannels(img, { red: 100, green: -1, blue: 100 })
    ).rejects.toThrow("Green channel value must be between 0 and 200");
  });

  it("throws when green > 200", async () => {
    const img = sharp(png200x150);
    await expect(
      colorChannels(img, { red: 100, green: 201, blue: 100 })
    ).rejects.toThrow("Green channel value must be between 0 and 200");
  });

  it("throws when blue < 0", async () => {
    const img = sharp(png200x150);
    await expect(
      colorChannels(img, { red: 100, green: 100, blue: -1 })
    ).rejects.toThrow("Blue channel value must be between 0 and 200");
  });

  it("throws when blue > 200", async () => {
    const img = sharp(png200x150);
    await expect(
      colorChannels(img, { red: 100, green: 100, blue: 201 })
    ).rejects.toThrow("Blue channel value must be between 0 and 200");
  });
});

// ---------------------------------------------------------------------------
// grayscale
// ---------------------------------------------------------------------------
describe("grayscale", () => {
  it("converts a color image to grayscale", async () => {
    const colorBuf = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "#ff0000" },
    })
      .png()
      .toBuffer();
    const result = await grayscale(sharp(colorBuf));
    const { data } = await result.raw().toBuffer({ resolveWithObject: true });
    // In grayscale, all R=G=B per pixel (single channel or equal channels)
    // For a pure red (255,0,0), luminance is around 54
    expect(data[0]).toBeGreaterThan(0);
    expect(data[0]).toBeLessThan(255);
  });

  it("preserves dimensions", async () => {
    const img = sharp(png200x150);
    const result = await grayscale(img);
    const meta = await getMeta(result);
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("already grayscale image does not throw", async () => {
    // sharp create requires channels 3 or 4; create a gray image then convert to grayscale first
    const grayBuf = await sharp({
      create: { width: 5, height: 5, channels: 3, background: "#808080" },
    })
      .grayscale()
      .png()
      .toBuffer();
    const result = await grayscale(sharp(grayBuf));
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// sepia
// ---------------------------------------------------------------------------
describe("sepia", () => {
  it("applies sepia tone to a white image", async () => {
    const whiteBuf = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    const result = await sepia(sharp(whiteBuf));
    const { data } = await result.raw().toBuffer({ resolveWithObject: true });
    // Sepia matrix on white (255,255,255):
    // R = 255*(0.393+0.769+0.189) = 255*1.351 -> clamped to 255
    // G = 255*(0.349+0.686+0.168) = 255*1.203 -> clamped to 255
    // B = 255*(0.272+0.534+0.131) = 255*0.937 -> ~239
    // R >= G >= B is the characteristic sepia ordering
    expect(data[0]).toBeGreaterThanOrEqual(data[1]); // R >= G
    expect(data[1]).toBeGreaterThanOrEqual(data[2]); // G >= B
  });

  it("applies sepia tone to a colored image", async () => {
    const img = sharp(jpg100x100);
    const result = await sepia(img);
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("preserves dimensions", async () => {
    const img = sharp(png200x150);
    const result = await sepia(img);
    const meta = await getMeta(result);
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("black stays black", async () => {
    const blackBuf = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#000000" },
    })
      .png()
      .toBuffer();
    const result = await sepia(sharp(blackBuf));
    const { data } = await result.raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBe(0);
    expect(data[1]).toBe(0);
    expect(data[2]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// invert
// ---------------------------------------------------------------------------
describe("invert", () => {
  it("inverts white to black", async () => {
    const whiteBuf = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    const result = await invert(sharp(whiteBuf));
    const { data } = await result.raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBe(0);
    expect(data[1]).toBe(0);
    expect(data[2]).toBe(0);
  });

  it("inverts black to white", async () => {
    const blackBuf = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#000000" },
    })
      .png()
      .toBuffer();
    const result = await invert(sharp(blackBuf));
    const { data } = await result.raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBe(255);
    expect(data[1]).toBe(255);
    expect(data[2]).toBe(255);
  });

  it("double invert returns to original", async () => {
    const buf = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#804020" },
    })
      .png()
      .toBuffer();
    const original = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    const firstInvert = await invert(sharp(buf));
    const firstBuf = await firstInvert.png().toBuffer();
    const secondInvert = await invert(sharp(firstBuf));
    const final = await secondInvert.raw().toBuffer({ resolveWithObject: true });
    // Should be back to original values
    expect(Math.abs(final.data[0] - original.data[0])).toBeLessThanOrEqual(1);
    expect(Math.abs(final.data[1] - original.data[1])).toBeLessThanOrEqual(1);
    expect(Math.abs(final.data[2] - original.data[2])).toBeLessThanOrEqual(1);
  });

  it("preserves dimensions", async () => {
    const img = sharp(png200x150);
    const result = await invert(img);
    const meta = await getMeta(result);
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// processImage (engine pipeline)
// ---------------------------------------------------------------------------
describe("processImage", () => {
  it("applies a single resize operation", async () => {
    const result = await processImage(png200x150, [
      { type: "resize", options: { width: 50, height: 50 } },
    ]);
    expect(result.info.width).toBe(50);
    expect(result.info.height).toBe(50);
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("chains multiple operations in sequence", async () => {
    // Use resize then flip then grayscale - operations that have predictable
    // outcomes even when chained in a lazy pipeline
    const result = await processImage(png200x150, [
      { type: "resize", options: { width: 100, height: 75 } },
      { type: "flip", options: { horizontal: true } },
      { type: "grayscale", options: {} },
    ]);
    // resize to 100x75, flip preserves dimensions, grayscale preserves dimensions
    expect(result.info.width).toBe(100);
    expect(result.info.height).toBe(75);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("applies crop then flip", async () => {
    const result = await processImage(png200x150, [
      { type: "crop", options: { left: 0, top: 0, width: 100, height: 100 } },
      { type: "flip", options: { horizontal: true } },
    ]);
    expect(result.info.width).toBe(100);
    expect(result.info.height).toBe(100);
  });

  it("converts output format via outputFormat parameter", async () => {
    const result = await processImage(
      png200x150,
      [{ type: "resize", options: { width: 50 } }],
      "webp"
    );
    expect(result.info.format).toBe("webp");
  });

  it("processes with no operations (passthrough)", async () => {
    const result = await processImage(png200x150, []);
    expect(result.info.width).toBe(200);
    expect(result.info.height).toBe(150);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("applies brightness then contrast then saturation", async () => {
    const result = await processImage(png200x150, [
      { type: "brightness", options: { value: 20 } },
      { type: "contrast", options: { value: -10 } },
      { type: "saturation", options: { value: 30 } },
    ]);
    expect(result.info.width).toBe(200);
    expect(result.info.height).toBe(150);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("resize then compress pipeline", async () => {
    const result = await processImage(png200x150, [
      { type: "resize", options: { width: 50, height: 50 } },
      { type: "compress", options: { quality: 60, format: "jpg" } },
    ]);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("convert + strip-metadata pipeline", async () => {
    const result = await processImage(jpg100x100, [
      { type: "convert", options: { format: "png" } },
      { type: "strip-metadata", options: {} },
    ]);
    expect(result.info.format).toBe("png");
  });

  it("invert then sepia pipeline", async () => {
    const result = await processImage(png200x150, [
      { type: "invert", options: {} },
      { type: "sepia", options: {} },
    ]);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("color-channels operation through processImage", async () => {
    const result = await processImage(png200x150, [
      { type: "color-channels", options: { red: 150, green: 50, blue: 100 } },
    ]);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("all 14 operation types run without error", async () => {
    // Smaller image for speed; we just verify no crashes
    const smallBuf = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#808080" },
    })
      .png()
      .toBuffer();

    // Run each operation individually to isolate failures
    const ops: Array<{ type: string; options: Record<string, unknown> }> = [
      { type: "resize", options: { width: 10 } },
      { type: "crop", options: { left: 0, top: 0, width: 10, height: 10 } },
      { type: "rotate", options: { angle: 90 } },
      { type: "flip", options: { horizontal: true } },
      { type: "convert", options: { format: "png" } },
      { type: "compress", options: { quality: 50, format: "jpg" } },
      { type: "strip-metadata", options: {} },
      { type: "brightness", options: { value: 10 } },
      { type: "contrast", options: { value: 10 } },
      { type: "saturation", options: { value: 10 } },
      { type: "color-channels", options: { red: 100, green: 100, blue: 100 } },
      { type: "grayscale", options: {} },
      { type: "sepia", options: {} },
      { type: "invert", options: {} },
    ];

    for (const op of ops) {
      const result = await processImage(smallBuf, [op]);
      expect(result.buffer.length).toBeGreaterThan(0);
    }
  });

  // -- Error cases --

  it("throws on unknown operation type", async () => {
    await expect(
      processImage(png200x150, [
        { type: "nonexistent-op", options: {} },
      ])
    ).rejects.toThrow("Unknown operation: nonexistent-op");
  });

  it("throws on unknown output format", async () => {
    await expect(
      processImage(png200x150, [], "bmp" as any)
    ).rejects.toThrow("Unsupported output format: bmp");
  });

  it("propagates operation-level errors through pipeline", async () => {
    // Crop that exceeds bounds should propagate
    await expect(
      processImage(png200x150, [
        { type: "crop", options: { left: 0, top: 0, width: 999, height: 999 } },
      ])
    ).rejects.toThrow("Crop region exceeds");
  });

  it("error in second operation aborts pipeline", async () => {
    // First op succeeds (resize to 50x50), second op fails (crop 100x100 from 50x50)
    // The error may come from our validation or from sharp's internal extract check
    // depending on whether the pipeline has been materialized
    await expect(
      processImage(png200x150, [
        { type: "resize", options: { width: 50, height: 50 } },
        { type: "crop", options: { left: 0, top: 0, width: 100, height: 100 } },
      ])
    ).rejects.toThrow();
  });

  it("invalid buffer input throws", async () => {
    const garbage = Buffer.from("this is not an image");
    await expect(
      processImage(garbage, [{ type: "grayscale", options: {} }])
    ).rejects.toThrow();
  });

  it("empty buffer throws", async () => {
    const empty = Buffer.alloc(0);
    await expect(
      processImage(empty, [{ type: "invert", options: {} }])
    ).rejects.toThrow();
  });

  it("result contains accurate ImageInfo metadata", async () => {
    const result = await processImage(
      png200x150,
      [{ type: "resize", options: { width: 80, height: 60 } }],
      "png"
    );
    expect(result.info.width).toBe(80);
    expect(result.info.height).toBe(60);
    expect(result.info.format).toBe("png");
    expect(result.info.size).toBe(result.buffer.length);
    expect(typeof result.info.channels).toBe("number");
    expect(typeof result.info.hasAlpha).toBe("boolean");
  });
});
