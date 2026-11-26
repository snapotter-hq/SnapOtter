import { describe, expect, it } from "vitest";
import { textBlockOrigin } from "../../../apps/api/src/lib/text-overlay-render.js";
import {
  blockCentre,
  clampCentre,
  estimateBlockPercent,
  pointerToPlacement,
  type TextOverlayLayout,
} from "../../../apps/web/src/lib/text-overlay-placement.js";

const image = { width: 1000, height: 500 };
const layout: TextOverlayLayout = {
  text: "Hello",
  fontSize: 50,
  color: "#ffffff",
  position: "custom",
  x: 50,
  y: 50,
  wrap: true,
  maxWidth: 90,
};

// #4957: the draggable box has to land where the server draws the text.
describe("text-overlay placement", () => {
  it("clamps the centre so the block stays inside the image", () => {
    const block = { width: 20, height: 10 };
    expect(clampCentre({ x: 0, y: 0 }, block)).toEqual({ x: 10, y: 5 });
    expect(clampCentre({ x: 100, y: 100 }, block)).toEqual({ x: 90, y: 95 });
    expect(clampCentre({ x: 40, y: 60 }, block)).toEqual({ x: 40, y: 60 });
  });

  it("leaves a block bigger than the image where it is, like the server", () => {
    expect(clampCentre({ x: 10, y: 30 }, { width: 120, height: 10 })).toEqual({ x: 10, y: 30 });
  });

  it("agrees with the server's textBlockOrigin for custom, top, center and bottom", () => {
    const blockPct = { width: 20, height: 10 };
    const blockPx = { width: 200, height: 50 };
    for (const position of ["custom", "top", "center", "bottom"] as const) {
      for (const [x, y] of [
        [50, 50],
        [0, 0],
        [100, 100],
        [3, 97],
      ]) {
        const l = { ...layout, position, x, y };
        const centre = blockCentre(l, blockPct, image);
        const origin = textBlockOrigin(l, blockPx, image);
        expect((centre.x / 100) * image.width - blockPx.width / 2).toBeCloseTo(origin.left, 0);
        expect((centre.y / 100) * image.height - blockPx.height / 2).toBeCloseTo(origin.top, 0);
      }
    }
  });

  it("maps a pointer to whole percents of the image and clamps near the edges", () => {
    const rect = { left: 100, top: 50, width: 400, height: 200 };
    const block = { width: 20, height: 10 };
    expect(pointerToPlacement({ clientX: 300, clientY: 150 }, rect, block)).toEqual({
      x: 50,
      y: 50,
    });
    expect(pointerToPlacement({ clientX: 0, clientY: 0 }, rect, block)).toEqual({ x: 10, y: 5 });
    expect(pointerToPlacement({ clientX: 9999, clientY: 9999 }, rect, block)).toEqual({
      x: 90,
      y: 95,
    });
  });

  it("estimates one line for short text and more lines when the box is narrow", () => {
    const short = estimateBlockPercent(layout, image);
    expect(short.height).toBeCloseTo(((50 * 1.2) / 500) * 100);
    const long = estimateBlockPercent(
      {
        ...layout,
        text: "a long caption that will certainly wrap onto several lines",
        maxWidth: 30,
      },
      image,
    );
    expect(long.width).toBeCloseTo(30);
    expect(long.height).toBeGreaterThan(short.height * 2);
  });
});
