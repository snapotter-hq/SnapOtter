import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  analyzeImage,
  applyCorrections,
  scaleCorrections,
} from "../src/operations/auto-enhance.js";
import type { CorrectionParams, EnhancementMode, Sharp } from "../src/types.js";

const SCENE_PATH = fileURLToPath(
  new URL("../../../tests/fixtures/image/valid/test-scene.png", import.meta.url),
);

// ---------------------------------------------------------------------------
// Synthetic-image builders with KNOWN Sharp stats.
//
// All ground-truth numbers asserted below were captured by running the real
// auto-enhance source against these exact buffers (via tsx), so every assertion
// pins a specific value the mutation would change, not a loose range.
// ---------------------------------------------------------------------------

/** Solid RGB fill: every channel mean == its component, stdev 0, entropy 0. */
async function solidRgb(r: number, g: number, b: number): Promise<Buffer> {
  return await sharp({
    create: { width: 32, height: 32, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer();
}

/** Genuine single-channel (grayscale) image so `isGrayscale` is true. */
async function solidGray1(v: number): Promise<Buffer> {
  return await sharp({
    create: { width: 32, height: 32, channels: 3, background: { r: v, g: v, b: v } },
  })
    .toColourspace("b-w")
    .png()
    .toBuffer();
}

/** Left half value `a`, right half value `b`, all channels equal. */
async function twoTone(a: number, b: number, w = 64, h = 64): Promise<Buffer> {
  const buf = Buffer.alloc(w * h * 3);
  const split = Math.floor(w / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = x < split ? a : b;
      const i = (y * w + x) * 3;
      buf[i] = v;
      buf[i + 1] = v;
      buf[i + 2] = v;
    }
  }
  return await sharp(buf, { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toBuffer();
}

/** Low-amplitude high-frequency grayscale texture; CLAHE/sharpen/median move stdev. */
async function texturedGray(w: number, h: number, lo: number, hi: number): Promise<Buffer> {
  const buf = Buffer.alloc(w * h * 3);
  const span = hi - lo;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = lo + ((x * 37 + y * 17) % (span + 1));
      const i = (y * w + x) * 3;
      buf[i] = v;
      buf[i + 1] = v;
      buf[i + 2] = v;
    }
  }
  return await sharp(buf, { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toBuffer();
}

/** High-frequency colored texture with a fixed channel offset (R>G>B). */
async function texturedColor(w: number, h: number): Promise<Buffer> {
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = (x * 37 + y * 17) % 37;
      const i = (y * w + x) * 3;
      buf[i] = 150 + n;
      buf[i + 1] = 110 + n;
      buf[i + 2] = 90 + n;
    }
  }
  return await sharp(buf, { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toBuffer();
}

/** Full-range deterministic RGB noise; sharp reports entropy 6.989 for this. */
async function noiseImage(dim = 128): Promise<Buffer> {
  const buf = Buffer.alloc(dim * dim * 3);
  let s = 987654321;
  for (let i = 0; i < buf.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    buf[i] = s & 0xff;
  }
  return await sharp(buf, { raw: { width: dim, height: dim, channels: 3 } })
    .png()
    .toBuffer();
}

async function channelMeans(buf: Buffer): Promise<number[]> {
  const stats = await sharp(buf).stats();
  return stats.channels.map((c) => c.mean);
}

async function channelStdevs(buf: Buffer): Promise<number[]> {
  const stats = await sharp(buf).stats();
  return stats.channels.map((c) => c.stdev);
}

/** Max-min of channel means: proxy for saturation / white-balance shift. */
async function channelSpread(buf: Buffer): Promise<number> {
  const means = await channelMeans(buf);
  return Math.max(...means) - Math.min(...means);
}

const NO_CORR: CorrectionParams = {
  brightness: 0,
  contrast: 0,
  temperature: 0,
  saturation: 0,
  sharpness: 0,
  denoise: 0,
};

const ALL_OFF: Record<string, boolean> = {
  contrast: false,
  exposure: false,
  whiteBalance: false,
  saturation: false,
  sharpness: false,
  denoise: false,
};

/** Enable exactly the listed toggles (undefined !== false ⇒ enabled). */
function onlyEnabled(...keys: string[]): Record<string, boolean> {
  const t: Record<string, boolean | undefined> = { ...ALL_OFF };
  for (const k of keys) t[k] = undefined;
  return t as Record<string, boolean>;
}

async function run(
  buf: Buffer,
  corrections: CorrectionParams,
  mode: EnhancementMode,
  intensity: number,
  toggles: Record<string, boolean>,
  size?: { width: number; height: number },
): Promise<Buffer> {
  const image = await applyCorrections(
    sharp(buf) as Sharp,
    corrections,
    mode,
    intensity,
    toggles,
    size,
  );
  return image.png().toBuffer();
}

// ===========================================================================
// analyzeImage -> computeScores
// ===========================================================================

describe("analyzeImage scores", () => {
  it("maps mid-gray to exposure 50 and low-info scores exactly", async () => {
    const { scores } = await analyzeImage(await solidRgb(128, 128, 128));
    expect(scores).toEqual({
      exposure: 50,
      contrast: 0,
      whiteBalance: 50,
      saturation: 20,
      sharpness: 10,
      noise: 100,
    });
  });

  it("computes exposure as round(meanLum / 255 * 100)", async () => {
    expect((await analyzeImage(await solidRgb(30, 30, 30))).scores.exposure).toBe(12);
    expect((await analyzeImage(await solidRgb(230, 230, 230))).scores.exposure).toBe(90);
    expect((await analyzeImage(await solidRgb(10, 10, 10))).scores.exposure).toBe(4);
  });

  it("weights luminance with BT.601 coefficients (not a flat channel average)", async () => {
    // Flat average of (40,60,200) is 100 -> exposure 39. BT.601 gives
    // 40*0.299 + 60*0.587 + 200*0.114 = 69.98 -> exposure 27.
    expect((await analyzeImage(await solidRgb(40, 60, 200))).scores.exposure).toBe(27);
  });

  it("derives contrast from luminance stdev (round(stdev / 1.2))", async () => {
    // Solid: stdev 0 -> contrast 0.
    expect((await analyzeImage(await solidRgb(128, 128, 128))).scores.contrast).toBe(0);
    // 0/255 two-tone: stdev 127.5 -> round(127.5/1.2) clamps to 100.
    expect((await analyzeImage(await twoTone(0, 255))).scores.contrast).toBe(100);
    // 110/146 two-tone: stdev 18 -> round(15) = 15.
    expect((await analyzeImage(await twoTone(110, 146))).scores.contrast).toBe(15);
    // 100/160 two-tone: stdev 30 -> round(25) = 25.
    expect((await analyzeImage(await twoTone(100, 160))).scores.contrast).toBe(25);
  });

  it("scores white balance from channel-mean spread when not grayscale", async () => {
    // spread 20 -> round(50 - 20*0.8) = 34.
    expect((await analyzeImage(await solidRgb(100, 100, 120))).scores.whiteBalance).toBe(34);
    // Neutral gray -> spread 0 -> 50.
    expect((await analyzeImage(await solidRgb(100, 100, 100))).scores.whiteBalance).toBe(50);
    // Large blue cast -> clamps to 0.
    expect((await analyzeImage(await solidRgb(40, 60, 200))).scores.whiteBalance).toBe(0);
  });

  it("scores saturation from channel-mean spread (round(spread * 1.2 + 20))", async () => {
    // spread 0 -> 20.
    expect((await analyzeImage(await solidRgb(128, 128, 128))).scores.saturation).toBe(20);
    // spread 7 -> round(7*1.2 + 20) = 28.
    expect((await analyzeImage(await solidRgb(100, 100, 107))).scores.saturation).toBe(28);
    // large spread clamps to 100.
    expect((await analyzeImage(await solidRgb(40, 60, 200))).scores.saturation).toBe(100);
  });

  it("scores sharpness from luminance stdev (round(stdev * 0.8 + 10))", async () => {
    // stdev 0 -> 10.
    expect((await analyzeImage(await solidRgb(128, 128, 128))).scores.sharpness).toBe(10);
    // stdev 18 -> round(18*0.8 + 10) = 24.
    expect((await analyzeImage(await twoTone(110, 146))).scores.sharpness).toBe(24);
    // stdev 30 -> round(30*0.8 + 10) = 34.
    expect((await analyzeImage(await twoTone(100, 160))).scores.sharpness).toBe(34);
  });

  it("scores noise from entropy (round(100 - (entropy - 5) * 20))", async () => {
    // entropy 0 -> 100.
    expect((await analyzeImage(await solidRgb(128, 128, 128))).scores.noise).toBe(100);
    // entropy 6.989 -> round(100 - (6.989-5)*20) = 60.
    expect((await analyzeImage(await noiseImage())).scores.noise).toBe(60);
  });

  it("uses grayscale sentinels (whiteBalance 50, saturation 50) for 1-channel input", async () => {
    const { scores } = await analyzeImage(await solidGray1(100));
    // A 3-channel (100,100,100) gives saturation 20; the 1-channel path gives 50.
    expect(scores.saturation).toBe(50);
    expect(scores.whiteBalance).toBe(50);
    // exposure still computed: 100/255*100 -> 39.
    expect(scores.exposure).toBe(39);
  });
});

// ===========================================================================
// analyzeImage -> source format (#4983)
// ===========================================================================

describe("analyzeImage reads every source format as 8-bit sRGB", () => {
  const warmFill = () =>
    sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 150, g: 128, b: 106 } },
    });
  const greyFill = () =>
    sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 100, g: 100, b: 100 } },
    }).toColourspace("b-w");

  it("scores a 16-bit RGB image like its 8-bit original", async () => {
    const reference = await analyzeImage(await warmFill().png().toBuffer());
    const deep = await analyzeImage(await warmFill().toColourspace("rgb16").png().toBuffer());
    // Before #4983 the 0-65535 means clamped exposure to 100 and added "overexposed".
    expect(deep).toEqual(reference);
    expect(reference.scores.exposure).toBe(52);
  });

  it("keeps stdev-based scores on a 16-bit textured image", async () => {
    const eight = await texturedColor(64, 64);
    const sixteen = await sharp(eight).toColourspace("rgb16").png().toBuffer();
    expect(await analyzeImage(sixteen)).toEqual(await analyzeImage(eight));
  });

  it("scores a 16-bit grey image like its 8-bit original", async () => {
    const reference = await analyzeImage(await greyFill().png().toBuffer());
    const deep = await analyzeImage(await greyFill().toColourspace("grey16").png().toBuffer());
    expect(deep).toEqual(reference);
    expect(deep.scores.exposure).toBe(39);
  });

  it("reads a CMYK JPEG as colour, not as R, G and B planes", async () => {
    const reference = await analyzeImage(await warmFill().png().toBuffer());
    const cmyk = await analyzeImage(
      await warmFill().toColourspace("cmyk").jpeg({ quality: 100 }).toBuffer(),
    );
    // The CMYK round trip through sharp's profile shifts means by a level or two.
    for (const key of Object.keys(reference.scores) as (keyof typeof reference.scores)[]) {
      expect(Math.abs(cmyk.scores[key] - reference.scores[key])).toBeLessThanOrEqual(3);
    }
    expect(cmyk.issues).toEqual(reference.issues);
    expect(cmyk.corrections.temperature).toBe(reference.corrections.temperature);
  });

  it("treats grey+alpha as grayscale, so Auto doesn't tint it", async () => {
    const reference = await analyzeImage(await greyFill().png().toBuffer());
    const withAlpha = await analyzeImage(await greyFill().ensureAlpha(0.5).png().toBuffer());
    // Before #4983 alpha was read as green and blue: whiteBalance 28, a
    // "color-cast" issue and a warm temperature of 6.
    expect(withAlpha).toEqual(reference);
    expect(withAlpha.scores.whiteBalance).toBe(50);
    expect(withAlpha.corrections.temperature).toBe(0);
    expect(withAlpha.issues).not.toContain("color-cast");
  });

  it("ignores the alpha channel of an RGBA image", async () => {
    const reference = await analyzeImage(await warmFill().png().toBuffer());
    expect(await analyzeImage(await warmFill().ensureAlpha(0.5).png().toBuffer())).toEqual(
      reference,
    );
  });
});

