import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { optimizeForWeb } from "../src/operations/optimize-for-web.js";
import { sharpen, sharpenAdvanced } from "../src/operations/sharpen.js";
import type { Sharp } from "../src/types.js";

// A vertical mid-gray step edge (left = lo, right = hi). Sharpening rings the
// step, pushing pixels near the boundary BELOW lo and ABOVE hi. That overshoot
// is the oracle: its presence and magnitude scale with sharpening strength, so
// asserting on min/max kills the sign and magnitude mutants in the sigma / m1 /
// m2 / kernel math. Grayscale single-channel keeps the stats clean.
async function edgeStats(
  apply: (img: Sharp) => Sharp | Promise<Sharp>,
  lo = 100,
  hi = 160,
  width = 60,
  height = 8,
): Promise<{ min: number; max: number }> {
  const buf = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      buf[y * width + x] = x < width / 2 ? lo : hi;
    }
  }
  const img = sharp(buf, { raw: { width, height, channels: 1 } });
  const result = await apply(img);
  const out = await result.raw().toBuffer();
  let min = 255;
  let max = 0;
  for (const v of out) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

// Variance of a noisy uniform patch. Median denoise lowers it; a bigger kernel
// lowers it more. Deterministic LCG so the fixture is stable across runs.
async function patchVariance(apply: (img: Sharp) => Sharp | Promise<Sharp>): Promise<number> {
  const width = 32;
  const height = 32;
  const buf = Buffer.alloc(width * height);
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < width * height; i++) {
    buf[i] = Math.round(120 + (rand() - 0.5) * 80);
  }
  const img = sharp(buf, { raw: { width, height, channels: 1 } });
  const out = await (await apply(img)).raw().toBuffer();
  let sum = 0;
  let sumSq = 0;
  for (const v of out) {
    sum += v;
    sumSq += v * v;
  }
  const n = out.length;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

function solidPng(
  width: number,
  height: number,
  channels: 3 | 4 = 3,
  background: { r: number; g: number; b: number; alpha?: number } = { r: 120, g: 130, b: 140 },
): Promise<Buffer> {
  return sharp({ create: { width, height, channels, background } }).png().toBuffer();
}

describe("sharpen (basic)", () => {
  it("leaves the edge untouched when value is 0 (<= 0 no-op branch)", async () => {
    const { min, max } = await edgeStats((img) => sharpen(img, { value: 0 }));
    // No sharpen applied: the step stays exactly [lo, hi], no overshoot.
    expect(min).toBe(100);
    expect(max).toBe(160);
  });

  it("leaves the edge untouched for negative values (boundary below 0)", async () => {
    const { min, max } = await edgeStats((img) => sharpen(img, { value: -5 }));
    expect(min).toBe(100);
    expect(max).toBe(160);
  });

  it("overshoots the edge for the smallest positive value (value = 1)", async () => {
    // value=1 -> sigma 0.595. Must actually sharpen: min drops below lo,
    // max rises above hi. Kills the "sigma always 0" / dropped-term mutants.
    const { min, max } = await edgeStats((img) => sharpen(img, { value: 1 }));
    expect(min).toBeLessThan(100);
    expect(max).toBeGreaterThan(160);
    // Bounded overshoot at this low sigma: observed min 86, max 175. If the
    // mapping lost its "+ 0.5" base or flipped sign the magnitude would differ.
    expect(min).toBeGreaterThanOrEqual(80);
    expect(min).toBeLessThanOrEqual(95);
    expect(max).toBeGreaterThanOrEqual(170);
    expect(max).toBeLessThanOrEqual(180);
  });

  it("produces strictly more overshoot at value=25 than at value=1 (monotonic sigma)", async () => {
    const low = await edgeStats((img) => sharpen(img, { value: 1 }));
    const high = await edgeStats((img) => sharpen(img, { value: 25 }));
    // Higher strength => lower undershoot and higher overshoot.
    expect(high.min).toBeLessThan(low.min);
    expect(high.max).toBeGreaterThan(low.max);
  });

  it("maps value=100 to the maximum sigma (10) with full overshoot", async () => {
    const { min, max } = await edgeStats((img) => sharpen(img, { value: 100 }));
    // sigma 10: strongest ringing. Observed min 54, max 187.
    expect(min).toBeLessThanOrEqual(60);
    expect(max).toBeGreaterThanOrEqual(185);
  });

  it("throws when value exceeds 100 (upper clamp boundary)", async () => {
    const png = await solidPng(16, 16);
    await expect(sharpen(sharp(png), { value: 101 })).rejects.toThrow(
      "Sharpness value must be between 0 and 100",
    );
  });

  it("does not throw at the inclusive upper boundary (value = 100)", async () => {
    const png = await solidPng(16, 16);
    await expect(sharpen(sharp(png), { value: 100 })).resolves.toBeDefined();
  });

  it("preserves dimensions and format", async () => {
    const png = await solidPng(32, 24);
    const result = await sharpen(sharp(png), { value: 50 });
    const meta = await sharp(await result.png().toBuffer()).metadata();
    expect(meta.width).toBe(32);
    expect(meta.height).toBe(24);
    expect(meta.format).toBe("png");
  });
});

