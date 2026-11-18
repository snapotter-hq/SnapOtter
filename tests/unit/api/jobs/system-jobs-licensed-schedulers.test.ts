/**
 * The SIEM forwarder and alert evaluator are repeatable jobs that return
 * immediately on an unlicensed instance. They must not be scheduled there, and
 * a scheduler left in Redis by an earlier licensed boot must be removed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getQueueMock = vi.fn();
const licensedFeatures = new Set<string>();

function makeQueue(removeImpl?: () => Promise<unknown>) {
  return {
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
    removeJobScheduler: vi.fn(removeImpl ?? (() => Promise.resolve(true))),
  };
}

async function loadSystemJobs() {
  vi.resetModules();
  vi.doMock("../../../../apps/api/src/config.js", () => ({
    env: { CLEANUP_INTERVAL_MINUTES: 15, JOBS_RETENTION_DAYS: 30, AUDIT_RETENTION_DAYS: 90 },
  }));
  vi.doMock("../../../../apps/api/src/db/index.js", () => ({ db: {}, schema: {} }));
  vi.doMock("../../../../apps/api/src/lib/analytics-gate.js", () => ({
    analyticsEnabled: () => false,
  }));
  vi.doMock("../../../../apps/api/src/lib/cleanup.js", () => ({ getMaxAgeMs: () => 0 }));
  vi.doMock("../../../../apps/api/src/lib/object-storage.js", () => ({
    deletePrefix: vi.fn(),
    listJobDirs: vi.fn(),
  }));
  vi.doMock("../../../../apps/api/src/lib/settings-helpers.js", () => ({
    getSettingStrict: vi.fn(),
    parseNumericSettingValue: vi.fn(),
  }));
  vi.doMock("../../../../apps/api/src/jobs/audit-archive.js", () => ({ runAuditArchive: vi.fn() }));
  vi.doMock("../../../../apps/api/src/jobs/job-reconciliation.js", () => ({
    reconcilableJobRows: vi.fn(),
    reconcileStrandedJobs: vi.fn(),
  }));
  vi.doMock("../../../../apps/api/src/jobs/siem-forward.js", () => ({ runSiemForward: vi.fn() }));
  vi.doMock("../../../../apps/api/src/jobs/queues.js", () => ({ getQueue: getQueueMock }));
  vi.doMock("../../../../apps/api/src/lib/enterprise-feature.js", () => ({
    isEnterpriseFeatureEnabled: vi.fn(async (feature: string) => licensedFeatures.has(feature)),
  }));
  vi.doMock("../../../../apps/api/src/lib/logger.js", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  }));
  return import("../../../../apps/api/src/jobs/system-jobs.js");
}

describe("scheduleSystemJobs licensed schedulers", () => {
  beforeEach(() => {
    licensedFeatures.clear();
    getQueueMock.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("schedules neither job on an unlicensed instance and clears stale schedulers", async () => {
    const queue = makeQueue();
    getQueueMock.mockReturnValue(queue);
    const { SYSTEM_JOBS, scheduleSystemJobs } = await loadSystemJobs();

    await scheduleSystemJobs();

    const scheduled = queue.upsertJobScheduler.mock.calls.map((c) => c[0]);
    expect(scheduled).not.toContain(SYSTEM_JOBS.siemForward);
    expect(scheduled).not.toContain(SYSTEM_JOBS.alertEvaluator);
    expect(queue.removeJobScheduler).toHaveBeenCalledWith(SYSTEM_JOBS.siemForward);
    expect(queue.removeJobScheduler).toHaveBeenCalledWith(SYSTEM_JOBS.alertEvaluator);
    // The unconditional sweeps are untouched.
    expect(scheduled).toContain(SYSTEM_JOBS.jobReconciliation);
    expect(scheduled).toContain(SYSTEM_JOBS.sessionPurge);
  });

  it("schedules both jobs at their original cadence when licensed", async () => {
    licensedFeatures.add("siem_forwarding");
    licensedFeatures.add("admin_alerts");
    const queue = makeQueue();
    getQueueMock.mockReturnValue(queue);
    const { SYSTEM_JOBS, scheduleSystemJobs } = await loadSystemJobs();

    await scheduleSystemJobs();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(SYSTEM_JOBS.siemForward, {
      every: 30_000,
    });
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(SYSTEM_JOBS.alertEvaluator, {
      every: 60_000,
    });
    expect(queue.removeJobScheduler).not.toHaveBeenCalled();
  });

  it("gates each job on its own feature", async () => {
    licensedFeatures.add("siem_forwarding");
    const queue = makeQueue();
    getQueueMock.mockReturnValue(queue);
    const { SYSTEM_JOBS, scheduleSystemJobs } = await loadSystemJobs();

    await scheduleSystemJobs();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(SYSTEM_JOBS.siemForward, {
      every: 30_000,
    });
    expect(queue.removeJobScheduler).toHaveBeenCalledWith(SYSTEM_JOBS.alertEvaluator);
    expect(queue.removeJobScheduler).not.toHaveBeenCalledWith(SYSTEM_JOBS.siemForward);
  });

  it("does not fail boot when removing a stale scheduler errors", async () => {
    const queue = makeQueue(() => Promise.reject(new Error("redis down")));
    getQueueMock.mockReturnValue(queue);
    const { scheduleSystemJobs } = await loadSystemJobs();

    await expect(scheduleSystemJobs()).resolves.toBeUndefined();
  });
});
