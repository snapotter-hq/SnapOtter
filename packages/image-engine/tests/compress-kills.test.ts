import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { compress } from "../src/operations/compress.js";

// Targeted mutation-killing tests for src/operations/compress.ts.
//
// The target-size path runs a binary search over JPEG quality and, when the
// quality-1 floor still overshoots, a downscale loop. Every expected byte size
// and dimension below was measured against the real Sharp encoder (deterministic
// for these fixed inputs) rather than guessed: a mutation that shifts the
// converged quality by even one step changes the exact output size, and a
// mutation to the downscale loop changes the exact output dimensions. Asserting
// those exact values is what distinguishes correct code from each mutant.

// Deterministic LCG so the pixel content (and therefore every compressed size)
// is stable across runs and machines.
function seededPhoto(
  width: number,
  height: number,
  seed: number,
  freqX: number,
  freqY: number,
  noise: number,
): Promise<Buffer> {
  const channels = 3;
  const data = Buffer.alloc(width * height * channels);
  let state = seed;
  const rnd = (): number => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  const clamp = (v: number): number => Math.max(0, Math.min(255, v));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const base = Math.sin(x / freqX) * 60 + Math.cos(y / freqY) * 60 + 128;
      data[idx] = clamp(base + (rnd() - 0.5) * noise);
      data[idx + 1] = clamp(base * 0.8 + (rnd() - 0.5) * noise);
      data[idx + 2] = clamp(base * 0.6 + (rnd() - 0.5) * noise);
    }
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

async function outputInfo(
  result: sharp.Sharp,
): Promise<{ size: number; width: number; height: number }> {
  const buf = await result.toBuffer();
  const meta = await sharp(buf).metadata();
  return { size: buf.length, width: meta.width ?? 0, height: meta.height ?? 0 };
}

// 500x500 photo-like fixture: JPEG quality meaningfully changes its compressed
// size across the whole 1..100 range, so the binary search actually converges.
// Measured reference points (deterministic):
//   full-dim JPEG size:  q1=2709, q49=44941, q50=45470, q51=45976, q69=69425, q100=295415
let photo500: Buffer;

beforeAll(async () => {
  photo500 = await seededPhoto(500, 500, 123456789, 12, 9, 90);
});

describe("compress quality guard (L45)", () => {
  // `if (q < 1 || q > 100)` has two operands, each with its own `-> false` mutant.
  // quality=101 trips ONLY the upper bound, so the `q > 100 -> false` mutant stops
  // throwing while correct throws. quality=0 trips ONLY the lower bound, so the
  // `q < 1 -> false` mutant stops throwing. Both breaches are needed to kill both.
  it("throws for quality just above the max (101)", async () => {
    await expect(compress(sharp(photo500), { quality: 101, format: "jpg" })).rejects.toThrow(
      "Quality must be between 1 and 100",
    );
  });

  it("throws for quality just below the min (0)", async () => {
    await expect(compress(sharp(photo500), { quality: 0, format: "jpg" })).rejects.toThrow(
      "Quality must be between 1 and 100",
    );
  });

  it("accepts the max boundary quality (100) without throwing", async () => {
    const result = await compress(sharp(photo500), { quality: 100, format: "jpg" });
    const info = await outputInfo(result);
    expect(info.width).toBe(500);
    expect(info.height).toBe(500);
  });

  it("accepts the min boundary quality (1) without throwing", async () => {
    const result = await compress(sharp(photo500), { quality: 1, format: "jpg" });
    const info = await outputInfo(result);
    expect(info.width).toBe(500);
    expect(info.height).toBe(500);
  });
});

