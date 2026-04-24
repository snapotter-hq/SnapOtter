/**
 * Edge-case integration tests for the SnapOtter image API.
 *
 * Tests unusual but valid inputs: empty files, tiny images, wrong extensions,
 * extreme filenames, missing/empty settings, and unknown fields.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const FIXTURES = join(__dirname, "..", "fixtures");
const PNG_200x150 = readFileSync(join(FIXTURES, "test-200x150.png"));
const PNG_1x1 = readFileSync(join(FIXTURES, "test-1x1.png"));

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------
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

// ═══════════════════════════════════════════════════════════════════════════
// ZERO-BYTE AND EMPTY FILES
// ═══════════════════════════════════════════════════════════════════════════
describe("Zero-byte / empty file uploads", () => {
  it("rejects a zero-byte file with 400", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "empty.png", content: Buffer.alloc(0), contentType: "image/png" },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBeDefined();
  });

  it("rejects a null-byte-only buffer with 400", async () => {
    const nullBuffer = Buffer.alloc(1024); // all zeroes
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "nulls.png", content: nullBuffer, contentType: "image/png" },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 1x1 PIXEL IMAGE — MINIMUM DIMENSION
// ═══════════════════════════════════════════════════════════════════════════
describe("1x1 pixel image handling", () => {
  it("resizes a 1x1 image without crashing", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", content: PNG_1x1, contentType: "image/png" },
      { name: "settings", content: JSON.stringify({ width: 50, height: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("crops a 1x1 image gracefully", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", content: PNG_1x1, contentType: "image/png" },
      { name: "settings", content: JSON.stringify({ left: 0, top: 0, width: 1, height: 1 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/crop",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    // Should succeed or fail gracefully (not crash)
    expect([200, 422]).toContain(res.statusCode);
  });

  it("rotates a 1x1 image gracefully", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", content: PNG_1x1, contentType: "image/png" },
      { name: "settings", content: JSON.stringify({ angle: 90 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/rotate",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// WRONG EXTENSION — FORMAT DETECTION
// ═══════════════════════════════════════════════════════════════════════════
describe("Wrong file extension (magic byte detection)", () => {
  it("detects actual PNG format when filename says .jpg", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "actually-a-png.jpg",
        content: PNG_200x150,
        contentType: "image/jpeg",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    // Should detect PNG via magic bytes and process successfully
    expect(res.statusCode).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EXTREME FILENAMES
// ═══════════════════════════════════════════════════════════════════════════
describe("Extreme filenames", () => {
  it("handles a 500-character filename without crashing", async () => {
    const longName = "a".repeat(490) + ".png";
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: longName, content: PNG_200x150, contentType: "image/png" },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("handles a Unicode filename without crashing", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "画像テスト.png", content: PNG_200x150, contentType: "image/png" },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("handles special characters in filename", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test file (1) [copy].png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("sanitizes path traversal in filename", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "../../../etc/passwd.png",
        content: PNG_200x150,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    // Should succeed — filename gets sanitized by sanitizeFilename()
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    // Download URL should not contain path traversal
    expect(json.downloadUrl).not.toContain("..");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════
describe("Settings field edge cases", () => {
  it("uses defaults when no settings field is provided", async () => {
    // Resize without settings — should use Zod defaults or return 400
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", content: PNG_200x150, contentType: "image/png" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    // Resize with no width/height/percentage passes Zod validation (all fields
    // are optional with defaults), but Sharp may fail at processing time (422).
    // Either way, should not crash.
    expect([200, 400, 422]).toContain(res.statusCode);
  });

  it("uses defaults when settings is empty JSON object", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", content: PNG_200x150, contentType: "image/png" },
      { name: "settings", content: "{}" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    // Empty settings should use Zod defaults — resize with no dimensions
    // may still succeed (no-op) or fail gracefully
    expect([200, 400, 422]).toContain(res.statusCode);
  });

  it("handles null values in settings gracefully", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", content: PNG_200x150, contentType: "image/png" },
      { name: "settings", content: JSON.stringify({ width: null, height: null }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    // Zod should either strip nulls or reject them — should not crash
    expect([200, 400, 422]).toContain(res.statusCode);
  });

  it("strips or rejects extra unknown fields in settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", content: PNG_200x150, contentType: "image/png" },
      {
        name: "settings",
        content: JSON.stringify({ width: 100, unknownField: "foo", anotherUnknown: 42 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    // Zod default behavior strips unknown keys — should succeed
    expect(res.statusCode).toBe(200);
  });
});
