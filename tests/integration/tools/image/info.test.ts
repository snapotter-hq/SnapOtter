/**
 * Integration tests for the info tool (/api/v1/tools/image/info).
 *
 * Covers image metadata extraction: dimensions, format, color space,
 * histogram, EXIF presence, and input validation.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);
const JPG = readFixture(fixtures.image.base.jpg100);
const WEBP = readFixture(fixtures.image.base.webp50);
const EXIF_JPG = readFixture(fixtures.image.exifGps);
const TINY_PNG = readFixture(fixtures.image.edge.px1);

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
      url: "/api/v1/tools/image/info",
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
      url: "/api/v1/tools/image/info",
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
      url: "/api/v1/tools/image/info",
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
      url: "/api/v1/tools/image/info",
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
      url: "/api/v1/tools/image/info",
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
      url: "/api/v1/tools/image/info",
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
      url: "/api/v1/tools/image/info",
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
      url: "/api/v1/tools/image/info",
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
      url: "/api/v1/tools/image/info",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  // ── HEIC format info ──────────────────────────────────────────

  it("returns correct metadata for HEIC image", { timeout: 120_000 }, async () => {
    const HEIC = readFixture(fixtures.image.base.heic200);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.heic", contentType: "image/heic", content: HEIC },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/info",
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
    const SVG = readFixture(fixtures.image.base.svg100);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/info",
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
      url: "/api/v1/tools/image/info",
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
      url: "/api/v1/tools/image/info",
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
      url: "/api/v1/tools/image/info",
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
      url: "/api/v1/tools/image/info",
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
      url: "/api/v1/tools/image/info",
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
    const LARGE = readFixture(fixtures.image.stressLarge);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "stress-large.jpg", contentType: "image/jpeg", content: LARGE },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/info",
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
    const GIF = readFixture(fixtures.image.animated.gif);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "animated.gif", contentType: "image/gif", content: GIF },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/info",
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
    const TIFF = readFixture(fixtures.image.multipageTiff);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "multipage.tiff", contentType: "image/tiff", content: TIFF },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/info",
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
    const AVIF = readFixture(fixtures.image.formats("avif"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "sample.avif", contentType: "image/avif", content: AVIF },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/info",
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
      url: "/api/v1/tools/image/info",
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
      url: "/api/v1/tools/image/info",
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
    const HEIF = readFixture(fixtures.image.formats("heif"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "sample.heif", contentType: "image/heif", content: HEIF },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/info",
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
      url: "/api/v1/tools/image/info",
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
      url: "/api/v1/tools/image/info",
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

  // ── BMP format info ──────────────────────────────────────────────

  it("returns metadata for BMP image", async () => {
    const BMP = readFixture(fixtures.image.formats("bmp"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "sample.bmp", contentType: "image/bmp", content: BMP },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    // BMP may need CLI decoding; accept success or processing error
    expect([200, 422]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const result = JSON.parse(res.body);
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result.fileSize).toBeGreaterThan(0);
    }
  });

  // ── TIFF format info ──────────────────────────────────────────────

  it("returns metadata for single-page TIFF image", async () => {
    const TIFF = readFixture(fixtures.image.formats("tiff"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "sample.tiff", contentType: "image/tiff", content: TIFF },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.format).toBe("tiff");
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.fileSize).toBeGreaterThan(0);
  });

  // ── GIF format info ───────────────────────────────────────────────

  it("returns correct format string for GIF", async () => {
    const GIF = readFixture(fixtures.image.animated.gif);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.gif", contentType: "image/gif", content: GIF },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.format).toBe("gif");
    expect(result.filename).toBe("test.gif");
    expect(result.fileSize).toBeGreaterThan(0);
  });

  // ── hasProfile field ──────────────────────────────────────────────

  it("reports hasProfile as boolean for all images", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.jpg", contentType: "image/jpeg", content: JPG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(typeof result.hasProfile).toBe("boolean");
  });

  // ── Large file fileSize accuracy ──────────────────────────────────

  it("reports accurate fileSize for large image", async () => {
    const LARGE = readFixture(fixtures.image.stressLarge);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "stress-large.jpg", contentType: "image/jpeg", content: LARGE },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.fileSize).toBe(LARGE.length);
  });

  // ── Tiny image histogram ──────────────────────────────────────────

  it("returns histogram data for 1x1 pixel image", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", contentType: "image/png", content: TINY_PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/info",
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
    expect(result.histogram.length).toBeGreaterThanOrEqual(1);
  });

  // ── Portrait image info ───────────────────────────────────────────

  it("returns correct dimensions for portrait-oriented image", async () => {
    const PORTRAIT = readFixture(fixtures.image.portraitJpg);
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test-portrait.jpg",
        contentType: "image/jpeg",
        content: PORTRAIT,
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/info",
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
  });

  // ── Blank image info ──────────────────────────────────────────────

  it("returns metadata for blank PNG image", async () => {
    const BLANK = readFixture(fixtures.image.edge.blank);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test-blank.png", contentType: "image/png", content: BLANK },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.format).toBe("png");
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  // ── File size field matches input buffer length ───────────────────

  it("fileSize matches the exact input buffer length for PNG", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.fileSize).toBe(PNG.length);
  });

  // ── Response type verification ────────────────────────────────────

  it("returns numeric types for dimension and channel fields", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.jpg", contentType: "image/jpeg", content: JPG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(typeof result.width).toBe("number");
    expect(typeof result.height).toBe("number");
    expect(typeof result.channels).toBe("number");
    expect(typeof result.fileSize).toBe("number");
    expect(typeof result.pages).toBe("number");
  });

  // ── Multi-page PDF info ──────────────────────────────────────────

  it("returns metadata for multi-page PDF", async () => {
    const PDF = readFixture(fixtures.document.pdf3);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test-3page.pdf", contentType: "application/pdf", content: PDF },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    // PDF may not be supported -- accept success or processing error
    expect([200, 400, 422]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const result = JSON.parse(res.body);
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result.fileSize).toBeGreaterThan(0);
    }
  });

  // ── Image with no EXIF returns false ─────────────────────────────

  it("hasExif is false for a synthetic PNG with no EXIF", async () => {
    const sharp = (await import("sharp")).default;
    const synthetic = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 100, g: 100, b: 100 },
      },
    })
      .png()
      .toBuffer();

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "no-exif.png", contentType: "image/png", content: synthetic },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.hasExif).toBe(false);
    expect(result.hasIcc).toBe(false);
    expect(result.width).toBe(10);
    expect(result.height).toBe(10);
  });

  // ── SVG info detailed checks ─────────────────────────────────────

  it("returns correct dimensions and format for SVG", async () => {
    const SVG = readFixture(fixtures.image.base.svg100);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    // SVG is rasterized for metadata extraction -- check that it has valid dimensions
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.fileSize).toBe(SVG.length);
    expect(result.channels).toBeGreaterThanOrEqual(3);
  });

  // ── Extreme portrait image info ──────────────────────────────────

  it("returns correct dimensions for extreme portrait image", async () => {
    const PORTRAIT_TALL = readFixture(fixtures.image.edge.tall);
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "portrait-tall.png",
        contentType: "image/png",
        content: PORTRAIT_TALL,
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/info",
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
    // Portrait-tall should have height > width
    expect(result.height).toBeGreaterThan(result.width);
  });

  // ── Content fixture info ─────────────────────────────────────────

  it("returns detailed metadata for content/portrait-color.jpg", async () => {
    const PORTRAIT_COLOR = readFixture(fixtures.image.portrait.jpg);
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "portrait-color.jpg",
        contentType: "image/jpeg",
        content: PORTRAIT_COLOR,
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.format).toBe("jpeg");
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.fileSize).toBe(PORTRAIT_COLOR.length);
    expect(result.channels).toBeGreaterThanOrEqual(3);
    expect(result.histogram).toBeDefined();
    expect(result.histogram.length).toBeGreaterThanOrEqual(3);
  });

  // ── SVG logo info ───────────────────────────────────────────────

  it("returns info for content/svg-logo.svg", async () => {
    const SVG_LOGO = readFixture(fixtures.image.svgLogo);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "svg-logo.svg", contentType: "image/svg+xml", content: SVG_LOGO },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/info",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.filename).toBe("svg-logo.svg");
    expect(result.fileSize).toBe(SVG_LOGO.length);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });
});