// ===========================================================================
// analyzeImage -> computeCorrections / deadZoneCorrection
// ===========================================================================

describe("analyzeImage corrections", () => {
  it("returns zero brightness correction inside the exposure dead zone [40,60]", async () => {
    // exposure 50 -> dead zone -> 0.
    expect((await analyzeImage(await solidRgb(128, 128, 128))).corrections.brightness).toBe(0);
  });

  it("brightens (positive) below the dead zone, scaling from the edge by 0.8", async () => {
    // exposure 12 -> round((40 - 12) * 0.8) = round(22.4) = 22.
    expect((await analyzeImage(await solidRgb(30, 30, 30))).corrections.brightness).toBe(22);
    // exposure 4 -> round((40 - 4) * 0.8) = round(28.8) = 29.
    expect((await analyzeImage(await solidRgb(10, 10, 10))).corrections.brightness).toBe(29);
  });

  it("uses the edge (not 50) as the reference for a 1-unit deviation", async () => {
    // Grayscale exposure 39 -> round((40 - 39) * 0.8) = round(0.8) = 1, NOT
    // round((50 - 39) * 0.8) = 9. This pins the dead-zone edge arithmetic.
    expect((await analyzeImage(await solidGray1(100))).corrections.brightness).toBe(1);
  });

  it("darkens (negative) above the dead zone", async () => {
    // exposure 90 -> round((60 - 90) * 0.8) = -24.
    expect((await analyzeImage(await solidRgb(230, 230, 230))).corrections.brightness).toBe(-24);
  });

  it("computes contrast correction from the contrast dead zone (factor 0.6)", async () => {
    // contrast 0 -> round((40 - 0) * 0.6) = 24.
    expect((await analyzeImage(await solidRgb(128, 128, 128))).corrections.contrast).toBe(24);
    // contrast 100 -> round((60 - 100) * 0.6) = -24.
    expect((await analyzeImage(await twoTone(0, 255))).corrections.contrast).toBe(-24);
  });

  it("computes temperature from the red/blue gap, past a 12.5 dead zone at 0.4 per level", async () => {
    // Neutral -> 0.
    expect((await analyzeImage(await solidRgb(128, 128, 128))).corrections.temperature).toBe(0);
    // Gap 12 sits inside the dead zone -> 0.
    expect((await analyzeImage(await solidRgb(128, 128, 116))).corrections.temperature).toBe(0);
    // Blue cast, gap -160 -> warms: round((160 - 12.5) * 0.4) = 59.
    expect((await analyzeImage(await solidRgb(40, 60, 200))).corrections.temperature).toBe(59);
    // Mild blue cast, gap -30 -> round((30 - 12.5) * 0.4) = 7.
    expect((await analyzeImage(await solidRgb(100, 110, 130))).corrections.temperature).toBe(7);
  });

  it("cools a warm cast instead of warming it further (#4842)", async () => {
    // Red cast, gap +140 -> -round((140 - 12.5) * 0.4) = -51.
    expect((await analyzeImage(await solidRgb(200, 120, 60))).corrections.temperature).toBe(-51);
  });

  it("caps the temperature correction at 60 either way", async () => {
    expect((await analyzeImage(await solidRgb(255, 128, 0))).corrections.temperature).toBe(-60);
    expect((await analyzeImage(await solidRgb(0, 128, 255))).corrections.temperature).toBe(60);
  });

  it("ignores the green channel: a pure green/magenta spread is not a temperature cast", async () => {
    expect((await analyzeImage(await solidRgb(100, 200, 100))).corrections.temperature).toBe(0);
  });

  it("boosts saturation only below 40 (factor 0.6, clamped [0,30])", async () => {
    // saturation 20 -> round((40 - 20) * 0.6) = 12.
    expect((await analyzeImage(await solidRgb(128, 128, 128))).corrections.saturation).toBe(12);
  });

  it("reduces saturation only above 60 (factor 0.4, clamped [-20,0])", async () => {
    // saturation 100 -> round((60 - 100) * 0.4) = -16.
    expect((await analyzeImage(await solidRgb(40, 60, 200))).corrections.saturation).toBe(-16);
  });

  it("leaves saturation uncorrected inside [40,60]", async () => {
    // saturation 56 (spread 30) -> 0.
    expect((await analyzeImage(await solidRgb(100, 110, 130))).corrections.saturation).toBe(0);
  });

  it("sharpens only below 40 (factor 1.0, clamped [0,50])", async () => {
    // sharpness 10 -> round((40 - 10) * 1.0) = 30.
    expect((await analyzeImage(await solidRgb(128, 128, 128))).corrections.sharpness).toBe(30);
    // sharpness 100 (>=40) -> 0.
    expect((await analyzeImage(await twoTone(0, 255))).corrections.sharpness).toBe(0);
  });

  it("keeps denoise at 0 when noise score stays >= 35", async () => {
    // noise 100 and noise 60 both leave denoise 0.
    expect((await analyzeImage(await solidRgb(128, 128, 128))).corrections.denoise).toBe(0);
    expect((await analyzeImage(await noiseImage())).corrections.denoise).toBe(0);
  });
});