describe("compress target-size binary search (L64, L65, L71, L74, L76)", () => {
  // The q=50 encode is exactly 45470 bytes. With `resultSize <= targetBytes`
  // (correct) a target of 45470 accepts q=50; the L71 `<= -> <` mutant rejects
  // it (size not strictly < target) and settles for q=49 (44941). The L74
  // `low = mid + 1 -> mid - 1` mutant also fails to hold q=50. Only exact-size
  // assertion (not `<= target`) separates them.
  it("lands exactly on the quality whose size equals the target (kills L71 + L74)", async () => {
    const target = 45470;
    const result = await compress(sharp(photo500), { targetSizeBytes: target, format: "jpg" });
    const info = await outputInfo(result);
    expect(info.size).toBe(45470);
    expect(info.size).toBeLessThanOrEqual(target);
    expect(info.width).toBe(500);
    expect(info.height).toBe(500);
  });

  // Multi-iteration converge where the answer sits at q=49 (44941). The L64 loop
  // bound `low <= high -> low < high` and the L76 `high = mid - 1 -> mid + 1`
  // mutant both diverge to a different final quality/size here.
  it("converges over several iterations to the exact best quality (kills L64 bound + L76)", async () => {
    const target = 45000;
    const result = await compress(sharp(photo500), { targetSizeBytes: target, format: "jpg" });
    const info = await outputInfo(result);
    expect(info.size).toBe(44941);
    expect(info.size).toBeLessThanOrEqual(target);
    expect(info.width).toBe(500);
    expect(info.height).toBe(500);
  });

  // Low-quality region: correct converges to q=11 (9220). The L76 `high = mid - 1
  // -> mid + 1` mutation (search moves the wrong way when overshooting) lands q=9,
  // a different exact size. The L65 `(low+high)/2 -> (low-high)/2` midpoint mutant
  // collapses every probe to q=1 and can never reach 9220.
  it("drives the search downward to a low quality and stays full-dimension (kills L65 + L76)", async () => {
    const target = 10000;
    const result = await compress(sharp(photo500), { targetSizeBytes: target, format: "jpg" });
    const info = await outputInfo(result);
    expect(info.size).toBe(9220);
    expect(info.size).toBeLessThanOrEqual(target);
    expect(info.width).toBe(500);
    expect(info.height).toBe(500);
  });

  // Mid-range target the search reaches at full dimensions (q=32, 29271). A broken
  // midpoint or update rule diverges from this exact size.
  it("resolves a mid-range target to its exact converged size (kills L65 midpoint)", async () => {
    const target = 30000;
    const result = await compress(sharp(photo500), { targetSizeBytes: target, format: "jpg" });
    const info = await outputInfo(result);
    expect(info.size).toBe(29271);
    expect(info.size).toBeLessThanOrEqual(target);
    expect(info.width).toBe(500);
    expect(info.height).toBe(500);
  });

  // Target sits one byte above the quality-1 floor (floor is 2709). Correct code
  // finds q=2 at full dimensions and never scales. The L76 `high = mid - 1 ->
  // mid + 1` mutant fails to find ANY full-dim quality here, which forces it into
  // the downscale path and shrinks the output below 500x500. Asserting full
  // dimensions therefore also guards the "search converged, not scaled" boundary.
  it("hits the near-floor target at full dimensions without scaling (kills L76 direction)", async () => {
    const target = 2800;
    const result = await compress(sharp(photo500), { targetSizeBytes: target, format: "jpg" });
    const info = await outputInfo(result);
    expect(info.size).toBe(2709);
    expect(info.size).toBeLessThanOrEqual(target);
    expect(info.width).toBe(500);
    expect(info.height).toBe(500);
  });
});

describe("compress tolerance early-break (L73)", () => {
  // Target 70000 is reachable within the 1% tolerance at q=69 (69425), so correct
  // code takes the `(target - size)/target <= tolerance` break at the optimum.
  // The L73 Conditional (`-> true`, break on the first accepted probe) and the
  // Equality flip (`<= -> >=`) both bail out early at q=51 (45976), wasting ~35%
  // of the byte budget. Asserting the exact converged size distinguishes them.
  it("breaks at the in-tolerance optimum rather than the first accepted probe (kills L73)", async () => {
    const target = 70000;
    const result = await compress(sharp(photo500), { targetSizeBytes: target, format: "jpg" });
    const info = await outputInfo(result);
    expect(info.size).toBe(69425);
    expect(info.size).toBeLessThanOrEqual(target);
    // Within 1% tolerance of the target: proves the early-break path is exercised,
    // not merely a full 12-iteration convergence.
    expect((target - info.size) / target).toBeLessThanOrEqual(0.01);
    expect(info.width).toBe(500);
    expect(info.height).toBe(500);
  });
});

