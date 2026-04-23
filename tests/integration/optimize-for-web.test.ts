/**
 * Integration tests for the optimize-for-web tool.
 *
 * Tests format conversion (webp, jpeg, avif, png), quality control,
 * max dimension resizing, progressive encoding, metadata stripping,
 * and the preview endpoint.
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

function makePayload(
  settings: Record<string, unknown>,
  buffer: Buffer = PNG,
  filename = "test.png",
  contentType = "image/png",
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
  const { body: payload, contentType } = makePayload(settings, buffer, filename, ct);
  return app.inject({
    method: "POST",
    url: "/api/v1/tools/optimize-for-web",
    payload,
    headers: {
      "content-type": contentType,
      authorization: `Bearer ${adminToken}`,
    },
  });
}

// ── Default optimization ──────────────────────────────────────────
describe("Default optimization", () => {
  it("optimizes PNG with default settings (webp, quality 80)", async () => {
    const res = await postTool({});
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

// ── Output format options ─────────────────────────────────────────
describe("Output format", () => {
  it("outputs as WebP", async () => {
    const res = await postTool({ format: "webp" });
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

  it("outputs as JPEG", async () => {
    const res = await postTool({ format: "jpeg" });
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

  it("outputs as AVIF", async () => {
    const res = await postTool({ format: "avif" });
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

  it("outputs as PNG", async () => {
    const res = await postTool({ format: "png" });
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

  it("renames output file extension to match format", async () => {
    const res = await postTool({ format: "webp" });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toContain(".webp");
  });
});

// ── Quality control ───────────────────────────────────────────────
describe("Quality control", () => {
  it("lower quality produces smaller file", async () => {
    const res90 = await postTool({ format: "jpeg", quality: 95 });
    const res10 = await postTool({ format: "jpeg", quality: 10 });
    expect(res90.statusCode).toBe(200);
    expect(res10.statusCode).toBe(200);
    const result90 = JSON.parse(res90.body);
    const result10 = JSON.parse(res10.body);
    expect(result10.processedSize).toBeLessThanOrEqual(result90.processedSize);
  });
});

// ── Max dimension resizing ────────────────────────────────────────
describe("Max dimension resizing", () => {
  it("constrains width with maxWidth", async () => {
    const res = await postTool({ format: "webp", maxWidth: 100 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBeLessThanOrEqual(100);
  });

  it("constrains height with maxHeight", async () => {
    const res = await postTool({ format: "webp", maxHeight: 50 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.height).toBeLessThanOrEqual(50);
  });

  it("constrains both maxWidth and maxHeight", async () => {
    const res = await postTool({ format: "png", maxWidth: 80, maxHeight: 60 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBeLessThanOrEqual(80);
    expect(meta.height).toBeLessThanOrEqual(60);
  });
});

// ── Metadata stripping ───────────────────────────────────────────
describe("Metadata stripping", () => {
  it("strips metadata by default (stripMetadata=true)", async () => {
    const exifJpg = readFileSync(join(FIXTURES, "test-with-exif.jpg"));
    const res = await postTool(
      { format: "jpeg", stripMetadata: true },
      exifJpg,
      "test-with-exif.jpg",
      "image/jpeg",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(!meta.exif || meta.exif.length === 0).toBe(true);
  });
});

// ── Multiple input formats ────────────────────────────────────────
describe("Multiple input formats", () => {
  it("optimizes JPEG input", async () => {
    const res = await postTool({ format: "webp" }, JPG, "test.jpg", "image/jpeg");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("optimizes WebP input", async () => {
    const res = await postTool({ format: "jpeg" }, WEBP, "test.webp", "image/webp");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Preview endpoint ──────────────────────────────────────────────
describe("Preview endpoint", () => {
  it("returns binary image with size headers", async () => {
    const { body: payload, contentType } = makePayload({ format: "webp", quality: 60 });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/optimize-for-web/preview",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/webp");
    expect(res.headers["x-original-size"]).toBeDefined();
    expect(res.headers["x-processed-size"]).toBeDefined();
    expect(res.headers["x-output-filename"]).toBeDefined();

    // Verify the response is a valid image
    const meta = await sharp(res.rawPayload).metadata();
    expect(meta.format).toBe("webp");
  });

  it("preview returns 400 when no file is provided", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({ format: "webp" }) },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/optimize-for-web/preview",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── Error handling ────────────────────────────────────────────────
describe("Error handling", () => {
  it("returns 400 when no file is provided", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({ format: "webp" }) },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/optimize-for-web",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid format", async () => {
    const res = await postTool({ format: "bmp" });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for quality out of range (0)", async () => {
    const res = await postTool({ quality: 0 });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for quality out of range (101)", async () => {
    const res = await postTool({ quality: 101 });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for negative maxWidth", async () => {
    const res = await postTool({ maxWidth: -100 });
    expect(res.statusCode).toBe(400);
  });
});
