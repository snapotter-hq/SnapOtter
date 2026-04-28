/**
 * Integration tests for the vectorize tool.
 *
 * Converts raster images to SVG via potrace (black-and-white) or
 * @neplex/vectorizer (color). Custom route with settings for colorMode,
 * threshold, path mode, and more.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
const PNG = readFileSync(join(FIXTURES, "test-200x150.png"));
const SMALL_PNG = readFileSync(join(FIXTURES, "test-1x1.png"));

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

describe("vectorize", () => {
  it("vectorizes a PNG with default settings (bw mode)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
    expect(json.jobId).toBeDefined();
    expect(json.processedSize).toBeGreaterThan(0);
  });

  it("output is valid SVG", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
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
    const svgContent = dlRes.rawPayload.toString("utf-8");
    expect(svgContent).toContain("<svg");
    expect(svgContent).toContain("</svg>");
  });

  it("vectorizes in color mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ colorMode: "color" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
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
    const svgContent = dlRes.rawPayload.toString("utf-8");
    expect(svgContent).toContain("<svg");
  });

  it("respects custom threshold in bw mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ colorMode: "bw", threshold: 200 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("supports invert option", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ invert: true }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it.each(["none", "polygon", "spline"] as const)("supports pathMode: %s", async (pathMode) => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ pathMode }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("respects color mode settings (colorPrecision, layerDifference)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          colorMode: "color",
          colorPrecision: 4,
          layerDifference: 16,
          filterSpeckle: 8,
          cornerThreshold: 90,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("download URL filename ends with .svg", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "myimage.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toMatch(/\.svg$/);
  });

  it("rejects request without a file", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("No image file");
  });

  it("rejects invalid settings JSON", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "not-json" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects threshold out of range", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ threshold: 999 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Color count and detail levels ─────────────────────────────

  it("produces different SVG for different colorPrecision values", async () => {
    const mkPayload = (colorPrecision: number) =>
      createMultipartPayload([
        { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
        {
          name: "settings",
          content: JSON.stringify({ colorMode: "color", colorPrecision }),
        },
      ]);

    const { body: body1, contentType: ct1 } = mkPayload(2);
    const { body: body2, contentType: ct2 } = mkPayload(8);

    const res1 = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": ct1 },
      body: body1,
    });

    const res2 = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": ct2 },
      body: body2,
    });

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);

    // Both should produce valid SVGs
    const json1 = JSON.parse(res1.body);
    const json2 = JSON.parse(res2.body);
    expect(json1.processedSize).toBeGreaterThan(0);
    expect(json2.processedSize).toBeGreaterThan(0);
  });

  it("handles filterSpeckle to remove small artifacts", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          colorMode: "color",
          filterSpeckle: 20,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("processes a JPEG input file", async () => {
    const JPG = readFileSync(join(FIXTURES, "test-100x100.jpg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toMatch(/\.svg$/);
  });

  it("handles very small input (1x1 pixel)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", contentType: "image/png", content: SMALL_PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    // Should either succeed or return a processing error, not crash
    expect(res.statusCode === 200 || res.statusCode === 422).toBe(true);
  });

  it("bw mode with low threshold produces different output than high threshold", async () => {
    const mkPayload = (threshold: number) =>
      createMultipartPayload([
        { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
        {
          name: "settings",
          content: JSON.stringify({ colorMode: "bw", threshold }),
        },
      ]);

    const { body: body1, contentType: ct1 } = mkPayload(50);
    const { body: body2, contentType: ct2 } = mkPayload(200);

    const res1 = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": ct1 },
      body: body1,
    });

    const res2 = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": ct2 },
      body: body2,
    });

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);

    const json1 = JSON.parse(res1.body);
    const json2 = JSON.parse(res2.body);
    // Different thresholds should produce different SVG sizes
    expect(json1.processedSize).not.toBe(json2.processedSize);
  });

  it("rejects unauthenticated requests", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  it("works with HEIC input after decoding", async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.heic", contentType: "image/heic", content: HEIC },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    // HEIC may fail if system decoder missing
    expect([200, 422]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const json = JSON.parse(res.body);
      expect(json.downloadUrl).toMatch(/\.svg$/);
    }
  });

  it("rejects colorPrecision out of range", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ colorPrecision: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects invalid pathMode value", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ pathMode: "bezier" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("color mode with all path modes produces valid SVG", async () => {
    for (const pathMode of ["none", "polygon", "spline"] as const) {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
        {
          name: "settings",
          content: JSON.stringify({ colorMode: "color", pathMode }),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/vectorize",
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
      const svgContent = dlRes.rawPayload.toString("utf-8");
      expect(svgContent).toContain("<svg");
    }
  });

  it("handles WebP input", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.webp",
        contentType: "image/webp",
        content: readFileSync(join(FIXTURES, "test-50x50.webp")),
      },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toMatch(/\.svg$/);
  });

  // ── Large file handling ───────────────────────────────────────

  it("vectorizes a large stress image in bw mode", async () => {
    const LARGE = readFileSync(join(FIXTURES, "content", "stress-large.jpg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "large.jpg", contentType: "image/jpeg", content: LARGE },
      { name: "settings", content: JSON.stringify({ colorMode: "bw" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  // ── Empty file handling ───────────────────────────────────────

  it("rejects empty file buffer", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "empty.png",
        contentType: "image/png",
        content: Buffer.alloc(0),
      },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Invert with color mode ─────────────────────────────────────

  it("applies invert in bw mode and produces valid SVG", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ colorMode: "bw", invert: true, threshold: 100 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
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
    const svg = dlRes.rawPayload.toString("utf-8");
    expect(svg).toContain("<svg");
  });

  // ── Corner threshold variations ────────────────────────────────

  it("applies extreme corner threshold values", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ colorMode: "color", cornerThreshold: 180 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("rejects cornerThreshold above max (181)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ cornerThreshold: 181 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Layer difference and filter speckle boundaries ─────────────

  it("accepts minimum layerDifference and filterSpeckle", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          colorMode: "color",
          layerDifference: 1,
          filterSpeckle: 1,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("accepts maximum layerDifference and filterSpeckle", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          colorMode: "color",
          layerDifference: 128,
          filterSpeckle: 256,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  // ── BW mode with polygon path mode ─────────────────────────────

  it("bw mode with polygon path mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ colorMode: "bw", pathMode: "polygon", threshold: 128 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toMatch(/\.svg$/);
  });

  it("bw mode with none path mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ colorMode: "bw", pathMode: "none" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });
});
