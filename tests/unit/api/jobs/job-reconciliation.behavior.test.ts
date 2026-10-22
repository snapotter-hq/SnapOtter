import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const getQueueMock = vi.hoisted(() => vi.fn());
const listObjectsMock = vi.hoisted(() => vi.fn());
const getObjectBufferMock = vi.hoisted(() => vi.fn());
const getObjectSizeMock = vi.hoisted(() => vi.fn());
const isMissingObjectErrorMock = vi.hoisted(() => vi.fn());
const isStorageServiceFaultMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());
const loggerErrorMock = vi.hoisted(() => vi.fn());
const loggerWarnMock = vi.hoisted(() => vi.fn());
const clearTerminalReplayKeyMock = vi.hoisted(() => vi.fn());
const dbExecuteMock = vi.hoisted(() => vi.fn());
const dbSelectRows = vi.hoisted(() => ({ rows: [] as unknown[] }));
const dbStepRowsById = vi.hoisted(
  () =>
    new Map<
      string,
      {
        bytesIn: number | null;
        inputRefs: string[] | null;
      }
    >(),
);
const dbUpdateSetCalls = vi.hoisted(
  () => [] as Array<{ values: Record<string, unknown>; where?: unknown }>,
);
const dbUpdateReturningQueue = vi.hoisted(() => [] as Array<Array<{ id: string }>>);

