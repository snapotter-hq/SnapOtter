import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  insertToolJobAlias: vi.fn(),
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
  mocks.cancelSingleJobGuarded.mockResolvedValue(undefined);
  mocks.deleteObject.mockResolvedValue(undefined);
  mocks.enqueueToolJob.mockResolvedValue(undefined);
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
});
