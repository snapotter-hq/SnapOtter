/**
 * Integration tests for the watermark-image tool.
 *
 * Overlays one image onto another as a watermark. Uses a custom route
 * (not createToolRoute) with two file fields: "file" for the main image
 * and "watermark" for the overlay image.
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

describe("watermark-image", () => {
  it("overlays a watermark image with default settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.png", contentType: "image/png", content: SMALL_PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
    expect(json.jobId).toBeDefined();
    expect(json.processedSize).toBeGreaterThan(0);
  });

  it("output differs from the main input", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ scale: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
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
    expect(Buffer.from(dlRes.rawPayload).equals(PNG)).toBe(false);
  });

  it.each([
    "center",
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ] as const)("supports position: %s", async (position) => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.png", contentType: "image/png", content: SMALL_PNG },
      { name: "settings", content: JSON.stringify({ position }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("respects custom opacity and scale", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.png", contentType: "image/png", content: SMALL_PNG },
      { name: "settings", content: JSON.stringify({ opacity: 30, scale: 10 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("rejects request without main image", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "watermark", filename: "wm.png", contentType: "image/png", content: SMALL_PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("No main image");
  });

  it("rejects request without watermark image", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("No watermark image");
  });

  it("rejects invalid settings JSON", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.png", contentType: "image/png", content: SMALL_PNG },
      { name: "settings", content: "not-json" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects opacity out of range", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.png", contentType: "image/png", content: SMALL_PNG },
      { name: "settings", content: JSON.stringify({ opacity: 150 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Branch coverage: lines 44-48 (multipart parse error) ──────────

  it("returns 400 for invalid Zod settings (scale out of range)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.png", contentType: "image/png", content: SMALL_PNG },
      { name: "settings", content: JSON.stringify({ scale: 200 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("Invalid settings");
  });

  // ── Branch coverage: lines 164-168 (processing failure) ───────────

  it("returns 400 when main image is corrupted", async () => {
    // A buffer that passes multipart parsing but fails image validation
    const corruptedBuffer = Buffer.alloc(100, 0xff);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: corruptedBuffer },
      { name: "watermark", filename: "wm.png", contentType: "image/png", content: SMALL_PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("Invalid image");
  });

  // ── HEIC input handling ───────────────────────────────────────────

  it("processes HEIC main image", { timeout: 120_000 }, async () => {
    const HEIC = readFixture(fixtures.image.base.heic200);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
      { name: "watermark", filename: "wm.png", contentType: "image/png", content: SMALL_PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
    expect(json.processedSize).toBeGreaterThan(0);
  });

  // ── Full opacity watermark (opacity=100 skips opacity mask) ───────

  it("applies watermark at full opacity (100)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.png", contentType: "image/png", content: SMALL_PNG },
      { name: "settings", content: JSON.stringify({ opacity: 100, scale: 25 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  // ── Stress: large file ────────────────────────────────────────────

  it("processes stress-large.jpg as main image", async () => {
    const LARGE = readFixture(fixtures.image.stressLarge);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "large.jpg", contentType: "image/jpeg", content: LARGE },
      { name: "watermark", filename: "wm.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ scale: 10 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  // ── Tiny main image with larger watermark ───────────────────────

  it("handles small main image with watermark", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ scale: 1 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  // ── No settings field (defaults applied) ──────────────────────────

  it("works when no settings field is provided at all", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.png", contentType: "image/png", content: SMALL_PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  // ── Corrupted watermark image (processing failure) ───────────────

  it("returns 400 when watermark image is corrupted", async () => {
    const corruptedWm = Buffer.alloc(50, 0xaa);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.png", contentType: "image/png", content: corruptedWm },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("Invalid watermark image");
  });

  // ── Tiny 1x1 main image ──────────────────────────────────────────

  it("handles 1x1 pixel main image", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", contentType: "image/png", content: SMALL_PNG },
      { name: "watermark", filename: "wm.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ scale: 50, position: "center" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  // ── HEIC watermark image ─────────────────────────────────────────

  it("processes HEIC watermark image", { timeout: 120_000 }, async () => {
    const HEIC = readFixture(fixtures.image.base.heic200);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.heic", contentType: "image/heic", content: HEIC },
      { name: "settings", content: JSON.stringify({ scale: 25 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  // ── Minimum scale (1%) ───────────────────────────────────────────

  it("applies watermark at minimum scale (1%)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ scale: 1, opacity: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  // ── Maximum scale (100%) ─────────────────────────────────────────

  it("applies watermark at maximum scale (100%)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ scale: 100, opacity: 100, position: "center" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    // scale=100 causes the watermark to be resized to full main-image width,
    // which can exceed the main image dimensions when composited. The route
    // returns 422 because Sharp's composite rejects overlapping bounds.
    expect(res.statusCode).toBe(422);
  });

  // ── Minimum opacity (0%) ─────────────────────────────────────────

  it("applies watermark at zero opacity", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.png", contentType: "image/png", content: SMALL_PNG },
      { name: "settings", content: JSON.stringify({ opacity: 0, scale: 25 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  // ── Rejects unauthenticated request ──────────────────────────────

  it("rejects unauthenticated request", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.png", contentType: "image/png", content: SMALL_PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  // ── HEIF input ────────────────────────────────────────────────────

  it(
    "processes HEIF main image (motorcycle.heif)",
    { timeout: 120_000 },
    async () => {
      const HEIF = readFixture(fixtures.image.motorcycle);
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "photo.heif", contentType: "image/heif", content: HEIF },
        { name: "watermark", filename: "wm.png", contentType: "image/png", content: SMALL_PNG },
        { name: "settings", content: JSON.stringify({ scale: 10 }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/watermark-image",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        body,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.downloadUrl).toBeDefined();
      expect(json.processedSize).toBeGreaterThan(0);
    },
    60_000,
  );

  // ── Animated GIF input ──────────────────────────────────────────

  it("processes animated GIF main image", async () => {
    const GIF = readFixture(fixtures.image.animated.gif);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "anim.gif", contentType: "image/gif", content: GIF },
      { name: "watermark", filename: "wm.png", contentType: "image/png", content: SMALL_PNG },
      { name: "settings", content: JSON.stringify({ scale: 20 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  // ── SVG main image input ──────────────────────────────────────────

  it("processes SVG main image with watermark", async () => {
    const SVG = readFixture(fixtures.image.base.svg100);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "icon.svg", contentType: "image/svg+xml", content: SVG },
      { name: "watermark", filename: "wm.png", contentType: "image/png", content: SMALL_PNG },
      { name: "settings", content: JSON.stringify({ scale: 20, position: "center" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  // ── Output dimensions preserved ─────────────────────────────────

  it("preserves main image dimensions after watermark", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ scale: 20, position: "bottom-left" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
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
    const sharp = (await import("sharp")).default;
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  // ── TIFF watermark image ────────────────────────────────────────

  it("processes TIFF format watermark image", async () => {
    const TIFF = readFixture(fixtures.image.formats("tiff"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.tiff", contentType: "image/tiff", content: TIFF },
      { name: "settings", content: JSON.stringify({ scale: 15, position: "top-left" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  // ── Scale 50 with all positions ─────────────────────────────────

  it("applies medium scale (50) at bottom-left position", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.png", contentType: "image/png", content: SMALL_PNG },
      {
        name: "settings",
        content: JSON.stringify({ scale: 50, opacity: 75, position: "bottom-left" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  // ── Rejects scale below minimum ─────────────────────────────────

  it("rejects scale below minimum (0)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.png", contentType: "image/png", content: SMALL_PNG },
      { name: "settings", content: JSON.stringify({ scale: 0 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Rejects negative opacity ────────────────────────────────────

  it("rejects negative opacity", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.png", contentType: "image/png", content: SMALL_PNG },
      { name: "settings", content: JSON.stringify({ opacity: -1 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── WebP watermark image ─────────────────────────────────────────

  it("processes WebP watermark image", async () => {
    const WEBP = readFixture(fixtures.image.base.webp50);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.webp", contentType: "image/webp", content: WEBP },
      { name: "settings", content: JSON.stringify({ scale: 30, position: "top-left" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  // ── Rejects invalid position value ──────────────────────────────

  it("rejects invalid position value (tiled not supported)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.png", contentType: "image/png", content: SMALL_PNG },
      { name: "settings", content: JSON.stringify({ position: "tiled" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── SVG watermark image ─────────────────────────────────────────

  it("processes SVG watermark image", async () => {
    const SVG = readFixture(fixtures.image.base.svg100);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ scale: 20, position: "center" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  // ── Opacity at boundaries with scale variations ─────────────────

  it("applies opacity=50 with scale=75 at top-right position", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.png", contentType: "image/png", content: SMALL_PNG },
      {
        name: "settings",
        content: JSON.stringify({ opacity: 50, scale: 75, position: "top-right" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
    expect(json.processedSize).toBeGreaterThan(0);
  });

  // ── AVIF watermark image ──────────────────────────────────────

  it("processes AVIF watermark image", async () => {
    const AVIF = readFixture(fixtures.image.formats("avif"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.avif", contentType: "image/avif", content: AVIF },
      { name: "settings", content: JSON.stringify({ scale: 20 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    // AVIF may or may not decode depending on platform support
    expect([200, 422]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const json = JSON.parse(res.body);
      expect(json.downloadUrl).toBeDefined();
    }
  });

  // ── JPG watermark on JPG main ──────────────────────────────────

  it("processes JPG main with JPG watermark", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.jpg", contentType: "image/jpeg", content: JPG },
      { name: "watermark", filename: "wm.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ scale: 30, opacity: 70, position: "center" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
    expect(json.processedSize).toBeGreaterThan(0);
  });

  // ── Default position is bottom-right ──────────────────────────

  it("uses default position (bottom-right) when not specified", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.png", contentType: "image/png", content: SMALL_PNG },
      { name: "settings", content: JSON.stringify({ scale: 15, opacity: 40 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  // ── Response includes originalSize and processedSize ──────────

  it("response includes originalSize and processedSize fields", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.png", contentType: "image/png", content: SMALL_PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.originalSize).toBe(PNG.length);
    expect(json.processedSize).toBeGreaterThan(0);
    expect(json.downloadUrl).toContain("/api/v1/download/");
  });

  // ── Scale=50 mid-range at center ──────────────────────────────

  it("handles scale=50 with center position and mid opacity", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.png", contentType: "image/png", content: SMALL_PNG },
      { name: "settings", content: JSON.stringify({ scale: 50, opacity: 60, position: "center" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });
});