async function loadJobReconciliation() {
  vi.resetModules();
  getQueueMock.mockReset();
  listObjectsMock.mockReset();
  getObjectBufferMock.mockReset();
  getObjectSizeMock.mockReset();
  isMissingObjectErrorMock.mockReset();
  isStorageServiceFaultMock.mockReset().mockReturnValue(false);
  reportErrorMock.mockReset();
  loggerErrorMock.mockReset();
  loggerWarnMock.mockReset();
  clearTerminalReplayKeyMock.mockReset().mockResolvedValue(undefined);
  dbExecuteMock.mockReset().mockResolvedValue({ rowCount: 0 });
  dbSelectRows.rows = [];
  dbStepRowsById.clear();
  dbUpdateSetCalls.length = 0;
  dbUpdateReturningQueue.length = 0;

  getQueueMock.mockReturnValue({
    getJob: vi.fn().mockResolvedValue(null),
  });

  const makeUpdateBuilder = () => {
    const builder = {
      set: vi.fn((values: Record<string, unknown>) => {
        const call: { values: Record<string, unknown>; where?: unknown } = { values };
        dbUpdateSetCalls.push(call);
        return {
          where: vi.fn((cond: unknown) => {
            call.where = cond;
            return {
              returning: vi.fn(async () => dbUpdateReturningQueue.shift() ?? [{ id: "settled" }]),
            };
          }),
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
      execute: dbExecuteMock,
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn((cond: unknown) => {
            const eqCond = cond as { op?: string; col?: unknown; val?: unknown } | undefined;
            const lookupStepRows = async () => {
              if (
                eqCond?.op === "eq" &&
                eqCond.col === "jobs.id" &&
                typeof eqCond.val === "string"
              ) {
                const row = dbStepRowsById.get(eqCond.val);
                return row ? [row] : [];
              }
              return [];
            };
            const promise = lookupStepRows();
            return Object.assign(promise, {
              orderBy: vi.fn(() => ({
                limit: vi.fn(async () => dbSelectRows.rows),
              })),
            });
          }),
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

  const actualObjectStorage = await vi.importActual<
    typeof import("../../../../apps/api/src/lib/object-storage.js")
  >("../../../../apps/api/src/lib/object-storage.js");

  vi.doMock("../../../../apps/api/src/lib/object-storage.js", () => ({
    getObjectBuffer: getObjectBufferMock,
    getObjectSize: getObjectSizeMock,
    isMissingObjectError: isMissingObjectErrorMock,
    isStorageServiceFault: isStorageServiceFaultMock,
    listObjects: listObjectsMock,
    normalizeS3ReadFault: actualObjectStorage.normalizeS3ReadFault,
  }));

  vi.doMock("../../../../apps/api/src/jobs/queues.js", () => ({
    getQueue: getQueueMock,
  }));

  vi.doMock("../../../../apps/api/src/routes/progress.js", () => ({
    clearTerminalReplayKey: clearTerminalReplayKeyMock,
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

  it("logs a warning when getObjectSize fails with a non-missing storage fault in resolveOriginalSize, but stays quiet on missing inputs (#2924)", async () => {
    const { reconcileStrandedJobs } = await loadJobReconciliation();

    dbSelectRows.rows = [
      {
        id: "job-size-fault",
        toolId: "merge-pdf",
        pool: "docs",
        type: "tool",
        status: "processing",
        bytesIn: null,
        inputRefs: [
          "uploads/job-size-fault/gone.pdf",
          "uploads/job-size-fault/denied.pdf",
          "uploads/job-size-fault/ok.pdf",
        ],
        progress: null,
      },
      {
        id: "job-all-size-fault",
        toolId: "compress-pdf",
        pool: "docs",
        type: "tool",
        status: "processing",
        bytesIn: null,
        inputRefs: ["uploads/job-all-size-fault/gone.pdf", "uploads/job-all-size-fault/eio.pdf"],
        progress: null,
      },
    ];

    listObjectsMock.mockImplementation(async (prefix: string) => {
      if (prefix === "outputs/job-size-fault/") {
        return [{ key: "outputs/job-size-fault/merged.pdf", size: 1024, mtimeMs: 2_000 }];
      }
      return [{ key: "outputs/job-all-size-fault/out.pdf", size: 512, mtimeMs: 2_000 }];
    });

    const enoentErr = Object.assign(new Error("ENOENT: no such file or directory"), {
      code: "ENOENT",
      syscall: "stat",
    });
    const eaccesErr = Object.assign(new Error("EACCES: permission denied, stat"), {
      code: "EACCES",
      syscall: "stat",
    });
    const eioErr = Object.assign(new Error("EIO: i/o error, stat"), {
      code: "EIO",
      syscall: "stat",
    });
    isMissingObjectErrorMock.mockImplementation(
      (err: unknown) => (err as { code?: string })?.code === "ENOENT",
    );
    getObjectSizeMock.mockImplementation(async (key: string) => {
      if (key.endsWith("/gone.pdf")) throw enoentErr;
      if (key.endsWith("/denied.pdf")) throw eaccesErr;
      if (key.endsWith("/eio.pdf")) throw eioErr;
      return 400;
    });

    const summary = await reconcileStrandedJobs({ graceMs: 0 });
    expect(summary.recovered).toBe(2);
    expect(dbUpdateSetCalls[0]?.values.bytesIn).toBe(400);
    expect(
      (dbUpdateSetCalls[0]?.values.progress as { result?: { originalSize?: number } })?.result
        ?.originalSize,
    ).toBe(400);
    expect(dbUpdateSetCalls[2]?.values.bytesIn).toBeNull();
    expect(
      (dbUpdateSetCalls[2]?.values.progress as { result?: { originalSize?: number } })?.result
        ?.originalSize,
    ).toBe(0);

    expect(loggerWarnMock).toHaveBeenCalledWith(
      {
        err: eaccesErr,
        jobId: "job-size-fault",
        key: "uploads/job-size-fault/denied.pdf",
      },
      "Failed to read input object size during job reconciliation; counting as 0 bytes",
    );
    expect(loggerWarnMock).toHaveBeenCalledWith(
      {
        err: eioErr,
        jobId: "job-all-size-fault",
        key: "uploads/job-all-size-fault/eio.pdf",
      },
      "Failed to read input object size during job reconciliation; counting as 0 bytes",
    );
    expect(
      loggerWarnMock.mock.calls.some(([ctx]) =>
        (ctx as { key?: string } | undefined)?.key?.endsWith("/gone.pdf"),
      ),
    ).toBe(false);
  });

  it("clears cached terminal replay keys for settled rows and aliases, skips raced rows, and logs a warning if Redis DEL fails (#2699)", async () => {
    const { reconcileStrandedJobs } = await loadJobReconciliation();

    dbSelectRows.rows = [
      {
        id: "job-recovered",
        toolId: "resize",
        pool: "image",
        type: "tool",
        status: "processing",
        bytesIn: 100,
        inputRefs: [],
        progress: null,
      },
      {
        id: "job-failed",
        toolId: "rotate",
        pool: "image",
        type: "tool",
        status: "queued",
        bytesIn: null,
        inputRefs: [],
        progress: null,
      },
      {
        id: "job-raced",
        toolId: "convert",
        pool: "image",
        type: "tool",
        status: "processing",
        bytesIn: 50,
        inputRefs: [],
        progress: null,
      },
    ];

    dbUpdateReturningQueue.push(
      [{ id: "job-recovered" }],
      [{ id: "alias-recovered" }],
      [{ id: "job-failed" }],
      [],
      [],
    );

    listObjectsMock.mockImplementation(async (prefix: string) => {
      if (prefix === "outputs/job-recovered/" || prefix === "outputs/job-raced/") {
        return [{ key: `${prefix}out.png`, size: 256, mtimeMs: 1_000 }];
      }
      return [];
    });

    const redisDelErr = new Error("READONLY You can't write against a read only replica");
    clearTerminalReplayKeyMock
      .mockRejectedValueOnce(redisDelErr)
      .mockRejectedValueOnce(redisDelErr);

    const summary = await reconcileStrandedJobs({ graceMs: 0 });
    expect(summary.recovered).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.raced).toBe(1);

    expect(clearTerminalReplayKeyMock).toHaveBeenCalledTimes(2);
    expect(clearTerminalReplayKeyMock).toHaveBeenNthCalledWith(
      1,
      "job-recovered",
      "alias-recovered",
    );
    expect(clearTerminalReplayKeyMock).toHaveBeenNthCalledWith(2, "job-failed");
    expect(loggerWarnMock).toHaveBeenCalledWith(
      {
        err: redisDelErr,
        jobId: "job-recovered",
        settledIds: ["job-recovered", "alias-recovered"],
      },
      "Failed to clear terminal replay cache after job reconciliation",
    );
    expect(loggerWarnMock).toHaveBeenCalledWith(
      { err: redisDelErr, jobId: "job-failed", settledIds: ["job-failed"] },
      "Failed to clear terminal replay cache after job reconciliation",
    );
  });

  it("matches both artifactJobId and pipelineFlowId in the alias update WHERE clause (#2701)", async () => {
    const { reconcileStrandedJobs } = await loadJobReconciliation();

    dbSelectRows.rows = [
      {
        id: "flow-recovered",
        toolId: "pipeline",
        pool: "image",
        type: "pipeline",
        status: "processing",
        bytesIn: 120,
        inputRefs: [],
        progress: null,
      },
      {
        id: "flow-failed",
        toolId: "pipeline",
        pool: "image",
        type: "pipeline",
        status: "queued",
        bytesIn: null,
        inputRefs: [],
        progress: null,
      },
    ];

    listObjectsMock.mockImplementation(async (prefix: string) => {
      if (prefix === "outputs/flow-recovered/") {
        return [{ key: "outputs/flow-recovered/out.png", size: 512, mtimeMs: 1_000 }];
      }
      return [];
    });

    const summary = await reconcileStrandedJobs({ graceMs: 0 });
    expect(summary.recovered).toBe(1);
    expect(summary.failed).toBe(1);

    const recoveredAliasWhere = dbUpdateSetCalls[1]?.where as {
      op: string;
      conds: Array<{
        op: string;
        col?: unknown;
        val?: unknown;
        vals?: unknown;
        strings?: string[];
      }>;
    };
    expect(recoveredAliasWhere).toEqual({
      op: "and",
      conds: [
        { op: "eq", col: "jobs.type", val: "single" },
        { op: "inArray", col: "jobs.status", vals: ["queued", "processing"] },
        {
          op: "sql",
          strings: ["(", "->>'artifactJobId' = ", " OR ", "->>'pipelineFlowId' = ", ")"],
          vals: ["jobs.settings", "flow-recovered", "jobs.settings", "flow-recovered"],
        },
      ],
    });

    const failedAliasWhere = dbUpdateSetCalls[3]?.where as typeof recoveredAliasWhere;
    expect(failedAliasWhere).toEqual({
      op: "and",
      conds: [
        { op: "eq", col: "jobs.type", val: "single" },
        { op: "inArray", col: "jobs.status", vals: ["queued", "processing"] },
        {
          op: "sql",
          strings: ["(", "->>'artifactJobId' = ", " OR ", "->>'pipelineFlowId' = ", ")"],
          vals: ["jobs.settings", "flow-failed", "jobs.settings", "flow-failed"],
        },
      ],
    });
  });

  it("falls back to step 0 bytesIn and inputRefs when recovering pipeline and pipeline-finalize rows (#2717)", async () => {
    const { reconcileStrandedJobs } = await loadJobReconciliation();

    dbSelectRows.rows = [
      {
        id: "pipe-step0-bytes",
        toolId: "pipeline",
        pool: "image",
        type: "pipeline",
        status: "processing",
        bytesIn: null,
        inputRefs: [],
        progress: null,
      },
      {
        id: "pipe-finalize-step0-refs",
        toolId: "pipeline",
        pool: "image",
        type: "pipeline-finalize",
        status: "processing",
        bytesIn: null,
        inputRefs: [],
        progress: null,
      },
      {
        id: "pipe-own-refs-zero-step0",
        toolId: "pipeline",
        pool: "image",
        type: "pipeline",
        status: "processing",
        bytesIn: null,
        inputRefs: ["uploads/pipe-own-refs-zero-step0/photo.png"],
        progress: null,
      },
      {
        id: "pipe-missing-step0",
        toolId: "pipeline",
        pool: "docs",
        type: "pipeline",
        status: "processing",
        bytesIn: null,
        inputRefs: ["uploads/pipe-missing-step0/doc.pdf"],
        progress: null,
      },
    ];

    dbStepRowsById.set("pipe-step0-bytes-s0", {
      bytesIn: 24_000,
      inputRefs: ["uploads/pipe-step0-bytes/photo.jpg"],
    });
    dbStepRowsById.set("pipe-finalize-step0-refs-s0", {
      bytesIn: null,
      inputRefs: ["uploads/pipe-finalize-step0-refs-s0/scan.png"],
    });
    dbStepRowsById.set("pipe-own-refs-zero-step0-s0", {
      bytesIn: 0,
      inputRefs: ["uploads/pipe-own-refs-zero-step0/ignored.png"],
    });

    listObjectsMock.mockImplementation(async (prefix: string) => {
      if (prefix === "outputs/pipe-step0-bytes/") {
        return [{ key: "outputs/pipe-step0-bytes/photo_rotated.jpg", size: 1_900, mtimeMs: 1_000 }];
      }
      if (prefix === "outputs/pipe-finalize-step0-refs/") {
        return [
          {
            key: "outputs/pipe-finalize-step0-refs/scan_out.png",
            size: 3_200,
            mtimeMs: 1_000,
          },
        ];
      }
      if (prefix === "outputs/pipe-own-refs-zero-step0/") {
        return [
          {
            key: "outputs/pipe-own-refs-zero-step0/photo_out.png",
            size: 4_100,
            mtimeMs: 1_000,
          },
        ];
      }
      if (prefix === "outputs/pipe-missing-step0/") {
        return [
          {
            key: "outputs/pipe-missing-step0/doc_out.pdf",
            size: 5_400,
            mtimeMs: 1_000,
          },
        ];
      }
      return [];
    });
    getObjectSizeMock.mockImplementation(async (key: string) => {
      if (key === "uploads/pipe-finalize-step0-refs-s0/scan.png") return 18_500;
      if (key === "uploads/pipe-own-refs-zero-step0/photo.png") return 12_300;
      if (key === "uploads/pipe-missing-step0/doc.pdf") return 9_800;
      throw new Error(`unexpected getObjectSize(${key})`);
    });

    const summary = await reconcileStrandedJobs({ graceMs: 0 });
    expect(summary.recovered).toBe(4);
    expect(getObjectSizeMock).toHaveBeenCalledTimes(3);
    expect(getObjectSizeMock).toHaveBeenCalledWith("uploads/pipe-finalize-step0-refs-s0/scan.png");
    expect(getObjectSizeMock).toHaveBeenCalledWith("uploads/pipe-own-refs-zero-step0/photo.png");
    expect(getObjectSizeMock).toHaveBeenCalledWith("uploads/pipe-missing-step0/doc.pdf");

    // dbUpdateSetCalls[0] = pipe-step0-bytes artifact row, [1] = its alias row
    expect(dbUpdateSetCalls[0]?.values).toMatchObject({
      status: "completed",
      bytesIn: 24_000,
      bytesOut: 1_900,
      progress: {
        percent: 100,
        stage: "complete",
        result: expect.objectContaining({
          jobId: "pipe-step0-bytes",
          originalSize: 24_000,
          processedSize: 1_900,
          reconciled: true,
        }),
      },
    });
    expect(dbUpdateSetCalls[1]?.values).toMatchObject({
      status: "completed",
      progress: {
        percent: 100,
        stage: "complete",
        result: expect.objectContaining({
          jobId: "pipe-step0-bytes",
          originalSize: 24_000,
          processedSize: 1_900,
          reconciled: true,
        }),
      },
    });

    // dbUpdateSetCalls[2] = pipe-finalize-step0-refs artifact row
    expect(dbUpdateSetCalls[2]?.values).toMatchObject({
      status: "completed",
      bytesIn: 18_500,
      bytesOut: 3_200,
      progress: {
        percent: 100,
        stage: "complete",
        result: expect.objectContaining({
          jobId: "pipe-finalize-step0-refs",
          originalSize: 18_500,
          processedSize: 3_200,
          reconciled: true,
        }),
      },
    });

    // dbUpdateSetCalls[4] = pipe-own-refs-zero-step0 artifact row
    expect(dbUpdateSetCalls[4]?.values).toMatchObject({
      status: "completed",
      bytesIn: 12_300,
      bytesOut: 4_100,
      progress: {
        percent: 100,
        stage: "complete",
        result: expect.objectContaining({
          jobId: "pipe-own-refs-zero-step0",
          originalSize: 12_300,
          processedSize: 4_100,
          reconciled: true,
        }),
      },
    });

    // dbUpdateSetCalls[6] = pipe-missing-step0 artifact row
    expect(dbUpdateSetCalls[6]?.values).toMatchObject({
      status: "completed",
      bytesIn: 9_800,
      bytesOut: 5_400,
      progress: {
        percent: 100,
        stage: "complete",
        result: expect.objectContaining({
          jobId: "pipe-missing-step0",
          originalSize: 9_800,
          processedSize: 5_400,
          reconciled: true,
        }),
      },
    });
  });

  it("reconciles startup orphaned rows while skipping single-file clientJobId aliases with non-terminal targets (#2700)", async () => {
    const mod = await loadJobReconciliation();
    expect(typeof mod.reconcileOrphanedJobsAtStartup).toBe("function");

    dbExecuteMock
      .mockResolvedValueOnce({ rowCount: 3 })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({});

    await expect(mod.reconcileOrphanedJobsAtStartup()).resolves.toBe(3);
    await expect(mod.reconcileOrphanedJobsAtStartup()).resolves.toBe(0);
    await expect(mod.reconcileOrphanedJobsAtStartup()).resolves.toBe(0);

    expect(dbExecuteMock).toHaveBeenCalledTimes(3);
    const query = dbExecuteMock.mock.calls[0]?.[0] as { strings?: string[]; vals?: unknown[] };
    const sqlText = (query?.strings ?? []).join(" ");
    expect(sqlText).toContain("UPDATE jobs");
    expect(sqlText).toContain("status = 'failed'");
    expect(sqlText).toContain('\'{"message":"Orphaned job reconciled at startup"}\'::jsonb');
    expect(sqlText).toContain("completed_at = now()");
    expect(sqlText).toContain("status IN ('processing', 'queued')");
    expect(sqlText).toContain("(tool_id IS NULL OR tool_id = '')");
    expect(sqlText).toContain("AND NOT (");
    expect(sqlText).toContain("type = 'single'");
    expect(sqlText).toContain("jobs.settings->>'artifactJobId'");
    expect(sqlText).toContain("jobs.settings->>'pipelineFlowId'");
    expect(sqlText).toContain("target.status IN ('processing', 'queued')");
    expect(sqlText).toContain("AND target.tool_id IS NOT NULL");
    expect(sqlText).toContain("AND target.tool_id <> ''");

    const indexSource = readFileSync(join(process.cwd(), "apps/api/src/index.ts"), "utf8");
    expect(indexSource).toContain("reconcileOrphanedJobsAtStartup()");
    expect(indexSource).not.toContain("Orphaned job reconciled at startup");
  });

  it("restores batch row.error from sidecar errors, strips result.errors, and preserves existing row.error when sidecar errors is empty (#3489)", async () => {
    const { reconcileStrandedJobs } = await loadJobReconciliation();

    dbSelectRows.rows = [
      {
        id: "batch-with-sidecar-errors",
        toolId: "compress",
        pool: "system",
        type: "batch",
        status: "processing",
        bytesIn: null,
        inputRefs: [],
        progress: { percent: 50, totalFiles: 3, completedFiles: 1, failedFiles: 0 },
      },
      {
        id: "batch-empty-sidecar-errors",
        toolId: "compress",
        pool: "system",
        type: "batch",
        status: "processing",
        bytesIn: null,
        inputRefs: [],
        progress: { percent: 100, totalFiles: 2, completedFiles: 2, failedFiles: 0 },
      },
    ];

    listObjectsMock.mockImplementation(async (prefix: string) => {
      if (prefix === "outputs/batch-with-sidecar-errors/") {
        return [
          {
            key: "outputs/batch-with-sidecar-errors/.result-payload.json",
            size: 128,
            mtimeMs: 1_000,
          },
          {
            key: "outputs/batch-with-sidecar-errors/batch-compress.zip",
            size: 2_048,
            mtimeMs: 1_001,
          },
        ];
      }
      if (prefix === "outputs/batch-empty-sidecar-errors/") {
        return [
          {
            key: "outputs/batch-empty-sidecar-errors/.result-payload.json",
            size: 96,
            mtimeMs: 1_000,
          },
          {
            key: "outputs/batch-empty-sidecar-errors/batch-compress.zip",
            size: 1_024,
            mtimeMs: 1_001,
          },
        ];
      }
      return [];
    });

    getObjectBufferMock.mockImplementation(async (key: string) => {
      if (key === "outputs/batch-with-sidecar-errors/.result-payload.json") {
        return Buffer.from(
          JSON.stringify({
            zipFilename: "batch-compress.zip",
            fileResults: { "1": "ok.jpg" },
            fileNotes: {},
            totalFiles: 3,
            completedFiles: 3,
            failedFiles: 2,
            errors: [
              { filename: "empty.jpg", error: "File is empty" },
              { filename: "corrupt.jpg", error: "Invalid image" },
              { filename: 123, error: "ignored malformed entry" },
              { filename: "missing-error.jpg", error: 456 },
              null,
            ],
          }),
          "utf8",
        );
      }
      if (key === "outputs/batch-empty-sidecar-errors/.result-payload.json") {
        return Buffer.from(
          JSON.stringify({
            zipFilename: "batch-compress.zip",
            fileResults: { "0": "a.jpg", "1": "b.jpg" },
            fileNotes: {},
            totalFiles: 2,
            completedFiles: 2,
            failedFiles: 0,
            errors: [],
          }),
          "utf8",
        );
      }
      throw new Error(`unexpected getObjectBuffer(${key})`);
    });

    const summary = await reconcileStrandedJobs({ graceMs: 0 });
    expect(summary.recovered).toBe(2);

    // dbUpdateSetCalls[0] = batch-with-sidecar-errors row, [1] = its alias check
    const withErrorsValues = dbUpdateSetCalls[0]?.values;
    expect(withErrorsValues).toMatchObject({
      status: "completed",
      bytesOut: 2_048,
      error: {
        message: "2 file(s) failed",
        details: [
          { filename: "empty.jpg", error: "File is empty" },
          { filename: "corrupt.jpg", error: "Invalid image" },
        ],
      },
      progress: {
        percent: 100,
        stage: "complete",
        totalFiles: 3,
        completedFiles: 3,
        failedFiles: 2,
      },
    });
    const withErrorsResult = (
      withErrorsValues?.progress as { result?: Record<string, unknown> } | undefined
    )?.result;
    expect(withErrorsResult?.errors).toBeUndefined();

    // dbUpdateSetCalls[2] = batch-empty-sidecar-errors row
    const emptyErrorsValues = dbUpdateSetCalls[2]?.values;
    expect(emptyErrorsValues?.error).toBeUndefined();
    const emptyErrorsResult = (
      emptyErrorsValues?.progress as { result?: Record<string, unknown> } | undefined
    )?.result;
    expect(emptyErrorsResult?.errors).toBeUndefined();
  });

  it("normalizes S3 service and EIO faults from listObjects and readResultPayload getObjectBuffer into 503 operational SafeErrors before logging and reporting (#3666)", async () => {
    const { reconcileStrandedJobs } = await loadJobReconciliation();
    const { classifyError } = await vi.importActual<
      typeof import("../../../../apps/api/src/lib/error-report.js")
    >("../../../../apps/api/src/lib/error-report.js");

    const s3Faults = [
      Object.assign(new Error("Please reduce your request rate."), {
        name: "SlowDown",
        $metadata: { httpStatusCode: 503 },
      }),
      Object.assign(new Error("Access Denied"), {
        name: "AccessDenied",
        $metadata: { httpStatusCode: 403 },
      }),
      Object.assign(new Error("The specified bucket does not exist"), {
        name: "NoSuchBucket",
        $metadata: { httpStatusCode: 404 },
      }),
      Object.assign(new Error("We encountered an internal error. Please try again."), {
        name: "InternalError",
        $metadata: { httpStatusCode: 500 },
      }),
      Object.assign(new Error("EIO: i/o error, read"), {
        code: "EIO",
        syscall: "read",
      }),
      Object.assign(new Error("Premature close"), {
        code: "ERR_STREAM_PREMATURE_CLOSE",
      }),
    ];

    isStorageServiceFaultMock.mockReturnValue(true);
    isMissingObjectErrorMock.mockReturnValue(false);

    // 1. listObjects faults in reconcileStrandedJobs
    for (const [idx, fault] of s3Faults.entries()) {
      reportErrorMock.mockClear();
      loggerErrorMock.mockClear();
      dbUpdateSetCalls.length = 0;
      const jobId = `job-s3-list-fault-${idx}`;
      dbSelectRows.rows = [
        {
          id: jobId,
          toolId: "convert",
          pool: "image",
          type: "tool",
          status: "processing",
          bytesIn: 100,
          inputRefs: [],
          progress: null,
        },
      ];
      listObjectsMock.mockRejectedValueOnce(fault);

      const summary = await reconcileStrandedJobs({ graceMs: 0 });
      expect(summary.outcomes).toEqual([]);
      expect(dbUpdateSetCalls).toHaveLength(0);
      expect(reportErrorMock).toHaveBeenCalledTimes(1);

      const [reportedErr, reportCtx] = reportErrorMock.mock.calls[0] as [
        unknown,
        Record<string, unknown>,
      ];
      expect(reportedErr).toMatchObject({
        name: "SafeError",
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        message: "The server's storage service is unavailable.",
        cause: fault,
      });
      expect(classifyError(reportedErr, "worker")).toBe("operational");
      expect(reportCtx).toEqual({
        source: "worker",
        pool: "system",
        toolId: "convert",
        jobId,
      });
      expect(loggerErrorMock).toHaveBeenCalledWith(
        { err: reportedErr, jobId, toolId: "convert" },
        "Failed to reconcile stranded job row; leaving non-terminal for next sweep",
      );
    }

    // 2. getObjectBuffer faults in readResultPayload
    for (const [idx, fault] of s3Faults.entries()) {
      reportErrorMock.mockClear();
      loggerErrorMock.mockClear();
      dbUpdateSetCalls.length = 0;
      const jobId = `job-s3-sidecar-fault-${idx}`;
      dbSelectRows.rows = [
        {
          id: jobId,
          toolId: "compress",
          pool: "image",
          type: "tool",
          status: "processing",
          bytesIn: 250,
          inputRefs: [],
          progress: null,
        },
      ];
      listObjectsMock.mockResolvedValueOnce([
        { key: `outputs/${jobId}/.result-payload.json`, size: 64, mtimeMs: 1_000 },
        { key: `outputs/${jobId}/out.jpg`, size: 512, mtimeMs: 1_001 },
      ]);
      getObjectBufferMock.mockRejectedValueOnce(fault);

      const summary = await reconcileStrandedJobs({ graceMs: 0 });
      expect(summary.outcomes).toEqual([]);
      expect(dbUpdateSetCalls).toHaveLength(0);
      expect(reportErrorMock).toHaveBeenCalledTimes(1);

      const [reportedErr, reportCtx] = reportErrorMock.mock.calls[0] as [
        unknown,
        Record<string, unknown>,
      ];
      expect(reportedErr).toMatchObject({
        name: "SafeError",
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        message: "The server's storage service is unavailable.",
        cause: fault,
      });
      expect(classifyError(reportedErr, "worker")).toBe("operational");
      expect(reportCtx).toEqual({
        source: "worker",
        pool: "system",
        toolId: "compress",
        jobId,
      });
      expect(loggerErrorMock).toHaveBeenCalledWith(
        { err: reportedErr, jobId, toolId: "compress" },
        "Failed to reconcile stranded job row; leaving non-terminal for next sweep",
      );
    }

    // 3. Missing sidecar (NoSuchKey / ENOENT) in readResultPayload recovers primary artifact without error
    isStorageServiceFaultMock.mockReturnValue(false);
    isMissingObjectErrorMock.mockReturnValueOnce(true);
    reportErrorMock.mockClear();
    loggerErrorMock.mockClear();
    dbUpdateSetCalls.length = 0;
    dbSelectRows.rows = [
      {
        id: "job-s3-missing-sidecar",
        toolId: "compress",
        pool: "image",
        type: "tool",
        status: "processing",
        bytesIn: 200,
        inputRefs: [],
        progress: null,
      },
    ];
    listObjectsMock.mockResolvedValueOnce([
      { key: "outputs/job-s3-missing-sidecar/.result-payload.json", size: 64, mtimeMs: 1_000 },
      { key: "outputs/job-s3-missing-sidecar/out.jpg", size: 512, mtimeMs: 1_001 },
    ]);
    getObjectBufferMock.mockRejectedValueOnce(
      Object.assign(new Error("The specified key does not exist."), {
        name: "NoSuchKey",
        $metadata: { httpStatusCode: 404 },
      }),
    );

    const missingSidecarSummary = await reconcileStrandedJobs({ graceMs: 0 });
    expect(missingSidecarSummary.recovered).toBe(1);
    expect(reportErrorMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).not.toHaveBeenCalled();

    // 4. Unexpected non-S3 defect in S3 mode still passes through normalizeS3ReadFault as a "bug"
    isStorageServiceFaultMock.mockReturnValue(true);
    isMissingObjectErrorMock.mockReturnValue(false);
    for (const stage of ["listObjects", "getObjectBuffer"] as const) {
      reportErrorMock.mockClear();
      loggerErrorMock.mockClear();
      const jobId = `job-s3-bug-${stage}`;
      dbSelectRows.rows = [
        {
          id: jobId,
          toolId: "resize",
          pool: "image",
          type: "tool",
          status: "processing",
          bytesIn: 100,
          inputRefs: [],
          progress: null,
        },
      ];
      const unexpectedBug = new TypeError(`unexpected ${stage} defect`);
      if (stage === "listObjects") {
        listObjectsMock.mockRejectedValueOnce(unexpectedBug);
      } else {
        listObjectsMock.mockResolvedValueOnce([
          { key: `outputs/${jobId}/.result-payload.json`, size: 64, mtimeMs: 1_000 },
          { key: `outputs/${jobId}/out.png`, size: 256, mtimeMs: 1_001 },
        ]);
        getObjectBufferMock.mockRejectedValueOnce(unexpectedBug);
      }

      await reconcileStrandedJobs({ graceMs: 0 });
      expect(reportErrorMock).toHaveBeenCalledTimes(1);
      const [reportedErr] = reportErrorMock.mock.calls[0] as [unknown];
      expect(reportedErr).toBe(unexpectedBug);
      expect(classifyError(reportedErr, "worker")).toBe("bug");
    }

    // 5. DB connectivity fault during settlement in S3 mode is not mislabeled as storage-unavailable
    reportErrorMock.mockClear();
    loggerErrorMock.mockClear();
    dbSelectRows.rows = [
      {
        id: "job-s3-db-fault",
        toolId: "rotate",
        pool: "image",
        type: "tool",
        status: "queued",
        bytesIn: null,
        inputRefs: [],
        progress: null,
      },
    ];
    listObjectsMock.mockResolvedValueOnce([]);
    const dbConnErr = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), {
      code: "ECONNREFUSED",
    });
    const { db } = await import("../../../../apps/api/src/db/index.js");
    vi.mocked(db.transaction).mockRejectedValueOnce(dbConnErr);

    await reconcileStrandedJobs({ graceMs: 0 });
    expect(reportErrorMock).toHaveBeenCalledWith(dbConnErr, {
      source: "worker",
      pool: "system",
      toolId: "rotate",
      jobId: "job-s3-db-fault",
    });
    expect(classifyError(dbConnErr, "worker")).toBe("operational");

    // 6. Local-mode EIO (isStorageServiceFault === false) bypasses normalizeS3ReadFault
    isStorageServiceFaultMock.mockReturnValue(false);
    reportErrorMock.mockClear();
    loggerErrorMock.mockClear();
    dbSelectRows.rows = [
      {
        id: "job-local-sidecar-eio",
        toolId: "compress",
        pool: "image",
        type: "tool",
        status: "processing",
        bytesIn: 100,
        inputRefs: [],
        progress: null,
      },
    ];
    const localEio = Object.assign(new Error("EIO: i/o error, read"), {
      code: "EIO",
      syscall: "read",
    });
    listObjectsMock.mockResolvedValueOnce([
      { key: "outputs/job-local-sidecar-eio/.result-payload.json", size: 64, mtimeMs: 1_000 },
      { key: "outputs/job-local-sidecar-eio/out.jpg", size: 256, mtimeMs: 1_001 },
    ]);
    getObjectBufferMock.mockRejectedValueOnce(localEio);

    await reconcileStrandedJobs({ graceMs: 0 });
    expect(reportErrorMock).toHaveBeenCalledWith(localEio, {
      source: "worker",
      pool: "system",
      toolId: "compress",
      jobId: "job-local-sidecar-eio",
    });
  });
});
