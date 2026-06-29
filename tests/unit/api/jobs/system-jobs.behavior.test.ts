import { afterEach, describe, expect, it, vi } from "vitest";

const getQueueMock = vi.hoisted(() => vi.fn());
const runSiemForwardMock = vi.hoisted(() => vi.fn());
const runAuditArchiveMock = vi.hoisted(() => vi.fn());
const dbExecuteMock = vi.hoisted(() => vi.fn());
const dbUpdateMock = vi.hoisted(() => vi.fn());
const storageReconciliationJobMock = vi.hoisted(() => vi.fn());
const gdprExportJobMock = vi.hoisted(() => vi.fn());
const evaluateAlertsMock = vi.hoisted(() => vi.fn());

async function loadSystemJobs(cleanupIntervalMinutes = 15) {
  vi.resetModules();
  getQueueMock.mockReset();
  runSiemForwardMock.mockReset();
  runAuditArchiveMock.mockReset();
  dbExecuteMock.mockReset();
  dbUpdateMock.mockReset();
  storageReconciliationJobMock.mockReset();
  gdprExportJobMock.mockReset();
  evaluateAlertsMock.mockReset();

  vi.doMock("drizzle-orm", () => ({
    and: vi.fn(() => "and"),
    eq: vi.fn(() => "eq"),
    inArray: vi.fn(() => "inArray"),
    isNotNull: vi.fn(() => "isNotNull"),
    lt: vi.fn(() => "lt"),
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
      },
    },
  }));

  vi.doMock("../../../../apps/api/src/lib/cleanup.js", () => ({
    getMaxAgeMs: vi.fn().mockResolvedValue(0),
  }));

  vi.doMock("../../../../apps/api/src/lib/object-storage.js", () => ({
    deletePrefix: vi.fn(),
    listJobDirs: vi.fn().mockResolvedValue([]),
  }));

  vi.doMock("../../../../apps/api/src/lib/settings-helpers.js", () => ({
    getSettingNumber: vi.fn(),
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

  vi.doMock("../../../../apps/api/src/jobs/gdpr-export.js", () => ({
    gdprExportJob: gdprExportJobMock,
  }));

  vi.doMock("../../../../apps/api/src/jobs/alert-evaluator.js", () => ({
    evaluateAlerts: evaluateAlertsMock,
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
    const updateWhere = vi.fn().mockResolvedValue(undefined);
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
    await expect(runSystemJob({ name: "system:unknown" } as never)).rejects.toThrow(
      "Unknown system job: system:unknown",
    );
  });
});
