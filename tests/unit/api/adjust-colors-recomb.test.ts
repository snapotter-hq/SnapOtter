import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import {
  multiplyMatrix3x3,
  registerColorAdjustments,
} from "../../../apps/api/src/routes/tools/adjust-colors.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

const app = { post: () => undefined } as unknown as FastifyInstance;

beforeAll(() => {
  registerColorAdjustments(app);
});

async function makeSolidPng(r: number, g: number, b: number, alpha?: number): Promise<Buffer> {
  return sharp({
    create: {
      width: 8,
      height: 8,
      channels: alpha === undefined ? 3 : 4,
      background: alpha === undefined ? { r, g, b } : { r, g, b, alpha },
    },
  })
    .png()
    .toBuffer();
}

async function firstPixel(buf: Buffer): Promise<number[]> {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  return Array.from(data.subarray(0, info.channels));
}

async function runAdjustColors(
  input: Buffer,
  rawSettings: Record<string, unknown>,
  filename = "sample.png",
  toolId = "adjust-colors",
): Promise<Buffer> {
  const config = getToolConfig(toolId);
  if (!config) throw new Error(`${toolId} must be registered`);
  const settings = config.settingsSchema.parse(rawSettings);
  const result = await config.process(input, settings, filename);
  return result.buffer;
}