// ===========================================================================
// analyzeImage -> detectIssues (threshold boundaries)
// ===========================================================================

describe("analyzeImage issues", () => {
  it("flags underexposed strictly below exposure 35", async () => {
    // exposure 29 (v=75) < 35 -> flagged.
    expect((await analyzeImage(await solidRgb(75, 75, 75))).issues).toContain("underexposed");
    // exposure 35 (v=90) -> not flagged.
    expect((await analyzeImage(await solidRgb(90, 90, 90))).issues).not.toContain("underexposed");
  });

  it("flags overexposed strictly above exposure 70", async () => {
    // exposure 70 (v=179) -> not flagged.
    expect((await analyzeImage(await solidRgb(179, 179, 179))).issues).not.toContain("overexposed");
    // exposure 71 (v=180) -> flagged.
    expect((await analyzeImage(await solidRgb(180, 180, 180))).issues).toContain("overexposed");
  });

  it("flags low-contrast strictly below contrast 35", async () => {
    // contrast 15 -> flagged.
    expect((await analyzeImage(await twoTone(110, 146))).issues).toContain("low-contrast");
    // contrast 73 -> not flagged.
    expect((await analyzeImage(await twoTone(40, 216))).issues).not.toContain("low-contrast");
  });

  it("flags color-cast strictly below whiteBalance 35", async () => {
    // whiteBalance 35 (spread 19) -> not flagged.
    expect((await analyzeImage(await solidRgb(100, 100, 119))).issues).not.toContain("color-cast");
    // whiteBalance 34 (spread 20) -> flagged.
    expect((await analyzeImage(await solidRgb(100, 100, 120))).issues).toContain("color-cast");
  });

  it("flags desaturated strictly below saturation 30", async () => {
    // saturation 28 (spread 7) -> flagged.
    expect((await analyzeImage(await solidRgb(100, 100, 107))).issues).toContain("desaturated");
    // saturation 30 (spread 8) -> not flagged.
    expect((await analyzeImage(await solidRgb(100, 100, 108))).issues).not.toContain("desaturated");
  });

  it("flags soft-focus strictly below sharpness 35", async () => {
    // sharpness 24 -> flagged.
    expect((await analyzeImage(await twoTone(110, 146))).issues).toContain("soft-focus");
    // sharpness 80 -> not flagged.
    expect((await analyzeImage(await twoTone(40, 216))).issues).not.toContain("soft-focus");
  });

  it("does not flag issues whose thresholds are not crossed", async () => {
    // High-contrast neutral two-tone: only 'desaturated' should appear, proving
    // the other push() conditions stay false (kills always-push mutants).
    expect((await analyzeImage(await twoTone(0, 255))).issues).toEqual(["desaturated"]);
  });
});

// ===========================================================================
// analyzeImage -> suggestMode
// ===========================================================================

