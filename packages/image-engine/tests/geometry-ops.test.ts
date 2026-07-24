import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { crop } from "../src/operations/crop.js";
import { flip } from "../src/operations/flip.js";
import { resize } from "../src/operations/resize.js";
import { rotate } from "../src/operations/rotate.js";
import type { Sharp } from "../src/types.js";

// Geometry operations have exact integer oracles (output width/height and
// pixel positions), which makes them ideal for mutation-killing assertions.
// Every dimension and sampled pixel below is verified against real Sharp output.

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Solid-color image with explicit dimensions, RGB, no alpha. */
function solid(width: number, height: number, color: Rgb): Sharp {
  return sharp({
    create: { width, height, channels: 3, background: color },
  });
}

/**
 * 4x4 image with four distinct quadrant colors so left/top offsets are
 * observable from a single sampled pixel:
 *   top-left = red, top-right = green, bottom-left = blue, bottom-right = white.
 * Quadrant boundary is at x=2 (left|right) and y=2 (top|bottom).
 */
function quadrant4x4(): Sharp {
  const width = 4;
  const height = 4;
  const channels = 3;
  const data = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const left = x < 2;
      const top = y < 2;
      if (top && left) {
        data[i] = 255; // red
      } else if (top && !left) {
        data[i + 1] = 255; // green
      } else if (!top && left) {
        data[i + 2] = 255; // blue
      } else {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255; // white
      }
    }
  }
  return sharp(data, { raw: { width, height, channels } });
}

/**
 * Non-square 6x2 strip: left half (x<3) red, right half green. Both rows
 * identical, so a rotation's effect on the horizontal axis is what shows up,
 * distinguishing clockwise (90) from counter-clockwise (270).
 */
function strip6x2(): Sharp {
  const width = 6;
  const height = 2;
  const channels = 3;
  const data = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const left = x < 3;
      data[i] = left ? 255 : 0;
      data[i + 1] = left ? 0 : 255;
    }
  }
  return sharp(data, { raw: { width, height, channels } });
}

/** Non-square 6x2 strip, all black except a single white pixel at (0,0). */
function marker6x2(): Sharp {
  const width = 6;
  const height = 2;
  const channels = 3;
  const data = Buffer.alloc(width * height * channels);
  data[0] = 255;
  data[1] = 255;
  data[2] = 255;
  return sharp(data, { raw: { width, height, channels } });
}

interface Sampled {
  rgb: [number, number, number];
  width: number;
  height: number;
}

/** Rasterize and read a single pixel plus the output dimensions. */
async function sample(image: Sharp, x: number, y: number): Promise<Sampled> {
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return {
    rgb: [data[i], data[i + 1], data[i + 2]],
    width: info.width,
    height: info.height,
  };
}

/** Rasterize and read just the output dimensions. */
async function dims(image: Sharp): Promise<[number, number]> {
  const { info } = await image.raw().toBuffer({ resolveWithObject: true });
  return [info.width, info.height];
}

