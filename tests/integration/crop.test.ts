/**
 * Integration tests for the crop tool (/api/v1/tools/crop).
 *
 * This is a Sharp-based tool (no AI sidecar). All processing tests should
 * return 200. Output dimensions are verified by downloading the result and
 * reading metadata with sharp.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
const PNG = readFileSync(join(FIXTURES, "test-200x150.png"));
const JPG = readFileSync(join(FIXTURES, "test-100x100.jpg"));
const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
const TINY = readFileSync(join(FIXTURES, "test-1x1.png"));

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

/** Helper: POST to crop, assert 200, download result, return sharp metadata. */
async function cropAndMeta(
  settings: Record<string, unknown>,
  file = PNG,
  filename = "test.png",
  fileCt = "image/png",
) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: fileCt, content: file },
    { name: "settings", content: JSON.stringify(settings) },
  ]);

  const res = await app.inject({
    method: "POST",
    url: "/api/v1/tools/crop",
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": contentType,
    },
    body,
  });

  expect(res.statusCode).toBe(200);
  const result = JSON.parse(res.body);
  expect(result.downloadUrl).toBeDefined();

  const dlRes = await app.inject({
    method: "GET",
    url: result.downloadUrl,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  expect(dlRes.statusCode).toBe(200);

  return sharp(dlRes.rawPayload).metadata();
}

describe("Crop", () => {
  // ── Processing with dimension verification ───────────────────────

  it("route exists and responds to POST", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ left: 0, top: 0, width: 100, height: 100 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/crop",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("crops a region from the top-left corner", async () => {
    const meta = await cropAndMeta({ left: 0, top: 0, width: 100, height: 75 });
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(75);
  });

  it("crops a region from the center", async () => {
    const meta = await cropAndMeta({ left: 50, top: 25, width: 100, height: 100 });
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(100);
  });

  it("crops a small region", async () => {
    const meta = await cropAndMeta({ left: 10, top: 10, width: 20, height: 20 });
    expect(meta.width).toBe(20);
    expect(meta.height).toBe(20);
  });

  it("crops the full image dimensions (no-op crop)", async () => {
    const meta = await cropAndMeta({ left: 0, top: 0, width: 200, height: 150 });
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("crops a 1-pixel-wide strip", async () => {
    const meta = await cropAndMeta({ left: 50, top: 0, width: 1, height: 150 });
    expect(meta.width).toBe(1);
    expect(meta.height).toBe(150);
  });

  it("crops a 1-pixel-tall strip", async () => {
    const meta = await cropAndMeta({ left: 0, top: 50, width: 200, height: 1 });
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(1);
  });

  it("crops with percent unit", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ left: 10, top: 10, width: 50, height: 50, unit: "percent" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/crop",
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

  it("works with JPEG input", async () => {
    const meta = await cropAndMeta(
      { left: 10, top: 10, width: 50, height: 50 },
      JPG,
      "test.jpg",
      "image/jpeg",
    );
    expect(meta.width).toBe(50);
    expect(meta.height).toBe(50);
  });

  it("handles HEIC input", { timeout: 120_000 }, async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
      {
        name: "settings",
        content: JSON.stringify({ left: 0, top: 0, width: 100, height: 100 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/crop",
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

  it("handles 1x1 pixel input", async () => {
    const meta = await cropAndMeta(
      { left: 0, top: 0, width: 1, height: 1 },
      TINY,
      "tiny.png",
      "image/png",
    );
    expect(meta.width).toBe(1);
    expect(meta.height).toBe(1);
  });

  // ── Validation ───────────────────────────────────────────────────

  it("rejects requests without a file", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "settings",
        content: JSON.stringify({ left: 0, top: 0, width: 100, height: 100 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/crop",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/no image/i);
  });

  it("rejects invalid settings JSON", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "not json{{{" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/crop",
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

  it("rejects missing required fields", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ left: 0 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/crop",
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

  it("rejects negative left value", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ left: -10, top: 0, width: 100, height: 100 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/crop",
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

  it("rejects invalid unit value", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ left: 0, top: 0, width: 100, height: 100, unit: "em" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/crop",
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

  it("rejects unauthenticated requests", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ left: 0, top: 0, width: 100, height: 100 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/crop",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });
});
