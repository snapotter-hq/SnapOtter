/**
 * Integration tests for the watermark-text tool.
 *
 * Adds an SVG text watermark onto an image. Tests verify position options,
 * opacity, font size, tiled mode, and input validation.
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

describe("watermark-text", () => {
  it("adds a text watermark with default settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ text: "Sample" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
    expect(json.jobId).toBeDefined();
    expect(json.processedSize).toBeGreaterThan(0);
  });

  it("output differs from input", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ text: "Watermark" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    // Download the result and verify it differs from the original
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
    "tiled",
  ] as const)("supports position: %s", async (position) => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ text: "Pos", position }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  it("respects custom opacity and font size", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ text: "Custom", opacity: 80, fontSize: 24 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("respects custom color and rotation", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ text: "Red", color: "#FF0000", rotation: 45 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("rejects request without a file", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({ text: "NoFile" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects request without text", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("Invalid settings");
  });

  it("rejects invalid color format", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ text: "Bad", color: "red" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects opacity out of range", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ text: "Bad", opacity: 200 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Branch coverage: lines 45-46 (metadata fallback for width/height) ──

  it("handles tiny 1x1 image input", async () => {
    const TINY = readFixture(fixtures.image.edge.px1);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", contentType: "image/png", content: TINY },
      { name: "settings", content: JSON.stringify({ text: "Tiny", position: "center" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  // ── Branch coverage: line 61 (tiled with maxElements cap) ─────────

  it("handles tiled watermark on a large image", async () => {
    const LARGE = readFixture(fixtures.image.stressLarge);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "large.jpg", contentType: "image/jpeg", content: LARGE },
      {
        name: "settings",
        content: JSON.stringify({
          text: "CONFIDENTIAL",
          position: "tiled",
          fontSize: 12,
          rotation: -30,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  // ── HEIC input handling ───────────────────────────────────────────

  it("handles HEIC input", { timeout: 120_000 }, async () => {
    const HEIC = readFixture(fixtures.image.base.heic200);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
      { name: "settings", content: JSON.stringify({ text: "HEIC Test" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  // ── XML escaping in text ──────────────────────────────────────────

  it("handles special XML characters in watermark text", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ text: '<Test & "Quotes">' }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  // ── Tiled with small fontSize produces many elements ──────────────

  it("handles tiled watermark with very small fontSize", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          text: "W",
          position: "tiled",
          fontSize: 8,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  // ── JPEG format preserves as JPEG ─────────────────────────────────

  it("preserves JPEG format", async () => {
    const JPG = readFixture(fixtures.image.base.jpg100);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ text: "JPEG" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
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
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("jpeg");
  });

  // ── Rejects text exceeding max length ────────────────────────────

  it("rejects text exceeding max length (>500 chars)", async () => {
    const longText = "A".repeat(501);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ text: longText }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Max rotation values ──────────────────────────────────────────

  it("applies maximum rotation (+360)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ text: "Rotated", rotation: 360 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("applies negative rotation (-360)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ text: "NegRotated", rotation: -360 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  // ── WebP input ───────────────────────────────────────────────────

  it("processes WebP input", async () => {
    const WEBP = readFixture(fixtures.image.base.webp50);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.webp", contentType: "image/webp", content: WEBP },
      { name: "settings", content: JSON.stringify({ text: "WebP" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  // ── Rejects unauthenticated request ──────────────────────────────

  it("rejects unauthenticated request", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ text: "Unauth" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  // ── Max fontSize boundary ────────────────────────────────────────

  it("applies maximum font size (1000)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ text: "BIG", fontSize: 1000 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  // ── All parameters combined ──────────────────────────────────────

  it("applies all parameters: position, color, opacity, fontSize, rotation", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          text: "Full",
          position: "bottom-right",
          color: "#00FF00",
          opacity: 90,
          fontSize: 32,
          rotation: -45,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  // ── Rotation exceeding range ─────────────────────────────────────

  it("rejects rotation exceeding range (>360)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ text: "Bad", rotation: 361 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── HEIF input ───────────────────────────────────────────────────

  it(
    "handles HEIF input (motorcycle.heif)",
    { timeout: 120_000 },
    async () => {
      const HEIF = readFixture(fixtures.image.motorcycle);
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "photo.heif", contentType: "image/heif", content: HEIF },
        { name: "settings", content: JSON.stringify({ text: "HEIF Test" }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/watermark-text",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        body,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.downloadUrl).toBeDefined();
    },
    60_000,
  );

  // ── Animated GIF input ──────────────────────────────────────────

  it("handles animated GIF input", async () => {
    const GIF = readFixture(fixtures.image.animated.gif);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "anim.gif", contentType: "image/gif", content: GIF },
      { name: "settings", content: JSON.stringify({ text: "GIF Test" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  // ── SVG input ───────────────────────────────────────────────────

  it("handles SVG input", async () => {
    const SVG = readFixture(fixtures.image.base.svg100);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "icon.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ text: "SVG Test" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  // ── Zero opacity watermark ────────────────────────────────────────

  it("applies watermark with zero opacity (invisible)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ text: "Ghost", opacity: 0, fontSize: 24 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  // ── Minimum font size boundary ──────────────────────────────────

  it("applies minimum font size (8)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ text: "Tiny font", fontSize: 8, position: "top-left" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  // ── Rejects fontSize below minimum ──────────────────────────────

  it("rejects fontSize below minimum (<8)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ text: "Bad", fontSize: 7 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Rejects fontSize above maximum ──────────────────────────────

  it("rejects fontSize above maximum (>1000)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ text: "Bad", fontSize: 1001 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── TIFF input format ───────────────────────────────────────────

  it("processes TIFF input format", async () => {
    const TIFF = readFixture(fixtures.image.formats("tiff"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.tiff", contentType: "image/tiff", content: TIFF },
      { name: "settings", content: JSON.stringify({ text: "TIFF Test" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  // ── Multiline text (newlines in text) ───────────────────────────

  it("handles text with newline characters", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ text: "Line1\nLine2" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  // ── Tiled with max fontSize on small image ──────────────────────

  it("handles tiled watermark with large fontSize on small image", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          text: "BIG",
          position: "tiled",
          fontSize: 200,
          rotation: 45,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  // ── Color with 8-char hex (should be rejected) ──────────────────

  it("rejects 8-character hex color (no alpha support)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ text: "Bad", color: "#FF000080" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Preserves image dimensions ───────────────────────────────────

  it("preserves image dimensions after watermark", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ text: "Dims", position: "bottom-left" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
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
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  // ── Invalid settings JSON ───────────────────────────────────────

  it("rejects malformed settings JSON string", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "not-valid-json" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Stress file with all options ────────────────────────────────

  it("applies full options to stress-large.jpg at bottom-right", async () => {
    const LARGE = readFixture(fixtures.image.stressLarge);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "large.jpg", contentType: "image/jpeg", content: LARGE },
      {
        name: "settings",
        content: JSON.stringify({
          text: "CONFIDENTIAL",
          position: "bottom-right",
          color: "#FF0000",
          opacity: 80,
          fontSize: 64,
          rotation: -30,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  // ── Empty text rejected ─────────────────────────────────────────

  it("rejects empty text string", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ text: "" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Response fields verification ────────────────────────────────

  it("response includes jobId, downloadUrl, originalSize, processedSize", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ text: "Fields" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.jobId).toBeDefined();
    expect(json.downloadUrl).toContain("/api/v1/download/");
    expect(json.originalSize).toBeGreaterThan(0);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  // ── Full opacity watermark (opacity=100) ─────────────────────

  it("applies watermark at full opacity (100)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ text: "Opaque", opacity: 100, fontSize: 24 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  // ── AVIF input format ──────────────────────────────────────────

  it("processes AVIF input", async () => {
    const AVIF = readFixture(fixtures.image.formats("avif"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.avif", contentType: "image/avif", content: AVIF },
      { name: "settings", content: JSON.stringify({ text: "AVIF Test" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  // ── Tiled with rotation 0 (no rotation) ────────────────────────

  it("handles tiled watermark with zero rotation", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          text: "TILE",
          position: "tiled",
          fontSize: 16,
          rotation: 0,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  // ── Text with max length (500 chars) ──────────────────────────

  it("accepts text at exactly max length (500 chars)", async () => {
    const maxText = "A".repeat(500);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ text: maxText }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  // ── Color in lowercase hex ─────────────────────────────────────

  it("accepts lowercase hex color", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ text: "Lower", color: "#aabb00" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  // ── Rejects negative opacity ──────────────────────────────────

  it("rejects negative opacity", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ text: "Bad", opacity: -1 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Rejects rotation below -360 ───────────────────────────────

  it("rejects rotation below -360", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ text: "Bad", rotation: -361 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });
});
