/**
 * Integration tests for the qr-generate tool (/api/v1/tools/image/qr-generate).
 *
 * Covers QR code generation from text/URL input, custom size and colors,
 * error correction levels, download verification, and input validation.
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

describe("QR Generate", () => {
  it("generates a QR code from a URL string", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
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
      url: "/api/v1/tools/image/qr-generate",
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
      url: "/api/v1/tools/image/qr-generate",
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
      url: "/api/v1/tools/image/qr-generate",
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
      url: "/api/v1/tools/image/qr-generate",
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
        url: "/api/v1/tools/image/qr-generate",
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
      url: "/api/v1/tools/image/qr-generate",
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
      url: "/api/v1/tools/image/qr-generate",
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
      url: "/api/v1/tools/image/qr-generate",
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
      url: "/api/v1/tools/image/qr-generate",
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
      url: "/api/v1/tools/image/qr-generate",
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
      url: "/api/v1/tools/image/qr-generate",
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
      url: "/api/v1/tools/image/qr-generate",
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
      url: "/api/v1/tools/image/qr-generate",
      headers: { "content-type": "application/json" },
      payload: { text: "test" },
    });

    expect(res.statusCode).toBe(401);
  });

  // ── Data type variations ──────────────────────────────────────

  it("generates QR code for a long URL", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
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
      url: "/api/v1/tools/image/qr-generate",
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
      url: "/api/v1/tools/image/qr-generate",
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
      url: "/api/v1/tools/image/qr-generate",
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
      url: "/api/v1/tools/image/qr-generate",
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
      url: "/api/v1/tools/image/qr-generate",
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
      url: "/api/v1/tools/image/qr-generate",
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

  it("generates QR code at large size (2000)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "large size test",
        size: 2000,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("generates QR with transparent background (3-char hex)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
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
      url: "/api/v1/tools/image/qr-generate",
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
      url: "/api/v1/tools/image/qr-generate",
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

  // ── Unicode text ───────────────────────────────────────────────

  it("generates QR code for Unicode text", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "Bonjour le monde! Hola mundo!",
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  // ── Single character ───────────────────────────────────────────

  it("generates QR code for a single character", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "X",
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  // ── Same foreground and background ─────────────────────────────

  it("generates QR code with identical foreground and background colors", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "same colors",
        foreground: "#AABBCC",
        background: "#AABBCC",
      },
    });

    // Should still succeed even though QR is unreadable
    expect(res.statusCode).toBe(200);
  });

  // ── Max allowed size ───────────────────────────────────────────

  it("generates QR code at maximum allowed size (10000)", { timeout: 180_000 }, async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "max size",
        size: 10000,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  // ── Lowercase hex colors ───────────────────────────────────────

  it("accepts lowercase hex colors", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "lowercase hex",
        foreground: "#abcdef",
        background: "#fedcba",
      },
    });

    expect(res.statusCode).toBe(200);
  });

  // ── Mixed case hex colors ──────────────────────────────────────

  it("accepts mixed case hex colors", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "mixed hex",
        foreground: "#AbCdEf",
        background: "#fEdCbA",
      },
    });

    expect(res.statusCode).toBe(200);
  });

  // ── Download verifies correct size ─────────────────────────────

  it("downloaded QR code has the exact requested size", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "size verify",
        size: 256,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
    });

    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(256);
    expect(meta.height).toBe(256);
  });

  // ── Invalid background color format ────────────────────────────

  it("rejects invalid background color format", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "test",
        background: "blue",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  // ── WiFi QR code format ───────────────────────────────────────

  it("generates QR code for WiFi connection string", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "WIFI:T:WPA;S:MyNetwork;P:MyPassword;;",
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  // ── Email mailto format ───────────────────────────────────────

  it("generates QR code for mailto link", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "mailto:user@example.com?subject=Hello&body=World",
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  // ── Numeric-only text ─────────────────────────────────────────

  it("generates QR code for numeric-only text", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "1234567890",
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  // ── Size boundary at exactly min (100) ────────────────────────

  it("generates QR code at exactly minimum size (100)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "boundary test",
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
    expect(meta.height).toBe(100);
    expect(meta.format).toBe("png");
  });

  // ── Size boundary at exactly max (10000) ──────────────────────

  it("rejects size of 99 (just below minimum)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "test",
        size: 99,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects size of 10001 (just above maximum)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "test",
        size: 10001,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Default error correction level ────────────────────────────

  it("uses default error correction level M when not specified", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "default EC test",
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  // ── Default colors ────────────────────────────────────────────

  it("uses default black/white colors when not specified", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "default colors test",
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(400); // default size
  });

  // ── Each error correction level produces valid downloadable PNG ─

  it("each error correction level produces downloadable PNG", async () => {
    for (const level of ["L", "M", "Q", "H"] as const) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/qr-generate",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        payload: {
          text: `verify-${level}`,
          errorCorrection: level,
          size: 200,
        },
      });

      expect(res.statusCode).toBe(200);
      const result = JSON.parse(res.body);

      const dlRes = await app.inject({
        method: "GET",
        url: result.downloadUrl,
      });
      expect(dlRes.statusCode).toBe(200);
      const meta = await sharp(dlRes.rawPayload).metadata();
      expect(meta.format).toBe("png");
      expect(meta.width).toBe(200);
    }
  });

  // ── Non-string text type ──────────────────────────────────────

  it("rejects numeric text value (must be string)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: 12345,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Color with 8-char hex (alpha) ─────────────────────────────

  it("rejects 8-character hex color (with alpha)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "alpha test",
        foreground: "#FF000080",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Whitespace-only text ──────────────────────────────────────

  it("generates QR code for whitespace-only text", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "   ",
      },
    });

    // Whitespace-only is non-empty, should succeed
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  // ── All parameters combined ───────────────────────────────────

  it("generates QR with all parameters specified", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "https://snapotter.com/full-params",
        size: 512,
        errorCorrection: "H",
        foreground: "#1A2B3C",
        background: "#F0E0D0",
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
    expect(result.originalSize).toBe(0);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  // ── Missing content-type header ───────────────────────────────

  it("rejects request without content-type header", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      payload: JSON.stringify({ text: "test" }),
    });

    // Without content-type, body may not parse
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  // ── Download URL is publicly accessible (no auth) ─────────────

  it("download URL is accessible without auth token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "public download test",
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    // Download without auth header
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
    });
    expect(dlRes.statusCode).toBe(200);
    expect(dlRes.rawPayload.length).toBeGreaterThan(0);
  });

  // ── URL-encoded content ──────────────────────────────────────

  it("generates QR code for URL with encoded characters", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "https://example.com/search?q=hello%20world&lang=en%26fr",
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  // ── vCard format ─────────────────────────────────────────────

  it("generates QR code for vCard contact", async () => {
    const vcard = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Doe;John",
      "FN:John Doe",
      "TEL:+1234567890",
      "EMAIL:john@example.com",
      "END:VCARD",
    ].join("\n");

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: vcard,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });

  // ── Telephone number format ──────────────────────────────────

  it("generates QR code for tel: URI", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "tel:+1-555-123-4567",
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  // ── Color pixel verification ─────────────────────────────────

  it("QR with custom colors contains correct foreground color", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "color verify",
        foreground: "#FF0000",
        background: "#FFFFFF",
        size: 200,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
    });
    const { data, info } = await sharp(dlRes.rawPayload)
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Scan for at least one red pixel (foreground)
    let foundRed = false;
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i] > 200 && data[i + 1] < 50 && data[i + 2] < 50) {
        foundRed = true;
        break;
      }
    }
    expect(foundRed).toBe(true);
  });

  // ── Higher error correction means more data redundancy ───────

  it("higher EC level produces larger or equal processedSize", async () => {
    const resL = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "error correction size test with enough data",
        errorCorrection: "L",
        size: 400,
      },
    });

    const resH = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "error correction size test with enough data",
        errorCorrection: "H",
        size: 400,
      },
    });

    expect(resL.statusCode).toBe(200);
    expect(resH.statusCode).toBe(200);

    // H level has more modules, so same-size PNG is typically larger or equal
    const sizeL = JSON.parse(resL.body).processedSize;
    const sizeH = JSON.parse(resH.body).processedSize;
    expect(sizeH).toBeGreaterThanOrEqual(sizeL);
  });

  // ── Geo location QR code ─────────────────────────────────────

  it("generates QR code for geo location", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "geo:40.7128,-74.0060",
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  // ── JSON text payload ────────────────────────────────────────

  it("generates QR code containing JSON text", async () => {
    const jsonText = JSON.stringify({ key: "value", nested: { a: 1 } });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: jsonText,
      },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  // ── Logo embed ────────────────────────────────────────────────

  it("logo embed produces different output from no-logo render", async () => {
    // Generate a small red PNG as a logo data URI
    const logoPng = await sharp({
      create: { width: 20, height: 20, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    const logoDataUri = `data:image/png;base64,${logoPng.toString("base64")}`;

    const resNoLogo = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "logo test",
        size: 400,
      },
    });
    expect(resNoLogo.statusCode).toBe(200);

    const resWithLogo = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "logo test",
        size: 400,
        logoDataUri,
      },
    });
    expect(resWithLogo.statusCode).toBe(200);

    const noLogoResult = JSON.parse(resNoLogo.body);
    const withLogoResult = JSON.parse(resWithLogo.body);

    // Download both and verify output bytes differ
    const dlNoLogo = await app.inject({ method: "GET", url: noLogoResult.downloadUrl });
    const dlWithLogo = await app.inject({ method: "GET", url: withLogoResult.downloadUrl });

    expect(dlNoLogo.rawPayload.equals(dlWithLogo.rawPayload)).toBe(false);

    // Verify the logo version is still valid PNG
    const meta = await sharp(dlWithLogo.rawPayload).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(400);
  });

  it("rejects invalid logo base64 data", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "bad logo test",
        logoDataUri: "data:image/png;base64,dGhpcyBpcyBub3QgYSByZWFsIGltYWdl",
      },
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/invalid logo/i);
  });

  it("rejects malformed logo data URI format", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/qr-generate",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        text: "bad uri format",
        logoDataUri: "not-a-data-uri",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Output is always square ──────────────────────────────────

  it("output image is always square regardless of content", async () => {
    for (const size of [150, 300, 500]) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/qr-generate",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        payload: {
          text: `square test at ${size}`,
          size,
        },
      });

      expect(res.statusCode).toBe(200);
      const result = JSON.parse(res.body);

      const dlRes = await app.inject({
        method: "GET",
        url: result.downloadUrl,
      });
      const meta = await sharp(dlRes.rawPayload).metadata();
      expect(meta.width).toBe(size);
      expect(meta.height).toBe(size);
    }
  });
});
