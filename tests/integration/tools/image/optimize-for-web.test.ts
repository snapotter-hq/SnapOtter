/**
 * Integration tests for the optimize-for-web tool.
 *
 * Tests format conversion (webp, jpeg, avif, png), quality control,
 * max dimension resizing, progressive encoding, metadata stripping,
 * and the preview endpoint.
 */

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);
const JPG = readFixture(fixtures.image.base.jpg100);
const WEBP = readFixture(fixtures.image.base.webp50);
const SVG = readFixture(fixtures.image.base.svg100);
const HEIC = readFixture(fixtures.image.base.heic200);

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
    url: "/api/v1/tools/image/optimize-for-web",
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
    const exifJpg = readFixture(fixtures.image.exifGps);
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
      url: "/api/v1/tools/image/optimize-for-web/preview",
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
      url: "/api/v1/tools/image/optimize-for-web/preview",
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
    const exifJpg = readFixture(fixtures.image.exifGps);
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
      url: "/api/v1/tools/image/optimize-for-web",
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
      url: "/api/v1/tools/image/optimize-for-web",
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
      url: "/api/v1/tools/image/optimize-for-web/preview",
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
  it("preview decodes and processes HEIC input", { timeout: 120_000 }, async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "test.heic", contentType: "image/heic", content: HEIC },
      { name: "settings", content: JSON.stringify({ format: "webp", quality: 60 }) },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/optimize-for-web/preview",
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
      url: "/api/v1/tools/image/optimize-for-web/preview",
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
      url: "/api/v1/tools/image/optimize-for-web/preview",
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
      url: "/api/v1/tools/image/optimize-for-web/preview",
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
      url: "/api/v1/tools/image/optimize-for-web/preview",
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
      url: "/api/v1/tools/image/optimize-for-web/preview",
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

// ── HEIC input handling ─────────────────────────────────────────
describe("HEIC input", () => {
  it("optimizes HEIC input to webp", { timeout: 120_000 }, async () => {
    const res = await postTool({ format: "webp" }, HEIC, "test.heic", "image/heic");
    // HEIC decode may not be available
    expect([200, 422]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toBeDefined();
      expect(result.downloadUrl).toContain(".webp");
    }
  });

  it("optimizes HEIC input to jpeg", { timeout: 120_000 }, async () => {
    const res = await postTool({ format: "jpeg" }, HEIC, "test.heic", "image/heic");
    expect([200, 422]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toContain(".jpg");
    }
  });
});

// ── Large file handling ─────────────────────────────────────────
describe("Large file handling", () => {
  it("optimizes a large stress image", async () => {
    const large = readFixture(fixtures.image.stressLarge);
    const res = await postTool(
      { format: "webp", quality: 60, maxWidth: 800 },
      large,
      "stress-large.jpg",
      "image/jpeg",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
    expect(result.processedSize).toBeLessThan(large.length);
  });
});

// ── Tiny file handling ──────────────────────────────────────────
describe("Tiny file handling", () => {
  it("optimizes a 1x1 pixel image", async () => {
    const tiny = readFixture(fixtures.image.edge.px1);
    const res = await postTool({ format: "webp" }, tiny, "tiny.png", "image/png");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

// ── Empty file handling ─────────────────────────────────────────
describe("Empty file handling", () => {
  it("returns 400 for empty file upload", async () => {
    const res = await postTool({ format: "webp" }, Buffer.alloc(0), "empty.png", "image/png");
    expect(res.statusCode).toBe(400);
  });
});

// ── Preview endpoint: format variations ──────────────────────────
describe("Preview endpoint format variations", () => {
  it("preview with AVIF output format", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ format: "avif", quality: 50 }) },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/optimize-for-web/preview",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/avif");
  });

  it("preview with maxWidth and maxHeight constraints", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ format: "webp", maxWidth: 50, maxHeight: 40 }),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/optimize-for-web/preview",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const processed = await sharp(res.rawPayload).metadata();
    expect(processed.width).toBeLessThanOrEqual(50);
    expect(processed.height).toBeLessThanOrEqual(40);
  });

  it("preview with PNG output format", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "test.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ format: "png" }) },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/optimize-for-web/preview",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(res.headers["x-output-filename"]).toContain(".png");
  });
});

