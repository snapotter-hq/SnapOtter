/**
 * windowMax is the square-window max transparency-fixer's defringe uses to
 * find the peak alpha and the nearest background within the blur's reach
 * (#1178). It must match a direct scan exactly, including at image edges,
 * on one-pixel lines and when the window is larger than the image.
 */

import { describe, expect, it } from "vitest";
import { windowMax } from "../../../apps/api/src/lib/window-max.js";

function bruteWindowMax(values: Uint8Array, width: number, height: number, radius: number) {
  const result = new Uint8Array(values.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let peak = 0;
      for (let wy = Math.max(0, y - radius); wy <= Math.min(height - 1, y + radius); wy++) {
        for (let wx = Math.max(0, x - radius); wx <= Math.min(width - 1, x + radius); wx++) {
          peak = Math.max(peak, values[wy * width + wx]);
        }
      }
      result[y * width + x] = peak;
    }
  }
  return result;
}

/** Deterministic pseudo-random bytes, so a failure reproduces. */
function noise(length: number, seed: number): Uint8Array {
  const values = new Uint8Array(length);
  let state = seed;
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    values[i] = state & 0xff;
  }
  return values;
}

describe("windowMax", () => {
  it.each([
    { width: 1, height: 1, radius: 3 },
    { width: 1, height: 23, radius: 2 },
    { width: 23, height: 1, radius: 2 },
    { width: 5, height: 23, radius: 4 },
    { width: 23, height: 5, radius: 4 },
    { width: 17, height: 13, radius: 0 },
    { width: 17, height: 13, radius: 1 },
    { width: 17, height: 13, radius: 8 },
    { width: 6, height: 4, radius: 11 },
  ])("matches a direct scan at $width x $height, radius $radius", ({ width, height, radius }) => {
    for (let seed = 1; seed <= 5; seed++) {
      const values = noise(width * height, seed);
      expect(windowMax(values, width, height, radius)).toEqual(
        bruteWindowMax(values, width, height, radius),
      );
    }
  });

  it("spreads a single bright pixel into exactly its window", () => {
    const width = 9;
    const height = 7;
    const values = new Uint8Array(width * height);
    values[3 * width + 4] = 200;

    const result = windowMax(values, width, height, 2);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const inWindow = Math.abs(x - 4) <= 2 && Math.abs(y - 3) <= 2;
        expect(result[y * width + x], `(${x}, ${y})`).toBe(inWindow ? 200 : 0);
      }
    }
  });

  it("leaves its input untouched", () => {
    const values = noise(15 * 11, 7);
    const before = Uint8Array.from(values);
    windowMax(values, 15, 11, 3);
    expect(values).toEqual(before);
  });
});
