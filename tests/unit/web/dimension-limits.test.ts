import {
  MAX_CONTENT_AWARE_RESIZE_PIXELS,
  MAX_RESIZE_OUTPUT_DIMENSION,
  MAX_RESIZE_PERCENTAGE,
} from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import {
  isContentAwareAreaWithinLimit,
  isDimensionWithinLimit,
  isResizePercentageWithinLimit,
  isSmartCropAreaWithinLimit,
  isSmartCropTargetSizeWithinLimit,
  MAX_SMART_CROP_TARGET_SIZE,
} from "@/lib/dimension-limits";

describe("isDimensionWithinLimit", () => {
  it("accepts the 1 to MAX range and rejects everything outside it", () => {
    expect(isDimensionWithinLimit(1)).toBe(true);
    expect(isDimensionWithinLimit(MAX_RESIZE_OUTPUT_DIMENSION)).toBe(true);
    expect(isDimensionWithinLimit(MAX_RESIZE_OUTPUT_DIMENSION + 1)).toBe(false);
    expect(isDimensionWithinLimit(0)).toBe(false);
    expect(isDimensionWithinLimit(-4)).toBe(false);
    expect(isDimensionWithinLimit(Number.NaN)).toBe(false);
    expect(isDimensionWithinLimit(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("rejects fractional sizes the routes' z.number().int() would reject", () => {
    expect(isDimensionWithinLimit(800.5)).toBe(false);
    expect(isDimensionWithinLimit(0.5)).toBe(false);
    expect(isDimensionWithinLimit(2.5)).toBe(false);
  });
});

describe("isSmartCropAreaWithinLimit", () => {
  it("accepts a box up to the 64 MP budget and rejects one over it", () => {
    expect(isSmartCropAreaWithinLimit(8192, 8192, 0)).toBe(true);
    expect(isSmartCropAreaWithinLimit(8193, 8192, 0)).toBe(false);
    expect(
      isSmartCropAreaWithinLimit(MAX_RESIZE_OUTPUT_DIMENSION, MAX_RESIZE_OUTPUT_DIMENSION, 0),
    ).toBe(false);
  });

  it("counts the padded intermediate the route resizes to", () => {
    // 8000 x 8000 is under budget, but 30% padding pushes it over.
    expect(isSmartCropAreaWithinLimit(8000, 8000, 0)).toBe(true);
    expect(isSmartCropAreaWithinLimit(8000, 8000, 30)).toBe(false);
    expect(isSmartCropAreaWithinLimit(1000, 1000, 50)).toBe(true);
  });
});

describe("isSmartCropTargetSizeWithinLimit", () => {
  it("caps the trim square at the square root of the pixel budget", () => {
    expect(MAX_SMART_CROP_TARGET_SIZE).toBe(8192);
    expect(isSmartCropTargetSizeWithinLimit(1)).toBe(true);
    expect(isSmartCropTargetSizeWithinLimit(8192)).toBe(true);
    expect(isSmartCropTargetSizeWithinLimit(8193)).toBe(false);
    expect(isSmartCropTargetSizeWithinLimit(0)).toBe(false);
    expect(isSmartCropTargetSizeWithinLimit(800.5)).toBe(false);
  });
});

describe("isContentAwareAreaWithinLimit", () => {
  it("caps seam-carved output at the 25 MP route budget", () => {
    expect(isContentAwareAreaWithinLimit(5000, 5000)).toBe(true);
    expect(isContentAwareAreaWithinLimit(5000, 5001)).toBe(false);
    expect(isContentAwareAreaWithinLimit(MAX_RESIZE_OUTPUT_DIMENSION, 1)).toBe(true);
    expect(isContentAwareAreaWithinLimit(MAX_RESIZE_OUTPUT_DIMENSION, 2000)).toBe(false);
  });
});

describe("isResizePercentageWithinLimit", () => {
  it("caps scale at the route's percentage ceiling", () => {
    expect(isResizePercentageWithinLimit(1)).toBe(true);
    expect(isResizePercentageWithinLimit(MAX_RESIZE_PERCENTAGE)).toBe(true);
    expect(isResizePercentageWithinLimit(MAX_RESIZE_PERCENTAGE + 1)).toBe(false);
    expect(isResizePercentageWithinLimit(0)).toBe(false);
    expect(isResizePercentageWithinLimit(-10)).toBe(false);
    expect(isResizePercentageWithinLimit(Number.NaN)).toBe(false);
  });
});
