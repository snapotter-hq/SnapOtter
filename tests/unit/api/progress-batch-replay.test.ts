/**
 * Unit tests for durable batch progress state (#750).
 *
 * A batch parent row must be able to reconstruct both a nonterminal
 * "the batch is alive" frame and the terminal frame carrying the durable
 * ZIP result, so a client that degraded a dead batch POST to the async
 * path can settle from SSE replay alone.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  failure: null as Error | null,
  // What the last update wrote, and how many rows it claims to have changed
  // (0 keeps announce() quiet, as the guarded terminal writers expect).
  lastSet: null as Record<string, unknown> | null,
  rowCount: 0,
}));
// Frames the terminal writers publish, so a test can read the one a client gets.
const redisMocks = vi.hoisted(() => ({ published: [] as string[] }));

vi.mock("../../../apps/api/src/jobs/connection.js", () => ({
  sharedRedis: () => ({
    setex: async () => {},
    publish: async (_channel: string, json: string) => {
      redisMocks.published.push(json);
    },
  }),
  createRedisSubscriberConnection: () => ({}),
}));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: (() => {
    const executor = {
      select: () => ({
        from: () => ({
          where: async () => {
            if (dbMocks.failure) throw dbMocks.failure;
            return [];
          },
        }),
      }),
      insert: () => ({
        values: async () => {
          if (dbMocks.failure) throw dbMocks.failure;
        },
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            if (dbMocks.failure) throw dbMocks.failure;
            dbMocks.lastSet = values;
            return { rowCount: dbMocks.rowCount };
          },
        }),
      }),
    };
    return {
      ...executor,
      transaction: async (callback: (tx: typeof executor) => Promise<void>) => callback(executor),
    };
  })(),
  pool: {},
  closeDb: async () => {},
  schema: {
    jobs: { id: {}, status: {} },
  },
}));

vi.mock("../../../apps/api/src/config.js", () => ({
  env: { WORKSPACE_PATH: "/tmp/test" },
}));

import {
  buildBatchReplayEvent,
  buildPersistedJobProgress,
  completeBatchJob,
  failBatchJob,
} from "../../../apps/api/src/routes/progress.js";

describe("buildPersistedJobProgress", () => {
  it("stores the counts a reconnecting client needs, not just percent", () => {
    expect(
      buildPersistedJobProgress({
        jobId: "batch-1",
        status: "processing",
        totalFiles: 5,
        completedFiles: 2,
        failedFiles: 1,
        errors: [{ filename: "b.png", error: "corrupt" }],
      }),
    ).toEqual({
      percent: 40,
      totalFiles: 5,
      completedFiles: 2,
      failedFiles: 1,
    });
  });

  it("carries the terminal result when present", () => {
    expect(
      buildPersistedJobProgress({
        jobId: "batch-2",
        status: "completed",
        totalFiles: 2,
        completedFiles: 2,
        failedFiles: 0,
        errors: [],
        result: { downloadUrl: "/api/v1/download/batch-2/batch-compress-batch-2.zip" },
      }),
    ).toEqual({
      percent: 100,
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 0,
      result: { downloadUrl: "/api/v1/download/batch-2/batch-compress-batch-2.zip" },
    });
  });

  it("guards the percent against a zero total", () => {
    expect(
      buildPersistedJobProgress({
        jobId: "batch-3",
        status: "processing",
        totalFiles: 0,
        completedFiles: 0,
        failedFiles: 0,
        errors: [],
      }),
    ).toEqual({ percent: 0, totalFiles: 0, completedFiles: 0, failedFiles: 0 });
  });
});

describe("buildBatchReplayEvent", () => {
  it("replays a live processing row as a nonterminal frame with counts", () => {
    expect(
      buildBatchReplayEvent({
        jobId: "batch-live",
        status: "processing",
        progress: { percent: 40, totalFiles: 5, completedFiles: 2, failedFiles: 0 },
        error: null,
      }),
    ).toEqual({
      jobId: "batch-live",
      type: "batch",
      status: "processing",
      totalFiles: 5,
      completedFiles: 2,
      failedFiles: 0,
      errors: [],
    });
  });

  it("replays a queued row as a nonterminal frame", () => {
    expect(
      buildBatchReplayEvent({
        jobId: "batch-queued",
        status: "queued",
        progress: { percent: 0, totalFiles: 3, completedFiles: 0, failedFiles: 0 },
        error: null,
      }),
    ).toEqual({
      jobId: "batch-queued",
      type: "batch",
      status: "processing",
      totalFiles: 3,
      completedFiles: 0,
      failedFiles: 0,
      errors: [],
    });
  });

  it("replays a completed row with its durable result and recorded errors", () => {
    expect(
      buildBatchReplayEvent({
        jobId: "batch-done",
        status: "completed",
        progress: {
          percent: 100,
          totalFiles: 3,
          completedFiles: 3,
          failedFiles: 1,
          result: {
            downloadUrl: "/api/v1/download/batch-done/batch-compress-batch-do.zip",
            fileResults: { "0": "a.png", "2": "c.png" },
          },
        },
        error: {
          message: "1 file(s) failed",
          details: [{ filename: "b.png", error: "corrupt" }],
        },
      }),
    ).toEqual({
      jobId: "batch-done",
      type: "batch",
      status: "completed",
      totalFiles: 3,
      completedFiles: 3,
      failedFiles: 1,
      errors: [{ filename: "b.png", error: "corrupt" }],
      result: {
        downloadUrl: "/api/v1/download/batch-done/batch-compress-batch-do.zip",
        fileResults: { "0": "a.png", "2": "c.png" },
      },
    });
  });

  it("turns a completed row without a durable result into an explicit failure", () => {
    expect(
      buildBatchReplayEvent({
        jobId: "batch-legacy",
        status: "completed",
        progress: { percent: 100, totalFiles: 2, completedFiles: 2, failedFiles: 0 },
        error: null,
      }),
    ).toEqual({
      jobId: "batch-legacy",
      type: "batch",
      status: "failed",
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 0,
      errors: [
        { filename: "", error: "Completed result is no longer available. Run the job again." },
      ],
    });
  });

  it("replays a failed row with its per-file errors", () => {
    expect(
      buildBatchReplayEvent({
        jobId: "batch-failed",
        status: "failed",
        progress: { percent: 100, totalFiles: 2, completedFiles: 2, failedFiles: 2 },
        error: {
          message: "All files failed processing",
          details: [
            { filename: "a.png", error: "corrupt" },
            { filename: "b.png", error: "too large" },
          ],
        },
      }),
    ).toEqual({
      jobId: "batch-failed",
      type: "batch",
      status: "failed",
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 2,
      errors: [
        { filename: "a.png", error: "corrupt" },
        { filename: "b.png", error: "too large" },
      ],
    });
  });

  it("replays a shared fault's code and operator hint on the failed frame (#2178)", () => {
    expect(
      buildBatchReplayEvent({
        jobId: "batch-fault",
        status: "failed",
        progress: { percent: 100, totalFiles: 2, completedFiles: 2, failedFiles: 2 },
        error: {
          message: "A required tool could not be started",
          code: "ENGINE_UNAVAILABLE",
          hint: "Check QPDF_PATH",
          details: [
            { filename: "", error: "A required tool could not be started: Check QPDF_PATH" },
          ],
        },
      }),
    ).toMatchObject({
      status: "failed",
      code: "ENGINE_UNAVAILABLE",
      details: "Check QPDF_PATH",
    });
  });

  it("replays a code without a hint, and neither key when the row has none (#2178)", () => {
    const withCode = buildBatchReplayEvent({
      jobId: "batch-code-only",
      status: "failed",
      progress: { percent: 100, totalFiles: 1, completedFiles: 1, failedFiles: 1 },
      error: { message: "Workspace is full.", code: "WORKSPACE_FULL" },
    });
    expect(withCode).toMatchObject({ code: "WORKSPACE_FULL" });
    expect(withCode).not.toHaveProperty("details");

    const plain = buildBatchReplayEvent({
      jobId: "batch-plain",
      status: "failed",
      progress: { percent: 100, totalFiles: 1, completedFiles: 1, failedFiles: 1 },
      error: { message: "All files failed processing" },
    });
    expect(plain).not.toHaveProperty("code");
    expect(plain).not.toHaveProperty("details");
  });

  it("ignores a code or hint that is not text", () => {
    const event = buildBatchReplayEvent({
      jobId: "batch-odd",
      status: "failed",
      progress: { percent: 100, totalFiles: 1, completedFiles: 1, failedFiles: 1 },
      error: { message: "x", code: 503, hint: { nested: true } },
    });
    expect(event).not.toHaveProperty("code");
    expect(event).not.toHaveProperty("details");
  });

  it("falls back to the error message when a failed row has no details", () => {
    expect(
      buildBatchReplayEvent({
        jobId: "batch-msg-only",
        status: "failed",
        progress: { percent: 0, totalFiles: 1, completedFiles: 1, failedFiles: 1 },
        error: { message: "Failed to package batch results" },
      }),
    ).toEqual({
      jobId: "batch-msg-only",
      type: "batch",
      status: "failed",
      totalFiles: 1,
      completedFiles: 1,
      failedFiles: 1,
      errors: [{ filename: "", error: "Failed to package batch results" }],
    });
  });

  it("replays a canceled row as failed with a Canceled marker", () => {
    expect(
      buildBatchReplayEvent({
        jobId: "batch-canceled",
        status: "canceled",
        progress: { percent: 50, totalFiles: 2, completedFiles: 1, failedFiles: 0 },
        error: null,
      }),
    ).toEqual({
      jobId: "batch-canceled",
      type: "batch",
      status: "failed",
      totalFiles: 2,
      completedFiles: 1,
      failedFiles: 0,
      errors: [{ filename: "", error: "Canceled" }],
    });
  });

  it("replays a canceled row with a durable result as completed-with-result (#767)", () => {
    const result = {
      downloadUrl: "/api/v1/download/b/batch-resize-b.zip",
      fileResults: { "0": "a.png" },
    };
    expect(
      buildBatchReplayEvent({
        jobId: "batch-canceled-partial",
        status: "canceled",
        progress: { percent: 100, totalFiles: 3, completedFiles: 3, failedFiles: 2, result },
        error: { message: "Canceled", details: [{ filename: "b.png", error: "Canceled" }] },
      }),
    ).toEqual({
      jobId: "batch-canceled-partial",
      type: "batch",
      status: "completed",
      totalFiles: 3,
      completedFiles: 3,
      failedFiles: 2,
      errors: [{ filename: "b.png", error: "Canceled" }],
      result,
    });
  });

  it("replays a resultless canceled row as failed with its stored details (#767)", () => {
    expect(
      buildBatchReplayEvent({
        jobId: "batch-canceled-full",
        status: "canceled",
        progress: { percent: 100, totalFiles: 2, completedFiles: 2, failedFiles: 2 },
        error: {
          message: "Canceled",
          details: [
            { filename: "", error: "Canceled" },
            { filename: "a.png", error: "Canceled" },
          ],
        },
      }),
    ).toEqual({
      jobId: "batch-canceled-full",
      type: "batch",
      status: "failed",
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 2,
      errors: [
        { filename: "", error: "Canceled" },
        { filename: "a.png", error: "Canceled" },
      ],
    });
  });

  it("tolerates legacy rows whose progress has only a percent", () => {
    expect(
      buildBatchReplayEvent({
        jobId: "batch-old",
        status: "processing",
        progress: { percent: 40 },
        error: null,
      }),
    ).toEqual({
      jobId: "batch-old",
      type: "batch",
      status: "processing",
      totalFiles: 0,
      completedFiles: 0,
      failedFiles: 0,
      errors: [],
    });
  });
});

describe("terminal batch writers", () => {
  // Each test starts from a quiet writer: no rows changed, nothing published.
  beforeEach(() => {
    dbMocks.failure = null;
    dbMocks.rowCount = 0;
    dbMocks.lastSet = null;
    redisMocks.published.length = 0;
  });

  it("completeBatchJob resolves after the durable write settles", async () => {
    dbMocks.failure = null;
    await expect(
      completeBatchJob({
        jobId: "batch-writer-1",
        totalFiles: 2,
        completedFiles: 2,
        failedFiles: 0,
        errors: [],
        outputRefs: ["outputs/batch-writer-1/batch-compress-batch-wr.zip"],
        bytesOut: 1234,
        result: {
          downloadUrl: "/api/v1/download/batch-writer-1/batch-compress-batch-wr.zip",
          fileResults: { "0": "a.png", "1": "b.png" },
        },
      }),
    ).resolves.toBeUndefined();
  });

  it("failBatchJob resolves after the durable write settles", async () => {
    dbMocks.failure = null;
    await expect(
      failBatchJob({
        jobId: "batch-writer-2",
        totalFiles: 2,
        completedFiles: 2,
        failedFiles: 2,
        errors: [{ filename: "a.png", error: "corrupt" }],
        message: "All files failed processing",
      }),
    ).resolves.toBeUndefined();
  });

  describe("failBatchJob and a shared fault (#2178)", () => {
    // announce() publishes a few promise ticks after the writer resolves.
    const publishedFrames = () => new Promise((resolve) => setTimeout(resolve, 0));

    const base = {
      jobId: "batch-fault-writer",
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 2,
      errors: [{ filename: "", error: "A required tool could not be started: Check QPDF_PATH" }],
      message: "A required tool could not be started",
    };

    it("announces the code and hint on the terminal frame and stores both on the row", async () => {
      dbMocks.failure = null;
      dbMocks.rowCount = 1;

      await failBatchJob({ ...base, code: "ENGINE_UNAVAILABLE", details: "Check QPDF_PATH" });
      await publishedFrames();

      const frame = JSON.parse(redisMocks.published[0]);
      expect(frame).toMatchObject({
        status: "failed",
        code: "ENGINE_UNAVAILABLE",
        details: "Check QPDF_PATH",
      });
      expect(dbMocks.lastSet?.error).toMatchObject({
        message: "A required tool could not be started",
        code: "ENGINE_UNAVAILABLE",
        hint: "Check QPDF_PATH",
        details: base.errors,
      });
    });

    it("a frame announced live and one replayed from the row say the same thing", async () => {
      dbMocks.failure = null;
      dbMocks.rowCount = 1;

      await failBatchJob({ ...base, code: "ENGINE_UNAVAILABLE", details: "Check QPDF_PATH" });
      await publishedFrames();

      const live = JSON.parse(redisMocks.published[0]);
      const replayed = buildBatchReplayEvent({
        jobId: base.jobId,
        status: "failed",
        progress: dbMocks.lastSet?.progress,
        error: dbMocks.lastSet?.error,
      });
      expect(replayed).toEqual(live);
    });

    it("leaves code and details off a frame that had neither", async () => {
      dbMocks.failure = null;
      dbMocks.rowCount = 1;

      await failBatchJob({ ...base, message: "All files failed processing" });
      await publishedFrames();

      const frame = JSON.parse(redisMocks.published[0]);
      expect(frame).not.toHaveProperty("code");
      expect(frame).not.toHaveProperty("details");
      expect(dbMocks.lastSet?.error).not.toHaveProperty("hint");
    });

    it("announces nothing when the guarded write changed no row", async () => {
      dbMocks.failure = null;
      dbMocks.rowCount = 0;

      await failBatchJob({ ...base, code: "ENGINE_UNAVAILABLE", details: "Check QPDF_PATH" });
      await publishedFrames();

      expect(redisMocks.published).toEqual([]);
    });
  });

  it("completeBatchJob propagates a durable persistence failure", async () => {
    dbMocks.failure = new Error("database unavailable");
    await expect(
      completeBatchJob({
        jobId: "batch-writer-3",
        totalFiles: 1,
        completedFiles: 1,
        failedFiles: 0,
        errors: [],
        outputRefs: ["outputs/batch-writer-3/batch-compress-batch-wr.zip"],
        bytesOut: 10,
        result: { downloadUrl: "/x", fileResults: {} },
      }),
    ).rejects.toThrow("database unavailable");
    dbMocks.failure = null;
  });
});
