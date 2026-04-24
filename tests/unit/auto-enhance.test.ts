import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeImage, applyCorrections, scaleCorrections } from "@snapotter/image-engine";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const FIXTURES = join(__dirname, "..", "fixtures");
const PNG_200x150 = readFileSync(join(FIXTURES, "test-200x150.png"));

describe("analyzeImage", () => {
  it("returns scores, corrections, issues, and suggestedMode", async () => {
    const result = await analyzeImage(PNG_200x150);
    expect(result.scores).toBeDefined();
    expect(result.corrections).toBeDefined();
    expect(result.issues).toBeInstanceOf(Array);
    expect(result.suggestedMode).toBeDefined();

    for (const key of Object.keys(result.scores) as (keyof typeof result.scores)[]) {
      expect(result.scores[key]).toBeGreaterThanOrEqual(0);
      expect(result.scores[key]).toBeLessThanOrEqual(100);
    }
  });

  it("detects underexposure on a dark image", async () => {
    const darkBuffer = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 20, g: 20, b: 20 } },
    })
      .png()
      .toBuffer();

    const result = await analyzeImage(darkBuffer);
    expect(result.scores.exposure).toBeLessThan(30);
    expect(result.issues).toContain("underexposed");
    expect(result.corrections.brightness).toBeGreaterThan(0);
  });

  it("detects overexposure on a bright image", async () => {
    const brightBuffer = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 240, g: 240, b: 240 } },
    })
      .png()
      .toBuffer();

    const result = await analyzeImage(brightBuffer);
    expect(result.scores.exposure).toBeGreaterThan(70);
    expect(result.issues).toContain("overexposed");
    expect(result.corrections.brightness).toBeLessThan(0);
  });

  it("detects low contrast on a flat image", async () => {
    const flatBuffer = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .png()
      .toBuffer();

    const result = await analyzeImage(flatBuffer);
    expect(result.scores.contrast).toBeLessThan(40);
    expect(result.corrections.contrast).toBeGreaterThan(0);
  });

  it("handles grayscale images without white balance issues", async () => {
    const grayBuffer = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .grayscale()
      .png()
      .toBuffer();

    const result = await analyzeImage(grayBuffer);
    expect(result.scores.whiteBalance).toBe(50);
    // Grayscale PNG from .grayscale() retains 3 channels with zero spread,
    // so saturation formula yields channelSpread * 1.2 + 20 = 20
    expect(result.scores.saturation).toBe(20);
  });

  it("suggests low-light mode for very dark images", async () => {
    const darkBuffer = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 15, g: 15, b: 15 } },
    })
      .png()
      .toBuffer();

    const result = await analyzeImage(darkBuffer);
    expect(result.suggestedMode).toBe("low-light");
  });
});

describe("scaleCorrections", () => {
  it("scales corrections by intensity 50 (1x) without change", () => {
    const base = {
      brightness: 20,
      contrast: 10,
      temperature: 5,
      saturation: 15,
      sharpness: 30,
      denoise: 3,
    };
    const scaled = scaleCorrections(base, "auto", 50);
    expect(scaled.brightness).toBe(20);
    expect(scaled.contrast).toBe(10);
  });

  it("scales corrections to zero at intensity 0", () => {
    const base = {
      brightness: 20,
      contrast: 10,
      temperature: 5,
      saturation: 15,
      sharpness: 30,
      denoise: 3,
    };
    const scaled = scaleCorrections(base, "auto", 0);
    expect(scaled.brightness).toBe(0);
    expect(scaled.contrast).toBe(0);
    expect(scaled.sharpness).toBe(0);
  });

  it("applies preset multipliers for portrait mode", () => {
    const base = {
      brightness: 20,
      contrast: 10,
      temperature: 5,
      saturation: 15,
      sharpness: 30,
      denoise: 3,
    };
    const scaled = scaleCorrections(base, "portrait", 50);
    expect(scaled.brightness).toBe(16);
    expect(scaled.contrast).toBe(7);
  });
});

describe("applyCorrections", () => {
  it("produces a valid output buffer", async () => {
    const corrections = {
      brightness: -20,
      contrast: 10,
      temperature: 0,
      saturation: 10,
      sharpness: 20,
      denoise: 0,
    };
    const image = sharp(PNG_200x150);
    const enhanced = applyCorrections(image, corrections, "auto", 50, {});
    const buffer = await enhanced.toBuffer();
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("respects toggle overrides", async () => {
    const corrections = {
      brightness: 40,
      contrast: 30,
      temperature: 20,
      saturation: 20,
      sharpness: 30,
      denoise: 3,
    };
    const toggles = {
      exposure: false,
      contrast: false,
      whiteBalance: false,
      saturation: false,
      sharpness: false,
      denoise: false,
    };
    const image = sharp(PNG_200x150);
    const enhanced = applyCorrections(image, corrections, "auto", 50, toggles);
    const enhancedBuf = await enhanced.toBuffer();
    const originalMeta = await sharp(PNG_200x150).metadata();
    const enhancedMeta = await sharp(enhancedBuf).metadata();
    expect(enhancedMeta.width).toBe(originalMeta.width);
    expect(enhancedMeta.height).toBe(originalMeta.height);
  });
});
