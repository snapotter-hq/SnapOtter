import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { sharpenAdvanced } from "../src/operations/sharpen.js";
import type { Sharp, SharpenAdvancedOptions } from "../src/types.js";

// Mutation-killing tests for src/operations/sharpen.ts. Every expected number
// here was captured by running the real sharpenAdvanced through Sharp; nothing
// is hand-derived from the kernel maths (libvips convolve quantises and offsets
// in ways a paper calculation would miss). The oracles:
//
//  - IMPULSE HISTOGRAM: a single bright pixel on a flat gray field, fed through
//    high-pass. The order-independent value histogram of the raw output pins
//    each kernel coefficient. Any sign/scale change to a `-s`, `s * 2`,
//    `1 + s * 8`, or `1 + 4 * s` term shifts a specific histogram bucket. The
//    histogram (not pixel positions) is used because libvips convolve offsets
//    the response spatially; the multiset of values is stable, the layout is not.
//  - EDGE OVERSHOOT: a hard step edge. Sharpening rings it below lo / above hi.
//    min/max is the oracle for the adaptive gain/halo params.
//  - PATCH VARIANCE: a noisy uniform patch. The median denoise pre-pass lowers
//    variance; a bigger kernel lowers it more.
//  - STAIRCASE / RAMP: gentle gradients where the x1 flat/jagged threshold and
//    the m1 flat-area gain actually bite (they do nothing on a hard edge).

// --- oracles ---------------------------------------------------------------

function histogram(out: Buffer): Array<[number, number]> {
  const counts = new Map<number, number>();
  for (const v of out) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0] - b[0]);
}

// Impulse-on-gray field pushed through a high-pass kernel; returns the raw
// output value histogram. bg is the flat background, imp the single hot pixel.
async function highPassImpulseHist(
  strength: number,
  kernelSize: 3 | 5,
  bg: number,
  imp: number,
  width: number,
  height: number,
): Promise<Array<[number, number]>> {
  const buf = Buffer.alloc(width * height, bg);
  buf[Math.floor(height / 2) * width + Math.floor(width / 2)] = imp;
  const img = sharp(buf, { raw: { width, height, channels: 1 } });
  const result = await sharpenAdvanced(img, { method: "high-pass", strength, kernelSize });
  return histogram(await result.raw().toBuffer());
}

// Vertical mid-gray step edge (left = lo, right = hi). Sharpening overshoots
// the step; min/max carry the sign and magnitude of the sharpening.
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
  const out = await (await apply(img)).raw().toBuffer();
  let min = 255;
  let max = 0;
  for (const v of out) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

// Variance of a noisy uniform patch. Deterministic LCG keeps the fixture stable.
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

// A staircase of steps whose heights grow left to right, so different x1
// flat/jagged thresholds gate different steps. Used to make x1 observable.
function staircaseBuffer(width: number, height: number): Buffer {
  const heights = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
  const buf = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const seg = Math.floor(x / 8);
      const level = 100 + (heights[seg % heights.length] ?? 0) * (x % 8 < 4 ? 0 : 1);
      buf[y * width + x] = Math.min(255, level);
    }
  }
  return buf;
}

// A low-slope linear ramp: small local differences read as "flat", so the
// flat-area gain m1 and its threshold x1 dominate.
function gentleRampBuffer(width: number, height: number, lo: number, hi: number): Buffer {
  const buf = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      buf[y * width + x] = Math.round(lo + (hi - lo) * (x / (width - 1)));
    }
  }
  return buf;
}

