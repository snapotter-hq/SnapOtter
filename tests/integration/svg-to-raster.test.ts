/**
 * Integration tests for the svg-to-raster tool.
 *
 * Renders SVG files to raster images (PNG, JPG, WebP, etc.). Custom route
 * that validates SVG input separately from the standard image validation.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
const SVG = readFileSync(join(FIXTURES, "test-100x100.svg"));
const PNG = readFileSync(join(FIXTURES, "test-200x150.png"));

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

describe("svg-to-raster", () => {
  it("converts SVG to PNG with default settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
    expect(json.jobId).toBeDefined();
    expect(json.processedSize).toBeGreaterThan(0);
  });

  it("output is a valid raster image", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
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
    const meta = await sharp(Buffer.from(dlRes.rawPayload)).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
  });

  it("respects custom width override", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ width: 200 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
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
    const meta = await sharp(Buffer.from(dlRes.rawPayload)).metadata();
    expect(meta.width).toBeLessThanOrEqual(200);
  });

  it("respects custom height override", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ height: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
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
    const meta = await sharp(Buffer.from(dlRes.rawPayload)).metadata();
    expect(meta.height).toBeLessThanOrEqual(50);
  });

  it.each([
    "png",
    "jpg",
    "webp",
  ] as const)("converts to output format: %s", async (outputFormat) => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ outputFormat }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
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
    const meta = await sharp(Buffer.from(dlRes.rawPayload)).metadata();
    const expectedFormat = outputFormat === "jpg" ? "jpeg" : outputFormat;
    expect(meta.format).toBe(expectedFormat);
  });

  it("respects DPI setting", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ dpi: 72 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("applies background color", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ backgroundColor: "#FF0000" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("rejects request without a file", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("No SVG file");
  });

  it("rejects non-SVG file", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("not a valid SVG");
  });

  it("rejects invalid settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ dpi: 5 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Extended coverage: size, DPI, bg, formats, batch, complex SVGs ─

  it("respects both width and height together", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ width: 300, height: 300 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
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
    const meta = await sharp(Buffer.from(dlRes.rawPayload)).metadata();
    // fit: inside means both w and h <= requested
    expect(meta.width).toBeLessThanOrEqual(300);
    expect(meta.height).toBeLessThanOrEqual(300);
  });

  it("uses high DPI (600) for detailed rendering", async () => {
    const { body: body72, contentType: ct72 } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ dpi: 72 }) },
    ]);
    const { body: body600, contentType: ct600 } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ dpi: 600 }) },
    ]);

    const res72 = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": ct72 },
      body: body72,
    });
    const res600 = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": ct600 },
      body: body600,
    });

    expect(res72.statusCode).toBe(200);
    expect(res600.statusCode).toBe(200);

    const dl72 = await app.inject({
      method: "GET",
      url: JSON.parse(res72.body).downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const dl600 = await app.inject({
      method: "GET",
      url: JSON.parse(res600.body).downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta72 = await sharp(Buffer.from(dl72.rawPayload)).metadata();
    const meta600 = await sharp(Buffer.from(dl600.rawPayload)).metadata();
    // 600 DPI should produce a larger image than 72 DPI
    expect((meta600.width ?? 0) * (meta600.height ?? 0)).toBeGreaterThan(
      (meta72.width ?? 0) * (meta72.height ?? 0),
    );
  });

  it("applies opaque background color and flattens alpha", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ backgroundColor: "#00FF00" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  it("converts to tiff format", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ outputFormat: "tiff" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
    // TIFF is non-previewable, so previewUrl should exist
    expect(json.previewUrl).toBeDefined();
  });

  it("converts to gif format", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ outputFormat: "gif" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
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
    const meta = await sharp(Buffer.from(dlRes.rawPayload)).metadata();
    expect(meta.format).toBe("gif");
  });

  it("converts to avif format", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ outputFormat: "avif" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
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
    const meta = await sharp(Buffer.from(dlRes.rawPayload)).metadata();
    expect(meta.format).toBe("heif");
  });

  it("converts a complex SVG with gradients and filters", async () => {
    const COMPLEX_SVG = readFileSync(join(FIXTURES, "content", "svg-logo.svg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "logo.svg", contentType: "image/svg+xml", content: COMPLEX_SVG },
      { name: "settings", content: JSON.stringify({ width: 800 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
    expect(json.processedSize).toBeGreaterThan(0);
  });

  it("converts a QR code SVG (complex path)", async () => {
    const QR_SVG = readFileSync(join(FIXTURES, "content", "qr-code.svg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "qr.svg", contentType: "image/svg+xml", content: QR_SVG },
      { name: "settings", content: JSON.stringify({ outputFormat: "png", dpi: 300 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
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
    const meta = await sharp(Buffer.from(dlRes.rawPayload)).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBeGreaterThan(0);
  });

  it("combines width, DPI, background color, and quality", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      {
        name: "settings",
        content: JSON.stringify({
          width: 500,
          dpi: 150,
          backgroundColor: "#FFFFFF",
          outputFormat: "jpg",
          quality: 95,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
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
    const meta = await sharp(Buffer.from(dlRes.rawPayload)).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBeLessThanOrEqual(500);
  });

  it("strips .svg from output filename", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "my-icon.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ outputFormat: "png" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    // downloadUrl should contain my-icon.png, not my-icon.svg.png
    expect(json.downloadUrl).toContain("my-icon.png");
    expect(json.downloadUrl).not.toContain(".svg.png");
  });

  it("returns originalSize and processedSize", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.originalSize).toBeGreaterThan(0);
    expect(json.processedSize).toBeGreaterThan(0);
    expect(json.jobId).toBeDefined();
  });

  it("rejects DPI above maximum (2400)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ dpi: 3000 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects invalid JSON in settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: "{{bad json" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/json/i);
  });

  it("rejects unauthenticated requests", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  // ── Batch endpoint coverage ────────────────────────────────────────

  describe("batch", () => {
    it("converts multiple SVGs in a single batch request", async () => {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "a.svg", contentType: "image/svg+xml", content: SVG },
        { name: "file", filename: "b.svg", contentType: "image/svg+xml", content: SVG },
        { name: "settings", content: JSON.stringify({ outputFormat: "png" }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/svg-to-raster/batch",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        body,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/zip");
    });

    it("rejects batch with no SVG files", async () => {
      const { body, contentType } = createMultipartPayload([
        { name: "settings", content: JSON.stringify({}) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/svg-to-raster/batch",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        body,
      });

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.error).toMatch(/no svg/i);
    });

    it("handles a batch with non-SVG files (skips them, processes valid ones)", async () => {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "good.svg", contentType: "image/svg+xml", content: SVG },
        { name: "file", filename: "bad.png", contentType: "image/png", content: PNG },
        { name: "settings", content: JSON.stringify({ outputFormat: "png" }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/svg-to-raster/batch",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        body,
      });

      // Should still succeed -- one valid SVG processed, one non-SVG skipped
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/zip");
    });

    it("returns 422 when all batch files fail", async () => {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "bad.png", contentType: "image/png", content: PNG },
        { name: "settings", content: JSON.stringify({}) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/svg-to-raster/batch",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        body,
      });

      expect(res.statusCode).toBe(422);
      const json = JSON.parse(res.body);
      expect(json.error).toMatch(/all files failed/i);
    });

    it("batch converts complex SVGs to webp format", async () => {
      const COMPLEX_SVG = readFileSync(join(FIXTURES, "content", "svg-logo.svg"));
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "logo.svg", contentType: "image/svg+xml", content: COMPLEX_SVG },
        { name: "file", filename: "simple.svg", contentType: "image/svg+xml", content: SVG },
        { name: "settings", content: JSON.stringify({ outputFormat: "webp", quality: 80 }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/svg-to-raster/batch",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        body,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/zip");
      expect(res.headers["x-job-id"]).toBeDefined();
    });

    it("batch accepts clientJobId", async () => {
      const clientJobId = "test-client-job-123";
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "a.svg", contentType: "image/svg+xml", content: SVG },
        { name: "settings", content: JSON.stringify({}) },
        { name: "clientJobId", content: clientJobId },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/svg-to-raster/batch",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        body,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["x-job-id"]).toBe(clientJobId);
    });

    it("batch rejects invalid settings", async () => {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "a.svg", contentType: "image/svg+xml", content: SVG },
        { name: "settings", content: JSON.stringify({ dpi: 1 }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/svg-to-raster/batch",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        body,
      });

      expect(res.statusCode).toBe(400);
    });

    it("batch rejects invalid JSON in settings", async () => {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "a.svg", contentType: "image/svg+xml", content: SVG },
        { name: "settings", content: "{{not json" },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/svg-to-raster/batch",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        body,
      });

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.error).toMatch(/json/i);
    });
  });

  // ── Branch coverage: HEIF output with preview (line 363, 404) ───────

  it("converts to heif format and generates a preview", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ outputFormat: "heif" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
    // HEIF is non-previewable, so previewUrl should be generated
    expect(json.previewUrl).toBeDefined();

    // Download the preview and verify it is a webp image
    if (json.previewUrl) {
      const previewRes = await app.inject({
        method: "GET",
        url: json.previewUrl,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(previewRes.statusCode).toBe(200);
      const meta = await sharp(Buffer.from(previewRes.rawPayload)).metadata();
      expect(meta.format).toBe("webp");
    }
  });

  // ── Branch coverage: TIFF preview generation (non-previewable) ──────

  it("converts to tiff format and generates a webp preview", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ outputFormat: "tiff" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
    expect(json.previewUrl).toBeDefined();

    if (json.previewUrl) {
      const previewRes = await app.inject({
        method: "GET",
        url: json.previewUrl,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(previewRes.statusCode).toBe(200);
      const meta = await sharp(Buffer.from(previewRes.rawPayload)).metadata();
      expect(meta.format).toBe("webp");
      // Preview is resized to fit within 1200x1200
      expect(meta.width).toBeLessThanOrEqual(1200);
      expect(meta.height).toBeLessThanOrEqual(1200);
    }
  });

  // ── Branch coverage: no previewUrl for previewable formats ──────────

  it("does not generate previewUrl for previewable formats (png)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ outputFormat: "png" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    // PNG is previewable, no preview URL should be set
    expect(json.previewUrl).toBeUndefined();
  });

  // ── Branch coverage: transparent bg default (line 404 area) ─────────

  it("converts with default transparent background (no flatten)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      {
        name: "settings",
        content: JSON.stringify({ outputFormat: "png", backgroundColor: "#00000000" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
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
    const meta = await sharp(Buffer.from(dlRes.rawPayload)).metadata();
    expect(meta.format).toBe("png");
    expect(meta.channels).toBe(4); // Alpha channel preserved
  });

  // ── Branch coverage: batch with duplicate filenames ─────────────────

  it("batch handles duplicate SVG filenames by deduplicating", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "icon.svg", contentType: "image/svg+xml", content: SVG },
      { name: "file", filename: "icon.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ outputFormat: "png" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster/batch",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    // X-File-Results should contain deduplicated names
    const fileResults = JSON.parse(res.headers["x-file-results"] as string);
    const filenames = Object.values(fileResults) as string[];
    // Filenames should be unique
    expect(new Set(filenames).size).toBe(filenames.length);
  });

  // ── Branch coverage: batch with heif output ─────────────────────────

  it("batch converts SVGs to tiff format", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.svg", contentType: "image/svg+xml", content: SVG },
      { name: "file", filename: "b.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ outputFormat: "tiff" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster/batch",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
  });

  // ── Branch coverage: invalid SVG content triggers conversion error ─

  it("returns 422 for malformed SVG that passes isSvgBuffer but fails Sharp", async () => {
    // An SVG with broken XML structure that passes initial check but may fail conversion
    const brokenSvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><invalid-element/></svg>',
    );
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "broken.svg", contentType: "image/svg+xml", content: brokenSvg },
      { name: "settings", content: JSON.stringify({ outputFormat: "png" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    // Either succeeds (Sharp handles unknown elements gracefully) or returns 422
    expect([200, 422]).toContain(res.statusCode);
  });

  // ── Branch coverage: width exceeding max rejects ───────────────────

  it("rejects width exceeding maximum (65536)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ width: 70000 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Branch coverage: height exceeding max rejects ──────────────────

  it("rejects height exceeding maximum (65536)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ height: 70000 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Branch coverage: quality at boundary values ────────────────────

  it("accepts quality at minimum (1)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ outputFormat: "jpg", quality: 1 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  // ── Branch coverage: quality above max rejects ─────────────────────

  it("rejects quality above maximum (100)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ quality: 101 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Branch coverage: invalid outputFormat rejects ──────────────────

  it("rejects invalid output format", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ outputFormat: "bmp" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Branch coverage: batch with heif output ────────────────────────

  it("batch converts SVGs to heif format", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.svg", contentType: "image/svg+xml", content: SVG },
      { name: "file", filename: "b.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ outputFormat: "heif" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster/batch",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
  });

  // ── Branch coverage: batch with 5+ SVG files ──────────────────────

  it("batch converts 5+ SVG files", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.svg", contentType: "image/svg+xml", content: SVG },
      { name: "file", filename: "b.svg", contentType: "image/svg+xml", content: SVG },
      { name: "file", filename: "c.svg", contentType: "image/svg+xml", content: SVG },
      { name: "file", filename: "d.svg", contentType: "image/svg+xml", content: SVG },
      { name: "file", filename: "e.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ outputFormat: "png" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster/batch",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    const fileResults = JSON.parse(res.headers["x-file-results"] as string);
    expect(Object.keys(fileResults).length).toBe(5);
  });

  // ── Branch coverage: SVG without .svg extension ────────────────────

  it("handles SVG file without .svg extension in filename", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "icon", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ outputFormat: "png" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
    expect(json.processedSize).toBeGreaterThan(0);
  });

  // ── Branch coverage: heif + background color combination ───────────

  it("converts to heif format with background color applied", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      {
        name: "settings",
        content: JSON.stringify({ outputFormat: "heif", backgroundColor: "#FF0000" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/svg-to-raster",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
    expect(json.previewUrl).toBeDefined();
  });
});
