/**
 * Integration tests for the compress tool.
 *
 * Tests quality-based and target-size compression modes. Verifies that
 * output is actually smaller than input, and that format is preserved.
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
let largeJpg: Buffer;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);

  // Create a larger JPEG at max quality for compression tests
  largeJpg = await sharp(PNG).jpeg({ quality: 100 }).toBuffer();
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

function makePayload(
  settings: Record<string, unknown>,
  buffer: Buffer = largeJpg,
  filename = "test.jpg",
  contentType = "image/jpeg",
) {
  return createMultipartPayload([
    { name: "file", filename, contentType, content: buffer },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
}

async function postTool(
  settings: Record<string, unknown>,
  buffer?: Buffer,
  filename?: string,
  ct?: string,
) {
  const { body: payload, contentType } = makePayload(settings, buffer ?? largeJpg, filename, ct);
  return app.inject({
    method: "POST",
    url: "/api/v1/tools/compress",
    payload,
    headers: {
      "content-type": contentType,
      authorization: `Bearer ${adminToken}`,
    },
  });
}

// ── Quality mode ──────────────────────────────────────────────────
describe("Quality mode compression", () => {
  it("compresses JPEG at quality 50", async () => {
    const res = await postTool({ mode: "quality", quality: 50 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
    expect(result.processedSize).toBeLessThan(result.originalSize);
  });

  it("compresses JPEG at quality 10 (very low)", async () => {
    const res = await postTool({ mode: "quality", quality: 10 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeLessThan(result.originalSize);
  });

  it("uses default quality (80) when quality not specified", async () => {
    const res = await postTool({ mode: "quality" });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("lower quality produces smaller output", async () => {
    const res50 = await postTool({ mode: "quality", quality: 50 });
    const res10 = await postTool({ mode: "quality", quality: 10 });
    expect(res50.statusCode).toBe(200);
    expect(res10.statusCode).toBe(200);
    const result50 = JSON.parse(res50.body);
    const result10 = JSON.parse(res10.body);
    expect(result10.processedSize).toBeLessThan(result50.processedSize);
  });
});

// ── Target size mode ──────────────────────────────────────────────
describe("Target size mode", () => {
  it("compresses to a target file size", async () => {
    const res = await postTool({ mode: "targetSize", targetSizeKb: 5 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

// ── Format preservation ───────────────────────────────────────────
describe("Format preservation", () => {
  it("preserves PNG format", async () => {
    const res = await postTool({ mode: "quality", quality: 50 }, PNG, "test.png", "image/png");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("png");
  });

  it("preserves JPEG format", async () => {
    const res = await postTool({ mode: "quality", quality: 50 });
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

  it("preserves image dimensions after compression", async () => {
    const res = await postTool({ mode: "quality", quality: 30 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });
});

// ── Multiple input formats ────────────────────────────────────────
describe("Multiple input formats", () => {
  it("compresses WebP input", async () => {
    const res = await postTool({ mode: "quality", quality: 50 }, WEBP, "test.webp", "image/webp");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Error handling ────────────────────────────────────────────────
describe("Error handling", () => {
  it("returns 400 when no file is provided", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({ mode: "quality", quality: 50 }) },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compress",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for quality out of range (0)", async () => {
    const res = await postTool({ mode: "quality", quality: 0 });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for quality out of range (101)", async () => {
    const res = await postTool({ mode: "quality", quality: 101 });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid mode", async () => {
    const res = await postTool({ mode: "supercompress" });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for negative targetSizeKb", async () => {
    const res = await postTool({ mode: "targetSize", targetSizeKb: -10 });
    expect(res.statusCode).toBe(400);
  });
});
