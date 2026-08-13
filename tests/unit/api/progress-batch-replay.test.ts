/**
 * Unit tests for durable batch progress state (#750).
 *
 * A batch parent row must be able to reconstruct both a nonterminal
 * "the batch is alive" frame and the terminal frame carrying the durable
 * ZIP result, so a client that degraded a dead batch POST to the async
 * path can settle from SSE replay alone.
 */
import { describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ failure: null as Error | null }));

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
        set: () => ({
          where: async () => {
            if (dbMocks.failure) throw dbMocks.failure;
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
