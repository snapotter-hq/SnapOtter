/**
 * Unit tests for the progress tracking module.
 *
 * Tests updateJobProgress, updateSingleFileProgress, and the
 * in-memory pub/sub listener system.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ failure: null as Error | null }));

// Mock DB
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

import type { JobProgress } from "../../../apps/api/src/routes/progress.js";
import {
  buildPersistedSingleFileProgress,
  buildSingleFileReplayEvent,
  updateJobProgress,
  updateSingleFileProgress,
  updateSingleFileProgressAtomically,
} from "../../../apps/api/src/routes/progress.js";

describe("updateJobProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores progress that can be sent to SSE listeners", () => {
    const progress: JobProgress = {
      jobId: "test-job-1",
      status: "processing",
      totalFiles: 5,
      completedFiles: 2,
      failedFiles: 0,
      errors: [],
    };

    // Should not throw
    expect(() => updateJobProgress(progress)).not.toThrow();
  });

  it("handles completed status", () => {
    const progress: JobProgress = {
      jobId: "test-job-2",
      status: "completed",
      totalFiles: 3,
      completedFiles: 3,
      failedFiles: 0,
      errors: [],
    };

    expect(() => updateJobProgress(progress)).not.toThrow();
  });

  it("handles failed status with errors", () => {
    const progress: JobProgress = {
      jobId: "test-job-3",
      status: "failed",
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 2,
      errors: [
        { filename: "a.png", error: "corrupt" },
        { filename: "b.png", error: "too large" },
      ],
    };

    expect(() => updateJobProgress(progress)).not.toThrow();
  });

  it("handles progress with currentFile", () => {
    const progress: JobProgress = {
      jobId: "test-job-4",
      status: "processing",
      totalFiles: 5,
      completedFiles: 1,
      failedFiles: 0,
      errors: [],
      currentFile: "photo.png",
    };

    expect(() => updateJobProgress(progress)).not.toThrow();
  });
});

describe("updateSingleFileProgress", () => {
  beforeEach(() => {
    dbMocks.failure = null;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("handles processing phase", () => {
    expect(() =>
      updateSingleFileProgress({
        jobId: "single-1",
        phase: "processing",
        percent: 50,
        stage: "Downloading model...",
      }),
    ).not.toThrow();
  });

  it("handles complete phase", () => {
    expect(() =>
      updateSingleFileProgress({
        jobId: "single-2",
        phase: "complete",
        percent: 100,
        stage: "Done",
      }),
    ).not.toThrow();
  });

  it("handles failed phase with error", () => {
    expect(() =>
      updateSingleFileProgress({
        jobId: "single-3",
        phase: "failed",
        percent: 0,
        error: "Model not found",
      }),
    ).not.toThrow();
  });

  it("handles progress with result data", () => {
    expect(() =>
      updateSingleFileProgress({
        jobId: "single-4",
        phase: "complete",
        percent: 100,
        result: { text: "OCR result" },
      }),
    ).not.toThrow();
  });

  it("returns a persistence promise that terminal producers can await", async () => {
    const persisted = updateSingleFileProgress({
      jobId: "single-awaitable",
      phase: "complete",
      percent: 100,
      result: { text: "durable OCR result" },
    });

    expect(persisted).toBeInstanceOf(Promise);
    await expect(persisted).resolves.toBeUndefined();
  });

  it("propagates a durable persistence failure to an awaiting terminal producer", async () => {
    dbMocks.failure = new Error("database unavailable");

    await expect(
      updateSingleFileProgress({
        jobId: "single-durable-failure",
        phase: "complete",
        percent: 100,
        result: { text: "must not be reported durable" },
      }),
    ).rejects.toThrow("database unavailable");
  });

  it("commits authoritative completion and replay state in one awaited transaction", async () => {
    const mutateAuthoritative = vi.fn().mockResolvedValue(undefined);

    await updateSingleFileProgressAtomically(
      {
        jobId: "single-atomic",
        phase: "complete",
        percent: 100,
        result: { text: "transactional result" },
      },
      mutateAuthoritative,
    );

    expect(mutateAuthoritative).toHaveBeenCalledTimes(1);
  });
});

describe("durable single-file terminal progress", () => {
  it("persists the terminal result alongside percent and stage", () => {
    expect(
      buildPersistedSingleFileProgress({
        jobId: "single-durable",
        phase: "complete",
        percent: 100,
        stage: "complete",
        result: { text: "OCR result", downloadUrl: "/result.txt" },
      }),
    ).toEqual({
      percent: 100,
      stage: "complete",
      result: { text: "OCR result", downloadUrl: "/result.txt" },
    });
  });

  it("replays a completed durable result from the database row", () => {
    expect(
      buildSingleFileReplayEvent({
        jobId: "single-replay",
        status: "completed",
        progress: {
          percent: 100,
          stage: "complete",
          result: { text: "recovered" },
        },
        error: null,
      }),
    ).toEqual({
      jobId: "single-replay",
      type: "single",
      phase: "complete",
      percent: 100,
      stage: "complete",
      result: { text: "recovered" },
    });
  });

  it("turns legacy completed rows without results into an explicit terminal failure", () => {
    expect(
      buildSingleFileReplayEvent({
        jobId: "single-legacy",
        status: "completed",
        progress: { percent: 100, stage: "complete" },
        error: null,
      }),
    ).toEqual({
      jobId: "single-legacy",
      type: "single",
      phase: "failed",
      percent: 100,
      error: "Completed result is no longer available. Run the job again.",
    });
  });
});

describe("JobProgress type shape", () => {
  it("supports all required fields", () => {
    const p: JobProgress = {
      jobId: "shape-test",
      status: "processing",
      totalFiles: 1,
      completedFiles: 0,
      failedFiles: 0,
      errors: [],
    };
    expect(p.jobId).toBe("shape-test");
    expect(p.status).toBe("processing");
    expect(p.totalFiles).toBe(1);
    expect(p.currentFile).toBeUndefined();
  });

  it("supports optional currentFile and type", () => {
    const p: JobProgress = {
      jobId: "shape-test-2",
      type: "batch",
      status: "completed",
      totalFiles: 3,
      completedFiles: 3,
      failedFiles: 0,
      errors: [],
      currentFile: "last.png",
    };
    expect(p.type).toBe("batch");
    expect(p.currentFile).toBe("last.png");
  });
});
