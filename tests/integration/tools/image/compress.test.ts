/**
 * Integration tests for the compress tool.
 *
 * Tests quality-based and target-size compression modes. Verifies that
 * output is actually smaller than input, and that format is preserved.
 */

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtureDir, fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const FORMATS = fixtureDir.formats;
const PNG = readFixture(fixtures.image.base.png200);
const _JPG = readFixture(fixtures.image.base.jpg100);
const WEBP = readFixture(fixtures.image.base.webp50);

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
    url: "/api/v1/tools/image/compress",
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
    expect(result.processedSize).toBeLessThanOrEqual(5 * 1024);
  });

  it("output is at or below target for aggressive reduction", async () => {
    const largeBuf = await sharp({
      create: { width: 1200, height: 900, channels: 3, background: "#4488cc" },
    })
      .jpeg({ quality: 100 })
      .toBuffer();
    const targetKb = 10;
    const res = await postTool(
      { mode: "targetSize", targetSizeKb: targetKb },
      largeBuf,
      "large.jpg",
      "image/jpeg",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeLessThanOrEqual(targetKb * 1024);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("output is at or below target for PNG input", async () => {
    const largePng = await sharp({
      create: { width: 800, height: 600, channels: 4, background: "#cc2266" },
    })
      .png()
      .toBuffer();
    const targetKb = 5;
    const res = await postTool(
      { mode: "targetSize", targetSizeKb: targetKb },
      largePng,
      "large.png",
      "image/png",
    );
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeLessThanOrEqual(targetKb * 1024);
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

// ── Exotic input formats ─────────────────────────────────────────
describe("Exotic format processing", () => {
  const exoticFormats = [
    { ext: "pbm", mime: "image/x-portable-bitmap" },
    { ext: "pgm", mime: "image/x-portable-graymap" },
    { ext: "ppm", mime: "image/x-portable-pixmap" },
    { ext: "tiff", mime: "image/tiff" },
    { ext: "qoi", mime: "image/x-qoi" },
    { ext: "jp2", mime: "image/jp2" },
    { ext: "svgz", mime: "image/svg+xml" },
  ];

  for (const { ext, mime } of exoticFormats) {
    it(`processes ${ext.toUpperCase()} input without error`, async () => {
      const buf = readFixture(fixtures.image.formats(ext));
      const res = await postTool({ mode: "quality", quality: 50 }, buf, `sample.${ext}`, mime);
      expect(res.statusCode).toBe(200);
      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toBeDefined();
      expect(result.processedSize).toBeGreaterThan(0);
    });
  }

  it("rejects PDF files", async () => {
    const pdfHeader = Buffer.from("%PDF-1.4 fake pdf content for test");
    const res = await postTool(
      { mode: "quality", quality: 50 },
      pdfHeader,
      "document.pdf",
      "application/pdf",
    );
    expect(res.statusCode).toBe(400);
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
      url: "/api/v1/tools/image/compress",
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
