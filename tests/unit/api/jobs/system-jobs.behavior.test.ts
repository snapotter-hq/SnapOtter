import { afterEach, describe, expect, it, vi } from "vitest";

const getQueueMock = vi.hoisted(() => vi.fn());
const runSiemForwardMock = vi.hoisted(() => vi.fn());
const runAuditArchiveMock = vi.hoisted(() => vi.fn());
const dbExecuteMock = vi.hoisted(() => vi.fn());
const dbUpdateMock = vi.hoisted(() => vi.fn());
const deletePrefixMock = vi.hoisted(() => vi.fn());
const storageReconciliationJobMock = vi.hoisted(() => vi.fn());
const reconcileStrandedJobsMock = vi.hoisted(() => vi.fn());
const gdprExportJobMock = vi.hoisted(() => vi.fn());
const evaluateAlertsMock = vi.hoisted(() => vi.fn());
const loggerInfoMock = vi.hoisted(() => vi.fn());

async function loadSystemJobs(cleanupIntervalMinutes = 15) {
  vi.resetModules();
  getQueueMock.mockReset();
  runSiemForwardMock.mockReset();
  runAuditArchiveMock.mockReset();
  dbExecuteMock.mockReset();
  dbUpdateMock.mockReset();
  deletePrefixMock.mockReset();
  deletePrefixMock.mockResolvedValue(undefined);
  storageReconciliationJobMock.mockReset();
  reconcileStrandedJobsMock.mockReset();
  gdprExportJobMock.mockReset();
  evaluateAlertsMock.mockReset();
  loggerInfoMock.mockReset();

  vi.doMock("drizzle-orm", () => ({
    and: vi.fn((...conds: unknown[]) => ({ op: "and", conds })),
    eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
    inArray: vi.fn((col: unknown, vals: unknown) => ({ op: "inArray", col, vals })),
    isNotNull: vi.fn(() => "isNotNull"),
    lt: vi.fn(() => "lt"),
    ne: vi.fn(() => "ne"),
    sql: vi.fn(() => "sql"),
  }));

  vi.doMock("../../../../apps/api/src/config.js", () => ({
    env: {
      CLEANUP_INTERVAL_MINUTES: cleanupIntervalMinutes,
      JOBS_RETENTION_DAYS: 30,
      AUDIT_RETENTION_DAYS: 90,
    },
  }));

  vi.doMock("../../../../apps/api/src/db/index.js", () => ({
    db: {
      execute: dbExecuteMock.mockResolvedValue(undefined),
      update: dbUpdateMock,
    },
    schema: {
      jobs: {
        id: "jobs.id",
        status: "jobs.status",
      },
    },
  }));

  vi.doMock("../../../../apps/api/src/lib/cleanup.js", () => ({
    getMaxAgeMs: vi.fn().mockResolvedValue(0),
  }));

  vi.doMock("../../../../apps/api/src/lib/object-storage.js", () => ({
    deletePrefix: deletePrefixMock,
    listJobDirs: vi.fn().mockResolvedValue([]),
  }));

  vi.doMock("../../../../apps/api/src/lib/settings-helpers.js", () => ({
    getSettingStrict: vi.fn(),
    parseNumericSettingValue: vi.fn(),
  }));

  vi.doMock("../../../../apps/api/src/jobs/audit-archive.js", () => ({
    runAuditArchive: runAuditArchiveMock,
  }));

  vi.doMock("../../../../apps/api/src/jobs/queues.js", () => ({
    getQueue: getQueueMock,
  }));

  vi.doMock("../../../../apps/api/src/jobs/siem-forward.js", () => ({
    runSiemForward: runSiemForwardMock,
  }));

  vi.doMock("../../../../apps/api/src/jobs/storage-reconciliation.js", () => ({
    storageReconciliationJob: storageReconciliationJobMock,
  }));

  vi.doMock("../../../../apps/api/src/jobs/job-reconciliation.js", () => ({
    reconcilableJobRows: vi.fn(),
    reconcileStrandedJobs: reconcileStrandedJobsMock,
  }));

  vi.doMock("../../../../apps/api/src/jobs/gdpr-export.js", () => ({
    gdprExportJob: gdprExportJobMock,
  }));

  vi.doMock("../../../../apps/api/src/jobs/alert-evaluator.js", () => ({
    evaluateAlerts: evaluateAlertsMock,
  }));

  vi.doMock("../../../../apps/api/src/lib/logger.js", () => ({
    logger: {
      info: loggerInfoMock,
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }));

  return import("../../../../apps/api/src/jobs/system-jobs.js");
}

describe("system jobs behavior", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("decides expiry from local mtimes, S3 job rows, and rowless S3 directories", async () => {
    const { decideExpiry } = await loadSystemJobs();
    const cutoffMs = new Date("2026-06-29T12:00:00.000Z").getTime();
    const rowsById = new Map([
      [
        "job-old",
        {
          createdAt: new Date("2026-06-20T12:00:00.000Z"),
          completedAt: null,
        },
      ],
      [
        "job-new",
        {
          createdAt: new Date("2026-06-20T12:00:00.000Z"),
          completedAt: new Date("2026-06-29T12:01:00.000Z"),
        },
      ],
    ]);

    expect(decideExpiry({ key: "uploads/job-a", mtimeMs: cutoffMs - 1 }, cutoffMs, rowsById)).toBe(
      "expired",
    );
    expect(decideExpiry({ key: "outputs/job-b", mtimeMs: cutoffMs }, cutoffMs, rowsById)).toBe(
      "keep",
    );
    expect(decideExpiry({ key: "uploads/job-old", mtimeMs: 0 }, cutoffMs, rowsById)).toBe(
      "expired",
    );
    expect(decideExpiry({ key: "outputs/job-new", mtimeMs: 0 }, cutoffMs, rowsById)).toBe("keep");
    expect(decideExpiry({ key: "uploads/orphan", mtimeMs: 0 }, cutoffMs, rowsById)).toBe("skip");
  });

  it("schedules repeatable jobs and removes storage TTL scheduler when cleanup is disabled", async () => {
    const queue = {
      upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
      removeJobScheduler: vi.fn().mockResolvedValue(undefined),
    };
    const { SYSTEM_JOBS, scheduleSystemJobs } = await loadSystemJobs(0);
    getQueueMock.mockReturnValue(queue);

    await scheduleSystemJobs();

    expect(queue.removeJobScheduler).toHaveBeenCalledWith(SYSTEM_JOBS.storageTtl);
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(SYSTEM_JOBS.sessionPurge, {
      every: 60 * 60_000,
    });
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(SYSTEM_JOBS.retention, {
      every: 6 * 60 * 60_000,
    });
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(SYSTEM_JOBS.auditArchive, {
      pattern: "0 2 1 * *",
    });
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(SYSTEM_JOBS.storageReconciliation, {
      pattern: "0 3 * * 0",
    });
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(SYSTEM_JOBS.alertEvaluator, {
      every: 60_000,
    });
  });

  it("dispatches one-shot system jobs and updates GDPR export job rows", async () => {
    const updateReturning = vi.fn().mockResolvedValue([{ id: "export-job" }]);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();
    dbUpdateMock.mockReturnValue({ set: updateSet });
    runSiemForwardMock.mockResolvedValue({ forwarded: 2 });
    gdprExportJobMock.mockResolvedValue({ outputRef: "outputs/export-job/gdpr-export.zip" });
    storageReconciliationJobMock.mockResolvedValue(undefined);
    evaluateAlertsMock.mockResolvedValue(undefined);

    await expect(runSystemJob({ name: SYSTEM_JOBS.siemForward } as never)).resolves.toEqual({
      forwarded: 2,
    });
    await expect(runSystemJob({ name: SYSTEM_JOBS.storageReconciliation } as never)).resolves.toBe(
      undefined,
    );
    await expect(
      runSystemJob({
        name: SYSTEM_JOBS.gdprExport,
        data: { userId: "user-1", jobId: "export-job" },
      } as never),
    ).resolves.toEqual({ outputRef: "outputs/export-job/gdpr-export.zip" });
    await expect(runSystemJob({ name: SYSTEM_JOBS.alertEvaluator } as never)).resolves.toBe(
      undefined,
    );

    expect(gdprExportJobMock).toHaveBeenCalledWith("user-1", "export-job");
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        outputRefs: ["outputs/export-job/gdpr-export.zip"],
      }),
    );
    expect(updateWhere).toHaveBeenCalledWith({
      op: "and",
      conds: [
        { op: "eq", col: "jobs.id", val: "export-job" },
        { op: "inArray", col: "jobs.status", vals: ["queued", "processing"] },
      ],
    });
    await expect(runSystemJob({ name: "system:unknown" } as never)).rejects.toThrow(
      "Unknown system job: system:unknown",
    );
  });

  it("marks a GDPR export canceled rather than completed when gdprExportJob bails out (#1496)", async () => {
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();
    dbUpdateMock.mockReturnValue({ set: updateSet });
    gdprExportJobMock.mockResolvedValue({ outputRef: null });

    await expect(
      runSystemJob({
        name: SYSTEM_JOBS.gdprExport,
        data: { userId: "user-1", jobId: "export-canceled" },
      } as never),
    ).resolves.toEqual({ outputRef: null });

    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "canceled",
      }),
    );
    expect(updateWhere).toHaveBeenCalledWith({
      op: "and",
      conds: [
        { op: "eq", col: "jobs.id", val: "export-canceled" },
        { op: "inArray", col: "jobs.status", vals: ["queued", "processing"] },
      ],
    });
    expect(updateSet).not.toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
      }),
    );
  });

  it("deletes the export archive when the job row was canceled or deleted before the completed update commits (#1496)", async () => {
    const updateReturning = vi.fn().mockResolvedValue([]);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();
    dbUpdateMock.mockReturnValue({ set: updateSet });
    gdprExportJobMock.mockResolvedValue({ outputRef: "outputs/export-raced/gdpr-export.zip" });

    await expect(
      runSystemJob({
        name: SYSTEM_JOBS.gdprExport,
        data: { userId: "user-1", jobId: "export-raced" },
      } as never),
    ).resolves.toEqual({ outputRef: null });

    expect(deletePrefixMock).toHaveBeenCalledWith("outputs/export-raced/");
  });

  it("deletes the export archive and rethrows when the completed update faults (#1496)", async () => {
    const dbFault = new Error("connection reset by peer");
    const updateReturning = vi.fn().mockRejectedValue(dbFault);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();
    dbUpdateMock.mockReturnValue({ set: updateSet });
    gdprExportJobMock.mockResolvedValue({ outputRef: "outputs/export-fault/gdpr-export.zip" });

    await expect(
      runSystemJob({
        name: SYSTEM_JOBS.gdprExport,
        data: { userId: "user-1", jobId: "export-fault" },
      } as never),
    ).rejects.toBe(dbFault);

    expect(deletePrefixMock).toHaveBeenCalledWith("outputs/export-fault/");
  });

  it("reconciles stranded BullMQ jobs and fails orphaned tool_id-less rows older than 1 hour (#1726)", async () => {
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();
    reconcileStrandedJobsMock.mockResolvedValue({
      scanned: 2,
      recovered: 1,
      failed: 1,
      live: 0,
      raced: 0,
      outcomes: [],
    });
    dbExecuteMock.mockResolvedValue({ rowCount: 3 });

    await expect(runSystemJob({ name: SYSTEM_JOBS.jobReconciliation } as never)).resolves.toEqual({
      scanned: 2,
      recovered: 1,
      failed: 1,
      live: 0,
      raced: 0,
      orphaned: 3,
    });

    expect(reconcileStrandedJobsMock).toHaveBeenCalledTimes(1);
    expect(dbExecuteMock).toHaveBeenCalledTimes(1);
    expect(loggerInfoMock).toHaveBeenCalledWith({ count: 3 }, "Reconciled orphaned job rows");
  });
});
