import { describe, expect, it } from "vitest";
import { samplePixelColor } from "@/components/editor/tools/eyedropper-sample";

// A flat-colour canvas that reads like a browser one: getImageData beyond the
// bitmap returns transparent black, which is what dragged the average dark near
// the document edge (#2102). The requested rects are kept so the tests can also
// pin that the sample never asks for pixels the document doesn't have.
function flatCanvas(width: number, height: number, rgb: [number, number, number]) {
  const requests: Array<{ x: number; y: number; w: number; h: number }> = [];
  const ctx = {
    canvas: { width, height },
    getImageData(x: number, y: number, w: number, h: number) {
      // A real canvas throws on an empty rect rather than returning no pixels.
      if (w <= 0 || h <= 0) throw new Error("IndexSizeError");
      requests.push({ x, y, w, h });
      const data = new Uint8ClampedArray(w * h * 4);
      for (let row = 0; row < h; row++) {
        for (let col = 0; col < w; col++) {
          const inside = x + col >= 0 && x + col < width && y + row >= 0 && y + row < height;
          if (!inside) continue;
          const i = (row * w + col) * 4;
          data[i] = rgb[0];
          data[i + 1] = rgb[1];
          data[i + 2] = rgb[2];
          data[i + 3] = 255;
        }
      }
      return { data, width: w, height: h };
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, requests };
}

const ORANGE: [number, number, number] = [255, 100, 50];

describe("samplePixelColor", () => {
  it.each([1, 3, 5] as const)("reads a flat colour in the middle at sample size %i", (size) => {
    const { ctx } = flatCanvas(20, 10, ORANGE);

    expect(samplePixelColor(ctx, 10, 5, size)).toBe("#ff6432");
  });

  it.each([
    ["the top-left corner", 0, 0],
    ["the bottom-right corner", 19, 9],
    ["the left edge", 0, 5],
    ["the top edge", 10, 0],
    ["one pixel in from the right edge", 18, 5],
  ])("keeps the flat colour at %s", (_label, x, y) => {
    for (const size of [3, 5] as const) {
      const { ctx } = flatCanvas(20, 10, ORANGE);

      expect(samplePixelColor(ctx, x, y, size), `size ${size}`).toBe("#ff6432");
    }
  });

  it.each([
    ["past the right edge", 20, 5],
    ["past the bottom edge", 10, 10],
    ["past the bottom-right corner", 20, 10],
  ])("still reads a pixel when the click lands %s of a truncated capture", (_label, x, y) => {
    // A cropped document can be 19.6 wide: the click at x = 19 passes the
    // document-size check, but the capture canvas is 19 wide.
    for (const size of [1, 3, 5] as const) {
      const { ctx } = flatCanvas(20, 10, ORANGE);

      expect(samplePixelColor(ctx, x, y, size), `size ${size}`).toBe("#ff6432");
    }
  });

  it("only asks for pixels inside the canvas", () => {
    const { ctx, requests } = flatCanvas(20, 10, ORANGE);

    samplePixelColor(ctx, 0, 0, 5);
    samplePixelColor(ctx, 19, 9, 5);

    expect(requests).toEqual([
      { x: 0, y: 0, w: 3, h: 3 },
      { x: 17, y: 7, w: 3, h: 3 },
    ]);
  });

  it("averages only the pixels it read", () => {
    // Left column black, the rest white: a 3x3 at x = 1 covers one black and two
    // white columns, and at x = 0 only the black one and one white column.
    const ctx = {
      canvas: { width: 4, height: 4 },
      getImageData(x: number, _y: number, w: number, h: number) {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let row = 0; row < h; row++) {
          for (let col = 0; col < w; col++) {
            const i = (row * w + col) * 4;
            const v = x + col === 0 ? 0 : 255;
            data[i] = v;
            data[i + 1] = v;
            data[i + 2] = v;
            data[i + 3] = 255;
          }
        }
        return { data, width: w, height: h };
      },
    } as unknown as CanvasRenderingContext2D;

    expect(samplePixelColor(ctx, 1, 2, 3)).toBe("#aaaaaa");
    expect(samplePixelColor(ctx, 0, 2, 3)).toBe("#808080");
  });
});

// An RGBA canvas whose pixel at (x, y) is given by `pixel`. getImageData over
// something transparent reads 0,0,0,0, which must not drag the colour toward black.
function pixelCanvas(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number, number],
) {
  return {
    canvas: { width, height },
    getImageData(x: number, y: number, w: number, h: number) {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let row = 0; row < h; row++) {
        for (let col = 0; col < w; col++) {
          data.set(pixel(x + col, y + row), (row * w + col) * 4);
        }
      }
      return { data, width: w, height: h };
    },
  } as unknown as CanvasRenderingContext2D;
}

describe("samplePixelColor with transparency", () => {
  it("averages only the opaque pixels beside a transparent area", () => {
    // One opaque white pixel at (5, 5) on an otherwise transparent canvas.
    const ctx = pixelCanvas(10, 10, (x, y) =>
      x === 5 && y === 5 ? [255, 255, 255, 255] : [0, 0, 0, 0],
    );

    expect(samplePixelColor(ctx, 5, 5, 3)).toBe("#ffffff");
    expect(samplePixelColor(ctx, 5, 5, 5)).toBe("#ffffff");
    // The neighbours see it too, and the transparent ones around it still add nothing.
    expect(samplePixelColor(ctx, 6, 5, 3)).toBe("#ffffff");
  });

  it("keeps the colour of a cutout's edge", () => {
    // Left half opaque orange, right half transparent.
    const ctx = pixelCanvas(10, 10, (x) => (x < 5 ? [255, 100, 50, 255] : [0, 0, 0, 0]));

    expect(samplePixelColor(ctx, 4, 5, 5)).toBe("#ff6432");
  });

  it("weights a semi-transparent pixel by its alpha", () => {
    // Opaque black beside 50% white: (0 * 255 + 255 * 128) / (255 + 128) = 85.
    const ctx = pixelCanvas(4, 1, (x) => (x === 0 ? [0, 0, 0, 255] : [255, 255, 255, 128]));

    expect(samplePixelColor(ctx, 0, 0, 3)).toBe("#555555");
  });

  it("is unchanged for a single pixel, opaque or not", () => {
    const ctx = pixelCanvas(4, 4, (x) =>
      x === 0 ? [255, 100, 50, 255] : x === 1 ? [255, 100, 50, 128] : [0, 0, 0, 0],
    );

    expect(samplePixelColor(ctx, 0, 0, 1)).toBe("#ff6432");
    expect(samplePixelColor(ctx, 1, 0, 1)).toBe("#ff6432");
    // A fully transparent pixel has no colour; it reads black, as it always did.
    expect(samplePixelColor(ctx, 3, 0, 1)).toBe("#000000");
  });

  it("reads black when nothing in the square is visible", () => {
    const ctx = pixelCanvas(6, 6, () => [0, 0, 0, 0]);

    expect(samplePixelColor(ctx, 3, 3, 5)).toBe("#000000");
  });
});
