/**
 * Integration tests for the erase-object AI tool (/api/v1/tools/erase-object).
 *
 * This tool requires BOTH an image and a mask file. The Python sidecar may not
 * be running, so processing tests accept both 200 (sidecar available) and
 * 501 (feature not installed). Validation paths are always testable.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
const PNG = readFileSync(join(FIXTURES, "test-200x150.png"));
const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
const TINY = readFileSync(join(FIXTURES, "test-1x1.png"));
// Use the same PNG as a mask (any valid image works for test purposes)
const MASK = readFileSync(join(FIXTURES, "test-200x150.png"));

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

describe("erase-object", () => {
  // ── Processing (sidecar-dependent) ────────────────────────────────

  it("responds to the route with image and mask (202 or 501)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "mask", filename: "mask.png", contentType: "image/png", content: MASK },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/erase-object",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);

  it("processes with default format and quality (202 or 501)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "mask", filename: "mask.png", contentType: "image/png", content: MASK },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/erase-object",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
    if (res.statusCode === 202) {
      const result = JSON.parse(res.body);
      expect(result.jobId).toBeDefined();
      expect(result.async).toBe(true);
    }
  }, 60_000);

  it("accepts explicit format=jpg and quality=80 (202 or 501)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "mask", filename: "mask.png", contentType: "image/png", content: MASK },
      { name: "format", content: "jpg" },
      { name: "quality", content: "80" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/erase-object",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);

  it("accepts format=webp (202 or 501)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "mask", filename: "mask.png", contentType: "image/png", content: MASK },
      { name: "format", content: "webp" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/erase-object",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);

  it(
    "handles HEIC image input (202 or 501)",
    { timeout: 120_000 },
    async () => {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
        { name: "mask", filename: "mask.png", contentType: "image/png", content: MASK },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/erase-object",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        body,
      });

      expect([202, 501]).toContain(res.statusCode);
    },
    60_000,
  );

  it("handles 1x1 pixel image input (200, 422, or 501)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", contentType: "image/png", content: TINY },
      { name: "mask", filename: "mask.png", contentType: "image/png", content: TINY },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/erase-object",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect([202, 422, 501]).toContain(res.statusCode);
  }, 60_000);

  // ── Validation (always testable) ──────────────────────────────────

  it("rejects requests without an image file (400)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "mask", filename: "mask.png", contentType: "image/png", content: MASK },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/erase-object",
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

  it("rejects requests without a mask file (400)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/erase-object",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    // 400 for missing mask or 501 for sidecar not installed
    expect([400, 501]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const json = JSON.parse(res.body);
      expect(json.error).toMatch(/mask/i);
    }
  });

  it("rejects invalid format value (400)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "mask", filename: "mask.png", contentType: "image/png", content: MASK },
      { name: "format", content: "bmp" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/erase-object",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect([400, 501]).toContain(res.statusCode);
  });

  it("rejects quality out of range (400)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "mask", filename: "mask.png", contentType: "image/png", content: MASK },
      { name: "quality", content: "200" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/erase-object",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect([400, 501]).toContain(res.statusCode);
  });

  it("rejects unauthenticated requests (401)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "mask", filename: "mask.png", contentType: "image/png", content: MASK },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/erase-object",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  it("accepts format=avif (202 or 501)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "mask", filename: "mask.png", contentType: "image/png", content: MASK },
      { name: "format", content: "avif" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/erase-object",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);
});