describe("compress downscale pass (L110, L117)", () => {
  // Target 1355 is below the full-dim quality-1 floor (2709), so the search fails
  // full-dim and enters the downscale loop. It first finds a valid quality at the
  // 211x211 pass (q=5, 1334 bytes) and returns there via `if (q !== null)`. The
  // L117 mutants change that: `q === null` / `-> true` return on the FIRST pass
  // (375x375) instead, and `-> false` never returns from the loop and falls
  // through to the 50x50 floor. Exact output dimensions pin the correct branch.
  it("returns at the first downscale pass that finds a quality (kills L117)", async () => {
    const target = 1355;
    const result = await compress(sharp(photo500), { targetSizeBytes: target, format: "jpg" });
    const info = await outputInfo(result);
    expect(info.width).toBe(211);
    expect(info.height).toBe(211);
    expect(info.size).toBeLessThanOrEqual(target);
  });

  // Impossibly small target on a 20x40 source forces the downscale loop to the
  // dimension floor. The passes are 15x30, 11x23, then 8x17 which trips
  // `newWidth < 10 || newHeight < 10` on the WIDTH axis (8 < 10, height 17 is not).
  // Correct code breaks and returns the last good pass, 11x23. The Logical
  // `|| -> &&` mutant does NOT break at 8x17 (both axes not < 10) and shrinks to
  // 6x13; the whole-condition `-> false` mutant never breaks and shrinks to 2x4;
  // the `newWidth < 10 -> false` operand mutant loses the width guard so 8x17 no
  // longer breaks. All three change the exact output dimensions.
  it("stops the downscale loop when the width axis hits the floor (kills L110 width operand)", async () => {
    const asymmetric = await seededPhoto(20, 40, 55555, 3, 2, 120);
    const result = await compress(sharp(asymmetric), { targetSizeBytes: 1, format: "jpg" });
    const info = await outputInfo(result);
    expect(info.width).toBe(11);
    expect(info.height).toBe(23);
    // The 10px floor is respected on both axes: dimensions never drop below 10.
    expect(info.width).toBeGreaterThanOrEqual(10);
    expect(info.height).toBeGreaterThanOrEqual(10);
  });

  // Transposed source (40x20): the passes are 30x15, 23x11, then 17x8 which trips
  // the SAME guard but on the HEIGHT axis (8 < 10, width 17 is not). Correct code
  // returns the last good pass, 23x11. The `newHeight < 10 -> false` operand
  // mutant loses the height guard, so 17x8 no longer breaks and the output shrinks
  // further. The width-axis case above cannot catch this operand; only a
  // height-limited source can.
  it("stops the downscale loop when the height axis hits the floor (kills L110 height operand)", async () => {
    const asymmetric = await seededPhoto(40, 20, 55555, 3, 2, 120);
    const result = await compress(sharp(asymmetric), { targetSizeBytes: 1, format: "jpg" });
    const info = await outputInfo(result);
    expect(info.width).toBe(23);
    expect(info.height).toBe(11);
    expect(info.width).toBeGreaterThanOrEqual(10);
    expect(info.height).toBeGreaterThanOrEqual(10);
  });

  // A 13x13 source scales to exactly 10x10 on the first pass. With `< 10`
  // (correct) that is NOT below the floor, so the loop continues and the final
  // fallback returns 10x10. The L110 Equality `< -> <=` mutant treats 10 as below
  // the floor, breaks on pass 1, and returns the un-scaled 13x13 instead.
  it("keeps a dimension that lands exactly on 10 (kills L110 equality)", async () => {
    const tiny = await seededPhoto(13, 13, 987654321, 3, 2, 120);
    const result = await compress(sharp(tiny), { targetSizeBytes: 1, format: "jpg" });
    const info = await outputInfo(result);
    expect(info.width).toBe(10);
    expect(info.height).toBe(10);
  });
});
