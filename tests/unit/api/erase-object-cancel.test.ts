import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runAiToolJob } from "../../../apps/api/src/jobs/ai-handlers.js";
import type { ToolJobData } from "../../../apps/api/src/jobs/types.js";
import type { ToolProcessCtx } from "../../../apps/api/src/routes/tool-factory.js";
import { registerEraseObject } from "../../../apps/api/src/routes/tools/erase-object.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

const mocks = vi.hoisted(() => ({
  cancelSingleJobGuarded: vi.fn(),
  containerMemoryLimitBytes: vi.fn<() => number | null>(() => null),
  deleteObject: vi.fn(),
  enqueueToolJob: vi.fn(),
  getObjectBuffer: vi.fn(),
  inpaint: vi.fn(),
  insertToolJobAlias: vi.fn(),
  isGpuAvailable: vi.fn<(framework?: string) => boolean>(() => false),
  isStorageServiceFault: vi.fn<(_err: unknown) => boolean>(() => false),
  isToolInstalled: vi.fn(),
  putObject: vi.fn(),
  receiveUpload: vi.fn(),
  requestCancel: vi.fn(),
}));

vi.mock("@snapotter/ai", () => ({
  inpaint: mocks.inpaint,
  isGpuAvailable: mocks.isGpuAvailable,
}));

vi.mock("../../../apps/api/src/lib/hq-memory-gate.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/lib/hq-memory-gate.js")>()),
  containerMemoryLimitBytes: mocks.containerMemoryLimitBytes,
}));

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

vi.mock("../../../apps/api/src/lib/feature-status.js", () => ({
  isFeatureInstalled: vi.fn(() => true),
  isToolInstalled: mocks.isToolInstalled,
}));

vi.mock("../../../apps/api/src/lib/upload-stream.js", () => ({
  receiveUpload: mocks.receiveUpload,
}));

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>()),
  deleteObject: mocks.deleteObject,
  getObjectBuffer: mocks.getObjectBuffer,
  isStorageServiceFault: mocks.isStorageServiceFault,
  putObject: mocks.putObject,
}));

const PNG = readFixture(fixtures.image.base.png200);
const MASK = Buffer.from("mask-bytes");
const SCRATCH_DIR = join(tmpdir(), "snapotter-erase-object-cancel-test");

const job: ToolJobData = {
  jobId: "job-erase-object",
  toolId: "erase-object",
  userId: null,
  pool: "ai",
  inputRefs: ["uploads/job-erase-object/photo.png", "uploads/job-erase-object/mask.png"],
  filename: "photo.png",
  settings: { format: "png", qualityMode: "fast" },
  kind: "ai-tool",
};

let routeHandler: ((request: unknown, reply: unknown) => Promise<unknown>) | undefined;

beforeAll(() => {
  registerEraseObject({
    post: vi.fn(
      (_path: string, handler: (request: unknown, reply: unknown) => Promise<unknown>) => {
        routeHandler = handler;
      },
    ),
  } as unknown as FastifyInstance);
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.containerMemoryLimitBytes.mockReturnValue(null);
  mocks.isGpuAvailable.mockImplementation(() => false);
  mocks.isStorageServiceFault.mockReturnValue(false);
  mocks.isToolInstalled.mockReturnValue(true);
  mocks.getObjectBuffer.mockResolvedValue(MASK);
  mocks.inpaint.mockResolvedValue(PNG);
  mocks.putObject.mockResolvedValue(undefined);
  mocks.deleteObject.mockResolvedValue(undefined);
  mocks.insertToolJobAlias.mockResolvedValue(undefined);
  mocks.cancelSingleJobGuarded.mockResolvedValue(undefined);
  mocks.enqueueToolJob.mockResolvedValue(undefined);
  mocks.requestCancel.mockResolvedValue(true);
});

