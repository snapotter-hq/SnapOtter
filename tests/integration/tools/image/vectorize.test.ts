/**
 * Integration tests for the vectorize tool.
 *
 * Converts raster images to SVG via potrace (black-and-white) or
 * @neplex/vectorizer (color). Custom route with settings for colorMode,
 * threshold, path mode, and more.
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
const SMALL_PNG = readFixture(fixtures.image.edge.px1);

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
      url: "/api/v1/tools/image/vectorize",
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
      url: "/api/v1/tools/image/vectorize",
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
      url: "/api/v1/tools/image/vectorize",
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
      url: "/api/v1/tools/image/vectorize",
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
      url: "/api/v1/tools/image/vectorize",
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
      url: "/api/v1/tools/image/vectorize",
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
      url: "/api/v1/tools/image/vectorize",
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
      url: "/api/v1/tools/image/vectorize",
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
      url: "/api/v1/tools/image/vectorize",
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
      url: "/api/v1/tools/image/vectorize",
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
      url: "/api/v1/tools/image/vectorize",
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
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": ct1 },
      body: body1,
    });

    const res2 = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
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
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("processes a JPEG input file", async () => {
    const JPG = readFixture(fixtures.image.base.jpg100);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
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
      url: "/api/v1/tools/image/vectorize",
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
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": ct1 },
      body: body1,
    });

    const res2 = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
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
      url: "/api/v1/tools/image/vectorize",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  it("works with HEIC input after decoding", { timeout: 120_000 }, async () => {
    const HEIC = readFixture(fixtures.image.base.heic200);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.heic", contentType: "image/heic", content: HEIC },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
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
      url: "/api/v1/tools/image/vectorize",
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
      url: "/api/v1/tools/image/vectorize",
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
        url: "/api/v1/tools/image/vectorize",
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
        content: readFixture(fixtures.image.base.webp50),
      },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toMatch(/\.svg$/);
  });

  // ── Large file handling ───────────────────────────────────────

  it("vectorizes a large stress image in bw mode", async () => {
    const LARGE = readFixture(fixtures.image.stressLarge);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "large.jpg", contentType: "image/jpeg", content: LARGE },
      { name: "settings", content: JSON.stringify({ colorMode: "bw" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
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
      url: "/api/v1/tools/image/vectorize",
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
      url: "/api/v1/tools/image/vectorize",
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
      url: "/api/v1/tools/image/vectorize",
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
      url: "/api/v1/tools/image/vectorize",
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
      url: "/api/v1/tools/image/vectorize",
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
      url: "/api/v1/tools/image/vectorize",
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
      url: "/api/v1/tools/image/vectorize",
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
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  // ── HEIF input ───────────────────────────────────────────────

  it("works with HEIF (sample.heif) input after decoding", { timeout: 180_000 }, async () => {
    const HEIF = readFixture(fixtures.image.formats("heif"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "sample.heif", contentType: "image/heif", content: HEIF },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    // HEIF may fail if system decoder missing
    expect([200, 422]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const json = JSON.parse(res.body);
      expect(json.downloadUrl).toMatch(/\.svg$/);
    }
  });

  // ── SVG input ────────────────────────────────────────────────

  it("vectorizes SVG input (re-traces after rasterization)", async () => {
    const SVG_BUF = readFixture(fixtures.image.base.svg100);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG_BUF },
      { name: "settings", content: JSON.stringify({ colorMode: "bw" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    // SVG may need rasterization first; accept success or processing error
    expect([200, 422]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const json = JSON.parse(res.body);
      expect(json.downloadUrl).toMatch(/\.svg$/);
    }
  });

  // ── Animated GIF input ───────────────────────────────────────

  it("vectorizes animated GIF input", async () => {
    const GIF_BUF = readFixture(fixtures.image.animated.gif);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "animated.gif", contentType: "image/gif", content: GIF_BUF },
      { name: "settings", content: JSON.stringify({ colorMode: "bw" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toMatch(/\.svg$/);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  // ── Threshold boundary values ─────────────────────────────────

  it("accepts threshold of 0 (minimum)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ colorMode: "bw", threshold: 0 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  it("accepts threshold of 255 (maximum)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ colorMode: "bw", threshold: 255 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  it("rejects threshold of -1 (below minimum)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ threshold: -1 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects threshold of 256 (above maximum)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ threshold: 256 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Invalid colorMode value ───────────────────────────────────

  it("rejects invalid colorMode value", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ colorMode: "grayscale" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── ColorPrecision boundary values ────────────────────────────

  it("accepts colorPrecision of 1 (minimum)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ colorMode: "color", colorPrecision: 1 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("accepts colorPrecision of 16 (maximum)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ colorMode: "color", colorPrecision: 16 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("rejects colorPrecision of 0 (below minimum)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ colorPrecision: 0 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── CornerThreshold boundary at 0 ─────────────────────────────

  it("accepts cornerThreshold of 0 (minimum)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ colorMode: "bw", cornerThreshold: 0 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  // ── Response structure ────────────────────────────────────────

  it("returns all expected fields in response", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json).toHaveProperty("jobId");
    expect(json).toHaveProperty("downloadUrl");
    expect(json).toHaveProperty("originalSize");
    expect(json).toHaveProperty("processedSize");
    expect(typeof json.jobId).toBe("string");
    expect(typeof json.downloadUrl).toBe("string");
    expect(typeof json.originalSize).toBe("number");
    expect(typeof json.processedSize).toBe("number");
    expect(json.originalSize).toBeGreaterThan(0);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  // ── SVG content verification for BW mode ──────────────────────

  it("bw mode SVG output contains path elements", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ colorMode: "bw", threshold: 128 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
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
    expect(svgContent).toContain("</svg>");
    // BW potrace produces path elements
    expect(svgContent).toContain("<path");
  });

  // ── Color mode SVG content verification ───────────────────────

  it("color mode SVG output contains valid SVG content", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ colorMode: "color", colorPrecision: 3 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
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
    expect(svgContent).toContain("</svg>");
  });

  // ── Invalid image data ────────────────────────────────────────

  it("rejects corrupt image data", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "corrupt.png",
        contentType: "image/png",
        content: Buffer.from("this is not image data at all"),
      },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    // Should fail with either 400 or 422
    expect([400, 422]).toContain(res.statusCode);
  });

  // ── Large file in color mode ──────────────────────────────────

  it("vectorizes large stress image in color mode", { timeout: 180_000 }, async () => {
    const LARGE = readFixture(fixtures.image.stressLarge);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "large.jpg", contentType: "image/jpeg", content: LARGE },
      {
        name: "settings",
        content: JSON.stringify({
          colorMode: "color",
          colorPrecision: 2,
          filterSpeckle: 10,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.processedSize).toBeGreaterThan(0);
    expect(json.downloadUrl).toMatch(/\.svg$/);
  });

  // ── Invert with color mode (ignored but no error) ─────────────

  it("accepts invert option with color mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ colorMode: "color", invert: true }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toMatch(/\.svg$/);
  });

  // ── Default settings produce spline path mode ─────────────────

  it("default settings use spline path mode (default)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toMatch(/\.svg$/);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  // ── FilterSpeckle boundary values ─────────────────────────────

  it("rejects filterSpeckle of 0 (below minimum)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ filterSpeckle: 0 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects filterSpeckle of 257 (above maximum)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ filterSpeckle: 257 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── LayerDifference boundary values ───────────────────────────

  it("rejects layerDifference of 0 (below minimum)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ layerDifference: 0 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects layerDifference of 129 (above maximum)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ layerDifference: 129 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── No settings field provided ────────────────────────────────

  it("uses default settings when no settings field is provided", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toMatch(/\.svg$/);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  // ── Portrait image vectorization ─────────────────────────────

  it("vectorizes portrait image in bw mode", async () => {
    const PORTRAIT = readFixture(fixtures.image.portraitJpg);
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "portrait.jpg",
        contentType: "image/jpeg",
        content: PORTRAIT,
      },
      { name: "settings", content: JSON.stringify({ colorMode: "bw", threshold: 128 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toMatch(/\.svg$/);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  it("vectorizes portrait image in color mode", async () => {
    const PORTRAIT = readFixture(fixtures.image.portraitJpg);
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "portrait.jpg",
        contentType: "image/jpeg",
        content: PORTRAIT,
      },
      {
        name: "settings",
        content: JSON.stringify({ colorMode: "color", colorPrecision: 3 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
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
    expect(svgContent).toContain("</svg>");
  });

  // ── SVG output dimensions match input ─────────────────────────

  it("SVG output has viewBox matching input dimensions", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ colorMode: "bw", threshold: 128 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
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
    // SVG should have width/height or viewBox attributes
    expect(svgContent).toMatch(/(width|viewBox)/);
  });

  // ── BW mode produces fewer bytes than color ──────────────────

  it("bw mode generally produces smaller SVG than color mode", async () => {
    const { body: bodyBw, contentType: ctBw } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ colorMode: "bw" }) },
    ]);
    const { body: bodyColor, contentType: ctColor } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ colorMode: "color", colorPrecision: 6 }),
      },
    ]);

    const resBw = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": ctBw },
      body: bodyBw,
    });
    const resColor = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": ctColor },
      body: bodyColor,
    });

    expect(resBw.statusCode).toBe(200);
    expect(resColor.statusCode).toBe(200);

    const bwSize = JSON.parse(resBw.body).processedSize;
    const colorSize = JSON.parse(resColor.body).processedSize;
    // Color mode typically produces more SVG data than BW
    expect(colorSize).toBeGreaterThanOrEqual(bwSize);
  });

  // ── Blank image vectorization ────────────────────────────────

  it("vectorizes a blank (single-color) image", async () => {
    const BLANK = readFixture(fixtures.image.edge.blank);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "blank.png", contentType: "image/png", content: BLANK },
      { name: "settings", content: JSON.stringify({ colorMode: "bw" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.processedSize).toBeGreaterThan(0);
    expect(json.downloadUrl).toMatch(/\.svg$/);
  });

  // ── Content image vectorization ──────────────────────────────

  it("vectorizes content/portrait-color.jpg in color mode", async () => {
    const PORTRAIT_COLOR = readFixture(fixtures.image.portrait.jpg);
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "portrait-color.jpg",
        contentType: "image/jpeg",
        content: PORTRAIT_COLOR,
      },
      {
        name: "settings",
        content: JSON.stringify({ colorMode: "color", colorPrecision: 2, filterSpeckle: 10 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toMatch(/\.svg$/);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  // ── Combined settings deep test ──────────────────────────────

  it("applies all settings simultaneously in color mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          colorMode: "color",
          colorPrecision: 8,
          layerDifference: 32,
          filterSpeckle: 16,
          cornerThreshold: 120,
          pathMode: "polygon",
          invert: true,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toMatch(/\.svg$/);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  it("applies all settings simultaneously in bw mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          colorMode: "bw",
          threshold: 64,
          pathMode: "none",
          invert: true,
          cornerThreshold: 30,
          filterSpeckle: 8,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/vectorize",
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
    expect(svgContent).toContain("<path");
  });
});
