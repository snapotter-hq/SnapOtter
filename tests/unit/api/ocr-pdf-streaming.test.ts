import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  copyObjectToFile: vi.fn(),
  deleteObject: vi.fn(),
  enqueueToolJob: vi.fn(),
  extractPdfText: vi.fn(),
  getAuthUser: vi.fn(),
  getObjectBuffer: vi.fn(),
  getOcrRuntimeCapability: vi.fn(),
  receiveUpload: vi.fn(),
  validatePdfPath: vi.fn(),
}));

vi.mock("@snapotter/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@snapotter/ai")>();
  return {
    ...actual,
    extractPdfText: mocks.extractPdfText,
    getOcrRuntimeCapability: mocks.getOcrRuntimeCapability,
  };
});

vi.mock("../../../apps/api/src/jobs/enqueue.js", () => ({
  enqueueToolJob: mocks.enqueueToolJob,
}));

vi.mock("../../../apps/api/src/lib/object-storage.js", () => ({
  copyObjectToFile: mocks.copyObjectToFile,
  deleteObject: mocks.deleteObject,
  getObjectBuffer: mocks.getObjectBuffer,
}));

vi.mock("../../../apps/api/src/lib/upload-stream.js", () => ({
  receiveUpload: mocks.receiveUpload,
}));

vi.mock("../../../apps/api/src/modality/document-input.js", () => ({
  DocumentInputHandler: class DocumentInputHandler {},
  validatePdfPath: mocks.validatePdfPath,
}));

vi.mock("../../../apps/api/src/plugins/auth.js", () => ({
  getAuthUser: mocks.getAuthUser,
}));

vi.mock("../../../apps/api/src/permissions.js", () => ({
  requireToolAccess: vi.fn(async () => ({ id: "user-1" })),
}));

import { env } from "../../../apps/api/src/config.js";
import { type AiPathJobInput, runAiPathToolJob } from "../../../apps/api/src/jobs/ai-handlers.js";
import type { ToolJobData } from "../../../apps/api/src/jobs/types.js";
import { resolveOcrEncodedInputLimit } from "../../../apps/api/src/lib/ocr-limits.js";
import type { ToolProcessCtx } from "../../../apps/api/src/routes/tool-factory.js";
import { registerOcrPdf } from "../../../apps/api/src/routes/tools/ocr-pdf.js";

function job(): ToolJobData {
  return {
    jobId: "ocr-pdf-job",
    toolId: "ocr-pdf",
    userId: null,
    pool: "ai",
    inputRefs: ["uploads/ocr-pdf-job/scan.pdf"],
    filename: "scan.pdf",
    settings: { quality: "fast", language: "en", pages: "1" },
    kind: "ai-tool",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.copyObjectToFile.mockResolvedValue(42);
  mocks.deleteObject.mockResolvedValue(undefined);
  mocks.enqueueToolJob.mockResolvedValue(undefined);
  mocks.getAuthUser.mockReturnValue({ id: "user-1" });
  mocks.getOcrRuntimeCapability.mockReturnValue({
    available: false,
    qualities: [],
    providers: [],
  });
  mocks.receiveUpload.mockResolvedValue({
    key: "uploads/ocr-pdf-job/scan.pdf",
    filename: "scan.pdf",
    size: 42,
  });
  mocks.validatePdfPath.mockResolvedValue(undefined);
  mocks.extractPdfText.mockResolvedValue({
    text: "SnapOtter",
    pages: 1,
    engine: "tesseract",
    requestedQuality: "fast",
    actualQuality: "fast",
    device: "cpu",
    provider: "tesseract",
    degraded: false,
    warnings: [],
  });
});

describe("OCR PDF path-backed processing", () => {
  it("validates and processes the worker scratch path without reading the PDF into memory", async () => {
    const controller = new AbortController();
    const ctx: ToolProcessCtx = {
      scratchDir: "/tmp/ocr-pdf-job",
      signal: controller.signal,
      report: vi.fn(),
    };
    const input: AiPathJobInput = { path: "/tmp/ocr-pdf-job/input.pdf", size: 42 };

    const result = await runAiPathToolJob(job(), input, ctx);

    expect(mocks.validatePdfPath).toHaveBeenCalledWith(input.path, {
      rejectPasswordProtected: true,
      signal: controller.signal,
    });
    expect(mocks.extractPdfText).toHaveBeenCalledWith(
      input.path,
      expect.objectContaining({
        quality: "fast",
        language: "en",
        pages: "1",
        signal: controller.signal,
      }),
      expect.any(Function),
    );
    expect(mocks.getObjectBuffer).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      buffer: Buffer.from("SnapOtter"),
      filename: "scan_ocr.txt",
      contentType: "text/plain",
    });
  });

  it("streams route validation to scratch with a hard cap and removes its scratch directory", async () => {
    let routeHandler: ((request: unknown, reply: unknown) => Promise<unknown>) | undefined;
    registerOcrPdf({
      post: vi.fn((_path, handler) => {
        routeHandler = handler;
      }),
    } as never);

    const request = {
      headers: {},
      log: { error: vi.fn() },
      raw: {
        aborted: false,
        once: vi.fn(),
        removeListener: vi.fn(),
      },
      parts: async function* () {
        yield { type: "file", filename: "scan.pdf", file: {} };
        yield { type: "field", fieldname: "settings", value: '{"quality":"fast"}' };
      },
    };
    const reply = {
      statusCode: 200,
      payload: undefined as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      send(payload: unknown) {
        this.payload = payload;
        return payload;
      },
    };

    const originalScratchPath = env.SCRATCH_PATH;
    const configuredScratchRoot = join(tmpdir(), `snapotter-ocr-pdf-test-${Date.now()}`);
    env.SCRATCH_PATH = configuredScratchRoot;
    try {
      await routeHandler?.(request, reply);
    } finally {
      env.SCRATCH_PATH = originalScratchPath;
      await rm(configuredScratchRoot, { recursive: true, force: true });
    }

    expect(reply.statusCode).toBe(202);
    expect(mocks.receiveUpload).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.objectContaining({
        maxBytes: resolveOcrEncodedInputLimit(env.MAX_UPLOAD_SIZE_MB),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(mocks.copyObjectToFile).toHaveBeenCalledWith(
      "uploads/ocr-pdf-job/scan.pdf",
      expect.stringMatching(/ocr-pdf-validation-[^/]+\/input\.pdf$/),
      expect.objectContaining({
        maxBytes: resolveOcrEncodedInputLimit(env.MAX_UPLOAD_SIZE_MB),
        signal: expect.any(AbortSignal),
      }),
    );
    const validationPath = mocks.copyObjectToFile.mock.calls[0][1];
    expect(validationPath.startsWith(configuredScratchRoot)).toBe(true);
    expect(mocks.validatePdfPath).toHaveBeenCalledWith(validationPath, {
      rejectPasswordProtected: true,
      signal: expect.any(AbortSignal),
    });
    expect(mocks.getObjectBuffer).not.toHaveBeenCalled();
    expect(mocks.enqueueToolJob).toHaveBeenCalledTimes(1);
    expect(request.raw.removeListener).toHaveBeenCalledWith("aborted", expect.any(Function));
    expect(existsSync(validationPath.replace(/\/input\.pdf$/, ""))).toBe(false);
  });
});
