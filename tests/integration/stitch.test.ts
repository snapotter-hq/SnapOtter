/**
 * Integration tests for the stitch tool (/api/v1/tools/stitch).
 *
 * Stitch joins multiple images horizontally, vertically, or in a grid.
 * It requires at least 2 images and accepts them via any file field name
 * (type === "file").
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

describe("Stitch", () => {
  it("stitches two images horizontally with fit mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ direction: "horizontal", resizeMode: "fit" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/stitch",
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

    // Download and verify dimensions: fit mode scales to smallest height
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    // Both scaled to min height (100). PNG 200x150 -> 133x100, JPG stays 100x100.
    // Total width = 133 + 100 = 233, height = 100
    expect(meta.height).toBe(100);
    expect(meta.width).toBeGreaterThan(200); // combined width
  });

  it("stitches two images vertically with fit mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ direction: "vertical", resizeMode: "fit" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/stitch",
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
    // fit mode scales to smallest width (100). PNG 200x150 -> 100x75, JPG stays 100x100.
    // Total height = 75 + 100 = 175, width = 100
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(175);
  });

  it("stitches with original resize mode (no resizing)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ direction: "horizontal", resizeMode: "original" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/stitch",
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
    // Original sizes: 200 + 100 = 300 wide, max height = 150
    expect(meta.width).toBe(300);
    expect(meta.height).toBe(150);
  });

  it("stitches in grid mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "f3", filename: "c.png", contentType: "image/png", content: PNG },
      { name: "f4", filename: "d.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          direction: "grid",
          gridColumns: 2,
          resizeMode: "stretch",
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/stitch",
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

  it("applies gap between images", async () => {
    const gap = 20;
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.jpg", contentType: "image/jpeg", content: JPG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          direction: "horizontal",
          resizeMode: "original",
          gap,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/stitch",
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
    // Two 100px wide images + 20px gap = 220 wide
    expect(meta.width).toBe(100 + 100 + gap);
    expect(meta.height).toBe(100);
  });

  it("applies border around the stitched result", async () => {
    const border = 15;
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.jpg", contentType: "image/jpeg", content: JPG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          direction: "horizontal",
          resizeMode: "original",
          border,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/stitch",
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
    // Two 100px images + 15px border on each side = 230 wide, 130 tall
    expect(meta.width).toBe(100 + 100 + border * 2);
    expect(meta.height).toBe(100 + border * 2);
  });

  it("outputs in webp format", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          direction: "horizontal",
          format: "webp",
          quality: 85,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/stitch",
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
    expect(meta.format).toBe("webp");
  });

  it("applies corner radius to the final result", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          direction: "horizontal",
          cornerRadius: 30,
          format: "png",
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/stitch",
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
    // Corner radius forces PNG with alpha
    expect(meta.channels).toBe(4);
  });

  // ── Validation ──────────────────────────────────────────────────────

  it("rejects requests with fewer than 2 images", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "solo.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ direction: "horizontal" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/stitch",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/at least 2/i);
  });

  it("rejects requests with no images", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "settings",
        content: JSON.stringify({ direction: "horizontal" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/stitch",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects invalid direction", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ direction: "diagonal" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/stitch",
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

  it("rejects invalid backgroundColor (non-hex)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ backgroundColor: "red" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/stitch",
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
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/stitch",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });
});
