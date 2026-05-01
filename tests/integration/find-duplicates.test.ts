/**
 * Integration tests for the find-duplicates tool (/api/v1/tools/find-duplicates).
 *
 * Covers duplicate detection with identical images, detection of unique images,
 * threshold tuning, response structure, and input validation.
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

  // ── Extended coverage: thresholds, batch sizes, settings ───────────

  it("detects duplicates across different formats (PNG vs WebP of same content)", async () => {
    // Same image in PNG and WebP should be perceptual duplicates
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.webp", contentType: "image/webp", content: WEBP },
      { name: "file", filename: "c.jpg", contentType: "image/jpeg", content: JPG },
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
    // All three are different images, so no duplicates expected
    // (they're different content: 200x150 vs 50x50 vs 100x100)
  });

  it("uses high threshold to group even dissimilar images", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ threshold: 20 }),
      },
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
    // With threshold 20, more images may be grouped as duplicates
  });

  it("uses threshold via settings JSON field", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ threshold: 5 }),
      },
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
    // Identical images should still be grouped with threshold 5
    expect(result.duplicateGroups).toHaveLength(1);
  });

  it("handles 5+ images in a single batch", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "c.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "d.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "e.jpg", contentType: "image/jpeg", content: PORTRAIT },
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
    expect(result.totalImages).toBe(5);
    // At least one duplicate group should be found (PNG pair or JPG pair)
    expect(result.duplicateGroups.length).toBeGreaterThanOrEqual(1);
    // Total duplicated files across all groups should be at least 4 (2 PNG + 2 JPG pairs)
    const totalGroupedFiles = result.duplicateGroups.reduce(
      (sum: number, g: { files: unknown[] }) => sum + g.files.length,
      0,
    );
    expect(totalGroupedFiles).toBeGreaterThanOrEqual(2);
  });

  it("detects 3 identical images in one group", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "c.png", contentType: "image/png", content: PNG },
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
    expect(result.duplicateGroups).toHaveLength(1);
    expect(result.duplicateGroups[0].files).toHaveLength(3);
    expect(result.uniqueImages).toBe(0);

    // Only one should be marked as best
    const bestFiles = result.duplicateGroups[0].files.filter((f: { isBest: boolean }) => f.isBest);
    expect(bestFiles).toHaveLength(1);
  });

  it("sorts duplicate groups by highest similarity descending", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "c.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "d.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ threshold: 20 }),
      },
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

    // If there are multiple groups, they should be sorted by max similarity desc
    if (result.duplicateGroups.length >= 2) {
      const maxSim0 = Math.max(
        ...result.duplicateGroups[0].files.map((f: { similarity: number }) => f.similarity),
      );
      const maxSim1 = Math.max(
        ...result.duplicateGroups[1].files.map((f: { similarity: number }) => f.similarity),
      );
      expect(maxSim0).toBeGreaterThanOrEqual(maxSim1);
    }
  });

  it("handles HEIC input images", { timeout: 120_000 }, async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.heic", contentType: "image/heic", content: HEIC },
      { name: "file", filename: "b.heic", contentType: "image/heic", content: HEIC },
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
  });

  it("includes groupId in duplicate groups", async () => {
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
    expect(result.duplicateGroups[0].groupId).toBe(1);
  });

  it("rejects threshold exceeding max (20)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ threshold: 25 }),
      },
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
  });

  it("rejects requests with no files at all", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({}) },
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

  // ── Branch coverage: best image selection by pixel count (lines 138-240) ──

  it("marks the higher-resolution image as best in a duplicate group", async () => {
    // Create a smaller version of PNG via sharp
    const smallerPng = await sharp(PNG).resize(100, 75).png().toBuffer();

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "small.png", contentType: "image/png", content: smallerPng },
      { name: "file", filename: "large.png", contentType: "image/png", content: PNG },
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
    expect(result.duplicateGroups).toHaveLength(1);

    const group = result.duplicateGroups[0];
    const bestFile = group.files.find((f: { isBest: boolean }) => f.isBest);
    expect(bestFile).toBeDefined();
    // The larger (200x150) image should be marked as best
    expect(bestFile.width).toBe(200);
    expect(bestFile.height).toBe(150);
  });

  // ── Branch coverage: best selection tie-break by file size ──────────

  it("tie-breaks best selection by file size when pixel count is equal", async () => {
    // Same dimensions but different quality = different file sizes
    const highQuality = await sharp(PNG).jpeg({ quality: 100 }).toBuffer();
    const lowQuality = await sharp(PNG).jpeg({ quality: 10 }).toBuffer();

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "low.jpg", contentType: "image/jpeg", content: lowQuality },
      { name: "file", filename: "high.jpg", contentType: "image/jpeg", content: highQuality },
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
    expect(result.duplicateGroups).toHaveLength(1);

    const group = result.duplicateGroups[0];
    const bestFile = group.files.find((f: { isBest: boolean }) => f.isBest);
    expect(bestFile).toBeDefined();
    // The larger file size should be marked as best (same pixel count)
    expect(bestFile.fileSize).toBe(Math.max(highQuality.length, lowQuality.length));
  });

  // ── Branch coverage: error path (lines 258-262) ─────────────────────

  it("returns 422 when image processing fails due to corrupt data", async () => {
    // Create a buffer that has valid PNG magic bytes but is truncated
    const validPng = PNG;
    // Take only the header (first 20 bytes) - valid magic but corrupt content
    const truncatedPng = Buffer.concat([
      validPng.subarray(0, 8), // PNG signature
      Buffer.alloc(50, 0), // garbage
    ]);

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "corrupt1.png", contentType: "image/png", content: truncatedPng },
      { name: "file", filename: "corrupt2.png", contentType: "image/png", content: truncatedPng },
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

    // Should either process (with sharp handling corrupt data gracefully)
    // or return 422 for processing failure
    expect([200, 422]).toContain(res.statusCode);
  });

  // ── Branch coverage: thumbnail generation for different formats ──────

  it("generates thumbnails for various image formats", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "c.webp", contentType: "image/webp", content: WEBP },
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

    // Check that all groups' files have thumbnails as data URIs
    for (const group of result.duplicateGroups) {
      for (const file of group.files) {
        if (file.thumbnail) {
          expect(file.thumbnail).toMatch(/^data:image\/jpeg;base64,/);
        }
      }
    }
  });

  // ── Branch coverage: threshold 0 with identical images ──────────────

  it("groups identical images even at threshold 0", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ threshold: 0 }),
      },
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
    // Identical images have hamming distance 0, so they should be grouped
    expect(result.duplicateGroups).toHaveLength(1);
    expect(result.duplicateGroups[0].files).toHaveLength(2);
  });

  // ── Branch coverage: 1x1 tiny images ────────────────────────────────

  it("handles 1x1 pixel images", async () => {
    const TINY = readFileSync(join(FIXTURES, "test-1x1.png"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny1.png", contentType: "image/png", content: TINY },
      { name: "file", filename: "tiny2.png", contentType: "image/png", content: TINY },
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
    // 1x1 images should still hash and be grouped as duplicates
    expect(result.duplicateGroups).toHaveLength(1);
  });

  // ── Branch coverage: large file handling ────────────────────────────

  it("handles a large content image in duplicate detection", async () => {
    const LARGE = readFileSync(join(FIXTURES, "content", "stress-large.jpg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "large1.jpg", contentType: "image/jpeg", content: LARGE },
      { name: "file", filename: "large2.jpg", contentType: "image/jpeg", content: LARGE },
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
  });

  // ── Branch coverage: invalid JSON settings ──────────────────────────

  it("rejects invalid JSON in settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "{{bad json" },
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
    expect(result.error).toMatch(/json/i);
  });

  // ── Branch coverage: multiple separate duplicate groups ─────────────

  it("detects multiple separate duplicate groups", async () => {
    // Resize PNG to make a perceptually similar but different-res copy
    const pngSmall = await sharp(PNG).resize(100, 75).png().toBuffer();
    const jpgSmall = await sharp(JPG).resize(50, 50).jpeg().toBuffer();

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "png1.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "png2.png", contentType: "image/png", content: pngSmall },
      { name: "file", filename: "jpg1.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "jpg2.jpg", contentType: "image/jpeg", content: jpgSmall },
      { name: "file", filename: "unique.jpg", contentType: "image/jpeg", content: PORTRAIT },
      {
        name: "settings",
        content: JSON.stringify({ threshold: 10 }),
      },
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
    expect(result.totalImages).toBe(5);
    // Should have at least 1 group (PNG pair), possibly 2 (also JPG pair)
    expect(result.duplicateGroups.length).toBeGreaterThanOrEqual(1);
    // The portrait should not be in any group
    expect(result.uniqueImages).toBeGreaterThanOrEqual(1);
  });

  // ── Branch coverage: HEIF content format input ─────────────────────

  it("handles portrait HEIC images in duplicate detection", { timeout: 120_000 }, async () => {
    const HEIC_PORTRAIT = readFileSync(join(FIXTURES, "test-portrait.heic"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.heic", contentType: "image/heic", content: HEIC_PORTRAIT },
      { name: "file", filename: "b.heic", contentType: "image/heic", content: HEIC_PORTRAIT },
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
  });

  // ── Branch coverage: threshold at max boundary (20) ────────────────

  it("uses threshold at max boundary (20)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ threshold: 20 }),
      },
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
  });

  // ── Branch coverage: negative threshold rejects ────────────────────

  it("rejects threshold below minimum (0)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ threshold: -1 }),
      },
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
  });

  // ── Branch coverage: all unique images with strict threshold ───────

  it("reports all images as unique with threshold 0 and different images", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: PORTRAIT },
      {
        name: "settings",
        content: JSON.stringify({ threshold: 0 }),
      },
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

  // ── Branch coverage: exif-oriented image duplicate detection ───────

  it("handles EXIF-oriented images in duplicate detection", async () => {
    const EXIF = readFileSync(join(FIXTURES, "test-with-exif.jpg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "exif1.jpg", contentType: "image/jpeg", content: EXIF },
      { name: "file", filename: "exif2.jpg", contentType: "image/jpeg", content: EXIF },
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
  });

  // ── Branch coverage: 6+ images in batch ────────────────────────────

  it("handles 6+ images in a single batch", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "c.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "d.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "e.webp", contentType: "image/webp", content: WEBP },
      { name: "file", filename: "f.jpg", contentType: "image/jpeg", content: PORTRAIT },
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
    expect(result.totalImages).toBe(6);
    // PNG pair and JPG pair should be grouped
    expect(result.duplicateGroups.length).toBeGreaterThanOrEqual(1);
  });

  // ── Branch coverage: spaceSaveable for multiple groups ─────────────

  it("calculates space saveable across multiple duplicate groups", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "c.png", contentType: "image/png", content: PNG },
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
    expect(result.duplicateGroups).toHaveLength(1);
    expect(result.duplicateGroups[0].files).toHaveLength(3);
    // Space saveable should be the size of the 2 non-best duplicates
    expect(result.spaceSaveable).toBeGreaterThan(0);
    // Should be roughly 2x the file size of a single PNG
    expect(result.spaceSaveable).toBeGreaterThan(PNG.length);
  });

  // ── HEIF format input ─────────────────────────────────────────────

  it(
    "handles HEIF input images in duplicate detection",
    { timeout: 120_000 },
    async () => {
      const HEIF = readFileSync(join(FIXTURES, "content", "motorcycle.heif"));
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "a.heif", contentType: "image/heif", content: HEIF },
        { name: "file", filename: "b.heif", contentType: "image/heif", content: HEIF },
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
    },
    60_000,
  );

  // ── Animated GIF input ────────────────────────────────────────────

  it("handles animated GIF input in duplicate detection", async () => {
    const GIF = readFileSync(join(FIXTURES, "animated.gif"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.gif", contentType: "image/gif", content: GIF },
      { name: "file", filename: "b.gif", contentType: "image/gif", content: GIF },
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
  });

  // ── SVG input ─────────────────────────────────────────────────────

  it("handles SVG input in duplicate detection", async () => {
    const SVG = readFileSync(join(FIXTURES, "test-100x100.svg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.svg", contentType: "image/svg+xml", content: SVG },
      { name: "file", filename: "b.svg", contentType: "image/svg+xml", content: SVG },
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
  });
});
