/**
 * Integration tests for the compare tool (/api/v1/tools/compare).
 *
 * Covers identical-image comparison, different-image comparison,
 * similarity score, diff image generation, and input validation.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
const PNG = readFileSync(join(FIXTURES, "test-200x150.png"));
const JPG = readFileSync(join(FIXTURES, "test-100x100.jpg"));
const WEBP = readFileSync(join(FIXTURES, "test-50x50.webp"));

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
      url: "/api/v1/tools/compare",
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
      url: "/api/v1/tools/compare",
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
      url: "/api/v1/tools/compare",
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
      url: "/api/v1/tools/compare",
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
      url: "/api/v1/tools/compare",
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
      url: "/api/v1/tools/compare",
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
      url: "/api/v1/tools/compare",
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
      url: "/api/v1/tools/compare",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });
});
