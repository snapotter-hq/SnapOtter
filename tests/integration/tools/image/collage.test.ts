/**
 * Integration tests for the collage tool (/api/v1/tools/image/collage).
 *
 * Collage accepts multiple images (any field name, type === "file") and
 * arranges them in a template-based grid layout. It uses a custom route
 * rather than createToolRoute.
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
    const WEBP = readFixture(fixtures.image.base.webp50);
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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

  it("handles HEIC input images", { timeout: 120_000 }, async () => {
    const HEIC = readFixture(fixtures.image.base.heic200);
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
    const TINY = readFixture(fixtures.image.edge.px1);
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
      url: "/api/v1/tools/image/collage",
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
      url: "/api/v1/tools/image/collage",
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
    const LARGE = readFixture(fixtures.image.stressLarge);
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
      url: "/api/v1/tools/image/collage",
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

  // ── Branch coverage: 2-h-left-large template ───────────────────────

  it("creates a 2-image left-large horizontal collage", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-left-large" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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

  // ── Branch coverage: 2-h-right-large template ──────────────────────

  it("creates a 2-image right-large horizontal collage", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-right-large" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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

  // ── Branch coverage: 3-right-large template ────────────────────────

  it("creates a 3-image right-large collage", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "f3", filename: "c.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "3-right-large" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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

  // ── Branch coverage: 3-top-large template ──────────────────────────

  it("creates a 3-image top-large collage", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "f3", filename: "c.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "3-top-large" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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

  // ── Branch coverage: 3-v-equal template ────────────────────────────

  it("creates a 3-image vertical equal collage", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "f3", filename: "c.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "3-v-equal" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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

  // ── Branch coverage: quality below min rejects ─────────────────────

  it("rejects quality below minimum (1)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal", quality: 0 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Branch coverage: corner radius above max rejects ───────────────

  it("rejects cornerRadius above maximum (500)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal", cornerRadius: 600 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Branch coverage: missing templateId rejects ────────────────────

  it("rejects missing templateId in settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({}),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Branch coverage: portrait aspect ratio arMultiplier > 1 ────────

  it("uses free aspect ratio (default 4:3)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal", aspectRatio: "free" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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
    // Free uses 4:3 default: w=2400, h=1800
    const ratio = (meta.width ?? 1) / (meta.height ?? 1);
    expect(ratio).toBeCloseTo(4 / 3, 1);
  });

  // ── Branch coverage: HEIF content format input ─────────────────────

  it("handles portrait HEIC input images", { timeout: 120_000 }, async () => {
    const HEIC_PORTRAIT = readFixture(fixtures.image.portraitHeic);
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.heic", contentType: "image/heic", content: HEIC_PORTRAIT },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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

  // ── HEIF format input ─────────────────────────────────────────────

  it("handles HEIF input images", { timeout: 120_000 }, async () => {
    const HEIF = readFixture(fixtures.image.motorcycle);
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.heif", contentType: "image/heif", content: HEIF },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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

  // ── Animated GIF input ────────────────────────────────────────────

  it("handles animated GIF input images", async () => {
    const GIF = readFixture(fixtures.image.animated.gif);
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.gif", contentType: "image/gif", content: GIF },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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

  // ── SVG input ─────────────────────────────────────────────────────

  it("handles SVG input images in collage", async () => {
    const SVG = readFixture(fixtures.image.base.svg100);
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "icon.svg", contentType: "image/svg+xml", content: SVG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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

  // ── Remaining template coverage ─────────────────────────────────────

  it("creates a 4-image left-large collage (4-left-large)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "f3", filename: "c.png", contentType: "image/png", content: PNG },
      { name: "f4", filename: "d.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "4-left-large" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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

  it("creates a 4-image top-large collage (4-top-large)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "f3", filename: "c.png", contentType: "image/png", content: PNG },
      { name: "f4", filename: "d.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "4-top-large" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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

  it("creates a 4-image bottom-large collage (4-bottom-large)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "f3", filename: "c.png", contentType: "image/png", content: PNG },
      { name: "f4", filename: "d.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "4-bottom-large" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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

  it("creates a 5-image top3-bottom2 collage", async () => {
    const images = Array.from({ length: 5 }, (_, i) => ({
      name: `f${i + 1}`,
      filename: `${i}.${i % 2 === 0 ? "png" : "jpg"}`,
      contentType: i % 2 === 0 ? "image/png" : "image/jpeg",
      content: i % 2 === 0 ? PNG : JPG,
    }));

    const { body, contentType } = createMultipartPayload([
      ...images,
      {
        name: "settings",
        content: JSON.stringify({ templateId: "5-top3-bottom2" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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

  it("creates a 5-image left-large collage (5-left-large)", async () => {
    const images = Array.from({ length: 5 }, (_, i) => ({
      name: `f${i + 1}`,
      filename: `${i}.png`,
      contentType: "image/png",
      content: PNG,
    }));

    const { body, contentType } = createMultipartPayload([
      ...images,
      {
        name: "settings",
        content: JSON.stringify({ templateId: "5-left-large" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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

  it("creates a 5-image center-large collage (5-center-large)", async () => {
    const images = Array.from({ length: 5 }, (_, i) => ({
      name: `f${i + 1}`,
      filename: `${i}.jpg`,
      contentType: "image/jpeg",
      content: JPG,
    }));

    const { body, contentType } = createMultipartPayload([
      ...images,
      {
        name: "settings",
        content: JSON.stringify({ templateId: "5-center-large" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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

  it("creates a 6-image grid-2x3 collage (6-grid-2x3)", async () => {
    const images = Array.from({ length: 6 }, (_, i) => ({
      name: `f${i + 1}`,
      filename: `${i}.png`,
      contentType: "image/png",
      content: PNG,
    }));

    const { body, contentType } = createMultipartPayload([
      ...images,
      {
        name: "settings",
        content: JSON.stringify({ templateId: "6-grid-2x3" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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

  it("creates a 6-image top-large collage (6-top-large)", async () => {
    const images = Array.from({ length: 6 }, (_, i) => ({
      name: `f${i + 1}`,
      filename: `${i}.jpg`,
      contentType: "image/jpeg",
      content: JPG,
    }));

    const { body, contentType } = createMultipartPayload([
      ...images,
      {
        name: "settings",
        content: JSON.stringify({ templateId: "6-top-large" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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

  it("creates a 7-image mosaic collage (7-mosaic)", async () => {
    const images = Array.from({ length: 7 }, (_, i) => ({
      name: `f${i + 1}`,
      filename: `${i}.${i % 2 === 0 ? "png" : "jpg"}`,
      contentType: i % 2 === 0 ? "image/png" : "image/jpeg",
      content: i % 2 === 0 ? PNG : JPG,
    }));

    const { body, contentType } = createMultipartPayload([
      ...images,
      {
        name: "settings",
        content: JSON.stringify({ templateId: "7-mosaic" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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

  it("creates an 8-image mosaic collage (8-mosaic)", async () => {
    const images = Array.from({ length: 8 }, (_, i) => ({
      name: `f${i + 1}`,
      filename: `${i}.${i % 2 === 0 ? "png" : "jpg"}`,
      contentType: i % 2 === 0 ? "image/png" : "image/jpeg",
      content: i % 2 === 0 ? PNG : JPG,
    }));

    const { body, contentType } = createMultipartPayload([
      ...images,
      {
        name: "settings",
        content: JSON.stringify({ templateId: "8-mosaic" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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

  // ── JXL output format ─────────────────────────────────────────────

  it("accepts jxl output format (succeeds if Sharp supports JXL)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          templateId: "2-h-equal",
          outputFormat: "jxl",
          quality: 75,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    // JXL support depends on the Sharp build; either succeeds or fails gracefully
    expect([200, 422]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const result = JSON.parse(res.body);
      expect(result.processedSize).toBeGreaterThan(0);
      expect(result.downloadUrl).toContain(".jxl");
    }
  });

  // ── Extra images beyond template capacity are truncated ───────────

  it("truncates extra images beyond template capacity", async () => {
    // 4-grid only takes 4 images; sending 6 should still succeed
    const images = Array.from({ length: 6 }, (_, i) => ({
      name: `f${i + 1}`,
      filename: `${i}.png`,
      contentType: "image/png",
      content: PNG,
    }));

    const { body, contentType } = createMultipartPayload([
      ...images,
      {
        name: "settings",
        content: JSON.stringify({ templateId: "4-grid" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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

  // ── AVIF format input ─────────────────────────────────────────────

  it("handles AVIF input images in collage", async () => {
    const AVIF = readFixture(fixtures.image.formats("avif"));
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.avif", contentType: "image/avif", content: AVIF },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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

  // ── SVGZ input ───────────────────────────────────────────────────

  it("handles SVGZ (compressed SVG) input images", async () => {
    const SVGZ = readFixture(fixtures.image.formats("svgz"));
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "icon.svgz", contentType: "image/svg+xml", content: SVGZ },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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

  // ── Cell zoom at maximum (10) ─────────────────────────────────────

  it("applies maximum zoom (10) via cell settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          templateId: "2-h-equal",
          cells: [
            { imageIndex: 0, objectFit: "cover", panX: 0, panY: 0, zoom: 10 },
            { imageIndex: 1, objectFit: "cover", panX: 0, panY: 0, zoom: 1 },
          ],
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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

  // ── Cell zoom above max rejects ──────────────────────────────────

  it("rejects zoom above maximum (10)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          templateId: "2-h-equal",
          cells: [{ imageIndex: 0, objectFit: "cover", panX: 0, panY: 0, zoom: 11 }],
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Pan at boundary values (-100, 100) ───────────────────────────

  it("applies pan at max boundary values (-100, 100)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          templateId: "2-h-equal",
          cells: [
            { imageIndex: 0, panX: -100, panY: -100, zoom: 2, objectFit: "cover" },
            { imageIndex: 1, panX: 100, panY: 100, zoom: 2, objectFit: "cover" },
          ],
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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

  // ── Quality at max boundary (100) ────────────────────────────────

  it("accepts quality at maximum (100)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          templateId: "2-h-equal",
          outputFormat: "jpeg",
          quality: 100,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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

  // ── Gap at zero (no gap) ─────────────────────────────────────────

  it("applies zero gap between cells", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal", gap: 0 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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

  // ── Combined settings: gap + cornerRadius + backgroundColor + cells + format

  it("combines all settings: gap, cornerRadius, backgroundColor, cells, webp", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          templateId: "2-h-equal",
          gap: 15,
          cornerRadius: 10,
          backgroundColor: "#0000FF",
          aspectRatio: "1:1",
          outputFormat: "webp",
          quality: 85,
          cells: [
            { imageIndex: 0, objectFit: "contain", panX: 20, panY: -20, zoom: 1.5 },
            { imageIndex: 1, objectFit: "cover", panX: -10, panY: 10, zoom: 2 },
          ],
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
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
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(meta.height); // 1:1 aspect
  });
});

/**
 * Contain-mode zoom and pan (#711).
 *
 * The contain branch chained two resizes on one Sharp pipeline; Sharp keeps a
 * single set of resize options, so the zoom carried by the first call was
 * silently discarded and every contain cell rendered as if zoom were 1. Even
 * split into two pipelines the old shape was a no-op, because the second
 * contain-resize scales the zoomed image straight back down. The preview
 * defines the intended semantics: object-contain, then
 * `translate(panX%, panY%) scale(zoom)` clipped at the cell, background
 * behind.
 *
 * The marker image makes the geometry provable: a 200x100 blue field with a
 * red 10x10 square at the exact centre. In a 1200x1800 cell ("2-h-equal",
 * gap 0, free aspect = 2400x1800 canvas) contain scales it 6x, so the red
 * square lands at a known place and a known size for every zoom and pan.
 */
