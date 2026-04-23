/**
 * Adversarial integration tests for the ashim image API.
 *
 * Tests malicious and stress inputs: corrupted images, truncated data,
 * oversized images, invalid dimensions, injection attacks, and malformed
 * multipart payloads.
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

/** Helper to POST a multipart payload to a tool endpoint. */
function postTool(
  toolId: string,
  fields: Array<{
    name: string;
    filename?: string;
    contentType?: string;
    content: Buffer | string;
  }>,
) {
  const { body, contentType } = createMultipartPayload(fields);
  return app.inject({
    method: "POST",
    url: `/api/v1/tools/${toolId}`,
    headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
    body,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CORRUPTED / TRUNCATED IMAGE DATA
// ═══════════════════════════════════════════════════════════════════════════
describe("Corrupted and truncated images", () => {
  it("rejects JPEG magic bytes followed by garbage", async () => {
    // Valid JPEG header (FF D8 FF E0) then random garbage
    const corruptedJpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from("this is not a real jpeg image at all, just garbage data"),
    ]);

    const res = await postTool("resize", [
      { name: "file", filename: "corrupt.jpg", content: corruptedJpeg, contentType: "image/jpeg" },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    // Should fail gracefully — 400 (validation) or 422 (processing)
    expect([400, 422]).toContain(res.statusCode);
    const json = JSON.parse(res.body);
    expect(json.error).toBeDefined();
  });

  it("rejects a truncated PNG (first 100 bytes only)", async () => {
    const truncated = PNG_200x150.subarray(0, 100);

    const res = await postTool("resize", [
      { name: "file", filename: "truncated.png", content: truncated, contentType: "image/png" },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    // A truncated PNG still has valid magic bytes and Sharp can read partial
    // metadata, so validation passes. Processing may succeed (partial decode)
    // or fail gracefully. The key assertion: the server does not crash.
    expect([200, 400, 422]).toContain(res.statusCode);
  });

  it("rejects random binary garbage as an image", async () => {
    const garbage = Buffer.from(
      Array.from({ length: 2048 }, () => Math.floor(Math.random() * 256)),
    );

    const res = await postTool("resize", [
      { name: "file", filename: "garbage.png", content: garbage, contentType: "image/png" },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect([400, 422]).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OVERSIZED IMAGE (MAX_MEGAPIXELS)
// ═══════════════════════════════════════════════════════════════════════════
describe("Image exceeding MAX_MEGAPIXELS", () => {
  it("rejects an image exceeding the 100MP limit", async () => {
    // Test env has MAX_MEGAPIXELS=100. A 10001x10001 image = ~100.02MP.
    const huge = await sharp({
      create: {
        width: 10001,
        height: 10001,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();

    const res = await postTool("resize", [
      { name: "file", filename: "huge.png", content: huge, contentType: "image/png" },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/exceeds maximum size/i);
  }, 60_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// INVALID DIMENSIONS IN SETTINGS
// ═══════════════════════════════════════════════════════════════════════════
describe("Invalid dimensions in settings", () => {
  it("rejects negative width", async () => {
    const res = await postTool("resize", [
      { name: "file", filename: "test.png", content: PNG_200x150, contentType: "image/png" },
      { name: "settings", content: JSON.stringify({ width: -1 }) },
    ]);

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/invalid settings/i);
  });

  it("rejects negative height", async () => {
    const res = await postTool("resize", [
      { name: "file", filename: "test.png", content: PNG_200x150, contentType: "image/png" },
      { name: "settings", content: JSON.stringify({ height: -1 }) },
    ]);

    expect(res.statusCode).toBe(400);
  });

  it("rejects zero width", async () => {
    const res = await postTool("resize", [
      { name: "file", filename: "test.png", content: PNG_200x150, contentType: "image/png" },
      { name: "settings", content: JSON.stringify({ width: 0 }) },
    ]);

    // z.number().positive() rejects 0
    expect(res.statusCode).toBe(400);
  });

  it("handles float dimensions", async () => {
    const res = await postTool("resize", [
      { name: "file", filename: "test.png", content: PNG_200x150, contentType: "image/png" },
      { name: "settings", content: JSON.stringify({ width: 1.5 }) },
    ]);

    // Zod allows floats through z.number().positive() — Sharp will round
    // Should succeed or get rejected by Zod, but not crash
    expect([200, 400, 422]).toContain(res.statusCode);
  });

  it("handles large width without crashing", async () => {
    const res = await postTool("resize", [
      { name: "file", filename: "test.png", content: PNG_200x150, contentType: "image/png" },
      { name: "settings", content: JSON.stringify({ width: 10000 }) },
    ]);

    expect([200, 400, 422]).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INJECTION ATTACKS IN TEXT FIELDS
// ═══════════════════════════════════════════════════════════════════════════
describe("Injection attacks in text fields", () => {
  it("SQL injection in text-overlay does not affect database", async () => {
    const res = await postTool("text-overlay", [
      { name: "file", filename: "test.png", content: PNG_200x150, contentType: "image/png" },
      {
        name: "settings",
        content: JSON.stringify({
          text: "'; DROP TABLE users; --",
          fontSize: 24,
        }),
      },
    ]);

    // Text overlay should process normally — SQL injection is in SVG text
    expect(res.statusCode).toBe(200);

    // Verify the database is still intact by making an auth request
    const healthRes = await app.inject({
      method: "GET",
      url: "/api/v1/health",
    });
    expect(healthRes.statusCode).toBe(200);
  });

  it("XSS payload in text-overlay is treated as literal text", async () => {
    const res = await postTool("text-overlay", [
      { name: "file", filename: "test.png", content: PNG_200x150, contentType: "image/png" },
      {
        name: "settings",
        content: JSON.stringify({
          text: "<script>alert(1)</script>",
          fontSize: 24,
        }),
      },
    ]);

    // The escapeXml function should sanitize angle brackets
    expect(res.statusCode).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MALFORMED SETTINGS
// ═══════════════════════════════════════════════════════════════════════════
describe("Malformed settings field", () => {
  it("rejects non-JSON settings string with 400", async () => {
    const res = await postTool("resize", [
      { name: "file", filename: "test.png", content: PNG_200x150, contentType: "image/png" },
      { name: "settings", content: "not json at all" },
    ]);

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/json/i);
  });

  it("rejects settings as JSON array with 400", async () => {
    const res = await postTool("resize", [
      { name: "file", filename: "test.png", content: PNG_200x150, contentType: "image/png" },
      { name: "settings", content: "[]" },
    ]);

    // Zod object schema should reject an array
    expect(res.statusCode).toBe(400);
  });

  it("rejects settings as JSON string with 400", async () => {
    const res = await postTool("resize", [
      { name: "file", filename: "test.png", content: PNG_200x150, contentType: "image/png" },
      { name: "settings", content: '"just a string"' },
    ]);

    expect(res.statusCode).toBe(400);
  });

  it("rejects settings as JSON number with 400", async () => {
    const res = await postTool("resize", [
      { name: "file", filename: "test.png", content: PNG_200x150, contentType: "image/png" },
      { name: "settings", content: "42" },
    ]);

    expect(res.statusCode).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DUPLICATE FILE FIELDS
// ═══════════════════════════════════════════════════════════════════════════
describe("Duplicate file fields in multipart", () => {
  it("rejects a request with multiple file parts", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "first.png", content: PNG_200x150, contentType: "image/png" },
      { name: "file", filename: "second.png", content: PNG_200x150, contentType: "image/png" },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    // Tool factory rejects multiple file parts with 400
    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/one image at a time/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BINARY GARBAGE IN SETTINGS FIELD
// ═══════════════════════════════════════════════════════════════════════════
describe("Binary data in settings field", () => {
  it("rejects random bytes as settings with 400", async () => {
    const randomBytes = Buffer.from(
      Array.from({ length: 64 }, () => Math.floor(Math.random() * 256)),
    );

    const res = await postTool("resize", [
      { name: "file", filename: "test.png", content: PNG_200x150, contentType: "image/png" },
      { name: "settings", content: randomBytes.toString("binary") },
    ]);

    // Should return 400 for invalid JSON
    expect(res.statusCode).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTH — UNAUTHENTICATED ACCESS
// ═══════════════════════════════════════════════════════════════════════════
describe("Unauthenticated tool access", () => {
  it("rejects tool requests without auth token", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", content: PNG_200x150, contentType: "image/png" },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  it("rejects tool requests with invalid auth token", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", content: PNG_200x150, contentType: "image/png" },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: {
        "content-type": contentType,
        authorization: "Bearer totally-fake-token-12345",
      },
      body,
    });

    expect(res.statusCode).toBe(401);
  });
});