describe("erase-object honors a job cancel (#2092)", () => {
  // A cancel or worker timeout aborts ctx.signal. Without forwarding it the
  // sidecar keeps inpainting a job that is already dead.
  it("forwards ctx.signal to the sidecar call", async () => {
    const ctx: ToolProcessCtx = {
      signal: new AbortController().signal,
      scratchDir: SCRATCH_DIR,
      report: vi.fn(),
    };

    await runAiToolJob(job, PNG, ctx);

    expect(mocks.inpaint).toHaveBeenCalledWith(
      PNG,
      MASK,
      SCRATCH_DIR,
      expect.any(Function),
      "fast",
      { signal: ctx.signal },
    );
  });

  it("normalizes S3 GetObject faults on the mask read into a 503 storage-unavailable SafeError (#3467)", async () => {
    const ctx: ToolProcessCtx = {
      signal: new AbortController().signal,
      scratchDir: SCRATCH_DIR,
      report: vi.fn(),
    };
    const slowDown = Object.assign(new Error("Please reduce your request rate."), {
      name: "SlowDown",
      $metadata: { httpStatusCode: 503 },
    });
    mocks.isStorageServiceFault.mockReturnValue(true);
    mocks.getObjectBuffer.mockRejectedValueOnce(slowDown);

    const err = await runAiToolJob(job, PNG, ctx).catch((e: unknown) => e);
    expect(err).toMatchObject({
      name: "SafeError",
      isSafeMessage: true,
      kind: "operational",
      code: "storage-unavailable",
      statusCode: 503,
      message: "The server's storage service is unavailable.",
      cause: slowDown,
    });
    expect(mocks.inpaint).not.toHaveBeenCalled();

    // Unexpected non-S3 defect passes through normalizeS3ReadFault and wraps as a bug SafeError
    const unexpectedBug = new TypeError("unexpected S3 client defect");
    mocks.getObjectBuffer.mockRejectedValueOnce(unexpectedBug);
    const bugErr = await runAiToolJob(job, PNG, ctx).catch((e: unknown) => e);
    expect(bugErr).toMatchObject({
      name: "SafeError",
      isSafeMessage: true,
      kind: "bug",
      code: "png",
      message: "Object erasing failed",
      cause: unexpectedBug,
    });

    // Local-mode EIO (isStorageServiceFault === false) bypasses normalizeS3ReadFault
    mocks.isStorageServiceFault.mockReturnValue(false);
    const localEio = Object.assign(new Error("local disk read error"), {
      code: "EIO",
      syscall: "read",
    });
    mocks.getObjectBuffer.mockRejectedValueOnce(localEio);
    const localErr = await runAiToolJob(job, PNG, ctx).catch((e: unknown) => e);
    expect(localErr).toMatchObject({
      name: "SafeError",
      isSafeMessage: true,
      kind: "bug",
      code: "png",
      message: "Object erasing failed",
      cause: localEio,
    });
  });
});

