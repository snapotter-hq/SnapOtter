import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { brightness } from "../src/operations/brightness.js";
import { colorChannels } from "../src/operations/color-channels.js";
import { compress } from "../src/operations/compress.js";
import { contrast } from "../src/operations/contrast.js";
import { saturation } from "../src/operations/saturation.js";
import type { Sharp } from "../src/types.js";

// Mutation-killing tests for compress / color-channels / brightness / contrast /
// saturation. The existing operations.test.ts only asserts `buf.length > 0`
// (execution, not value), which lets encoder-option, arithmetic, and boundary
// mutants survive. These tests assert concrete effects: byte-size ordering
// across quality levels, exact per-channel raw bytes after recomb/linear, and
// direction + clamp + no-op behavior for the gamma-aware modulate() ops.

/** Deterministic seeded PRNG so noisy-photo bytes (and thus sizes) are stable. */
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/**
 * A fully random RGB image. Random pixels are incompressible, so JPEG/WebP/AVIF
 * quality has a large, monotonic effect on output size (lower quality => fewer
 * bytes), which is exactly what the size-ordering assertions rely on.
 */
async function noisyPhotoPng(width = 400, height = 400, seed = 987654321): Promise<Buffer> {
  const rng = makeRng(seed);
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) {
    raw[i] = Math.floor(rng() * 256);
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

/** Solid-color PNG for exact per-channel math (recomb / linear / modulate). */
async function solidPng(r: number, g: number, b: number, size = 8): Promise<Buffer> {
  return sharp({
    create: { width: size, height: size, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer();
}

/** First pixel's [R, G, B] after decoding a buffer back to raw. */
async function firstPixel(buffer: Buffer): Promise<[number, number, number]> {
  const raw = await sharp(buffer).raw().toBuffer();
  return [raw[0], raw[1], raw[2]];
}

async function outputFormat(buffer: Buffer): Promise<string> {
  const meta = await sharp(buffer).metadata();
  // Sharp reports AVIF as the heif container; normalize for assertions.
  return meta.format === "heif" ? "avif" : (meta.format ?? "");
}

let photoPng: Buffer;

beforeAll(async () => {
  photoPng = await noisyPhotoPng();
});

describe("compress: format selection", () => {
  it("honors an explicit format for every encoder branch", async () => {
    const src = await solidPng(120, 90, 60, 32);
    for (const [format, expected] of [
      ["jpg", "jpeg"],
      ["png", "png"],
      ["webp", "webp"],
      ["avif", "avif"],
    ] as const) {
      const out = await (await compress(sharp(src), { quality: 70, format })).toBuffer();
      expect(await outputFormat(out)).toBe(expected);
    }
  });

  it("defaults to the detected input format when none is given", async () => {
    const pngOut = await (await compress(sharp(photoPng), { quality: 80 })).toBuffer();
    expect(await outputFormat(pngOut)).toBe("png");

    const jpegIn = await sharp(photoPng).jpeg({ quality: 95 }).toBuffer();
    const jpegOut = await (await compress(sharp(jpegIn), { quality: 80 })).toBuffer();
    expect(await outputFormat(jpegOut)).toBe("jpeg");
  });

  it("an explicit format overrides the detected input format", async () => {
    // PNG in, AVIF requested out -> must not fall back to the input's png.
    const out = await (await compress(sharp(photoPng), { quality: 50, format: "avif" })).toBuffer();
    expect(await outputFormat(out)).toBe("avif");
  });

  it("falls back to PNG for inputs Sharp cannot encode (SVG)", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">' +
        '<rect width="40" height="40" fill="rgb(30,60,90)"/></svg>',
    );
    expect((await sharp(svg).metadata()).format).toBe("svg");
    const out = await (await compress(sharp(svg), { quality: 80 })).toBuffer();
    expect(await outputFormat(out)).toBe("png");
  });
});

describe("compress: quality controls output size", () => {
  // Random pixels make the ordering strict and wide, so a mutated quality
  // number, a hardcoded quality, or a swapped-format branch changes the bytes.
  it.each([
    ["jpg", "jpeg"],
    ["webp", "webp"],
    ["avif", "avif"],
  ] as const)("lower quality yields strictly smaller %s output", async (format) => {
    const low = await (await compress(sharp(photoPng), { quality: 20, format })).toBuffer();
    const mid = await (await compress(sharp(photoPng), { quality: 55, format })).toBuffer();
    const high = await (await compress(sharp(photoPng), { quality: 90, format })).toBuffer();
    expect(low.length).toBeLessThan(mid.length);
    expect(mid.length).toBeLessThan(high.length);
  });

  it("uses the default quality (80) when quality is omitted", async () => {
    // Default 80 must sit strictly between q20 and q100 in size: proves the
    // `quality ?? 80` fallback feeds the encoder (not 0/undefined/100).
    const q20 = await (await compress(sharp(photoPng), { quality: 20, format: "jpg" })).toBuffer();
    const q100 = await (
      await compress(sharp(photoPng), { quality: 100, format: "jpg" })
    ).toBuffer();
    const dflt = await (await compress(sharp(photoPng), { format: "jpg" })).toBuffer();
    expect(dflt.length).toBeGreaterThan(q20.length);
    expect(dflt.length).toBeLessThan(q100.length);
  });
});

describe("compress: quality clamp boundaries", () => {
  it("accepts the inclusive edges q=1 and q=100", async () => {
    await expect(compress(sharp(photoPng), { quality: 1, format: "jpg" })).resolves.toBeDefined();
    await expect(compress(sharp(photoPng), { quality: 100, format: "jpg" })).resolves.toBeDefined();
  });

  it("rejects just outside the range: q=0 and q=101", async () => {
    await expect(compress(sharp(photoPng), { quality: 0, format: "jpg" })).rejects.toThrow(
      /between 1 and 100/,
    );
    await expect(compress(sharp(photoPng), { quality: 101, format: "jpg" })).rejects.toThrow(
      /between 1 and 100/,
    );
  });
});

describe("compress: target size", () => {
  it("rejects a non-positive target and accepts the smallest positive target", async () => {
    await expect(compress(sharp(photoPng), { targetSizeBytes: 0, format: "jpg" })).rejects.toThrow(
      /greater than 0/,
    );
    await expect(compress(sharp(photoPng), { targetSizeBytes: -5, format: "jpg" })).rejects.toThrow(
      /greater than 0/,
    );
    // target=1 is > 0, so it must NOT throw (kills a `<= 0` -> `< 0` mutant).
    await expect(
      compress(sharp(photoPng), { targetSizeBytes: 1, format: "jpg" }),
    ).resolves.toBeDefined();
  });

  it("hits a reachable target without downscaling", async () => {
    // Target comfortably above the q=1 full-size floor: the quality search
    // succeeds, dimensions stay full, and the result fits under the target.
    const q1Full = (await sharp(photoPng).toFormat("jpeg", { quality: 1 }).toBuffer()).length;
    const target = q1Full * 3;
    const out = await (
      await compress(sharp(photoPng), { targetSizeBytes: target, format: "jpg" })
    ).toBuffer();
    const meta = await sharp(out).metadata();
    expect(out.length).toBeLessThanOrEqual(target);
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(400);
  });

  it("downscales when even q=1 at full size overshoots the target", async () => {
    // Target below the q=1 full-size floor forces the resize fallback loop.
    const q1Full = (await sharp(photoPng).toFormat("jpeg", { quality: 1 }).toBuffer()).length;
    const target = Math.round(q1Full / 4);
    const out = await (
      await compress(sharp(photoPng), { targetSizeBytes: target, format: "jpg" })
    ).toBuffer();
    const meta = await sharp(out).metadata();
    expect(meta.width).toBeLessThan(400);
    expect(meta.height).toBeLessThan(400);
    // The fallback should still shrink the file well below the original.
    expect(out.length).toBeLessThan(photoPng.length);
  });

  it("a smaller target produces a smaller (or equal) file than a larger target", async () => {
    const q1Full = (await sharp(photoPng).toFormat("jpeg", { quality: 1 }).toBuffer()).length;
    const bigOut = await (
      await compress(sharp(photoPng), { targetSizeBytes: q1Full * 6, format: "jpg" })
    ).toBuffer();
    const smallOut = await (
      await compress(sharp(photoPng), { targetSizeBytes: q1Full * 2, format: "jpg" })
    ).toBuffer();
    expect(smallOut.length).toBeLessThanOrEqual(bigOut.length);
  });
});

describe("colorChannels: exact per-channel recomb", () => {
  // Distinct channel values expose any swapped matrix position or wrong divisor.
  async function distinctInput(): Promise<Sharp> {
    return sharp(await solidPng(10, 20, 30));
  }

  it("scales each channel by value/100 on the diagonal", async () => {
    // red 150 -> x1.5 -> 15, green 100 -> x1.0 -> 20, blue 50 -> x0.5 -> 15.
    const out = await (
      await colorChannels(await distinctInput(), { red: 150, green: 100, blue: 50 })
    ).toBuffer();
    const [r, g, b] = await firstPixel(out);
    expect(r).toBe(15);
    expect(g).toBe(20);
    expect(b).toBe(15);
  });

  it("red=0 zeroes only the red channel", async () => {
    const out = await (
      await colorChannels(await distinctInput(), { red: 0, green: 100, blue: 100 })
    ).toBuffer();
    const [r, g, b] = await firstPixel(out);
    expect(r).toBe(0);
    expect(g).toBe(20);
    expect(b).toBe(30);
  });

  it("green=200 doubles only the green channel", async () => {
    // green 20 -> x2.0 -> 40; red and blue unchanged (kept at x1.0).
    const out = await (
      await colorChannels(await distinctInput(), { red: 100, green: 200, blue: 100 })
    ).toBuffer();
    const [r, g, b] = await firstPixel(out);
    expect(r).toBe(10);
    expect(g).toBe(40);
    expect(b).toBe(30);
  });

  it("red=green=blue=100 is a no-op", async () => {
    const out = await (
      await colorChannels(await distinctInput(), { red: 100, green: 100, blue: 100 })
    ).toBuffer();
    const [r, g, b] = await firstPixel(out);
    expect([r, g, b]).toEqual([10, 20, 30]);
  });

  it("rejects channel values above 200 and below 0", async () => {
    await expect(
      colorChannels(await distinctInput(), { red: 201, green: 100, blue: 100 }),
    ).rejects.toThrow(/Red channel/);
    await expect(
      colorChannels(await distinctInput(), { red: 100, green: -1, blue: 100 }),
    ).rejects.toThrow(/Green channel/);
    await expect(
      colorChannels(await distinctInput(), { red: 100, green: 100, blue: 201 }),
    ).rejects.toThrow(/Blue channel/);
  });

  it("accepts the inclusive edges 0 and 200", async () => {
    await expect(
      colorChannels(await distinctInput(), { red: 0, green: 0, blue: 0 }),
    ).resolves.toBeDefined();
    await expect(
      colorChannels(await distinctInput(), { red: 200, green: 200, blue: 200 }),
    ).resolves.toBeDefined();
  });
});

describe("brightness: direction, clamps, no-op", () => {
  // modulate() is gamma-aware, so exact values aren't naive multiplies; assert
  // direction relative to the source and the exact 0/255 clamp endpoints.
  async function grayInput(level = 100): Promise<Sharp> {
    return sharp(await solidPng(level, level, level));
  }

  it("+50 brightens above the source value", async () => {
    const out = await (await brightness(await grayInput(100), { value: 50 })).toBuffer();
    const [r] = await firstPixel(out);
    expect(r).toBeGreaterThan(100);
  });

  it("-50 darkens below the source value", async () => {
    const out = await (await brightness(await grayInput(100), { value: -50 })).toBuffer();
    const [r] = await firstPixel(out);
    expect(r).toBeLessThan(100);
  });

  it("value=0 is an exact no-op (multiplier 1.0)", async () => {
    const out = await (await brightness(await grayInput(100), { value: 0 })).toBuffer();
    const [r, g, b] = await firstPixel(out);
    expect([r, g, b]).toEqual([100, 100, 100]);
  });

  it("value=-100 drives the image to black (multiplier 0)", async () => {
    const out = await (await brightness(await grayInput(100), { value: -100 })).toBuffer();
    const [r, g, b] = await firstPixel(out);
    expect([r, g, b]).toEqual([0, 0, 0]);
  });

  it("value=+100 doubling clamps a bright input at 255", async () => {
    // 200 * 2.0 = 400 -> clamp to 255. Confirms the +value/100 -> mult 2 mapping.
    const out = await (
      await brightness(sharp(await solidPng(200, 200, 200)), { value: 100 })
    ).toBuffer();
    const [r, g, b] = await firstPixel(out);
    expect([r, g, b]).toEqual([255, 255, 255]);
  });

  it("rejects values outside -100..100 at both edges", async () => {
    await expect(brightness(await grayInput(), { value: 101 })).rejects.toThrow();
    await expect(brightness(await grayInput(), { value: -101 })).rejects.toThrow();
  });

  it("accepts the inclusive edges -100 and 100", async () => {
    await expect(brightness(await grayInput(), { value: -100 })).resolves.toBeDefined();
    await expect(brightness(await grayInput(), { value: 100 })).resolves.toBeDefined();
  });
});

describe("contrast: exact linear transform around 128", () => {
  // contrast() is a deterministic linear(slope, intercept), so assert exact
  // output bytes. slope = 1 + value/100, intercept = 128 * (1 - slope).
  async function twoTone(): Promise<Sharp> {
    // Two pixels: 64 (below mid) and 192 (above mid).
    return sharp(Buffer.from([64, 64, 64, 192, 192, 192]), {
      raw: { width: 2, height: 1, channels: 3 },
    });
  }

  it("value=+100 (slope 2) pushes values away from the midpoint and clamps", async () => {
    // 64 -> 2*64-128 = 0; 192 -> 2*192-128 = 256 -> clamp 255.
    const raw = await (await contrast(await twoTone(), { value: 100 })).raw().toBuffer();
    expect(raw[0]).toBe(0);
    expect(raw[3]).toBe(255);
  });

  it("value=-50 (slope 0.5) pulls values toward the midpoint", async () => {
    // slope 0.5, intercept 128*(1-0.5)=64. 64 -> 96; 192 -> 160.
    const raw = await (await contrast(await twoTone(), { value: -50 })).raw().toBuffer();
    expect(raw[0]).toBe(96);
    expect(raw[3]).toBe(160);
  });

  it("value=0 is an exact no-op (slope 1, intercept 0)", async () => {
    const raw = await (await contrast(await twoTone(), { value: 0 })).raw().toBuffer();
    expect(raw[0]).toBe(64);
    expect(raw[3]).toBe(192);
  });

  it("the midpoint (128) is a fixed point for any slope", async () => {
    // Kills intercept-formula mutants: 128*(1+slope) or a sign flip would move it.
    for (const value of [100, -50, 50, -100]) {
      const mid = sharp(Buffer.from([128, 128, 128]), {
        raw: { width: 1, height: 1, channels: 3 },
      });
      const raw = await (await contrast(mid, { value })).raw().toBuffer();
      expect(raw[0]).toBe(128);
    }
  });

  it("rejects values outside -100..100 at both edges", async () => {
    await expect(contrast(await twoTone(), { value: 101 })).rejects.toThrow();
    await expect(contrast(await twoTone(), { value: -101 })).rejects.toThrow();
  });
});

describe("saturation: desaturation, widening, no-op", () => {
  async function coloredInput(): Promise<Sharp> {
    return sharp(await solidPng(200, 50, 90));
  }

  it("value=-100 fully desaturates (R == G == B)", async () => {
    const out = await (await saturation(await coloredInput(), { value: -100 })).toBuffer();
    const [r, g, b] = await firstPixel(out);
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it("value=0 is an exact no-op (multiplier 1.0)", async () => {
    const before = await coloredInput();
    const original = await before.clone().raw().toBuffer();
    const out = await (await saturation(before, { value: 0 })).toBuffer();
    const after = await sharp(out).raw().toBuffer();
    expect(Buffer.compare(original, after)).toBe(0);
  });

  it("value=+100 widens the channel spread versus the source", async () => {
    const [r0, g0, b0] = await firstPixel(await solidPng(200, 50, 90));
    const sourceSpread = Math.max(r0, g0, b0) - Math.min(r0, g0, b0);
    const out = await (await saturation(await coloredInput(), { value: 100 })).toBuffer();
    const [r, g, b] = await firstPixel(out);
    const outSpread = Math.max(r, g, b) - Math.min(r, g, b);
    expect(outSpread).toBeGreaterThan(sourceSpread);
  });

  it("rejects values outside -100..100 at both edges", async () => {
    await expect(saturation(await coloredInput(), { value: 101 })).rejects.toThrow();
    await expect(saturation(await coloredInput(), { value: -101 })).rejects.toThrow();
  });

  it("accepts the inclusive edges -100 and 100", async () => {
    await expect(saturation(await coloredInput(), { value: -100 })).resolves.toBeDefined();
    await expect(saturation(await coloredInput(), { value: 100 })).resolves.toBeDefined();
  });
});