async function adaptiveStats(
  opts: Omit<SharpenAdvancedOptions, "method">,
  buf: Buffer,
  width: number,
  height: number,
): Promise<{ min: number; max: number }> {
  const img = sharp(buf, { raw: { width, height, channels: 1 } });
  const out = await (await sharpenAdvanced(img, { method: "adaptive", ...opts })).raw().toBuffer();
  let min = 255;
  let max = 0;
  for (const v of out) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

// --- L78-L106: convolution kernel coefficients (impulse response) ----------

describe("sharpenAdvanced high-pass: 3x3 kernel coefficients (impulse response)", () => {
  it("pins every 3x3 coefficient via the impulse histogram", async () => {
    // strength 50 -> s = 0.5, kernel [0,-0.5,0, -0.5,3,-0.5, 0,-0.5,0].
    // On a 9x9 field of 100 with one 140 pixel, the raw output histogram is
    // exactly this. The center weight (1 + 4*0.5 = 3) produces the 220 bucket;
    // the four edge weights (-0.5) produce the 80 bucket; untouched background
    // stays 100. Flip a `-s` sign, drop the `1 +`, or swap `4 * s` and the
    // 80 / 220 buckets move.
    const hist = await highPassImpulseHist(50, 3, 100, 140, 9, 9);
    expect(hist).toEqual([
      [80, 12],
      [100, 228],
      [220, 3],
    ]);
  });

  it("moves the coefficient buckets when strength (s) changes", async () => {
    // strength 20 -> s = 0.2. Center 1 + 0.8 = 1.8, edges -0.2. Different
    // buckets from strength 50: proves the kernel is a function of s, so a
    // constant-folded coefficient can't reproduce both.
    const hist = await highPassImpulseHist(20, 3, 100, 140, 9, 9);
    expect(hist).toEqual([
      [92, 12],
      [100, 228],
      [172, 3],
    ]);
  });
});

describe("sharpenAdvanced high-pass: 5x5 kernel coefficients (impulse response)", () => {
  it("pins every 5x5 coefficient via the impulse histogram", async () => {
    // strength 25 -> s = 0.25. Kernel has coefficients 0, -s (=-0.25),
    // s (=0.25), s*2 (=0.5), and center 1 + s*8 (=3). On an 11x11 field of 120
    // with one 160 pixel the histogram lands on distinct, non-clamped buckets:
    // the -s ring (116), the s ring (123), the s*2 ring (126), the center (160),
    // background (120). A mutation to any of `-s`, `s * 2`, or `1 + s * 8`
    // relocates its bucket.
    const hist = await highPassImpulseHist(25, 5, 120, 160, 11, 11);
    expect(hist).toEqual([
      [116, 36],
      [120, 300],
      [123, 12],
      [126, 12],
      [160, 3],
    ]);
  });
});

// --- L75: kernelSize === 5 branch selection --------------------------------

describe("sharpenAdvanced high-pass: L75 kernelSize === 5 branch", () => {
  it("selects a genuinely different kernel for size 5 vs size 3", async () => {
    // Same strength, different kernel size: the 5x5 spreads wider and rings the
    // edge differently. Exact overshoot is pinned so the === 5 branch can't be
    // made unconditional without breaking one of these.
    const k3 = await edgeStats((img) =>
      sharpenAdvanced(img, { method: "high-pass", strength: 80, kernelSize: 3 }),
    );
    const k5 = await edgeStats((img) =>
      sharpenAdvanced(img, { method: "high-pass", strength: 80, kernelSize: 5 }),
    );
    expect(k3).toEqual({ min: 52, max: 208 });
    expect(k5).toEqual({ min: 80, max: 179 });
  });
});

// --- L31 / L33: denoise pre-pass -------------------------------------------

describe("sharpenAdvanced: L31/L33 denoise pre-pass", () => {
  const identityHighPass = (denoise?: SharpenAdvancedOptions["denoise"]) => (img: Sharp) =>
    sharpenAdvanced(img, { method: "high-pass", strength: 0, denoise });

  it("denoise 'off' is a no-op: variance stays equal to the raw patch", async () => {
    // strength 0 high-pass is an identity convolution, so any variance change is
    // purely the median pass. 'off' must not run it. Kills the force-true
    // mutation of `if (denoise && denoise !== "off")`.
    const off = await patchVariance(identityHighPass("off"));
    const raw = await patchVariance((img) => img);
    expect(off).toBeCloseTo(raw, 5);
  });

  it("omitting denoise is a no-op (undefined short-circuits the &&)", async () => {
    const omitted = await patchVariance(identityHighPass(undefined));
    const raw = await patchVariance((img) => img);
    expect(omitted).toBeCloseTo(raw, 5);
  });

  it("denoise 'light' actually runs the median (variance drops)", async () => {
    // Kills the force-false mutation of the L31 condition and the removal of the
    // L34 median call: with them, 'light' would leave the noise intact.
    const light = await patchVariance(identityHighPass("light"));
    const raw = await patchVariance((img) => img);
    expect(light).toBeLessThan(raw * 0.6);
    expect(light).toBeCloseTo(153.67, 0);
  });

  it("bigger denoise kernels smooth strictly more (light > medium > strong)", async () => {
    // Pins the L32 DENOISE_KERNEL lookup ordering (3 < 5 < 7). A swapped or
    // constant kernel size breaks the monotonic variance drop.
    const light = await patchVariance(identityHighPass("light"));
    const medium = await patchVariance(identityHighPass("medium"));
    const strong = await patchVariance(identityHighPass("strong"));
    expect(medium).toBeLessThan(light);
    expect(strong).toBeLessThan(medium);
  });
});

// --- L52-56: adaptive `??` defaults ----------------------------------------
//
// Each `options.p ?? DEFAULT` is mutated to `options.p && DEFAULT`. When p is
// provided and truthy, `??` keeps p but `&&` returns DEFAULT. So passing an
// explicit truthy value whose output differs from the default's output kills the
// mutant: the `&&` variant would fall back to the default and miss the assertion.
// Paired "omitted == default" checks pin the default value itself.

describe("sharpenAdvanced adaptive: L52 m1 default", () => {
  const width = 96;
  const height = 12;
  const ramp = gentleRampBuffer(width, height, 90, 150);
  // m2 = 0 so only the flat-area gain m1 acts on the gentle ramp.
  const base = { sigma: 3, m2: 0, x1: 2, y2: 30, y3: 30 } as const;

  it("applies m1 = 1.0 by default", async () => {
    expect(await adaptiveStats(base, ramp, width, height)).toEqual({ min: 89, max: 151 });
  });

  it("honors an explicit m1 (10) instead of the default", async () => {
    // `10 && 1.0` = 1.0 would give {89,151}; the real `10 ?? 1.0` = 10 rings harder.
    expect(await adaptiveStats({ ...base, m1: 10 }, ramp, width, height)).toEqual({
      min: 83,
      max: 158,
    });
  });
});

describe("sharpenAdvanced adaptive: L53 m2 default", () => {
  const width = 96;
  const height = 12;
  const ramp = gentleRampBuffer(width, height, 90, 150);
  // m1 = 0, x1 = 0 so the textured gain m2 acts across the ramp.
  const base = { sigma: 3, m1: 0, x1: 0, y2: 30, y3: 30 } as const;

  it("applies m2 = 3.0 by default", async () => {
    expect(await adaptiveStats(base, ramp, width, height)).toEqual({ min: 87, max: 152 });
  });

  it("honors an explicit m2 (10) instead of the default", async () => {
    // `10 && 3.0` = 3.0 would give {87,152}; `10 ?? 3.0` = 10 pushes further.
    expect(await adaptiveStats({ ...base, m2: 10 }, ramp, width, height)).toEqual({
      min: 83,
      max: 158,
    });
  });
});

describe("sharpenAdvanced adaptive: L54 x1 default", () => {
  const width = 80;
  const height = 12;
  const staircase = staircaseBuffer(width, height);
  const base = { sigma: 2, m1: 0, m2: 12, y2: 40, y3: 40 } as const;

  it("applies x1 = 2.0 by default", async () => {
    expect(await adaptiveStats(base, staircase, width, height)).toEqual({ min: 60, max: 158 });
  });

  it("honors an explicit x1 (4) instead of the default", async () => {
    // `4 && 2.0` = 2.0 would give {60,158}; `4 ?? 2.0` = 4 raises the flat/jagged
    // threshold so most steps stop sharpening: {100,120}.
    expect(await adaptiveStats({ ...base, x1: 4 }, staircase, width, height)).toEqual({
      min: 100,
      max: 120,
    });
  });
});

describe("sharpenAdvanced adaptive: L55 y2 default (max brightening halo)", () => {
  // Hard edge; strong gains so the overshoot pushes into the halo clamp.
  const base = { sigma: 2, m1: 2, m2: 6, x1: 1, y3: 20 } as const;

  it("applies y2 = 12 by default", async () => {
    const stats = await edgeStats((img) => sharpenAdvanced(img, { method: "adaptive", ...base }));
    expect(stats).toEqual({ min: 54, max: 192 });
  });

  it("honors an explicit y2 (3) that clamps the bright overshoot lower", async () => {
    // `3 && 12` = 12 would leave max 192; `3 ?? 12` = 3 caps brightening at 168.
    const stats = await edgeStats((img) =>
      sharpenAdvanced(img, { method: "adaptive", ...base, y2: 3 }),
    );
    expect(stats).toEqual({ min: 54, max: 168 });
  });
});

describe("sharpenAdvanced adaptive: L56 y3 default (max darkening halo)", () => {
  const base = { sigma: 2, m1: 2, m2: 6, x1: 1, y2: 12 } as const;

  it("applies y3 = 20 by default", async () => {
    const stats = await edgeStats((img) => sharpenAdvanced(img, { method: "adaptive", ...base }));
    expect(stats).toEqual({ min: 54, max: 192 });
  });

  it("honors an explicit y3 (3) that clamps the dark undershoot higher", async () => {
    // `3 && 20` = 20 would leave min 54; `3 ?? 20` = 3 caps darkening at 93.
    const stats = await edgeStats((img) =>
      sharpenAdvanced(img, { method: "adaptive", ...base, y3: 3 }),
    );
    expect(stats).toEqual({ min: 93, max: 192 });
  });
});