describe("adjust-colors combined recomb matrices (#2608)", () => {
  it("applies channel multipliers before sepia instead of dropping them", async () => {
    const gray = await makeSolidPng(128, 128, 128);

    const sepiaOnly = await runAdjustColors(gray, {
      red: 100,
      green: 100,
      blue: 100,
      effect: "sepia",
    });
    const zeroRedSepia = await runAdjustColors(gray, {
      red: 0,
      green: 100,
      blue: 100,
      effect: "sepia",
    });

    const sepiaPx = await firstPixel(sepiaOnly);
    const zeroRedSepiaPx = await firstPixel(zeroRedSepia);

    // Unmodified gray(128) through sepia -> [172, 153, 119]
    expect(sepiaPx).toEqual([172, 153, 119]);
    // Zeroing red before sepia leaves only 128 * (G_col + B_col) -> [122, 109, 85]
    expect(zeroRedSepiaPx).toEqual([122, 109, 85]);
  });

  it("combines temperature/tint with channel multipliers instead of overwriting temperature/tint", async () => {
    const gray = await makeSolidPng(120, 120, 120);

    const channelsOnly = await runAdjustColors(gray, {
      red: 150,
      green: 100,
      blue: 50,
    });
    const tempTintAndChannels = await runAdjustColors(gray, {
      temperature: 80,
      tint: 60,
      red: 150,
      green: 100,
      blue: 50,
    });

    const channelsPx = await firstPixel(channelsOnly);
    const combinedPx = await firstPixel(tempTintAndChannels);

    // channelsOnly: [120 * 1.5 = 180, 120 * 1.0 = 120, 120 * 0.5 = 60]
    expect(channelsPx).toEqual([180, 120, 60]);
    // With temperature=80 (t=0.8) and tint=60 (n=0.6):
    // tempTint diag = [1 + 0.12 + 0.06 = 1.18, 1 + 0.04 - 0.09 = 0.95, 1 - 0.12 + 0.06 = 0.94]
    // Combined with [1.5, 1.0, 0.5] on 120 -> [212.4, 114, 56.4] -> [212, 114, 56]
    expect(combinedPx).toEqual([212, 114, 56]);
  });

  it("combines temperature/tint with sepia instead of dropping temperature/tint", async () => {
    const gray = await makeSolidPng(128, 128, 128);

    const sepiaOnly = await runAdjustColors(gray, {
      effect: "sepia",
    });
    const warmSepia = await runAdjustColors(gray, {
      temperature: 100,
      tint: 100,
      effect: "sepia",
    });
    const coolSepia = await runAdjustColors(gray, {
      temperature: -100,
      tint: -100,
      effect: "sepia",
    });

    const sepiaPx = await firstPixel(sepiaOnly);
    const warmPx = await firstPixel(warmSepia);
    const coolPx = await firstPixel(coolSepia);

    expect(sepiaPx).toEqual([172, 153, 119]);
    // temperature=100, tint=100 -> diag [1.25, 0.9, 0.95] on 128 -> [160, 115.2, 121.6]
    // Sepia on [160, 115.2, 121.6] -> [174.4512, 155.3088, 120.9664] -> [174, 155, 120]
    expect(warmPx).toEqual([174, 155, 120]);
    // temperature=-100, tint=-100 -> diag [0.75, 1.1, 1.05] on 128 -> [96, 140.8, 134.4]
    // Sepia on [96, 140.8, 134.4] -> [171.4048, 152.6656, 118.912] -> [171, 152, 118]
    expect(coolPx).toEqual([171, 152, 118]);
  });

  it("composes temperature/tint + channel multipliers + sepia in one pass and preserves RGBA alpha", async () => {
    const rgba = await makeSolidPng(100, 140, 180, 0.5);

    const combined = await runAdjustColors(rgba, {
      temperature: 60,
      tint: -40,
      red: 50,
      green: 150,
      blue: 80,
      effect: "sepia",
    });

    // t = 0.6, n = -0.4 -> diag [1 + 0.09 - 0.04 = 1.05, 1 + 0.03 + 0.06 = 1.09, 1 - 0.09 - 0.04 = 0.87]
    // channels [0.5, 1.5, 0.8] -> scaled RGB:
    // R' = 100 * 1.05 * 0.5 = 52.5
    // G' = 140 * 1.09 * 1.5 = 228.9
    // B' = 180 * 0.87 * 0.8 = 125.28
    // Sepia:
    // outR = 0.393 * 52.5 + 0.769 * 228.9 + 0.189 * 125.28 = 220.33452 -> 220
    // outG = 0.349 * 52.5 + 0.686 * 228.9 + 0.168 * 125.28 = 196.395 -> 196
    // outB = 0.272 * 52.5 + 0.534 * 228.9 + 0.131 * 125.28 = 152.92428 -> 152
    const px = await firstPixel(combined);
    expect(px).toEqual([220, 196, 152, 128]);
  });

  it("composes recomb matrices on TIFF output and animated GIF per-frame sharpness path", async () => {
    const grayTiff = await sharp(await makeSolidPng(128, 128, 128))
      .tiff({ compression: "lzw" })
      .toBuffer();

    const tiffOut = await runAdjustColors(
      grayTiff,
      { red: 0, green: 100, blue: 100, effect: "sepia" },
      "sample.tiff",
      "color-effects",
    );
    expect(await firstPixel(tiffOut)).toEqual([122, 109, 85]);

    const animGif = readFixture(fixtures.image.animated.gif);
    const animSepia = await runAdjustColors(
      animGif,
      { sharpness: 20, red: 100, green: 100, blue: 100, effect: "sepia" },
      "anim.gif",
    );
    const animZeroRedSepia = await runAdjustColors(
      animGif,
      { sharpness: 20, red: 0, green: 0, blue: 100, effect: "sepia" },
      "anim.gif",
    );
    const meta = await sharp(animZeroRedSepia, { animated: true }).metadata();
    expect(meta.pages).toBeGreaterThan(1);
    expect(await firstPixel(animZeroRedSepia)).not.toEqual(await firstPixel(animSepia));
  });

  it("multiplyMatrix3x3 multiplies full 3x3 matrices including all off-diagonal cells", () => {
    const a: [[number, number, number], [number, number, number], [number, number, number]] = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];
    const b: [[number, number, number], [number, number, number], [number, number, number]] = [
      [2, 3, 5],
      [7, 11, 13],
      [17, 19, 23],
    ];
    expect(multiplyMatrix3x3(a, b)).toEqual([
      [67, 82, 100],
      [145, 181, 223],
      [223, 280, 346],
    ]);
  });

  it("scales channels or temperature/tint before inverting instead of clamping float bands to black (#3120)", async () => {
    const sample = await makeSolidPng(100, 50, 20);

    const channelsInverted = await runAdjustColors(sample, {
      red: 120,
      green: 80,
      blue: 100,
      effect: "invert",
    });
    const tempTintInverted = await runAdjustColors(sample, {
      temperature: 40,
      tint: -20,
      effect: "invert",
    });
    const chainedInverted = await runAdjustColors(sample, {
      temperature: 40,
      tint: -20,
      red: 120,
      green: 80,
      blue: 100,
      effect: "invert",
    });

    // [100 * 1.2, 50 * 0.8, 20 * 1.0] = [120, 40, 20] -> inverted: [135, 215, 235]
    expect(await firstPixel(channelsInverted)).toEqual([135, 215, 235]);
    // [100 * 1.04, 50 * 1.05, 20 * 0.92] = [104, 52, 18] -> inverted: [151, 203, 237]
    expect(await firstPixel(tempTintInverted)).toEqual([151, 203, 237]);
    // [100 * 1.04 * 1.2, 50 * 1.05 * 0.8, 20 * 0.92 * 1.0] = [124, 42, 18] -> inverted: [131, 213, 237]
    expect(await firstPixel(chainedInverted)).toEqual([131, 213, 237]);

    const rgbaSample = await makeSolidPng(100, 50, 20, 1);
    const rgbaPlainInverted = await runAdjustColors(rgbaSample, { effect: "invert" });
    const rgbaRecombInverted = await runAdjustColors(rgbaSample, {
      red: 120,
      green: 80,
      blue: 100,
      effect: "invert",
    });
    expect(await firstPixel(rgbaPlainInverted)).toEqual([155, 205, 235, 255]);
    expect(await firstPixel(rgbaRecombInverted)).toEqual([135, 215, 235, 255]);
  });

  it("brightens midtones when positive exposure is combined with temperature/tint, channels, or sepia (#3120)", async () => {
    const sample = await makeSolidPng(100, 50, 20);
    const rgbaSample = await makeSolidPng(100, 50, 20, 0.5);

    const exposureTempTint = await runAdjustColors(sample, {
      exposure: 25,
      temperature: 40,
      tint: -20,
    });
    const exposureChannels = await runAdjustColors(rgbaSample, {
      exposure: 25,
      red: 120,
      green: 80,
      blue: 100,
    });
    const exposureSepia = await runAdjustColors(sample, {
      exposure: 25,
      effect: "sepia",
    });

    // Recomb [104, 52, 18] brightened by gammaOut=1.5 -> [140, 88, 43]
    expect(await firstPixel(exposureTempTint)).toEqual([140, 88, 43]);
    // Recomb [120, 40, 20] brightened by gammaOut=1.5 -> [154, 74, 46], preserving RGBA alpha=128
    expect(await firstPixel(exposureChannels)).toEqual([154, 74, 46, 128]);
    // Sepia [81, 72, 56] brightened by gammaOut=1.5 -> [118, 109, 92]
    expect(await firstPixel(exposureSepia)).toEqual([118, 109, 92]);
  });

  it("applies channel multipliers and temperature/tint before converting to grayscale (#3120)", async () => {
    const sample = await makeSolidPng(100, 50, 20);

    const plainGray = await runAdjustColors(sample, {
      effect: "grayscale",
    });
    const zeroRedGray = await runAdjustColors(sample, {
      red: 0,
      green: 100,
      blue: 100,
      effect: "grayscale",
    });
    const warmGray = await runAdjustColors(sample, {
      temperature: 100,
      tint: 100,
      effect: "grayscale",
    });

    expect(await firstPixel(plainGray)).toEqual([64, 64, 64]);
    // Zeroing red yields [0, 50, 20] whose grayscale luminance is [42, 42, 42] with R === G === B
    expect(await firstPixel(zeroRedGray)).toEqual([42, 42, 42]);
    const warmGrayPx = await firstPixel(warmGray);
    expect(warmGrayPx[0]).toBe(warmGrayPx[1]);
    expect(warmGrayPx[1]).toBe(warmGrayPx[2]);
    expect(warmGrayPx[0]).toBeGreaterThan(64);
  });

  it("preserves animation frames, contrast, negative exposure, and TIFF uchar depth across needsRecombMaterialize (#3120)", async () => {
    const animGif = readFixture(fixtures.image.animated.gif);
    const inMeta = await sharp(animGif, { animated: true }).metadata();

    const [baseGif, brightGif] = await Promise.all([
      runAdjustColors(
        animGif,
        { exposure: 0, red: 120, green: 80, blue: 100, effect: "grayscale" },
        "anim.gif",
      ),
      runAdjustColors(
        animGif,
        { exposure: 25, red: 120, green: 80, blue: 100, effect: "grayscale" },
        "anim.gif",
      ),
    ]);
    const outMeta = await sharp(brightGif, { animated: true }).metadata();
    expect(outMeta.format).toBe("gif");
    expect(outMeta.pages).toBe(inMeta.pages);
    expect(outMeta.width).toBe(inMeta.width);
    expect(outMeta.pageHeight).toBe(inMeta.pageHeight);
    const basePx0 = await firstPixel(baseGif);
    const brightPx0 = await firstPixel(brightGif);
    expect(brightPx0[0]).toBe(brightPx0[1]);
    expect(brightPx0[1]).toBe(brightPx0[2]);
    expect(brightPx0[0]).toBeGreaterThan(basePx0[0]);
    const frame1Raw = await sharp(brightGif, { page: 1, pages: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(frame1Raw.data[0]).toBe(frame1Raw.data[1]);
    expect(frame1Raw.data[1]).toBe(frame1Raw.data[2]);
    expect(frame1Raw.data[0]).toBeGreaterThan(0);

    const sampleTiff = await sharp(await makeSolidPng(100, 50, 20))
      .tiff({ compression: "lzw" })
      .toBuffer();
    const outTiff = await runAdjustColors(
      sampleTiff,
      { exposure: -50, contrast: 20, red: 120, green: 80, blue: 100, effect: "invert" },
      "sample.tiff",
    );
    const tiffMeta = await sharp(outTiff).metadata();
    expect(tiffMeta.format).toBe("tiff");
    expect(tiffMeta.depth).toBe("uchar");
    const tiffPx = await firstPixel(outTiff);
    expect(tiffPx[0]).toBeGreaterThan(100);
    expect(tiffPx[1]).toBeGreaterThan(200);
    expect(tiffPx[2]).toBe(255);
  });

  it("applies saturation and hue before sepia, channels, and temperature/tint instead of overwriting recomb (#3133)", async () => {
    const sample = await makeSolidPng(200, 100, 50);

    const desatSepia = await runAdjustColors(sample, {
      saturation: -100,
      effect: "sepia",
    });
    const hueSepia = await runAdjustColors(sample, {
      hue: 180,
      effect: "sepia",
    });
    const desatChannels = await runAdjustColors(sample, {
      saturation: -100,
      red: 150,
      green: 100,
      blue: 50,
    });
    const desatTempTint = await runAdjustColors(sample, {
      saturation: -100,
      temperature: 100,
      tint: 100,
    });

    // Desaturating rgb(200, 100, 50) yields [128, 128, 128]; sepia on [128, 128, 128] -> [172, 153, 119]
    expect(await firstPixel(desatSepia)).toEqual([172, 153, 119]);
    // Rotating hue by 180 deg then applying warm sepia matrix -> [152, 136, 106]
    expect(await firstPixel(hueSepia)).toEqual([152, 136, 106]);
    // Desaturating to [128, 128, 128] then scaling channels by [1.5, 1.0, 0.5] -> [192, 128, 64]
    expect(await firstPixel(desatChannels)).toEqual([192, 128, 64]);
    // Desaturating to [128, 128, 128] then scaling temp/tint by [1.25, 0.9, 0.95] -> [160, 115, 121]
    expect(await firstPixel(desatTempTint)).toEqual([160, 115, 121]);
  });

  it("applies brightness and contrast before sepia and channel multipliers without unclamped float drift (#3133)", async () => {
    const sample = await makeSolidPng(200, 100, 50);
    const rgbaSample = await makeSolidPng(200, 100, 50, 0.5);

    const darkSepia = await runAdjustColors(sample, {
      brightness: -50,
      effect: "sepia",
    });
    const flatContrastSepia = await runAdjustColors(sample, {
      contrast: -100,
      effect: "sepia",
    });
    const brightFlatContrastSepia = await runAdjustColors(sample, {
      brightness: 100,
      contrast: -100,
      effect: "sepia",
    });
    const redContrastExp0 = await runAdjustColors(rgbaSample, {
      red: 150,
      contrast: -50,
      exposure: 0,
    });
    const redContrastExp1 = await runAdjustColors(rgbaSample, {
      red: 150,
      contrast: -50,
      exposure: 1,
    });
    const desatChannelsInverted = await runAdjustColors(rgbaSample, {
      saturation: -100,
      red: 150,
      green: 100,
      blue: 50,
      effect: "invert",
    });

    // Darkening rgb(200, 100, 50) by 50% yields [100, 50, 25]; sepia on [100, 50, 25] -> [72, 64, 50]
    expect(await firstPixel(darkSepia)).toEqual([72, 64, 50]);
    // Flattening contrast to [128, 128, 128] before sepia -> warm sepia [172, 153, 119]
    expect(await firstPixel(flatContrastSepia)).toEqual([172, 153, 119]);
    expect(await firstPixel(brightFlatContrastSepia)).toEqual([172, 153, 119]);
    // Contrast -50 on [200, 100, 50] -> [164, 114, 89], then red=150 -> [246, 114, 89, 128]
    expect(await firstPixel(redContrastExp0)).toEqual([246, 114, 89, 128]);
    expect(await firstPixel(redContrastExp1)).toEqual([246, 115, 90, 128]);
    // Desaturate [128, 128, 128] -> channels [192, 128, 64] -> invert [63, 127, 191, 128]
    expect(await firstPixel(desatChannelsInverted)).toEqual([63, 127, 191, 128]);
  });

  it("preserves animation frames and LZW TIFF uchar depth when pre-recomb materialisation is active (#3133)", async () => {
    const animGif = readFixture(fixtures.image.animated.gif);
    const inMeta = await sharp(animGif, { animated: true }).metadata();

    const desatSepiaGif = await runAdjustColors(
      animGif,
      { saturation: -100, effect: "sepia" },
      "anim.gif",
    );
    const outMeta = await sharp(desatSepiaGif, { animated: true }).metadata();
    expect(outMeta.format).toBe("gif");
    expect(outMeta.pages).toBe(inMeta.pages);
    expect(outMeta.width).toBe(inMeta.width);
    expect(outMeta.pageHeight).toBe(inMeta.pageHeight);
    const frame0Px = await firstPixel(desatSepiaGif);
    expect(frame0Px[0]).toBeGreaterThan(frame0Px[1]);
    expect(frame0Px[1]).toBeGreaterThan(frame0Px[2]);
    const frame1Raw = await sharp(desatSepiaGif, { page: 1, pages: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(frame1Raw.data[0]).toBeGreaterThanOrEqual(frame1Raw.data[1]);
    expect(frame1Raw.data[1]).toBeGreaterThan(frame1Raw.data[2]);

    const sampleTiff = await sharp(await makeSolidPng(200, 100, 50))
      .tiff({ compression: "lzw" })
      .toBuffer();
    const outTiff = await runAdjustColors(
      sampleTiff,
      { contrast: -100, effect: "sepia" },
      "sample.tiff",
    );
    const tiffMeta = await sharp(outTiff).metadata();
    expect(tiffMeta.format).toBe("tiff");
    expect(tiffMeta.depth).toBe("uchar");
    expect(await firstPixel(outTiff)).toEqual([172, 153, 119]);
  });
});