describe("resize (mutation-killing)", () => {
  // Source is 100x50 (2:1 aspect) so every fit mode yields distinct output.
  const RED: Rgb = { r: 255, g: 0, b: 0 };

  // resize on a fresh 100x50 red source for the dimension/pixel oracles.
  function resizeOn(options: Parameters<typeof resize>[1]): Promise<Sharp> {
    return resize(solid(100, 50, RED), options);
  }

  it("fit=inside computes exact letterbox dimensions", async () => {
    // 100x50 into a 40x40 box, preserving aspect, fully contained: 40x20.
    const [w, h] = await dims(
      await resizeOn({ width: 40, height: 40, fit: "inside", withoutEnlargement: false }),
    );
    expect(w).toBe(40);
    expect(h).toBe(20);
  });

  it("fit=outside computes exact cover-box dimensions", async () => {
    // 100x50 into a 40x40 box, preserving aspect, fully covering: 80x40.
    const [w, h] = await dims(
      await resizeOn({ width: 40, height: 40, fit: "outside", withoutEnlargement: false }),
    );
    expect(w).toBe(80);
    expect(h).toBe(40);
  });

  it("fit=cover fills the exact target frame with image content", async () => {
    // Cover crops to fill: exact 40x40 and the top edge is image (red), no pad.
    const s = await sample(
      await resizeOn({ width: 40, height: 40, fit: "cover", withoutEnlargement: false }),
      20,
      0,
    );
    expect(s.width).toBe(40);
    expect(s.height).toBe(40);
    expect(s.rgb).toEqual([255, 0, 0]);
  });

  it("fit=contain pads to the exact target frame (background at the edge)", async () => {
    // Contain letterboxes: exact 40x40, top edge is background (black), center is image.
    const edge = await sample(
      await resizeOn({ width: 40, height: 40, fit: "contain", withoutEnlargement: false }),
      20,
      0,
    );
    expect(edge.width).toBe(40);
    expect(edge.height).toBe(40);
    expect(edge.rgb).toEqual([0, 0, 0]);
    const center = await sample(
      await resizeOn({ width: 40, height: 40, fit: "contain", withoutEnlargement: false }),
      20,
      20,
    );
    expect(center.rgb).toEqual([255, 0, 0]);
  });

  it("fit=fill stretches to the exact target with no padding", async () => {
    // Fill distorts to exactly 40x40 and fills the frame (edge is image, not pad).
    const s = await sample(
      await resizeOn({ width: 40, height: 40, fit: "fill", withoutEnlargement: false }),
      20,
      0,
    );
    expect(s.width).toBe(40);
    expect(s.height).toBe(40);
    expect(s.rgb).toEqual([255, 0, 0]);
  });

  it("defaults to fit=cover when fit is omitted", async () => {
    // resize passes `fit ?? "cover"`; default must behave like cover, not contain.
    const s = await sample(await resizeOn({ width: 40, height: 40 }), 20, 0);
    expect(s.width).toBe(40);
    expect(s.height).toBe(40);
    expect(s.rgb).toEqual([255, 0, 0]); // red edge = cover, black would mean contain
  });

  it("width-only preserves aspect and computes the exact height", async () => {
    // 100x50 -> width 30 => height round(30 * 50/100) = 15.
    const [w, h] = await dims(
      await resizeOn({ width: 30, fit: "inside", withoutEnlargement: false }),
    );
    expect(w).toBe(30);
    expect(h).toBe(15);
  });

  it("height-only preserves aspect and computes the exact width", async () => {
    // 100x50 -> height 30 => width round(30 * 100/50) = 60.
    const [w, h] = await dims(
      await resizeOn({ height: 30, fit: "inside", withoutEnlargement: false }),
    );
    expect(w).toBe(60);
    expect(h).toBe(30);
  });

  it("withoutEnlargement=true clamps an oversized target to the source size", async () => {
    // Target 200x200 exceeds source 100x50; clamps to 100x50.
    const [w, h] = await dims(
      await resizeOn({ width: 200, height: 200, fit: "inside", withoutEnlargement: true }),
    );
    expect(w).toBe(100);
    expect(h).toBe(50);
  });

  it("withoutEnlargement=false enlarges to the exact target", async () => {
    // Same oversized target, but enlargement allowed: 200x100 (aspect preserved).
    const [w, h] = await dims(
      await resizeOn({ width: 200, height: 200, fit: "inside", withoutEnlargement: false }),
    );
    expect(w).toBe(200);
    expect(h).toBe(100);
  });

  it("withoutEnlargement clamps width but not a smaller height independently", async () => {
    // Width 200 (> 100) clamps to 100; height 20 (< 50) stays 20. Exercises the
    // two independent `> meta.width` / `> meta.height` guards separately.
    const [w, h] = await dims(
      await resizeOn({ width: 200, height: 20, fit: "fill", withoutEnlargement: true }),
    );
    expect(w).toBe(100);
    expect(h).toBe(20);
  });

  it("resizes by percentage with exact rounded dimensions", async () => {
    // 100x50 at 50% => 50x25.
    const [w, h] = await dims(await resizeOn({ percentage: 50 }));
    expect(w).toBe(50);
    expect(h).toBe(25);
  });

  it("percentage rounds each dimension and floors at 1px", async () => {
    // 100x50 at 1% => round(1) x round(0.5)=1, then Math.max(1, ...) keeps >= 1.
    const [w, h] = await dims(await resizeOn({ percentage: 1 }));
    expect(w).toBe(1);
    expect(h).toBe(1);
  });

  it("percentage over 100 enlarges by the exact factor", async () => {
    // 100x50 at 250% => 250x125.
    const [w, h] = await dims(await resizeOn({ percentage: 250 }));
    expect(w).toBe(250);
    expect(h).toBe(125);
  });

  it("rejects a zero or negative percentage", async () => {
    await expect(resizeOn({ percentage: 0 })).rejects.toThrow(/percentage must be greater than 0/);
    await expect(resizeOn({ percentage: -10 })).rejects.toThrow(
      /percentage must be greater than 0/,
    );
  });

  it("rejects zero and negative width or height", async () => {
    await expect(resizeOn({ width: 0 })).rejects.toThrow(/width must be greater than 0/);
    await expect(resizeOn({ height: -5 })).rejects.toThrow(/height must be greater than 0/);
  });

  it("rejects when neither width, height, nor percentage is given", async () => {
    await expect(resizeOn({})).rejects.toThrow(/requires width, height, or percentage/);
  });
});

