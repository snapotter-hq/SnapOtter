/**
 * Focused sidecar-free integration coverage for OCR PDF route branches.
 *
 * The standard ocr-pdf integration file documents the local 501 bundle gate.
 * These tests force the gate open and mock enqueueing so route validation and
 * async job submission are exercised without running PDF OCR.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const mocks = vi.hoisted(() => ({
  enqueueToolJob: vi.fn(),
}));

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
});

function postOcrPdf(parts: Parameters<typeof createMultipartPayload>[0]) {
  const { body, contentType } = createMultipartPayload(parts);

  return app.inject({
    method: "POST",
    url: "/api/v1/tools/pdf/ocr-pdf",
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": contentType,
    },
    body,
  });
}

describe("ocr-pdf route coverage", () => {
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
    expect(JSON.parse(res.body)).toEqual({ jobId: clientJobId, async: true });
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
});
