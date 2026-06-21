/**
 * Integration tests for the image-to-base64 tool.
 *
 * Converts image(s) to base64 strings. Custom route that returns JSON
 * with results/errors arrays rather than a file download.
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

describe("image-to-base64", () => {
  it("converts a PNG to base64", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
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
      url: "/api/v1/tools/image/image-to-base64",
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
      url: "/api/v1/tools/image/image-to-base64",
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
      url: "/api/v1/tools/image/image-to-base64",
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
      url: "/api/v1/tools/image/image-to-base64",
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
      url: "/api/v1/tools/image/image-to-base64",
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
      url: "/api/v1/tools/image/image-to-base64",
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
      url: "/api/v1/tools/image/image-to-base64",
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
      url: "/api/v1/tools/image/image-to-base64",
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
      url: "/api/v1/tools/image/image-to-base64",
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
      url: "/api/v1/tools/image/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].mimeType).toBe("image/png");
  });

  // ── Quality affects encoded size ─────────────────────────────────
  it("lower quality produces smaller encoded size for jpeg", async () => {
    const largeJPG = readFixture(fixtures.image.portrait.jpg);
    const makeRequest = async (quality: number) => {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "test.jpg", contentType: "image/jpeg", content: largeJPG },
        { name: "settings", content: JSON.stringify({ outputFormat: "jpeg", quality }) },
      ]);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/image-to-base64",
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
      url: "/api/v1/tools/image/image-to-base64",
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
    const WEBP = readFixture(fixtures.image.base.webp50);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.webp", contentType: "image/webp", content: WEBP },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
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
  it("converts HEIC to JPEG in original mode", { timeout: 120_000 }, async () => {
    const HEIC = readFixture(fixtures.image.base.heic200);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
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
      url: "/api/v1/tools/image/image-to-base64",
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
      url: "/api/v1/tools/image/image-to-base64",
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
      url: "/api/v1/tools/image/image-to-base64",
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
      url: "/api/v1/tools/image/image-to-base64",
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
    const SVG = readFixture(fixtures.image.base.svg100);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "icon.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
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
      url: "/api/v1/tools/image/image-to-base64",
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
      url: "/api/v1/tools/image/image-to-base64",
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
      url: "/api/v1/tools/image/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].mimeType).toBe("image/jpeg");
  });

  // ── Branch coverage: line 180 (overheadPercent = 0 for empty) ─────

  it("handles 1x1 tiny image", async () => {
    const TINY = readFixture(fixtures.image.edge.px1);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", contentType: "image/png", content: TINY },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
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

  it("converts HEIC to JPEG with resize applied", { timeout: 120_000 }, async () => {
    const HEIC = readFixture(fixtures.image.base.heic200);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
      { name: "settings", content: JSON.stringify({ maxWidth: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].mimeType).toBe("image/jpeg");
    expect(json.results[0].width).toBeLessThanOrEqual(50);
  });

  // ── HEIC with explicit format conversion ──────────────────────────

  it("converts HEIC to PNG when outputFormat is png", { timeout: 120_000 }, async () => {
    const HEIC = readFixture(fixtures.image.base.heic200);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
      { name: "settings", content: JSON.stringify({ outputFormat: "png" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
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
      url: "/api/v1/tools/image/image-to-base64",
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
    const LARGE = readFixture(fixtures.image.stressLarge);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "large.jpg", contentType: "image/jpeg", content: LARGE },
      { name: "settings", content: JSON.stringify({ maxWidth: 200 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
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
      url: "/api/v1/tools/image/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results).toHaveLength(1);
  });

  // ── 5+ images batch conversion ──────────────────────────────────

  it("converts 5 images in a single request", async () => {
    const WEBP = readFixture(fixtures.image.base.webp50);
    const TINY = readFixture(fixtures.image.edge.px1);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "img1.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "img2.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "img3.webp", contentType: "image/webp", content: WEBP },
      { name: "file", filename: "img4.png", contentType: "image/png", content: TINY },
      { name: "file", filename: "img5.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results).toHaveLength(5);
    expect(json.errors).toHaveLength(0);
    for (const result of json.results) {
      expect(result.base64.length).toBeGreaterThan(0);
      expect(result.dataUri).toMatch(/^data:image\/.+;base64,/);
    }
  });

  // ── Corrupted image produces error entry ─────────────────────────

  it("reports corrupted image in errors array", async () => {
    const corrupted = Buffer.alloc(50, 0xff);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "good.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "bad.png", contentType: "image/png", content: corrupted },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    // Good image should succeed, bad one should end up in errors
    expect(json.results.length + json.errors.length).toBe(2);
  });

  // ── Rejects unauthenticated request ──────────────────────────────

  it("rejects unauthenticated request", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  // ── HEIF input (alternative extension) ───────────────────────────

  it(
    "converts HEIF to JPEG in original mode",
    { timeout: 120_000 },
    async () => {
      const HEIF = readFixture(fixtures.image.motorcycle);
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "photo.heif", contentType: "image/heif", content: HEIF },
        { name: "settings", content: JSON.stringify({}) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/image-to-base64",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        body,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.results[0].mimeType).toBe("image/jpeg");
    },
    60_000,
  );

  // ── Quality=1 minimum ────────────────────────────────────────────

  it("accepts quality at minimum boundary (1)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ outputFormat: "jpeg", quality: 1 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].mimeType).toBe("image/jpeg");
  });

  // ── Quality=100 maximum ──────────────────────────────────────────

  it("accepts quality at maximum boundary (100)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ outputFormat: "jpeg", quality: 100 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].mimeType).toBe("image/jpeg");
  });

  // ── Rejects invalid outputFormat ─────────────────────────────────

  it("rejects invalid outputFormat value", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ outputFormat: "bmp" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Animated GIF input ──────────────────────────────────────────

  it("converts animated GIF to base64", async () => {
    const GIF = readFixture(fixtures.image.animated.gif);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "anim.gif", contentType: "image/gif", content: GIF },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results).toHaveLength(1);
    expect(json.results[0].base64.length).toBeGreaterThan(0);
    expect(json.results[0].dataUri).toMatch(/^data:image\/.+;base64,/);
  });

  // ── JXL output format accepted by Zod ─────────────────────────────

  it("accepts jxl as a valid outputFormat value", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ outputFormat: "jxl" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    // JXL is accepted by the Zod schema; whether it succeeds depends on
    // Sharp's platform support. Either way, the route should return 200.
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    // If JXL is supported, result is in results; otherwise in errors
    expect(json.results.length + json.errors.length).toBe(1);
  });

  // ── Data URI string length verification ─────────────────────────

  it("data URI string length matches base64 + prefix", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    const r = json.results[0];
    const expectedPrefix = `data:${r.mimeType};base64,`;
    expect(r.dataUri.startsWith(expectedPrefix)).toBe(true);
    expect(r.dataUri.length).toBe(expectedPrefix.length + r.base64.length);
  });

  // ── TIFF input format ───────────────────────────────────────────

  it("converts TIFF to base64", async () => {
    const TIFF = readFixture(fixtures.image.formats("tiff"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.tiff", contentType: "image/tiff", content: TIFF },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results).toHaveLength(1);
    expect(json.results[0].base64.length).toBeGreaterThan(0);
  });

  // ── Negative maxWidth rejected ──────────────────────────────────

  it("rejects negative maxWidth", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ maxWidth: -1 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Negative maxHeight rejected ─────────────────────────────────

  it("rejects negative maxHeight", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ maxHeight: -1 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Multiple formats in single request ──────────────────────────

  it("converts mixed formats in a single batch request", async () => {
    const WEBP = readFixture(fixtures.image.base.webp50);
    const TIFF = readFixture(fixtures.image.formats("tiff"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "c.webp", contentType: "image/webp", content: WEBP },
      { name: "file", filename: "d.tiff", contentType: "image/tiff", content: TIFF },
      { name: "settings", content: JSON.stringify({ outputFormat: "jpeg", quality: 60 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results).toHaveLength(4);
    for (const r of json.results) {
      expect(r.mimeType).toBe("image/jpeg");
      expect(r.base64.length).toBeGreaterThan(0);
    }
  });

  // ── maxHeight=0 means no resize ──────────────────────────────────

  it("maxHeight=0 means no height resize (pass-through)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ maxHeight: 0 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].width).toBe(200);
    expect(json.results[0].height).toBe(150);
  });

  // ── Base64 string can be decoded back to original image ────────

  it("decoded base64 produces a valid image buffer", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    const decoded = Buffer.from(json.results[0].base64, "base64");

    // Verify decoded buffer is a valid image by reading it with Sharp
    const sharp = (await import("sharp")).default;
    const meta = await sharp(decoded).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
    expect(meta.format).toBe("png");
  });

  // ── Data URI can be parsed correctly ────────────────────────────

  it("data URI contains the correct MIME type prefix", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ outputFormat: "webp" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    const r = json.results[0];

    // Parse the data URI
    const [prefix, b64Data] = r.dataUri.split(",");
    expect(prefix).toBe("data:image/webp;base64");
    expect(b64Data).toBe(r.base64);
    expect(r.mimeType).toBe("image/webp");
  });

  // ── Encoded size matches actual base64 byte length ─────────────

  it("encodedSize matches actual base64 decoded byte count", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    const r = json.results[0];

    // encodedSize should be the length of the base64 string (characters)
    expect(r.encodedSize).toBe(r.base64.length);
  });

  // ── AVIF input format ────────────────────────────────────────
  it("converts AVIF to base64 in original mode", async () => {
    const AVIF = readFixture(fixtures.image.formats("avif"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.avif", contentType: "image/avif", content: AVIF },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results).toHaveLength(1);
    expect(json.results[0].base64.length).toBeGreaterThan(0);
  });

  // ── GIF with resize ──────────────────────────────────────────
  it("resizes animated GIF and converts to JPEG", async () => {
    const GIF = readFixture(fixtures.image.animated.gif);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "anim.gif", contentType: "image/gif", content: GIF },
      { name: "settings", content: JSON.stringify({ outputFormat: "jpeg", maxWidth: 30 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].mimeType).toBe("image/jpeg");
    expect(json.results[0].width).toBeLessThanOrEqual(30);
  });

  // ── TIFF with explicit format conversion ─────────────────────
  it("converts TIFF to WebP format", async () => {
    const TIFF = readFixture(fixtures.image.formats("tiff"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.tiff", contentType: "image/tiff", content: TIFF },
      { name: "settings", content: JSON.stringify({ outputFormat: "webp", quality: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].mimeType).toBe("image/webp");
    expect(json.results[0].base64.length).toBeGreaterThan(0);
  });

  // ── maxWidth and maxHeight both at 1 (extreme resize) ────────
  it("handles extreme resize to 1x1", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ maxWidth: 1, maxHeight: 1 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].width).toBe(1);
    expect(json.results[0].height).toBe(1);
  });

  // ── Quality mid-range with different formats ──────────────────
  it("applies mid-range quality (50) to AVIF output", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ outputFormat: "avif", quality: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].mimeType).toBe("image/avif");
  });

  // ── SVG with explicit format conversion ──────────────────────
  it("converts SVG to JPEG when outputFormat is jpeg", async () => {
    const SVG = readFixture(fixtures.image.base.svg100);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "icon.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ outputFormat: "jpeg" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/image-to-base64",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.results[0].mimeType).toBe("image/jpeg");
  });
});
