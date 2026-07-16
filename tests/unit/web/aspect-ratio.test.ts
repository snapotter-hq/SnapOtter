import { describe, expect, it } from "vitest";
import {
  clampResizeDimension,
  largestRatioBox,
  MAX_RESIZE_DIMENSION,
  pairedDimension,
  RESIZE_RATIO_PRESETS,
} from "@/lib/aspect-ratio";

describe("pairedDimension", () => {
  it("computes height from width for 16:9", () => {
    expect(pairedDimension(1600, 16 / 9, "width")).toBe(900);
  });

  it("computes width from height for 16:9", () => {
    expect(pairedDimension(900, 16 / 9, "height")).toBe(1600);
  });

  it("keeps a 1:1 square equal on both axes", () => {
    expect(pairedDimension(200, 1, "width")).toBe(200);
    expect(pairedDimension(200, 1, "height")).toBe(200);
  });

  it("rounds to the nearest whole pixel", () => {
    // width 100 at 3:2 (1.5) -> height 66.67 -> 67
    expect(pairedDimension(100, 3 / 2, "width")).toBe(67);
  });

  it("clamps the result to at least 1px", () => {
    // 1 / (16/9) = 0.5625 -> rounds to 1
    expect(pairedDimension(1, 16 / 9, "width")).toBe(1);
  });

  it("never exceeds the max dimension", () => {
    expect(pairedDimension(MAX_RESIZE_DIMENSION, 9 / 16, "width")).toBeLessThanOrEqual(
      MAX_RESIZE_DIMENSION,
    );
  });
});

describe("largestRatioBox", () => {
  it("fits a 16:9 box inside a 4:3 landscape source, constrained by width", () => {
    // 4000x3000 (1.333) is narrower than 16:9 (1.778) -> width wins
    expect(largestRatioBox(4000, 3000, 16 / 9)).toEqual({ width: 4000, height: 2250 });
  });

  it("fits a 16:9 box inside a very wide source, constrained by height", () => {
    // 3000x1000 (3.0) is wider than 16:9 -> height wins
    expect(largestRatioBox(3000, 1000, 16 / 9)).toEqual({ width: 1778, height: 1000 });
  });

  it("returns the source itself when the ratio already matches", () => {
    expect(largestRatioBox(1920, 1080, 16 / 9)).toEqual({ width: 1920, height: 1080 });
  });

  it("never upscales beyond the source dimensions", () => {
    const box = largestRatioBox(1080, 1920, 16 / 9); // portrait source -> 16:9
    expect(box.width).toBeLessThanOrEqual(1080);
    expect(box.height).toBeLessThanOrEqual(1920);
  });
});

describe("clampResizeDimension", () => {
  it("rounds fractional pixels", () => {
    expect(clampResizeDimension(66.6)).toBe(67);
  });

  it("floors at 1px", () => {
    expect(clampResizeDimension(0)).toBe(1);
    expect(clampResizeDimension(-5)).toBe(1);
  });

  it("caps at the max dimension", () => {
    expect(clampResizeDimension(99999)).toBe(MAX_RESIZE_DIMENSION);
  });
});

describe("RESIZE_RATIO_PRESETS", () => {
  it("includes the common landscape and portrait ratios", () => {
    const ids = RESIZE_RATIO_PRESETS.map((p) => p.id);
    expect(ids).toContain("1:1");
    expect(ids).toContain("16:9");
    expect(ids).toContain("9:16");
    expect(ids).toContain("4:3");
  });

  it("stores each ratio as width divided by height", () => {
    const r = RESIZE_RATIO_PRESETS.find((p) => p.id === "16:9");
    expect(r?.value).toBeCloseTo(16 / 9);
  });
});
