import { afterEach, describe, expect, it, vi } from "vitest";

const getQueueMock = vi.hoisted(() => vi.fn());
const listObjectsMock = vi.hoisted(() => vi.fn());
const getObjectBufferMock = vi.hoisted(() => vi.fn());
const getObjectSizeMock = vi.hoisted(() => vi.fn());
const isMissingObjectErrorMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());
const loggerErrorMock = vi.hoisted(() => vi.fn());
const loggerWarnMock = vi.hoisted(() => vi.fn());
const dbSelectRows = vi.hoisted(() => ({ rows: [] as unknown[] }));
const dbUpdateSetCalls = vi.hoisted(() => [] as Array<{ values: Record<string, unknown> }>);

async function loadJobReconciliation() {
  vi.resetModules();
  getQueueMock.mockReset();
  listObjectsMock.mockReset();
  getObjectBufferMock.mockReset();
  getObjectSizeMock.mockReset();
  isMissingObjectErrorMock.mockReset();
  reportErrorMock.mockReset();
  loggerErrorMock.mockReset();
  loggerWarnMock.mockReset();
  dbSelectRows.rows = [];
  dbUpdateSetCalls.length = 0;

  getQueueMock.mockReturnValue({
    getJob: vi.fn().mockResolvedValue(null),
  });

  const makeUpdateBuilder = () => {
    const builder = {
      set: vi.fn((values: Record<string, unknown>) => {
        dbUpdateSetCalls.push({ values });
        return {
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: "settled" }]),
          })),
        };
      }),
    };
    return builder;
  };

  vi.doMock("drizzle-orm", () => ({
    and: vi.fn((...conds: unknown[]) => ({ op: "and", conds })),
    eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
    inArray: vi.fn((col: unknown, vals: unknown) => ({ op: "inArray", col, vals })),
    isNotNull: vi.fn((col: unknown) => ({ op: "isNotNull", col })),
    lt: vi.fn((col: unknown, val: unknown) => ({ op: "lt", col, val })),
    ne: vi.fn((col: unknown, val: unknown) => ({ op: "ne", col, val })),
    sql: vi.fn((strings: TemplateStringsArray, ...vals: unknown[]) => ({
      op: "sql",
      strings: [...strings],
      vals,
    })),
  }));

  vi.doMock("../../../../apps/api/src/db/index.js", () => ({
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(async () => dbSelectRows.rows),
            })),
          })),
        })),
      })),
      transaction: vi.fn(async (fn: (tx: { update: typeof makeUpdateBuilder }) => unknown) =>
        fn({ update: makeUpdateBuilder }),
      ),
    },
    schema: {
      jobs: {
        id: "jobs.id",
        toolId: "jobs.toolId",
        pool: "jobs.pool",
        type: "jobs.type",
        status: "jobs.status",
        bytesIn: "jobs.bytesIn",
        inputRefs: "jobs.inputRefs",
        progress: "jobs.progress",
        createdAt: "jobs.createdAt",
        settings: "jobs.settings",
      },
    },
  }));

  vi.doMock("../../../../apps/api/src/lib/error-report.js", () => ({
    reportError: reportErrorMock,
  }));

  vi.doMock("../../../../apps/api/src/lib/logger.js", () => ({
    logger: {
      error: loggerErrorMock,
      warn: loggerWarnMock,
    },
  }));

  vi.doMock("../../../../apps/api/src/lib/object-storage.js", () => ({
    getObjectBuffer: getObjectBufferMock,
    getObjectSize: getObjectSizeMock,
    isMissingObjectError: isMissingObjectErrorMock,
    listObjects: listObjectsMock,
  }));

  vi.doMock("../../../../apps/api/src/jobs/queues.js", () => ({
    getQueue: getQueueMock,
  }));

  return import("../../../../apps/api/src/jobs/job-reconciliation.js");
}