describe("analyzeImage suggestedMode", () => {
  it("suggests low-light strictly below exposure 30", async () => {
    // exposure 29 (v=75) -> low-light.
    expect((await analyzeImage(await solidRgb(75, 75, 75))).suggestedMode).toBe("low-light");
    // exposure 30 (v=76) -> not low-light (falls through to auto).
    expect((await analyzeImage(await solidRgb(76, 76, 76))).suggestedMode).toBe("auto");
  });

  it("suggests document only when contrast > 60 AND saturation < 30", async () => {
    // contrast 100, saturation 20, exposure 50 -> document (exercises the &&,
    // and proves it is not short-circuited by the low-light branch).
    expect((await analyzeImage(await twoTone(0, 255))).suggestedMode).toBe("document");
  });

  it("falls back to auto when contrast is high but saturation is not low", async () => {
    // contrast 73, saturation 20... build a high-contrast COLORED image so
    // saturation >= 30 while contrast > 60, forcing the && right side false.
    const buf = await (async () => {
      const w = 64;
      const h = 64;
      const raw = Buffer.alloc(w * h * 3);
      const split = w / 2;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 3;
          if (x < split) {
            raw[i] = 20;
            raw[i + 1] = 10;
            raw[i + 2] = 10;
          } else {
            raw[i] = 240;
            raw[i + 1] = 200;
            raw[i + 2] = 160;
          }
        }
      }
      return await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
        .png()
        .toBuffer();
    })();
    const { scores, suggestedMode } = await analyzeImage(buf);
    expect(scores.contrast).toBeGreaterThan(60);
    expect(scores.saturation).toBeGreaterThanOrEqual(30);
    expect(suggestedMode).toBe("auto");
  });

  it("returns auto for a neutral mid-gray image", async () => {
    expect((await analyzeImage(await solidRgb(128, 128, 128))).suggestedMode).toBe("auto");
  });
});

// ===========================================================================
// scaleCorrections (pure: exact integer outputs)
// ===========================================================================

describe("scaleCorrections", () => {
  const corr: CorrectionParams = {
    brightness: 20,
    contrast: 10,
    temperature: -8,
    saturation: 12,
    sharpness: 15,
    denoise: 3,
  };

  it("is identity for mode auto at intensity 50 (scale 1.0)", () => {
    expect(scaleCorrections(corr, "auto", 50)).toEqual(corr);
  });

  it("zeroes everything at intensity 0", () => {
    // Use all-positive inputs so scaling by 0 cannot mint a signed -0 that
    // toEqual would treat as distinct from 0.
    const positive: CorrectionParams = {
      brightness: 20,
      contrast: 10,
      temperature: 8,
      saturation: 12,
      sharpness: 15,
      denoise: 3,
    };
    expect(scaleCorrections(positive, "auto", 0)).toEqual({
      brightness: 0,
      contrast: 0,
      temperature: 0,
      saturation: 0,
      sharpness: 0,
      denoise: 0,
    });
  });

  it("scales linearly with intensity/50", () => {
    // intensity 25 -> scale 0.5, each field halved and rounded.
    expect(scaleCorrections({ ...corr, denoise: 2 }, "auto", 25)).toEqual({
      brightness: 10,
      contrast: 5,
      temperature: -4,
      saturation: 6,
      sharpness: 8, // round(15 * 0.5) = round(7.5) = 8
      denoise: 1,
    });
  });

  it("applies the portrait preset multipliers", () => {
    // portrait: br .8, ct .7, temp 1.2, sat .6, sharp .5, denoise 1.5.
    expect(scaleCorrections(corr, "portrait", 50)).toEqual({
      brightness: 16, // 20 * 0.8
      contrast: 7, // round(10 * 0.7)
      temperature: -10, // round(-8 * 1.2) = round(-9.6)
      saturation: 7, // round(12 * 0.6) = round(7.2)
      sharpness: 8, // round(15 * 0.5) = round(7.5)
      denoise: 5, // round(3 * 1.5) = round(4.5)
    });
  });

  it("applies the landscape preset multipliers and intensity together", () => {
    // landscape: br 1.0, ct 1.3, temp 1.0, sat 1.4, sharp 1.5, denoise 0.5; intensity 100 -> scale 2.
    expect(scaleCorrections(corr, "landscape", 100)).toEqual({
      brightness: 40, // 20 * 1.0 * 2
      contrast: 26, // 10 * 1.3 * 2
      temperature: -16, // -8 * 1.0 * 2
      saturation: 34, // round(12 * 1.4 * 2) = round(33.6)
      sharpness: 45, // 15 * 1.5 * 2
      denoise: 3, // round(3 * 0.5 * 2) = 3
    });
  });

  it("applies the document preset (saturation multiplier 0 forces 0)", () => {
    expect(scaleCorrections(corr, "document", 50)).toEqual({
      brightness: 30, // 20 * 1.5
      contrast: 20, // 10 * 2.0
      temperature: -8, // -8 * 1.0
      saturation: 0, // 12 * 0.0
      sharpness: 30, // 15 * 2.0
      denoise: 6, // 3 * 2.0
    });
  });

  it("applies the low-light preset multipliers", () => {
    const c: CorrectionParams = {
      brightness: 10,
      contrast: 10,
      temperature: 10,
      saturation: 10,
      sharpness: 10,
      denoise: 2,
    };
    // low-light: br 1.8, ct 1.5, temp 1.0, sat 0.8, sharp 1.2, denoise 2.0.
    expect(scaleCorrections(c, "low-light", 50)).toEqual({
      brightness: 18,
      contrast: 15,
      temperature: 10,
      saturation: 8,
      sharpness: 12,
      denoise: 4,
    });
  });

  it("applies the food preset multipliers", () => {
    const c: CorrectionParams = {
      brightness: 10,
      contrast: 10,
      temperature: 10,
      saturation: 10,
      sharpness: 10,
      denoise: 2,
    };
    // food: br 0.8, ct 1.1, temp 1.3, sat 1.3, sharp 1.2, denoise 0.5.
    expect(scaleCorrections(c, "food", 50)).toEqual({
      brightness: 8,
      contrast: 11,
      temperature: 13,
      saturation: 13,
      sharpness: 12,
      denoise: 1,
    });
  });

  it("differs from auto by exactly the preset ratio where the multiplier != 1", () => {
    // landscape saturation multiplier is 1.4x auto's; prove the table is wired.
    const c: CorrectionParams = { ...corr, saturation: 10 };
    const auto = scaleCorrections(c, "auto", 50).saturation; // 10
    const landscape = scaleCorrections(c, "landscape", 50).saturation; // 14
    expect(auto).toBe(10);
    expect(landscape).toBe(14);
  });
});

// ===========================================================================
// applyCorrections: structural invariants
// ===========================================================================

