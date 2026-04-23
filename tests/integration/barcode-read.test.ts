/**
 * Integration tests for the barcode-read tool (/api/v1/tools/barcode-read).
 *
 * Covers barcode/QR code detection from images, annotated image generation,
 * graceful handling of images without barcodes, and input validation.
 *
 * Uses a round-trip approach: generates a QR code via qr-generate, then reads
 * it back with barcode-read, guaranteeing a clean, machine-readable input.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
const PLAIN_PNG = readFileSync(join(FIXTURES, "test-200x150.png"));

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
    url: "/api/v1/tools/qr-generate",
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
      url: "/api/v1/tools/barcode-read",
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
      url: "/api/v1/tools/barcode-read",
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
      url: "/api/v1/tools/barcode-read",
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
      url: "/api/v1/tools/barcode-read",
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
      url: "/api/v1/tools/barcode-read",
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
    const avifBarcode = readFileSync(join(FIXTURES, "content", "barcode.avif"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "barcode.avif", contentType: "image/avif", content: avifBarcode },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/barcode-read",
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
      url: "/api/v1/tools/barcode-read",
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
      url: "/api/v1/tools/barcode-read",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });
});