describe("erase-object route disconnect handling (#2238)", () => {
  it("discards both uploads, settles the alias, and skips decoding and enqueueing when the client disconnected before validation", async () => {
    mocks.getObjectBuffer.mockResolvedValue(PNG);
    mocks.receiveUpload
      .mockResolvedValueOnce({
        key: "uploads/erase-job/photo.png",
        filename: "photo.png",
        size: PNG.length,
      })
      .mockResolvedValueOnce({
        key: "uploads/erase-job/mask.png",
        filename: "mask.png",
        size: PNG.length,
      });

    const clientJobId = "33333333-3333-4333-8333-333333333333";
    const request = {
      headers: {},
      log: { error: vi.fn(), warn: vi.fn() },
      raw: { socket: { destroyed: true } },
      parts: async function* () {
        yield { type: "file", fieldname: "file", filename: "photo.png", file: {} };
        yield { type: "file", fieldname: "mask", filename: "mask.png", file: {} };
        yield { type: "field", fieldname: "clientJobId", value: clientJobId };
      },
    };
    const reply = {
      statusCode: 200,
      payload: undefined as unknown,
      raw: { destroyed: true, writableEnded: false, once: vi.fn(), removeListener: vi.fn() },
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

    expect(mocks.insertToolJobAlias).toHaveBeenCalledTimes(1);
    const stampedJobId = mocks.insertToolJobAlias.mock.calls[0][0].jobId as string;
    expect(mocks.getObjectBuffer).not.toHaveBeenCalled();
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
    expect(mocks.deleteObject).toHaveBeenCalledWith("uploads/erase-job/photo.png");
    expect(mocks.deleteObject).toHaveBeenCalledWith("uploads/erase-job/mask.png");
    expect(mocks.cancelSingleJobGuarded).toHaveBeenCalledWith({
      jobId: clientJobId,
      expectedArtifactJobId: stampedJobId,
    });
    expect(reply.payload).toBeUndefined();
  });

  it("discards all uploaded and decoded keys when the client disconnects while writing decoded inputs", async () => {
    mocks.getObjectBuffer.mockResolvedValue(PNG);
    mocks.receiveUpload
      .mockResolvedValueOnce({
        key: "uploads/erase-job/1-photo.png",
        filename: "photo.png",
        size: PNG.length,
      })
      .mockResolvedValueOnce({
        key: "uploads/erase-job/mask.png",
        filename: "mask.png",
        size: PNG.length,
      });

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
    mocks.putObject.mockImplementationOnce(async () => {
      reply.raw.destroyed = true;
      closeListener?.();
    });

    const clientJobId = "44444444-4444-4444-8444-444444444444";
    const request = {
      headers: {},
      log: { error: vi.fn(), warn: vi.fn() },
      raw: { socket: { destroyed: false } },
      parts: async function* () {
        yield { type: "file", fieldname: "file", filename: "photo.png", file: {} };
        yield { type: "file", fieldname: "mask", filename: "mask.png", file: {} };
        yield { type: "field", fieldname: "clientJobId", value: clientJobId };
      },
    };

    await routeHandler?.(request, reply);

    expect(mocks.insertToolJobAlias).toHaveBeenCalledTimes(1);
    const stampedJobId = mocks.insertToolJobAlias.mock.calls[0][0].jobId as string;
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
    expect(mocks.deleteObject).toHaveBeenCalledWith("uploads/erase-job/1-photo.png");
    expect(mocks.deleteObject).toHaveBeenCalledWith(`uploads/${stampedJobId}/photo.png`);
    expect(mocks.deleteObject).toHaveBeenCalledWith("uploads/erase-job/mask.png");
    expect(mocks.cancelSingleJobGuarded).toHaveBeenCalledWith({
      jobId: clientJobId,
      expectedArtifactJobId: stampedJobId,
    });
  });

  it("cancels the enqueued job when the client closes during enqueue", async () => {
    mocks.getObjectBuffer.mockResolvedValue(PNG);
    mocks.receiveUpload
      .mockResolvedValueOnce({
        key: "uploads/erase-job/photo.png",
        filename: "photo.png",
        size: PNG.length,
      })
      .mockResolvedValueOnce({
        key: "uploads/erase-job/mask.png",
        filename: "mask.png",
        size: PNG.length,
      });

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
      raw: { socket: { destroyed: false } },
      parts: async function* () {
        yield { type: "file", fieldname: "file", filename: "photo.png", file: {} };
        yield { type: "file", fieldname: "mask", filename: "mask.png", file: {} };
      },
    };

    await routeHandler?.(request, reply);

    expect(mocks.enqueueToolJob).toHaveBeenCalledTimes(1);
    const enqueuedJobId = mocks.enqueueToolJob.mock.calls[0][0].jobId as string;
    expect(mocks.requestCancel).toHaveBeenCalledWith(enqueuedJobId);
  });

  it("queries isGpuAvailable('torch') before hqCpuMemoryRefusal so an ONNX-only GPU does not bypass the 8 GB CPU container floor (issue #2576)", async () => {
    mocks.getObjectBuffer.mockResolvedValue(PNG);
    mocks.receiveUpload
      .mockResolvedValueOnce({
        key: "uploads/erase-job/photo.png",
        filename: "photo.png",
        size: PNG.length,
      })
      .mockResolvedValueOnce({
        key: "uploads/erase-job/mask.png",
        filename: "mask.png",
        size: PNG.length,
      });
    // Simulate ONNX-only GPU: unscoped isGpuAvailable() returns true, but isGpuAvailable("torch") returns false.
    mocks.isGpuAvailable.mockImplementation((framework?: string) => framework !== "torch");
    mocks.containerMemoryLimitBytes.mockReturnValue(6 * 1024 ** 3);

    const request = {
      headers: {},
      log: { error: vi.fn(), warn: vi.fn() },
      raw: { socket: { destroyed: false } },
      parts: async function* () {
        yield { type: "file", fieldname: "file", filename: "photo.png", file: {} };
        yield { type: "file", fieldname: "mask", filename: "mask.png", file: {} };
        yield { type: "field", fieldname: "qualityMode", value: "hq" };
      },
    };
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

    await routeHandler?.(request, reply);

    expect(mocks.isGpuAvailable).toHaveBeenCalledWith("torch");
    expect(reply.statusCode).toBe(422);
    expect(reply.payload).toMatchObject({
      error: "Not enough memory for HQ mode",
      details: expect.stringContaining("8g"),
    });
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
  });
});