describe("sharpenAdvanced (dispatch + denoise)", () => {
  it("throws on an unknown method", async () => {
    const buf = Buffer.alloc(64);
    const img = sharp(buf, { raw: { width: 8, height: 8, channels: 1 } });
    await expect(
      sharpenAdvanced(img, { method: "bogus" as unknown as "adaptive" }),
    ).rejects.toThrow("Unknown sharpening method: bogus");
  });

  it("denoise 'off' skips the median pre-pass (variance unchanged vs raw)", async () => {
    // high-pass strength 0 is an identity convolution, so any variance drop is
    // purely the median pass. 'off' must leave the noise intact.
    const off = await patchVariance((img) =>
      sharpenAdvanced(img, { method: "high-pass", strength: 0, denoise: "off" }),
    );
    const raw = await patchVariance((img) => img);
    expect(off).toBeCloseTo(raw, 1);
  });

  it("denoise strength increases with kernel size: off > light > strong", async () => {
    const off = await patchVariance((img) =>
      sharpenAdvanced(img, { method: "high-pass", strength: 0, denoise: "off" }),
    );
    const light = await patchVariance((img) =>
      sharpenAdvanced(img, { method: "high-pass", strength: 0, denoise: "light" }),
    );
    const medium = await patchVariance((img) =>
      sharpenAdvanced(img, { method: "high-pass", strength: 0, denoise: "medium" }),
    );
    const strong = await patchVariance((img) =>
      sharpenAdvanced(img, { method: "high-pass", strength: 0, denoise: "strong" }),
    );
    // Median kernel 3 (light) < 5 (medium) < 7 (strong) => monotonically
    // smoother. Kills the DENOISE_KERNEL value mutants and branch swaps.
    expect(light).toBeLessThan(off);
    expect(medium).toBeLessThan(light);
    expect(strong).toBeLessThan(medium);
  });
});

describe("sharpenAdvanced: adaptive", () => {
  it("sharpens with the default params (overshoots the edge)", async () => {
    const base = await edgeStats((img) => img);
    const adaptive = await edgeStats((img) => sharpenAdvanced(img, { method: "adaptive" }));
    expect(adaptive.min).toBeLessThan(base.min);
    expect(adaptive.max).toBeGreaterThan(base.max);
  });

  it("does nothing when m1 and m2 are 0 (flat/textured gains disabled)", async () => {
    // With no flat-area and no textured-area gain, the adaptive sharpen is a
    // no-op: the step stays exactly [100, 160]. Kills the m1/m2 default mutants.
    const { min, max } = await edgeStats((img) =>
      sharpenAdvanced(img, { method: "adaptive", sigma: 2, m1: 0, m2: 0 }),
    );
    expect(min).toBe(100);
    expect(max).toBe(160);
  });

  it("stronger m1/m2 gains produce more overshoot than the disabled case", async () => {
    const off = await edgeStats((img) =>
      sharpenAdvanced(img, { method: "adaptive", sigma: 2, m1: 0, m2: 0 }),
    );
    const on = await edgeStats((img) =>
      sharpenAdvanced(img, { method: "adaptive", sigma: 2, m1: 5, m2: 5 }),
    );
    expect(on.min).toBeLessThan(off.min);
    expect(on.max).toBeGreaterThan(off.max);
  });
});

