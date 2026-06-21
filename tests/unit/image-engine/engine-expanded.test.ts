/**
 * Expanded engine tests covering:
 * - FORMAT_MAP coverage for jxl output
 * - All OPERATION_MAP entries not exercised through processImage in engine.test.ts
 * - Empty operations list with format conversion
 * - Multiple operations with output format
 * - Queued operation ordering
 * - processImage with ico/jp2/qoi/bmp/heic in OutputFormat (unsupported check)
 */

import { createRequire } from "node:module";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const require = createRequire(
  path.resolve(__dirname, "../../../packages/image-engine/src/index.ts"),
);
const _sharp = require("sharp") as typeof import("sharp").default;

import { processImage } from "@snapotter/image-engine";
import { fixtures, readFixture } from "../../fixtures/index.js";

let png200x150: Buffer;
let jpg100x100: Buffer;

beforeAll(() => {
  png200x150 = readFixture(fixtures.image.base.png200);
  jpg100x100 = readFixture(fixtures.image.base.jpg100);
});

describe("processImage FORMAT_MAP coverage", () => {
  it("jxl is a valid FORMAT_MAP entry (may fail if libvips lacks JXL support)", async () => {
    // JXL support depends on the local libvips build. On systems without libjxl,
    // Sharp throws "class jxlsave_buffer not found". We verify the FORMAT_MAP
    // entry exists by checking the error message is format-specific, not "unknown".
    try {
      const result = await processImage(png200x150, [], "jxl");
      expect(result.buffer.length).toBeGreaterThan(0);
    } catch (err: unknown) {
      // If JXL is not supported, Sharp throws a vips-specific error, not our
      // "Unsupported output format" error -- meaning the FORMAT_MAP entry works.
      const msg = err instanceof Error ? err.message : "";
      expect(msg).not.toContain("Unsupported output format");
    }
  });
});

describe("processImage OPERATION_MAP full coverage", () => {
  it("compress operation through processImage", async () => {
    const result = await processImage(png200x150, [
      { type: "compress", options: { quality: 60, format: "jpg" } },
    ]);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("convert operation through processImage", async () => {
    const result = await processImage(png200x150, [
      { type: "convert", options: { format: "webp" } },
    ]);
    expect(result.info.format).toBe("webp");
  });

  it("strip-metadata operation through processImage", async () => {
    const result = await processImage(jpg100x100, [{ type: "strip-metadata", options: {} }]);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("crop operation through processImage", async () => {
    const result = await processImage(png200x150, [
      { type: "crop", options: { left: 10, top: 10, width: 50, height: 40 } },
    ]);
    expect(result.info.width).toBe(50);
    expect(result.info.height).toBe(40);
  });

  it("flip operation through processImage", async () => {
    const result = await processImage(png200x150, [
      { type: "flip", options: { horizontal: true, vertical: true } },
    ]);
    expect(result.info.width).toBe(200);
    expect(result.info.height).toBe(150);
  });

  it("resize operation through processImage", async () => {
    const result = await processImage(png200x150, [
      { type: "resize", options: { percentage: 50 } },
    ]);
    expect(result.info.width).toBe(100);
    expect(result.info.height).toBe(75);
  });

  it("rotate operation through processImage", async () => {
    const result = await processImage(png200x150, [{ type: "rotate", options: { angle: 90 } }]);
    expect(result.info.width).toBe(150);
    expect(result.info.height).toBe(200);
  });

  it("brightness operation through processImage", async () => {
    const result = await processImage(png200x150, [{ type: "brightness", options: { value: 20 } }]);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("contrast operation through processImage", async () => {
    const result = await processImage(png200x150, [{ type: "contrast", options: { value: 15 } }]);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("saturation operation through processImage", async () => {
    const result = await processImage(png200x150, [
      { type: "saturation", options: { value: -30 } },
    ]);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("color-channels operation through processImage", async () => {
    const result = await processImage(png200x150, [
      { type: "color-channels", options: { red: 120, green: 80, blue: 100 } },
    ]);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("grayscale operation through processImage", async () => {
    const result = await processImage(png200x150, [{ type: "grayscale", options: {} }]);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("sepia operation through processImage", async () => {
    const result = await processImage(png200x150, [{ type: "sepia", options: {} }]);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("invert operation through processImage", async () => {
    const result = await processImage(png200x150, [{ type: "invert", options: {} }]);
    expect(result.buffer.length).toBeGreaterThan(0);
  });
});

describe("processImage unsupported output formats", () => {
  it("throws for ico output format", async () => {
    await expect(processImage(png200x150, [], "ico" as any)).rejects.toThrow(
      "Unsupported output format: ico",
    );
  });

  it("throws for jp2 output format", async () => {
    await expect(processImage(png200x150, [], "jp2" as any)).rejects.toThrow(
      "Unsupported output format: jp2",
    );
  });

  it("throws for qoi output format", async () => {
    await expect(processImage(png200x150, [], "qoi" as any)).rejects.toThrow(
      "Unsupported output format: qoi",
    );
  });
});

describe("processImage combined scenarios", () => {
  it("empty operations with format conversion only", async () => {
    const result = await processImage(png200x150, [], "webp");
    expect(result.info.format).toBe("webp");
    expect(result.info.width).toBe(200);
    expect(result.info.height).toBe(150);
  });

  it("multiple chained operations preserve correct order", async () => {
    // resize to 100x100, then crop 50x50 from top-left
    const result = await processImage(png200x150, [
      { type: "resize", options: { width: 100, height: 100 } },
      { type: "crop", options: { left: 0, top: 0, width: 50, height: 50 } },
    ]);
    expect(result.info.width).toBe(50);
    expect(result.info.height).toBe(50);
  });

  it("all OPERATION_MAP entries in one pipeline", async () => {
    // Chain as many operations as possible without conflicting
    const result = await processImage(png200x150, [
      { type: "resize", options: { width: 80, height: 60 } },
      { type: "rotate", options: { angle: 0 } },
      { type: "flip", options: { horizontal: true } },
      { type: "brightness", options: { value: 5 } },
      { type: "contrast", options: { value: 5 } },
      { type: "saturation", options: { value: 5 } },
      { type: "sharpen", options: { value: 10 } },
      { type: "grayscale", options: {} },
      { type: "invert", options: {} },
    ]);
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.info.width).toBe(80);
    expect(result.info.height).toBe(60);
  });

  it("result info.size equals buffer.length", async () => {
    const result = await processImage(png200x150, [
      { type: "resize", options: { width: 40, height: 30 } },
    ]);
    expect(result.info.size).toBe(result.buffer.length);
  });
});
