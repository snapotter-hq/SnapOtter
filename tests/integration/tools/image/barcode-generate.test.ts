/**
 * Integration tests for the barcode-generate tool (/api/v1/tools/image/barcode-generate).
 *
 * Custom JSON POST route mirroring qr-generate. Generates barcode images
 * from text input using bwip-js. Tests cover code128, ean13 validation,
 * download verification, and invalid-text rejection.
 */

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, loginAsAdmin, type TestApp } from "../../test-server.js";

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

describe("Barcode Generate", () => {
  it("generates a code128 barcode from text", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "SnapOtter",
        type: "code128",
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.jobId).toBeDefined();
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);

    // Download and verify PNG magic bytes
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
    });
    expect(dlRes.statusCode).toBe(200);
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("png");
  });

  it("generates a valid ean13 barcode from 13-digit number", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "4006381333931",
        type: "ean13",
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("rejects ean13 with non-numeric text", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "abc",
        type: "ean13",
      },
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/invalid text/i);
  });

  it("uses code128 as default type", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "DefaultType",
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("generates a UPC-A barcode", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "012345678905",
        type: "upca",
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it("generates a code39 barcode", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "SNAP-123",
        type: "code39",
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it("generates an itf14 barcode", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "10012345678902",
        type: "itf14",
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it("generates a datamatrix barcode", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "Hello DataMatrix",
        type: "datamatrix",
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it("rejects request without text", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/invalid settings/i);
  });

  it("rejects empty text", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: { text: "" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects invalid barcode type", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: { text: "test", type: "qrcode-micro" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects unauthenticated requests", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-generate",
      headers: { "content-type": "application/json" },
      payload: { text: "test" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("returns all expected fields in the response", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: { text: "structure test" },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result).toHaveProperty("jobId");
    expect(result).toHaveProperty("downloadUrl");
    expect(result).toHaveProperty("originalSize");
    expect(result).toHaveProperty("processedSize");
    expect(result.originalSize).toBe(0);
  });

  it("respects scale parameter", async () => {
    const resSmall = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: { text: "scale test", scale: 1 },
    });

    const resLarge = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: { text: "scale test", scale: 8 },
    });

    expect(resSmall.statusCode).toBe(200);
    expect(resLarge.statusCode).toBe(200);

    const sizeSmall = JSON.parse(resSmall.body).processedSize;
    const sizeLarge = JSON.parse(resLarge.body).processedSize;
    expect(sizeLarge).toBeGreaterThan(sizeSmall);
  });

  it("supports includeText toggle", async () => {
    const resWithText = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: { text: "toggle test", includeText: true },
    });

    const resNoText = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/barcode-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: { text: "toggle test", includeText: false },
    });

    expect(resWithText.statusCode).toBe(200);
    expect(resNoText.statusCode).toBe(200);
  });
});