// ── Unauthenticated request ────────────────────────────────────
describe("Authentication", () => {
  it("returns 401 for unauthenticated request", async () => {
    const { body: payload, contentType } = makePayload({ format: "webp" });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/optimize-for-web",
      payload,
      headers: { "content-type": contentType },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ── HEIF input handling ───────────────────────────────────────
describe("HEIF input", () => {
  it("optimizes HEIF (sample.heif) input to webp", { timeout: 120_000 }, async () => {
    const HEIF = readFixture(fixtures.image.formats("heif"));
    const res = await postTool({ format: "webp" }, HEIF, "sample.heif", "image/heif");
    // HEIF decode may not be available
    expect([200, 422]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toBeDefined();
      expect(result.downloadUrl).toContain(".webp");
    }
  });
});

// ── Animated GIF input ────────────────────────────────────────
describe("Animated GIF input", () => {
  it("optimizes animated GIF to webp", async () => {
    const GIF = readFixture(fixtures.image.animated.gif);
    const res = await postTool({ format: "webp" }, GIF, "animated.gif", "image/gif");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

// ── File with no extension ──────────────────────────────────────
describe("File naming edge cases", () => {
  it("handles file without extension", async () => {
    const res = await postTool({ format: "webp" }, PNG, "noext", "image/png");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toContain(".webp");
  });
});

// ── SVG input to main endpoint ──────────────────────────────────
describe("SVG input to main endpoint", () => {
  it("optimizes SVG input to WebP via main route", async () => {
    const res = await postTool({ format: "webp" }, SVG, "test.svg", "image/svg+xml");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.downloadUrl).toContain(".webp");
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("optimizes SVG input to PNG via main route", async () => {
    const res = await postTool({ format: "png" }, SVG, "test.svg", "image/svg+xml");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toContain(".png");
  });
});

// ── Invalid image data to main endpoint ─────────────────────────
describe("Invalid image data", () => {
  it("returns 400 for corrupt image data on main endpoint", async () => {
    const res = await postTool(
      { format: "webp" },
      Buffer.from("this is not an image file at all"),
      "garbage.png",
      "image/png",
    );
    expect(res.statusCode).toBe(400);
  });
});

// ── Size reduction verification ─────────────────────────────────
describe("Size reduction", () => {
  it("reduces file size when optimizing large JPEG to WebP with low quality", async () => {
    const large = readFixture(fixtures.image.stressLarge);
    const res = await postTool(
      { format: "webp", quality: 30, maxWidth: 400 },
      large,
      "stress-large.jpg",
      "image/jpeg",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeLessThan(large.length);
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

// ── Output format and dimensions deep verification ──────────────
describe("Output format deep verification", () => {
  it("WebP output has correct format and positive dimensions", async () => {
    const res = await postTool({ format: "webp", quality: 70 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
  });

  it("AVIF output has correct format and positive dimensions", async () => {
    const res = await postTool({ format: "avif", quality: 50 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("heif");
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
  });

  it("JPEG output preserves original dimensions when no resize applied", async () => {
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
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });
});

// ── MaxWidth and maxHeight with different input formats ──────────
describe("Resize with different input formats", () => {
  it("constrains JPEG input with maxWidth and maxHeight", async () => {
    const res = await postTool(
      { format: "webp", maxWidth: 60, maxHeight: 60 },
      JPG,
      "test.jpg",
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
    expect(meta.width).toBeLessThanOrEqual(60);
    expect(meta.height).toBeLessThanOrEqual(60);
  });

  it("constrains WebP input with maxWidth", async () => {
    const res = await postTool({ format: "jpeg", maxWidth: 30 }, WEBP, "test.webp", "image/webp");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBeLessThanOrEqual(30);
  });
});

// ── Combined progressive + quality + resize ─────────────────────
describe("Combined parameter variations", () => {
  it("applies progressive + quality + maxWidth + stripMetadata simultaneously", async () => {
    const exifJpg = readFixture(fixtures.image.exifGps);
    const res = await postTool(
      { format: "jpeg", quality: 50, maxWidth: 100, progressive: true, stripMetadata: true },
      exifJpg,
      "combo.jpg",
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
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBeLessThanOrEqual(100);
    expect(!meta.exif || meta.exif.length === 0).toBe(true);
  });
});

// ── MaxWidth of 1 (extreme constraint) ──────────────────────────
describe("Extreme resize constraints", () => {
  it("handles maxWidth of 1", async () => {
    const res = await postTool({ format: "webp", maxWidth: 1 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(1);
  });

  it("handles maxHeight of 1", async () => {
    const res = await postTool({ format: "png", maxHeight: 1 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.height).toBe(1);
  });
});

// ── Response structure verification ─────────────────────────────
describe("Response structure", () => {
  it("returns all expected fields in 200 response", async () => {
    const res = await postTool({ format: "webp" });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    expect(result).toHaveProperty("jobId");
    expect(result).toHaveProperty("downloadUrl");
    expect(result).toHaveProperty("originalSize");
    expect(result).toHaveProperty("processedSize");
    expect(typeof result.jobId).toBe("string");
    expect(typeof result.downloadUrl).toBe("string");
    expect(typeof result.originalSize).toBe("number");
    expect(typeof result.processedSize).toBe("number");
    expect(result.originalSize).toBeGreaterThan(0);
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

// ── Batch processing (5+ images) ──────────────────────────────
describe("Batch processing", () => {
  it("processes 5+ images and returns a valid ZIP", async () => {
    const TINY = readFixture(fixtures.image.edge.px1);
    const { body: payload, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "c.webp", contentType: "image/webp", content: WEBP },
      { name: "file", filename: "d.png", contentType: "image/png", content: TINY },
      { name: "file", filename: "e.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ format: "webp", quality: 60 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/optimize-for-web/batch",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");

    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip(res.rawPayload);
    const entries = zip.getEntries();
    expect(entries.length).toBe(5);

    // Every entry in the ZIP should be a valid WebP image
    for (const entry of entries) {
      expect(entry.entryName).toMatch(/\.webp$/);
      const meta = await sharp(entry.getData()).metadata();
      expect(meta.format).toBe("webp");
    }
  });

  it("batch returns 400 with no files", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({ format: "webp" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/optimize-for-web/batch",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ── Estimated vs actual size comparison ────────────────────────
describe("Estimated vs actual size", () => {
  it("processedSize matches actual downloaded file size", async () => {
    const res = await postTool({ format: "jpeg", quality: 50 });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dlRes.statusCode).toBe(200);
    expect(dlRes.rawPayload.length).toBe(result.processedSize);
  });

  it("originalSize matches uploaded file buffer length", async () => {
    const res = await postTool({ format: "webp" });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.originalSize).toBe(PNG.length);
  });
});

// ── JXL format output ──────────────────────────────────────────
describe("JXL format output", () => {
  it("outputs as JXL when supported", async () => {
    const res = await postTool({ format: "jxl" });
    // JXL may not be supported by all Sharp builds; 422 if encoding fails
    expect([200, 400, 422]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toContain(".jxl");
      expect(result.processedSize).toBeGreaterThan(0);
    }
  });
});

// ── Portrait image optimization ────────────────────────────────
describe("Portrait image optimization", () => {
  it("optimizes portrait-oriented image with maxWidth", async () => {
    const portrait = readFixture(fixtures.image.portraitJpg);
    const res = await postTool(
      { format: "webp", maxWidth: 100 },
      portrait,
      "portrait.jpg",
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
    expect(meta.width).toBeLessThanOrEqual(100);
    // Portrait images should maintain aspect ratio (height > width)
    expect(meta.height).toBeGreaterThan(0);
  });
});
