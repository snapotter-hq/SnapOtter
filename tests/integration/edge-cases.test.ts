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

// ═══════════════════════════════════════════════════════════════════════════
// 1x1 PIXEL IMAGE — EXTENDED TOOL COVERAGE
// ═══════════════════════════════════════════════════════════════════════════
describe("1x1 pixel image through additional tools", () => {
  it("compresses a 1x1 image without crashing", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", content: PNG_1x1, contentType: "image/png" },
      { name: "settings", content: JSON.stringify({ quality: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/compress",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("gets info for a 1x1 image", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", content: PNG_1x1, contentType: "image/png" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/info",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.width).toBe(1);
    expect(json.height).toBe(1);
    expect(json.format).toBe("png");
  });

  it("converts a 1x1 PNG to JPEG without crashing", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", content: PNG_1x1, contentType: "image/png" },
      { name: "settings", content: JSON.stringify({ format: "jpeg" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/convert",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect([200, 400]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const json = JSON.parse(res.body);
      expect(json.error).toBeDefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UNICODE AND SPECIAL FILENAMES
// ═══════════════════════════════════════════════════════════════════════════
describe("Unicode and special filenames", () => {
  it("handles emoji in filename", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "\u{1F3A8}photo.png",
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
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
  });

  it("handles CJK characters in filename", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "写真.png",
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

  it("handles spaces and special chars in filename", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "my photo (2).png",
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

  it("handles a very long filename (255 chars)", async () => {
    const longName = "a".repeat(251) + ".png";
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

    // Should succeed — sanitizeFilename may truncate but not crash
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

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    // Download URL must not contain traversal sequences
    expect(json.downloadUrl).not.toContain("..");
    expect(json.downloadUrl).not.toContain("etc/passwd");
  });

  it("handles filename with no extension", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "noextension",
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

    // Should process via magic byte detection regardless of extension
    expect(res.statusCode).toBe(200);
  });

  it("handles filename that is only dots", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "....png",
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
});

// ═══════════════════════════════════════════════════════════════════════════
// ZERO-BYTE FILES — ADDITIONAL TOOLS
// ═══════════════════════════════════════════════════════════════════════════
describe("Zero-byte file to info and border tools", () => {
  it("rejects a zero-byte file to /api/v1/tools/info with 400", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "empty.png", content: Buffer.alloc(0), contentType: "image/png" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/info",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBeDefined();
  });

  it("rejects a zero-byte file to /api/v1/tools/sharpening with 400", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "empty.png", content: Buffer.alloc(0), contentType: "image/png" },
      { name: "settings", content: JSON.stringify({ method: "adaptive" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/sharpening",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 1x1 IMAGE — FLIP AND INFO
// ═══════════════════════════════════════════════════════════════════════════
describe("1x1 pixel image through rotate with flip", () => {
  it("rotates and flips a 1x1 image horizontally", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", content: PNG_1x1, contentType: "image/png" },
      { name: "settings", content: JSON.stringify({ angle: 0, flipHorizontal: true }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/rotate",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    // 0-degree rotation with flip is valid
    expect([200, 400]).toContain(res.statusCode);
  });

  it("rotates and flips a 1x1 image vertically", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", content: PNG_1x1, contentType: "image/png" },
      { name: "settings", content: JSON.stringify({ angle: 0, flipVertical: true }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/rotate",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect([200, 400]).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MULTIPART WITHOUT FILE PART — ONLY SETTINGS
// ═══════════════════════════════════════════════════════════════════════════
describe("Missing file part in multipart request", () => {
  it("rejects resize request with only settings and no file", async () => {
    const { body, contentType } = createMultipartPayload([
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
    expect(json.error).toMatch(/no image/i);
  });

  it("rejects pipeline execute with only pipeline definition and no file", async () => {
    const pipelineDef = {
      steps: [{ toolId: "resize", settings: { width: 100 } }],
    };

    const { body, contentType } = createMultipartPayload([
      { name: "pipeline", content: JSON.stringify(pipelineDef) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/execute",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toMatch(/no image/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// WRONG EXTENSION — ADDITIONAL FORMAT MISMATCHES
// ═══════════════════════════════════════════════════════════════════════════
describe("Wrong extension — additional format mismatches", () => {
  it("handles JPEG data uploaded with .webp extension gracefully", async () => {
    const jpgBuffer = readFileSync(join(FIXTURES, "test-100x100.jpg"));

    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "actually-jpeg.webp",
        content: jpgBuffer,
        contentType: "image/webp",
      },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    // Sharp detects real format via magic bytes
    expect(res.statusCode).toBe(200);
  });

  it("handles WebP data uploaded with .png extension gracefully", async () => {
    const webpBuffer = readFileSync(join(FIXTURES, "test-50x50.webp"));

    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "actually-webp.png",
        content: webpBuffer,
        contentType: "image/png",
      },
      { name: "settings", content: JSON.stringify({ width: 30 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS WITH EXTREME STRING VALUES
// ═══════════════════════════════════════════════════════════════════════════
describe("Settings with extreme values", () => {
  it("handles resize with Number.MAX_SAFE_INTEGER as width without crashing", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", content: PNG_200x150, contentType: "image/png" },
      {
        name: "settings",
        content: JSON.stringify({ width: Number.MAX_SAFE_INTEGER }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    // May be rejected by validation (400), fail at processing (422), or
    // even succeed if Sharp clamps — the key assertion is that it does not crash
    expect([200, 400, 422]).toContain(res.statusCode);
  });

  it("handles deeply nested JSON in settings without crashing", async () => {
    // Build 50-level deep object — should be rejected or flattened by Zod
    let nested: Record<string, unknown> = { width: 100 };
    for (let i = 0; i < 50; i++) {
      nested = { [`level${i}`]: nested };
    }

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", content: PNG_200x150, contentType: "image/png" },
      { name: "settings", content: JSON.stringify(nested) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    // Zod strips unknown keys; width is not present at top level so validation
    // may fail or default to empty settings. Must not crash.
    expect([200, 400, 422]).toContain(res.statusCode);
  });

  it("handles settings with very large JSON string (100KB)", async () => {
    const bigSettings = {
      width: 100,
      padding: "X".repeat(100_000),
    };

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", content: PNG_200x150, contentType: "image/png" },
      { name: "settings", content: JSON.stringify(bigSettings) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/resize",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    // Zod strips the unknown 'padding' key; should succeed with width: 100
    expect(res.statusCode).toBe(200);
  });
});
