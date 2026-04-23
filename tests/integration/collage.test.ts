/**
 * Integration tests for the collage tool (/api/v1/tools/collage).
 *
 * Collage accepts multiple images (any field name, type === "file") and
 * arranges them in a template-based grid layout. It uses a custom route
 * rather than createToolRoute.
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

describe("Collage", () => {
  it("creates a 2-image horizontal collage", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
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

  it("creates a 2-image vertical collage", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-v-equal" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
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

  it("creates a 4-image grid collage", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "f3", filename: "c.png", contentType: "image/png", content: PNG },
      { name: "f4", filename: "d.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "4-grid" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
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

  it("handles single image with a 2-image template (fills first cell only)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "solo.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
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

  it("applies custom gap between cells", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal", gap: 30 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
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

  it("uses a specific aspect ratio", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal", aspectRatio: "1:1" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    // Download and verify square aspect ratio
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(meta.height);
  });

  it("outputs in JPEG format when requested", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          templateId: "2-h-equal",
          outputFormat: "jpeg",
          quality: 80,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
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
    expect(meta.format).toBe("jpeg");
  });

  it("applies corner radius to cells", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal", cornerRadius: 20 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
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

  it("uses transparent background", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          templateId: "2-h-equal",
          backgroundColor: "transparent",
          outputFormat: "png",
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
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
    expect(meta.channels).toBe(4); // alpha channel for transparency
  });

  // ── Validation ──────────────────────────────────────────────────────

  it("rejects requests with no images", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/no images/i);
  });

  it("rejects unknown template ID", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "nonexistent-layout" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/unknown template/i);
  });

  it("rejects gap exceeding max (500)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal", gap: 600 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects invalid output format", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal", outputFormat: "bmp" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
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
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ templateId: "2-h-equal" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/collage",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });
});
