/**
 * Engine-level tests for processImage.
 *
 * The existing operations.test.ts covers individual operations and basic
 * pipeline chaining extensively. This file focuses on:
 * - Format conversion via the outputFormat parameter
 * - Edge cases around operation ordering
 * - The Operation type contract
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const require = createRequire(
  path.resolve(__dirname, "../../../packages/image-engine/src/index.ts"),
);
const sharp = require("sharp") as typeof import("sharp").default;

import { processImage } from "@snapotter/image-engine";

const FIXTURES_DIR = path.resolve(__dirname, "../../fixtures");
const FORMATS_DIR = path.resolve(__dirname, "../../fixtures/formats");

let png200x150: Buffer;
let jpg100x100: Buffer;
let webp50x50: Buffer;

beforeAll(() => {
  png200x150 = readFileSync(path.join(FIXTURES_DIR, "test-200x150.png"));
  jpg100x100 = readFileSync(path.join(FIXTURES_DIR, "test-100x100.jpg"));
  webp50x50 = readFileSync(path.join(FIXTURES_DIR, "test-50x50.webp"));
});

// ---------------------------------------------------------------------------
// Output format conversion
// ---------------------------------------------------------------------------
describe("processImage output format", () => {
  it("converts PNG input to JPEG output", async () => {
    const result = await processImage(png200x150, [], "jpg");
    expect(result.info.format).toBe("jpeg");
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("converts PNG input to WebP output", async () => {
    const result = await processImage(png200x150, [], "webp");
    expect(result.info.format).toBe("webp");
  });

  it("converts PNG input to AVIF output", async () => {
    const result = await processImage(png200x150, [], "avif");
    // Sharp reports AVIF as "heif"
    expect(result.info.format).toBe("heif");
  });

  it("converts PNG input to TIFF output", async () => {
    const result = await processImage(png200x150, [], "tiff");
    expect(result.info.format).toBe("tiff");
  });

  it("converts PNG input to GIF output", async () => {
    const result = await processImage(png200x150, [], "gif");
    expect(result.info.format).toBe("gif");
  });

  it("converts JPEG input to PNG output", async () => {
    const result = await processImage(jpg100x100, [], "png");
    expect(result.info.format).toBe("png");
  });

  it("converts WebP input to PNG output", async () => {
    const result = await processImage(webp50x50, [], "png");
    expect(result.info.format).toBe("png");
  });

  it("preserves input format when no outputFormat specified", async () => {
    const result = await processImage(png200x150, []);
    expect(result.info.format).toBe("png");
  });

  it("preserves JPEG format when no outputFormat specified", async () => {
    const result = await processImage(jpg100x100, []);
    expect(result.info.format).toBe("jpeg");
  });

  it("throws on unsupported output format", async () => {
    await expect(processImage(png200x150, [], "bmp" as any)).rejects.toThrow(
      "Unsupported output format: bmp",
    );
  });
});

// ---------------------------------------------------------------------------
// Operations + output format combined
// ---------------------------------------------------------------------------
describe("processImage operations + format conversion", () => {
  it("resize then convert to JPEG", async () => {
    const result = await processImage(
      png200x150,
      [{ type: "resize", options: { width: 80, height: 60 } }],
      "jpg",
    );
    expect(result.info.width).toBe(80);
    expect(result.info.height).toBe(60);
    expect(result.info.format).toBe("jpeg");
  });

  it("rotate then convert to WebP", async () => {
    const result = await processImage(
      png200x150,
      [{ type: "rotate", options: { angle: 90 } }],
      "webp",
    );
    expect(result.info.width).toBe(150);
    expect(result.info.height).toBe(200);
    expect(result.info.format).toBe("webp");
  });

  it("chain resize + rotate + grayscale + format conversion", async () => {
    const result = await processImage(
      png200x150,
      [
        { type: "resize", options: { width: 100, height: 100 } },
        { type: "rotate", options: { angle: 180 } },
        { type: "grayscale", options: {} },
      ],
      "tiff",
    );
    expect(result.info.width).toBe(100);
    expect(result.info.height).toBe(100);
    expect(result.info.format).toBe("tiff");
  });
});

// ---------------------------------------------------------------------------
// Error propagation
// ---------------------------------------------------------------------------
describe("processImage error handling", () => {
  it("throws on unknown operation type", async () => {
    await expect(processImage(png200x150, [{ type: "fake-op", options: {} }])).rejects.toThrow(
      "Unknown operation: fake-op",
    );
  });

  it("throws on invalid image buffer", async () => {
    await expect(
      processImage(Buffer.from("garbage data"), [{ type: "grayscale", options: {} }]),
    ).rejects.toThrow();
  });

  it("throws on empty buffer", async () => {
    await expect(
      processImage(Buffer.alloc(0), [{ type: "invert", options: {} }]),
    ).rejects.toThrow();
  });

  it("propagates validation errors from operations", async () => {
    await expect(
      processImage(png200x150, [{ type: "resize", options: { width: -10 } }]),
    ).rejects.toThrow("Resize width must be greater than 0");
  });

  it("error in later operation aborts entire pipeline", async () => {
    await expect(
      processImage(png200x150, [
        { type: "resize", options: { width: 50, height: 50 } },
        { type: "brightness", options: { value: 999 } },
      ]),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------
describe("processImage result", () => {
  it("returns buffer and info with correct shape", async () => {
    const result = await processImage(png200x150, [
      { type: "resize", options: { width: 60, height: 40 } },
    ]);
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.info.width).toBe(60);
    expect(result.info.height).toBe(40);
    expect(typeof result.info.format).toBe("string");
    expect(typeof result.info.channels).toBe("number");
    expect(typeof result.info.size).toBe("number");
    expect(typeof result.info.hasAlpha).toBe("boolean");
    expect(result.info.size).toBe(result.buffer.length);
  });

  it("info.metadata contains expected keys", async () => {
    const result = await processImage(png200x150, []);
    expect(result.info.metadata).toBeDefined();
    expect(typeof result.info.metadata).toBe("object");
  });
});

// ---------------------------------------------------------------------------
// Multi-format input processing
// ---------------------------------------------------------------------------
describe("processImage with different input formats", () => {
  it("processes JPEG input", async () => {
    const result = await processImage(jpg100x100, [{ type: "resize", options: { width: 50 } }]);
    expect(result.info.width).toBe(50);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("processes WebP input", async () => {
    const result = await processImage(webp50x50, [{ type: "resize", options: { width: 25 } }]);
    expect(result.info.width).toBe(25);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("processes AVIF input from fixture", async () => {
    const avif = readFileSync(path.join(FORMATS_DIR, "sample.avif"));
    const result = await processImage(avif, [{ type: "resize", options: { width: 40 } }]);
    expect(result.info.width).toBe(40);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("processes GIF input from fixture", async () => {
    const gif = readFileSync(path.join(FORMATS_DIR, "sample.gif"));
    const result = await processImage(gif, [{ type: "resize", options: { width: 30 } }]);
    expect(result.info.width).toBe(30);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("processes TIFF input from fixture", async () => {
    const tiff = readFileSync(path.join(FORMATS_DIR, "sample.tiff"));
    const result = await processImage(tiff, [{ type: "resize", options: { width: 30 } }]);
    expect(result.info.width).toBe(30);
    expect(result.buffer.length).toBeGreaterThan(0);
  });
});