describe("applyCorrections invariants", () => {
  it("passes the image through unchanged when every toggle is off", async () => {
    // Non-zero corrections but all toggles false -> no operation applies.
    const strong: CorrectionParams = {
      brightness: 80,
      contrast: 80,
      temperature: 80,
      saturation: 80,
      sharpness: 80,
      denoise: 5,
    };
    const out = await run(
      await solidRgb(128, 128, 128),
      strong,
      "auto",
      50,
      { ...ALL_OFF },
      {
        width: 64,
        height: 64,
      },
    );
    expect(await channelMeans(out)).toEqual([128, 128, 128]);
  });

  it("preserves image dimensions", async () => {
    const out = await run(
      await sharp({
        create: { width: 80, height: 40, channels: 3, background: { r: 100, g: 100, b: 100 } },
      })
        .png()
        .toBuffer(),
      { ...NO_CORR, temperature: 40 },
      "auto",
      50,
      onlyEnabled("whiteBalance"),
      { width: 80, height: 40 },
    );
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(80);
    expect(meta.height).toBe(40);
  });

  it("preserves the alpha channel (4-channel input stays 4-channel)", async () => {
    const rgba = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 4,
        background: { r: 120, g: 120, b: 120, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();
    const out = await run(
      rgba,
      { ...NO_CORR, temperature: 40 },
      "auto",
      50,
      onlyEnabled("whiteBalance"),
      {
        width: 32,
        height: 32,
      },
    );
    expect((await sharp(out).metadata()).channels).toBe(4);
  });
});

// ===========================================================================
// applyCorrections Step 4: white balance (exact, robust signal)
// ===========================================================================

describe("applyCorrections white balance (linear per-channel)", () => {
  it("warms the image: R up, G slightly up, B down for positive temperature", async () => {
    // temp 40, auto, intensity 50 -> t = 0.4 -> [1.06, 1.02, 0.94] on 128.
    const out = await run(
      await solidRgb(128, 128, 128),
      { ...NO_CORR, temperature: 40 },
      "auto",
      50,
      onlyEnabled("whiteBalance"),
      {
        width: 64,
        height: 64,
      },
    );
    expect(await channelMeans(out)).toEqual([135, 130, 120]);
  });

  it("cools the image: B up, R down for negative temperature", async () => {
    // temp -40 -> t = -0.4 -> [0.94, 0.98, 1.06] on 128.
    const out = await run(
      await solidRgb(128, 128, 128),
      { ...NO_CORR, temperature: -40 },
      "auto",
      50,
      onlyEnabled("whiteBalance"),
      {
        width: 64,
        height: 64,
      },
    );
    expect(await channelMeans(out)).toEqual([120, 125, 135]);
  });

  it("skips white balance when |scaled adjustment| <= 2", async () => {
    // temp 2, auto, intensity 50 -> adj = 2, not > 2 -> no linear() -> unchanged.
    const out = await run(
      await solidRgb(128, 128, 128),
      { ...NO_CORR, temperature: 2 },
      "auto",
      50,
      onlyEnabled("whiteBalance"),
      {
        width: 64,
        height: 64,
      },
    );
    expect(await channelMeans(out)).toEqual([128, 128, 128]);
  });

  it("respects the whiteBalance toggle", async () => {
    const out = await run(
      await solidRgb(128, 128, 128),
      { ...NO_CORR, temperature: 40 },
      "auto",
      50,
      { ...ALL_OFF },
      {
        width: 64,
        height: 64,
      },
    );
    expect(await channelMeans(out)).toEqual([128, 128, 128]);
  });
});

// ===========================================================================
// applyCorrections Step 5: saturation (via modulate)
// ===========================================================================

describe("applyCorrections saturation (modulate)", () => {
  it("widens channel spread for a positive saturation correction", async () => {
    const cimg = await texturedColor(200, 200);
    const base = await channelSpread(cimg);
    const out = await run(
      cimg,
      { ...NO_CORR, saturation: 30 },
      "auto",
      50,
      onlyEnabled("saturation"),
      {
        width: 200,
        height: 200,
      },
    );
    expect(await channelSpread(out)).toBeGreaterThan(base + 5);
  });

  it("narrows channel spread for a negative saturation correction", async () => {
    const cimg = await texturedColor(200, 200);
    const base = await channelSpread(cimg);
    const out = await run(
      cimg,
      { ...NO_CORR, saturation: -30 },
      "auto",
      50,
      onlyEnabled("saturation"),
      {
        width: 200,
        height: 200,
      },
    );
    expect(await channelSpread(out)).toBeLessThan(base - 5);
  });

  it("skips modulate when |satMul - 1| <= 0.02", async () => {
    // saturation 1, auto, intensity 50 -> adj 1 -> satMul 1.01 -> skip.
    const cimg = await texturedColor(200, 200);
    const base = await channelSpread(cimg);
    const out = await run(
      cimg,
      { ...NO_CORR, saturation: 1 },
      "auto",
      50,
      onlyEnabled("saturation"),
      {
        width: 200,
        height: 200,
      },
    );
    expect(await channelSpread(out)).toBeCloseTo(base, 5);
  });

  it("respects the saturation toggle", async () => {
    const cimg = await texturedColor(200, 200);
    const base = await channelSpread(cimg);
    const out = await run(
      cimg,
      { ...NO_CORR, saturation: 30 },
      "auto",
      50,
      { ...ALL_OFF },
      {
        width: 200,
        height: 200,
      },
    );
    expect(await channelSpread(out)).toBeCloseTo(base, 5);
  });
});

// ===========================================================================
// applyCorrections Step 6: sharpen
// ===========================================================================

describe("applyCorrections sharpen", () => {
  it("raises local stdev when sharpening a textured image", async () => {
    const tex = await texturedGray(300, 300, 110, 146);
    const base = (await channelStdevs(tex))[0];
    const out = await run(
      tex,
      { ...NO_CORR, sharpness: 40 },
      "auto",
      50,
      onlyEnabled("sharpness"),
      {
        width: 300,
        height: 300,
      },
    );
    expect((await channelStdevs(out))[0]).toBeGreaterThan(base + 5);
  });

  it("skips sharpen when the scaled adjustment <= 2", async () => {
    // sharpness 2, auto, intensity 50 -> adj 2, not > 2 -> skip.
    const tex = await texturedGray(300, 300, 110, 146);
    const base = (await channelStdevs(tex))[0];
    const out = await run(tex, { ...NO_CORR, sharpness: 2 }, "auto", 50, onlyEnabled("sharpness"), {
      width: 300,
      height: 300,
    });
    expect((await channelStdevs(out))[0]).toBeCloseTo(base, 5);
  });
});

// ===========================================================================
// applyCorrections denoise: median kernel selection
// ===========================================================================

describe("applyCorrections denoise (median)", () => {
  it("lowers local stdev when the denoise correction is applied", async () => {
    const tex = await texturedGray(300, 300, 110, 146);
    const base = (await channelStdevs(tex))[0];
    const out = await run(tex, { ...NO_CORR, denoise: 5 }, "auto", 50, onlyEnabled("denoise"), {
      width: 300,
      height: 300,
    });
    expect((await channelStdevs(out))[0]).toBeLessThan(base - 2);
  });

  it("skips median when the scaled adjustment < 2", async () => {
    // denoise 1, auto, intensity 50 -> adj 1 -> skip.
    const tex = await texturedGray(300, 300, 110, 146);
    const base = (await channelStdevs(tex))[0];
    const out = await run(tex, { ...NO_CORR, denoise: 1 }, "auto", 50, onlyEnabled("denoise"), {
      width: 300,
      height: 300,
    });
    expect((await channelStdevs(out))[0]).toBeCloseTo(base, 5);
  });

  it("uses a larger kernel (5) for a stronger denoise than kernel 3", async () => {
    // adj 3 (denoise 3) -> kernel 3; adj 5 (denoise 5) -> kernel 5. A 5x5 median
    // smooths more, so its output stdev is strictly lower than the 3x3 output.
    const tex = await texturedGray(300, 300, 100, 160);
    const out3 = await run(tex, { ...NO_CORR, denoise: 3 }, "auto", 50, onlyEnabled("denoise"), {
      width: 300,
      height: 300,
    });
    const out5 = await run(tex, { ...NO_CORR, denoise: 5 }, "auto", 50, onlyEnabled("denoise"), {
      width: 300,
      height: 300,
    });
    expect((await channelStdevs(out5))[0]).toBeLessThan((await channelStdevs(out3))[0]);
  });
});

// ===========================================================================
// applyCorrections Step 2: normalise (histogram stretch)
// ===========================================================================

describe("applyCorrections normalise", () => {
  it("stretches a low-contrast two-tone image (stdev jumps)", async () => {
    // exposure toggle drives normalise; brightness 0 keeps gamma inert.
    const tt = await twoTone(110, 146);
    const base = (await channelStdevs(tt))[0]; // ~18
    const out = await run(tt, NO_CORR, "auto", 50, onlyEnabled("exposure"), {
      width: 64,
      height: 64,
    });
    expect((await channelStdevs(out))[0]).toBeGreaterThan(base + 50);
  });

  it("leaves a full-range solid image untouched (nothing to stretch)", async () => {
    const solid = await solidRgb(128, 128, 128);
    const out = await run(solid, NO_CORR, "auto", 50, onlyEnabled("exposure"), {
      width: 64,
      height: 64,
    });
    expect(await channelMeans(out)).toEqual([128, 128, 128]);
  });

  it("returns the input pixels at intensity 0 with every correction enabled (#4369)", async () => {
    // Every intensity-scaled step is inert at 0; the stretch used to clip 5%
    // at each end here, its strongest setting, and darken this scene.
    const scene = await sharp(SCENE_PATH).removeAlpha().png().toBuffer();
    const { width, height } = await sharp(scene).metadata();
    const analysis = await analyzeImage(scene);
    for (const mode of ["auto", "food", "document"] as const) {
      const out = await run(scene, analysis.corrections, mode, 0, {}, { width, height });
      const [a, b] = await Promise.all([
        sharp(scene).raw().toBuffer(),
        sharp(out).raw().toBuffer(),
      ]);
      expect(b.equals(a)).toBe(true);
    }
  });

  it("skips the stretch at low intensity once the ramped clip rounds to 0 (#4369)", async () => {
    // auto at 5: (5 - 0.225) * 0.1 = 0.48 -> clip 0 -> no 0-100 min-max stretch.
    const tt = await twoTone(110, 146);
    const out = await run(tt, NO_CORR, "auto", 5, onlyEnabled("exposure"), {
      width: 64,
      height: 64,
    });
    expect(await channelMeans(out)).toEqual(await channelMeans(tt));
  });

  it("stretches less below the default intensity, not more (#4369)", async () => {
    // Uniform 60-200 texture, fine enough that each 1% of clip moves stdev.
    const tex = await texturedGray(400, 400, 60, 200);
    const size = { width: 400, height: 400 };
    const stdevAt = async (intensity: number) =>
      (
        await channelStdevs(
          await run(tex, NO_CORR, "auto", intensity, onlyEnabled("exposure"), size),
        )
      )[0];
    const [s10, s25, s50] = [await stdevAt(10), await stdevAt(25), await stdevAt(50)];
    expect(s10).toBeLessThan(s25);
    expect(s25).toBeLessThan(s50);
  });
});

// ===========================================================================
// applyCorrections Step 3: gamma clamp + gate
// ===========================================================================

describe("applyCorrections gamma", () => {
  it("clamps gamma at the 3.0 ceiling (brightness 250 and 400 give identical output)", async () => {
    // gamma = clamp(1 + adj/100, 1, 3): adj 250 -> 3.0, adj 400 -> 3.0 (clamped).
    // Both must produce byte-identical pixels. Use a solid so normalise is inert.
    const solid = await solidRgb(128, 128, 128);
    const g250 = await run(
      solid,
      { ...NO_CORR, brightness: 250 },
      "auto",
      50,
      onlyEnabled("exposure"),
      {
        width: 64,
        height: 64,
      },
    );
    const g400 = await run(
      solid,
      { ...NO_CORR, brightness: 400 },
      "auto",
      50,
      onlyEnabled("exposure"),
      {
        width: 64,
        height: 64,
      },
    );
    expect((await channelMeans(g250))[0]).toBe((await channelMeans(g400))[0]);
    // And the clamped gamma actually shifted the solid away from 128.
    expect((await channelMeans(g250))[0]).not.toBe(128);
  });

  it("skips gamma when |scaled adjustment| <= 2 (solid stays exactly put)", async () => {
    // brightness 5, intensity 10 -> adj = 5 * 0.2 = 1, not > 2 -> no gamma.
    const solid = await solidRgb(128, 128, 128);
    const out = await run(
      solid,
      { ...NO_CORR, brightness: 5 },
      "auto",
      10,
      onlyEnabled("exposure"),
      {
        width: 64,
        height: 64,
      },
    );
    expect(await channelMeans(out)).toEqual([128, 128, 128]);
  });
});

// ===========================================================================
// applyCorrections Step 1: CLAHE (contrast) + MAX_CLAHE_PIXELS boundary
// ===========================================================================

describe("applyCorrections CLAHE", () => {
  it("increases local stdev on a low-contrast texture with small tiles", async () => {
    // Default size (undefined -> 64) yields tile 8, so CLAHE genuinely equalizes.
    const tex = await texturedGray(400, 400, 110, 146);
    const base = (await channelStdevs(tex))[0]; // ~10.7
    const out = await run(tex, NO_CORR, "auto", 50, onlyEnabled("contrast"));
    expect((await channelStdevs(out))[0]).toBeGreaterThan(base + 2);
  });

  it("skips CLAHE when maxSlope clamps below 2 (intensity 0)", async () => {
    // maxSlope = clamp(round(1 + 0*4*1), 1, 10) = 1 -> below 2 -> skipped.
    const tex = await texturedGray(400, 400, 110, 146);
    const base = (await channelStdevs(tex))[0];
    const out = await run(tex, NO_CORR, "auto", 0, onlyEnabled("contrast"));
    expect((await channelStdevs(out))[0]).toBeCloseTo(base, 5);
  });

  it("applies CLAHE at exactly MAX_CLAHE_PIXELS but skips it one pixel over", async () => {
    // Observe the claheApplied flag through Step 5's +0.05 saturation
    // compensation (intensity 50 > 10). Same real pixels, only imageSize varies.
    // 4000x4000 = 16,000,000 (<= limit) -> CLAHE applies -> spread grows.
    // 4000x4001 = 16,004,000 (> limit)  -> CLAHE skipped -> spread unchanged.
    const cimg = await texturedColor(400, 400);
    const base = await channelSpread(cimg);

    const atLimit = await run(cimg, NO_CORR, "auto", 50, onlyEnabled("contrast", "saturation"), {
      width: 4000,
      height: 4000,
    });
    const overLimit = await run(cimg, NO_CORR, "auto", 50, onlyEnabled("contrast", "saturation"), {
      width: 4000,
      height: 4001,
    });

    expect(await channelSpread(atLimit)).toBeGreaterThan(base + 1);
    expect(await channelSpread(overLimit)).toBeCloseTo(base, 5);
  });

  it("respects the contrast toggle (CLAHE off leaves texture stdev flat)", async () => {
    const tex = await texturedGray(400, 400, 110, 146);
    const base = (await channelStdevs(tex))[0];
    const out = await run(tex, NO_CORR, "auto", 50, { ...ALL_OFF });
    expect((await channelStdevs(out))[0]).toBeCloseTo(base, 5);
  });
});

// ===========================================================================
// #4842: the computed exposure, contrast, white-balance and backlight
// corrections have to reach the pixels, in the right direction.
// ===========================================================================

/** Bright sky over the top 60%, a dark textured subject (20-59, mean 39.5) below. */
async function backlitScene(w = 400, h = 300): Promise<Buffer> {
  const buf = Buffer.alloc(w * h * 3);
  const horizon = Math.round(h * 0.6);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = y < horizon ? 225 + ((x * 7 + y * 3) % 25) : 20 + ((x * 13 + y * 7) % 40);
      const i = (y * w + x) * 3;
      buf[i] = v;
      buf[i + 1] = v;
      buf[i + 2] = v;
    }
  }
  return await sharp(buf, { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toBuffer();
}

/** Textured image with a fixed per-channel cast, every channel spread +/-20. */
async function castTexture(r: number, g: number, b: number, w = 200, h = 150): Promise<Buffer> {
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = ((x * 5 + y * 3) % 40) - 20;
      const i = (y * w + x) * 3;
      buf[i] = r + d;
      buf[i + 1] = g + d;
      buf[i + 2] = b + d;
    }
  }
  return await sharp(buf, { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toBuffer();
}

/** Mean of the first channel over rows [y0, y1), read from raw pixels (stats() ignores extract). */
async function rowsMean(png: Buffer, y0: number, y1: number): Promise<number> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < info.width; x++) {
      sum += data[(y * info.width + x) * info.channels];
      n++;
    }
  }
  return sum / n;
}

