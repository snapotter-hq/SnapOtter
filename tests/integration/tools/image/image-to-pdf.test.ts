/**
 * Integration tests for the image-to-pdf tool.
 *
 * Converts one or more images into a PDF document. Custom route that
 * accepts multiple file uploads and settings for page size, orientation,
 * and margin.
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

describe("image-to-pdf", () => {
  it("converts a single image to PDF", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
    expect(json.jobId).toBeDefined();
    expect(json.pages).toBe(1);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  it("output is valid PDF (magic bytes)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: json.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dlRes.statusCode).toBe(200);
    const pdfBuffer = Buffer.from(dlRes.rawPayload);
    // PDF files start with %PDF-
    expect(pdfBuffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("converts multiple images to multi-page PDF", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "page1.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "page2.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(2);
  });

  it.each(["A4", "Letter", "A3", "A5"] as const)("supports page size: %s", async (pageSize) => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ pageSize }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("supports landscape orientation", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ orientation: "landscape" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("supports custom margin", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ margin: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("rejects request without any files", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("No image files");
  });

  it("rejects invalid settings JSON", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "not-json" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects margin out of range", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ margin: 999 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Branch coverage: lines 51-55 (multipart parse error) ──────────

  it("rejects invalid Zod settings (invalid pageSize)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ pageSize: "B4" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("Invalid settings");
  });

  // ── Branch coverage: lines 143-147 (processing failure) ───────────

  it("returns 400 when image format is unrecognized", async () => {
    const corruptedBuffer = Buffer.alloc(100, 0xff);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "bad.png", contentType: "image/png", content: corruptedBuffer },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("Invalid image");
  });

  // ── HEIC input handling ───────────────────────────────────────────

  it("converts HEIC image to PDF", { timeout: 120_000 }, async () => {
    const HEIC = readFixture(fixtures.image.base.heic200);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(1);
    expect(json.processedSize).toBeGreaterThan(0);

    // Verify it's a valid PDF
    const dlRes = await app.inject({
      method: "GET",
      url: json.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const pdfBuffer = Buffer.from(dlRes.rawPayload);
    expect(pdfBuffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  // ── All settings combined ─────────────────────────────────────────

  it("handles landscape A3 with custom margin", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          pageSize: "A3",
          orientation: "landscape",
          margin: 100,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(1);
  });

  // ── WebP input ────────────────────────────────────────────────────

  it("converts WebP image to PDF", async () => {
    const WEBP = readFixture(fixtures.image.base.webp50);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.webp", contentType: "image/webp", content: WEBP },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(1);
  });

  // ── Tiny 1x1 input ───────────────────────────────────────────────

  it("converts 1x1 pixel image to PDF", async () => {
    const TINY = readFixture(fixtures.image.edge.px1);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", contentType: "image/png", content: TINY },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(1);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  // ── Three images in a single PDF ──────────────────────────────────

  it("creates 3-page PDF from three images", async () => {
    const WEBP = readFixture(fixtures.image.base.webp50);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "p1.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "p2.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "p3.webp", contentType: "image/webp", content: WEBP },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(3);
  });

  // ── No settings field at all ──────────────────────────────────────

  it("works when no settings field is provided (uses defaults)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(1);
  });

  // ── Target file size ──────────────────────────────────────────────

  it("respects target file size and returns compression info", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ targetSize: { value: 5, unit: "MB" } }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.compression).toBeDefined();
    expect(json.compression.targetRequested).toBe(5 * 1024 * 1024);
    expect(json.compression.targetMet).toBe(true);
    expect(json.compression.jpegQuality).toBeGreaterThanOrEqual(10);
    expect(json.compression.jpegQuality).toBeLessThanOrEqual(95);
    expect(json.processedSize).toBeLessThanOrEqual(5 * 1024 * 1024);
  });

  it("returns targetMet=false when target is impossibly small", async () => {
    // Generate an 800x800 high-frequency pattern image that cannot compress
    // below 50KB even at JPEG quality 10, making the target impossible to meet.
    const w = 800;
    const h = 800;
    const raw = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 3;
        raw[idx] = (x * 7 + y * 13) % 256;
        raw[idx + 1] = (x * 11 + y * 3) % 256;
        raw[idx + 2] = (x * 5 + y * 17) % 256;
      }
    }
    const sharp = (await import("sharp")).default;
    const largePng = await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
      .png()
      .toBuffer();

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "big.png", contentType: "image/png", content: largePng },
      {
        name: "settings",
        content: JSON.stringify({ targetSize: { value: 50, unit: "KB" } }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.compression).toBeDefined();
    expect(json.compression.targetMet).toBe(false);
    expect(json.compression.jpegQuality).toBe(10);
  });

  it("rejects target size below 50KB", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ targetSize: { value: 10, unit: "KB" } }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("at least 50KB");
  });

  it("rejects negative target size value", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ targetSize: { value: -1, unit: "MB" } }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects invalid target size unit", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ targetSize: { value: 1, unit: "GB" } }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("compresses multi-image PDF to meet target size", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "p1.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "p2.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ targetSize: { value: 5, unit: "MB" } }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(2);
    expect(json.compression).toBeDefined();
    expect(json.compression.targetMet).toBe(true);
  });

  it("omits compression field when no targetSize is provided", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.compression).toBeUndefined();
  });

  it("accepts decimal MB values for target size", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ targetSize: { value: 1.5, unit: "MB" } }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.compression.targetRequested).toBe(Math.round(1.5 * 1024 * 1024));
  });

  it("accepts KB unit for target size", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ targetSize: { value: 500, unit: "KB" } }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.compression.targetRequested).toBe(500 * 1024);
  });

  // ── Large stress file ────────────────────────────────────────────

  it("converts stress-large.jpg to PDF", async () => {
    const LARGE = readFixture(fixtures.image.stressLarge);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "large.jpg", contentType: "image/jpeg", content: LARGE },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(1);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  // ── 5+ images batch PDF ──────────────────────────────────────────

  it("creates 5-page PDF from five images", async () => {
    const WEBP = readFixture(fixtures.image.base.webp50);
    const TINY = readFixture(fixtures.image.edge.px1);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "p1.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "p2.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "p3.webp", contentType: "image/webp", content: WEBP },
      { name: "file", filename: "p4.png", contentType: "image/png", content: TINY },
      { name: "file", filename: "p5.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(5);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  // ── A5 portrait with zero margin ─────────────────────────────────

  it("handles A5 portrait with zero margin", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          pageSize: "A5",
          orientation: "portrait",
          margin: 0,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(1);
  });

  // ── Rejects unauthenticated request ──────────────────────────────

  it("rejects unauthenticated request", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  // ── Multi-image with target size ─────────────────────────────────

  it("compresses 3-image PDF with target size", async () => {
    const WEBP = readFixture(fixtures.image.base.webp50);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "p1.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "p2.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "p3.webp", contentType: "image/webp", content: WEBP },
      {
        name: "settings",
        content: JSON.stringify({ targetSize: { value: 2, unit: "MB" } }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(3);
    expect(json.compression).toBeDefined();
    expect(json.compression.targetMet).toBe(true);
  });

  // ── Letter landscape ─────────────────────────────────────────────

  it("handles Letter landscape", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          pageSize: "Letter",
          orientation: "landscape",
          margin: 30,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(1);
  });

  // ── HEIF input ────────────────────────────────────────────────────

  it(
    "converts HEIF image to PDF",
    { timeout: 120_000 },
    async () => {
      const HEIF = readFixture(fixtures.image.motorcycle);
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "photo.heif", contentType: "image/heif", content: HEIF },
        { name: "settings", content: JSON.stringify({}) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/image-to-pdf",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        body,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.pages).toBe(1);
      expect(json.processedSize).toBeGreaterThan(0);
    },
    60_000,
  );

  // ── Animated GIF input ──────────────────────────────────────────

  it("converts animated GIF to PDF", async () => {
    const GIF = readFixture(fixtures.image.animated.gif);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "anim.gif", contentType: "image/gif", content: GIF },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(1);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  // ── SVG input ───────────────────────────────────────────────────

  it("converts SVG to PDF", async () => {
    const SVG = readFixture(fixtures.image.base.svg100);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "icon.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(1);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  // ── TIFF input ────────────────────────────────────────────────────

  it("converts TIFF image to PDF", async () => {
    const TIFF = readFixture(fixtures.image.formats("tiff"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.tiff", contentType: "image/tiff", content: TIFF },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(1);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  // ── Mixed format multi-page PDF ─────────────────────────────────

  it("creates multi-page PDF from mixed formats (PNG + JPG + WebP + TIFF)", async () => {
    const WEBP = readFixture(fixtures.image.base.webp50);
    const TIFF = readFixture(fixtures.image.formats("tiff"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "p1.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "p2.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "p3.webp", contentType: "image/webp", content: WEBP },
      { name: "file", filename: "p4.tiff", contentType: "image/tiff", content: TIFF },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(4);
  });

  // ── PDF output size is positive ─────────────────────────────────

  it("PDF output is larger than zero bytes", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.processedSize).toBeGreaterThan(0);
    expect(json.originalSize).toBeGreaterThan(0);
    expect(json.downloadUrl).toContain("/api/v1/download/");
  });

  // ── Negative margin rejected ────────────────────────────────────

  it("rejects negative margin value", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ margin: -1 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Maximum margin boundary ─────────────────────────────────────

  it("accepts maximum margin (500)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ margin: 500 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(1);
  });

  // ── Margin exceeding max rejected ───────────────────────────────

  it("rejects margin exceeding max (>500)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ margin: 501 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Target size with KB unit at boundary ────────────────────────

  it("accepts target size at minimum boundary (50KB)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ targetSize: { value: 50, unit: "KB" } }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.compression).toBeDefined();
    expect(json.compression.targetRequested).toBe(50 * 1024);
  });

  // ── Rejects invalid orientation ──────────────────────────────────

  it("rejects invalid orientation value", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ orientation: "sideways" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Rejects Legal as unsupported page size ──────────────────────

  it("rejects Legal page size (not supported)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ pageSize: "Legal" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Portrait A4 explicitly ──────────────────────────────────────

  it("creates portrait A4 PDF explicitly", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          pageSize: "A4",
          orientation: "portrait",
          margin: 20,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(1);
    expect(json.processedSize).toBeGreaterThan(0);

    // Verify PDF magic bytes
    const dlRes = await app.inject({
      method: "GET",
      url: json.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dlRes.rawPayload.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  // ── Multi-image with all settings ────────────────────────────────

  it("creates multi-page PDF with all settings combined", async () => {
    const WEBP = readFixture(fixtures.image.base.webp50);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "p1.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "p2.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "p3.webp", contentType: "image/webp", content: WEBP },
      {
        name: "settings",
        content: JSON.stringify({
          pageSize: "A5",
          orientation: "landscape",
          margin: 50,
          targetSize: { value: 5, unit: "MB" },
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(3);
    expect(json.compression).toBeDefined();
    expect(json.compression.targetMet).toBe(true);
  });

  // ── collate=false produces individual PDFs in ZIP ───────────────

  it("creates individual PDFs in ZIP when collate is false", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "page1.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "page2.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ collate: false }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(2);
    expect(json.collated).toBe(false);
    expect(json.downloadUrl).toContain("images.zip");
    expect(json.processedSize).toBeGreaterThan(0);
  });

  // ── collate=false with single image returns single PDF in ZIP ────

  it("creates single PDF in ZIP when collate is false with one image", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "solo.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ collate: false }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(1);
    expect(json.collated).toBe(false);
  });

  // ── collate=false with target size ──────────────────────────────

  it("creates individual compressed PDFs when collate=false with targetSize", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "p1.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "p2.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          collate: false,
          targetSize: { value: 5, unit: "MB" },
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(2);
    expect(json.collated).toBe(false);
    expect(json.compression).toBeDefined();
  });

  // ── collate=false with all settings ─────────────────────────────

  it("creates individual PDFs with all settings combined when collate=false", async () => {
    const WEBP = readFixture(fixtures.image.base.webp50);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "c.webp", contentType: "image/webp", content: WEBP },
      {
        name: "settings",
        content: JSON.stringify({
          pageSize: "A5",
          orientation: "landscape",
          margin: 30,
          collate: false,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(3);
    expect(json.collated).toBe(false);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  // ── collate=true explicitly (same as default) ──────────────────

  it("collate=true produces collated PDF (same as default)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "p1.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "p2.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ collate: true }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(2);
    expect(json.downloadUrl).toContain("images.pdf");
    expect(json.collated).toBeUndefined();
  });

  // ── A3 landscape with max margin ───────────────────────────────

  it("handles A3 landscape with max margin (500)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          pageSize: "A3",
          orientation: "landscape",
          margin: 500,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(1);
  });
});
