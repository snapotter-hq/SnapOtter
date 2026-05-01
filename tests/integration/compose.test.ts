/**
 * Integration tests for the compose tool (/api/v1/tools/compose).
 *
 * Compose overlays one image on top of another with position, opacity,
 * and blend mode controls. It uses field names "file" for the base image
 * and "overlay" for the overlay image.
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

describe("Compose", () => {
  it("overlays a small image onto a base image at default position", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
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

    // Output should preserve base image dimensions
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("positions overlay at a specific x,y offset", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ x: 50, y: 25 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();

    // Dimensions should still match the base image
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("applies opacity to the overlay", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ opacity: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
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

  it("uses multiply blend mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ blendMode: "multiply" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
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

  it("uses screen blend mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ blendMode: "screen" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("combines position, opacity, and blend mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          x: 10,
          y: 10,
          opacity: 75,
          blendMode: "overlay",
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
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

  // ── Validation ──────────────────────────────────────────────────────

  it("rejects requests without a base image", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/no base image/i);
  });

  it("rejects requests without an overlay image", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/no overlay image/i);
  });

  it("rejects invalid blend mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ blendMode: "bogus" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/invalid settings/i);
  });

  it("rejects opacity out of range", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ opacity: 150 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
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
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  // ── Extended coverage: blend modes, edge positions, HEIC ───────────

  it("uses overlay blend mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ blendMode: "overlay" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
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

  it("uses darken blend mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ blendMode: "darken" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("uses lighten blend mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ blendMode: "lighten" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("uses hard-light blend mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ blendMode: "hard-light" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("uses soft-light blend mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ blendMode: "soft-light" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("uses difference blend mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ blendMode: "difference" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("uses exclusion blend mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ blendMode: "exclusion" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("positions overlay at bottom-right edge", async () => {
    // Overlay is 100x100, base is 200x150 -> place at (100, 50)
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ x: 100, y: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    // Output should still be base dimensions
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("applies zero opacity (completely transparent overlay)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ opacity: 0 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("applies full opacity (default, 100%)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ opacity: 100 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("handles HEIC base image", { timeout: 120_000 }, async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.heic", contentType: "image/heic", content: HEIC },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
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

  it("handles HEIC overlay image", { timeout: 120_000 }, async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.heic", contentType: "image/heic", content: HEIC },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
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

  it("uses WebP overlay on PNG base", async () => {
    const WEBP = readFileSync(join(FIXTURES, "test-50x50.webp"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.webp", contentType: "image/webp", content: WEBP },
      { name: "settings", content: JSON.stringify({ x: 10, y: 10 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    // Output should preserve base filename
    expect(result.downloadUrl).toBeDefined();
  });

  it("preserves original filename in download URL", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "my-photo.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "watermark.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toContain("my-photo.png");
  });

  it("rejects negative x position", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ x: -10 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects invalid JSON in settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: "{not valid" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
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

  // ── Branch coverage: multipart parse error (lines 60-64) ────────────

  it("returns 400 for corrupt base image that fails processing", async () => {
    // Send a corrupt buffer that passes initial multipart parse but fails Sharp processing
    const corruptBuffer = Buffer.from("not a real image content at all!!!");
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: corruptBuffer },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    // Should get 422 because the corrupt buffer fails Sharp processing
    expect(res.statusCode).toBe(422);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/processing failed/i);
  });

  // ── Branch coverage: overlay larger than base causes 422 (line 140-144) ──

  it("returns 422 when overlay is larger than base image", async () => {
    // Overlay (200x150) is larger than base (100x100) — Sharp composite fails
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.jpg", contentType: "image/jpeg", content: JPG },
      { name: "overlay", filename: "overlay.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ x: 0, y: 0 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(422);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/processing failed/i);
  });

  // ── Branch coverage: 1x1 tiny image handling ────────────────────────

  it("returns 422 when 1x1 base is smaller than overlay", async () => {
    const TINY = readFileSync(join(FIXTURES, "test-1x1.png"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: TINY },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    // Overlay (100x100) extends beyond 1x1 base — Sharp fails
    expect(res.statusCode).toBe(422);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/processing failed/i);
  });

  it("handles 1x1 pixel overlay image", async () => {
    const TINY = readFileSync(join(FIXTURES, "test-1x1.png"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.png", contentType: "image/png", content: TINY },
      { name: "settings", content: JSON.stringify({ x: 50, y: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
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
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  // ── Branch coverage: large file handling ────────────────────────────

  it("handles a large content image as base", async () => {
    const LARGE = readFileSync(join(FIXTURES, "content", "stress-large.jpg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.jpg", contentType: "image/jpeg", content: LARGE },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ x: 10, y: 10, opacity: 80 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
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

  // ── Branch coverage: HEIC overlay with opacity ──────────────────────

  it("applies opacity with HEIC overlay", { timeout: 120_000 }, async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.heic", contentType: "image/heic", content: HEIC },
      { name: "settings", content: JSON.stringify({ opacity: 60, blendMode: "multiply" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
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

  // ── Branch coverage: both images empty → 400 ───────────────────────

  it("rejects when no files are provided at all", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/no base image/i);
  });

  // ── Branch coverage: negative y position rejects ───────────────────

  it("rejects negative y position", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ y: -5 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Branch coverage: opacity at boundary (1%) ──────────────────────

  it("applies minimal opacity (1%)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ opacity: 1 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
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

  // ── Branch coverage: HEIF content format input ─────────────────────

  it("handles portrait HEIC base image", { timeout: 120_000 }, async () => {
    const HEIC_PORTRAIT = readFileSync(join(FIXTURES, "test-portrait.heic"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.heic", contentType: "image/heic", content: HEIC_PORTRAIT },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ x: 10, y: 10 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
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

  // ── Branch coverage: overlay at (0,0) position ─────────────────────

  it("positions overlay at origin (0,0)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ x: 0, y: 0 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
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
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  // ── Branch coverage: over blend mode (default) ─────────────────────

  it("uses default over blend mode explicitly", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ blendMode: "over" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
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

  // ── Branch coverage: same-size overlay and base ────────────────────

  it("overlays same-size images successfully", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ opacity: 50, blendMode: "screen" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
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
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  // ── Branch coverage: corrupt overlay ───────────────────────────────

  it("returns 422 for corrupt overlay image", async () => {
    const corruptBuffer = Buffer.from("not a valid image at all");
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      {
        name: "overlay",
        filename: "overlay.png",
        contentType: "image/png",
        content: corruptBuffer,
      },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(422);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/processing failed/i);
  });

  // ── HEIF format input ─────────────────────────────────────────────

  it("handles HEIF base image", { timeout: 120_000 }, async () => {
    const HEIF = readFileSync(join(FIXTURES, "content", "motorcycle.heif"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.heif", contentType: "image/heif", content: HEIF },
      { name: "overlay", filename: "overlay.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ x: 10, y: 10 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
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

  it("handles animated GIF as base image", async () => {
    const GIF = readFileSync(join(FIXTURES, "animated.gif"));
    const TINY = readFileSync(join(FIXTURES, "test-1x1.png"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.gif", contentType: "image/gif", content: GIF },
      { name: "overlay", filename: "overlay.png", contentType: "image/png", content: TINY },
      { name: "settings", content: JSON.stringify({ x: 0, y: 0 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
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

  it("handles SVG as overlay image", async () => {
    const SVG = readFileSync(join(FIXTURES, "test-100x100.svg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "base.png", contentType: "image/png", content: PNG },
      { name: "overlay", filename: "overlay.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ x: 10, y: 10 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compose",
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
});
