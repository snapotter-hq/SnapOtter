import { describe, expect, it } from "vitest";
import { rotatedBoundingBox, toNormalizedRect } from "@/lib/sign-geometry";

describe("sign-geometry", () => {
  it("normalizes a pixel rect against the render size", () => {
    expect(toNormalizedRect({ x: 50, y: 100, w: 25, h: 10 }, 100, 200)).toEqual({
      x: 0.5,
      y: 0.5,
      w: 0.25,
      h: 0.05,
    });
  });

  it("bounding box of an unrotated rect is unchanged", () => {
    expect(rotatedBoundingBox(40, 20, 0)).toEqual({ w: 40, h: 20 });
  });

  it("bounding box of a 90deg rotation swaps w/h", () => {
    const b = rotatedBoundingBox(40, 20, 90);
    expect(b.w).toBeCloseTo(20, 5);
    expect(b.h).toBeCloseTo(40, 5);
  });

  it("bounding box grows for a 45deg rotation", () => {
    const b = rotatedBoundingBox(40, 20, 45);
    expect(b.w).toBeCloseTo((40 + 20) / Math.SQRT2, 5);
    expect(b.h).toBeCloseTo((40 + 20) / Math.SQRT2, 5);
  });
});