describe("Collage contain-mode zoom and pan (#711)", () => {
  const CELL_W = 1200;
  const CELL_H = 1800;

  let marker: Buffer;

  beforeAll(async () => {
    const raw = Buffer.alloc(200 * 100 * 3);
    for (let i = 0; i < raw.length; i += 3) raw[i + 2] = 255;
    for (let y = 45; y < 55; y++) {
      for (let x = 95; x < 105; x++) {
        const i = (y * 200 + x) * 3;
        raw[i] = 255;
        raw[i + 2] = 0;
      }
    }
    marker = await sharp(raw, { raw: { width: 200, height: 100, channels: 3 } })
      .png()
      .toBuffer();
  });

  async function runCollage(cell: Record<string, unknown>, extra: Record<string, unknown> = {}) {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "marker.png", contentType: "image/png", content: marker },
      {
        name: "settings",
        content: JSON.stringify({
          templateId: "2-h-equal",
          gap: 0,
          cells: [{ imageIndex: 0, objectFit: "contain", panX: 0, panY: 0, zoom: 1, ...cell }],
          ...extra,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });
    expect(res.statusCode).toBe(200);

    const dlRes = await app.inject({
      method: "GET",
      url: JSON.parse(res.body).downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    return dlRes.rawPayload;
  }

  const isRed = (px: number[]) => px[0] > 200 && px[1] < 60 && px[2] < 60;
  const isBlue = (px: number[]) => px[2] > 200 && px[0] < 60 && px[1] < 60;

  /** RGBA pixels of the left cell plus a point probe. */
  async function leftCell(output: Buffer) {
    const meta = await sharp(output).metadata();
    expect([meta.width, meta.height]).toEqual([2400, 1800]);
    const data = await sharp(output)
      .extract({ left: 0, top: 0, width: CELL_W, height: CELL_H })
      .ensureAlpha()
      .raw()
      .toBuffer();
    const at = (x: number, y: number) => [
      data[(y * CELL_W + x) * 4],
      data[(y * CELL_W + x) * 4 + 1],
      data[(y * CELL_W + x) * 4 + 2],
      data[(y * CELL_W + x) * 4 + 3],
    ];
    return { data, at };
  }

  function redStats(data: Buffer, width = CELL_W, height = CELL_H) {
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (isRed([data[i], data[i + 1], data[i + 2]])) {
          count++;
          sumX += x;
          sumY += y;
        }
      }
    }
    return {
      count,
      centroidX: count ? sumX / count : Number.NaN,
      centroidY: count ? sumY / count : Number.NaN,
    };
  }

  it("zoom changes the rendered cell", async () => {
    const zoom1 = await runCollage({ zoom: 1 });
    const zoom2 = await runCollage({ zoom: 2 });
    const [a, b] = await Promise.all([
      sharp(zoom1).raw().toBuffer(),
      sharp(zoom2).raw().toBuffer(),
    ]);
    expect(a.equals(b)).toBe(false);
  });

  it("zoom 2 doubles the marker and covers more of the cell", async () => {
    const { data: z1 } = await leftCell(await runCollage({ zoom: 1 }));
    const { data: z2, at } = await leftCell(await runCollage({ zoom: 2 }));

    // Red square is 60x60 at zoom 1 and 120x120 at zoom 2 (about 4x the area).
    const r1 = redStats(z1);
    const r2 = redStats(z2);
    expect(r1.count).toBeGreaterThan(2000);
    expect(r2.count).toBeGreaterThan(r1.count * 2.5);

    // At zoom 1 the content band starts at y=600; at zoom 2 it starts at
    // y=300, so this point flips from background to image.
    const z1At = (x: number, y: number) => [
      z1[(y * CELL_W + x) * 4],
      z1[(y * CELL_W + x) * 4 + 1],
      z1[(y * CELL_W + x) * 4 + 2],
    ];
    expect(isBlue(z1At(600, 450)) || isRed(z1At(600, 450))).toBe(false);
    expect(isBlue(at(600, 450))).toBe(true);
  });

  it("pan shifts the contained image inside the cell", async () => {
    // panX 25 translates by 25% of the cell width: 300px right.
    const { data: centred } = await leftCell(await runCollage({ zoom: 1, panX: 0 }));
    const { data: panned } = await leftCell(await runCollage({ zoom: 1, panX: 25 }));

    const before = redStats(centred);
    const after = redStats(panned);
    expect(Math.abs(before.centroidX - 600)).toBeLessThan(15);
    expect(Math.abs(after.centroidX - 900)).toBeLessThan(15);
  });

  it("zoomed content over a transparent background keeps real alpha", async () => {
    const { at } = await leftCell(
      await runCollage({ zoom: 2 }, { backgroundColor: "transparent", outputFormat: "png" }),
    );

    // Inside the zoomed content: opaque blue. Above it: still fully clear.
    const content = at(600, 450);
    expect(content[3]).toBe(255);
    expect(isBlue(content)).toBe(true);
    expect(at(600, 100)[3]).toBe(0);
  });

  it("pan does not scale with zoom and panY moves vertically", async () => {
    // The preview contract: translate(panX%, panY%) of the CELL, applied
    // independently of the zoom. panX 25 is 300px and panY 10 is 180px, so
    // the zoom-2 marker centre lands at (600+300, 900+180). If pan scaled
    // with zoom the centroid would land around (1170, 1260) instead.
    const { data } = await leftCell(await runCollage({ zoom: 2, panX: 25, panY: 10 }));

    const stats = redStats(data);
    expect(stats.count).toBeGreaterThan(8000);
    expect(Math.abs(stats.centroidX - 900)).toBeLessThan(15);
    expect(Math.abs(stats.centroidY - 1080)).toBeLessThan(15);
  });

  it("pan at the schema limit empties the cell to plain background", async () => {
    // panX 100 shifts the full-width content exactly one cell to the right,
    // so nothing remains visible and the branch that skips the extract runs.
    const { data, at } = await leftCell(await runCollage({ zoom: 1, panX: 100 }));

    expect(redStats(data).count).toBe(0);
    expect(at(600, 900)).toEqual([255, 255, 255, 255]);
  });

  it("height-driven cells scale the contained image by the limiting axis", async () => {
    // In the 2400x900 top cell of 2-v-equal, the 200x100 marker is limited by
    // height (fitScale 9, not 12), so at zoom 2 the red square renders 180px
    // tall, about 29000 red pixels. A width-driven fitScale would give 240px
    // and about 52000; the ceiling separates them with wide margin.
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "marker.png", contentType: "image/png", content: marker },
      {
        name: "settings",
        content: JSON.stringify({
          templateId: "2-v-equal",
          gap: 0,
          cells: [{ imageIndex: 0, objectFit: "contain", panX: 0, panY: 0, zoom: 2 }],
        }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });
    expect(res.statusCode).toBe(200);
    const dlRes = await app.inject({
      method: "GET",
      url: JSON.parse(res.body).downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    const topCell = await sharp(dlRes.rawPayload)
      .extract({ left: 0, top: 0, width: 2400, height: 900 })
      .ensureAlpha()
      .raw()
      .toBuffer();
    const stats = redStats(topCell, 2400, 900);
    expect(stats.count).toBeGreaterThan(20000);
    expect(stats.count).toBeLessThan(40000);
  });

  it("rounded corners stay clean for JPEG inputs on the default path", async () => {
    // The fast path used to keep the input format, so a JPEG cell buffer hit
    // the cornerRadius dest-in mask, JPEG cannot store the masked alpha, and
    // the corners flattened to black. The general path already emitted PNG,
    // which made corners snap between black and correct as zoom crossed 1.
    const markerJpeg = await sharp(marker).jpeg({ quality: 95 }).toBuffer();
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "marker.jpg", contentType: "image/jpeg", content: markerJpeg },
      {
        name: "settings",
        content: JSON.stringify({
          templateId: "2-h-equal",
          gap: 0,
          cornerRadius: 200,
          cells: [{ imageIndex: 0, objectFit: "contain", panX: 0, panY: 0, zoom: 1 }],
        }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });
    expect(res.statusCode).toBe(200);
    const dlRes = await app.inject({
      method: "GET",
      url: JSON.parse(res.body).downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    // The masked corner must show the white canvas, not a black block.
    const raw = await sharp(dlRes.rawPayload).removeAlpha().raw().toBuffer();
    const meta = await sharp(dlRes.rawPayload).metadata();
    const w = meta.width ?? 0;
    const corner = [raw[(5 * w + 5) * 3], raw[(5 * w + 5) * 3 + 1], raw[(5 * w + 5) * 3 + 2]];
    expect(corner[0]).toBeGreaterThan(200);
    expect(corner[1]).toBeGreaterThan(200);
    expect(corner[2]).toBeGreaterThan(200);
  });

  it("zoom 1 with no pan stays byte-identical to a plain contain resize", async () => {
    const output = await runCollage({ zoom: 1 });

    const cell = await sharp(marker)
      .resize(CELL_W, CELL_H, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .toBuffer();
    const expected = await sharp({
      create: { width: 2400, height: 1800, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .composite([{ input: cell, left: 0, top: 0 }])
      .png()
      .toBuffer();

    const [got, want] = await Promise.all([
      sharp(output).removeAlpha().raw().toBuffer(),
      sharp(expected).removeAlpha().raw().toBuffer(),
    ]);
    expect(got.equals(want)).toBe(true);
  });
});

/**
 * Pan range contract and cover-cell encoding (#718).
 *
 * The preview clamps drag pan to +/-200 and the settings panel submits the
 * value untouched, but the schema rejected anything past +/-100, so dragging
 * a cell more than half its width off-centre made processing fail with a 400.
 * The schema now matches the preview clamp. In cover mode the extract already
 * clamps at the image edge, so values past 100 saturate rather than misplace.
 *
 * Cover cells also kept the input format for the cell buffer; a JPEG buffer
 * cannot store the alpha the cornerRadius dest-in mask cuts, so rounded
 * corners flattened to black. Same defect #717 fixed on the contain fast path.
 */
describe("Collage pan range and cover cells (#718)", () => {
  const CELL_W = 1200;
  const CELL_H = 1800;

  let marker: Buffer;

  beforeAll(async () => {
    const raw = Buffer.alloc(200 * 100 * 3);
    for (let i = 0; i < raw.length; i += 3) raw[i + 2] = 255;
    for (let y = 45; y < 55; y++) {
      for (let x = 95; x < 105; x++) {
        const i = (y * 200 + x) * 3;
        raw[i] = 255;
        raw[i + 2] = 0;
      }
    }
    marker = await sharp(raw, { raw: { width: 200, height: 100, channels: 3 } })
      .png()
      .toBuffer();
  });

  async function submitCollage(settings: Record<string, unknown>, content = marker, ext = "png") {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: `marker.${ext}`, contentType: `image/${ext}`, content },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal", gap: 0, ...settings }),
      },
    ]);
    return app.inject({
      method: "POST",
      url: "/api/v1/tools/image/collage",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });
  }

  async function download(res: { body: string }) {
    const dlRes = await app.inject({
      method: "GET",
      url: JSON.parse(res.body).downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    return dlRes.rawPayload;
  }

  /** RGBA pixels of the left cell. */
  async function leftCell(output: Buffer) {
    return sharp(output)
      .extract({ left: 0, top: 0, width: CELL_W, height: CELL_H })
      .ensureAlpha()
      .raw()
      .toBuffer();
  }

  function countRed(data: Buffer) {
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 200 && data[i + 1] < 60 && data[i + 2] < 60) count++;
    }
    return count;
  }

  it("contain accepts panX past 100 in both directions", async () => {
    // 200x100 marker in a 1200x1800 cell fits to 1200x600; panX +/-150 moves
    // it 1800px sideways, fully outside the cell, leaving plain background.
    for (const panX of [150, -150]) {
      const res = await submitCollage({
        cells: [{ imageIndex: 0, objectFit: "contain", panX, panY: 0, zoom: 1 }],
      });
      expect(res.statusCode).toBe(200);

      const data = await leftCell(await download(res));
      expect(countRed(data)).toBe(0);
      const centre = (900 * CELL_W + 600) * 4;
      expect(data[centre]).toBeGreaterThan(200);
      expect(data[centre + 1]).toBeGreaterThan(200);
      expect(data[centre + 2]).toBeGreaterThan(200);
    }
  });

  it("contain accepts panY past 100 in both directions", async () => {
    // Content is 600px tall centred at y=600; panY +/-150 moves it 2700px,
    // fully outside the 1800px cell.
    for (const panY of [150, -150]) {
      const res = await submitCollage({
        cells: [{ imageIndex: 0, objectFit: "contain", panX: 0, panY, zoom: 1 }],
      });
      expect(res.statusCode).toBe(200);
      expect(countRed(await leftCell(await download(res)))).toBe(0);
    }
  });

  it("accepts the exact +/-200 boundary", async () => {
    const res = await submitCollage({
      cells: [{ imageIndex: 0, objectFit: "contain", panX: 200, panY: -200, zoom: 1 }],
    });
    expect(res.statusCode).toBe(200);
    expect(countRed(await leftCell(await download(res)))).toBe(0);
  });

  it("rejects pan values past the preview clamp of 200", async () => {
    for (const pan of [{ panX: 250 }, { panX: -250 }, { panY: 250 }, { panY: -250 }]) {
      const res = await submitCollage({
        cells: [{ imageIndex: 0, objectFit: "contain", panX: 0, panY: 0, zoom: 1, ...pan }],
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it("contain keeps panning past 100 under zoom instead of clamping", async () => {
    // Zoom 2 doubles the fit to 2400x1200, so panX 150 puts the content edge
    // exactly at the cell edge: an empty cell. A clamp at 100 would leave a
    // 600px strip of the blue field visible, which zoom 1 cannot detect
    // because there 100 and 150 both empty the cell.
    const res = await submitCollage({
      cells: [{ imageIndex: 0, objectFit: "contain", panX: 150, panY: 0, zoom: 2 }],
    });
    expect(res.statusCode).toBe(200);

    const data = await leftCell(await download(res));
    let nonWhite = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) nonWhite++;
    }
    expect(nonWhite).toBe(0);
  });

  it("cover pan saturates at the negative edges too", async () => {
    // Negative saturation rides the other clamp bound (min against
    // resized - cell), which the widened range makes load-bearing for the
    // first time. Zoom 2 gives overflow on both axes (7200x3600 resize),
    // so this exercises the X and Y clamps together.
    const atNeg150 = await submitCollage({
      cells: [{ imageIndex: 0, objectFit: "cover", panX: -150, panY: -150, zoom: 2 }],
    });
    const atNeg100 = await submitCollage({
      cells: [{ imageIndex: 0, objectFit: "cover", panX: -100, panY: -100, zoom: 2 }],
    });
    expect(atNeg150.statusCode).toBe(200);
    expect(atNeg100.statusCode).toBe(200);

    const [a, b] = await Promise.all([download(atNeg150), download(atNeg100)]);
    expect(a.equals(b)).toBe(true);
  });

  it("cover pan past 100 saturates at the image edge", async () => {
    // The cover extract clamps at the resized image's edge, so panX 150 must
    // produce exactly the panX 100 output rather than shift further or fail.
    const at150 = await submitCollage({
      cells: [{ imageIndex: 0, objectFit: "cover", panX: 150, panY: 0, zoom: 1 }],
    });
    const at100 = await submitCollage({
      cells: [{ imageIndex: 0, objectFit: "cover", panX: 100, panY: 0, zoom: 1 }],
    });
    expect(at150.statusCode).toBe(200);
    expect(at100.statusCode).toBe(200);

    const [a, b] = await Promise.all([download(at150), download(at100)]);
    expect(a.equals(b)).toBe(true);
  });

  it("rounded corners stay clean for JPEG inputs in cover mode", async () => {
    // No cells at all: the default fit is cover. The cell buffer used to keep
    // the input format, so the cornerRadius dest-in mask re-encoded to JPEG,
    // dropped the masked alpha, and the corners flattened to black.
    const markerJpeg = await sharp(marker).jpeg({ quality: 95 }).toBuffer();
    const res = await submitCollage({ cornerRadius: 200 }, markerJpeg, "jpeg");
    expect(res.statusCode).toBe(200);

    const output = await download(res);
    const raw = await sharp(output).removeAlpha().raw().toBuffer();
    const meta = await sharp(output).metadata();
    const w = meta.width ?? 0;
    const corner = [raw[(5 * w + 5) * 3], raw[(5 * w + 5) * 3 + 1], raw[(5 * w + 5) * 3 + 2]];
    expect(corner[0]).toBeGreaterThan(200);
    expect(corner[1]).toBeGreaterThan(200);
    expect(corner[2]).toBeGreaterThan(200);
  });
});
