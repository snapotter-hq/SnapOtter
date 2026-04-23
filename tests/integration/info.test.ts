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
});
