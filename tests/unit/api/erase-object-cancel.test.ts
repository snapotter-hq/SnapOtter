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
  deleteObject: vi.fn(),
  enqueueToolJob: vi.fn(),
  getObjectBuffer: vi.fn(),
  inpaint: vi.fn(),
  insertToolJobAlias: vi.fn(),
  isToolInstalled: vi.fn(),
  putObject: vi.fn(),
  receiveUpload: vi.fn(),
  requestCancel: vi.fn(),
}));

vi.mock("@snapotter/ai", () => ({
  inpaint: mocks.inpaint,
  isGpuAvailable: vi.fn(() => false),
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
});
