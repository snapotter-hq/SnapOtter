import { describe, expect, it } from "vitest";
import {
  actualSizeZoom,
  anchorPan,
  canActualSize,
  clampPan,
  clampZoom,
  fitScaleOf,
  MAX_RENDER_DIM,
  maxZoomOf,
  percentOf,
  renderSize,
  toContentPoint,
  wheelZoomFactor,
} from "@/hooks/zoom-pan-math";

// 4000x3000 image fit into an 800x600 frame -> fitScale 0.2 (downscaled).
const big = { natural: { w: 4000, h: 3000 }, fitted: { w: 800, h: 600 } };
// 800x600 image shown 1:1 -> fitScale 1.
const exact = { natural: { w: 800, h: 600 }, fitted: { w: 800, h: 600 } };
// 100x75 image upscaled to fill an 800x600 frame -> fitScale 8 (upscaled).
const tiny = { natural: { w: 100, h: 75 }, fitted: { w: 800, h: 600 } };

describe("fitScaleOf / percent", () => {
  it("computes fit scale", () => {
    expect(fitScaleOf(big)).toBeCloseTo(0.2, 6);
    expect(fitScaleOf(exact)).toBeCloseTo(1, 6);
    expect(fitScaleOf(tiny)).toBeCloseTo(8, 6);
  });
  it("shows actual-pixel percentage", () => {
    expect(percentOf(1, big)).toBe(20);
    expect(percentOf(5, big)).toBe(100);
    expect(percentOf(1, exact)).toBe(100);
  });
});

describe("clampZoom / maxZoom", () => {
  it("never below fit", () => {
    expect(clampZoom(0.3, big)).toBe(1);
  });
  it("reaches actual size plus headroom", () => {
    expect(maxZoomOf(big)).toBeGreaterThanOrEqual(5);
    expect(clampZoom(999, big)).toBe(maxZoomOf(big));
  });
});

describe("actualSize", () => {
  it("targets natural resolution for large images", () => {
    expect(actualSizeZoom(big)).toBeCloseTo(5, 6);
    expect(canActualSize(big)).toBe(true);
  });
  it("is disabled when the image is not larger than the frame", () => {
    expect(canActualSize(exact)).toBe(false);
    expect(canActualSize(tiny)).toBe(false);
    expect(actualSizeZoom(tiny)).toBe(1);
  });
});

describe("wheelZoomFactor", () => {
  it("zooms in on scroll up, out on scroll down", () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(wheelZoomFactor(0)).toBe(1);
  });
});

describe("anchorPan keeps the cursor point fixed", () => {
  it("a content point under the cursor stays under it after zoom", () => {
    const viewportCenter = { x: 400, y: 300 };
    const cursor = { x: 550, y: 420 };
    const pan = { x: 0, y: 0 };
    const oldZoom = 1;
    const newZoom = 2;
    const newPan = anchorPan(pan, oldZoom, newZoom, cursor, viewportCenter);
    const p = {
      x: (cursor.x - viewportCenter.x - pan.x) / oldZoom,
      y: (cursor.y - viewportCenter.y - pan.y) / oldZoom,
    };
    const screenAfter = {
      x: viewportCenter.x + newPan.x + p.x * newZoom,
      y: viewportCenter.y + newPan.y + p.y * newZoom,
    };
    expect(screenAfter.x).toBeCloseTo(cursor.x, 6);
    expect(screenAfter.y).toBeCloseTo(cursor.y, 6);
  });
  it("is a no-op when zoom does not change", () => {
    const pan = { x: 12, y: -7 };
    expect(anchorPan(pan, 2, 2, { x: 10, y: 10 }, { x: 0, y: 0 })).toEqual(pan);
  });
});

describe("clampPan", () => {
  const fitted = { w: 800, h: 600 };
  const viewport = { w: 800, h: 600 };
  it("locks to center when content fits the viewport (zoom 1)", () => {
    expect(clampPan({ x: 50, y: 50 }, 1, fitted, viewport)).toEqual({ x: 0, y: 0 });
  });
  it("bounds pan to the overflow when zoomed in", () => {
    // zoom 2 -> content 1600x1200 -> overflowX (1600-800)/2 = 400, overflowY (1200-600)/2 = 300
    expect(clampPan({ x: 999, y: -999 }, 2, fitted, viewport)).toEqual({ x: 400, y: -300 });
    expect(clampPan({ x: 100, y: 100 }, 2, fitted, viewport)).toEqual({ x: 100, y: 100 });
  });
});

describe("toContentPoint is transform-agnostic", () => {
  const fitted = { w: 800, h: 600 };
  it("maps screen to content at zoom 1", () => {
    const rect = { left: 0, top: 0, width: 800, height: 600 };
    expect(toContentPoint(400, 300, rect, fitted)).toEqual({ x: 400, y: 300 });
  });
  it("divides out a 2x zoom encoded in the rect", () => {
    const rect = { left: -400, top: -300, width: 1600, height: 1200 };
    expect(toContentPoint(400, 300, rect, fitted)).toEqual({ x: 400, y: 300 });
    expect(toContentPoint(-400, -300, rect, fitted)).toEqual({ x: 0, y: 0 });
  });
  it("returns origin for a degenerate rect", () => {
    expect(toContentPoint(10, 10, { left: 0, top: 0, width: 0, height: 0 }, fitted)).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe("renderSize", () => {
  it("uses natural resolution when within the cap", () => {
    expect(renderSize(big)).toEqual({ w: 4000, h: 3000 });
  });
  it("caps the longest side at MAX_RENDER_DIM", () => {
    const huge = { natural: { w: 8000, h: 6000 }, fitted: { w: 800, h: 600 } };
    const r = renderSize(huge);
    expect(Math.max(r.w, r.h)).toBe(MAX_RENDER_DIM);
    expect(r).toEqual({ w: 4096, h: 3072 });
  });
  it("floors at the fitted size for small upscaled images", () => {
    expect(renderSize(tiny)).toEqual({ w: 800, h: 600 });
  });
});
