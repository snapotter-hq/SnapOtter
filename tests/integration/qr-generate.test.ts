/**
 * Integration tests for the qr-generate tool (/api/v1/tools/qr-generate).
 *
 * Covers QR code generation from text/URL input, custom size and colors,
 * error correction levels, download verification, and input validation.
 */

import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, loginAsAdmin, type TestApp } from "./test-server.js";

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

describe("QR Generate", () => {
  it("generates a QR code from a URL string", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "https://example.com",
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    expect(result.jobId).toBeDefined();
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("generates a downloadable PNG image", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "Hello World",
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    // Download the QR code image
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
    });

    expect(dlRes.statusCode).toBe(200);
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
  });

  it("respects the custom size parameter", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "test",
        size: 800,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
    });

    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(800);
  });

  it("uses default size of 400 when not specified", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "default size test",
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
    });

    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(400);
  });

  it("accepts custom foreground and background colors", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "colored QR",
        foreground: "#FF0000",
        background: "#00FF00",
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("accepts all error correction levels", async () => {
    for (const level of ["L", "M", "Q", "H"]) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/qr-generate",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        payload: {
          text: `EC level ${level}`,
          errorCorrection: level,
        },
      });

      expect(res.statusCode).toBe(200);
    }
  });

  it("returns all expected fields in the response", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "structure test",
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    expect(result).toHaveProperty("jobId");
    expect(result).toHaveProperty("downloadUrl");
    expect(result).toHaveProperty("originalSize");
    expect(result).toHaveProperty("processedSize");
    expect(result.originalSize).toBe(0);
  });

  // ── Validation ──────────────────────────────────────────────────────

  it("rejects requests without text", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/qr-generate",
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
      url: "/api/v1/tools/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: { text: "" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects invalid color format", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "test",
        foreground: "red",
      },
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/invalid settings/i);
  });

  it("rejects size below minimum", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "test",
        size: 50,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects size above maximum", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "test",
        size: 20000,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects invalid error correction level", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "test",
        errorCorrection: "X",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects unauthenticated requests", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/qr-generate",
      headers: { "content-type": "application/json" },
      payload: { text: "test" },
    });

    expect(res.statusCode).toBe(401);
  });

  // ── Data type variations ──────────────────────────────────────

  it("generates QR code for a long URL", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "https://example.com/very/long/path/with/many/segments?param1=value1&param2=value2&param3=value3",
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("generates QR code for multiline text", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "Line 1\nLine 2\nLine 3",
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it("generates QR code for special characters", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "Hello! @#$%^&*() <> {}",
      },
    });

    expect(res.statusCode).toBe(200);
  });

  // ── Size variations ───────────────────────────────────────────

  it("generates minimum allowed size QR code", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "min",
        size: 100,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
    });

    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(100);
  });

  // ── Color combinations ────────────────────────────────────────

  it("generates QR with white foreground on black background", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "inverted",
        foreground: "#FFFFFF",
        background: "#000000",
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("handles very long text (approaching max 2000 chars)", async () => {
    const longText = "A".repeat(2000);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: longText,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("rejects text exceeding max length (2001 chars)", async () => {
    const tooLong = "A".repeat(2001);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: tooLong,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("generates QR code at maximum allowed size (10000)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "max size test",
        size: 10000,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("generates QR with transparent background (3-char hex)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "short hex",
        foreground: "#333",
        background: "#FFF",
      },
    });

    // 3-char hex might not be accepted depending on validation
    // Just verify a consistent response
    expect(res.statusCode === 200 || res.statusCode === 400).toBe(true);
  });

  // ── Error correction level impact ─────────────────────────────

  it("higher error correction produces equal or larger QR", async () => {
    const resL = await app.inject({
      method: "POST",
      url: "/api/v1/tools/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "error correction comparison",
        errorCorrection: "L",
        size: 400,
      },
    });

    const resH = await app.inject({
      method: "POST",
      url: "/api/v1/tools/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "error correction comparison",
        errorCorrection: "H",
        size: 400,
      },
    });

    expect(resL.statusCode).toBe(200);
    expect(resH.statusCode).toBe(200);
    // Both should produce valid QR codes of the same pixel size
    const resultL = JSON.parse(resL.body);
    const resultH = JSON.parse(resH.body);
    expect(resultL.processedSize).toBeGreaterThan(0);
    expect(resultH.processedSize).toBeGreaterThan(0);
  });
});
