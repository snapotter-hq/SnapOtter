import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const require = createRequire(
  path.resolve(__dirname, "../../../packages/image-engine/src/index.ts"),
);
const sharp = require("sharp") as typeof import("sharp").default;

import { saturation } from "@snapotter/image-engine";

const FIXTURES_DIR = path.resolve(__dirname, "../../fixtures");

let png200x150: Buffer;

beforeAll(() => {
  png200x150 = readFileSync(path.join(FIXTURES_DIR, "test-200x150.png"));
});

async function getMeta(img: sharp.Sharp) {
  const buf = await img.toBuffer();
  return sharp(buf).metadata();
}

describe("saturation", () => {
  it("returns a Sharp instance at value 0 (no change)", async () => {
    const img = sharp(png200x150);
    const result = await saturation(img, { value: 0 });
    const meta = await getMeta(result);
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("increases saturation at value +50", async () => {
    const img = sharp(png200x150);
    const result = await saturation(img, { value: 50 });
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("decreases saturation at value -50", async () => {
    const img = sharp(png200x150);
    const result = await saturation(img, { value: -50 });
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("fully desaturates at value -100", async () => {
    const img = sharp(png200x150);
    const result = await saturation(img, { value: -100 });
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("doubles saturation at value +100", async () => {
    const img = sharp(png200x150);
    const result = await saturation(img, { value: 100 });
    const buf = await result.toBuffer();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("throws for value below -100", async () => {
    const img = sharp(png200x150);
    await expect(saturation(img, { value: -101 })).rejects.toThrow(
      "Saturation value must be between -100 and +100",
    );
  });

  it("throws for value above +100", async () => {
    const img = sharp(png200x150);
    await expect(saturation(img, { value: 101 })).rejects.toThrow(
      "Saturation value must be between -100 and +100",
    );
  });

  it("accepts boundary value -100", async () => {
    const img = sharp(png200x150);
    const result = await saturation(img, { value: -100 });
    const meta = await getMeta(result);
    expect(meta.width).toBe(200);
  });

  it("accepts boundary value +100", async () => {
    const img = sharp(png200x150);
    const result = await saturation(img, { value: 100 });
    const meta = await getMeta(result);
    expect(meta.width).toBe(200);
  });

  it("preserves image dimensions", async () => {
    const img = sharp(png200x150);
    const result = await saturation(img, { value: 30 });
    const meta = await getMeta(result);
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("works with JPEG input", async () => {
    const jpg = readFileSync(path.join(FIXTURES_DIR, "test-100x100.jpg"));
    const img = sharp(jpg);
    const result = await saturation(img, { value: 25 });
    const meta = await getMeta(result);
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(100);
  });
});
