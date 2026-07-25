import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
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

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    "rejects a non-finite or fractional width (%s) before Sharp",
    async (width) => {
      await expect(resize(source(100, 50), { width })).rejects.toThrow(
        "Resize width must be a positive integer",
      );
    },
  );

  it.each([Number.NaN, Number.NEGATIVE_INFINITY, 1.5])(
    "rejects a non-finite or fractional height (%s) before Sharp",
    async (height) => {
      await expect(resize(source(100, 50), { height })).rejects.toThrow(
        "Resize height must be a positive integer",
      );
    },
  );
});

describe("resize percentage safety boundaries", () => {
  it("rejects zero and negative percentages at the public guard", async () => {
    await expect(resize(source(100, 50), { percentage: 0 })).rejects.toThrow(
      "Resize percentage must be greater than 0",
    );
    await expect(resize(source(100, 50), { percentage: -1 })).rejects.toThrow(
      "Resize percentage must be greater than 0",
    );
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects a non-finite percentage (%s)",
    async (percentage) => {
      await expect(resize(source(100, 50), { percentage })).rejects.toThrow(
        "Resize percentage must be finite",
      );
    },
  );

  it("accepts the exact maximum percentage and rejects one step above it", async () => {
    const dims = await outputDims(await resize(source(10, 5), { percentage: 1000 }));
    expect(dims).toEqual({ width: 100, height: 50 });
    await expect(resize(source(10, 5), { percentage: 1001 })).rejects.toThrow(
      "Resize percentage must not exceed 1000",
    );
  });
});

describe("resize output allocation safety boundaries", () => {
  function metadataOnlyImage(
    width = 100,
    height = 100,
  ): {
    image: Sharp;
    resizeSpy: ReturnType<typeof vi.fn>;
  } {
    const resizeSpy = vi.fn();
    const fake = {
      metadata: vi.fn().mockResolvedValue({ width, height }),
      resize: resizeSpy,
    };
    resizeSpy.mockReturnValue(fake);
    return { image: fake as unknown as Sharp, resizeSpy };
  }

  it("accepts 16383 pixels on an axis and rejects 16384", async () => {
    const allowed = metadataOnlyImage();
    await expect(resize(allowed.image, { width: 16383, height: 1, fit: "fill" })).resolves.toBe(
      allowed.image,
    );
    expect(allowed.resizeSpy).toHaveBeenCalledOnce();

    const rejected = metadataOnlyImage();
    await expect(resize(rejected.image, { width: 16384, height: 1, fit: "fill" })).rejects.toThrow(
      "Resize output must not exceed 16383 pixels on either side",
    );
    expect(rejected.resizeSpy).not.toHaveBeenCalled();
  });

  it("accepts exactly 67,108,864 pixels and rejects one row more", async () => {
    const allowed = metadataOnlyImage();
    await expect(resize(allowed.image, { width: 8192, height: 8192, fit: "fill" })).resolves.toBe(
      allowed.image,
    );
    expect(allowed.resizeSpy).toHaveBeenCalledOnce();

    const rejected = metadataOnlyImage();
    await expect(
      resize(rejected.image, { width: 8192, height: 8193, fit: "fill" }),
    ).rejects.toThrow("Resize output must not exceed 67108864 total pixels");
    expect(rejected.resizeSpy).not.toHaveBeenCalled();
  });

  it("checks each axis independently", async () => {
    const allowedHeight = metadataOnlyImage();
    await expect(
      resize(allowedHeight.image, { width: 1, height: 16383, fit: "fill" }),
    ).resolves.toBe(allowedHeight.image);
    expect(allowedHeight.resizeSpy).toHaveBeenCalledOnce();

    await expect(
      resize(metadataOnlyImage().image, { width: 1, height: 16384, fit: "fill" }),
    ).rejects.toThrow("Resize output must not exceed 16383 pixels on either side");
  });

  it("applies aspect-ratio math to inside and outside before enforcing limits", async () => {
    const inside = metadataOnlyImage(2, 1);
    await expect(resize(inside.image, { width: 8192, height: 8192, fit: "inside" })).resolves.toBe(
      inside.image,
    );
    expect(inside.resizeSpy).toHaveBeenCalledOnce();

    const outside = metadataOnlyImage(2, 1);
    await expect(
      resize(outside.image, { width: 8192, height: 8192, fit: "outside" }),
    ).rejects.toThrow("Resize output must not exceed 16383 pixels on either side");
    expect(outside.resizeSpy).not.toHaveBeenCalled();

    const tallInside = metadataOnlyImage(1, 4);
    await expect(
      resize(tallInside.image, { width: 4096, height: 16383, fit: "inside" }),
    ).resolves.toBe(tallInside.image);
    expect(tallInside.resizeSpy).toHaveBeenCalledOnce();

    const heightLimitedInside = metadataOnlyImage(1, 2);
    await expect(
      resize(heightLimitedInside.image, { width: 8192, height: 16384, fit: "inside" }),
    ).rejects.toThrow("Resize output must not exceed 16383 pixels on either side");
    expect(heightLimitedInside.resizeSpy).not.toHaveBeenCalled();

    const narrowInside = metadataOnlyImage(100, 1);
    await expect(
      resize(narrowInside.image, { width: 16383, height: 16384, fit: "inside" }),
    ).resolves.toBe(narrowInside.image);
    expect(narrowInside.resizeSpy).toHaveBeenCalledOnce();
  });

  it("enforces proportional limits for width-only and height-only requests", async () => {
    const widthOnly = metadataOnlyImage(1, 2);
    await expect(resize(widthOnly.image, { width: 8192 })).rejects.toThrow(
      "Resize output must not exceed 16383 pixels on either side",
    );
    expect(widthOnly.resizeSpy).not.toHaveBeenCalled();

    const widthAxisOnly = metadataOnlyImage(2, 1);
    await expect(resize(widthAxisOnly.image, { width: 16384 })).rejects.toThrow(
      "Resize output must not exceed 16383 pixels on either side",
    );
    expect(widthAxisOnly.resizeSpy).not.toHaveBeenCalled();

    const heightOnly = metadataOnlyImage(2, 1);
    await expect(resize(heightOnly.image, { height: 8192 })).rejects.toThrow(
      "Resize output must not exceed 16383 pixels on either side",
    );
    expect(heightOnly.resizeSpy).not.toHaveBeenCalled();

    const heightAxisOnly = metadataOnlyImage(1, 2);
    await expect(resize(heightAxisOnly.image, { height: 16384 })).rejects.toThrow(
      "Resize output must not exceed 16383 pixels on either side",
    );
    expect(heightAxisOnly.resizeSpy).not.toHaveBeenCalled();
  });
});

describe("resize required-input and metadata guards", () => {
  it("rejects a request with no dimensions or percentage", async () => {
    await expect(resize(source(100, 50), {})).rejects.toThrow(
      "Resize requires width, height, or percentage",
    );
  });

  it("rejects metadata missing either source dimension", async () => {
    const missingWidth = {
      metadata: vi.fn().mockResolvedValue({ height: 100 }),
      resize: vi.fn(),
    } as unknown as Sharp;
    await expect(resize(missingWidth, { width: 10 })).rejects.toThrow(
      "Cannot determine image dimensions for resize",
    );

    const missingHeight = {
      metadata: vi.fn().mockResolvedValue({ width: 100 }),
      resize: vi.fn(),
    } as unknown as Sharp;
    await expect(resize(missingHeight, { height: 10 })).rejects.toThrow(
      "Cannot determine image dimensions for resize",
    );
  });
});

describe("resize output geometry safety", () => {
  it("computes contain and outside boxes from the source aspect ratio", async () => {
    expect(
      await outputDims(await resize(source(100, 50), { width: 80, height: 80, fit: "inside" })),
    ).toEqual({ width: 80, height: 40 });
    expect(
      await outputDims(await resize(source(100, 50), { width: 80, height: 80, fit: "outside" })),
    ).toEqual({ width: 160, height: 80 });
  });

  it("preserves aspect ratio for width-only and height-only resize", async () => {
    expect(await outputDims(await resize(source(100, 50), { width: 40 }))).toEqual({
      width: 40,
      height: 20,
    });
    expect(await outputDims(await resize(source(100, 50), { height: 20 }))).toEqual({
      width: 40,
      height: 20,
    });
  });
});

// The clamp block mutates width/height before handing them to Sharp. This is
// especially important for fit "contain": Sharp otherwise pads to the full
// requested box even when its own withoutEnlargement option is true. Using
// "contain" makes the manual clamp observable through exact output dimensions.
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
