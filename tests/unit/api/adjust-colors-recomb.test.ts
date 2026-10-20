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
});
