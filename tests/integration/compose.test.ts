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
});
