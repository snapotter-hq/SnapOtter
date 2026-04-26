/**
 * Integration tests for the image-to-base64 tool.
 *
 * Converts image(s) to base64 strings. Custom route that returns JSON
 * with results/errors arrays rather than a file download.
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

describe("image-to-base64", () => {
  it("converts a PNG to base64", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results).toHaveLength(1);
    expect(json.errors).toHaveLength(0);

    const result = json.results[0];
    expect(result.filename).toBe("test.png");
    expect(result.base64).toBeDefined();
    expect(result.base64.length).toBeGreaterThan(0);
    expect(result.dataUri).toMatch(/^data:image\/.+;base64,/);
    expect(result.mimeType).toContain("image/");
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.originalSize).toBe(PNG.length);
    expect(result.encodedSize).toBeGreaterThan(0);
    expect(typeof result.overheadPercent).toBe("number");
  });

  it("base64 output is valid", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    const b64 = json.results[0].base64;
    // Verify it decodes without error
    const decoded = Buffer.from(b64, "base64");
    expect(decoded.length).toBeGreaterThan(0);
    // Re-encoding should match
    expect(decoded.toString("base64")).toBe(b64);
  });

  it("converts multiple images", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "img1.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "img2.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results).toHaveLength(2);
    expect(json.results[0].filename).toBe("img1.png");
    expect(json.results[1].filename).toBe("img2.jpg");
  });

  it("converts to a specific output format", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ outputFormat: "jpeg" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].mimeType).toBe("image/jpeg");
    expect(json.results[0].dataUri).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("applies maxWidth resize", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ maxWidth: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].width).toBeLessThanOrEqual(50);
  });

  it("applies maxHeight resize", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ maxHeight: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].height).toBeLessThanOrEqual(50);
  });

  it("rejects request without any files", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("No image files");
  });

  it("rejects invalid quality setting", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ quality: 0 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("Invalid settings");
  });

  // ── Output format: webp ──────────────────────────────────────────
  it("converts to webp output format", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ outputFormat: "webp" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].mimeType).toBe("image/webp");
    expect(json.results[0].dataUri).toMatch(/^data:image\/webp;base64,/);
  });

  // ── Output format: avif ──────────────────────────────────────────
  it("converts to avif output format", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ outputFormat: "avif" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].mimeType).toBe("image/avif");
    expect(json.results[0].dataUri).toMatch(/^data:image\/avif;base64,/);
  });

  // ── Output format: png ───────────────────────────────────────────
  it("converts to png output format", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ outputFormat: "png" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].mimeType).toBe("image/png");
  });

  // ── Quality affects encoded size ─────────────────────────────────
  it("lower quality produces smaller encoded size for jpeg", async () => {
    const largeJPG = readFileSync(join(FIXTURES, "content", "portrait-color.jpg"));
    const makeRequest = async (quality: number) => {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "test.jpg", contentType: "image/jpeg", content: largeJPG },
        { name: "settings", content: JSON.stringify({ outputFormat: "jpeg", quality }) },
      ]);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image-to-base64",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        body,
      });
      return JSON.parse(res.body);
    };

    const highQ = await makeRequest(95);
    const lowQ = await makeRequest(10);
    expect(lowQ.results[0].encodedSize).toBeLessThan(highQ.results[0].encodedSize);
  });

  // ── Both maxWidth and maxHeight combined ─────────────────────────
  it("applies maxWidth and maxHeight together", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ maxWidth: 80, maxHeight: 60 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].width).toBeLessThanOrEqual(80);
    expect(json.results[0].height).toBeLessThanOrEqual(60);
  });

  // ── WebP input preserves format in original mode ─────────────────
  it("preserves WebP format in original mode", async () => {
    const WEBP = readFileSync(join(FIXTURES, "test-50x50.webp"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.webp", contentType: "image/webp", content: WEBP },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].mimeType).toBe("image/webp");
    expect(json.results[0].width).toBe(50);
    expect(json.results[0].height).toBe(50);
  });

  // ── HEIC input gets converted to JPEG in original mode ───────────
  it("converts HEIC to JPEG in original mode", async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].mimeType).toBe("image/jpeg");
    expect(json.results[0].width).toBeGreaterThan(0);
    expect(json.results[0].height).toBeGreaterThan(0);
  });

  // ── overheadPercent is calculated correctly ───────────────────────
  it("overheadPercent reflects base64 expansion", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    const r = json.results[0];
    // Base64 always expands data, so overhead should be positive
    expect(r.overheadPercent).toBeGreaterThan(0);
    // Verify the calculation: (encodedSize - originalSize) / originalSize * 100
    const expected = Math.round(((r.encodedSize - r.originalSize) / r.originalSize) * 1000) / 10;
    expect(r.overheadPercent).toBe(expected);
  });

  // ── Reject quality above 100 ──────────────────────────────────────
  it("rejects quality above 100", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ quality: 101 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── maxWidth=0 means no resize ────────────────────────────────────
  it("maxWidth=0 means no width resize (pass-through)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ maxWidth: 0 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].width).toBe(200);
    expect(json.results[0].height).toBe(150);
  });

  // ── withoutEnlargement: maxWidth larger than image ────────────────
  it("does not enlarge when maxWidth exceeds image width", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ maxWidth: 9999 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    // Should not enlarge beyond original dimensions
    expect(json.results[0].width).toBe(200);
    expect(json.results[0].height).toBe(150);
  });

  // ── SVG input passthrough in original mode ────────────────────────
  it("passes through SVG without conversion in original mode", async () => {
    const SVG = readFileSync(join(FIXTURES, "test-100x100.svg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "icon.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].mimeType).toBe("image/svg+xml");
    expect(json.results[0].dataUri).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  // ── Resize + format conversion combined ───────────────────────────
  it("applies resize and format conversion together", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ outputFormat: "jpeg", maxWidth: 50, maxHeight: 50 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].mimeType).toBe("image/jpeg");
    expect(json.results[0].width).toBeLessThanOrEqual(50);
    expect(json.results[0].height).toBeLessThanOrEqual(50);
  });

  // ── Branch coverage: line 83 (ignored invalid settings JSON) ──────

  it("ignores invalid settings JSON (uses defaults)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "not-json-at-all" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    // The route silently ignores invalid JSON and uses defaults
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results).toHaveLength(1);
    expect(json.results[0].mimeType).toContain("image/");
  });

  // ── Branch coverage: lines 149-150 (default case in outputFormat switch) ──

  it("handles unknown outputFormat falling through to default", async () => {
    // Testing the "original" path with a non-HEIC, non-SVG format and no resize
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ outputFormat: "original" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].mimeType).toBe("image/jpeg");
  });

  // ── Branch coverage: line 180 (overheadPercent = 0 for empty) ─────

  it("handles 1x1 tiny image", async () => {
    const TINY = readFileSync(join(FIXTURES, "test-1x1.png"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", contentType: "image/png", content: TINY },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].width).toBe(1);
    expect(json.results[0].height).toBe(1);
    expect(typeof json.results[0].overheadPercent).toBe("number");
  });

  // ── HEIC with resize ──────────────────────────────────────────────

  it("converts HEIC to JPEG with resize applied", async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
      { name: "settings", content: JSON.stringify({ maxWidth: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].mimeType).toBe("image/jpeg");
    expect(json.results[0].width).toBeLessThanOrEqual(50);
  });

  // ── HEIC with explicit format conversion ──────────────────────────

  it("converts HEIC to PNG when outputFormat is png", async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
      { name: "settings", content: JSON.stringify({ outputFormat: "png" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].mimeType).toBe("image/png");
  });

  // ── Original format with resize (no format conversion) ────────────

  it("preserves original format when only resize is requested", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ maxWidth: 100 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].mimeType).toContain("image/");
    expect(json.results[0].width).toBeLessThanOrEqual(100);
  });

  // ── Large stress file ─────────────────────────────────────────────

  it("converts stress-large.jpg to base64", async () => {
    const LARGE = readFileSync(join(FIXTURES, "content", "stress-large.jpg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "large.jpg", contentType: "image/jpeg", content: LARGE },
      { name: "settings", content: JSON.stringify({ maxWidth: 200 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].base64.length).toBeGreaterThan(0);
    expect(json.results[0].width).toBeLessThanOrEqual(200);
  });

  // ── No settings at all ────────────────────────────────────────────

  it("works when no settings field is provided at all", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results).toHaveLength(1);
  });
});
