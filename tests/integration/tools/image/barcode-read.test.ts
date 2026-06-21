/**
 * Integration tests for the barcode-read tool (/api/v1/tools/image/barcode-read).
 *
 * Covers barcode/QR code detection from images, annotated image generation,
 * graceful handling of images without barcodes, and input validation.
 *
 * Uses a round-trip approach: generates a QR code via qr-generate, then reads
 * it back with barcode-read, guaranteeing a clean, machine-readable input.
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

const PLAIN_PNG = readFixture(fixtures.image.base.png200);

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

/** QR code PNG buffer generated once in beforeAll. */
let qrCodePng: Buffer;
const QR_TEXT = "https://example.com/test-barcode-read";

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);

  // Generate a QR code to use as a reliable fixture
  const genRes = await app.inject({
    method: "POST",
    url: "/api/v1/tools/image/qr-generate",
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": "application/json",
    },
    payload: { text: QR_TEXT, size: 400 },
  });
  const genResult = JSON.parse(genRes.body);
  const dlRes = await app.inject({
    method: "GET",
    url: genResult.downloadUrl,
  });
  qrCodePng = dlRes.rawPayload;
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("Barcode Read", () => {
  it("detects and decodes a QR code from a generated image", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "qr.png", contentType: "image/png", content: qrCodePng },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    expect(result.filename).toBe("qr.png");
    expect(result.barcodes).toBeDefined();
    expect(Array.isArray(result.barcodes)).toBe(true);
    expect(result.barcodes.length).toBeGreaterThanOrEqual(1);

    const barcode = result.barcodes[0];
    expect(barcode.type).toBeDefined();
    expect(barcode.text).toBe(QR_TEXT);
  });

  it("returns position data for detected barcodes", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "qr.png", contentType: "image/png", content: qrCodePng },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    expect(result.barcodes.length).toBeGreaterThanOrEqual(1);

    const barcode = result.barcodes[0];
    expect(barcode.position).toBeDefined();
    expect(barcode.position.topLeft).toBeDefined();
    expect(barcode.position.topRight).toBeDefined();
    expect(barcode.position.bottomLeft).toBeDefined();
    expect(barcode.position.bottomRight).toBeDefined();

    expect(typeof barcode.position.topLeft.x).toBe("number");
    expect(typeof barcode.position.topLeft.y).toBe("number");
  });

  it("generates a downloadable annotated image when barcodes are found", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "qr.png", contentType: "image/png", content: qrCodePng },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    expect(result.annotatedUrl).toBeDefined();
    expect(result.annotatedUrl).not.toBeNull();
    expect(result.previewUrl).toBeDefined();

    // Download the annotated image
    const dlRes = await app.inject({
      method: "GET",
      url: result.annotatedUrl,
    });

    expect(dlRes.statusCode).toBe(200);
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
  });

  it("handles images with no barcodes gracefully", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "plain.png", contentType: "image/png", content: PLAIN_PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    expect(result.barcodes).toBeDefined();
    expect(result.barcodes).toHaveLength(0);
    expect(result.annotatedUrl).toBeNull();
    expect(result.previewUrl).toBeNull();
  });

  it("returns all expected fields in the response", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "qr.png", contentType: "image/png", content: qrCodePng },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    expect(result).toHaveProperty("filename");
    expect(result).toHaveProperty("barcodes");
    expect(result).toHaveProperty("annotatedUrl");
    expect(result).toHaveProperty("previewUrl");
  });

  it("reads barcodes from AVIF content fixtures when detectable", async () => {
    // AVIF fixtures may or may not contain machine-readable barcodes depending
    // on image quality. This test verifies the route handles AVIF input without
    // errors regardless of detection outcome.
    const avifBarcode = readFixture(fixtures.image.code.barcodeAvif);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "barcode.avif", contentType: "image/avif", content: avifBarcode },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.filename).toBe("barcode.avif");
    expect(Array.isArray(result.barcodes)).toBe(true);
  });

  // ── Validation ──────────────────────────────────────────────────────

  it("rejects requests without a file", async () => {
    const { body, contentType } = createMultipartPayload([{ name: "dummy", content: "nothing" }]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
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

  it("rejects unauthenticated requests", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "qr.png", contentType: "image/png", content: qrCodePng },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  // ── Extended coverage: settings, formats, edge cases ───────────────

  it("reads QR code with tryHarder disabled", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "qr.png", contentType: "image/png", content: qrCodePng },
      { name: "settings", content: JSON.stringify({ tryHarder: false }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    // May or may not detect with tryHarder=false, but should not error
    expect(Array.isArray(result.barcodes)).toBe(true);
  });

  it("reads QR code with tryHarder explicitly enabled", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "qr.png", contentType: "image/png", content: qrCodePng },
      { name: "settings", content: JSON.stringify({ tryHarder: true }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.barcodes.length).toBeGreaterThanOrEqual(1);
    expect(result.barcodes[0].text).toBe(QR_TEXT);
  });

  it("reads barcode from JPEG input", async () => {
    // Generate a QR then convert to JPEG
    const jpegQr = await sharp(qrCodePng).jpeg({ quality: 90 }).toBuffer();

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "qr.jpg", contentType: "image/jpeg", content: jpegQr },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.filename).toBe("qr.jpg");
    expect(result.barcodes.length).toBeGreaterThanOrEqual(1);
    expect(result.barcodes[0].text).toBe(QR_TEXT);
  });

  it("reads barcode from WebP input", async () => {
    const webpQr = await sharp(qrCodePng).webp({ quality: 90 }).toBuffer();

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "qr.webp", contentType: "image/webp", content: webpQr },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.filename).toBe("qr.webp");
    expect(result.barcodes.length).toBeGreaterThanOrEqual(1);
  });

  it("reads QR code from AVIF content fixture", async () => {
    const qrAvif = readFixture(fixtures.image.code.qrAvif);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "qr-code.avif", contentType: "image/avif", content: qrAvif },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.filename).toBe("qr-code.avif");
    expect(Array.isArray(result.barcodes)).toBe(true);
  });

  it("annotated image has same dimensions as input", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "qr.png", contentType: "image/png", content: qrCodePng },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.annotatedUrl).toBeDefined();

    const dlRes = await app.inject({
      method: "GET",
      url: result.annotatedUrl,
    });
    const annotatedMeta = await sharp(dlRes.rawPayload).metadata();
    const inputMeta = await sharp(qrCodePng).metadata();
    expect(annotatedMeta.width).toBe(inputMeta.width);
    expect(annotatedMeta.height).toBe(inputMeta.height);
  });

  it("barcode type is reported for QR codes", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "qr.png", contentType: "image/png", content: qrCodePng },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.barcodes[0].type).toMatch(/qr/i);
  });

  it("rejects invalid settings (wrong type for tryHarder)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "qr.png", contentType: "image/png", content: qrCodePng },
      { name: "settings", content: JSON.stringify({ tryHarder: "yes" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects invalid JSON in settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "qr.png", contentType: "image/png", content: qrCodePng },
      { name: "settings", content: "{{bad" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
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

  it("handles a 1x1 pixel image gracefully", async () => {
    const TINY = readFixture(fixtures.image.edge.px1);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", contentType: "image/png", content: TINY },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.barcodes).toHaveLength(0);
    expect(result.annotatedUrl).toBeNull();
  });

  // ── Branch coverage: HEIC input (lines 49-152, ensureSharpCompat) ───

  it("reads barcodes from a HEIC image", { timeout: 120_000 }, async () => {
    const HEIC = readFixture(fixtures.image.base.heic200);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.filename).toBe("photo.heic");
    expect(Array.isArray(result.barcodes)).toBe(true);
    // No barcodes in a plain image, but no errors either
    expect(result.barcodes).toHaveLength(0);
  });

  // ── Branch coverage: invalid file validation (line 49-152) ──────────

  it("rejects an invalid/corrupt image file", async () => {
    const corruptBuffer = Buffer.from("this is not a valid image file at all");
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "corrupt.png", contentType: "image/png", content: corruptBuffer },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/invalid image/i);
  });

  // ── Branch coverage: large image handling ───────────────────────────

  it("reads barcodes from a large stress image", async () => {
    const LARGE = readFixture(fixtures.image.stressLarge);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "large.jpg", contentType: "image/jpeg", content: LARGE },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.filename).toBe("large.jpg");
    expect(Array.isArray(result.barcodes)).toBe(true);
  });

  // ── Branch coverage: no settings field (uses defaults) ──────────────

  it("reads barcodes with no settings field (uses defaults)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "qr.png", contentType: "image/png", content: qrCodePng },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    // Default tryHarder is true, should detect the QR code
    expect(result.barcodes.length).toBeGreaterThanOrEqual(1);
    expect(result.barcodes[0].text).toBe(QR_TEXT);
  });

  // ── Branch coverage: portrait HEIC (with exif orientation) ──────────

  it("reads barcodes from portrait HEIC image", { timeout: 120_000 }, async () => {
    const HEIC_PORTRAIT = readFixture(fixtures.image.portraitHeic);
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "portrait.heic",
        contentType: "image/heic",
        content: HEIC_PORTRAIT,
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.filename).toBe("portrait.heic");
    expect(Array.isArray(result.barcodes)).toBe(true);
  });

  // ── Branch coverage: multiple barcodes in one image ─────────────────

  it("detects multiple QR codes when composited together", async () => {
    // Create an image with 2 QR codes side by side
    const qrMeta = await sharp(qrCodePng).metadata();
    const qrW = qrMeta.width ?? 400;
    const qrH = qrMeta.height ?? 400;

    const doubleQr = await sharp({
      create: {
        width: qrW * 2 + 20,
        height: qrH,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([
        { input: qrCodePng, left: 0, top: 0 },
        { input: qrCodePng, left: qrW + 20, top: 0 },
      ])
      .png()
      .toBuffer();

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "double-qr.png", contentType: "image/png", content: doubleQr },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    // Should detect at least 1 QR code (2 if detection is good enough)
    expect(result.barcodes.length).toBeGreaterThanOrEqual(1);
    expect(result.annotatedUrl).toBeDefined();
    expect(result.annotatedUrl).not.toBeNull();
  });

  // ── Branch coverage: blank image → no barcodes found (line 229) ─────

  it("handles a blank white image gracefully", async () => {
    const BLANK = readFixture(fixtures.image.edge.blank);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "blank.png", contentType: "image/png", content: BLANK },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.barcodes).toHaveLength(0);
    expect(result.annotatedUrl).toBeNull();
    expect(result.previewUrl).toBeNull();
  });

  // ── Branch coverage: HEIF content format input ─────────────────────

  it("reads barcodes from portrait HEIC image (additional format)", {
    timeout: 120_000,
  }, async () => {
    const HEIC_PORTRAIT = readFixture(fixtures.image.portraitHeic);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo2.heic", contentType: "image/heic", content: HEIC_PORTRAIT },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.filename).toBe("photo2.heic");
    expect(Array.isArray(result.barcodes)).toBe(true);
  });

  // ── Branch coverage: tryHarder with empty settings object ──────────

  it("reads barcodes with explicit empty settings (defaults applied)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "qr.png", contentType: "image/png", content: qrCodePng },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    // Default tryHarder is true, should detect QR
    expect(result.barcodes.length).toBeGreaterThanOrEqual(1);
    expect(result.barcodes[0].text).toBe(QR_TEXT);
  });

  // ── Branch coverage: EXIF-oriented input ───────────────────────────

  it("reads barcodes from EXIF-oriented image", async () => {
    const EXIF = readFixture(fixtures.image.exifGps);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "exif.jpg", contentType: "image/jpeg", content: EXIF },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.filename).toBe("exif.jpg");
    expect(Array.isArray(result.barcodes)).toBe(true);
  });

  // ── Branch coverage: WebP QR code with tryHarder false ─────────────

  it("reads QR code from WebP with tryHarder false", async () => {
    const webpQr = await sharp(qrCodePng).webp({ quality: 95 }).toBuffer();

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "qr.webp", contentType: "image/webp", content: webpQr },
      { name: "settings", content: JSON.stringify({ tryHarder: false }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(Array.isArray(result.barcodes)).toBe(true);
  });

  // ── Branch coverage: portrait image with no barcode ────────────────

  it("handles portrait JPEG with no barcodes", async () => {
    const PORTRAIT = readFixture(fixtures.image.portraitJpg);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "portrait.jpg", contentType: "image/jpeg", content: PORTRAIT },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.filename).toBe("portrait.jpg");
    expect(Array.isArray(result.barcodes)).toBe(true);
    expect(result.barcodes).toHaveLength(0);
    expect(result.annotatedUrl).toBeNull();
  });

  // ── Branch coverage: barcode from resized QR (lower quality) ───────

  it("reads QR code from lower-resolution version", async () => {
    const smallQr = await sharp(qrCodePng).resize(100, 100).png().toBuffer();
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "small-qr.png", contentType: "image/png", content: smallQr },
      { name: "settings", content: JSON.stringify({ tryHarder: true }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(Array.isArray(result.barcodes)).toBe(true);
    // May or may not detect at very small size, but should not error
  });

  // ── HEIF format input ─────────────────────────────────────────────

  it("reads barcodes from a HEIF image", { timeout: 120_000 }, async () => {
    const HEIF = readFixture(fixtures.image.motorcycle);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.heif", contentType: "image/heif", content: HEIF },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.filename).toBe("photo.heif");
    expect(Array.isArray(result.barcodes)).toBe(true);
  });

  // ── Animated GIF input ────────────────────────────────────────────

  it("reads barcodes from an animated GIF", async () => {
    const GIF = readFixture(fixtures.image.animated.gif);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "anim.gif", contentType: "image/gif", content: GIF },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.filename).toBe("anim.gif");
    expect(Array.isArray(result.barcodes)).toBe(true);
  });

  // ── SVG input ─────────────────────────────────────────────────────

  it("reads barcodes from an SVG image", async () => {
    const SVG = readFixture(fixtures.image.base.svg100);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "icon.svg", contentType: "image/svg+xml", content: SVG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.filename).toBe("icon.svg");
    expect(Array.isArray(result.barcodes)).toBe(true);
  });

  // ── QR code rendered as SVG then read back ────────────────────────

  it("reads barcode from SVG-rendered QR code", async () => {
    // Generate a QR code SVG via qr-generate
    const genRes = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: { text: "https://snapotter.com", format: "svg" },
    });

    const genResult = JSON.parse(genRes.body);
    if (genResult.downloadUrl) {
      const dlRes = await app.inject({
        method: "GET",
        url: genResult.downloadUrl,
      });

      if (dlRes.statusCode === 200) {
        // Convert SVG to PNG first, then read barcode
        const pngBuf = await sharp(dlRes.rawPayload).png().toBuffer();
        const { body, contentType } = createMultipartPayload([
          { name: "file", filename: "qr-svg.png", contentType: "image/png", content: pngBuf },
        ]);

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/barcode-read",
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": contentType,
          },
          body,
        });

        expect(res.statusCode).toBe(200);
        const result = JSON.parse(res.body);
        expect(Array.isArray(result.barcodes)).toBe(true);
      }
    }
  });

  // ── Barcode text content verification ─────────────────────────────

  it("returns correct barcode text for known QR content", async () => {
    // Generate a QR code with specific known text
    const testText = "barcode-read-verification-test-12345";
    const genRes = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: { text: testText, size: 500 },
    });
    const genResult = JSON.parse(genRes.body);
    const dlRes = await app.inject({
      method: "GET",
      url: genResult.downloadUrl,
    });

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "verify.png", contentType: "image/png", content: dlRes.rawPayload },
      { name: "settings", content: JSON.stringify({ tryHarder: true }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.barcodes.length).toBeGreaterThanOrEqual(1);
    expect(result.barcodes[0].text).toBe(testText);
  });

  // ── AVIF format input with QR ─────────────────────────────────────

  it("reads barcodes from AVIF-converted QR code", async () => {
    const avifQr = await sharp(qrCodePng).avif({ quality: 90 }).toBuffer();

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "qr.avif", contentType: "image/avif", content: avifQr },
      { name: "settings", content: JSON.stringify({ tryHarder: true }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.filename).toBe("qr.avif");
    expect(Array.isArray(result.barcodes)).toBe(true);
    // AVIF compression may affect readability but should not error
  });

  // ── SVGZ format input ────────────────────────────────────────────

  it("reads barcodes from a SVGZ input image", async () => {
    const SVGZ = readFixture(fixtures.image.formats("svgz"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "icon.svgz", contentType: "image/svg+xml", content: SVGZ },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.filename).toBe("icon.svgz");
    expect(Array.isArray(result.barcodes)).toBe(true);
  });

  // ── QR code with tryHarder and annotated image position check ────

  it("annotated image has barcodes with valid position coordinates", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "qr.png", contentType: "image/png", content: qrCodePng },
      { name: "settings", content: JSON.stringify({ tryHarder: true }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.barcodes.length).toBeGreaterThanOrEqual(1);

    const pos = result.barcodes[0].position;
    // All position coordinates should be non-negative
    expect(pos.topLeft.x).toBeGreaterThanOrEqual(0);
    expect(pos.topLeft.y).toBeGreaterThanOrEqual(0);
    expect(pos.topRight.x).toBeGreaterThanOrEqual(0);
    expect(pos.topRight.y).toBeGreaterThanOrEqual(0);
    expect(pos.bottomLeft.x).toBeGreaterThanOrEqual(0);
    expect(pos.bottomLeft.y).toBeGreaterThanOrEqual(0);
    expect(pos.bottomRight.x).toBeGreaterThanOrEqual(0);
    expect(pos.bottomRight.y).toBeGreaterThanOrEqual(0);
    // topRight.x should be > topLeft.x (barcode has width)
    expect(pos.topRight.x).toBeGreaterThan(pos.topLeft.x);
    // bottomLeft.y should be > topLeft.y (barcode has height)
    expect(pos.bottomLeft.y).toBeGreaterThan(pos.topLeft.y);
  });

  // ── Large QR code (high resolution) ──────────────────────────────

  it("reads QR code from high-resolution image", async () => {
    const largeQr = await sharp(qrCodePng).resize(1000, 1000).png().toBuffer();
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "large-qr.png", contentType: "image/png", content: largeQr },
      { name: "settings", content: JSON.stringify({ tryHarder: true }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-read",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.barcodes.length).toBeGreaterThanOrEqual(1);
    expect(result.barcodes[0].text).toBe(QR_TEXT);
    expect(result.annotatedUrl).toBeDefined();
    expect(result.annotatedUrl).not.toBeNull();
  });
});
