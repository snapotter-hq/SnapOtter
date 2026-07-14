/**
 * Integration tests for the ocr-pdf tool (/api/v1/tools/pdf/ocr-pdf).
 *
 * Fast PDF OCR is built in. Balanced and Best are optional accurate-pack
 * capabilities and are rejected before enqueue when no healthy v3 runtime is
 * active.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PDF = readFixture(fixtures.document.pdf3);

const mocks = vi.hoisted(() => ({
  enqueueToolJob: vi.fn(),
  getOcrRuntimeCapability: vi.fn(),
}));

vi.mock("@snapotter/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@snapotter/ai")>();
  return {
    ...actual,
    getOcrRuntimeCapability: mocks.getOcrRuntimeCapability,
  };
});

vi.mock("../../../../apps/api/src/jobs/enqueue.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../apps/api/src/jobs/enqueue.js")>();
  return {
    ...actual,
    enqueueToolJob: mocks.enqueueToolJob,
  };
});

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

beforeEach(() => {
  mocks.enqueueToolJob.mockReset();
  mocks.enqueueToolJob.mockResolvedValue(undefined);
  mocks.getOcrRuntimeCapability.mockReset();
  mocks.getOcrRuntimeCapability.mockReturnValue({
    available: false,
    qualities: [],
    providers: [],
  });
});

describe("ocr-pdf", () => {
  it("enqueues built-in Fast OCR when the accurate pack is absent", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF,
      },
      { name: "settings", content: JSON.stringify({ quality: "fast", pages: "1" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/ocr-pdf",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(202);
    const json = JSON.parse(res.body);
    expect(json.jobId).toBeDefined();
    expect(json.async).toBe(true);
    expect(mocks.enqueueToolJob).toHaveBeenCalledWith(
      expect.objectContaining({
        toolId: "ocr-pdf",
        pool: "ai",
        settings: expect.objectContaining({ quality: "fast", pages: "1" }),
      }),
    );
  });

  it("defaults to Fast when the accurate pack is absent", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF,
      },
      { name: "settings", content: JSON.stringify({ pages: "1" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/ocr-pdf",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(202);
    expect(mocks.enqueueToolJob).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ quality: "fast", pages: "1" }),
      }),
    );
  });

  it("maps the legacy paddleocr engine to Balanced like batch and pipeline ingress", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF,
      },
      { name: "settings", content: JSON.stringify({ engine: "paddleocr", pages: "1" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/ocr-pdf",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(501);
    expect(JSON.parse(res.body)).toMatchObject({
      code: "FEATURE_NOT_INSTALLED",
      feature: "ocr",
      requestedQuality: "balanced",
    });
  });

  it("returns 501 FEATURE_NOT_INSTALLED for an unavailable accurate tier", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF,
      },
      { name: "settings", content: JSON.stringify({ quality: "best" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/ocr-pdf",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(501);
    expect(JSON.parse(res.body)).toMatchObject({
      code: "FEATURE_NOT_INSTALLED",
      feature: "ocr",
      requestedQuality: "best",
    });
  });

  // -- Auth gate --

  it("rejects unauthenticated requests (401)", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF,
      },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/ocr-pdf",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });

  it("validates settings before checking the optional pack", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF,
      },
      {
        name: "settings",
        content: JSON.stringify({ quality: "ultra" }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/ocr-pdf",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBe("Invalid settings");
    expect(mocks.getOcrRuntimeCapability).not.toHaveBeenCalled();
  });
});