describe("crop (mutation-killing)", () => {
  it("extracts the exact requested region size", async () => {
    const [w, h] = await dims(await crop(quadrant4x4(), { left: 1, top: 1, width: 2, height: 3 }));
    expect(w).toBe(2);
    expect(h).toBe(3);
  });

  it("honors left/top offsets (top-right quadrant is green, not swapped)", async () => {
    // Extract the top-right quadrant: left=2, top=0. A swapped left/top would
    // pull the bottom-left (blue) instead, so the color pins the offsets.
    const s = await sample(
      await crop(quadrant4x4(), { left: 2, top: 0, width: 2, height: 2 }),
      0,
      0,
    );
    expect(s.width).toBe(2);
    expect(s.height).toBe(2);
    expect(s.rgb).toEqual([0, 255, 0]);
  });

  it("honors left/top offsets in the other axis (bottom-left is blue)", async () => {
    const s = await sample(
      await crop(quadrant4x4(), { left: 0, top: 2, width: 2, height: 2 }),
      0,
      0,
    );
    expect(s.rgb).toEqual([0, 0, 255]);
  });

  it("does not swap width and height", async () => {
    // Wide-but-short region from the top edge: exact 4x1, spanning both top
    // quadrants. A w/h swap (1x4) would change the dimensions.
    const [w, h] = await dims(await crop(quadrant4x4(), { left: 0, top: 0, width: 4, height: 1 }));
    expect(w).toBe(4);
    expect(h).toBe(1);
  });

  it("crops by percent with exact rounded region and correct offset", async () => {
    // On a 4x4: left=50% -> round(2), top=0, w=50% -> 2, h=50% -> 2 == top-right (green).
    const s = await sample(
      await crop(quadrant4x4(), { left: 50, top: 0, width: 50, height: 50, unit: "percent" }),
      0,
      0,
    );
    expect(s.width).toBe(2);
    expect(s.height).toBe(2);
    expect(s.rgb).toEqual([0, 255, 0]);
  });

  it("percent rounding pins the arithmetic (25% of 10px rounds to 3)", async () => {
    // 10x10: left=25% -> round(2.5)=3, w=50% -> 5 => 3+5=8 <= 10 (valid), size 5x5.
    const [w, h] = await dims(
      await crop(solid(10, 10, { r: 10, g: 20, b: 30 }), {
        left: 25,
        top: 25,
        width: 50,
        height: 50,
        unit: "percent",
      }),
    );
    expect(w).toBe(5);
    expect(h).toBe(5);
  });

  it("rejects a crop whose width exceeds the image (right edge boundary)", async () => {
    // left(2) + width(3) = 5 > 4.
    await expect(crop(quadrant4x4(), { left: 2, top: 0, width: 3, height: 2 })).rejects.toThrow(
      /exceeds image width/,
    );
  });

  it("rejects a crop whose height exceeds the image (bottom edge boundary)", async () => {
    // top(2) + height(3) = 5 > 4.
    await expect(crop(quadrant4x4(), { left: 0, top: 2, width: 2, height: 3 })).rejects.toThrow(
      /exceeds image height/,
    );
  });

  it("accepts a crop that exactly fills to the far edge (boundary is inclusive)", async () => {
    // left(2) + width(2) = 4 == 4 must NOT throw (guards use >, not >=).
    const [w, h] = await dims(await crop(quadrant4x4(), { left: 2, top: 2, width: 2, height: 2 }));
    expect(w).toBe(2);
    expect(h).toBe(2);
  });

  it("rejects zero width or zero height", async () => {
    await expect(crop(quadrant4x4(), { left: 0, top: 0, width: 0, height: 2 })).rejects.toThrow(
      /width and height must be greater than 0/,
    );
    await expect(crop(quadrant4x4(), { left: 0, top: 0, width: 2, height: 0 })).rejects.toThrow(
      /width and height must be greater than 0/,
    );
  });

  it("rejects negative left or top", async () => {
    await expect(crop(quadrant4x4(), { left: -1, top: 0, width: 2, height: 2 })).rejects.toThrow(
      /left and top must be non-negative/,
    );
    await expect(crop(quadrant4x4(), { left: 0, top: -1, width: 2, height: 2 })).rejects.toThrow(
      /left and top must be non-negative/,
    );
  });
});

