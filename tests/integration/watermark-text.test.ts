/**
 * Integration tests for the watermark-text tool.
 *
 * Adds an SVG text watermark onto an image. Tests verify position options,
 * opacity, font size, tiled mode, and input validation.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
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

describe("watermark-text", () => {
  it("adds a text watermark with default settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ text: "Sample" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/watermark-text",
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
      url: "/api/v1/tools/watermark-text",
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
      url: "/api/v1/tools/watermark-text",
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
      url: "/api/v1/tools/watermark-text",
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
      url: "/api/v1/tools/watermark-text",
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
      url: "/api/v1/tools/watermark-text",
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
      url: "/api/v1/tools/watermark-text",
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
      url: "/api/v1/tools/watermark-text",
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
      url: "/api/v1/tools/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Branch coverage: lines 45-46 (metadata fallback for width/height) ──

  it("handles tiny 1x1 image input", async () => {
    const TINY = readFileSync(join(FIXTURES, "test-1x1.png"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", contentType: "image/png", content: TINY },
      { name: "settings", content: JSON.stringify({ text: "Tiny", position: "center" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  // ── Branch coverage: line 61 (tiled with maxElements cap) ─────────

  it("handles tiled watermark on a large image", async () => {
    const LARGE = readFileSync(join(FIXTURES, "content", "stress-large.jpg"));
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
      url: "/api/v1/tools/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.processedSize).toBeGreaterThan(0);
  });

  // ── HEIC input handling ───────────────────────────────────────────

  it("handles HEIC input", async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
      { name: "settings", content: JSON.stringify({ text: "HEIC Test" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/watermark-text",
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
      url: "/api/v1/tools/watermark-text",
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
      url: "/api/v1/tools/watermark-text",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  // ── JPEG format preserves as JPEG ─────────────────────────────────

  it("preserves JPEG format", async () => {
    const JPG = readFileSync(join(FIXTURES, "test-100x100.jpg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ text: "JPEG" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/watermark-text",
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
});
