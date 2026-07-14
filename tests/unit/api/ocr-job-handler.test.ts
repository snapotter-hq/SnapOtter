import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteObject: vi.fn(),
  enqueueToolJob: vi.fn(),
  extractText: vi.fn(),
  getAuthUser: vi.fn(),
  getOcrRuntimeCapability: vi.fn(),
  prepare: vi.fn(),
  receiveUpload: vi.fn(),
  waitForJob: vi.fn(),
}));

vi.mock("@snapotter/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@snapotter/ai")>();
  return {
    ...actual,
    extractText: mocks.extractText,
    getOcrRuntimeCapability: mocks.getOcrRuntimeCapability,
  };
});

vi.mock("../../../apps/api/src/modality/input-handler.js", () => ({
  inputHandlerFor: () => ({ prepare: mocks.prepare }),
}));

vi.mock("../../../apps/api/src/jobs/enqueue.js", () => ({
  enqueueToolJob: mocks.enqueueToolJob,
  waitForJob: mocks.waitForJob,
}));

vi.mock("../../../apps/api/src/lib/object-storage.js", () => ({
  deleteObject: mocks.deleteObject,
}));

vi.mock("../../../apps/api/src/lib/upload-stream.js", () => ({
  receiveUpload: mocks.receiveUpload,
}));

vi.mock("../../../apps/api/src/plugins/auth.js", () => ({
  getAuthUser: mocks.getAuthUser,
}));

vi.mock("../../../apps/api/src/permissions.js", () => ({
  requireToolAccess: vi.fn(async () => ({ id: "user-1" })),
}));

import { env } from "../../../apps/api/src/config.js";
import { runAiToolJob } from "../../../apps/api/src/jobs/ai-handlers.js";
import type { ToolJobData } from "../../../apps/api/src/jobs/types.js";
import type { ToolProcessCtx } from "../../../apps/api/src/routes/tool-factory.js";
import { registerOcr } from "../../../apps/api/src/routes/tools/ocr.js";

const INPUT = Buffer.from("uploaded");
const NORMALIZED = Buffer.from("normalized");

function job(): ToolJobData {
  return {
    jobId: "ocr-job",
    toolId: "ocr",
    userId: null,
    pool: "ai",
    inputRefs: ["uploads/ocr-job/scan.heic"],
    filename: "scan.heic",
    settings: { quality: "fast", language: "en", enhance: true },
    kind: "ai-tool",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOcrRuntimeCapability.mockReturnValue({
    available: true,
    qualities: ["balanced", "best"],
    providers: ["CPUExecutionProvider"],
  });
  mocks.getAuthUser.mockReturnValue({ id: "user-1" });
  mocks.deleteObject.mockResolvedValue(undefined);
  mocks.enqueueToolJob.mockResolvedValue(undefined);
  mocks.waitForJob.mockResolvedValue(null);
  mocks.receiveUpload.mockResolvedValue({
    key: "uploads/ocr-job/scan.png",
    filename: "scan.png",
    size: 5,
  });
  mocks.prepare.mockResolvedValue({ buffer: NORMALIZED, filename: "scan.png" });
  mocks.extractText.mockResolvedValue({
    text: "SnapOtter",
    engine: "tesseract",
    requestedQuality: "fast",
    actualQuality: "fast",
    device: "cpu",
    provider: "tesseract",
    degraded: false,
    warnings: [],
  });
});

