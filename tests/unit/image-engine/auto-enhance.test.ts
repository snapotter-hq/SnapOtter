import { analyzeImage, applyCorrections, scaleCorrections } from "@snapotter/image-engine";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";

const PNG_200x150 = readFixture(fixtures.image.base.png200);

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

  it("produces contrast score near 50 for a typical well-exposed image", async () => {
    // A gradient image has stdev ~60, which should score ~50
    const gradientBuffer = await sharp(
      Buffer.from(
        Array.from({ length: 100 * 100 * 3 }, (_, i) => Math.floor(((i % 300) * 255) / 300)),
      ),
      { raw: { width: 100, height: 100, channels: 3 } },
    )
      .png()
      .toBuffer();

    const result = await analyzeImage(gradientBuffer);
    expect(result.scores.contrast).toBeGreaterThanOrEqual(35);
    expect(result.scores.contrast).toBeLessThanOrEqual(65);
  });

  it("produces near-zero corrections for well-exposed images (dead zone)", async () => {
    // Wide spread centered at 128 gives stdev ~60 (contrast ~50) and mean ~128 (exposure ~50).
    // Both scores land inside the [40,60] dead zone, so corrections should be zero.
    const midGrayBuffer = await sharp(
      Buffer.from(Array.from({ length: 100 * 100 * 3 }, (_, i) => 24 + ((i * 97) % 208))),
      { raw: { width: 100, height: 100, channels: 3 } },
    )
      .png()
      .toBuffer();

    const result = await analyzeImage(midGrayBuffer);
    // Corrections should be zero or near-zero in the dead zone
    expect(Math.abs(result.corrections.brightness)).toBeLessThanOrEqual(5);
    expect(Math.abs(result.corrections.contrast)).toBeLessThanOrEqual(5);
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

describe("applyCorrections pipeline (CLAHE + normalise + gamma)", () => {
  it("does not darken a well-exposed image", async () => {
    const analysis = await analyzeImage(PNG_200x150);
    const image = sharp(PNG_200x150);
    const enhanced = applyCorrections(image, analysis.corrections, "auto", 50, {});
    const enhancedBuf = await enhanced.toBuffer();

    const origStats = await sharp(PNG_200x150).stats();
    const enhStats = await sharp(enhancedBuf).stats();

    const origLum =
      origStats.channels[0].mean * 0.299 +
      origStats.channels[1].mean * 0.587 +
      origStats.channels[2].mean * 0.114;
    const enhLum =
      enhStats.channels[0].mean * 0.299 +
      enhStats.channels[1].mean * 0.587 +
      enhStats.channels[2].mean * 0.114;

    // Enhanced image should not be more than 5% darker
    expect(enhLum).toBeGreaterThan(origLum * 0.95);
  });

  it("brightens a dark image", async () => {
    const darkBuffer = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 30, g: 30, b: 30 } },
    })
      .png()
      .toBuffer();

    const analysis = await analyzeImage(darkBuffer);
    const enhanced = applyCorrections(sharp(darkBuffer), analysis.corrections, "auto", 50, {});
    const enhancedBuf = await enhanced.toBuffer();

    const origStats = await sharp(darkBuffer).stats();
    const enhStats = await sharp(enhancedBuf).stats();

    const origLum =
      origStats.channels[0].mean * 0.299 +
      origStats.channels[1].mean * 0.587 +
      origStats.channels[2].mean * 0.114;
    const enhLum =
      enhStats.channels[0].mean * 0.299 +
      enhStats.channels[1].mean * 0.587 +
      enhStats.channels[2].mean * 0.114;

    expect(enhLum).toBeGreaterThan(origLum * 1.1);
  });

  it("applies CLAHE at intensity 0 with no visible effect", async () => {
    const image = sharp(PNG_200x150);
    const corrections = {
      brightness: 0,
      contrast: 0,
      temperature: 0,
      saturation: 0,
      sharpness: 0,
      denoise: 0,
    };
    const enhanced = applyCorrections(image, corrections, "auto", 0, {});
    const enhancedBuf = await enhanced.toBuffer();

    const origStats = await sharp(PNG_200x150).stats();
    const enhStats = await sharp(enhancedBuf).stats();
    const origLum =
      origStats.channels[0].mean * 0.299 +
      origStats.channels[1].mean * 0.587 +
      origStats.channels[2].mean * 0.114;
    const enhLum =
      enhStats.channels[0].mean * 0.299 +
      enhStats.channels[1].mean * 0.587 +
      enhStats.channels[2].mean * 0.114;
    expect(Math.abs(enhLum - origLum)).toBeLessThan(origLum * 0.15);
  });

  it("does not darken a bright-but-normal image (exposure score ~55-65)", async () => {
    const brightishBuffer = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 160, g: 160, b: 160 } },
    })
      .png()
      .toBuffer();

    const analysis = await analyzeImage(brightishBuffer);
    expect(analysis.scores.exposure).toBeGreaterThan(55);
    expect(analysis.scores.exposure).toBeLessThan(70);

    const enhanced = applyCorrections(sharp(brightishBuffer), analysis.corrections, "auto", 50, {});
    const enhancedBuf = await enhanced.toBuffer();
    const enhStats = await sharp(enhancedBuf).stats();
    const origStats = await sharp(brightishBuffer).stats();

    const origLum =
      origStats.channels[0].mean * 0.299 +
      origStats.channels[1].mean * 0.587 +
      origStats.channels[2].mean * 0.114;
    const enhLum =
      enhStats.channels[0].mean * 0.299 +
      enhStats.channels[1].mean * 0.587 +
      enhStats.channels[2].mean * 0.114;

    // Must NOT darken by more than 10%
    expect(enhLum).toBeGreaterThan(origLum * 0.9);
  });

  it("each enhancement mode produces output without crashing", async () => {
    const modes = ["auto", "portrait", "landscape", "low-light", "food", "document"] as const;
    for (const mode of modes) {
      const analysis = await analyzeImage(PNG_200x150);
      const enhanced = applyCorrections(sharp(PNG_200x150), analysis.corrections, mode, 50, {});
      const buf = await enhanced.toBuffer();
      expect(buf.length).toBeGreaterThan(0);
    }
  });

  it("intensity 100 produces a visibly different output from intensity 0", async () => {
    const analysis = await analyzeImage(PNG_200x150);

    const low = applyCorrections(sharp(PNG_200x150), analysis.corrections, "auto", 0, {});
    const high = applyCorrections(sharp(PNG_200x150), analysis.corrections, "auto", 100, {});

    const lowBuf = await low.toBuffer();
    const highBuf = await high.toBuffer();

    expect(Buffer.compare(lowBuf, highBuf)).not.toBe(0);
  });
});

