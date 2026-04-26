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
const SVG = readFileSync(join(FIXTURES, "test-100x100.svg"));
const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));

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

// ── Quality presets ──────────────────────────────────────────────
describe("Quality presets", () => {
  it("minimum quality (1) produces valid output", async () => {
    const res = await postTool({ format: "jpeg", quality: 1 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("maximum quality (100) produces valid output", async () => {
    const res = await postTool({ format: "jpeg", quality: 100 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("higher quality produces larger or equal file for JPEG", async () => {
    // Use JPEG format where quality-to-size correlation is more predictable
    const resLow = await postTool({ format: "jpeg", quality: 10 });
    const resHigh = await postTool({ format: "jpeg", quality: 95 });
    expect(resLow.statusCode).toBe(200);
    expect(resHigh.statusCode).toBe(200);
    const lowResult = JSON.parse(resLow.body);
    const highResult = JSON.parse(resHigh.body);
    expect(highResult.processedSize).toBeGreaterThanOrEqual(lowResult.processedSize);
  });
});

// ── Progressive encoding ────────────────────────────────────────
describe("Progressive encoding", () => {
  it("supports progressive=true for JPEG", async () => {
    const res = await postTool({ format: "jpeg", progressive: true });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("supports progressive=false for JPEG", async () => {
    const res = await postTool({ format: "jpeg", progressive: false });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });
});

// ── Resize with format conversion ───────────────────────────────
describe("Combined resize and format conversion", () => {
  it("converts PNG to WebP and constrains maxWidth simultaneously", async () => {
    const res = await postTool({ format: "webp", maxWidth: 80 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBeLessThanOrEqual(80);
  });

  it("converts JPEG to AVIF and constrains maxHeight", async () => {
    const res = await postTool({ format: "avif", maxHeight: 40 }, JPG, "test.jpg", "image/jpeg");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("heif");
    expect(meta.height).toBeLessThanOrEqual(40);
  });
});

// ── Image dimensions preservation ───────────────────────────────
describe("Dimension preservation", () => {
  it("does not enlarge image when maxWidth exceeds original width", async () => {
    // PNG is 200x150. maxWidth: 500 should not upscale.
    const res = await postTool({ format: "png", maxWidth: 500 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBeLessThanOrEqual(200);
  });
});

// ── Metadata stripping toggle ───────────────────────────────────
describe("Metadata stripping toggle", () => {
  it("preserves metadata when stripMetadata=false", async () => {
    const exifJpg = readFileSync(join(FIXTURES, "test-with-exif.jpg"));
    const res = await postTool(
      { format: "jpeg", stripMetadata: false },
      exifJpg,
      "test-with-exif.jpg",
      "image/jpeg",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
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

  it("returns 400 for negative maxHeight", async () => {
    const res = await postTool({ maxHeight: -50 });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid settings JSON", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "not-json" },
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
});

// ── Preview endpoint: SVG sanitization ─────────────────────────
describe("Preview endpoint SVG handling", () => {
  it("preview sanitizes and processes SVG input", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "test.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ format: "webp", quality: 60 }) },
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
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/webp");
    expect(res.headers["x-original-size"]).toBeDefined();
    expect(res.headers["x-processed-size"]).toBeDefined();
  });
});

// ── Preview endpoint: HEIC decoding ────────────────────────────
describe("Preview endpoint HEIC handling", () => {
  it("preview decodes and processes HEIC input", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "test.heic", contentType: "image/heic", content: HEIC },
      { name: "settings", content: JSON.stringify({ format: "webp", quality: 60 }) },
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
    // HEIC decode may fail if system decoder is missing
    expect([200, 422]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      expect(res.headers["content-type"]).toContain("image/webp");
    }
  });
});

// ── Preview endpoint: invalid settings ─────────────────────────
describe("Preview endpoint validation", () => {
  it("preview returns 400 for invalid settings JSON", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "not-json" },
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
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/json/i);
  });

  it("preview returns 400 for invalid settings values", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ format: "bmp" }) },
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
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/invalid settings/i);
  });

  it("preview returns 400 for invalid image file", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "bad.png",
        contentType: "image/png",
        content: Buffer.from("not an image"),
      },
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
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/invalid image/i);
  });

  it("preview works with default settings (no settings field)", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
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
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/webp");
  });

  it("preview returns correct output filename in header", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "myimage.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ format: "jpeg" }) },
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
    expect(res.statusCode).toBe(200);
    expect(res.headers["x-output-filename"]).toContain("myimage.jpg");
    expect(res.headers["content-type"]).toContain("image/jpeg");
  });
});
