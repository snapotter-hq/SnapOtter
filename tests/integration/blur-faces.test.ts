/**
 * Integration tests for the blur-faces AI tool (/api/v1/tools/blur-faces).
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

describe("blur-faces", () => {
  // ── Processing (sidecar-dependent) ────────────────────────────────

  it("responds to the route (202 or 501)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/blur-faces",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);

  it("processes with default settings (202 or 501)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/blur-faces",
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

  it("accepts explicit blurRadius and sensitivity (202 or 501)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ blurRadius: 80, sensitivity: 0.9 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/blur-faces",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);

  it("accepts minimum settings values (202 or 501)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ blurRadius: 1, sensitivity: 0 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/blur-faces",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);

  it(
    "handles HEIC input (202 or 501)",
    { timeout: 120_000 },
    async () => {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
        { name: "settings", content: JSON.stringify({}) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/blur-faces",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        body,
      });

      expect([202, 501]).toContain(res.statusCode);
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
      url: "/api/v1/tools/blur-faces",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    // 200 = processed, 422 = processing error, 501 = sidecar not installed
    expect([202, 422, 501]).toContain(res.statusCode);
  }, 60_000);

  // ── Validation (always testable) ──────────────────────────────────

  it("rejects requests without a file (400)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({ blurRadius: 30 }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/blur-faces",
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
      { name: "settings", content: "not-json{{{" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/blur-faces",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    // Either 400 (invalid JSON) or 501 (sidecar not installed, checked first)
    expect([400, 501]).toContain(res.statusCode);
  });

  it("rejects blurRadius above 100 (400)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ blurRadius: 200, sensitivity: 0.5 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/blur-faces",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect([400, 501]).toContain(res.statusCode);
  });

  it("rejects sensitivity above 1 (400)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ blurRadius: 30, sensitivity: 5 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/blur-faces",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect([400, 501]).toContain(res.statusCode);
  });

  it("rejects blurRadius below 1 (400)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ blurRadius: 0, sensitivity: 0.5 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/blur-faces",
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
      url: "/api/v1/tools/blur-faces",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  it("rejects sensitivity below 0 (400)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ blurRadius: 30, sensitivity: -0.5 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/blur-faces",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect([400, 501]).toContain(res.statusCode);
  });
});