describe("sharpenAdvanced: unsharp-mask", () => {
  it("sharpens with default amount (overshoots the edge)", async () => {
    const base = await edgeStats((img) => img);
    const um = await edgeStats((img) => sharpenAdvanced(img, { method: "unsharp-mask" }));
    expect(um.min).toBeLessThan(base.min);
    expect(um.max).toBeGreaterThan(base.max);
  });

  it("higher amount yields more overshoot (intensity = amount / 100)", async () => {
    const low = await edgeStats((img) =>
      sharpenAdvanced(img, { method: "unsharp-mask", amount: 100, radius: 2 }),
    );
    const high = await edgeStats((img) =>
      sharpenAdvanced(img, { method: "unsharp-mask", amount: 300, radius: 2 }),
    );
    // amount 300 -> intensity 3.0 vs 1.0: markedly stronger ringing.
    expect(high.min).toBeLessThan(low.min);
    expect(high.max).toBeGreaterThan(low.max);
  });
});

describe("sharpenAdvanced: high-pass", () => {
  it("the 3x3 and 5x5 kernels give different results (kernelSize === 5 branch)", async () => {
    const k3 = await edgeStats((img) =>
      sharpenAdvanced(img, { method: "high-pass", strength: 80, kernelSize: 3 }),
    );
    const k5 = await edgeStats((img) =>
      sharpenAdvanced(img, { method: "high-pass", strength: 80, kernelSize: 5 }),
    );
    // Observed: 3x3 rings harder (52/208) than 5x5 (80/179) on this edge.
    // The point is they diverge, so the === 5 branch selection is real.
    expect(k3.min).not.toBe(k5.min);
    expect(k3.max).not.toBe(k5.max);
  });

  it("defaults to the 3x3 kernel when kernelSize is omitted", async () => {
    const explicit3 = await edgeStats((img) =>
      sharpenAdvanced(img, { method: "high-pass", strength: 80, kernelSize: 3 }),
    );
    const defaulted = await edgeStats((img) =>
      sharpenAdvanced(img, { method: "high-pass", strength: 80 }),
    );
    expect(defaulted.min).toBe(explicit3.min);
    expect(defaulted.max).toBe(explicit3.max);
  });

  it("stronger strength sharpens more (s = strength / 100)", async () => {
    const lo = await edgeStats((img) =>
      sharpenAdvanced(img, { method: "high-pass", strength: 20, kernelSize: 3 }),
    );
    const hi = await edgeStats((img) =>
      sharpenAdvanced(img, { method: "high-pass", strength: 100, kernelSize: 3 }),
    );
    expect(hi.min).toBeLessThan(lo.min);
    expect(hi.max).toBeGreaterThan(lo.max);
  });

  it("strength 0 is an identity convolution (edge unchanged)", async () => {
    // Center weight 1 + 4*0 = 1, neighbours 0 => output equals input.
    const { min, max } = await edgeStats((img) =>
      sharpenAdvanced(img, { method: "high-pass", strength: 0, kernelSize: 3 }),
    );
    expect(min).toBe(100);
    expect(max).toBe(160);
  });
});

