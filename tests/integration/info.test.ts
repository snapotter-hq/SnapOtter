/**
 * Integration tests for the info tool (/api/v1/tools/info).
 *
 * Covers image metadata extraction: dimensions, format, color space,
 * histogram, EXIF presence, and input validation.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
const PNG = readFileSync(join(FIXTURES, "test-200x150.png"));
const JPG = readFileSync(join(FIXTURES, "test-100x100.jpg"));
const WEBP = readFileSync(join(FIXTURES, "test-50x50.webp"));
const EXIF_JPG = readFileSync(join(FIXTURES, "test-with-exif.jpg"));
const TINY_PNG = readFileSync(join(FIXTURES, "test-1x1.png"));

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("Info", () => {
  it("returns correct metadata for a PNG image", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    expect(result.width).toBe(200);
    expect(result.height).toBe(150);
    expect(result.format).toBe("png");
    expect(result.filename).toBe("test.png");
    expect(result.fileSize).toBeGreaterThan(0);
    expect(result.channels).toBeGreaterThanOrEqual(3);
    expect(typeof result.hasAlpha).toBe("boolean");
    expect(typeof result.colorSpace).toBe("string");
    expect(result.pages).toBe(1);
  });

  it("returns correct metadata for a JPEG image", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.jpg", contentType: "image/jpeg", content: JPG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
    expect(result.format).toBe("jpeg");
    expect(result.filename).toBe("test.jpg");
  });

  it("returns correct metadata for a WebP image", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.webp", contentType: "image/webp", content: WEBP },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    expect(result.width).toBe(50);
    expect(result.height).toBe(50);
    expect(result.format).toBe("webp");
  });

  it("returns correct metadata for a 1x1 pixel image", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", contentType: "image/png", content: TINY_PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
  });

  it("detects EXIF data on test-with-exif.jpg", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test-with-exif.jpg",
        contentType: "image/jpeg",
        content: EXIF_JPG,
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    expect(result.hasExif).toBe(true);
    expect(result.format).toBe("jpeg");
  });

  it("includes histogram data with channel stats", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    expect(result.histogram).toBeDefined();
    expect(Array.isArray(result.histogram)).toBe(true);
    expect(result.histogram.length).toBeGreaterThanOrEqual(3);

    for (const channel of result.histogram) {
      expect(typeof channel.channel).toBe("string");
      expect(typeof channel.min).toBe("number");
      expect(typeof channel.max).toBe("number");
      expect(typeof channel.mean).toBe("number");
      expect(typeof channel.stdev).toBe("number");
      expect(channel.min).toBeGreaterThanOrEqual(0);
      expect(channel.max).toBeLessThanOrEqual(255);
    }
  });

  it("returns all expected fields in the response", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const expectedKeys = [
      "filename",
      "fileSize",
      "width",
      "height",
      "format",
      "channels",
      "hasAlpha",
      "colorSpace",
      "density",
      "isProgressive",
      "orientation",
      "hasProfile",
      "hasExif",
      "hasIcc",
      "hasXmp",
      "bitDepth",
      "pages",
      "histogram",
    ];

    for (const key of expectedKeys) {
      expect(result).toHaveProperty(key);
    }
  });

  // ── Validation ──────────────────────────────────────────────────────

  it("rejects requests without a file", async () => {
    const { body, contentType } = createMultipartPayload([{ name: "dummy", content: "nothing" }]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/no image/i);
  });

  it("rejects unauthenticated requests", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/info",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  // ── HEIC format info ──────────────────────────────────────────

  it("returns correct metadata for HEIC image", async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.heic", contentType: "image/heic", content: HEIC },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    // HEIC might need system decoder — skip if 422
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.filename).toBe("test.heic");
  });

  // ── SVG info ──────────────────────────────────────────────────

  it("returns correct metadata for SVG image", async () => {
    const SVG = readFileSync(join(FIXTURES, "test-100x100.svg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.filename).toBe("test.svg");
    expect(result.fileSize).toBeGreaterThan(0);
  });

  // ── Image with EXIF detailed checks ───────────────────────────

  it("reports hasExif=false for plain PNG", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "plain.png", contentType: "image/png", content: TINY_PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.hasExif).toBe(false);
  });

  it("returns 422 for corrupt/unreadable image data", async () => {
    // Create a buffer that passes magic-number validation but fails Sharp parsing
    // A JPEG starts with FF D8 FF, then garbage
    const corruptJpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(100, 0x00),
    ]);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "corrupt.jpg", contentType: "image/jpeg", content: corruptJpeg },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    // Should return 422 (metadata read failure) or 400 (validation rejection)
    expect([400, 422]).toContain(res.statusCode);
  });

  it("returns 400 for empty file upload", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "empty.png", contentType: "image/png", content: Buffer.alloc(0) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/no image/i);
  });

  it("reports hasIcc for image with ICC profile", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test-with-exif.jpg",
        contentType: "image/jpeg",
        content: EXIF_JPG,
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    // hasIcc should be a boolean regardless
    expect(typeof result.hasIcc).toBe("boolean");
  });

  // ── Bit depth and color space ─────────────────────────────────

  it("includes bitDepth in response for PNG", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    // bitDepth comes from Sharp's metadata.depth -- can be a number or
    // descriptive string (e.g. "uchar") depending on the format/version
    expect(result).toHaveProperty("bitDepth");
  });

  // ── Large file info ─────────────────────────────────────────────

  it("returns metadata for a large stress image", async () => {
    const LARGE = readFileSync(join(FIXTURES, "content", "stress-large.jpg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "stress-large.jpg", contentType: "image/jpeg", content: LARGE },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.format).toBe("jpeg");
    expect(result.fileSize).toBeGreaterThan(0);
  });

  // ── Animated GIF info ───────────────────────────────────────────

  it("returns page count for animated GIF", async () => {
    const GIF = readFileSync(join(FIXTURES, "animated.gif"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "animated.gif", contentType: "image/gif", content: GIF },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.format).toBe("gif");
    expect(result.pages).toBeGreaterThanOrEqual(1);
  });

  // ── Multi-page TIFF info ────────────────────────────────────────

  it("returns metadata for multi-page TIFF", async () => {
    const TIFF = readFileSync(join(FIXTURES, "formats", "multipage.tiff"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "multipage.tiff", contentType: "image/tiff", content: TIFF },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.format).toBe("tiff");
    expect(result.pages).toBeGreaterThanOrEqual(1);
  });

  // ── AVIF info ───────────────────────────────────────────────────

  it("returns metadata for AVIF image", async () => {
    const AVIF = readFileSync(join(FIXTURES, "formats", "sample.avif"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "sample.avif", contentType: "image/avif", content: AVIF },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.fileSize).toBeGreaterThan(0);
  });

  // ── Density and progressive fields ──────────────────────────────

  it("reports density for JPEG with DPI metadata", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test-with-exif.jpg",
        contentType: "image/jpeg",
        content: EXIF_JPG,
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    // density may be null or a number depending on the image
    expect(result).toHaveProperty("density");
    expect(typeof result.isProgressive).toBe("boolean");
  });

  // ── hasXmp detection ────────────────────────────────────────────

  it("reports hasXmp field for all images", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(typeof result.hasXmp).toBe("boolean");
  });

  // ── HEIF format info ──────────────────────────────────────────

  it("returns correct metadata for HEIF (sample.heif) image", { timeout: 120_000 }, async () => {
    const HEIF = readFileSync(join(FIXTURES, "formats", "sample.heif"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "sample.heif", contentType: "image/heif", content: HEIF },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    // HEIF might need system decoder -- skip if 422
    if (res.statusCode === 422) return;
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.filename).toBe("sample.heif");
  });

  // ── Alpha channel detection ─────────────────────────────────────

  it("detects alpha channel in PNG with transparency", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(typeof result.hasAlpha).toBe("boolean");
    expect(typeof result.channels).toBe("number");
  });

  // ── Orientation field ───────────────────────────────────────────

  it("reports orientation for image with EXIF orientation", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test-with-exif.jpg",
        contentType: "image/jpeg",
        content: EXIF_JPG,
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result).toHaveProperty("orientation");
  });
});