describe("applyCorrections exposure curve (#4842)", () => {
  it("brightens when the brightness correction is positive (sharp gamma no longer cancels out)", async () => {
    const tex = await texturedGray(128, 128, 40, 120);
    const off = await run(tex, NO_CORR, "auto", 50, onlyEnabled("exposure"), {
      width: 128,
      height: 128,
    });
    const lifted = await run(
      tex,
      { ...NO_CORR, brightness: 30 },
      "auto",
      50,
      onlyEnabled("exposure"),
      {
        width: 128,
        height: 128,
      },
    );
    expect((await channelMeans(lifted))[0]).toBeGreaterThan((await channelMeans(off))[0] + 10);
  });

  it("darkens when the brightness correction is negative instead of dropping it", async () => {
    const tex = await texturedGray(128, 128, 140, 220);
    const off = await run(tex, NO_CORR, "auto", 50, onlyEnabled("exposure"), {
      width: 128,
      height: 128,
    });
    const darker = await run(
      tex,
      { ...NO_CORR, brightness: -30 },
      "auto",
      50,
      onlyEnabled("exposure"),
      {
        width: 128,
        height: 128,
      },
    );
    expect((await channelMeans(darker))[0]).toBeLessThan((await channelMeans(off))[0] - 10);
  });

  it("brightens a dark photo end to end with only exposure enabled", async () => {
    const dark = await texturedGray(128, 128, 10, 99);
    const analysis = await analyzeImage(dark);
    expect(analysis.corrections.brightness).toBeGreaterThan(0);
    const withCurve = await run(dark, analysis.corrections, "auto", 50, onlyEnabled("exposure"), {
      width: 128,
      height: 128,
    });
    const stretchOnly = await run(
      dark,
      { ...analysis.corrections, brightness: 0 },
      "auto",
      50,
      onlyEnabled("exposure"),
      { width: 128, height: 128 },
    );
    expect((await channelMeans(withCurve))[0]).toBeGreaterThan(
      (await channelMeans(stretchOnly))[0],
    );
    expect((await channelMeans(withCurve))[0]).toBeGreaterThan((await channelMeans(dark))[0]);
  });
});

