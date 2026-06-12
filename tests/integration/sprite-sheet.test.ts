/**
 * Integration tests for the sprite-sheet tool (/api/v1/tools/sprite-sheet).
 *
 * Covers grid layout, dimension math, frames payload, and minimum input guard.
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

describe("Sprite Sheet", () => {
  it("creates a sprite sheet from 4 images with 2 columns", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "c.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "d.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ columns: 2 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/sprite-sheet",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.frames).toHaveLength(4);

    // Download and verify dimensions: 2 cols x 2 rows of 200x150 cells
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    // First image is 200x150, so cells are 200x150
    // 2 cols, 2 rows, no padding
    expect(meta.width).toBe(200 * 2);
    expect(meta.height).toBe(150 * 2);
  });

  it("rejects single input", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/sprite-sheet",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    // The factory wraps InputValidationError as 422
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });
});
