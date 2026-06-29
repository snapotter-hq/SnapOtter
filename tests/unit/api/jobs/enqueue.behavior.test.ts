import { afterEach, describe, expect, it, vi } from "vitest";

const insertedValues = vi.hoisted(() => vi.fn());
const queueAdd = vi.hoisted(() => vi.fn());
const getJob = vi.hoisted(() => vi.fn());
const queueEventClose = vi.hoisted(() => vi.fn());
const flowProducerClose = vi.hoisted(() => vi.fn());

async function loadEnqueueModule() {
  vi.resetModules();
  insertedValues.mockReset();
  queueAdd.mockReset();
  getJob.mockReset();
  queueEventClose.mockReset();
  flowProducerClose.mockReset();

  queueAdd.mockResolvedValue({ id: "job-1" });
  queueEventClose.mockResolvedValue(undefined);
  flowProducerClose.mockResolvedValue(undefined);

  vi.doMock("bullmq", () => ({
    QueueEvents: vi.fn(() => ({
      close: queueEventClose,
      waitUntilReady: vi.fn().mockResolvedValue(undefined),
    })),
    FlowProducer: vi.fn(() => ({
      close: flowProducerClose,
    })),
  }));

  vi.doMock("../../../../apps/api/src/config.js", () => ({
    env: { SYNC_WAIT_MS: 50 },
  }));

  vi.doMock("../../../../apps/api/src/db/index.js", () => ({
    db: {
      insert: vi.fn(() => ({
        values: insertedValues.mockResolvedValue(undefined),
      })),
    },
    schema: {
      jobs: {},
    },
  }));

  vi.doMock("../../../../apps/api/src/jobs/connection.js", () => ({
    createBullMQConnection: vi.fn(() => ({ mocked: "connection" })),
  }));

  vi.doMock("../../../../apps/api/src/jobs/queues.js", () => ({
    getQueue: vi.fn(() => ({
      add: queueAdd,
      getJob,
    })),
  }));

  return import("../../../../apps/api/src/jobs/enqueue.js");
}

describe("job enqueue helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("strips NUL bytes recursively before persisting settings but keeps queue data intact", async () => {
    const { enqueueToolJob } = await loadEnqueueModule();
    const data = {
      jobId: "job-1",
      userId: null,
      toolId: "tool-a",
      pool: "image",
      kind: "single",
      inputRefs: ["uploads/job-1/input.png"],
      filename: "input.png",
      settings: {
        title: "a\0b",
        nested: { value: "c\0d" },
        list: ["e\0f", 1],
      },
    } as never;

    await enqueueToolJob(data);

    expect(insertedValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "job-1",
        settings: {
          title: "ab",
          nested: { value: "cd" },
          list: ["ef", 1],
        },
      }),
    );
    expect(queueAdd).toHaveBeenCalledWith(
      "tool-a",
      expect.objectContaining({
        settings: {
          title: "a\0b",
          nested: { value: "c\0d" },
          list: ["e\0f", 1],
        },
      }),
      { jobId: "job-1" },
    );
  });

  it("persists redacted dbSettings while enqueueing real settings", async () => {
    const { enqueueToolJob } = await loadEnqueueModule();

    await enqueueToolJob({
      jobId: "job-2",
      userId: null,
      toolId: "ftp-upload",
      pool: "system",
      kind: "single",
      inputRefs: [],
      filename: "file.txt",
      settings: { password: "secret" },
      dbSettings: { password: "[redacted]" },
    } as never);

    expect(insertedValues).toHaveBeenCalledWith(
      expect.objectContaining({ settings: { password: "[redacted]" } }),
    );
    expect(queueAdd).toHaveBeenCalledWith(
      "ftp-upload",
      expect.objectContaining({ settings: { password: "secret" } }),
      { jobId: "job-2" },
    );
  });

  it("waitForJob returns null when the job is missing or the sync window times out", async () => {
    const { waitForJob } = await loadEnqueueModule();

    getJob.mockResolvedValueOnce(undefined);
    await expect(waitForJob("image", "missing")).resolves.toBeNull();

    getJob.mockResolvedValueOnce({
      waitUntilFinished: vi.fn().mockRejectedValue(new Error("job timed out before finishing")),
    });
    await expect(waitForJob("image", "slow", 25)).resolves.toBeNull();
  });

  it("waitForJob rethrows real job failures", async () => {
    const { waitForJob } = await loadEnqueueModule();
    getJob.mockResolvedValueOnce({
      waitUntilFinished: vi.fn().mockRejectedValue(new Error("processor failed")),
    });

    await expect(waitForJob("image", "failed")).rejects.toThrow("processor failed");
  });

  it("closes lazy QueueEvents and FlowProducer singletons", async () => {
    const { closeFlowProducer, closeQueueEvents, getFlowProducer, warmQueueEvents, waitForJob } =
      await loadEnqueueModule();

    await warmQueueEvents();
    getFlowProducer();
    getJob.mockResolvedValueOnce(undefined);
    await waitForJob("image", "job-1");

    await closeQueueEvents();
    await closeFlowProducer();

    expect(queueEventClose).toHaveBeenCalled();
    expect(flowProducerClose).toHaveBeenCalledTimes(1);
  });
});
