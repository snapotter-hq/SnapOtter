import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  addDropShadow,
  applyEffects,
  blurBackground,
  compositeOnColor,
  compositeOnImage,
  createGradientBackground,
} from "../../../apps/api/src/lib/bg-effects.js";

async function createTestImage(
  width: number,
  height: number,
  channels: 4 | 3 = 4,
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels,
      background: { r: 255, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

async function createMultiColorImage(width: number, height: number): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      pixels[i] = Math.floor((x / width) * 255);
      pixels[i + 1] = Math.floor((y / height) * 255);
      pixels[i + 2] = 128;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

async function createSubjectWithAlpha(width: number, height: number): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      pixels[i] = 255;
      pixels[i + 1] = 0;
      pixels[i + 2] = 0;
      pixels[i + 3] = x < width / 2 ? 255 : 0;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

describe("blurBackground", () => {
  it("returns a valid PNG buffer", async () => {
    const original = await createTestImage(100, 100, 3);
    const subject = await createSubjectWithAlpha(100, 100);
    const result = await blurBackground(original, subject, 50);
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(100);
  });

  it("intensity 0 produces minimal blur (sigma ~1)", async () => {
    const original = await createTestImage(100, 100, 3);
    const subject = await createSubjectWithAlpha(100, 100);
    const result = await blurBackground(original, subject, 0);
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
    expect(result.length).toBeGreaterThan(0);
  });

  it("intensity 100 produces heavy blur (sigma 50)", async () => {
    const original = await createTestImage(100, 100, 3);
    const subject = await createSubjectWithAlpha(100, 100);
    const result = await blurBackground(original, subject, 100);
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
  });

  it("different intensity values produce different output", async () => {
    const original = await createMultiColorImage(100, 100);
    const subject = await createSubjectWithAlpha(100, 100);
    const low = await blurBackground(original, subject, 10);
    const high = await blurBackground(original, subject, 90);
    expect(low.equals(high)).toBe(false);
  });

  it("clamps intensity below 0 to 0", async () => {
    const original = await createTestImage(100, 100, 3);
    const subject = await createSubjectWithAlpha(100, 100);
    const clamped = await blurBackground(original, subject, -10);
    const atZero = await blurBackground(original, subject, 0);
    expect(clamped.equals(atZero)).toBe(true);
  });

  it("clamps intensity above 100 to 100", async () => {
    const original = await createTestImage(100, 100, 3);
    const subject = await createSubjectWithAlpha(100, 100);
    const clamped = await blurBackground(original, subject, 200);
    const atMax = await blurBackground(original, subject, 100);
    expect(clamped.equals(atMax)).toBe(true);
  });

  it("output dimensions match subject dimensions", async () => {
    const original = await createTestImage(200, 150, 3);
    const subject = await createSubjectWithAlpha(80, 60);
    const result = await blurBackground(original, subject, 50);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(80);
    expect(meta.height).toBe(60);
  });
});

describe("addDropShadow", () => {
  it("returns a valid PNG buffer", async () => {
    const subject = await createSubjectWithAlpha(100, 100);
    const result = await addDropShadow(subject, 50);
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
  });

  it("output dimensions match input dimensions", async () => {
    const subject = await createSubjectWithAlpha(120, 80);
    const result = await addDropShadow(subject, 50);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(120);
    expect(meta.height).toBe(80);
  });

  it("opacity 0 produces no visible shadow (alpha bytes near zero in shadow area)", async () => {
    const subject = await createSubjectWithAlpha(100, 100);
    const result = await addDropShadow(subject, 0);
    const { data, info } = await sharp(result).raw().toBuffer({ resolveWithObject: true });
    let shadowAlphaSum = 0;
    for (let y = 90; y < info.height; y++) {
      for (let x = 60; x < info.width; x++) {
        const i = (y * info.width + x) * 4;
        shadowAlphaSum += data[i + 3];
      }
    }
    expect(shadowAlphaSum).toBe(0);
  });

  it("opacity 100 produces visible shadow", async () => {
    const subject = await createSubjectWithAlpha(100, 100);
    const result = await addDropShadow(subject, 100);
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
    expect(result.length).toBeGreaterThan(0);
  });

  it("higher opacity produces more shadow alpha than lower opacity", async () => {
    const subject = await createSubjectWithAlpha(100, 100);
    const lowResult = await addDropShadow(subject, 20);
    const highResult = await addDropShadow(subject, 80);
    expect(lowResult.equals(highResult)).toBe(false);
  });

  it("throws when buffer has no readable dimensions", async () => {
    const invalid = Buffer.from("not an image");
    await expect(addDropShadow(invalid, 50)).rejects.toThrow();
  });
});

describe("createGradientBackground", () => {
  it("creates correct size output", async () => {
    const result = await createGradientBackground(200, 100, "#ff0000", "#0000ff");
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(100);
  });

  it("output is a valid PNG buffer", async () => {
    const result = await createGradientBackground(100, 100, "#ff0000", "#0000ff");
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
  });

  it("default angle is 180 (top to bottom)", async () => {
    const withDefault = await createGradientBackground(100, 100, "#ff0000", "#0000ff");
    const with180 = await createGradientBackground(100, 100, "#ff0000", "#0000ff", 180);
    expect(withDefault.equals(with180)).toBe(true);
  });

  it("different angles produce different pixel data", async () => {
    const angle0 = await createGradientBackground(100, 100, "#ff0000", "#0000ff", 0);
    const angle90 = await createGradientBackground(100, 100, "#ff0000", "#0000ff", 90);
    expect(angle0.equals(angle90)).toBe(false);
  });

  it("different colors produce different output", async () => {
    const grad1 = await createGradientBackground(100, 100, "#ff0000", "#0000ff");
    const grad2 = await createGradientBackground(100, 100, "#00ff00", "#ffff00");
    expect(grad1.equals(grad2)).toBe(false);
  });
});

describe("compositeOnColor", () => {
  it("composites subject onto solid color background", async () => {
    const subject = await createSubjectWithAlpha(100, 100);
    const result = await compositeOnColor(subject, "#0000ff");
    const { data } = await sharp(result).raw().toBuffer({ resolveWithObject: true });
    const lastPixel = (99 * 100 + 99) * 4;
    expect(data[lastPixel + 2]).toBeGreaterThan(200);
  });

  it("output dimensions match subject dimensions", async () => {
    const subject = await createSubjectWithAlpha(150, 80);
    const result = await compositeOnColor(subject, "#00ff00");
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(150);
    expect(meta.height).toBe(80);
  });

  it("output is a valid PNG", async () => {
    const subject = await createSubjectWithAlpha(100, 100);
    const result = await compositeOnColor(subject, "#ff0000");
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
  });

  it("accepts hex color without hash prefix", async () => {
    const subject = await createSubjectWithAlpha(50, 50);
    const result = await compositeOnColor(subject, "ff0000");
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
  });

  it("throws on invalid buffer with no dimensions", async () => {
    const invalid = Buffer.from("not an image");
    await expect(compositeOnColor(invalid, "#ff0000")).rejects.toThrow();
  });
});

describe("compositeOnImage", () => {
  it("composites subject onto background image", async () => {
    const subject = await createSubjectWithAlpha(100, 100);
    const background = await createTestImage(200, 200, 3);
    const result = await compositeOnImage(subject, background);
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
  });

  it("background is resized to cover subject dimensions", async () => {
    const subject = await createSubjectWithAlpha(80, 60);
    const background = await createTestImage(200, 200, 3);
    const result = await compositeOnImage(subject, background);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(80);
    expect(meta.height).toBe(60);
  });

  it("output dimensions match subject dimensions", async () => {
    const subject = await createSubjectWithAlpha(120, 90);
    const background = await createTestImage(50, 50, 3);
    const result = await compositeOnImage(subject, background);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(120);
    expect(meta.height).toBe(90);
  });

  it("output is a valid PNG", async () => {
    const subject = await createSubjectWithAlpha(100, 100);
    const background = await createTestImage(100, 100);
    const result = await compositeOnImage(subject, background);
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
  });

  it("throws on invalid subject buffer", async () => {
    const invalid = Buffer.from("not an image");
    const background = await createTestImage(100, 100);
    await expect(compositeOnImage(invalid, background)).rejects.toThrow();
  });
});

describe("applyEffects", () => {
  it("transparent backgroundType with no effects returns subject approximately unchanged", async () => {
    const subject = await createSubjectWithAlpha(100, 100);
    const original = await createTestImage(100, 100, 3);
    const result = await applyEffects(subject, original, {
      backgroundType: "transparent",
    });
    expect(result.equals(subject)).toBe(true);
  });

  it("shadowEnabled with opacity adds shadow", async () => {
    const subject = await createSubjectWithAlpha(100, 100);
    const original = await createTestImage(100, 100, 3);
    const withShadow = await applyEffects(subject, original, {
      backgroundType: "transparent",
      shadowEnabled: true,
      shadowOpacity: 80,
    });
    expect(withShadow.equals(subject)).toBe(false);
    const meta = await sharp(withShadow).metadata();
    expect(meta.format).toBe("png");
  });

  it("blurEnabled with transparent bgType blurs the original background", async () => {
    const subject = await createSubjectWithAlpha(100, 100);
    const original = await createTestImage(100, 100, 3);
    const result = await applyEffects(subject, original, {
      backgroundType: "transparent",
      blurEnabled: true,
      blurIntensity: 50,
    });
    expect(result.equals(subject)).toBe(false);
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
  });

  it("blurEnabled with blur bgType blurs the original background", async () => {
    const subject = await createSubjectWithAlpha(100, 100);
    const original = await createTestImage(100, 100, 3);
    const result = await applyEffects(subject, original, {
      backgroundType: "blur",
      blurEnabled: true,
      blurIntensity: 30,
    });
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
    expect(result.equals(subject)).toBe(false);
  });

  it("color backgroundType composites on solid color", async () => {
    const subject = await createSubjectWithAlpha(100, 100);
    const original = await createTestImage(100, 100, 3);
    const result = await applyEffects(subject, original, {
      backgroundType: "color",
      backgroundColor: "#00ff00",
    });
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
    expect(result.equals(subject)).toBe(false);
  });

  it("gradient backgroundType composites on gradient", async () => {
    const subject = await createSubjectWithAlpha(100, 100);
    const original = await createTestImage(100, 100, 3);
    const result = await applyEffects(subject, original, {
      backgroundType: "gradient",
      gradientColor1: "#ff0000",
      gradientColor2: "#0000ff",
      gradientAngle: 90,
    });
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
    expect(result.equals(subject)).toBe(false);
  });

  it("image backgroundType composites on provided image", async () => {
    const subject = await createSubjectWithAlpha(100, 100);
    const original = await createTestImage(100, 100, 3);
    const bgImage = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 3,
        background: { r: 0, g: 0, b: 255 },
      },
    })
      .png()
      .toBuffer();
    const result = await applyEffects(subject, original, {
      backgroundType: "image",
      backgroundImageBuffer: bgImage,
    });
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(100);
  });

  it("image backgroundType with blurEnabled blurs the background image", async () => {
    const subject = await createSubjectWithAlpha(100, 100);
    const original = await createTestImage(100, 100, 3);
    const bgImage = await createMultiColorImage(200, 200);
    const withoutBlur = await applyEffects(subject, original, {
      backgroundType: "image",
      backgroundImageBuffer: bgImage,
    });
    const withBlur = await applyEffects(subject, original, {
      backgroundType: "image",
      backgroundImageBuffer: bgImage,
      blurEnabled: true,
      blurIntensity: 50,
    });
    expect(withBlur.equals(withoutBlur)).toBe(false);
  });

  it("combined shadow + color background works", async () => {
    const subject = await createSubjectWithAlpha(100, 100);
    const original = await createTestImage(100, 100, 3);
    const result = await applyEffects(subject, original, {
      backgroundType: "color",
      backgroundColor: "#ffffff",
      shadowEnabled: true,
      shadowOpacity: 60,
    });
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(100);
  });

  it("defaults blurIntensity to 50 when not provided", async () => {
    const subject = await createSubjectWithAlpha(100, 100);
    const original = await createTestImage(100, 100, 3);
    const withDefault = await applyEffects(subject, original, {
      backgroundType: "blur",
      blurEnabled: true,
    });
    const withExplicit = await applyEffects(subject, original, {
      backgroundType: "blur",
      blurEnabled: true,
      blurIntensity: 50,
    });
    expect(withDefault.equals(withExplicit)).toBe(true);
  });

  it("shadowOpacity 0 does not add shadow", async () => {
    const subject = await createSubjectWithAlpha(100, 100);
    const original = await createTestImage(100, 100, 3);
    const result = await applyEffects(subject, original, {
      backgroundType: "transparent",
      shadowEnabled: true,
      shadowOpacity: 0,
    });
    expect(result.equals(subject)).toBe(true);
  });

  it("defaults backgroundType to transparent when not provided", async () => {
    const subject = await createSubjectWithAlpha(100, 100);
    const original = await createTestImage(100, 100, 3);
    const result = await applyEffects(subject, original, {});
    expect(result.equals(subject)).toBe(true);
  });
});