describe("reconcileStrandedJobs per-row fault isolation (#1498)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs and reports a per-row listObjects fault, leaves that row untouched, and continues reconciling subsequent rows", async () => {
    const { reconcileStrandedJobs } = await loadJobReconciliation();

    dbSelectRows.rows = [
      {
        id: "job-fault",
        toolId: "convert",
        pool: "image",
        type: "tool",
        status: "processing",
        bytesIn: 100,
        inputRefs: [],
        progress: null,
      },
      {
        id: "job-recover",
        toolId: "resize",
        pool: "image",
        type: "tool",
        status: "processing",
        bytesIn: 200,
        inputRefs: [],
        progress: null,
      },
      {
        id: "job-empty",
        toolId: "rotate",
        pool: "image",
        type: "tool",
        status: "queued",
        bytesIn: null,
        inputRefs: [],
        progress: null,
      },
    ];

    const storageErr = Object.assign(new Error("EACCES: permission denied, scandir"), {
      code: "EACCES",
      syscall: "scandir",
    });
    listObjectsMock.mockImplementation(async (prefix: string) => {
      if (prefix === "outputs/job-fault/") throw storageErr;
      if (prefix === "outputs/job-recover/") {
        return [{ key: "outputs/job-recover/out.png", size: 512, mtimeMs: 1_000 }];
      }
      return [];
    });

    const summary = await reconcileStrandedJobs({ graceMs: 0 });

    expect(summary).toEqual({
      scanned: 3,
      recovered: 1,
      failed: 1,
      live: 0,
      raced: 0,
      outcomes: [
        {
          jobId: "job-recover",
          toolId: "resize",
          previousStatus: "processing",
          resolution: "recovered",
          outputRefs: ["outputs/job-recover/out.png"],
        },
        {
          jobId: "job-empty",
          toolId: "rotate",
          previousStatus: "queued",
          resolution: "failed",
        },
      ],
    });

    // 4 updates total: artifact + alias for job-recover (completed), artifact + alias for job-empty (failed).
    // No DB update was issued for job-fault.
    expect(dbUpdateSetCalls.map((c) => c.values.status)).toEqual([
      "completed",
      "completed",
      "failed",
      "failed",
    ]);
    expect(dbUpdateSetCalls[0]?.values.outputRefs).toEqual(["outputs/job-recover/out.png"]);

    expect(loggerErrorMock).toHaveBeenCalledWith(
      { err: storageErr, jobId: "job-fault", toolId: "convert" },
      "Failed to reconcile stranded job row; leaving non-terminal for next sweep",
    );
    expect(reportErrorMock).toHaveBeenCalledWith(storageErr, {
      source: "worker",
      pool: "system",
      toolId: "convert",
      jobId: "job-fault",
    });
    expect(loggerWarnMock).toHaveBeenCalledWith(
      {
        recovered: 1,
        failed: 1,
        jobIds: ["job-recover", "job-empty"],
      },
      "Reconciled stranded job rows with no live queue entry",
    );
  });

  it("does not emit the reconciled summary warning when every candidate row faults, and maps null toolId to undefined on reportError", async () => {
    const { reconcileStrandedJobs } = await loadJobReconciliation();

    dbSelectRows.rows = [
      {
        id: "job-only-fault",
        toolId: null,
        pool: "image",
        type: "tool",
        status: "processing",
        bytesIn: null,
        inputRefs: [],
        progress: null,
      },
    ];

    const storageErr = Object.assign(new Error("EIO: i/o error, scandir"), {
      code: "EIO",
      syscall: "scandir",
    });
    listObjectsMock.mockRejectedValue(storageErr);

    const summary = await reconcileStrandedJobs({ graceMs: 0 });

    expect(summary).toEqual({
      scanned: 1,
      recovered: 0,
      failed: 0,
      live: 0,
      raced: 0,
      outcomes: [],
    });
    expect(dbUpdateSetCalls).toHaveLength(0);
    expect(loggerWarnMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      { err: storageErr, jobId: "job-only-fault", toolId: null },
      "Failed to reconcile stranded job row; leaving non-terminal for next sweep",
    );
    expect(reportErrorMock).toHaveBeenCalledWith(storageErr, {
      source: "worker",
      pool: "system",
      toolId: undefined,
      jobId: "job-only-fault",
    });
  });

  it("propagates a Redis queue-lookup fault instead of looping through remaining candidates", async () => {
    const { reconcileStrandedJobs } = await loadJobReconciliation();

    dbSelectRows.rows = [
      {
        id: "job-redis-down",
        toolId: "convert",
        pool: "image",
        type: "tool",
        status: "queued",
        bytesIn: null,
        inputRefs: [],
        progress: null,
      },
    ];

    const redisErr = new Error("ECONNREFUSED 127.0.0.1:6379");
    getQueueMock.mockReturnValue({
      getJob: vi.fn().mockRejectedValue(redisErr),
    });

    await expect(reconcileStrandedJobs({ graceMs: 0 })).rejects.toBe(redisErr);
    expect(listObjectsMock).not.toHaveBeenCalled();
    expect(dbUpdateSetCalls).toHaveLength(0);
  });
});