describe("OCR route enqueue safety", () => {
  it("acknowledges long-running OCR without entering the synchronous wait window", async () => {
    let routeHandler: ((request: unknown, reply: unknown) => Promise<unknown>) | undefined;
    registerOcr({
      post: vi.fn((_path, handler) => {
        routeHandler = handler;
      }),
    } as never);

    const request = {
      headers: {},
      log: { error: vi.fn(), info: vi.fn() },
      parts: async function* () {
        yield { type: "file", filename: "scan.png", file: {} };
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

    expect(reply.statusCode).toBe(202);
    expect(reply.payload).toMatchObject({
      jobId: expect.any(String),
      async: true,
    });
    expect(mocks.enqueueToolJob).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: expect.any(String), toolId: "ocr", pool: "ai" }),
    );
    expect(mocks.waitForJob).not.toHaveBeenCalled();
  });

  it("preserves storage-pressure failures as a truthful 503 response", async () => {
    mocks.receiveUpload.mockRejectedValueOnce(
      Object.assign(new Error("Upload storage is below its free-space reserve"), {
        statusCode: 503,
      }),
    );

    let routeHandler: ((request: unknown, reply: unknown) => Promise<unknown>) | undefined;
    registerOcr({
      post: vi.fn((_path, handler) => {
        routeHandler = handler;
      }),
    } as never);

    const request = {
      headers: {},
      log: { error: vi.fn(), info: vi.fn() },
      parts: async function* () {
        yield { type: "file", filename: "scan.png", file: {} };
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

    expect(reply.statusCode).toBe(503);
    expect(reply.payload).toMatchObject({
      error: "Upload storage unavailable",
      details: "Upload storage is below its free-space reserve",
    });
  });

  it("cleans up a bounded upload when enqueueing fails", async () => {
    const originalLimit = env.MAX_UPLOAD_SIZE_MB;
    env.MAX_UPLOAD_SIZE_MB = 0;
    mocks.enqueueToolJob.mockRejectedValueOnce(new Error("Redis unavailable"));

    let routeHandler: ((request: unknown, reply: unknown) => Promise<unknown>) | undefined;
    registerOcr({
      post: vi.fn((_path, handler) => {
        routeHandler = handler;
      }),
    } as never);

    const filePart = { type: "file", filename: "scan.png", file: {} };
    const request = {
      headers: {},
      log: { error: vi.fn(), info: vi.fn() },
      parts: async function* () {
        yield filePart;
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

    try {
      await expect(routeHandler?.(request, reply)).resolves.toBeDefined();
    } finally {
      env.MAX_UPLOAD_SIZE_MB = originalLimit;
    }

    expect(mocks.receiveUpload).toHaveBeenCalledWith(filePart, expect.any(String), {
      maxBytes: 512 * 1024 * 1024,
    });
    expect(mocks.deleteObject).toHaveBeenCalledWith("uploads/ocr-job/scan.png");
    expect(reply.statusCode).toBe(503);
    expect(reply.payload).toMatchObject({ error: "Failed to queue OCR" });
  });
});

describe("OCR AI job handler resource controls", () => {
  it.each([
    ["balanced", false],
    ["best", true],
  ] as const)("defaults %s enhancement consistently with the UI", async (quality, enhance) => {
    const data = job();
    data.settings = { quality, language: "en" };
    mocks.extractText.mockResolvedValueOnce({
      text: "SnapOtter",
      engine: "rapidocr-onnx",
      requestedQuality: quality,
      actualQuality: quality,
      device: "cpu",
      provider: "CPUExecutionProvider",
      degraded: false,
      warnings: [],
    });

    await runAiToolJob(data, INPUT, {
      scratchDir: "/tmp/ocr-job",
      signal: new AbortController().signal,
      report: vi.fn(),
    });

    expect(mocks.extractText).toHaveBeenCalledWith(
      NORMALIZED,
      "/tmp/ocr-job",
      expect.objectContaining({ quality, enhance }),
      expect.any(Function),
    );
  });

  it("normalizes inside the worker with the OCR pixel cap and job signal", async () => {
    const controller = new AbortController();
    const ctx: ToolProcessCtx = {
      scratchDir: "/tmp/ocr-job",
      signal: controller.signal,
      report: vi.fn(),
    };
    mocks.extractText.mockImplementationOnce(async (_input, _scratch, _options, report) => {
      report(0, "starting");
      report(50, "recognizing");
      report(100, "complete");
      return {
        text: "SnapOtter",
        engine: "tesseract",
        requestedQuality: "fast",
        actualQuality: "fast",
        device: "cpu",
        provider: "tesseract",
        degraded: false,
        warnings: [],
      };
    });

    const result = await runAiToolJob(job(), INPUT, ctx);

    expect(mocks.prepare).toHaveBeenCalledWith(INPUT, "scan.heic", {
      scratchDir: "/tmp/ocr-job",
      maxDimension: 40_000,
      maxPixels: 40_000_000,
      signal: controller.signal,
    });
    expect(mocks.extractText).toHaveBeenCalledWith(
      NORMALIZED,
      "/tmp/ocr-job",
      expect.objectContaining({
        quality: "fast",
        language: "en",
        enhance: true,
        signal: controller.signal,
      }),
      expect.any(Function),
    );
    expect(result).toMatchObject({
      filename: "scan_ocr.txt",
      contentType: "text/plain",
      resultPayload: { text: "SnapOtter", actualQuality: "fast" },
    });
    expect(vi.mocked(ctx.report).mock.calls.map(([percent]) => percent)).toEqual([
      2, 10, 10, 55, 100,
    ]);
  });

  it("does not start image preparation for an already-canceled job", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      runAiToolJob(job(), INPUT, {
        scratchDir: "/tmp/ocr-job",
        signal: controller.signal,
        report: vi.fn(),
      }),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.extractText).not.toHaveBeenCalled();
  });
});
