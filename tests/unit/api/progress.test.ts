/**
 * Unit tests for the progress tracking module.
 *
 * Tests updateJobProgress, updateSingleFileProgress, and the
 * in-memory pub/sub listener system.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  failure: null as Error | null,
  existing: [] as Array<Record<string, unknown>>,
  rowCount: 1 as number | null,
  inserted: [] as Array<Record<string, unknown>>,
  updated: [] as Array<Record<string, unknown>>,
  whereClauses: [] as unknown[],
}));

const redisMocks = vi.hoisted(() => ({
  get: vi.fn(async () => null as string | null),
  setex: vi.fn(async () => "OK"),
  publish: vi.fn(async () => 1),
  del: vi.fn(async () => 1),
}));

const authMocks = vi.hoisted(() => ({
  user: { id: "user-1", username: "alice", role: "admin" } as {
    id: string;
    username: string;
    role: string;
  } | null,
  filesAll: true,
  permissionError: null as Error | null,
}));

vi.mock("../../../apps/api/src/jobs/connection.js", () => ({
  sharedRedis: () => redisMocks,
  createRedisSubscriberConnection: vi.fn(() => ({
    on: vi.fn(),
    subscribe: vi.fn(async () => 1),
  })),
}));

vi.mock("../../../apps/api/src/plugins/auth.js", () => ({
  requireAuth: () => authMocks.user,
}));

vi.mock("../../../apps/api/src/permissions.js", () => ({
  hasEffectivePermission: vi.fn(async (_user: unknown, perm: string) => {
    if (authMocks.permissionError) throw authMocks.permissionError;
    return perm === "files:all" ? authMocks.filesAll : false;
  }),
}));

// Mock DB
vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: (() => {
    const executor = {
      select: () => ({
        from: () => ({
          where: async () => {
            if (dbMocks.failure) throw dbMocks.failure;
            return dbMocks.existing;
          },
        }),
      }),
      insert: () => ({
        values: async (row: Record<string, unknown>) => {
          if (dbMocks.failure) throw dbMocks.failure;
          dbMocks.inserted.push(row);
        },
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: async (clause: unknown) => {
            if (dbMocks.failure) throw dbMocks.failure;
            dbMocks.updated.push(values);
            dbMocks.whereClauses.push(clause);
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
    jobs: { id: {}, status: {}, settings: {} },
  },
}));

vi.mock("../../../apps/api/src/config.js", () => ({
  env: { WORKSPACE_PATH: "/tmp/test" },
}));

import type { JobProgress } from "../../../apps/api/src/routes/progress.js";
import {
  buildPersistedSingleFileProgress,
  buildSingleFileReplayEvent,
  cancelSingleJobGuarded,
  clearTerminalReplayKey,
  failSingleJobGuarded,
  refreshFeatureInstallStream,
  registerProgressRoutes,
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

describe("durable batch terminal progress (#1688)", () => {
  afterEach(() => {
    dbMocks.failure = null;
  });

  it("returns a persistence promise that terminal producers can await and announces after persistence", async () => {
    redisMocks.setex.mockClear();
    redisMocks.publish.mockClear();

    const persisted = updateJobProgress({
      jobId: "batch-awaitable",
      status: "completed",
      totalFiles: 1,
      completedFiles: 1,
      failedFiles: 0,
      errors: [],
    });

    expect(persisted).toBeInstanceOf(Promise);
    expect(redisMocks.setex).not.toHaveBeenCalled();
    expect(redisMocks.publish).not.toHaveBeenCalled();
    await expect(persisted).resolves.toBeUndefined();
    expect(redisMocks.setex).toHaveBeenCalledTimes(1);
    expect(redisMocks.publish).toHaveBeenCalledTimes(1);
  });

  it("propagates a durable persistence failure instead of swallowing it", async () => {
    dbMocks.failure = new Error("database unavailable");
    redisMocks.setex.mockClear();
    redisMocks.publish.mockClear();

    await expect(
      updateJobProgress({
        jobId: "batch-durable-failure",
        status: "completed",
        totalFiles: 1,
        completedFiles: 1,
        failedFiles: 0,
        errors: [],
      }),
    ).rejects.toThrow("database unavailable");
    await expect(
      updateJobProgress({
        jobId: "batch-durable-failed-status",
        status: "failed",
        totalFiles: 1,
        completedFiles: 0,
        failedFiles: 1,
        errors: [{ filename: "a.png", error: "corrupt" }],
      }),
    ).rejects.toThrow("database unavailable");
    expect(redisMocks.setex).not.toHaveBeenCalled();
    expect(redisMocks.publish).not.toHaveBeenCalled();
  });

  it("does not leave a nonterminal producer's failure unhandled", async () => {
    dbMocks.failure = new Error("database unavailable");
    redisMocks.setex.mockClear();
    redisMocks.publish.mockClear();
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      updateJobProgress({
        jobId: "batch-nonterminal-failure",
        status: "processing",
        totalFiles: 2,
        completedFiles: 0,
        failedFiles: 0,
        errors: [],
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(unhandled).not.toHaveBeenCalled();
      expect(redisMocks.setex).not.toHaveBeenCalled();
      expect(redisMocks.publish).toHaveBeenCalledTimes(1);
    } finally {
      process.off("unhandledRejection", unhandled);
    }
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
    redisMocks.setex.mockClear();
    redisMocks.publish.mockClear();

    const persisted = updateSingleFileProgress({
      jobId: "single-awaitable",
      phase: "complete",
      percent: 100,
      result: { text: "durable OCR result" },
    });

    expect(persisted).toBeInstanceOf(Promise);
    expect(redisMocks.setex).not.toHaveBeenCalled();
    expect(redisMocks.publish).not.toHaveBeenCalled();
    await expect(persisted).resolves.toBeUndefined();
    expect(redisMocks.setex).toHaveBeenCalledTimes(1);
    expect(redisMocks.publish).toHaveBeenCalledTimes(1);
  });

  it("keeps a rejected input's HTTP status on the persisted failure row", async () => {
    dbMocks.inserted = [];
    await updateSingleFileProgress({
      jobId: "single-http-status",
      phase: "failed",
      percent: 0,
      error: "Page count does not match document 1",
      code: "PAGE_COUNT",
      httpStatus: 400,
    });
    await updateSingleFileProgress({
      jobId: "single-no-http-status",
      phase: "failed",
      percent: 0,
      error: "Sharp exploded",
    });

    expect(dbMocks.inserted.map((row) => row.error)).toEqual([
      { message: "Page count does not match document 1", code: "PAGE_COUNT", httpStatus: 400 },
      { message: "Sharp exploded" },
    ]);
  });

  it("propagates a durable persistence failure to an awaiting terminal producer without caching a Redis terminal key (#2699)", async () => {
    dbMocks.failure = new Error("database unavailable");
    redisMocks.setex.mockClear();
    redisMocks.publish.mockClear();

    await expect(
      updateSingleFileProgress({
        jobId: "single-durable-failure",
        phase: "complete",
        percent: 100,
        result: { text: "must not be reported durable" },
      }),
    ).rejects.toThrow("database unavailable");
    await expect(
      updateSingleFileProgress({
        jobId: "single-durable-failed-phase",
        phase: "failed",
        percent: 0,
        error: "An unexpected error occurred during processing. Please try again.",
      }),
    ).rejects.toThrow("database unavailable");

    expect(redisMocks.setex).not.toHaveBeenCalled();
    expect(redisMocks.publish).not.toHaveBeenCalled();
  });

  it("clears cached terminal replay keys in Redis and skips empty calls (#2699)", async () => {
    redisMocks.del.mockClear();

    await clearTerminalReplayKey();
    expect(redisMocks.del).not.toHaveBeenCalled();

    await clearTerminalReplayKey("job-1", "alias-1");
    expect(redisMocks.del).toHaveBeenCalledTimes(1);
    expect(redisMocks.del).toHaveBeenCalledWith(
      expect.stringMatching(/:terminal:job-1$/),
      expect.stringMatching(/:terminal:alias-1$/),
    );
  });

  it("commits authoritative completion and replay state in one awaited transaction and suppresses announcement on failure (#2699)", async () => {
    redisMocks.setex.mockClear();
    redisMocks.publish.mockClear();
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
    expect(redisMocks.setex).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(redisMocks.publish).toHaveBeenCalledTimes(1);

    redisMocks.setex.mockClear();
    redisMocks.publish.mockClear();
    const failingMutate = vi.fn().mockRejectedValue(new Error("tx aborted"));
    await expect(
      updateSingleFileProgressAtomically(
        {
          jobId: "single-atomic-fail",
          phase: "failed",
          percent: 0,
          error: "boom",
        },
        failingMutate,
      ),
    ).rejects.toThrow("tx aborted");
    expect(redisMocks.setex).not.toHaveBeenCalled();
    expect(redisMocks.publish).not.toHaveBeenCalled();
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

  it("replays a canceled durable row as the failed Canceled terminal (#771, #1623)", () => {
    expect(
      buildSingleFileReplayEvent({
        jobId: "single-canceled",
        status: "canceled",
        progress: { percent: 0 },
        error: { message: "Canceled" },
      }),
    ).toEqual({
      jobId: "single-canceled",
      type: "single",
      phase: "failed",
      percent: 0,
      error: "Canceled",
      code: "CANCELED",
    });
  });

  it("falls back to Canceled for a canceled row without a stored message (#1623)", () => {
    expect(
      buildSingleFileReplayEvent({
        jobId: "single-canceled-bare",
        status: "canceled",
        progress: {},
        error: null,
      }),
    ).toEqual({
      jobId: "single-canceled-bare",
      type: "single",
      phase: "failed",
      percent: 0,
      error: "Canceled",
      code: "CANCELED",
    });
  });

  it("omits error when a failed row has no stored message so clients translate noDetail (#1623)", () => {
    expect(
      buildSingleFileReplayEvent({
        jobId: "single-failed-bare",
        status: "failed",
        progress: { percent: 25 },
        error: null,
      }),
    ).toEqual({
      jobId: "single-failed-bare",
      type: "single",
      phase: "failed",
      percent: 25,
    });

    expect(
      buildSingleFileReplayEvent({
        jobId: "single-failed-blank",
        status: "failed",
        progress: {},
        error: { message: "   ", code: "ENGINE_UNAVAILABLE", details: "Check QPDF_PATH" },
      }),
    ).toEqual({
      jobId: "single-failed-blank",
      type: "single",
      phase: "failed",
      percent: 0,
      code: "ENGINE_UNAVAILABLE",
      details: "Check QPDF_PATH",
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

describe("refreshFeatureInstallStream (#2819)", () => {
  afterEach(() => {
    dbMocks.failure = null;
  });

  it("updates createdAt via the per-job persist queue, suppresses unhandled rejections on DB failure, and does not block subsequent progress writes", async () => {
    dbMocks.updated = [];
    await expect(refreshFeatureInstallStream("install-job-1")).resolves.toBeUndefined();
    expect(dbMocks.updated).toHaveLength(1);
    expect(dbMocks.updated[0]).toHaveProperty("createdAt");

    dbMocks.failure = new Error("database unavailable");
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const rejectedRefresh = refreshFeatureInstallStream("install-job-2");
      await expect(rejectedRefresh).rejects.toThrow("database unavailable");
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(unhandled).not.toHaveBeenCalled();

      // A failed refresh on install-job-2 must not wedge its per-job persist queue.
      dbMocks.failure = null;
      dbMocks.inserted = [];
      await expect(
        updateSingleFileProgress({
          jobId: "install-job-2",
          phase: "complete",
          percent: 100,
          result: { bundleId: "ocr" },
        }),
      ).resolves.toBeUndefined();
      expect(dbMocks.inserted).toHaveLength(1);
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});

describe("expectedPipelineFlowId pointer guard (#2741)", () => {
  beforeEach(() => {
    dbMocks.failure = null;
    dbMocks.existing = [{ id: "alias-1" }];
    dbMocks.rowCount = 1;
    dbMocks.inserted = [];
    dbMocks.updated = [];
    dbMocks.whereClauses = [];
    redisMocks.setex.mockClear();
    redisMocks.publish.mockClear();
  });

  afterEach(() => {
    dbMocks.existing = [];
    dbMocks.rowCount = 1;
  });

  it("guards failSingleJobGuarded and cancelSingleJobGuarded on expectedPipelineFlowId and skips announcement when re-pointed", async () => {
    dbMocks.rowCount = 0;
    await failSingleJobGuarded({
      jobId: "alias-1",
      message: "Pipeline processing failed",
      expectedPipelineFlowId: "flow-1",
    });
    expect(JSON.stringify(dbMocks.whereClauses.at(-1))).toContain("pipelineFlowId");
    expect(JSON.stringify(dbMocks.whereClauses.at(-1))).toContain("flow-1");
    expect(redisMocks.setex).not.toHaveBeenCalled();
    expect(redisMocks.publish).not.toHaveBeenCalled();

    await cancelSingleJobGuarded({
      jobId: "alias-1",
      expectedPipelineFlowId: "flow-1",
    });
    expect(JSON.stringify(dbMocks.whereClauses.at(-1))).toContain("pipelineFlowId");
    expect(JSON.stringify(dbMocks.whereClauses.at(-1))).toContain("flow-1");
    expect(redisMocks.setex).not.toHaveBeenCalled();
    expect(redisMocks.publish).not.toHaveBeenCalled();

    dbMocks.rowCount = 1;
    await failSingleJobGuarded({
      jobId: "alias-1",
      message: "Pipeline processing failed",
      expectedPipelineFlowId: "flow-1",
    });
    expect(dbMocks.updated.at(-1)).toMatchObject({
      status: "failed",
      progress: { percent: 0 },
      error: {
        message: "Pipeline processing failed",
      },
    });
    expect(redisMocks.setex).toHaveBeenCalledTimes(1);
    const bareFrame = JSON.parse((redisMocks.setex.mock.calls[0] as unknown[])[2] as string);
    expect(bareFrame).toEqual({
      jobId: "alias-1",
      type: "single",
      phase: "failed",
      percent: 0,
      error: "Pipeline processing failed",
    });
    await Promise.resolve();
    expect(redisMocks.publish).toHaveBeenCalledTimes(1);

    redisMocks.setex.mockClear();
    redisMocks.publish.mockClear();
    await failSingleJobGuarded({
      jobId: "alias-1",
      message: "The server's storage service is unavailable.",
      code: "storage-unavailable",
      details: "Check S3_ENDPOINT",
      httpStatus: 503,
      expectedPipelineFlowId: "flow-1",
    });
    expect(dbMocks.updated.at(-1)).toMatchObject({
      status: "failed",
      progress: { percent: 0 },
      error: {
        message: "The server's storage service is unavailable.",
        code: "storage-unavailable",
        details: "Check S3_ENDPOINT",
        httpStatus: 503,
      },
    });
    expect(redisMocks.setex).toHaveBeenCalledTimes(1);
    const failFrame = JSON.parse((redisMocks.setex.mock.calls[0] as unknown[])[2] as string);
    expect(failFrame).toEqual({
      jobId: "alias-1",
      type: "single",
      phase: "failed",
      percent: 0,
      error: "The server's storage service is unavailable.",
      code: "storage-unavailable",
      details: "Check S3_ENDPOINT",
      httpStatus: 503,
    });
    await Promise.resolve();
    expect(redisMocks.publish).toHaveBeenCalledTimes(1);

    redisMocks.setex.mockClear();
    redisMocks.publish.mockClear();
    await cancelSingleJobGuarded({
      jobId: "alias-1",
      expectedPipelineFlowId: "flow-1",
    });
    expect(dbMocks.updated.at(-1)).toMatchObject({
      status: "canceled",
      progress: { percent: 0 },
      error: { message: "Canceled" },
    });
    expect(redisMocks.setex).toHaveBeenCalledTimes(1);
    const cancelFrame = JSON.parse((redisMocks.setex.mock.calls[0] as unknown[])[2] as string);
    expect(cancelFrame).toEqual({
      jobId: "alias-1",
      type: "single",
      phase: "failed",
      percent: 0,
      error: "Canceled",
      code: "CANCELED",
    });
    await Promise.resolve();
    expect(redisMocks.publish).toHaveBeenCalledTimes(1);
  });

  it("guards updateSingleFileProgressAtomically and updateSingleFileProgress on expectedPipelineFlowId, strips it from the wire frame, and skips insert or announcement when unmatched", async () => {
    const mutateAuthoritative = vi.fn().mockResolvedValue(undefined);
    dbMocks.rowCount = 0;

    await updateSingleFileProgressAtomically(
      {
        jobId: "alias-1",
        phase: "complete",
        percent: 100,
        stage: "complete",
        result: { downloadUrl: "/api/v1/download/flow-1/out.png" },
        expectedPipelineFlowId: "flow-1",
      },
      mutateAuthoritative,
    );
    expect(mutateAuthoritative).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(dbMocks.whereClauses.at(-1))).toContain("pipelineFlowId");
    expect(JSON.stringify(dbMocks.whereClauses.at(-1))).toContain("flow-1");
    expect(redisMocks.setex).not.toHaveBeenCalled();
    expect(redisMocks.publish).not.toHaveBeenCalled();

    // Missing alias row with expectedPipelineFlowId must not insert a pointerless row.
    dbMocks.existing = [];
    dbMocks.rowCount = 1;
    await updateSingleFileProgress({
      jobId: "alias-missing",
      phase: "failed",
      percent: 0,
      error: "Step 1: boom",
      expectedPipelineFlowId: "flow-1",
    });
    expect(dbMocks.inserted).toHaveLength(0);
    expect(redisMocks.setex).not.toHaveBeenCalled();
    expect(redisMocks.publish).not.toHaveBeenCalled();

    // Matching alias row persists and announces without leaking expectedPipelineFlowId onto the wire.
    dbMocks.existing = [{ id: "alias-1" }];
    dbMocks.rowCount = 1;
    await updateSingleFileProgressAtomically(
      {
        jobId: "alias-1",
        phase: "complete",
        percent: 100,
        stage: "complete",
        result: { downloadUrl: "/api/v1/download/flow-1/out.png" },
        expectedPipelineFlowId: "flow-1",
      },
      mutateAuthoritative,
    );
    expect(redisMocks.setex).toHaveBeenCalledTimes(1);
    const cachedJson = (redisMocks.setex.mock.calls[0] as unknown[])[2] as string;
    expect(JSON.parse(cachedJson)).not.toHaveProperty("expectedPipelineFlowId");
    await Promise.resolve();
    expect(redisMocks.publish).toHaveBeenCalledTimes(1);

    // Nonterminal updateSingleFileProgress with expectedPipelineFlowId waits for the guarded DB update and strips expectedPipelineFlowId from the wire payload.
    redisMocks.setex.mockClear();
    redisMocks.publish.mockClear();
    dbMocks.rowCount = 0;
    await updateSingleFileProgress({
      jobId: "alias-1",
      phase: "processing",
      percent: 45,
      stage: "Step 1/2: resize",
      expectedPipelineFlowId: "flow-1",
    });
    expect(redisMocks.publish).not.toHaveBeenCalled();

    dbMocks.rowCount = 1;
    await updateSingleFileProgress({
      jobId: "alias-1",
      phase: "processing",
      percent: 45,
      stage: "Step 1/2: resize",
      expectedPipelineFlowId: "flow-1",
    });
    expect(redisMocks.publish).toHaveBeenCalledTimes(1);
    const publishedJson = (redisMocks.publish.mock.calls[0] as unknown[])[1] as string;
    expect(JSON.parse(publishedJson)).not.toHaveProperty("expectedPipelineFlowId");
  });

  it("guards updateSingleFileProgressAtomically, updateSingleFileProgress, failSingleJobGuarded, and cancelSingleJobGuarded on expectedArtifactJobId, strips it from the wire frame, and skips insert or announcement when unmatched (#3408)", async () => {
    const mutateAuthoritative = vi.fn().mockResolvedValue(undefined);
    dbMocks.rowCount = 0;

    await failSingleJobGuarded({
      jobId: "alias-1",
      message: "Tool processing failed",
      expectedArtifactJobId: "job-1",
    });
    expect(JSON.stringify(dbMocks.whereClauses.at(-1))).toContain("artifactJobId");
    expect(JSON.stringify(dbMocks.whereClauses.at(-1))).toContain("job-1");
    expect(redisMocks.setex).not.toHaveBeenCalled();
    expect(redisMocks.publish).not.toHaveBeenCalled();

    await cancelSingleJobGuarded({
      jobId: "alias-1",
      expectedArtifactJobId: "job-1",
    });
    expect(JSON.stringify(dbMocks.whereClauses.at(-1))).toContain("artifactJobId");
    expect(JSON.stringify(dbMocks.whereClauses.at(-1))).toContain("job-1");
    expect(redisMocks.setex).not.toHaveBeenCalled();
    expect(redisMocks.publish).not.toHaveBeenCalled();

    await updateSingleFileProgressAtomically(
      {
        jobId: "alias-1",
        phase: "complete",
        percent: 100,
        stage: "complete",
        result: { downloadUrl: "/api/v1/download/job-1/out.png" },
        expectedArtifactJobId: "job-1",
      },
      mutateAuthoritative,
    );
    expect(mutateAuthoritative).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(dbMocks.whereClauses.at(-1))).toContain("artifactJobId");
    expect(JSON.stringify(dbMocks.whereClauses.at(-1))).toContain("job-1");
    expect(redisMocks.setex).not.toHaveBeenCalled();
    expect(redisMocks.publish).not.toHaveBeenCalled();

    // Missing alias row with expectedArtifactJobId must not insert a pointerless row.
    dbMocks.existing = [];
    dbMocks.rowCount = 1;
    await updateSingleFileProgress({
      jobId: "alias-missing",
      phase: "failed",
      percent: 0,
      error: "boom",
      expectedArtifactJobId: "job-1",
    });
    expect(dbMocks.inserted).toHaveLength(0);
    expect(redisMocks.setex).not.toHaveBeenCalled();
    expect(redisMocks.publish).not.toHaveBeenCalled();

    // Matching alias row persists and announces without leaking expectedArtifactJobId onto the wire.
    dbMocks.existing = [{ id: "alias-1" }];
    dbMocks.rowCount = 1;
    await updateSingleFileProgressAtomically(
      {
        jobId: "alias-1",
        phase: "complete",
        percent: 100,
        stage: "complete",
        result: { downloadUrl: "/api/v1/download/job-1/out.png" },
        expectedArtifactJobId: "job-1",
      },
      mutateAuthoritative,
    );
    expect(redisMocks.setex).toHaveBeenCalledTimes(1);
    const cachedJson = (redisMocks.setex.mock.calls[0] as unknown[])[2] as string;
    expect(JSON.parse(cachedJson)).not.toHaveProperty("expectedArtifactJobId");
    await Promise.resolve();
    expect(redisMocks.publish).toHaveBeenCalledTimes(1);

    // Nonterminal updateSingleFileProgress with expectedArtifactJobId waits for the guarded DB update and strips expectedArtifactJobId from the wire payload.
    redisMocks.setex.mockClear();
    redisMocks.publish.mockClear();
    dbMocks.rowCount = 0;
    await updateSingleFileProgress({
      jobId: "alias-1",
      phase: "processing",
      percent: 50,
      stage: "Processing...",
      expectedArtifactJobId: "job-1",
    });
    expect(redisMocks.publish).not.toHaveBeenCalled();

    dbMocks.rowCount = 1;
    await updateSingleFileProgress({
      jobId: "alias-1",
      phase: "processing",
      percent: 50,
      stage: "Processing...",
      expectedArtifactJobId: "job-1",
    });
    expect(redisMocks.publish).toHaveBeenCalledTimes(1);
    const publishedJson = (redisMocks.publish.mock.calls[0] as unknown[])[1] as string;
    expect(JSON.parse(publishedJson)).not.toHaveProperty("expectedArtifactJobId");
  });
});

describe("registerProgressRoutes idle unknown-job stream closure (#3853)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    dbMocks.failure = null;
    dbMocks.existing = [];
    redisMocks.get.mockResolvedValue(null);
    authMocks.user = { id: "user-1", username: "admin", role: "admin" };
    authMocks.filesAll = true;
    authMocks.permissionError = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    dbMocks.existing = [];
    authMocks.permissionError = null;
  });

  async function openStream(jobId: string) {
    let routeHandler:
      | ((req: Record<string, unknown>, rep: Record<string, unknown>) => Promise<unknown>)
      | undefined;
    await registerProgressRoutes({
      get: (_url: string, _opts: unknown, handler: typeof routeHandler) => {
        routeHandler = handler;
      },
    } as never);

    const closeHandlers: Array<() => void> = [];
    const writes: string[] = [];
    const warn = vi.fn();
    const end = vi.fn();
    const request = {
      params: { jobId },
      log: { warn },
      raw: {
        destroyed: false,
        socket: { setTimeout: vi.fn() },
        on: (event: string, cb: () => void) => {
          if (event === "close") closeHandlers.push(cb);
        },
      },
    };
    const reply = {
      hijack: vi.fn(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
      raw: {
        destroyed: false,
        writeHead: vi.fn(),
        write: vi.fn((chunk: string) => {
          writes.push(chunk);
        }),
        end,
      },
    };
    await routeHandler?.(request, reply);
    return {
      writes,
      warn,
      end,
      disconnect: () => {
        for (const cb of closeHandlers) cb();
      },
    };
  }

  it("closes an idle stream after the pre-upload grace window when no job row or frame appears for an admin or non-admin caller", async () => {
    for (const filesAll of [true, false]) {
      authMocks.filesAll = filesAll;
      const stream = await openStream(`unknown-${filesAll}`);

      await vi.advanceTimersByTimeAsync(9_500);
      expect(stream.end).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(500);
      expect(stream.end).toHaveBeenCalledTimes(1);
      expect(stream.warn).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: `unknown-${filesAll}` }),
        expect.stringContaining("no job row appeared"),
      );
      stream.disconnect();
    }
  });

  it("replays a queued row that appears during the grace window and keeps the stream open", async () => {
    authMocks.filesAll = false;
    const stream = await openStream("late-queued-job");

    dbMocks.existing = [
      {
        id: "late-queued-job",
        userId: "user-1",
        type: "single",
        status: "queued",
        progress: { percent: 15, stage: "Queued" },
        settings: {},
      },
    ];

    await vi.advanceTimersByTimeAsync(500);
    expect(stream.end).not.toHaveBeenCalled();
    expect(stream.writes).toEqual([
      `data: ${JSON.stringify({
        jobId: "late-queued-job",
        type: "single",
        phase: "processing",
        percent: 15,
        stage: "Queued",
      })}\n\n`,
    ]);

    // Stream remains open past the grace window once the job row exists.
    await vi.advanceTimersByTimeAsync(15_000);
    expect(stream.end).not.toHaveBeenCalled();
    stream.disconnect();
  });

  it("replays a completed row that appears during the grace window and closes the stream", async () => {
    authMocks.filesAll = false;
    const stream = await openStream("late-completed-job");

    dbMocks.existing = [
      {
        id: "late-completed-job",
        userId: "user-1",
        type: "single",
        status: "completed",
        progress: { percent: 100, result: { downloadUrl: "/api/v1/download/late/out.png" } },
        settings: {},
      },
    ];

    await vi.advanceTimersByTimeAsync(500);
    expect(stream.end).toHaveBeenCalledTimes(1);
    expect(stream.writes).toEqual([
      `data: ${JSON.stringify({
        jobId: "late-completed-job",
        type: "single",
        phase: "complete",
        percent: 100,
        result: { downloadUrl: "/api/v1/download/late/out.png" },
      })}\n\n`,
    ]);
    stream.disconnect();
  });

  it("closes without emitting frames when a row owned by another user appears during the grace window", async () => {
    authMocks.filesAll = false;
    const stream = await openStream("stranger-job");

    dbMocks.existing = [
      {
        id: "stranger-job",
        userId: "other-user",
        type: "single",
        status: "queued",
        progress: { percent: 50 },
        settings: {},
      },
    ];

    await vi.advanceTimersByTimeAsync(500);
    expect(stream.end).toHaveBeenCalledTimes(1);
    expect(stream.writes).toEqual([]);
    stream.disconnect();
  });

  it("retries on the next recheck tick when streamAccess throws a transient DB error", async () => {
    authMocks.filesAll = false;
    const stream = await openStream("transient-role-err-job");

    dbMocks.existing = [
      {
        id: "transient-role-err-job",
        userId: null,
        type: "single",
        status: "completed",
        progress: { percent: 100, result: { downloadUrl: "/api/v1/download/late/out.png" } },
        settings: {},
      },
    ];
    authMocks.permissionError = new Error("role lookup failed");

    await vi.advanceTimersByTimeAsync(500);
    expect(stream.warn).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "transient-role-err-job" }),
      "progress stream: access check failed",
    );
    expect(stream.end).not.toHaveBeenCalled();

    authMocks.permissionError = null;
    authMocks.filesAll = true;
    await vi.advanceTimersByTimeAsync(500);
    expect(stream.end).toHaveBeenCalledTimes(1);
    expect(stream.writes).toHaveLength(1);
    stream.disconnect();
  });
});