describe("rotate (mutation-killing)", () => {
  it("rotates 90 and swaps dimensions (2:1 -> 1:2)", async () => {
    const [w, h] = await dims(await rotate(strip6x2(), { angle: 90 }));
    expect(w).toBe(2);
    expect(h).toBe(6);
  });

  it("rotates 90 clockwise: the top-left marker lands at the top-right corner", async () => {
    // 6x2 -> 2x6. Clockwise sends original (0,0) to (width-1, 0) = (1, 0).
    const s = await sample(await rotate(marker6x2(), { angle: 90 }), 1, 0);
    expect(s.width).toBe(2);
    expect(s.height).toBe(6);
    expect(s.rgb).toEqual([255, 255, 255]);
  });

  it("rotates 270 the other way: the top-left marker lands at the bottom-left corner", async () => {
    // 6x2 -> 2x6. Counter-clockwise sends original (0,0) to (0, height-1) = (0, 5).
    const s = await sample(await rotate(marker6x2(), { angle: 270 }), 0, 5);
    expect(s.width).toBe(2);
    expect(s.height).toBe(6);
    expect(s.rgb).toEqual([255, 255, 255]);
  });

  it("rotates 180 keeping dimensions and mirroring both axes", async () => {
    // Square marker so we can check the corner move without a dim swap.
    const [w, h] = await dims(await rotate(quadrant4x4(), { angle: 180 }));
    expect(w).toBe(4);
    expect(h).toBe(4);
    // Original top-left (red) ends at bottom-right (3,3).
    const s = await sample(await rotate(quadrant4x4(), { angle: 180 }), 3, 3);
    expect(s.rgb).toEqual([255, 0, 0]);
  });

  it("applies the exact background color on an arbitrary (non-90) angle", async () => {
    // 45deg on a 4x4 grows the canvas to 6x6; the (0,0) corner is background.
    const s = await sample(
      await rotate(solid(4, 4, { r: 255, g: 0, b: 0 }), { angle: 45, background: "#0000FF" }),
      0,
      0,
    );
    expect(s.width).toBe(6);
    expect(s.height).toBe(6);
    expect(s.rgb).toEqual([0, 0, 255]);
  });

  it("defaults the arbitrary-angle background to black when none is given", async () => {
    const s = await sample(await rotate(solid(4, 4, { r: 255, g: 0, b: 0 }), { angle: 45 }), 0, 0);
    expect(s.rgb).toEqual([0, 0, 0]);
  });

  it("treats a 0-degree rotation as a multiple of 90 (dimensions unchanged)", async () => {
    // angle % 90 === 0 path. 6x2 stays 6x2.
    const [w, h] = await dims(await rotate(strip6x2(), { angle: 0 }));
    expect(w).toBe(6);
    expect(h).toBe(2);
  });
});

describe("flip (mutation-killing)", () => {
  it("flips horizontally: content mirrors across X, Y unchanged", async () => {
    // flop(): top-left red moves to the top-right; top-right green moves to top-left.
    const movedRed = await sample(await flip(quadrant4x4(), { horizontal: true }), 3, 0);
    expect(movedRed.rgb).toEqual([255, 0, 0]);
    const movedGreen = await sample(await flip(quadrant4x4(), { horizontal: true }), 0, 0);
    expect(movedGreen.rgb).toEqual([0, 255, 0]);
    // Bottom-left blue stays on the bottom row (Y unchanged), moves to bottom-right.
    const blue = await sample(await flip(quadrant4x4(), { horizontal: true }), 3, 3);
    expect(blue.rgb).toEqual([0, 0, 255]);
  });

  it("flips vertically: content mirrors across Y, X unchanged", async () => {
    // flip(): top-left red moves to the bottom-left; bottom-left blue moves to top-left.
    const movedRed = await sample(await flip(quadrant4x4(), { vertical: true }), 0, 3);
    expect(movedRed.rgb).toEqual([255, 0, 0]);
    const movedBlue = await sample(await flip(quadrant4x4(), { vertical: true }), 0, 0);
    expect(movedBlue.rgb).toEqual([0, 0, 255]);
    // Top-right green stays on the right column (X unchanged), moves to bottom-right.
    const green = await sample(await flip(quadrant4x4(), { vertical: true }), 3, 3);
    expect(green.rgb).toEqual([0, 255, 0]);
  });

  it("flips both axes: top-left maps to the opposite (bottom-right) corner", async () => {
    const s = await sample(await flip(quadrant4x4(), { horizontal: true, vertical: true }), 3, 3);
    expect(s.rgb).toEqual([255, 0, 0]);
  });

  it("preserves dimensions on any flip", async () => {
    const [w, h] = await dims(
      await flip(solid(6, 2, { r: 255, g: 0, b: 0 }), { horizontal: true }),
    );
    expect(w).toBe(6);
    expect(h).toBe(2);
  });

  it("rejects when neither horizontal nor vertical is requested", async () => {
    await expect(flip(quadrant4x4(), {})).rejects.toThrow(/at least one of horizontal or vertical/);
    await expect(flip(quadrant4x4(), { horizontal: false, vertical: false })).rejects.toThrow(
      /at least one of horizontal or vertical/,
    );
  });
});
