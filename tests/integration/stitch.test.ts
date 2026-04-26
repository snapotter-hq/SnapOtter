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

  // ── Extended coverage: resize modes, alignment, edge cases ─────────

  it("stitches vertically with original mode (no resizing)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ direction: "vertical", resizeMode: "original" }),
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
    // Original sizes: max width = 200, total height = 150 + 100 = 250
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(250);
  });

  it("stitches horizontally with stretch mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ direction: "horizontal", resizeMode: "stretch" }),
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
    // Stretch mode: both images get min height (100), widths preserved
    expect(meta.height).toBe(100);
  });

  it("stitches vertically with stretch mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ direction: "vertical", resizeMode: "stretch" }),
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
    // Stretch mode: both images get min width (100), heights preserved
    expect(meta.width).toBe(100);
  });

  it("stitches horizontally with crop mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ direction: "horizontal", resizeMode: "crop" }),
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
    // Crop mode: min height = 100
    expect(meta.height).toBe(100);
  });

  it("stitches vertically with crop mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ direction: "vertical", resizeMode: "crop" }),
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
    // Crop mode vertically: min width = 100
    expect(meta.width).toBe(100);
  });

  it("applies start alignment in horizontal mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          direction: "horizontal",
          resizeMode: "original",
          alignment: "start",
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
  });

  it("applies end alignment in vertical mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          direction: "vertical",
          resizeMode: "original",
          alignment: "end",
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
  });

  it("applies gap in vertical mode", async () => {
    const gap = 25;
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.jpg", contentType: "image/jpeg", content: JPG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          direction: "vertical",
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
    // Two 100px tall images + 25px gap = 225 tall
    expect(meta.height).toBe(100 + 100 + gap);
    expect(meta.width).toBe(100);
  });

  it("stitches in grid mode with fit resize", async () => {
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
          resizeMode: "fit",
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
  });

  it("stitches in grid mode with crop resize", async () => {
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
          resizeMode: "crop",
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
  });

  it("stitches in grid mode with original resize (no scaling)", async () => {
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
          resizeMode: "original",
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
  });

  it("applies gap and border together in grid mode", async () => {
    const gap = 10;
    const border = 15;
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.jpg", contentType: "image/jpeg", content: JPG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "f3", filename: "c.jpg", contentType: "image/jpeg", content: JPG },
      { name: "f4", filename: "d.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          direction: "grid",
          gridColumns: 2,
          resizeMode: "stretch",
          gap,
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
    // 2 cols x 2 rows: 2*100 + 1*10 + 2*15 = 240 wide, 2*100 + 1*10 + 2*15 = 240 tall
    expect(meta.width).toBe(2 * 100 + gap + 2 * border);
    expect(meta.height).toBe(2 * 100 + gap + 2 * border);
  });

  it("applies custom background color", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          direction: "horizontal",
          resizeMode: "original",
          backgroundColor: "#0000FF",
          gap: 20,
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
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("outputs in jpeg format", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          direction: "horizontal",
          format: "jpeg",
          quality: 80,
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
    expect(meta.format).toBe("jpeg");
  });

  it("outputs in avif format", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          direction: "horizontal",
          format: "avif",
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
    expect(meta.format).toBe("heif");
  });

  it("handles HEIC input", async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.heic", contentType: "image/heic", content: HEIC },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
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

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("stitches 5+ images horizontally", async () => {
    const WEBP = readFileSync(join(FIXTURES, "test-50x50.webp"));
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "f3", filename: "c.webp", contentType: "image/webp", content: WEBP },
      { name: "f4", filename: "d.png", contentType: "image/png", content: PNG },
      { name: "f5", filename: "e.jpg", contentType: "image/jpeg", content: JPG },
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
    // 200 + 100 + 50 + 200 + 100 = 650 wide
    expect(meta.width).toBe(650);
  });

  it("rejects invalid format value", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({ direction: "horizontal", format: "bmp" }),
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

  it("rejects invalid JSON in settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: "{{bad json" },
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
    expect(result.error).toMatch(/json/i);
  });

  // ── Branch coverage: invalid file validation (line 157 area) ────────

  it("rejects an invalid/corrupt image file", async () => {
    const corruptBuffer = Buffer.from("this is not a valid image file");
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "corrupt.png", contentType: "image/png", content: corruptBuffer },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
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
    expect(result.error).toMatch(/invalid file/i);
  });

  // ── Branch coverage: horizontal fit when image already matches min height (line 300) ──

  it("stitches horizontally with fit mode when images have same height", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.jpg", contentType: "image/jpeg", content: JPG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
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
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    // Both 100x100, same height: no resizing needed, combined = 200x100
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(100);
  });

  // ── Branch coverage: vertical fit when image already matches min width (line 338) ──

  it("stitches vertically with fit mode when images have same width", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.jpg", contentType: "image/jpeg", content: JPG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
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
    // Both 100x100, same width: no resizing needed, combined = 100x200
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(200);
  });

  // ── Branch coverage: grid fit with large image (line 377 area) ──────

  it("stitches in grid mode with fit resize where images already fit", async () => {
    // All same-size images: scale factor >= 1 means no resizing
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.jpg", contentType: "image/jpeg", content: JPG },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "f3", filename: "c.jpg", contentType: "image/jpeg", content: JPG },
      { name: "f4", filename: "d.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "settings",
        content: JSON.stringify({
          direction: "grid",
          gridColumns: 2,
          resizeMode: "fit",
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
    // 2 cols, 2 rows of 100x100; no gap, no border
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(200);
  });

  // ── Branch coverage: corner radius with webp output ─────────────────

  it("applies corner radius with webp output format", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          direction: "horizontal",
          cornerRadius: 30,
          format: "webp",
          quality: 80,
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

  // ── Branch coverage: corner radius with avif output ─────────────────

  it("applies corner radius with avif output format", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          direction: "horizontal",
          cornerRadius: 20,
          format: "avif",
          quality: 70,
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
    expect(meta.format).toBe("heif");
  });

  // ── Branch coverage: corner radius with jpeg output (flatten) ───────

  it("applies corner radius with jpeg output format (flattens alpha)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "f2", filename: "b.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          direction: "horizontal",
          cornerRadius: 15,
          format: "jpeg",
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
    expect(meta.format).toBe("jpeg");
  });

  // ── Branch coverage: 1x1 tiny images ────────────────────────────────

  it("handles 1x1 pixel input images", async () => {
    const TINY = readFileSync(join(FIXTURES, "test-1x1.png"));
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "a.png", contentType: "image/png", content: TINY },
      { name: "f2", filename: "b.png", contentType: "image/png", content: TINY },
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

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  // ── Branch coverage: large file handling ────────────────────────────

  it("handles a large content image in stitching", async () => {
    const LARGE = readFileSync(join(FIXTURES, "content", "stress-large.jpg"));
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "large.jpg", contentType: "image/jpeg", content: LARGE },
      { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
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
    expect(result.processedSize).toBeGreaterThan(0);
  });
});