describe("optimizeForWeb: format selection", () => {
  it("encodes webp when format is 'webp'", async () => {
    const png = await solidPng(40, 40);
    const out = await (
      await optimizeForWeb(sharp(png), { format: "webp", quality: 80 })
    ).toBuffer();
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("webp");
  });

  it("encodes progressive mozjpeg when format is 'jpeg'", async () => {
    const png = await solidPng(40, 40);
    const out = await (
      await optimizeForWeb(sharp(png), { format: "jpeg", quality: 70, progressive: true })
    ).toBuffer();
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    // progressive: true flows into jpeg({ progressive }); mozjpeg encodes it.
    expect(meta.isProgressive).toBe(true);
  });

  it("encodes avif when format is 'avif'", async () => {
    const png = await solidPng(40, 40);
    const out = await (
      await optimizeForWeb(sharp(png), { format: "avif", quality: 40 })
    ).toBuffer();
    const meta = await sharp(out).metadata();
    // Sharp reports AVIF containers as "heif".
    const format = meta.format === "heif" ? "avif" : meta.format;
    expect(format).toBe("avif");
  });

  it("encodes a palette png that preserves alpha when format is 'png'", async () => {
    const alpha = await solidPng(24, 24, 4, { r: 255, g: 0, b: 0, alpha: 0.5 });
    const out = await (
      await optimizeForWeb(sharp(alpha), { format: "png", quality: 80 })
    ).toBuffer();
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("png");
    // png({ palette: true }) is set, and alpha survives the round-trip.
    expect(meta.isPalette).toBe(true);
    expect(meta.hasAlpha).toBe(true);
  });

  it("throws on an unsupported format", async () => {
    const png = await solidPng(16, 16);
    await expect(
      optimizeForWeb(sharp(png), {
        format: "tiff" as unknown as "webp",
        quality: 70,
      }),
    ).rejects.toThrow("Unsupported format: tiff");
  });
});

describe("optimizeForWeb: resize cap", () => {
  it("resizes an over-cap image down to fit inside maxWidth (exact dimensions)", async () => {
    // 200x100, maxWidth 100 => scaled to 100x50 (fit: inside, aspect kept).
    const big = await solidPng(200, 100, 3, { r: 80, g: 120, b: 160 });
    const out = await (
      await optimizeForWeb(sharp(big), { format: "jpeg", quality: 70, maxWidth: 100 })
    ).toBuffer();
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(50);
  });

  it("caps on height when maxHeight is the binding dimension", async () => {
    // 100x200, maxHeight 100 => 50x100.
    const tall = await solidPng(100, 200, 3, { r: 80, g: 120, b: 160 });
    const out = await (
      await optimizeForWeb(sharp(tall), { format: "webp", quality: 80, maxHeight: 100 })
    ).toBuffer();
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(50);
    expect(meta.height).toBe(100);
  });

  it("does NOT upscale an under-cap image (withoutEnlargement)", async () => {
    // 80x40, maxWidth 100 => untouched 80x40, never enlarged to the cap.
    const small = await solidPng(80, 40, 3, { r: 80, g: 120, b: 160 });
    const out = await (
      await optimizeForWeb(sharp(small), { format: "webp", quality: 80, maxWidth: 100 })
    ).toBuffer();
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(80);
    expect(meta.height).toBe(40);
  });

  it("leaves dimensions untouched when no max is set", async () => {
    const img = await solidPng(150, 90, 3, { r: 80, g: 120, b: 160 });
    const out = await (
      await optimizeForWeb(sharp(img), { format: "webp", quality: 80 })
    ).toBuffer();
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(150);
    expect(meta.height).toBe(90);
  });

  it("does not resize when the image exactly equals the cap (boundary)", async () => {
    // 100 wide, maxWidth 100: fit inside with withoutEnlargement is a no-op.
    const exact = await solidPng(100, 60, 3, { r: 80, g: 120, b: 160 });
    const out = await (
      await optimizeForWeb(sharp(exact), { format: "webp", quality: 80, maxWidth: 100 })
    ).toBuffer();
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(60);
  });
});

describe("optimizeForWeb: metadata handling", () => {
  it("strips metadata by default (no ICC profile carried through)", async () => {
    const withProfile = await sharp({
      create: { width: 30, height: 30, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .withMetadata({ icc: "srgb" })
      .png()
      .toBuffer();
    const out = await (
      await optimizeForWeb(sharp(withProfile), { format: "jpeg", quality: 70 })
    ).toBuffer();
    const meta = await sharp(out).metadata();
    expect(meta.hasProfile).toBe(false);
  });

  it("keeps the ICC profile when stripMetadata is false", async () => {
    const withProfile = await sharp({
      create: { width: 30, height: 30, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .withMetadata({ icc: "srgb" })
      .png()
      .toBuffer();
    const out = await (
      await optimizeForWeb(sharp(withProfile), {
        format: "jpeg",
        quality: 70,
        stripMetadata: false,
      })
    ).toBuffer();
    const meta = await sharp(out).metadata();
    expect(meta.hasProfile).toBe(true);
  });
});
