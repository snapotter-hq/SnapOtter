/**
 * Integration tests for the watermark-image tool.
 *
 * Overlays one image onto another as a watermark. Uses a custom route
 * (not createToolRoute) with two file fields: "file" for the main image
 * and "watermark" for the overlay image.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
const PNG = readFileSync(join(FIXTURES, "test-200x150.png"));
const SMALL_PNG = readFileSync(join(FIXTURES, "test-1x1.png"));
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

describe("watermark-image", () => {
  it("overlays a watermark image with default settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: PNG },
      { name: "watermark", filename: "wm.png", contentType: "image/png", content: SMALL_PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/watermark-image",
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
      url: "/api/v1/tools/watermark-image",
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
      url: "/api/v1/tools/watermark-image",
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
      url: "/api/v1/tools/watermark-image",
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
      url: "/api/v1/tools/watermark-image",
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
      url: "/api/v1/tools/watermark-image",
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
      url: "/api/v1/tools/watermark-image",
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
      url: "/api/v1/tools/watermark-image",
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
      url: "/api/v1/tools/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("Invalid settings");
  });

  // ── Branch coverage: lines 164-168 (processing failure) ───────────

  it("returns 422 when processing fails on corrupted main image", async () => {
    // A buffer that passes multipart parsing but fails Sharp processing
    const corruptedBuffer = Buffer.alloc(100, 0xff);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "main.png", contentType: "image/png", content: corruptedBuffer },
      { name: "watermark", filename: "wm.png", contentType: "image/png", content: SMALL_PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(422);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("Processing failed");
  });

  // ── HEIC input handling ───────────────────────────────────────────

  it("processes HEIC main image", async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
      { name: "watermark", filename: "wm.png", contentType: "image/png", content: SMALL_PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/watermark-image",
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
      url: "/api/v1/tools/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  // ── Stress: large file ────────────────────────────────────────────

  it("processes stress-large.jpg as main image", async () => {
    const LARGE = readFileSync(join(FIXTURES, "content", "stress-large.jpg"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "large.jpg", contentType: "image/jpeg", content: LARGE },
      { name: "watermark", filename: "wm.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ scale: 10 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/watermark-image",
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
      url: "/api/v1/tools/watermark-image",
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
      url: "/api/v1/tools/watermark-image",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });
});
