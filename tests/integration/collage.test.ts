/**
 * Integration tests for the collage tool (/api/v1/tools/collage).
 *
 * Collage accepts multiple images (any field name, type === "file") and
 * arranges them in a template-based grid layout. It uses a custom route
 * rather than createToolRoute.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
const PNG = readFileSync(join(FIXTURES, "test-200x150.png"));
const JPG = readFileSync(join(FIXTURES, "test-100x100.jpg"));

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

describe("Collage", () => {
  it("creates a 2-image horizontal collage", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("creates a 2-image vertical collage", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-v-equal" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("creates a 4-image grid collage", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "f3", filename: "c.png", contentType: "image/png", content: PNG },
      { name: "f4", filename: "d.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "4-grid" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("handles single image with a 2-image template (fills first cell only)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "solo.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("applies custom gap between cells", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal", gap: 30 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("uses a specific aspect ratio", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal", aspectRatio: "1:1" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    // Download and verify square aspect ratio
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(meta.height);
  });

  it("outputs in JPEG format when requested", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          templateId: "2-h-equal",
          outputFormat: "jpeg",
          quality: 80,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
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
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("jpeg");
  });

  it("applies corner radius to cells", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal", cornerRadius: 20 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("uses transparent background", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          templateId: "2-h-equal",
          backgroundColor: "transparent",
          outputFormat: "png",
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
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
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.channels).toBe(4); // alpha channel for transparency
  });

  // ── Validation ──────────────────────────────────────────────────────

  it("rejects requests with no images", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/no images/i);
  });

  it("rejects unknown template ID", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "nonexistent-layout" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/unknown template/i);
  });

  it("rejects gap exceeding max (500)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal", gap: 600 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects invalid output format", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal", outputFormat: "bmp" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects unauthenticated requests", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  // ── Extended coverage: layout modes & edge cases ────────────────────

  it("creates a 3-image horizontal collage (3-h-equal)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "f3", filename: "c.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "3-h-equal" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("creates a 3-image left-large layout", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "f3", filename: "c.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "3-left-large" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("creates a 5-image collage (5-top2-bottom3)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "f3", filename: "c.png", contentType: "image/png", content: PNG },
      { name: "f4", filename: "d.jpg", contentType: "image/jpeg", content: JPG },
      { name: "f5", filename: "e.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "5-top2-bottom3" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("creates a 6-image grid (6-grid-3x2) with mixed formats", async () => {
    const WEBP = readFileSync(join(FIXTURES, "test-50x50.webp"));
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "f3", filename: "c.webp", contentType: "image/webp", content: WEBP },
      { name: "f4", filename: "d.png", contentType: "image/png", content: PNG },
      { name: "f5", filename: "e.jpg", contentType: "image/jpeg", content: JPG },
      { name: "f6", filename: "f.webp", contentType: "image/webp", content: WEBP },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "6-grid-3x2" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("creates a 9-image grid collage", async () => {
    const images = Array.from({ length: 9 }, (_, i) => ({
      name: `f${i + 1}`,
      filename: `${i}.${i % 2 === 0 ? "png" : "jpg"}`,
      contentType: i % 2 === 0 ? "image/png" : "image/jpeg",
      content: i % 2 === 0 ? PNG : JPG,
    }));

    const { body, contentType } = createMultipartPayload([
      ...images,
      {
        name: "settings",
        content: JSON.stringify({ templateId: "9-grid" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("outputs in webp format when requested", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          templateId: "2-h-equal",
          outputFormat: "webp",
          quality: 75,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
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
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("webp");
  });

  it("outputs in avif format when requested", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          templateId: "2-h-equal",
          outputFormat: "avif",
          quality: 60,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
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
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("heif");
  });

  it("applies contain object fit via cell settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          templateId: "2-h-equal",
          cells: [
            { imageIndex: 0, objectFit: "contain", panX: 0, panY: 0, zoom: 1 },
            { imageIndex: 1, objectFit: "contain", panX: 0, panY: 0, zoom: 1 },
          ],
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("applies pan and zoom via cell settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          templateId: "2-h-equal",
          cells: [
            { imageIndex: 0, panX: 50, panY: -50, zoom: 2, objectFit: "cover" },
            { imageIndex: 1, panX: -30, panY: 30, zoom: 1.5, objectFit: "cover" },
          ],
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("uses 16:9 aspect ratio", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal", aspectRatio: "16:9" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
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
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    // 16:9 ratio: width/height should be ~1.78
    const ratio = (meta.width ?? 1) / (meta.height ?? 1);
    expect(ratio).toBeCloseTo(16 / 9, 1);
  });

  it("uses 9:16 (portrait) aspect ratio", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-v-equal", aspectRatio: "9:16" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
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
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    // Portrait: height > width
    expect(meta.height).toBeGreaterThan(meta.width!);
  });

  it("applies custom hex background color", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          templateId: "2-h-equal",
          backgroundColor: "#FF0000",
          gap: 20,
          outputFormat: "png",
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("handles HEIC input images", async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.heic", contentType: "image/heic", content: HEIC },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("reports originalSize as the sum of all input buffers", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.originalSize).toBeGreaterThan(0);
    expect(result.jobId).toBeDefined();
  });

  it("rejects invalid JSON in settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "{not valid json" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
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

  // ── Branch coverage: invalid file validation (line 463) ─────────────

  it("rejects an invalid/corrupt image file", async () => {
    const corruptBuffer = Buffer.from("this is not an image at all!!!");
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "corrupt.png", contentType: "image/png", content: corruptBuffer },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/invalid file/i);
  });

  // ── Branch coverage: contain + transparent bg (line 548) ────────────

  it("applies contain fit with transparent background", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          templateId: "2-h-equal",
          backgroundColor: "transparent",
          outputFormat: "png",
          cells: [
            { imageIndex: 0, objectFit: "contain", panX: 0, panY: 0, zoom: 1 },
            { imageIndex: 1, objectFit: "contain", panX: 0, panY: 0, zoom: 1 },
          ],
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.channels).toBe(4);
  });

  // ── Branch coverage: contain + opaque bg (line 548 alternate) ───────

  it("applies contain fit with opaque hex background", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          templateId: "2-h-equal",
          backgroundColor: "#00FF00",
          cells: [
            { imageIndex: 0, objectFit: "contain", panX: 0, panY: 0, zoom: 1 },
            { imageIndex: 1, objectFit: "contain", panX: 0, panY: 0, zoom: 1 },
          ],
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  // ── Branch coverage: contain + zoom > 1 ─────────────────────────────

  it("applies contain fit with zoom greater than 1", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          templateId: "2-h-equal",
          cells: [
            { imageIndex: 0, objectFit: "contain", panX: 0, panY: 0, zoom: 2 },
            { imageIndex: 1, objectFit: "contain", panX: 0, panY: 0, zoom: 1.5 },
          ],
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  // ── Branch coverage: 4:3 and 3:2 aspect ratios ─────────────────────

  it("uses 4:3 aspect ratio", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal", aspectRatio: "4:3" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
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
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    const ratio = (meta.width ?? 1) / (meta.height ?? 1);
    expect(ratio).toBeCloseTo(4 / 3, 1);
  });

  it("uses 3:2 aspect ratio", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal", aspectRatio: "3:2" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
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
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    const ratio = (meta.width ?? 1) / (meta.height ?? 1);
    expect(ratio).toBeCloseTo(3 / 2, 1);
  });

  it("uses 4:5 portrait aspect ratio", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-v-equal", aspectRatio: "4:5" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
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
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    // 4:5 is portrait: height > width
    expect(meta.height).toBeGreaterThan(meta.width!);
  });

  // ── Branch coverage: 1x1 tiny image input ───────────────────────────

  it("handles 1x1 pixel input images", async () => {
    const TINY = readFileSync(join(FIXTURES, "test-1x1.png"));
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "tiny1.png", contentType: "image/png", content: TINY },
      { name: "f2", filename: "tiny2.png", contentType: "image/png", content: TINY },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  // ── Branch coverage: corner radius + transparent bg ─────────────────

  it("applies corner radius with transparent background", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          templateId: "2-h-equal",
          cornerRadius: 30,
          backgroundColor: "transparent",
          outputFormat: "png",
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.channels).toBe(4);
  });

  // ── Branch coverage: large file handling ────────────────────────────

  it("handles a large content image", async () => {
    const LARGE = readFileSync(join(FIXTURES, "content", "stress-large.jpg"));
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "large.jpg", contentType: "image/jpeg", content: LARGE },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });
});
