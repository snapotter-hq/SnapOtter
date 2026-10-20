import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cancelSingleJobGuarded: vi.fn(),
  copyObjectToFile: vi.fn(),
  deleteObject: vi.fn(),
  enqueueToolJob: vi.fn(),
  extractPdfText: vi.fn(),
  getAuthUser: vi.fn(),
  getObjectBuffer: vi.fn(),
  getOcrRuntimeCapability: vi.fn(),
  hasPersistedJobRow: vi.fn(),
  insertToolJobAlias: vi.fn(),
  putObjectStream: vi.fn(),
  receiveUpload: vi.fn(),
  requestCancel: vi.fn(),
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
  insertToolJobAlias: mocks.insertToolJobAlias,
}));

vi.mock("../../../apps/api/src/jobs/cancel.js", () => ({
  requestCancel: mocks.requestCancel,
}));

vi.mock("../../../apps/api/src/routes/progress.js", () => ({
  cancelSingleJobGuarded: mocks.cancelSingleJobGuarded,
}));

vi.mock("../../../apps/api/src/lib/object-storage.js", () => ({
  copyObjectToFile: mocks.copyObjectToFile,
  deleteObject: mocks.deleteObject,
  getObjectBuffer: mocks.getObjectBuffer,
  putObjectStream: mocks.putObjectStream,
}));

