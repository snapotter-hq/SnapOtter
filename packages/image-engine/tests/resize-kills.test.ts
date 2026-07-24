import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { resize } from "../src/operations/resize.js";
import type { Sharp } from "../src/types.js";

// A non-square source (100x50) so width and height clamps can be observed
// independently: mutating one comparison in the clamp block cannot be masked
// by the other dimension.
function source(width: number, height: number): Sharp {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  });
}

// Sharp raw create-buffers carry no encoded format, so force PNG before
// re-reading metadata for exact output dimensions.
async function outputDims(image: Sharp): Promise<{ width?: number; height?: number }> {
  const buf = await image.png().toBuffer();
  const meta = await sharp(buf).metadata();
  return { width: meta.width, height: meta.height };
}

describe("resize percentage path guard (L11)", () => {
  it("resizes by percentage on a real image with known dims (guard does not early-return)", async () => {
    // 100x50 @ 200% -> 200x100. Proves !metadata.width/!metadata.height was false
    // and the percentage math ran with the real source dimensions.
    const result = await resize(source(100, 50), { percentage: 200 });
    const dims = await outputDims(result);
    expect(dims.width).toBe(200);
    expect(dims.height).toBe(100);
  });

  it("resizes down by percentage with correct per-axis scaling", async () => {
    // 100x50 @ 50% -> 50x25. A single scale factor would give a square; the
    // 50x25 result proves each axis is scaled from its own source dimension.
    const result = await resize(source(100, 50), { percentage: 50 });
    const dims = await outputDims(result);
    expect(dims.width).toBe(50);
    expect(dims.height).toBe(25);
  });
});

describe("resize positive-dimension guards (L18 width, L21 height)", () => {
  // Assert the guard's own message, not a bare throw. Sharp itself rejects
  // width/height <= 0 with a different message ("Expected positive integer
  // for width..."), so a bare rejects.toThrow() cannot tell the guard from
  // Sharp and would let the "if (false)" / "<= -> <" mutants survive. The
  // exact-message match dies the moment the guard stops running.
  it("throws the width guard message on zero width but not on a valid positive width", async () => {
    await expect(resize(source(100, 50), { width: 0 })).rejects.toThrow(
      "Resize width must be greater than 0",
    );
    const dims = await outputDims(await resize(source(100, 50), { width: 40 }));
    expect(dims.width).toBe(40);
    expect(dims.height).toBe(20);
  });

  it("throws the width guard message on negative width", async () => {
    await expect(resize(source(100, 50), { width: -5 })).rejects.toThrow(
      "Resize width must be greater than 0",
    );
  });

  it("throws the height guard message on zero height but not on a valid positive height", async () => {
    await expect(resize(source(100, 50), { height: 0 })).rejects.toThrow(
      "Resize height must be greater than 0",
    );
    const dims = await outputDims(await resize(source(100, 50), { height: 20 }));
    expect(dims.width).toBe(40);
    expect(dims.height).toBe(20);
  });

  it("throws the height guard message on negative height", async () => {
    await expect(resize(source(100, 50), { height: -5 })).rejects.toThrow(
      "Resize height must be greater than 0",
    );
  });
});

// The clamp block at L28-L35 mutates width/height BEFORE handing them to
// Sharp, and Sharp also receives withoutEnlargement. Under fit "cover"/"fill"
// Sharp's own withoutEnlargement clamps identically, which masks the manual
// block (mutants there survive). Under fit "contain", Sharp's withoutEnlargement
// does NOT shrink to fit (it pads to the full box), so ONLY the manual clamp
// changes the dimensions. Using "contain" makes the block observable, so the
// L28/L33/L34 mutants die on an exact-dimension mismatch.
describe("resize withoutEnlargement block execution (L28)", () => {
  it("keeps output at source size when target is larger and withoutEnlargement is true", async () => {
    // Manual clamp -> 100x50; a false-mutant on L28 skips it and (under contain)
    // Sharp pads to the raw 200x100 box instead.
    const dims = await outputDims(
      await resize(source(100, 50), {
        width: 200,
        height: 100,
        fit: "contain",
        withoutEnlargement: true,
      }),
    );
    expect(dims.width).toBe(100);
    expect(dims.height).toBe(50);
  });

  it("enlarges to the target when withoutEnlargement is false", async () => {
    const dims = await outputDims(
      await resize(source(100, 50), {
        width: 200,
        height: 100,
        fit: "contain",
        withoutEnlargement: false,
      }),
    );
    expect(dims.width).toBe(200);
    expect(dims.height).toBe(100);
  });
});

describe("resize clamp comparisons (L33 width, L34 height)", () => {
  // Source is 100x50 for every case; withoutEnlargement + fit "contain" forces
  // the manual clamp to be the only thing that can change the dimensions.

  it("clamps width only when width exceeds source, leaving height untouched", async () => {
    // target 200x40: width 200 > 100 -> clamps to 100; height 40 < 50 -> stays 40.
    // Kills the L33 "width > meta.width" comparison: skip it and width stays 200.
    const dims = await outputDims(
      await resize(source(100, 50), {
        width: 200,
        height: 40,
        fit: "contain",
        withoutEnlargement: true,
      }),
    );
    expect(dims.width).toBe(100);
    expect(dims.height).toBe(40);
  });

  it("clamps height only when height exceeds source, leaving width untouched", async () => {
    // target 80x200: width 80 < 100 -> stays 80; height 200 > 50 -> clamps to 50.
    // Kills the L34 "height > meta.height" comparison: skip it and height stays 200.
    const dims = await outputDims(
      await resize(source(100, 50), {
        width: 80,
        height: 200,
        fit: "contain",
        withoutEnlargement: true,
      }),
    );
    expect(dims.width).toBe(80);
    expect(dims.height).toBe(50);
  });

  it("clamps both dimensions when both exceed source", async () => {
    // target 300x300: both > source -> clamp to 100x50.
    const dims = await outputDims(
      await resize(source(100, 50), {
        width: 300,
        height: 300,
        fit: "contain",
        withoutEnlargement: true,
      }),
    );
    expect(dims.width).toBe(100);
    expect(dims.height).toBe(50);
  });

  it("clamps neither dimension when both are smaller than source (real shrink)", async () => {
    // target 60x30: both < source -> no clamp, genuine downscale to 60x30.
    const dims = await outputDims(
      await resize(source(100, 50), {
        width: 60,
        height: 30,
        fit: "contain",
        withoutEnlargement: true,
      }),
    );
    expect(dims.width).toBe(60);
    expect(dims.height).toBe(30);
  });
});

describe("resize withoutEnlargement default (L41)", () => {
  // Sharp treats withoutEnlargement:undefined the same as false, so the exact
  // "?? false -> && false" mutant is equivalent at the output level (both
  // enlarge). These cases still pin the contract: omitted defaults to enlarge,
  // explicit true clamps.
  it("defaults to false and enlarges to the target when withoutEnlargement is omitted", async () => {
    // No withoutEnlargement: default false -> enlarge 100x50 to 200x100.
    const dims = await outputDims(
      await resize(source(100, 50), { width: 200, height: 100, fit: "contain" }),
    );
    expect(dims.width).toBe(200);
    expect(dims.height).toBe(100);
  });

  it("clamps to source when withoutEnlargement is explicitly true", async () => {
    const dims = await outputDims(
      await resize(source(100, 50), {
        width: 200,
        height: 100,
        fit: "contain",
        withoutEnlargement: true,
      }),
    );
    expect(dims.width).toBe(100);
    expect(dims.height).toBe(50);
  });
});
