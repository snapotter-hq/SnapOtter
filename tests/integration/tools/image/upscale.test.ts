/**
 * Integration tests for the upscale tool (/api/v1/tools/image/upscale).
 *
 * This tool uses async processing: valid requests return 202 with a jobId,
 * and the result is delivered via SSE. Tests accept both 202 (processing
 * accepted) and 501 (not installed) for the processing path while fully
 * testing validation paths.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getToolConfig } from "../../../../apps/api/src/routes/tool-factory.js";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);
const JPG = readFixture(fixtures.image.base.jpg100);
const HEIC = readFixture(fixtures.image.base.heic200);
const TINY = readFixture(fixtures.image.edge.px1);

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
});

afterAll(async () => {
  await testApp.cleanup();
});

describe("Upscale", () => {
  // ── Processing (AI-dependent) ────────────────────────────────────

  it("route exists and responds to POST", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/upscale",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);

  it("accepts default settings (2x scale)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/upscale",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);

    if (res.statusCode === 202) {
      const result = JSON.parse(res.body);
      expect(result.jobId).toBeDefined();
      expect(result.async).toBe(true);
    }

    if (res.statusCode === 501) {
      const result = JSON.parse(res.body);
      expect(result.code).toBe("FEATURE_NOT_INSTALLED");
    }
  }, 60_000);

  it("accepts explicit scale factor", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ scale: 4 }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/upscale",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);

  it("accepts model and faceEnhance options", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          scale: 2,
          model: "auto",
          faceEnhance: true,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/upscale",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);

  it("accepts denoise and format options", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({
          scale: 2,
          denoise: 30,
          format: "png",
          quality: 90,
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/upscale",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);

  it("accepts scale as a string (coerced to number)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ scale: "2" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/upscale",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);

  it("processes JPEG input", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/upscale",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
  }, 60_000);

  it(
    "handles HEIC input",
    { timeout: 120_000 },
    async () => {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
        { name: "settings", content: JSON.stringify({}) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/upscale",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body,
      });

      expect([202, 501]).toContain(res.statusCode);
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
      url: "/api/v1/tools/image/upscale",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([202, 422, 501]).toContain(res.statusCode);
  }, 60_000);

  // ── Validation (always testable) ─────────────────────────────────

  it("rejects requests without a file", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/upscale",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([400, 501]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const result = JSON.parse(res.body);
      expect(result.error).toMatch(/no image/i);
    }
  });

  it("rejects invalid settings JSON", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "not valid json{{{" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/upscale",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect([400, 501]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const result = JSON.parse(res.body);
      expect(result.error).toMatch(/json/i);
    }
  });

  it("rejects unauthenticated requests", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/upscale",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  // ── Async processing (regression for #106) ─────────────────────────

  it("returns 202 with jobId for async processing", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ scale: 2 }) },
      { name: "clientJobId", content: "test-job-async-regression" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/upscale",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    if (res.statusCode === 501) return;

    expect(res.statusCode).toBe(202);
    const result = JSON.parse(res.body);
    expect(result.async).toBe(true);
    expect(result.jobId).toBe("test-job-async-regression");
  }, 60_000);

  it("returns 202 without blocking for processing", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
      { name: "clientJobId", content: "test-job-timing" },
    ]);

    const start = Date.now();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/upscale",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    if (res.statusCode === 501) return;

    const elapsed = Date.now() - start;
    expect(res.statusCode).toBe(202);
    expect(elapsed).toBeLessThan(30_000);
  }, 60_000);

  // ── Pipeline and batch schema parity (regression for #2362) ────────

  it("retains model, faceEnhance, denoise, format, and quality in the registered batch/pipeline schema", async () => {
    const config = getToolConfig("upscale");
    expect(config).toBeDefined();

    const fullSettings = {
      scale: 2,
      model: "realesrgan-x4plus",
      faceEnhance: true,
      denoise: 15,
      format: "webp",
      quality: 85,
    };

    expect(config?.settingsSchema.parse(fullSettings)).toEqual(fullSettings);

    // Invalid non-scale fields must be rejected by the batch route rather than stripped
    const badBatch = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ scale: 2, faceEnhance: "not-a-boolean" }),
      },
    ]);

    const badRes = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/upscale/batch",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": badBatch.contentType,
      },
      body: badBatch.body,
    });

    expect(badRes.statusCode).toBe(400);
  });
});