vi.mock("../../../apps/api/src/lib/upload-cleanup.js", () => ({
  hasPersistedJobRow: mocks.hasPersistedJobRow,
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
import {
  INVALID_CLIENT_JOB_ID_ERROR,
  INVALID_SAVE_MODE_ERROR,
  type ToolJobData,
} from "../../../apps/api/src/jobs/types.js";
import { logger } from "../../../apps/api/src/lib/logger.js";
import { resolveOcrEncodedInputLimit } from "../../../apps/api/src/lib/ocr-limits.js";
import { storeValidatedOcrPdf } from "../../../apps/api/src/lib/ocr-pdf-ingress.js";
import { InputValidationError } from "../../../apps/api/src/modality/contract.js";
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
  mocks.cancelSingleJobGuarded.mockResolvedValue(undefined);
  mocks.deleteObject.mockResolvedValue(undefined);
  mocks.enqueueToolJob.mockResolvedValue(undefined);
  mocks.hasPersistedJobRow.mockResolvedValue(false);
  mocks.insertToolJobAlias.mockResolvedValue(undefined);
  mocks.requestCancel.mockResolvedValue(true);
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
      log: { error: vi.fn(), warn: vi.fn() },
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
      // the route's own request logger, so a qpdf-timeout warn carries reqId (#1547)
      log: request.log,
    });
    expect(mocks.getObjectBuffer).not.toHaveBeenCalled();
    expect(mocks.enqueueToolJob).toHaveBeenCalledTimes(1);
    expect(request.raw.removeListener).toHaveBeenCalledWith("aborted", expect.any(Function));
    expect(existsSync(validationPath.replace(/\/input\.pdf$/, ""))).toBe(false);
  });

  it("answers 413 naming the limit when validation copy exceeds the OCR cap", async () => {
    let routeHandler: ((request: unknown, reply: unknown) => Promise<unknown>) | undefined;
    registerOcrPdf({
      post: vi.fn((_path, handler) => {
        routeHandler = handler;
      }),
    } as never);

    mocks.copyObjectToFile.mockRejectedValueOnce(
      Object.assign(new Error("Object exceeds the maximum allowed size (536870912 bytes)"), {
        statusCode: 413,
        limitBytes: 512 * 1024 * 1024,
      }),
    );

    const request = {
      headers: {},
      log: { error: vi.fn(), warn: vi.fn() },
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

    await routeHandler?.(request, reply);

    expect(reply.statusCode).toBe(413);
    expect(reply.payload).toEqual({ error: "File exceeds the 512 MB upload limit" });
    expect(mocks.deleteObject).toHaveBeenCalledWith("uploads/ocr-pdf-job/scan.pdf");
  });

  it.each([
    [
      "503 storage fault",
      Object.assign(new Error("Workspace storage limit reached"), {
        statusCode: 503,
        code: "workspace-cap",
      }),
    ],
    ["500 server fault", Object.assign(new Error("storage exploded"), { statusCode: 500 })],
  ])(
    "rethrows a %s during multipart upload instead of answering locally (#1642)",
    async (_label, fault) => {
      let routeHandler: ((request: unknown, reply: unknown) => Promise<unknown>) | undefined;
      registerOcrPdf({
        post: vi.fn((_path, handler) => {
          routeHandler = handler;
        }),
      } as never);

      mocks.receiveUpload.mockRejectedValueOnce(fault);

      const request = {
        headers: {},
        log: { error: vi.fn(), warn: vi.fn() },
        raw: {
          aborted: false,
          once: vi.fn(),
          removeListener: vi.fn(),
        },
        parts: async function* () {
          yield { type: "file", filename: "scan.pdf", file: {} };
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

      await expect(routeHandler?.(request, reply)).rejects.toBe(fault);
      expect(reply.payload).toBeUndefined();
    },
  );

  it("deletes a staged upload before rethrowing when a subsequent multipart part fails with 5xx (#1642)", async () => {
    let routeHandler: ((request: unknown, reply: unknown) => Promise<unknown>) | undefined;
    registerOcrPdf({
      post: vi.fn((_path, handler) => {
        routeHandler = handler;
      }),
    } as never);

    const fault = Object.assign(new Error("storage exploded"), { statusCode: 500 });
    const request = {
      headers: {},
      log: { error: vi.fn(), warn: vi.fn() },
      raw: {
        aborted: false,
        once: vi.fn(),
        removeListener: vi.fn(),
      },
      parts: async function* () {
        yield { type: "file", filename: "scan.pdf", file: {} };
        throw fault;
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

    await expect(routeHandler?.(request, reply)).rejects.toBe(fault);
    expect(mocks.deleteObject).toHaveBeenCalledWith("uploads/ocr-pdf-job/scan.pdf");
    expect(reply.payload).toBeUndefined();
  });

  it("answers 400 with stripped internal paths on a client multipart parse failure (#1642)", async () => {
    let routeHandler: ((request: unknown, reply: unknown) => Promise<unknown>) | undefined;
    registerOcrPdf({
      post: vi.fn((_path, handler) => {
        routeHandler = handler;
      }),
    } as never);

    const request = {
      headers: {},
      log: { error: vi.fn(), warn: vi.fn() },
      raw: {
        aborted: false,
        once: vi.fn(),
        removeListener: vi.fn(),
      },
      parts: async function* () {
        yield { type: "file", filename: "scan.pdf", file: {} };
        throw Object.assign(
          new Error("Unexpected end of form at /tmp/snapotter-scratch/secret/scan.pdf"),
          { statusCode: 400 },
        );
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

    await routeHandler?.(request, reply);

    expect(reply.statusCode).toBe(400);
    expect(reply.payload).toEqual({
      error: "Failed to parse multipart request",
      details: "Unexpected end of form at [internal]",
    });
    expect(mocks.deleteObject).toHaveBeenCalledWith("uploads/ocr-pdf-job/scan.pdf");
  });

  it.each([
    [
      "503 storage fault",
      Object.assign(new Error("The server's storage is full."), {
        statusCode: 503,
        code: "storage-full",
      }),
    ],
    ["500 server fault", Object.assign(new Error("storage exploded"), { statusCode: 500 })],
  ])(
    "deletes the uploaded object and rethrows a %s when validation copy fails (#1642)",
    async (_label, fault) => {
      let routeHandler: ((request: unknown, reply: unknown) => Promise<unknown>) | undefined;
      registerOcrPdf({
        post: vi.fn((_path, handler) => {
          routeHandler = handler;
        }),
      } as never);

      mocks.copyObjectToFile.mockRejectedValueOnce(fault);

      const request = {
        headers: {},
        log: { error: vi.fn(), warn: vi.fn() },
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

      await expect(routeHandler?.(request, reply)).rejects.toBe(fault);
      expect(reply.payload).toBeUndefined();
      expect(mocks.deleteObject).toHaveBeenCalledWith("uploads/ocr-pdf-job/scan.pdf");
    },
  );

  it("discards the upload, settles the alias, and skips enqueueing when the client closes after the body was read (#2238)", async () => {
    let routeHandler: ((request: unknown, reply: unknown) => Promise<unknown>) | undefined;
    registerOcrPdf({
      post: vi.fn((_path, handler) => {
        routeHandler = handler;
      }),
    } as never);

    let closeListener: (() => void) | undefined;
    const reply = {
      statusCode: 200,
      payload: undefined as unknown,
      raw: {
        destroyed: false,
        writableEnded: false,
        once: vi.fn((event: string, cb: () => void) => {
          if (event === "close") closeListener = cb;
        }),
        removeListener: vi.fn(),
      },
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      send(payload: unknown) {
        this.payload = payload;
        return payload;
      },
    };

    mocks.validatePdfPath.mockImplementationOnce(async (_path, opts) => {
      reply.raw.destroyed = true;
      closeListener?.();
      opts?.signal?.throwIfAborted();
    });

    const clientJobId = "22222222-2222-4222-8222-222222222222";
    const request = {
      headers: {},
      log: { error: vi.fn(), warn: vi.fn() },
      raw: {
        aborted: false,
        socket: { destroyed: false },
        once: vi.fn(),
        removeListener: vi.fn(),
      },
      parts: async function* () {
        yield { type: "file", filename: "scan.pdf", file: {} };
        yield { type: "field", fieldname: "settings", value: '{"quality":"fast"}' };
        yield { type: "field", fieldname: "clientJobId", value: clientJobId };
      },
    };

    await routeHandler?.(request, reply);

    expect(mocks.insertToolJobAlias).toHaveBeenCalledTimes(1);
    const stampedJobId = mocks.insertToolJobAlias.mock.calls[0][0].jobId as string;
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
    expect(mocks.deleteObject).toHaveBeenCalledWith("uploads/ocr-pdf-job/scan.pdf");
    expect(mocks.cancelSingleJobGuarded).toHaveBeenCalledWith({
      jobId: clientJobId,
      expectedArtifactJobId: stampedJobId,
    });
    expect(reply.payload).toBeUndefined();
  });

  it("cancels the enqueued PDF OCR job when the client closes during enqueue (#2238)", async () => {
    let routeHandler: ((request: unknown, reply: unknown) => Promise<unknown>) | undefined;
    registerOcrPdf({
      post: vi.fn((_path, handler) => {
        routeHandler = handler;
      }),
    } as never);

    let closeListener: (() => void) | undefined;
    const reply = {
      statusCode: 200,
      payload: undefined as unknown,
      raw: {
        destroyed: false,
        writableEnded: false,
        once: vi.fn((event: string, cb: () => void) => {
          if (event === "close") closeListener = cb;
        }),
        removeListener: vi.fn(),
      },
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      send(payload: unknown) {
        this.payload = payload;
        return payload;
      },
    };
    mocks.enqueueToolJob.mockImplementationOnce(async () => {
      reply.raw.destroyed = true;
      closeListener?.();
    });

    const request = {
      headers: {},
      log: { error: vi.fn(), warn: vi.fn() },
      raw: {
        aborted: false,
        socket: { destroyed: false },
        once: vi.fn(),
        removeListener: vi.fn(),
      },
      parts: async function* () {
        yield { type: "file", filename: "scan.pdf", file: {} };
        yield { type: "field", fieldname: "settings", value: '{"quality":"fast"}' };
      },
    };

    await routeHandler?.(request, reply);

    expect(mocks.enqueueToolJob).toHaveBeenCalledTimes(1);
    const enqueuedJobId = mocks.enqueueToolJob.mock.calls[0][0].jobId as string;
    expect(mocks.requestCancel).toHaveBeenCalledWith(enqueuedJobId);
  });

  it("discards the upload, settles the alias, and skips enqueueing when the client disconnects right after validation (#2238)", async () => {
    let routeHandler: ((request: unknown, reply: unknown) => Promise<unknown>) | undefined;
    registerOcrPdf({
      post: vi.fn((_path, handler) => {
        routeHandler = handler;
      }),
    } as never);

    let closeListener: (() => void) | undefined;
    const reply = {
      statusCode: 200,
      payload: undefined as unknown,
      raw: {
        destroyed: false,
        writableEnded: false,
        once: vi.fn((event: string, cb: () => void) => {
          if (event === "close") closeListener = cb;
        }),
        removeListener: vi.fn(),
      },
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      send(payload: unknown) {
        this.payload = payload;
        return payload;
      },
    };

    // Validation succeeds, then the client disconnects just as validatePdfPath resolves.
    mocks.validatePdfPath.mockImplementationOnce(async () => {
      reply.raw.destroyed = true;
      closeListener?.();
    });

    const clientJobId = "22222222-2222-4222-8222-222222222222";
    const request = {
      headers: {},
      log: { error: vi.fn(), warn: vi.fn() },
      raw: {
        aborted: false,
        socket: { destroyed: false },
        once: vi.fn(),
        removeListener: vi.fn(),
      },
      parts: async function* () {
        yield { type: "file", filename: "scan.pdf", file: {} };
        yield { type: "field", fieldname: "settings", value: '{"quality":"fast"}' };
        yield { type: "field", fieldname: "clientJobId", value: clientJobId };
      },
    };

    await routeHandler?.(request, reply);

    expect(mocks.insertToolJobAlias).toHaveBeenCalledTimes(1);
    const stampedJobId = mocks.insertToolJobAlias.mock.calls[0][0].jobId as string;
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
    expect(mocks.deleteObject).toHaveBeenCalledWith("uploads/ocr-pdf-job/scan.pdf");
    expect(mocks.cancelSingleJobGuarded).toHaveBeenCalledWith({
      jobId: clientJobId,
      expectedArtifactJobId: stampedJobId,
    });
  });

  it("rethrows a 429 quota rejection from enqueueToolJob after deleting the uploaded PDF when no jobs row was persisted (#2616)", async () => {
    const quotaErr = Object.assign(
      new Error("Too many concurrent AI jobs. Please wait for existing jobs to finish."),
      { statusCode: 429 },
    );
    const deleteErr = Object.assign(new Error("Access Denied"), { name: "AccessDenied" });
    mocks.enqueueToolJob.mockRejectedValueOnce(quotaErr);
    mocks.hasPersistedJobRow.mockResolvedValueOnce(false);
    mocks.deleteObject.mockRejectedValueOnce(deleteErr);

    let routeHandler: ((request: unknown, reply: unknown) => Promise<unknown>) | undefined;
    registerOcrPdf({
      post: vi.fn((_path, handler) => {
        routeHandler = handler;
      }),
    } as never);

    const warn = vi.fn();
    const request = {
      headers: {},
      log: { error: vi.fn(), warn },
      raw: {
        aborted: false,
        once: vi.fn(),
        removeListener: vi.fn(),
      },
      parts: async function* () {
        yield { type: "file", filename: "scan.pdf", file: {} };
        yield { type: "field", fieldname: "settings", value: '{"quality":"fast"}' };
        yield {
          type: "field",
          fieldname: "clientJobId",
          value: "22222222-2222-4222-8222-222222222222",
        };
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

    await expect(routeHandler?.(request, reply)).rejects.toBe(quotaErr);
    const enqueuedJobId = mocks.enqueueToolJob.mock.calls[0]?.[0]?.jobId as string;
    expect(enqueuedJobId).not.toBe("22222222-2222-4222-8222-222222222222");
    expect(mocks.hasPersistedJobRow).toHaveBeenCalledWith(enqueuedJobId, request.log);
    expect(mocks.deleteObject).toHaveBeenCalledWith("uploads/ocr-pdf-job/scan.pdf");
    expect(warn).toHaveBeenCalledWith(
      {
        err: deleteErr,
        jobId: enqueuedJobId,
        key: "uploads/ocr-pdf-job/scan.pdf",
      },
      "Failed to delete rejected upload",
    );
    expect(request.log.error).not.toHaveBeenCalled();
    expect(reply.payload).toBeUndefined();
  });

  it("keeps the uploaded PDF when enqueueToolJob fails after the durable jobs row was committed (#2616)", async () => {
    mocks.enqueueToolJob.mockRejectedValueOnce(new Error("Redis unavailable"));
    mocks.hasPersistedJobRow.mockResolvedValueOnce(true);

    let routeHandler: ((request: unknown, reply: unknown) => Promise<unknown>) | undefined;
    registerOcrPdf({
      post: vi.fn((_path, handler) => {
        routeHandler = handler;
      }),
    } as never);

    const request = {
      headers: {},
      log: { error: vi.fn(), warn: vi.fn() },
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

    await expect(routeHandler?.(request, reply)).resolves.toBeDefined();
    const enqueuedJobId = mocks.enqueueToolJob.mock.calls[0]?.[0]?.jobId as string;
    expect(mocks.hasPersistedJobRow).toHaveBeenCalledWith(enqueuedJobId, request.log);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(reply.statusCode).toBe(503);
    expect(reply.payload).toMatchObject({ error: "Failed to queue PDF OCR" });
  });

  it("keeps the uploaded PDF when the client disconnected during enqueue after the durable jobs row was committed (#2616)", async () => {
    mocks.hasPersistedJobRow.mockResolvedValueOnce(true);

    let routeHandler: ((request: unknown, reply: unknown) => Promise<unknown>) | undefined;
    registerOcrPdf({
      post: vi.fn((_path, handler) => {
        routeHandler = handler;
      }),
    } as never);

    const clientJobId = "22222222-2222-4222-8222-222222222222";
    const reply = {
      statusCode: 200,
      payload: undefined as unknown,
      raw: { destroyed: false, writableEnded: false, once: vi.fn(), removeListener: vi.fn() },
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      send(payload: unknown) {
        this.payload = payload;
        return payload;
      },
    };
    mocks.enqueueToolJob.mockImplementationOnce(async () => {
      reply.raw.destroyed = true;
      throw new Error("Redis unavailable");
    });

    const request = {
      headers: {},
      log: { error: vi.fn(), warn: vi.fn() },
      raw: {
        aborted: false,
        socket: { destroyed: false },
        once: vi.fn(),
        removeListener: vi.fn(),
      },
      parts: async function* () {
        yield { type: "file", filename: "scan.pdf", file: {} };
        yield { type: "field", fieldname: "settings", value: '{"quality":"fast"}' };
        yield { type: "field", fieldname: "clientJobId", value: clientJobId };
      },
    };

    await routeHandler?.(request, reply);

    const enqueuedJobId = mocks.enqueueToolJob.mock.calls[0]?.[0]?.jobId as string;
    expect(enqueuedJobId).not.toBe(clientJobId);
    expect(mocks.hasPersistedJobRow).toHaveBeenCalledWith(enqueuedJobId, request.log);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.cancelSingleJobGuarded).toHaveBeenCalledWith({
      jobId: clientJobId,
      expectedArtifactJobId: enqueuedJobId,
    });
    expect(reply.payload).toBeUndefined();
  });

  it("discards the uploaded PDF and settles the alias when the client disconnected during enqueue before the durable jobs row was committed (#2616)", async () => {
    mocks.hasPersistedJobRow.mockResolvedValueOnce(false);

    let routeHandler: ((request: unknown, reply: unknown) => Promise<unknown>) | undefined;
    registerOcrPdf({
      post: vi.fn((_path, handler) => {
        routeHandler = handler;
      }),
    } as never);

    const clientJobId = "22222222-2222-4222-8222-222222222222";
    const reply = {
      statusCode: 200,
      payload: undefined as unknown,
      raw: { destroyed: false, writableEnded: false, once: vi.fn(), removeListener: vi.fn() },
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      send(payload: unknown) {
        this.payload = payload;
        return payload;
      },
    };
    mocks.enqueueToolJob.mockImplementationOnce(async () => {
      reply.raw.destroyed = true;
      throw Object.assign(new Error("Too many concurrent AI jobs"), { statusCode: 429 });
    });

    const request = {
      headers: {},
      log: { error: vi.fn(), warn: vi.fn() },
      raw: {
        aborted: false,
        socket: { destroyed: false },
        once: vi.fn(),
        removeListener: vi.fn(),
      },
      parts: async function* () {
        yield { type: "file", filename: "scan.pdf", file: {} };
        yield { type: "field", fieldname: "settings", value: '{"quality":"fast"}' };
        yield { type: "field", fieldname: "clientJobId", value: clientJobId };
      },
    };

    await routeHandler?.(request, reply);

    const enqueuedJobId = mocks.enqueueToolJob.mock.calls[0]?.[0]?.jobId as string;
    expect(mocks.hasPersistedJobRow).toHaveBeenCalledWith(enqueuedJobId, request.log);
    expect(mocks.deleteObject).toHaveBeenCalledWith("uploads/ocr-pdf-job/scan.pdf");
    expect(mocks.cancelSingleJobGuarded).toHaveBeenCalledWith({
      jobId: clientJobId,
      expectedArtifactJobId: enqueuedJobId,
    });
    expect(reply.payload).toBeUndefined();
  });

  it("deletes the uploaded PDF and logs a warning if deleteObject rejects when insertToolJobAlias throws (#2616)", async () => {
    const aliasFault = new Error("DB alias insert failed");
    const deleteErr = Object.assign(new Error("Access Denied"), { name: "AccessDenied" });
    mocks.insertToolJobAlias.mockRejectedValueOnce(aliasFault);
    mocks.deleteObject.mockRejectedValueOnce(deleteErr);

    let routeHandler: ((request: unknown, reply: unknown) => Promise<unknown>) | undefined;
    registerOcrPdf({
      post: vi.fn((_path, handler) => {
        routeHandler = handler;
      }),
    } as never);

    const warn = vi.fn();
    const request = {
      headers: {},
      log: { error: vi.fn(), warn },
      raw: {
        aborted: false,
        once: vi.fn(),
        removeListener: vi.fn(),
      },
      parts: async function* () {
        yield { type: "file", filename: "scan.pdf", file: {} };
        yield {
          type: "field",
          fieldname: "clientJobId",
          value: "22222222-2222-4222-8222-222222222222",
        };
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

    await expect(routeHandler?.(request, reply)).rejects.toBe(aliasFault);
    expect(mocks.deleteObject).toHaveBeenCalledWith("uploads/ocr-pdf-job/scan.pdf");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      {
        err: deleteErr,
        jobId: expect.any(String),
        key: "uploads/ocr-pdf-job/scan.pdf",
      },
      "Failed to delete rejected upload",
    );
  });

  describe("storeValidatedOcrPdf rollback logging (#2837)", () => {
    const existingFilePath = fileURLToPath(import.meta.url);

    it("logs a warning with { err, key } via opts.log and rethrows the primary error when deleteObject rejects after putObjectStream fails", async () => {
      const storeErr = new Error("S3 stream failed");
      const deleteErr = Object.assign(new Error("Access Denied"), { name: "AccessDenied" });
      mocks.putObjectStream.mockImplementationOnce(async (_key: string, stream: Readable) => {
        stream.destroy();
        throw storeErr;
      });
      mocks.deleteObject.mockRejectedValueOnce(deleteErr);
      const log = { warn: vi.fn() };

      await expect(
        storeValidatedOcrPdf(
          { path: existingFilePath, filename: "scan.pdf", size: 42 },
          "uploads/ocr-pdf-job/scan.pdf",
          { maxBytes: 1024, log },
        ),
      ).rejects.toBe(storeErr);

      expect(mocks.deleteObject).toHaveBeenCalledWith("uploads/ocr-pdf-job/scan.pdf");
      expect(log.warn).toHaveBeenCalledTimes(1);
      expect(log.warn).toHaveBeenCalledWith(
        { err: deleteErr, key: "uploads/ocr-pdf-job/scan.pdf" },
        "Failed to delete failed OCR PDF upload",
      );
    });

    it("falls back to the process logger when opts.log is omitted and deleteObject rejects after a size mismatch", async () => {
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
      const deleteErr = Object.assign(new Error("Access Denied"), { name: "AccessDenied" });
      mocks.putObjectStream.mockImplementationOnce(async (_key: string, stream: Readable) => {
        stream.destroy();
        return 10;
      });
      mocks.deleteObject.mockRejectedValueOnce(deleteErr);

      try {
        await expect(
          storeValidatedOcrPdf(
            { path: existingFilePath, filename: "scan.pdf", size: 42 },
            "uploads/ocr-pdf-job/scan.pdf",
            { maxBytes: 1024 },
          ),
        ).rejects.toThrow("OCR PDF scratch file changed size (42 to 10 bytes)");

        expect(mocks.deleteObject).toHaveBeenCalledWith("uploads/ocr-pdf-job/scan.pdf");
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(
          { err: deleteErr, key: "uploads/ocr-pdf-job/scan.pdf" },
          "Failed to delete failed OCR PDF upload",
        );
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe("OCR PDF route rollback delete logging (#2837)", () => {
    it.each([
      [
        "multipart parse error after upload",
        async function* () {
          yield { type: "file", filename: "scan.pdf", file: {} };
          yield { type: "file", filename: "second.pdf", file: {} };
        },
        undefined,
        400,
        {
          error: "Failed to parse multipart request",
          details: "Only one PDF file may be uploaded",
        },
      ],
      [
        "invalid clientJobId",
        async function* () {
          yield { type: "file", filename: "scan.pdf", file: {} };
          yield { type: "field", fieldname: "clientJobId", value: "../bad" };
        },
        undefined,
        400,
        { error: INVALID_CLIENT_JOB_ID_ERROR },
      ],
      [
        "invalid saveMode",
        async function* () {
          yield { type: "file", filename: "scan.pdf", file: {} };
          yield { type: "field", fieldname: "saveMode", value: "invalid" };
        },
        undefined,
        400,
        { error: INVALID_SAVE_MODE_ERROR },
      ],
      [
        "schema-invalid settings",
        async function* () {
          yield { type: "file", filename: "scan.pdf", file: {} };
          yield { type: "field", fieldname: "settings", value: '{"quality":"ultra"}' };
        },
        undefined,
        400,
        { error: "Invalid settings" },
      ],
      [
        "malformed JSON settings",
        async function* () {
          yield { type: "file", filename: "scan.pdf", file: {} };
          yield { type: "field", fieldname: "settings", value: "{bad-json" };
        },
        undefined,
        400,
        { error: "Settings must be valid JSON" },
      ],
      [
        "unavailable OCR runtime capability",
        async function* () {
          yield { type: "file", filename: "scan.pdf", file: {} };
          yield { type: "field", fieldname: "settings", value: '{"quality":"best"}' };
        },
        undefined,
        501,
        { error: "Feature not installed" },
      ],
      [
        "PDF validation failure",
        async function* () {
          yield { type: "file", filename: "scan.pdf", file: {} };
          yield { type: "field", fieldname: "settings", value: '{"quality":"fast"}' };
        },
        () => {
          mocks.validatePdfPath.mockRejectedValueOnce(new InputValidationError("Damaged PDF"));
        },
        400,
        { error: "Damaged PDF" },
      ],
      [
        "enqueue failure",
        async function* () {
          yield { type: "file", filename: "scan.pdf", file: {} };
          yield { type: "field", fieldname: "settings", value: '{"quality":"fast"}' };
        },
        () => {
          mocks.enqueueToolJob.mockRejectedValueOnce(new Error("Redis unavailable"));
        },
        503,
        { error: "Failed to queue PDF OCR" },
      ],
    ])(
      "logs a warning with { err, jobId, key } and keeps the primary %s response when deleteObject rejects",
      async (_label, parts, setupFault, expectedStatus, expectedPayload) => {
        let routeHandler: ((request: unknown, reply: unknown) => Promise<unknown>) | undefined;
        registerOcrPdf({
          post: vi.fn((_path, handler) => {
            routeHandler = handler;
          }),
        } as never);

        const deleteErr = Object.assign(new Error("Access Denied"), { name: "AccessDenied" });
        mocks.deleteObject.mockRejectedValueOnce(deleteErr);
        setupFault?.();

        const warn = vi.fn();
        const request = {
          headers: {},
          log: { error: vi.fn(), warn },
          raw: {
            aborted: false,
            once: vi.fn(),
            removeListener: vi.fn(),
          },
          parts,
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

        await routeHandler?.(request, reply);

        expect(reply.statusCode).toBe(expectedStatus);
        expect(reply.payload).toMatchObject(expectedPayload);
        expect(mocks.deleteObject).toHaveBeenCalledWith("uploads/ocr-pdf-job/scan.pdf");
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(
          {
            err: deleteErr,
            jobId: expect.any(String),
            key: "uploads/ocr-pdf-job/scan.pdf",
          },
          "Failed to delete rejected upload",
        );
      },
    );

    it("logs a warning with { err, jobId, key } and still rethrows a 503 storage fault when copyObjectToFile and deleteObject both reject", async () => {
      let routeHandler: ((request: unknown, reply: unknown) => Promise<unknown>) | undefined;
      registerOcrPdf({
        post: vi.fn((_path, handler) => {
          routeHandler = handler;
        }),
      } as never);

      const copyFault = Object.assign(new Error("Storage unavailable"), {
        statusCode: 503,
        code: "storage-unavailable",
      });
      const deleteErr = Object.assign(new Error("Access Denied"), { name: "AccessDenied" });
      mocks.copyObjectToFile.mockRejectedValueOnce(copyFault);
      mocks.deleteObject.mockRejectedValueOnce(deleteErr);

      const warn = vi.fn();
      const request = {
        headers: {},
        log: { error: vi.fn(), warn },
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

      await expect(routeHandler?.(request, reply)).rejects.toBe(copyFault);
      expect(reply.payload).toBeUndefined();
      expect(mocks.deleteObject).toHaveBeenCalledWith("uploads/ocr-pdf-job/scan.pdf");
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        {
          err: deleteErr,
          jobId: expect.any(String),
          key: "uploads/ocr-pdf-job/scan.pdf",
        },
        "Failed to delete rejected upload",
      );
    });
  });
});