describe("applyCorrections global contrast (#4842)", () => {
  it("applies the contrast correction (stdev rises with it, CLAHE held constant)", async () => {
    const flat = await texturedGray(128, 128, 110, 146);
    const size = { width: 128, height: 128 };
    const without = await run(flat, NO_CORR, "auto", 50, onlyEnabled("contrast"), size);
    const withIt = await run(
      flat,
      { ...NO_CORR, contrast: 30 },
      "auto",
      50,
      onlyEnabled("contrast"),
      size,
    );
    expect((await channelStdevs(withIt))[0]).toBeGreaterThan(
      (await channelStdevs(without))[0] * 1.2,
    );
  });

  it("survives the normalise stretch (it runs after it, not before)", async () => {
    const flat = await texturedGray(128, 128, 110, 146);
    const size = { width: 128, height: 128 };
    const toggles = onlyEnabled("contrast", "exposure");
    const without = await run(flat, NO_CORR, "auto", 50, toggles, size);
    const lower = await run(flat, { ...NO_CORR, contrast: -30 }, "auto", 50, toggles, size);
    expect((await channelStdevs(lower))[0]).toBeLessThan((await channelStdevs(without))[0] * 0.85);
  });

  it("leaves contrast alone when the contrast toggle is off", async () => {
    const flat = await texturedGray(128, 128, 110, 146);
    const out = await run(flat, { ...NO_CORR, contrast: 30 }, "auto", 50, ALL_OFF, {
      width: 128,
      height: 128,
    });
    expect(await channelStdevs(out)).toEqual(await channelStdevs(flat));
  });

  it("keeps the alpha channel intact through the exposure curve and contrast", async () => {
    const rgba = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 4,
        background: { r: 120, g: 120, b: 120, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();
    const toggles = onlyEnabled("contrast", "exposure");
    const before = await run(rgba, NO_CORR, "auto", 50, toggles);
    const after = await run(
      rgba,
      { ...NO_CORR, brightness: 30, contrast: 30 },
      "auto",
      50,
      toggles,
    );
    // The colour channels did move, so the alpha check is not vacuous.
    expect((await channelMeans(after))[0]).not.toBe((await channelMeans(before))[0]);
    expect((await channelMeans(after))[3]).toBe((await channelMeans(before))[3]);
  });
});

/** A grey frame drawn by `valueAt(x, y)`. */
async function grayScene(
  w: number,
  h: number,
  valueAt: (x: number, y: number) => number,
): Promise<Buffer> {
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = valueAt(x, y);
      const i = (y * w + x) * 3;
      buf[i] = v;
      buf[i + 1] = v;
      buf[i + 2] = v;
    }
  }
  return await sharp(buf, { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toBuffer();
}

/** A bright page (235, with dark text lines at 20) in the middle of a dark desk (35). */
function pageOnDesk(): Promise<Buffer> {
  return grayScene(400, 300, (x, y) => {
    const onPage = x >= 70 && x < 330 && y >= 40 && y < 260;
    if (!onPage) return 35;
    return y % 12 < 2 && x > 90 && x < 310 ? 20 : 235;
  });
}

/** A dark subject (20-59) in the middle of a bright window (225-249) on every side. */
function subjectInWindow(): Promise<Buffer> {
  return grayScene(400, 300, (x, y) => {
    const subject = x >= 120 && x < 280 && y >= 80 && y < 300;
    return subject ? 20 + ((x * 13 + y * 7) % 40) : 225 + ((x * 7 + y * 3) % 25);
  });
}

describe("backlit placement check (#4842 review)", () => {
  it("does not read a page on a dark desk as backlit", async () => {
    const analysis = await analyzeImage(await pageOnDesk());
    expect(analysis.corrections.backlit).toBeUndefined();
  });

  it("reads a dark subject framed by a bright window as backlit", async () => {
    const analysis = await analyzeImage(await subjectInWindow());
    expect(analysis.corrections.backlit).toBe(true);
  });

  it("keeps document mode from lifting a frame flagged backlit (paper and text keep their levels)", async () => {
    const scene = await backlitScene();
    const corrections = { ...(await analyzeImage(scene)).corrections };
    expect(corrections.backlit).toBe(true);
    const size = { width: 400, height: 300 };
    const doc = await run(scene, corrections, "document", 50, onlyEnabled("exposure"), size);
    const docUnflagged = await run(
      scene,
      { ...corrections, backlit: undefined, brightness: 0 },
      "document",
      50,
      onlyEnabled("exposure"),
      size,
    );
    expect(await channelMeans(doc)).toEqual(await channelMeans(docUnflagged));
  });
});

describe("document mode contrast (#4842 review)", () => {
  it("never lowers contrast in document mode", async () => {
    const page = await pageOnDesk();
    const size = { width: 400, height: 300 };
    const without = await run(page, NO_CORR, "document", 50, onlyEnabled("contrast"), size);
    const reduced = await run(
      page,
      { ...NO_CORR, contrast: -24 },
      "document",
      50,
      onlyEnabled("contrast"),
      size,
    );
    expect(await channelStdevs(reduced)).toEqual(await channelStdevs(without));
  });

  it("still lowers contrast for the same correction in auto mode", async () => {
    const page = await pageOnDesk();
    const size = { width: 400, height: 300 };
    const without = await run(page, NO_CORR, "auto", 50, onlyEnabled("contrast"), size);
    const reduced = await run(
      page,
      { ...NO_CORR, contrast: -24 },
      "auto",
      50,
      onlyEnabled("contrast"),
      size,
    );
    expect((await channelStdevs(reduced))[0]).toBeLessThan((await channelStdevs(without))[0]);
  });

  it("still raises contrast in document mode", async () => {
    const flat = await texturedGray(128, 128, 110, 146);
    const size = { width: 128, height: 128 };
    const without = await run(flat, NO_CORR, "document", 50, onlyEnabled("contrast"), size);
    const raised = await run(
      flat,
      { ...NO_CORR, contrast: 20 },
      "document",
      50,
      onlyEnabled("contrast"),
      size,
    );
    expect((await channelStdevs(raised))[0]).toBeGreaterThan((await channelStdevs(without))[0]);
  });
});

describe("backlit photos (#4842)", () => {
  it("reads a bright background over a dark subject as backlit, not overexposed", async () => {
    const analysis = await analyzeImage(await backlitScene());
    expect(analysis.corrections.backlit).toBe(true);
    expect(analysis.corrections.brightness).toBeGreaterThan(0);
    expect(analysis.issues).not.toContain("overexposed");
  });

  it("still flags an evenly bright photo as overexposed", async () => {
    const analysis = await analyzeImage(await texturedGray(128, 128, 200, 250));
    expect(analysis.corrections.backlit).toBeUndefined();
    expect(analysis.corrections.brightness).toBeLessThan(0);
    expect(analysis.issues).toContain("overexposed");
  });

  it("lifts the subject with the full auto pipeline at the defaults", async () => {
    const scene = await backlitScene();
    const analysis = await analyzeImage(scene);
    const out = await run(scene, analysis.corrections, "auto", 50, {}, { width: 400, height: 300 });
    expect(await rowsMean(scene, 180, 300)).toBeCloseTo(39.5, 1);
    expect(await rowsMean(out, 180, 300)).toBeGreaterThan(55);
  });

  it("lifts the subject with only exposure enabled (no normalise black clip)", async () => {
    const scene = await backlitScene();
    const analysis = await analyzeImage(scene);
    const out = await run(scene, analysis.corrections, "auto", 50, onlyEnabled("exposure"), {
      width: 400,
      height: 300,
    });
    expect(await rowsMean(out, 180, 300)).toBeGreaterThan(55);
  });
});

describe("white balance neutralises in both directions (#4842)", () => {
  async function redBlueRatio(buf: Buffer): Promise<number> {
    const [r, , b] = await channelMeans(buf);
    return r / b;
  }

  it("moves a warm cast's R/B ratio towards 1", async () => {
    const warm = await castTexture(179, 119, 64);
    const analysis = await analyzeImage(warm);
    const out = await run(warm, analysis.corrections, "auto", 50, onlyEnabled("whiteBalance"));
    const before = await redBlueRatio(warm);
    expect(before).toBeGreaterThan(1);
    expect(await redBlueRatio(out)).toBeLessThan(before);
  });

  it("moves a cool cast's R/B ratio towards 1", async () => {
    const cool = await castTexture(69, 119, 179);
    const analysis = await analyzeImage(cool);
    const out = await run(cool, analysis.corrections, "auto", 50, onlyEnabled("whiteBalance"));
    const before = await redBlueRatio(cool);
    expect(before).toBeLessThan(1);
    expect(await redBlueRatio(out)).toBeGreaterThan(before);
  });
});
