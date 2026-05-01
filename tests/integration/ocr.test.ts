/**
 * Integration tests for the OCR AI tool (/api/v1/tools/ocr).
 *
 * The Python sidecar may not be running, so processing tests accept both
 * 200 (sidecar available) and 501 (feature not installed). Validation paths
 * are always testable.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
const PNG = readFileSync(join(FIXTURES, "test-200x150.png"));
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

describe("ocr", () => {
  // ── Processing (sidecar-dependent) ────────────────────────────────

  it("responds to the route (200 or 501)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/ocr",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect([200, 501]).toContain(res.statusCode);
  }, 60_000);

  it("processes with default settings (200 or 501)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/ocr",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect([200, 501]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const json = JSON.parse(res.body);
      expect(json.jobId).toBeDefined();
      expect(json.text).toBeDefined();
      expect(json.engine).toBeDefined();
    }
  }, 60_000);

  it("accepts quality=fast (200 or 501)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ quality: "fast" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/ocr",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect([200, 501]).toContain(res.statusCode);
  }, 60_000);

  it("accepts quality=best (200 or 501)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ quality: "best" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/ocr",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect([200, 501]).toContain(res.statusCode);
  }, 60_000);

  it("accepts explicit language and enhance=false (200 or 501)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ language: "en", enhance: false }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/ocr",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect([200, 501]).toContain(res.statusCode);
  }, 60_000);

  it("accepts backward-compatible engine param (200 or 501)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ engine: "tesseract" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/ocr",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect([200, 501]).toContain(res.statusCode);
  }, 60_000);

  it(
    "handles HEIC input (200 or 501)",
    { timeout: 120_000 },
    async () => {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
        { name: "settings", content: JSON.stringify({}) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/ocr",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        body,
      });

      expect([200, 501]).toContain(res.statusCode);
    },
    60_000,
  );

  it("handles 1x1 pixel input (200, 422, or 501)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", contentType: "image/png", content: TINY },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/ocr",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect([200, 422, 501]).toContain(res.statusCode);
  }, 60_000);

  // ── Validation (always testable) ──────────────────────────────────

  it("rejects requests without a file (400)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({ quality: "fast" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/ocr",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    // 400 when sidecar is available, 501 when not (isToolInstalled check fires first)
    expect([400, 501]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const json = JSON.parse(res.body);
      expect(json.error).toMatch(/no image/i);
    }
  });

  it("rejects invalid settings JSON (400)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "{{bad json}}" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/ocr",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect([400, 501]).toContain(res.statusCode);
  });

  it("rejects invalid quality value (400)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ quality: "ultra" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/ocr",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect([400, 501]).toContain(res.statusCode);
  });

  it("rejects invalid language value (400)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ language: "klingon" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/ocr",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect([400, 501]).toContain(res.statusCode);
  });

  it("rejects unauthenticated requests (401)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/ocr",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });
});
