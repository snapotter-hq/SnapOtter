/**
 * Focused unit coverage for the system-jobs sweep, scheduling, and cron-monitor
 * branches that the integration suite exercises only on the happy path:
 *   - storageTtlSweep: legal-hold users/teams, deleteAfter sweep (ok + error),
 *     maxAgeMs<=0 and empty-dir early returns, per-dir deletePrefix failure,
 *     legal-hold skip on expired dirs, and the console.log/error side effects.
 *   - retentionSweep: jobs/audit retention on and off, tamper-resistant guard.
 *   - scheduleSystemJobs: the CLEANUP_INTERVAL_MINUTES>0 upsert path.
 *   - enqueueSystemJob: one-shot enqueue.
 *   - withCronMonitor: monitor disabled/enabled, Sentry import failure fallback.
 *
 * A dedicated fluent db mock keyed by the `from` table drives the many chained
 * select() calls in storageTtlSweep/retentionSweep deterministically.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const getQueueMock = vi.hoisted(() => vi.fn());
const runSiemForwardMock = vi.hoisted(() => vi.fn());
const runAuditArchiveMock = vi.hoisted(() => vi.fn());
const getMaxAgeMsMock = vi.hoisted(() => vi.fn());
const deletePrefixMock = vi.hoisted(() => vi.fn());
const listJobDirsMock = vi.hoisted(() => vi.fn());
const getSettingNumberMock = vi.hoisted(() => vi.fn());
const analyticsEnabledMock = vi.hoisted(() => vi.fn());
const dbExecuteMock = vi.hoisted(() => vi.fn());
const dbUpdateMock = vi.hoisted(() => vi.fn());

// -- Fluent db.select() mock --------------------------------------------------
// Each call to db.select(cols).from(table) pulls the next queued result for
// that table. .where() and .limit() are chainable and the builder is thenable
// so `await db.select()...where()` resolves to the queued rows.
type TableName = "users" | "teams" | "jobs" | "settings";

const selectQueues = vi.hoisted(() => ({
  users: [] as unknown[][],
  teams: [] as unknown[][],
  jobs: [] as unknown[][],
  settings: [] as unknown[][],
}));

const schemaMock = vi.hoisted(() => ({
  users: { id: "users.id", legalHold: "users.legalHold", team: "users.team" },
  teams: { id: "teams.id", legalHold: "teams.legalHold" },
  jobs: {
    id: "jobs.id",
    userId: "jobs.userId",
    createdAt: "jobs.createdAt",
    completedAt: "jobs.completedAt",
    deleteAfter: "jobs.deleteAfter",
  },
  settings: { key: "settings.key", value: "settings.value" },
}));

function tableNameOf(table: unknown): TableName {
  if (table === schemaMock.users) return "users";
  if (table === schemaMock.teams) return "teams";
  if (table === schemaMock.jobs) return "jobs";
  if (table === schemaMock.settings) return "settings";
  throw new Error("Unexpected table passed to db.select().from()");
}

// Sentinel: a queued THROW marker makes the resolved builder reject, letting a
// test drive the outer try/catch around a select() call.
const THROW = vi.hoisted(() => ({ __throw: new Error("select failed") }));

function makeBuilder() {
  let resolved: unknown[] = [];
  let rejection: Error | null = null;
  const builder: Record<string, unknown> = {
    from(table: unknown) {
      const name = tableNameOf(table);
      const queue = selectQueues[name];
      const next = queue.length > 0 ? queue.shift() : [];
      if (next === THROW) {
        rejection = THROW.__throw;
        resolved = [];
      } else {
        rejection = null;
        resolved = next as unknown[];
      }
      return builder;
    },
    where() {
      return builder;
    },
    limit() {
      return builder;
    },
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable mocking an awaitable Drizzle query builder
    then(onFulfilled: (v: unknown[]) => unknown, onRejected?: (e: unknown) => unknown) {
      if (rejection) return Promise.reject(rejection).then(onFulfilled, onRejected);
      return Promise.resolve(resolved).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

function queueSelect(table: TableName, rows: unknown[] | typeof THROW): void {
  selectQueues[table].push(rows as unknown[]);
}

function resetSelectQueues(): void {
  selectQueues.users = [];
  selectQueues.teams = [];
  selectQueues.jobs = [];
  selectQueues.settings = [];
}

async function loadSystemJobs(
  envOverrides: Record<string, unknown> = {},
): Promise<typeof import("../../../../apps/api/src/jobs/system-jobs.js")> {
  vi.resetModules();
  resetSelectQueues();
  getQueueMock.mockReset();
  runSiemForwardMock.mockReset();
  runAuditArchiveMock.mockReset();
  getMaxAgeMsMock.mockReset();
  deletePrefixMock.mockReset();
  listJobDirsMock.mockReset();
  getSettingNumberMock.mockReset();
  analyticsEnabledMock.mockReset();
  dbExecuteMock.mockReset();
  dbUpdateMock.mockReset();

  // Sensible defaults; individual tests override.
  deletePrefixMock.mockResolvedValue(undefined);
  listJobDirsMock.mockResolvedValue([]);
  dbExecuteMock.mockResolvedValue(undefined);
  analyticsEnabledMock.mockReturnValue(true);

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
      CLEANUP_INTERVAL_MINUTES: 15,
      JOBS_RETENTION_DAYS: 30,
      AUDIT_RETENTION_DAYS: 90,
      ...envOverrides,
    },
  }));

  vi.doMock("../../../../apps/api/src/db/index.js", () => ({
    db: {
      select: vi.fn(() => makeBuilder()),
      execute: dbExecuteMock,
      update: dbUpdateMock,
    },
    schema: schemaMock,
  }));

  vi.doMock("../../../../apps/api/src/lib/analytics-gate.js", () => ({
    analyticsEnabled: analyticsEnabledMock,
  }));

  vi.doMock("../../../../apps/api/src/lib/cleanup.js", () => ({
    getMaxAgeMs: getMaxAgeMsMock,
  }));

  vi.doMock("../../../../apps/api/src/lib/object-storage.js", () => ({
    deletePrefix: deletePrefixMock,
    listJobDirs: listJobDirsMock,
  }));

  vi.doMock("../../../../apps/api/src/lib/settings-helpers.js", () => ({
    getSettingNumber: getSettingNumberMock,
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

  return import("../../../../apps/api/src/jobs/system-jobs.js");
}

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

// -- scheduleSystemJobs / enqueueSystemJob ------------------------------------

describe("scheduleSystemJobs (interval > 0)", () => {
  it("upserts the storageTtl scheduler with the configured interval", async () => {
    const queue = {
      upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
      removeJobScheduler: vi.fn().mockResolvedValue(undefined),
    };
    const { SYSTEM_JOBS, scheduleSystemJobs } = await loadSystemJobs({
      CLEANUP_INTERVAL_MINUTES: 15,
    });
    getQueueMock.mockReturnValue(queue);

    await scheduleSystemJobs();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(SYSTEM_JOBS.storageTtl, {
      every: 15 * 60_000,
    });
    // The disabled-path removeJobScheduler must NOT run when interval > 0.
    expect(queue.removeJobScheduler).not.toHaveBeenCalled();
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(SYSTEM_JOBS.siemForward, {
      every: 30_000,
    });
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(SYSTEM_JOBS.alertEvaluator, {
      every: 60_000,
    });
  });
});

describe("enqueueSystemJob", () => {
  it("adds a payload-less job under the given name to the system queue", async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const { enqueueSystemJob } = await loadSystemJobs();
    getQueueMock.mockReturnValue({ add });

    await enqueueSystemJob("system:storage-ttl");

    expect(getQueueMock).toHaveBeenCalledWith("system");
    expect(add).toHaveBeenCalledWith("system:storage-ttl", {});
  });
});

// -- withCronMonitor via runSystemJob -----------------------------------------

describe("withCronMonitor", () => {
  it("runs the job directly when the job name has no monitor config", async () => {
    // siemForward has no MONITOR_CONFIG entry, so withCronMonitor short-circuits.
    process.env.SENTRY_CRON_MONITORS = "1";
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();
    runSiemForwardMock.mockResolvedValue({ forwarded: 3 });

    await expect(runSystemJob({ name: SYSTEM_JOBS.siemForward } as never)).resolves.toEqual({
      forwarded: 3,
    });
  });

  it("runs the job directly when cron monitors are disabled", async () => {
    // sessionPurge HAS a monitor config, but SENTRY_CRON_MONITORS is unset.
    delete process.env.SENTRY_CRON_MONITORS;
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();

    await runSystemJob({ name: SYSTEM_JOBS.sessionPurge } as never);

    // sessionPurge executes a DELETE via db.execute.
    expect(dbExecuteMock).toHaveBeenCalledTimes(1);
  });

  it("runs the job directly when analytics is disabled even if the env flag is set", async () => {
    process.env.SENTRY_CRON_MONITORS = "true";
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();
    analyticsEnabledMock.mockReturnValue(false);

    await runSystemJob({ name: SYSTEM_JOBS.sessionPurge } as never);

    expect(analyticsEnabledMock).toHaveBeenCalled();
    expect(dbExecuteMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to running the job when the Sentry import path throws", async () => {
    // Enabled path: cfg present + monitors enabled -> tries to import @sentry/node.
    // We don't mock @sentry/node; whether the import resolves or the catch fires,
    // the underlying job must still run. Assert on the job's observable effect.
    process.env.SENTRY_CRON_MONITORS = "1";
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();

    await runSystemJob({ name: SYSTEM_JOBS.sessionPurge } as never);

    // Whether withMonitor wraps fn or the catch fallback re-runs it, the
    // underlying sessionPurge DELETE must have executed.
    expect(dbExecuteMock).toHaveBeenCalled();
  });
});

// -- dispatchSystemJob: retention + auditArchive ------------------------------

describe("dispatchSystemJob retention", () => {
  it("deletes old jobs and old audit rows when both retentions are positive and tamper mode is off", async () => {
    delete process.env.SENTRY_CRON_MONITORS;
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();
    getSettingNumberMock.mockResolvedValueOnce(30).mockResolvedValueOnce(90);
    // tamperResistantAudit setting lookup returns no rows -> not tamper resistant.
    queueSelect("settings", []);

    await runSystemJob({ name: SYSTEM_JOBS.retention } as never);

    // One DELETE FROM jobs + one DELETE FROM audit_log.
    expect(dbExecuteMock).toHaveBeenCalledTimes(2);
    expect(getSettingNumberMock).toHaveBeenCalledWith("jobsRetentionDays", 30);
    expect(getSettingNumberMock).toHaveBeenCalledWith("auditRetentionDays", 90);
  });

  it("skips the jobs delete when jobsRetentionDays is 0", async () => {
    delete process.env.SENTRY_CRON_MONITORS;
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();
    getSettingNumberMock.mockResolvedValueOnce(0).mockResolvedValueOnce(90);
    queueSelect("settings", []);

    await runSystemJob({ name: SYSTEM_JOBS.retention } as never);

    // Only the audit_log delete runs.
    expect(dbExecuteMock).toHaveBeenCalledTimes(1);
  });

  it("skips the audit delete when auditRetentionDays is 0", async () => {
    delete process.env.SENTRY_CRON_MONITORS;
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();
    getSettingNumberMock.mockResolvedValueOnce(30).mockResolvedValueOnce(0);

    await runSystemJob({ name: SYSTEM_JOBS.retention } as never);

    // Only the jobs delete runs; the settings lookup for tamper mode is skipped.
    expect(dbExecuteMock).toHaveBeenCalledTimes(1);
  });

  it("preserves audit rows when tamper-resistant mode is on", async () => {
    delete process.env.SENTRY_CRON_MONITORS;
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();
    getSettingNumberMock.mockResolvedValueOnce(30).mockResolvedValueOnce(90);
    queueSelect("settings", [{ value: "true" }]);

    await runSystemJob({ name: SYSTEM_JOBS.retention } as never);

    // Jobs delete runs, but the audit_log delete is suppressed.
    expect(dbExecuteMock).toHaveBeenCalledTimes(1);
  });
});

describe("dispatchSystemJob auditArchive", () => {
  it("delegates to runAuditArchive", async () => {
    delete process.env.SENTRY_CRON_MONITORS;
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();
    runAuditArchiveMock.mockResolvedValue(undefined);

    await runSystemJob({ name: SYSTEM_JOBS.auditArchive } as never);

    expect(runAuditArchiveMock).toHaveBeenCalledTimes(1);
  });
});

// -- storageTtlSweep ----------------------------------------------------------

describe("storageTtlSweep", () => {
  // Helper: minimal held-user/held-team select seeding for a sweep with no
  // legal holds (the common case).
  function seedNoLegalHold(): void {
    queueSelect("users", []); // held direct users
    queueSelect("teams", []); // held teams (length 0 -> team-user lookup skipped)
  }

  it("cleans jobs by deleteAfter, then early-returns when maxAgeMs <= 0", async () => {
    delete process.env.SENTRY_CRON_MONITORS;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();

    seedNoLegalHold();
    // Two jobs past their deleteAfter deadline.
    queueSelect("jobs", [
      { id: "job-a", userId: null },
      { id: "job-b", userId: "user-x" },
    ]);
    getMaxAgeMsMock.mockResolvedValue(0);

    const result = await runSystemJob({ name: SYSTEM_JOBS.storageTtl } as never);

    const logCalls = logSpy.mock.calls.map((c) => c[0]);
    expect(result).toEqual({ removed: 2, failed: 0 });
    // Two prefixes per job (uploads + outputs) x 2 jobs.
    expect(deletePrefixMock).toHaveBeenCalledWith("uploads/job-a");
    expect(deletePrefixMock).toHaveBeenCalledWith("outputs/job-a");
    expect(deletePrefixMock).toHaveBeenCalledTimes(4);
    expect(logCalls).toContain("Storage TTL: cleaned up 2 jobs by deleteAfter");
    logSpy.mockRestore();
  });

  it("skips deleteAfter jobs belonging to a legal-hold user", async () => {
    delete process.env.SENTRY_CRON_MONITORS;
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();

    queueSelect("users", [{ id: "held-user" }]); // one held user
    queueSelect("teams", []); // no held teams
    // First deleteAfter job is held (skipped), second is deletable.
    queueSelect("jobs", [
      { id: "job-held", userId: "held-user" },
      { id: "job-free", userId: "other" },
    ]);
    getMaxAgeMsMock.mockResolvedValue(0);

    const result = await runSystemJob({ name: SYSTEM_JOBS.storageTtl } as never);

    expect(result).toEqual({ removed: 1, failed: 0 });
    expect(deletePrefixMock).toHaveBeenCalledWith("uploads/job-free");
    expect(deletePrefixMock).not.toHaveBeenCalledWith("uploads/job-held");
  });

  it("expands legal hold through team membership", async () => {
    delete process.env.SENTRY_CRON_MONITORS;
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();

    queueSelect("users", []); // no direct held users
    queueSelect("teams", [{ id: "team-1" }]); // one held team
    queueSelect("users", [{ id: "team-user" }]); // members of held teams
    // deleteAfter job belongs to the team member -> must be skipped.
    queueSelect("jobs", [{ id: "job-team", userId: "team-user" }]);
    getMaxAgeMsMock.mockResolvedValue(0);

    const result = await runSystemJob({ name: SYSTEM_JOBS.storageTtl } as never);

    expect(result).toEqual({ removed: 0, failed: 0 });
    expect(deletePrefixMock).not.toHaveBeenCalled();
  });

  it("swallows a deleteAfter deletePrefix failure without incrementing the counter", async () => {
    delete process.env.SENTRY_CRON_MONITORS;
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();

    queueSelect("users", []);
    queueSelect("teams", []);
    queueSelect("jobs", [{ id: "boom", userId: null }]);
    deletePrefixMock.mockRejectedValue(new Error("S3 down"));
    getMaxAgeMsMock.mockResolvedValue(0);

    const result = await runSystemJob({ name: SYSTEM_JOBS.storageTtl } as never);

    // The try/catch swallows the failure; deleteAfterCleaned stays 0.
    expect(result).toEqual({ removed: 0, failed: 0 });
  });

  it("recovers when the whole deleteAfter query throws (best-effort), then runs the global sweep", async () => {
    delete process.env.SENTRY_CRON_MONITORS;
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();

    queueSelect("users", []);
    queueSelect("teams", []);
    // The deleteAfter select rejects; the outer try/catch must swallow it.
    queueSelect("jobs", THROW);
    getMaxAgeMsMock.mockResolvedValue(3_600_000);

    const oldMtime = Date.now() - 7_200_000;
    listJobDirsMock.mockImplementation(async (prefix: "uploads" | "outputs") => {
      if (prefix === "uploads") return [{ key: "uploads/after-throw", size: 0, mtimeMs: oldMtime }];
      return [];
    });

    const result = await runSystemJob({ name: SYSTEM_JOBS.storageTtl } as never);

    // deleteAfterCleaned stayed 0 (query threw); the global sweep still removed 1.
    expect(result).toEqual({ removed: 1, failed: 0 });
    expect(deletePrefixMock).toHaveBeenCalledWith("uploads/after-throw");
  });

  it("expires stale local dirs in the global sweep and logs the removal", async () => {
    delete process.env.SENTRY_CRON_MONITORS;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();

    queueSelect("users", []);
    queueSelect("teams", []);
    queueSelect("jobs", []); // no deleteAfter jobs
    getMaxAgeMsMock.mockResolvedValue(3_600_000); // 1h max age

    const now = Date.now();
    listJobDirsMock.mockImplementation(async (prefix: "uploads" | "outputs") => {
      if (prefix === "uploads") {
        return [
          { key: "uploads/stale", size: 0, mtimeMs: now - 7_200_000 }, // 2h old -> expired
          { key: "uploads/fresh", size: 0, mtimeMs: now }, // fresh -> kept
        ];
      }
      return [];
    });

    const result = await runSystemJob({ name: SYSTEM_JOBS.storageTtl } as never);

    const logCalls = logSpy.mock.calls.map((c) => c[0]);
    expect(result).toEqual({ removed: 1, failed: 0 });
    expect(deletePrefixMock).toHaveBeenCalledWith("uploads/stale");
    expect(deletePrefixMock).not.toHaveBeenCalledWith("uploads/fresh");
    expect(logCalls).toContain("Storage TTL: removed 1 expired job dirs");
    logSpy.mockRestore();
  });

  it("records failures and logs them when a global-sweep deletePrefix throws", async () => {
    delete process.env.SENTRY_CRON_MONITORS;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();

    queueSelect("users", []);
    queueSelect("teams", []);
    queueSelect("jobs", []);
    getMaxAgeMsMock.mockResolvedValue(3_600_000);

    const oldMtime = Date.now() - 7_200_000;
    listJobDirsMock.mockImplementation(async (prefix: "uploads" | "outputs") => {
      if (prefix === "uploads") {
        return [{ key: "uploads/broken", size: 0, mtimeMs: oldMtime }];
      }
      return [{ key: "outputs/okay", size: 0, mtimeMs: oldMtime }];
    });
    deletePrefixMock.mockImplementation(async (prefix: string) => {
      if (prefix === "uploads/broken") throw new Error("perm denied");
    });

    const result = await runSystemJob({ name: SYSTEM_JOBS.storageTtl } as never);

    const errCalls = errSpy.mock.calls.map((c) => c[0]);
    expect(result).toEqual({ removed: 1, failed: 1 });
    expect(errCalls.some((m) => String(m).includes("uploads/broken: perm denied"))).toBe(true);
    errSpy.mockRestore();
  });

  it("stringifies non-Error rejections from a failed deletePrefix", async () => {
    delete process.env.SENTRY_CRON_MONITORS;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();

    queueSelect("users", []);
    queueSelect("teams", []);
    queueSelect("jobs", []);
    getMaxAgeMsMock.mockResolvedValue(3_600_000);

    const oldMtime = Date.now() - 7_200_000;
    listJobDirsMock.mockImplementation(async (prefix: "uploads" | "outputs") => {
      if (prefix === "uploads") return [{ key: "uploads/weird", size: 0, mtimeMs: oldMtime }];
      return [];
    });
    // Reject with a non-Error value to hit the String(err) branch.
    deletePrefixMock.mockRejectedValue("plain string failure");

    const result = await runSystemJob({ name: SYSTEM_JOBS.storageTtl } as never);

    const errCalls = errSpy.mock.calls.map((c) => c[0]);
    expect(result).toEqual({ removed: 0, failed: 1 });
    expect(errCalls.some((m) => String(m).includes("uploads/weird: plain string failure"))).toBe(
      true,
    );
    errSpy.mockRestore();
  });

  it("skips deleting expired dirs whose job belongs to a legal-hold user", async () => {
    delete process.env.SENTRY_CRON_MONITORS;
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();

    queueSelect("users", [{ id: "vip" }]); // one held user -> triggers jobUserMap lookup
    queueSelect("teams", []);
    queueSelect("jobs", []); // no deleteAfter jobs
    getMaxAgeMsMock.mockResolvedValue(3_600_000);

    const oldMtime = Date.now() - 7_200_000;
    listJobDirsMock.mockImplementation(async (prefix: "uploads" | "outputs") => {
      if (prefix === "uploads") {
        return [
          { key: "uploads/held-dir", size: 0, mtimeMs: oldMtime },
          { key: "uploads/free-dir", size: 0, mtimeMs: oldMtime },
        ];
      }
      return [];
    });
    // jobUserMap lookup: held-dir -> vip (held), free-dir -> someone else.
    queueSelect("jobs", [
      { id: "held-dir", userId: "vip" },
      { id: "free-dir", userId: "nobody" },
    ]);

    const result = await runSystemJob({ name: SYSTEM_JOBS.storageTtl } as never);

    expect(result).toEqual({ removed: 1, failed: 0 });
    expect(deletePrefixMock).toHaveBeenCalledWith("uploads/free-dir");
    expect(deletePrefixMock).not.toHaveBeenCalledWith("uploads/held-dir");
  });

  it("resolves S3 dirs (mtimeMs=0) against the batched jobs rows", async () => {
    delete process.env.SENTRY_CRON_MONITORS;
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();

    queueSelect("users", []);
    queueSelect("teams", []);
    queueSelect("jobs", []); // no deleteAfter jobs
    getMaxAgeMsMock.mockResolvedValue(3_600_000);

    const cutoff = Date.now() - 3_600_000;
    listJobDirsMock.mockImplementation(async (prefix: "uploads" | "outputs") => {
      if (prefix === "uploads") {
        return [
          { key: "uploads/s3-old", size: 0, mtimeMs: 0 },
          { key: "uploads/s3-new", size: 0, mtimeMs: 0 },
        ];
      }
      return [];
    });
    // Batched rows lookup for the unknown-mtime dirs.
    queueSelect("jobs", [
      { id: "s3-old", createdAt: new Date(cutoff - 10_000), completedAt: null },
      { id: "s3-new", createdAt: new Date(cutoff + 10_000), completedAt: null },
    ]);

    const result = await runSystemJob({ name: SYSTEM_JOBS.storageTtl } as never);

    expect(result).toEqual({ removed: 1, failed: 0 });
    expect(deletePrefixMock).toHaveBeenCalledWith("uploads/s3-old");
    expect(deletePrefixMock).not.toHaveBeenCalledWith("uploads/s3-new");
  });
});
