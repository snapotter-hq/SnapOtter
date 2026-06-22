import { describe, expect, it } from "vitest";
import { resolvePanStart } from "@/components/common/image-viewer-drag";

describe("resolvePanStart (ImageViewer drag-to-pan)", () => {
  it("starts from a copy of the current pan offset on the first frame", () => {
    const panOffset = { x: 10, y: 20 };
    const start = resolvePanStart(true, undefined, panOffset);
    expect(start).toEqual({ x: 10, y: 20 });
    // Must be a copy, not the live state object, so accumulating movement
    // does not mutate the committed offset.
    expect(start).not.toBe(panOffset);
  });

  it("reuses memo on subsequent frames so the drag accumulates from one anchor", () => {
    const memo = { x: 5, y: 6 };
    expect(resolvePanStart(false, memo, { x: 0, y: 0 })).toBe(memo);
  });

  // Regression for NODE-15 / NODE-17 / NODE-18 (Sentry): a non-first frame can
  // arrive with memo never set: on pointerUp, or when a concurrent pinch flips
  // the viewer into actual-size (pan) mode mid-gesture. The old handler read
  // `memo.x` directly and threw "Cannot read properties of undefined (reading
  // 'x')" across Chrome/Safari/Firefox. It must fall back to the live offset.
  it("falls back to the current pan offset when memo is missing on a non-first frame", () => {
    const panOffset = { x: 3, y: 4 };
    expect(() => resolvePanStart(false, undefined, panOffset)).not.toThrow();
    expect(resolvePanStart(false, undefined, panOffset)).toEqual({ x: 3, y: 4 });
  });
});
