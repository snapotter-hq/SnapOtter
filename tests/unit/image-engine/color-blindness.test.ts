import type { ColorBlindnessType } from "@snapotter/image-engine";
import { COLOR_BLINDNESS_MATRICES, colorBlindness } from "@snapotter/image-engine";
import sharp, { type Sharp } from "sharp";
import { describe, expect, it } from "vitest";

const ALL_TYPES: ColorBlindnessType[] = [
  "protanopia",
  "deuteranopia",
  "tritanopia",
  "protanomaly",
  "deuteranomaly",
  "tritanomaly",
  "achromatopsia",
  "blueConeMonochromacy",
];

function makeColorImage(r: number, g: number, b: number): Sharp {
  return sharp({
    create: { width: 10, height: 10, channels: 3, background: { r, g, b } },
  }).png();
}

describe("Color blindness matrices", () => {
  it("all 8 types have a valid 3x3 matrix", () => {
    for (const type of ALL_TYPES) {
      const matrix = COLOR_BLINDNESS_MATRICES[type];
      expect(matrix).toBeDefined();
      expect(matrix).toHaveLength(3);
      for (const row of matrix) {
        expect(row).toHaveLength(3);
        for (const val of row) {
          expect(Number.isFinite(val)).toBe(true);
        }
      }
    }
  });

  it("matrix row sums are in a reasonable range (0 to 1.5)", () => {
    for (const type of ALL_TYPES) {
      const matrix = COLOR_BLINDNESS_MATRICES[type];
      for (const row of matrix) {
        const sum = row[0] + row[1] + row[2];
        expect(sum).toBeGreaterThanOrEqual(0);
        expect(sum).toBeLessThanOrEqual(1.5);
      }
    }
  });
});

describe("colorBlindness operation", () => {
  it("returns a Sharp instance for each type", async () => {
    for (const type of ALL_TYPES) {
      const result = await colorBlindness(makeColorImage(255, 0, 0), { type });
      const buf = await result.toBuffer();
      expect(buf.length).toBeGreaterThan(0);
    }
  });

  it("different types produce different outputs on a red image", async () => {
    const outputs = new Map<string, Buffer>();
    for (const type of ALL_TYPES) {
      const result = await colorBlindness(makeColorImage(255, 0, 0), { type });
      const { data } = await result.removeAlpha().raw().toBuffer({ resolveWithObject: true });
      outputs.set(type, Buffer.from(data));
    }
    const uniqueOutputs = new Set([...outputs.values()].map((b) => `${b[0]},${b[1]},${b[2]}`));
    expect(uniqueOutputs.size).toBeGreaterThan(1);
  });

  it("achromatopsia produces grayscale output (R === G === B)", async () => {
    const result = await colorBlindness(makeColorImage(255, 0, 0), {
      type: "achromatopsia",
    });
    const { data } = await result.removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBe(data[1]);
    expect(data[1]).toBe(data[2]);
  });

  it("preserves image dimensions", async () => {
    const result = await colorBlindness(makeColorImage(100, 150, 200), {
      type: "deuteranomaly",
    });
    const meta = await result.metadata();
    expect(meta.width).toBe(10);
    expect(meta.height).toBe(10);
  });
});
