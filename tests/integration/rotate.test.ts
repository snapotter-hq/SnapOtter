/**
 * Integration tests for the rotate tool (/api/v1/tools/rotate).
 *
 * This is a Sharp-based tool (no AI sidecar). All processing tests should
 * return 200. Output dimensions are verified by downloading the result and
 * reading metadata with sharp. Rotation by 90/270 swaps width and height.
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

/** Helper: POST to rotate, assert 200, download result, return sharp metadata. */
async function rotateAndMeta(
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
    url: "/api/v1/tools/rotate",
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

describe("Rotate", () => {
  // ── Processing with dimension verification ───────────────────────

  it("route exists and responds to POST", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ angle: 90 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/rotate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("rotates 90 degrees (swaps width and height)", async () => {
    const meta = await rotateAndMeta({ angle: 90 });
    // 200x150 rotated 90 -> 150x200
    expect(meta.width).toBe(150);
    expect(meta.height).toBe(200);
  });

  it("rotates 180 degrees (dimensions unchanged)", async () => {
    const meta = await rotateAndMeta({ angle: 180 });
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("rotates 270 degrees (swaps width and height)", async () => {
    const meta = await rotateAndMeta({ angle: 270 });
    expect(meta.width).toBe(150);
    expect(meta.height).toBe(200);
  });

  it("rotates 0 degrees (no-op)", async () => {
    const meta = await rotateAndMeta({ angle: 0 });
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("uses default settings (angle: 0, no flip)", async () => {
    const meta = await rotateAndMeta({});
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("flips horizontally", async () => {
    const meta = await rotateAndMeta({ horizontal: true });
    // Horizontal flip does not change dimensions
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("flips vertically", async () => {
    const meta = await rotateAndMeta({ vertical: true });
    // Vertical flip does not change dimensions
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("flips both horizontal and vertical", async () => {
    const meta = await rotateAndMeta({ horizontal: true, vertical: true });
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("rotates 90 degrees and flips horizontally", async () => {
    const meta = await rotateAndMeta({ angle: 90, horizontal: true });
    // 90 degree rotation swaps dimensions, flip preserves them
    expect(meta.width).toBe(150);
    expect(meta.height).toBe(200);
  });

  it("rotates negative angle (-90 = 270)", async () => {
    const meta = await rotateAndMeta({ angle: -90 });
    // -90 degrees is equivalent to 270 degrees
    expect(meta.width).toBe(150);
    expect(meta.height).toBe(200);
  });

  it("works with JPEG input", async () => {
    const meta = await rotateAndMeta({ angle: 90 }, JPG, "test.jpg", "image/jpeg");
    // 100x100 square stays 100x100 after any rotation
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(100);
  });

  it("handles HEIC input", { timeout: 120_000 }, async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
      { name: "settings", content: JSON.stringify({ angle: 90 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/rotate",
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
    const meta = await rotateAndMeta({ angle: 90 }, TINY, "tiny.png", "image/png");
    expect(meta.width).toBe(1);
    expect(meta.height).toBe(1);
  });

  // ── Validation ───────────────────────────────────────────────────

  it("rejects requests without a file", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({ angle: 90 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/rotate",
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
      url: "/api/v1/tools/rotate",
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

  it("rejects unauthenticated requests", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ angle: 90 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/rotate",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });
});
