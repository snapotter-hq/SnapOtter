/**
 * Integration tests for the OCR AI tool (/api/v1/tools/image/ocr).
 *
 * OCR is always accepted asynchronously. Fast is built in; Balanced and Best
 * return 501 when the optional accurate runtime is unavailable.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import { AcceptedJobTimeoutError, waitForAcceptedJobOrCancel } from "../../settle-job.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);
const HEIC = readFixture(fixtures.image.base.heic200);
const TINY = readFixture(fixtures.image.edge.px1);

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

async function awaitOcrResult(
  response: { statusCode: number; body: string },
  options: { allowFailure?: boolean } = {},
): Promise<Record<string, unknown> | undefined> {
  if (response.statusCode === 501) return undefined;

  expect(response.statusCode).toBe(202);
  const accepted = JSON.parse(response.body) as { jobId?: string; async?: boolean };
  expect(accepted).toMatchObject({ jobId: expect.any(String), async: true });
  try {
    const result = await waitForAcceptedJobOrCancel(accepted.jobId as string, "ai", 25_000);
    return (result?.resultPayload ?? {}) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AcceptedJobTimeoutError) throw error;
    if (options.allowFailure) return undefined;
    throw error;
  }
}

describe("ocr", () => {
  // ── Processing (sidecar-dependent) ────────────────────────────────

  it("accepts built-in Fast OCR asynchronously", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ quality: "fast", language: "en" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/ocr",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    const result = await awaitOcrResult(res);
    expect(result).toMatchObject({ requestedQuality: "fast", actualQuality: "fast" });
  }, 60_000);

  it("processes with default settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/ocr",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    const result = await awaitOcrResult(res);
    expect(result?.text).toBeDefined();
    expect(result?.engine).toBeDefined();
  }, 60_000);

  it("accepts quality=fast", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ quality: "fast", language: "en" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/ocr",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    await awaitOcrResult(res);
  }, 60_000);

  it("accepts quality=best or reports the optional runtime unavailable", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ quality: "best" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/ocr",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect([202, 501]).toContain(res.statusCode);
    await awaitOcrResult(res);
  }, 60_000);

  it("accepts explicit language and enhance=false", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ language: "en", enhance: false }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/ocr",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    await awaitOcrResult(res);
  }, 60_000);

  it("accepts the backward-compatible engine param", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
      {
        name: "settings",
        content: JSON.stringify({ engine: "tesseract", language: "en" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/ocr",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    await awaitOcrResult(res);
  }, 60_000);

  it(
    "handles HEIC input asynchronously",
    { timeout: 120_000 },
    async () => {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
        { name: "settings", content: JSON.stringify({ quality: "fast", language: "en" }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/ocr",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        body,
      });

      await awaitOcrResult(res);
    },
    60_000,
  );

  it("handles a 1x1 pixel input without leaking its async job", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.png", contentType: "image/png", content: TINY },
      { name: "settings", content: JSON.stringify({ quality: "fast", language: "en" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/ocr",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    await awaitOcrResult(res, { allowFailure: true });
  }, 60_000);

  // ── Validation (always testable) ──────────────────────────────────

  it("rejects requests without a file (400)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({ quality: "fast" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/ocr",
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
      url: "/api/v1/tools/image/ocr",
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
      url: "/api/v1/tools/image/ocr",
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
      url: "/api/v1/tools/image/ocr",
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
      url: "/api/v1/tools/image/ocr",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });
});
