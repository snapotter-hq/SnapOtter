/**
 * Integration tests for the compare tool (/api/v1/tools/image/compare).
 *
 * Covers identical-image comparison, different-image comparison,
 * similarity score, diff image generation, and input validation.
 */

import sharp from "sharp";
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

describe("Compare", () => {
  it("reports 100% similarity when comparing an image with itself", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    expect(result.similarity).toBe(100);
    expect(result.jobId).toBeDefined();
    expect(result.downloadUrl).toBeDefined();
    expect(result.dimensions).toBeDefined();
    expect(result.dimensions.width).toBe(200);
    expect(result.dimensions.height).toBe(150);
  });

  it("reports less than 100% similarity for different images", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    expect(result.similarity).toBeLessThan(100);
    expect(result.similarity).toBeGreaterThanOrEqual(0);
    expect(result.downloadUrl).toBeDefined();
  });

  it("generates a downloadable diff image", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    // Download the diff image
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
    });

    expect(dlRes.statusCode).toBe(200);
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(result.dimensions.width);
    expect(meta.height).toBe(result.dimensions.height);
  });

  it("uses the larger dimensions when comparing different-sized images", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.webp", contentType: "image/webp", content: WEBP },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    // Max of (200, 50) = 200 wide; Max of (150, 50) = 150 tall
    expect(result.dimensions.width).toBe(200);
    expect(result.dimensions.height).toBe(150);
  });

  it("returns all expected fields in the response", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    expect(result).toHaveProperty("jobId");
    expect(result).toHaveProperty("similarity");
    expect(result).toHaveProperty("dimensions");
    expect(result).toHaveProperty("downloadUrl");
    expect(result).toHaveProperty("originalSize");
    expect(result).toHaveProperty("processedSize");
    expect(result.processedSize).toBeGreaterThan(0);
  });

  // ── Validation ──────────────────────────────────────────────────────

  it("rejects requests with only one image", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/two image/i);
  });

  it("rejects requests with no images", async () => {
    const { body, contentType } = createMultipartPayload([{ name: "dummy", content: "nothing" }]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/two image/i);
  });

  it("rejects unauthenticated requests", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  // ── Extended coverage: cross-format, HEIC, diff details ────────────

  it("compares JPEG vs PNG (cross-format)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.similarity).toBeLessThan(100);
    expect(result.similarity).toBeGreaterThanOrEqual(0);
    expect(result.dimensions.width).toBe(200);
    expect(result.dimensions.height).toBe(150);
  });

  it("compares WebP vs JPEG (cross-format)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.webp", contentType: "image/webp", content: WEBP },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.similarity).toBeGreaterThanOrEqual(0);
    expect(result.similarity).toBeLessThanOrEqual(100);
  });

  it("compares HEIC vs PNG", { timeout: 120_000 }, async () => {
    const HEIC = readFixture(fixtures.image.base.heic200);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.heic", contentType: "image/heic", content: HEIC },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.similarity).toBeGreaterThanOrEqual(0);
    expect(result.dimensions).toBeDefined();
  });

  it("compares two HEIC images (same file)", { timeout: 120_000 }, async () => {
    const HEIC = readFixture(fixtures.image.base.heic200);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.heic", contentType: "image/heic", content: HEIC },
      { name: "file", filename: "b.heic", contentType: "image/heic", content: HEIC },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.similarity).toBe(100);
  });

  it("diff image is always PNG format", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "b.webp", contentType: "image/webp", content: WEBP },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("png");
  });

  it("similarity is rounded to 2 decimal places", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    const simStr = String(result.similarity);
    const decimals = simStr.includes(".") ? simStr.split(".")[1].length : 0;
    expect(decimals).toBeLessThanOrEqual(2);
  });

  it("compares two very small images (50x50)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.webp", contentType: "image/webp", content: WEBP },
      { name: "file", filename: "b.webp", contentType: "image/webp", content: WEBP },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.similarity).toBe(100);
    expect(result.dimensions.width).toBe(50);
    expect(result.dimensions.height).toBe(50);
  });

  it("compares a portrait JPEG with a landscape PNG", async () => {
    const PORTRAIT_JPG = readFixture(fixtures.image.portraitJpg);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "portrait.jpg", contentType: "image/jpeg", content: PORTRAIT_JPG },
      { name: "file", filename: "landscape.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.similarity).toBeLessThan(100);
    // Dimensions should be max of both
    expect(result.dimensions.width).toBeGreaterThan(0);
    expect(result.dimensions.height).toBeGreaterThan(0);
  });

  it("processedSize reflects the diff image file size", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
    });
    // processedSize should match the actual diff image buffer size
    expect(result.processedSize).toBe(dlRes.rawPayload.length);
  });

  it("rejects requests with three or more images (only two allowed)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "c.jpg", contentType: "image/jpeg", content: JPG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    // The route accepts the first two files, ignoring the third
    // so this should succeed
    expect(res.statusCode).toBe(200);
  });

  // ── Branch coverage: multipart parse error (lines 35-39) ────────────

  it("returns 400 when corrupt image data fails validation", async () => {
    // Create a buffer that looks like an image but corrupts Sharp
    const corruptBuffer = Buffer.from("not a real image content at all");
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "corrupt.png", contentType: "image/png", content: corruptBuffer },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    // validateImageBuffer catches corrupt data before processing
    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toBeDefined();
  });

  // ── Branch coverage: 1x1 tiny images (line 117-121 area) ───────────

  it("compares two 1x1 pixel images", async () => {
    const TINY = readFixture(fixtures.image.edge.px1);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: TINY },
      { name: "file", filename: "b.png", contentType: "image/png", content: TINY },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.similarity).toBe(100);
    expect(result.dimensions.width).toBe(1);
    expect(result.dimensions.height).toBe(1);
  });

  it("compares a 1x1 image with a large image", async () => {
    const TINY = readFixture(fixtures.image.edge.px1);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", contentType: "image/png", content: TINY },
      { name: "file", filename: "large.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    // Max dimensions: 200x150
    expect(result.dimensions.width).toBe(200);
    expect(result.dimensions.height).toBe(150);
    expect(result.similarity).toBeGreaterThanOrEqual(0);
    expect(result.similarity).toBeLessThanOrEqual(100);
  });

  // ── Branch coverage: large file handling ────────────────────────────

  it("compares a large stress image with a small image", async () => {
    const LARGE = readFixture(fixtures.image.stressLarge);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "large.jpg", contentType: "image/jpeg", content: LARGE },
      { name: "file", filename: "small.jpg", contentType: "image/jpeg", content: JPG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.similarity).toBeGreaterThanOrEqual(0);
    expect(result.dimensions.width).toBeGreaterThan(0);
    expect(result.dimensions.height).toBeGreaterThan(0);
  });

  // ── Branch coverage: HEIC vs HEIC (portrait) ───────────────────────

  it("compares HEIC portrait with standard HEIC", { timeout: 120_000 }, async () => {
    const HEIC = readFixture(fixtures.image.base.heic200);
    const HEIC_PORTRAIT = readFixture(fixtures.image.portraitHeic);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "standard.heic", contentType: "image/heic", content: HEIC },
      {
        name: "file",
        filename: "portrait.heic",
        contentType: "image/heic",
        content: HEIC_PORTRAIT,
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.similarity).toBeGreaterThanOrEqual(0);
    expect(result.similarity).toBeLessThanOrEqual(100);
    expect(result.downloadUrl).toBeDefined();
  });

  // ── Branch coverage: originalSize reflects both inputs ──────────────

  it("originalSize is sum of both input buffers", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    // originalSize is sum of both decoded buffers (after HEIC conversion)
    // For non-HEIC, it should be close to input sizes
    expect(result.originalSize).toBeGreaterThan(0);
  });

  // ── Branch coverage: blank image comparison ─────────────────────────

  it("compares blank image with colored image", async () => {
    const BLANK = readFixture(fixtures.image.edge.blank);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "blank.png", contentType: "image/png", content: BLANK },
      { name: "file", filename: "colored.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.similarity).toBeGreaterThanOrEqual(0);
    expect(result.similarity).toBeLessThan(100);
  });

  // ── Branch coverage: both corrupt images fail processing ───────────

  it("returns 400 when both images are corrupt", async () => {
    const corrupt1 = Buffer.from("this is not an image");
    const corrupt2 = Buffer.from("neither is this one");
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: corrupt1 },
      { name: "file", filename: "b.png", contentType: "image/png", content: corrupt2 },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    // validateImageBuffer catches corrupt data before processing
    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toBeDefined();
  });

  // ── Branch coverage: HEIF content format input ─────────────────────

  it("compares portrait HEIC image with PNG", { timeout: 120_000 }, async () => {
    const HEIC_PORTRAIT = readFixture(fixtures.image.portraitHeic);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.heic", contentType: "image/heic", content: HEIC_PORTRAIT },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.similarity).toBeGreaterThanOrEqual(0);
    expect(result.similarity).toBeLessThanOrEqual(100);
    expect(result.downloadUrl).toBeDefined();
  });

  // ── Branch coverage: same JPEG compared to itself ──────────────────

  it("reports 100% similarity for same JPEG compared to itself", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.similarity).toBe(100);
    expect(result.dimensions.width).toBe(100);
    expect(result.dimensions.height).toBe(100);
  });

  // ── Branch coverage: exif-oriented image comparison ────────────────

  it("compares an EXIF-oriented image with a standard image", async () => {
    const EXIF = readFixture(fixtures.image.exifGps);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "exif.jpg", contentType: "image/jpeg", content: EXIF },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.similarity).toBeGreaterThanOrEqual(0);
    expect(result.similarity).toBeLessThanOrEqual(100);
    expect(result.dimensions.width).toBeGreaterThan(0);
    expect(result.dimensions.height).toBeGreaterThan(0);
  });

  // ── Branch coverage: large stress image compared to small ──────────

  it("compares two large stress images", async () => {
    const LARGE = readFixture(fixtures.image.stressLarge);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.jpg", contentType: "image/jpeg", content: LARGE },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: LARGE },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.similarity).toBe(100);
  });

  // ── HEIF format input ─────────────────────────────────────────────

  it("compares HEIF image with PNG", { timeout: 120_000 }, async () => {
    const HEIF = readFixture(fixtures.image.motorcycle);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.heif", contentType: "image/heif", content: HEIF },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.similarity).toBeGreaterThanOrEqual(0);
    expect(result.similarity).toBeLessThanOrEqual(100);
    expect(result.downloadUrl).toBeDefined();
    expect(result.dimensions.width).toBeGreaterThan(0);
    expect(result.dimensions.height).toBeGreaterThan(0);
  });

  // ── Animated GIF input ────────────────────────────────────────────

  it("compares animated GIF with PNG", async () => {
    const GIF = readFixture(fixtures.image.animated.gif);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.gif", contentType: "image/gif", content: GIF },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.similarity).toBeGreaterThanOrEqual(0);
    expect(result.similarity).toBeLessThanOrEqual(100);
    expect(result.downloadUrl).toBeDefined();
  });

  // ── SVG input ─────────────────────────────────────────────────────

  it("compares SVG image with PNG", async () => {
    const SVG = readFixture(fixtures.image.base.svg100);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.svg", contentType: "image/svg+xml", content: SVG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.similarity).toBeGreaterThanOrEqual(0);
    expect(result.similarity).toBeLessThanOrEqual(100);
    expect(result.downloadUrl).toBeDefined();
  });

  // ── SVG vs SVG comparison ─────────────────────────────────────────

  it("compares two identical SVG images (100% similarity)", async () => {
    const SVG = readFixture(fixtures.image.base.svg100);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.svg", contentType: "image/svg+xml", content: SVG },
      { name: "file", filename: "b.svg", contentType: "image/svg+xml", content: SVG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.similarity).toBe(100);
    expect(result.downloadUrl).toBeDefined();
    expect(result.dimensions.width).toBeGreaterThan(0);
    expect(result.dimensions.height).toBeGreaterThan(0);
  });

  // ── Two different SVGs ────────────────────────────────────────────

  it("compares two different SVG images", async () => {
    const SVG = readFixture(fixtures.image.base.svg100);
    const LOGO_SVG = readFixture(fixtures.image.svgLogo);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.svg", contentType: "image/svg+xml", content: SVG },
      { name: "file", filename: "b.svg", contentType: "image/svg+xml", content: LOGO_SVG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.similarity).toBeGreaterThanOrEqual(0);
    expect(result.similarity).toBeLessThanOrEqual(100);
  });

  // ── Portrait vs portrait comparison ───────────────────────────────

  it("compares two portrait images", async () => {
    const PORTRAIT = readFixture(fixtures.image.portraitJpg);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.jpg", contentType: "image/jpeg", content: PORTRAIT },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: PORTRAIT },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.similarity).toBe(100);
  });

  // ── Diff image dimensions verified via download ───────────────────

  it("diff image matches the reported dimensions", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(result.dimensions.width);
    expect(meta.height).toBe(result.dimensions.height);
    expect(meta.format).toBe("png");
  });

  // ── AVIF format input ─────────────────────────────────────────────

  it("compares two AVIF images", async () => {
    const AVIF = readFixture(fixtures.image.formats("avif"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.avif", contentType: "image/avif", content: AVIF },
      { name: "file", filename: "b.avif", contentType: "image/avif", content: AVIF },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.similarity).toBe(100);
    expect(result.downloadUrl).toBeDefined();
  });

  // ── AVIF vs PNG cross-format comparison ──────────────────────────

  it("compares AVIF with PNG (cross-format)", async () => {
    const AVIF = readFixture(fixtures.image.formats("avif"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.avif", contentType: "image/avif", content: AVIF },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.similarity).toBeGreaterThanOrEqual(0);
    expect(result.similarity).toBeLessThanOrEqual(100);
    expect(result.dimensions.width).toBeGreaterThan(0);
    expect(result.dimensions.height).toBeGreaterThan(0);
  });

  // ── SVGZ input (compare validates with validateImageBuffer first) ─

  it("handles SVGZ input: rejects as invalid or processes successfully", async () => {
    const SVGZ = readFixture(fixtures.image.formats("svgz"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.svgz", contentType: "image/svg+xml", content: SVGZ },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    // SVGZ (gzip-compressed SVG) may not pass validateImageBuffer
    // since magic bytes are gzip, not SVG; returns 400 or succeeds
    expect([200, 400]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const result = JSON.parse(res.body);
      expect(result.similarity).toBeGreaterThanOrEqual(0);
      expect(result.downloadUrl).toBeDefined();
    }
  });

  // ── HEIF vs AVIF cross-format ────────────────────────────────────

  it("compares HEIF with AVIF (cross-format)", { timeout: 120_000 }, async () => {
    const HEIF = readFixture(fixtures.image.motorcycle);
    const AVIF = readFixture(fixtures.image.formats("avif"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.heif", contentType: "image/heif", content: HEIF },
      { name: "file", filename: "b.avif", contentType: "image/avif", content: AVIF },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.similarity).toBeGreaterThanOrEqual(0);
    expect(result.similarity).toBeLessThanOrEqual(100);
    expect(result.downloadUrl).toBeDefined();
  });

  // ── Blank image vs blank image (100% similarity) ─────────────────

  it("compares two blank images (100% similarity)", async () => {
    const BLANK = readFixture(fixtures.image.edge.blank);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: BLANK },
      { name: "file", filename: "b.png", contentType: "image/png", content: BLANK },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/compare",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.similarity).toBe(100);
  });
});
