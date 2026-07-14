/**
 * Focused sidecar-free integration coverage for OCR PDF route branches.
 *
 * The standard ocr-pdf integration file documents the local 501 bundle gate.
 * These tests force the gate open and mock enqueueing so route validation and
 * async job submission are exercised without running PDF OCR.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { objectExists } from "../../../../apps/api/src/lib/object-storage.js";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

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

vi.mock("../../../../apps/api/src/lib/feature-status.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../apps/api/src/lib/feature-status.js")>();
  return {
    ...actual,
    isToolInstalled: (toolId: string) =>
      toolId === "ocr-pdf" ? true : actual.isToolInstalled(toolId),
  };
});

vi.mock("../../../../apps/api/src/jobs/enqueue.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../apps/api/src/jobs/enqueue.js")>();
  return {
    ...actual,
    enqueueToolJob: mocks.enqueueToolJob,
  };
});

const PDF = readFixture(fixtures.document.pdf3);

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
    available: true,
    status: "ready",
    qualities: ["balanced", "best"],
    providers: ["CPUExecutionProvider"],
    descriptor: {},
  });
});

function postOcrPdf(parts: Parameters<typeof createMultipartPayload>[0], token = adminToken) {
  const { body, contentType } = createMultipartPayload(parts);

  return app.inject({
    method: "POST",
    url: "/api/v1/tools/pdf/ocr-pdf",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": contentType,
    },
    body,
  });
}

function expectAsyncAccepted(body: string, clientJobId: string) {
  const artifactJobId = mocks.enqueueToolJob.mock.calls.at(-1)?.[0].jobId;
  expect(artifactJobId).toBeDefined();
  expect(JSON.parse(body)).toEqual({
    jobId: clientJobId,
    progressJobId: clientJobId,
    artifactJobId,
    async: true,
  });
}

describe("ocr-pdf route coverage", () => {
  it("rejects API keys without tools:use before uploading or enqueueing OCR", async () => {
    const createKey = await app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "ocr-pdf-without-tools", permissions: ["settings:read"] },
    });
    expect(createKey.statusCode).toBe(201);
    const apiKey = JSON.parse(createKey.body).key as string;

    const res = await postOcrPdf(
      [
        {
          name: "file",
          filename: "scan.pdf",
          contentType: "application/pdf",
          content: PDF,
        },
        { name: "settings", content: JSON.stringify({ quality: "fast" }) },
      ],
      apiKey,
    );

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe("You don't have permission to use this tool");
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
  });

  it("rejects requests without a PDF after the bundle gate passes", async () => {
    const res = await postOcrPdf([
      { name: "settings", content: JSON.stringify({ quality: "fast" }) },
    ]);

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBe("No PDF file provided");
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
  });

  it("rejects invalid settings JSON after upload parsing", async () => {
    const res = await postOcrPdf([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF,
      },
      { name: "settings", content: "{{bad json}}" },
    ]);

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBe("Settings must be valid JSON");
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
  });

  it("validates ocr-pdf settings before enqueueing", async () => {
    const res = await postOcrPdf([
      {
        name: "file",
        filename: "test.pdf",
        contentType: "application/pdf",
        content: PDF,
      },
      { name: "settings", content: JSON.stringify({ language: "klingon" }) },
    ]);

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBe("Invalid settings");
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
  });

  it("rejects a non-PDF payload before enqueueing Fast OCR", async () => {
    const res = await postOcrPdf([
      {
        name: "file",
        filename: "fake.pdf",
        contentType: "application/pdf",
        content: Buffer.from("not a PDF"),
      },
      { name: "settings", content: JSON.stringify({ quality: "fast" }) },
    ]);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/PDF header/i);
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
  });

  it("enqueues valid OCR PDF requests with sanitized settings", async () => {
    const clientJobId = "11111111-1111-4111-8111-111111111111";
    const res = await postOcrPdf([
      {
        name: "file",
        filename: "scan.pdf",
        contentType: "application/pdf",
        content: PDF,
      },
      {
        name: "settings",
        content: JSON.stringify({ quality: "fast", language: "en", pages: "1-2" }),
      },
      { name: "clientJobId", content: clientJobId },
      { name: "fileId", content: "file_123" },
    ]);

    expect(res.statusCode).toBe(202);
    expectAsyncAccepted(res.body, clientJobId);
    expect(mocks.enqueueToolJob).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueToolJob).toHaveBeenCalledWith(
      expect.objectContaining({
        toolId: "ocr-pdf",
        pool: "ai",
        filename: "scan.pdf",
        settings: { quality: "fast", language: "en", pages: "1-2" },
        clientJobId,
        fileId: "file_123",
        kind: "ai-tool",
      }),
    );
  });

  it.each([
    ["Fast", { quality: "fast", language: "ko" }],
    ["the legacy Tesseract alias", { engine: "tesseract", language: "ko" }],
  ])("rejects Korean with %s before enqueueing", async (_label, settings) => {
    const res = await postOcrPdf([
      {
        name: "file",
        filename: "scan.pdf",
        contentType: "application/pdf",
        content: PDF,
      },
      { name: "settings", content: JSON.stringify(settings) },
    ]);

    expect(res.statusCode).toBe(501);
    expect(JSON.parse(res.body)).toMatchObject({
      code: "FEATURE_INCOMPATIBLE",
      requestedQuality: "fast",
      compatibilityReason: "fast-korean-unsupported",
      guidance:
        "Fast OCR does not support Korean. Install the Accurate OCR bundle and choose Balanced or Best.",
    });
    expect(mocks.getOcrRuntimeCapability).not.toHaveBeenCalled();
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
  });

  it("pins omitted quality to Balanced when it is the best available tier", async () => {
    mocks.getOcrRuntimeCapability.mockReturnValue({
      available: true,
      status: "ready",
      qualities: ["balanced"],
      providers: ["CPUExecutionProvider"],
      descriptor: {},
    });

    const res = await postOcrPdf([
      {
        name: "file",
        filename: "scan.pdf",
        contentType: "application/pdf",
        content: PDF,
      },
      { name: "settings", content: JSON.stringify({ language: "en", pages: "1" }) },
    ]);

    expect(res.statusCode).toBe(202);
    expect(mocks.enqueueToolJob).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: { quality: "balanced", language: "en", pages: "1" },
      }),
    );
  });

  it("pins omitted Korean to Best when the accurate runtime is missing", async () => {
    mocks.getOcrRuntimeCapability.mockReturnValue({
      available: false,
      status: "missing",
      reason: "descriptor-missing",
      qualities: [],
      providers: [],
    });

    const res = await postOcrPdf([
      {
        name: "file",
        filename: "scan.pdf",
        contentType: "application/pdf",
        content: PDF,
      },
      { name: "settings", content: JSON.stringify({ language: "ko" }) },
    ]);

    expect(res.statusCode).toBe(501);
    expect(JSON.parse(res.body)).toMatchObject({
      code: "FEATURE_NOT_INSTALLED",
      requestedQuality: "best",
      compatibilityReason: "descriptor-missing",
    });
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
  });

  it("cleans up the uploaded PDF when enqueueing fails", async () => {
    mocks.enqueueToolJob.mockRejectedValueOnce(new Error("Redis unavailable"));
    const res = await postOcrPdf([
      {
        name: "file",
        filename: "scan.pdf",
        contentType: "application/pdf",
        content: PDF,
      },
      { name: "settings", content: JSON.stringify({ quality: "fast", pages: "1" }) },
    ]);

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body)).toMatchObject({ error: "Failed to queue PDF OCR" });
    const jobId = mocks.enqueueToolJob.mock.calls.at(-1)?.[0].jobId;
    expect(jobId).toBeDefined();
    await expect(objectExists(`uploads/${jobId}/scan.pdf`)).resolves.toBe(false);
  });
});
