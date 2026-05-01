/**
 * Integration tests for the resize tool (/api/v1/tools/resize).
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

/** Helper: POST to resize, assert 200, download result, return sharp metadata. */
async function resizeAndMeta(
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
    url: "/api/v1/tools/resize",
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

describe("Resize", () => {
  // ── Processing with dimension verification ───────────────────────

  it("route exists and responds to POST", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("resizes to explicit width (contain preserves aspect ratio)", async () => {
    const meta = await resizeAndMeta({ width: 100 });
    expect(meta.width).toBe(100);
    // contain fit: 200x150 -> 100 wide means height = 75
    expect(meta.height).toBe(75);
  });

  it("resizes to explicit height (contain preserves aspect ratio)", async () => {
    const meta = await resizeAndMeta({ height: 60 });
    // contain fit: 200x150 -> 60 tall means width = 80
    expect(meta.width).toBe(80);
    expect(meta.height).toBe(60);
  });

  it("resizes to both width and height with contain fit", async () => {
    const meta = await resizeAndMeta({ width: 100, height: 100, fit: "contain" });
    // contain: fits within 100x100 box, output dimensions match the box
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(100);
  });

  it("resizes with cover fit", async () => {
    const meta = await resizeAndMeta({ width: 100, height: 100, fit: "cover" });
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(100);
  });

  it("resizes with fill fit (stretches)", async () => {
    const meta = await resizeAndMeta({ width: 50, height: 200, fit: "fill" });
    expect(meta.width).toBe(50);
    expect(meta.height).toBe(200);
  });

  it("resizes with inside fit", async () => {
    const meta = await resizeAndMeta({ width: 100, height: 100, fit: "inside" });
    // inside: same as contain but never enlarges
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(75);
  });

  it("resizes by percentage", async () => {
    const meta = await resizeAndMeta({ percentage: 50 });
    // 50% of 200x150 = 100x75
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(75);
  });

  it("respects withoutEnlargement flag", async () => {
    const meta = await resizeAndMeta({ width: 400, height: 300, withoutEnlargement: true });
    // Should not enlarge beyond original 200x150
    expect(meta.width).toBeLessThanOrEqual(200);
    expect(meta.height).toBeLessThanOrEqual(150);
  });

  it("works with JPEG input", async () => {
    const meta = await resizeAndMeta({ width: 50 }, JPG, "test.jpg", "image/jpeg");
    expect(meta.width).toBe(50);
    expect(meta.height).toBe(50); // 100x100 -> 50x50
  });

  it("works with WebP input", async () => {
    const meta = await resizeAndMeta({ width: 25 }, WEBP, "test.webp", "image/webp");
    expect(meta.width).toBe(25);
    expect(meta.height).toBe(25); // 50x50 -> 25x25
  });

  it("handles HEIC input", { timeout: 120_000 }, async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
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
    const meta = await resizeAndMeta(
      { width: 10, height: 10, fit: "fill" },
      TINY,
      "tiny.png",
      "image/png",
    );
    expect(meta.width).toBe(10);
    expect(meta.height).toBe(10);
  });

  // ── Validation ───────────────────────────────────────────────────

  it("rejects requests without a file", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
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
      url: "/api/v1/tools/resize",
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

  it("rejects invalid fit value", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ width: 100, fit: "stretch" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
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
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });
});
