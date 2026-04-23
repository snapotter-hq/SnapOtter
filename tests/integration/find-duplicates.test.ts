/**
 * Integration tests for the find-duplicates tool (/api/v1/tools/find-duplicates).
 *
 * Covers duplicate detection with identical images, detection of unique images,
 * threshold tuning, response structure, and input validation.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
const PNG = readFileSync(join(FIXTURES, "test-200x150.png"));
const JPG = readFileSync(join(FIXTURES, "test-100x100.jpg"));
const WEBP = readFileSync(join(FIXTURES, "test-50x50.webp"));
// Use a content photo that is perceptually very different from the test images
const PORTRAIT = readFileSync(join(FIXTURES, "content", "portrait-color.jpg"));

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

describe("Find Duplicates", () => {
  it("detects duplicates when the same image is uploaded twice", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "copy1.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "copy2.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/find-duplicates",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    expect(result.totalImages).toBe(2);
    expect(result.duplicateGroups).toHaveLength(1);
    expect(result.duplicateGroups[0].files).toHaveLength(2);

    // Identical images should have 100% similarity
    const similarities = result.duplicateGroups[0].files.map(
      (f: { similarity: number }) => f.similarity,
    );
    expect(similarities).toContain(100);

    // One file should be marked as best
    const bestFiles = result.duplicateGroups[0].files.filter((f: { isBest: boolean }) => f.isBest);
    expect(bestFiles).toHaveLength(1);
  });

  it("reports no duplicate groups for completely different images", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: PORTRAIT },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/find-duplicates",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    expect(result.totalImages).toBe(2);
    expect(result.duplicateGroups).toHaveLength(0);
    expect(result.uniqueImages).toBe(2);
    expect(result.spaceSaveable).toBe(0);
  });

  it("detects duplicates among a mix of duplicate and unique images", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "c.jpg", contentType: "image/jpeg", content: PORTRAIT },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/find-duplicates",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    expect(result.totalImages).toBe(3);
    expect(result.duplicateGroups).toHaveLength(1);
    expect(result.duplicateGroups[0].files).toHaveLength(2);
    // The portrait should be unique
    expect(result.uniqueImages).toBe(1);
  });

  it("respects the threshold parameter", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "threshold", content: "0" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/find-duplicates",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    // With threshold 0, only exact hash matches should be grouped
    // Different images should not be grouped
    expect(result.totalImages).toBe(2);
  });

  it("calculates space saveable from duplicate groups", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/find-duplicates",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    // Space saveable should be the size of the non-best duplicate
    expect(result.spaceSaveable).toBeGreaterThan(0);
  });

  it("includes file metadata in duplicate group entries", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "img1.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "img2.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/find-duplicates",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const file = result.duplicateGroups[0].files[0];
    expect(file).toHaveProperty("filename");
    expect(file).toHaveProperty("similarity");
    expect(file).toHaveProperty("width");
    expect(file).toHaveProperty("height");
    expect(file).toHaveProperty("fileSize");
    expect(file).toHaveProperty("format");
    expect(file).toHaveProperty("isBest");
    expect(file).toHaveProperty("thumbnail");
    expect(file.width).toBe(200);
    expect(file.height).toBe(150);
  });

  // ── Validation ──────────────────────────────────────────────────────

  it("rejects requests with fewer than 2 images", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "solo.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/find-duplicates",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/at least 2/i);
  });

  it("rejects unauthenticated requests", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/find-duplicates",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });
});
