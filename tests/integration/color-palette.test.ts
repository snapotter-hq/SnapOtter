/**
 * Integration tests for the color-palette tool.
 *
 * This tool extracts dominant colors from an image and returns JSON
 * (not an image). Tests verify response shape, color count, and format handling.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
const PNG = readFileSync(join(FIXTURES, "test-200x150.png"));
const JPG = readFileSync(join(FIXTURES, "test-100x100.jpg"));
const WEBP = readFileSync(join(FIXTURES, "test-50x50.webp"));

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

function makeFilePayload(buffer: Buffer, filename: string, contentType: string) {
  return createMultipartPayload([{ name: "file", filename, contentType, content: buffer }]);
}

// ── Basic extraction ──────────────────────────────────────────────
describe("Color extraction", () => {
  it("extracts palette from PNG and returns colors array", async () => {
    const { body: payload, contentType } = makeFilePayload(PNG, "test.png", "image/png");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.colors).toBeDefined();
    expect(Array.isArray(result.colors)).toBe(true);
    expect(result.colors.length).toBeGreaterThan(0);
    expect(result.colors.length).toBeLessThanOrEqual(8);
    expect(result.count).toBe(result.colors.length);
    expect(result.filename).toBeDefined();
  });

  it("returns hex color strings in #RRGGBB format", async () => {
    const { body: payload, contentType } = makeFilePayload(PNG, "test.png", "image/png");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    for (const color of result.colors) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

// ── Solid color image ─────────────────────────────────────────────
describe("Solid color image", () => {
  it("returns a single dominant color for a solid red image", async () => {
    const redBuffer = await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();

    const { body: payload, contentType } = makeFilePayload(redBuffer, "red.png", "image/png");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.colors.length).toBe(1);
    // The quantized red should be close to #f00000 or #ff0000
    expect(result.colors[0]).toMatch(/^#[ef][0f]0000$/);
  });
});

// ── Format support ────────────────────────────────────────────────
describe("Multiple input formats", () => {
  it("extracts palette from JPEG", async () => {
    const { body: payload, contentType } = makeFilePayload(JPG, "test.jpg", "image/jpeg");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.colors.length).toBeGreaterThan(0);
  });

  it("extracts palette from WebP", async () => {
    const { body: payload, contentType } = makeFilePayload(WEBP, "test.webp", "image/webp");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.colors.length).toBeGreaterThan(0);
  });
});

// ── Error handling ────────────────────────────────────────────────
describe("Error handling", () => {
  it("returns 400 when no file is provided", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "other", content: "nothing" },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toBeDefined();
  });

  it("returns 422 for corrupted image data", async () => {
    const badBuffer = Buffer.from("not an image at all");
    const { body: payload, contentType } = makeFilePayload(badBuffer, "bad.png", "image/png");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-palette",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(422);
  });
});
