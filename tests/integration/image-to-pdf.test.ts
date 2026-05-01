/**
 * Integration tests for the image-to-pdf tool.
 *
 * Converts one or more images into a PDF document. Custom route that
 * accepts multiple file uploads and settings for page size, orientation,
 * and margin.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
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

describe("image-to-pdf", () => {
  it("converts a single image to PDF", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-pdf",
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
      url: "/api/v1/tools/image-to-pdf",
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
      url: "/api/v1/tools/image-to-pdf",
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
      url: "/api/v1/tools/image-to-pdf",
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
      url: "/api/v1/tools/image-to-pdf",
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
      url: "/api/v1/tools/image-to-pdf",
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
      url: "/api/v1/tools/image-to-pdf",
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
      url: "/api/v1/tools/image-to-pdf",
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
      url: "/api/v1/tools/image-to-pdf",
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
      url: "/api/v1/tools/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("Invalid settings");
  });

  // ── Branch coverage: lines 143-147 (processing failure) ───────────

  it("returns 422 when processing fails on corrupted image data", async () => {
    const corruptedBuffer = Buffer.alloc(100, 0xff);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "bad.png", contentType: "image/png", content: corruptedBuffer },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(422);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("PDF creation failed");
  });

  // ── HEIC input handling ───────────────────────────────────────────

  it("converts HEIC image to PDF", { timeout: 120_000 }, async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-pdf",
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
      url: "/api/v1/tools/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(1);
  });

  // ── WebP input ────────────────────────────────────────────────────

  it("converts WebP image to PDF", async () => {
    const WEBP = readFileSync(join(FIXTURES, "test-50x50.webp"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.webp", contentType: "image/webp", content: WEBP },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(1);
  });

  // ── Tiny 1x1 input ───────────────────────────────────────────────

  it("converts 1x1 pixel image to PDF", async () => {
    const TINY = readFileSync(join(FIXTURES, "test-1x1.png"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", contentType: "image/png", content: TINY },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-pdf",
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
    const WEBP = readFileSync(join(FIXTURES, "test-50x50.webp"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "p1.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "p2.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "p3.webp", contentType: "image/webp", content: WEBP },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-pdf",
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
      url: "/api/v1/tools/image-to-pdf",
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
      url: "/api/v1/tools/image-to-pdf",
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
      url: "/api/v1/tools/image-to-pdf",
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
      url: "/api/v1/tools/image-to-pdf",
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
      url: "/api/v1/tools/image-to-pdf",
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
      url: "/api/v1/tools/image-to-pdf",
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
      url: "/api/v1/tools/image-to-pdf",
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
      url: "/api/v1/tools/image-to-pdf",
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
      url: "/api/v1/tools/image-to-pdf",
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
      url: "/api/v1/tools/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.compression.targetRequested).toBe(500 * 1024);
  });

  // ── Large stress file ────────────────────────────────────────────

  it("converts stress-large.jpg to PDF", async () => {
    const LARGE = readFileSync(join(FIXTURES, "content", "stress-large.jpg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "large.jpg", contentType: "image/jpeg", content: LARGE },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-pdf",
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
    const WEBP = readFileSync(join(FIXTURES, "test-50x50.webp"));
    const TINY = readFileSync(join(FIXTURES, "test-1x1.png"));
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
      url: "/api/v1/tools/image-to-pdf",
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
      url: "/api/v1/tools/image-to-pdf",
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
      url: "/api/v1/tools/image-to-pdf",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  // ── Multi-image with target size ─────────────────────────────────

  it("compresses 3-image PDF with target size", async () => {
    const WEBP = readFileSync(join(FIXTURES, "test-50x50.webp"));
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
      url: "/api/v1/tools/image-to-pdf",
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
      url: "/api/v1/tools/image-to-pdf",
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
      const HEIF = readFileSync(join(FIXTURES, "content", "motorcycle.heif"));
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "photo.heif", contentType: "image/heif", content: HEIF },
        { name: "settings", content: JSON.stringify({}) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image-to-pdf",
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
    const GIF = readFileSync(join(FIXTURES, "animated.gif"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "anim.gif", contentType: "image/gif", content: GIF },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-pdf",
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
    const SVG = readFileSync(join(FIXTURES, "test-100x100.svg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "icon.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.pages).toBe(1);
    expect(json.processedSize).toBeGreaterThan(0);
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
      url: "/api/v1/tools/image-to-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });
});