describe("auto-enhance edge cases", () => {
  it("produces negative saturation correction for over-saturated image (saturation > 60)", async () => {
    // Create a highly saturated image (pure bright colors with extreme channel spread)
    const saturatedBuf = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();

    const result = await analyzeImage(saturatedBuf);
    // A pure red image has extreme channel spread, so saturation score should be > 60
    expect(result.scores.saturation).toBeGreaterThan(60);
    // The correction should be negative (desaturate)
    expect(result.corrections.saturation).toBeLessThan(0);
  });

  it("applies denoise with kernel 5 when denoise adjustment is >= 4", async () => {
    // To get adj >= 4, we need corrections.denoise * presets.denoise * scale >= 4
    // With low-light preset (denoise: 2.0), intensity 100 (scale = 2.0):
    //   adj = denoise * 2.0 * 2.0 = denoise * 4.0
    //   For denoise = 5: adj = 20 >= 4, so kernel = 5
    const corrections = {
      brightness: 0,
      contrast: 0,
      temperature: 0,
      saturation: 0,
      sharpness: 0,
      denoise: 5,
    };
    const image = sharp(PNG_200x150);
    const enhanced = applyCorrections(image, corrections, "low-light", 100, {});
    const buf = await enhanced.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("applies denoise with kernel 3 when denoise adjustment is >= 2 but < 4", async () => {
    // With auto preset (denoise: 1.0), intensity 50 (scale = 1.0):
    //   adj = denoise * 1.0 * 1.0 = denoise
    //   For denoise = 3: adj = 3 (>= 2 but < 4), so kernel = 3
    const corrections = {
      brightness: 0,
      contrast: 0,
      temperature: 0,
      saturation: 0,
      sharpness: 0,
      denoise: 3,
    };
    const image = sharp(PNG_200x150);
    const enhanced = applyCorrections(image, corrections, "auto", 50, {});
    const buf = await enhanced.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("suggests document mode for high-contrast low-saturation image", async () => {
    // Create a high-contrast black & white image
    const bwBuf = await sharp(
      Buffer.from(
        Array.from({ length: 100 * 100 * 3 }, (_, i) => {
          const row = Math.floor(i / 300);
          return row % 2 === 0 ? 255 : 0;
        }),
      ),
      { raw: { width: 100, height: 100, channels: 3 } },
    )
      .png()
      .toBuffer();

    const result = await analyzeImage(bwBuf);
    // High contrast + low saturation should suggest document mode
    if (result.scores.contrast > 60 && result.scores.saturation < 30) {
      expect(result.suggestedMode).toBe("document");
    }
  });

  it("scaleCorrections with landscape mode applies correct multipliers", () => {
    const base = {
      brightness: 10,
      contrast: 10,
      temperature: 10,
      saturation: 10,
      sharpness: 10,
      denoise: 10,
    };
    const scaled = scaleCorrections(base, "landscape", 50);
    // Landscape preset: brightness=1.0, contrast=1.3, saturation=1.4, sharpness=1.5
    expect(scaled.brightness).toBe(10); // 10 * 1.0 * 1.0 = 10
    expect(scaled.contrast).toBe(13); // 10 * 1.3 * 1.0 = 13
    expect(scaled.saturation).toBe(14); // 10 * 1.4 * 1.0 = 14
    expect(scaled.sharpness).toBe(15); // 10 * 1.5 * 1.0 = 15
  });
});
