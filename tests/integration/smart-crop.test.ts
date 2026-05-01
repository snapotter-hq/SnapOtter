/**
 * Integration tests for the smart-crop tool (/api/v1/tools/smart-crop).
 *
 * Smart crop has three modes:
 *   - subject (Sharp attention/entropy strategy)
 *   - face (AI face detection via MediaPipe, falls back to subject)
 *   - trim (Sharp trim with optional pad-to-square)
 *
 * The "face" mode requires the Python sidecar. "subject" and "trim" are
 * Sharp-only and always work. The tool goes through createToolRoute which
 * checks TOOL_BUNDLE_MAP, so 501 is possible when the bundle is not installed.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
const PNG = readFileSync(join(FIXTURES, "test-200x150.png"));
const JPG = readFileSync(join(FIXTURES, "test-100x100.jpg"));
const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
const TINY = readFileSync(join(FIXTURES, "test-1x1.png"));

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

describe("Smart Crop", () => {
  // ── Processing ───────────────────────────────────────────────────

  it("route exists and responds to POST", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/smart-crop",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([200, 501]).toContain(res.statusCode);
  }, 60_000);

  it("accepts default settings (subject mode)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/smart-crop",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([200, 501]).toContain(res.statusCode);

    if (res.statusCode === 200) {
      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toBeDefined();
      expect(result.processedSize).toBeGreaterThan(0);
    }

    if (res.statusCode === 501) {
      const result = JSON.parse(res.body);
      expect(result.code).toBe("FEATURE_NOT_INSTALLED");
    }
  }, 60_000);

  it("subject mode with explicit dimensions", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ mode: "subject", width: 100, height: 100 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/smart-crop",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([200, 501]).toContain(res.statusCode);

    if (res.statusCode === 200) {
      const result = JSON.parse(res.body);
      const dlRes = await app.inject({
        method: "GET",
        url: result.downloadUrl,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const meta = await sharp(dlRes.rawPayload).metadata();
      expect(meta.width).toBe(100);
      expect(meta.height).toBe(100);
    }
  }, 60_000);

  it("subject mode with entropy strategy", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          mode: "subject",
          strategy: "entropy",
          width: 120,
          height: 120,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/smart-crop",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([200, 501]).toContain(res.statusCode);
  }, 60_000);

  it("subject mode with padding", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ mode: "subject", width: 80, height: 80, padding: 10 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/smart-crop",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([200, 501]).toContain(res.statusCode);

    if (res.statusCode === 200) {
      const result = JSON.parse(res.body);
      const dlRes = await app.inject({
        method: "GET",
        url: result.downloadUrl,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const meta = await sharp(dlRes.rawPayload).metadata();
      expect(meta.width).toBe(80);
      expect(meta.height).toBe(80);
    }
  }, 60_000);

  it("face mode (AI-dependent, falls back to subject)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          mode: "face",
          width: 100,
          height: 100,
          facePreset: "head-shoulders",
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/smart-crop",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([200, 501]).toContain(res.statusCode);
  }, 60_000);

  it("trim mode removes whitespace", async () => {
    const BLANK = readFileSync(join(FIXTURES, "test-blank.png"));
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test-blank.png", contentType: "image/png", content: BLANK },
      {
        name: "settings",
        content: JSON.stringify({ mode: "trim", threshold: 30 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/smart-crop",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    // trim on a blank image may 422 or succeed with a tiny result
    expect([200, 422, 501]).toContain(res.statusCode);
  }, 60_000);

  it("trim mode with padToSquare and targetSize", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          mode: "trim",
          padToSquare: true,
          targetSize: 256,
          padColor: "#ffffff",
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/smart-crop",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([200, 501]).toContain(res.statusCode);

    if (res.statusCode === 200) {
      const result = JSON.parse(res.body);
      const dlRes = await app.inject({
        method: "GET",
        url: result.downloadUrl,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const meta = await sharp(dlRes.rawPayload).metadata();
      expect(meta.width).toBe(256);
      expect(meta.height).toBe(256);
    }
  }, 60_000);

  it(
    "handles HEIC input",
    { timeout: 120_000 },
    async () => {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
        {
          name: "settings",
          content: JSON.stringify({ mode: "subject", width: 100, height: 100 }),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/smart-crop",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body,
      });

      expect([200, 501]).toContain(res.statusCode);
    },
    60_000,
  );

  it("handles 1x1 pixel input", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", contentType: "image/png", content: TINY },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/smart-crop",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([200, 422, 501]).toContain(res.statusCode);
  }, 60_000);

  // ── Validation (always testable) ─────────────────────────────────

  it("rejects requests without a file", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/smart-crop",
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

  it("rejects invalid settings JSON", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "not json{{{" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/smart-crop",
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

  it("rejects padding out of range", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ padding: 100 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/smart-crop",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/invalid settings/i);
  });

  it("rejects unauthenticated requests", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/smart-crop",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });
});
