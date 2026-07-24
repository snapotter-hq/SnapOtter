/**
 * Mutation-hardening unit coverage for apps/api/src/jobs/system-jobs.ts.
 *
 * The sibling system-jobs.behavior / system-jobs.sweeps suites cover the sweep
 * control flow; this file exists to pin the exact values and boundaries that
 * Stryker mutants flip without those suites noticing:
 *   - scheduleSystemJobs: the queue name and every/pattern arithmetic.
 *   - MONITOR_CONFIG: each monitor's slug, schedule, checkinMargin, maxRuntime,
 *     and the Math.max(1, ...) floor -- all observed through Sentry.withMonitor.
 *   - cronMonitorsEnabled: which SENTRY_CRON_MONITORS values arm the monitor.
 *   - withCronMonitor: the ":"->"-" slug transform and the catch fallback.
 *   - dispatchSystemJob: the exact DELETE FROM sessions SQL text.
 *   - decideExpiry: the ageMs < cutoffMs boundary on the S3-row branch.
 *   - storageTtlSweep: empty-set early return dropping deleteAfterCleaned, the
 *     removed + deleteAfterCleaned sum, the deleteAfter/error/removed log
 *     guards, the held-team and held-user select gating, and listJobDirs args.
 *   - retentionSweep: the jobs/audit DELETE SQL text, the interpolated window
 *     day counts, the tamperResistantAudit key, and the "off when value=false"
 *     branch of the tamper guard.
 *
 * A capturing drizzle mock records every sql`` template (strings + interpolated
 * values) and every eq() argument pair so string/arithmetic mutants inside the
 * SQL become observable. The db.select() builder is fluent and queued per table.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

// -- Hoisted seam mocks -------------------------------------------------------

const getQueueMock = vi.hoisted(() => vi.fn());
const runSiemForwardMock = vi.hoisted(() => vi.fn());
const runAuditArchiveMock = vi.hoisted(() => vi.fn());
const getMaxAgeMsMock = vi.hoisted(() => vi.fn());
const deletePrefixMock = vi.hoisted(() => vi.fn());
const listJobDirsMock = vi.hoisted(() => vi.fn());
const getSettingNumberMock = vi.hoisted(() => vi.fn());
const analyticsEnabledMock = vi.hoisted(() => vi.fn());
const dbExecuteMock = vi.hoisted(() => vi.fn());
const dbSelectMock = vi.hoisted(() => vi.fn());
const withMonitorMock = vi.hoisted(() => vi.fn());

// Captured drizzle sql`` calls: each is { strings, values }.
interface SqlCall {
  strings: readonly string[];
  values: unknown[];
}
const sqlCalls = vi.hoisted(() => [] as SqlCall[]);
// Captured eq(col, value) argument pairs.
const eqCalls = vi.hoisted(() => [] as unknown[][]);

// -- Fluent, queued db.select() builder ---------------------------------------

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

function makeBuilder(): Record<string, unknown> {
  let resolved: unknown[] = [];
  const builder: Record<string, unknown> = {
    from(table: unknown) {
      const name = tableNameOf(table);
      const queue = selectQueues[name];
      resolved = (queue.length > 0 ? queue.shift() : []) as unknown[];
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
      return Promise.resolve(resolved).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

function queueSelect(table: TableName, rows: unknown[]): void {
  selectQueues[table].push(rows);
}

function resetSelectQueues(): void {
  selectQueues.users = [];
  selectQueues.teams = [];
  selectQueues.jobs = [];
  selectQueues.settings = [];
}

/** Flatten a captured sql`` template back into a single comparable string. */
function sqlText(call: SqlCall): string {
  return call.strings.join(" ");
}

/** The full concatenated text of every sql`` template captured this test. */
function allSqlText(): string {
  return sqlCalls.map(sqlText).join(" || ");
}

async function loadSystemJobs(
  envOverrides: Record<string, unknown> = {},
): Promise<typeof import("../../../../apps/api/src/jobs/system-jobs.js")> {
  vi.resetModules();
  resetSelectQueues();
  sqlCalls.length = 0;
  eqCalls.length = 0;
  getQueueMock.mockReset();
  runSiemForwardMock.mockReset();
  runAuditArchiveMock.mockReset();
  getMaxAgeMsMock.mockReset();
  deletePrefixMock.mockReset();
  listJobDirsMock.mockReset();
  getSettingNumberMock.mockReset();
  analyticsEnabledMock.mockReset();
  dbExecuteMock.mockReset();
  dbSelectMock.mockReset();
  withMonitorMock.mockReset();

  deletePrefixMock.mockResolvedValue(undefined);
  listJobDirsMock.mockResolvedValue([]);
  dbExecuteMock.mockResolvedValue(undefined);
  analyticsEnabledMock.mockReturnValue(true);
  dbSelectMock.mockImplementation(() => makeBuilder());
  // Default: withMonitor just runs the supplied fn (like the real happy path).
  withMonitorMock.mockImplementation((_slug: string, fn: () => Promise<unknown>) => fn());

  vi.doMock("drizzle-orm", () => ({
    and: vi.fn(() => "and"),
    eq: vi.fn((...args: unknown[]) => {
      eqCalls.push(args);
      return "eq";
    }),
    inArray: vi.fn(() => "inArray"),
    isNotNull: vi.fn(() => "isNotNull"),
    lt: vi.fn(() => "lt"),
    // Capturing tagged-template mock: records the literal strings and the
    // interpolated values so SQL-text and window-arithmetic mutants are visible.
    sql: vi.fn((strings: readonly string[], ...values: unknown[]) => {
      sqlCalls.push({ strings, values });
      return { __sql: true, strings, values };
    }),
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
      select: dbSelectMock,
      execute: dbExecuteMock,
      update: vi.fn(),
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

  // The source does `await import("@sentry/node")` inside withCronMonitor.
  // Aliased to apps/api's node_modules by vitest.config, so this mock intercepts.
  vi.doMock("@sentry/node", () => ({
    withMonitor: withMonitorMock,
  }));

  return import("../../../../apps/api/src/jobs/system-jobs.js");
}

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

// -- scheduleSystemJobs -------------------------------------------------------

describe("scheduleSystemJobs value pinning", () => {
  function makeQueue() {
    return {
      upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
      removeJobScheduler: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("pulls the 'system' queue and pins every repeatable schedule's interval/pattern", async () => {
    const queue = makeQueue();
    const { SYSTEM_JOBS, scheduleSystemJobs } = await loadSystemJobs({
      CLEANUP_INTERVAL_MINUTES: 15,
    });
    getQueueMock.mockReturnValue(queue);

    await scheduleSystemJobs();

    // Kills StringLiteral "" on getQueue("system") (line 38).
    expect(getQueueMock).toHaveBeenCalledWith("system");

    // storageTtl: CLEANUP_INTERVAL_MINUTES * 60_000 = 900_000.
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(SYSTEM_JOBS.storageTtl, {
      every: 900_000,
    });
    // sessionPurge: 60 * 60_000.
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(SYSTEM_JOBS.sessionPurge, {
      every: 3_600_000,
    });
    // retention: 6 * 60 * 60_000.
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(SYSTEM_JOBS.retention, {
      every: 21_600_000,
    });
    // siemForward: 30_000.
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(SYSTEM_JOBS.siemForward, {
      every: 30_000,
    });
    // auditArchive + storageReconciliation crontab patterns.
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(SYSTEM_JOBS.auditArchive, {
      pattern: "0 2 1 * *",
    });
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(SYSTEM_JOBS.storageReconciliation, {
      pattern: "0 3 * * 0",
    });
    // alertEvaluator: 60_000.
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(SYSTEM_JOBS.alertEvaluator, {
      every: 60_000,
    });
  });

  it("scales the storageTtl interval with a non-default CLEANUP_INTERVAL_MINUTES", async () => {
    const queue = makeQueue();
    const { SYSTEM_JOBS, scheduleSystemJobs } = await loadSystemJobs({
      CLEANUP_INTERVAL_MINUTES: 5,
    });
    getQueueMock.mockReturnValue(queue);

    await scheduleSystemJobs();

    // 5 * 60_000 = 300_000 (distinguishes the * operator and the literal).
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(SYSTEM_JOBS.storageTtl, {
      every: 300_000,
    });
  });
});

// -- cronMonitorsEnabled + withCronMonitor + MONITOR_CONFIG --------------------

describe("withCronMonitor: enabled path wires Sentry.withMonitor precisely", () => {
  it("arms the monitor with the ':'->'-' slug and the exact sessionPurge config", async () => {
    process.env.SENTRY_CRON_MONITORS = "1";
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();

    await runSystemJob({ name: SYSTEM_JOBS.sessionPurge } as never);

    // BooleanLiteral / ConditionalExpression: with cfg present AND monitors
    // enabled, withCronMonitor must NOT short-circuit -- it must call withMonitor.
    expect(withMonitorMock).toHaveBeenCalledTimes(1);
    const [slug, fn, cfg] = withMonitorMock.mock.calls[0];
    // Slug transform: "system:session-purge" -> "system-session-purge".
    expect(slug).toBe("system-session-purge");
    expect(slug).not.toContain(":");
    expect(typeof fn).toBe("function");
    // sessionPurge MONITOR_CONFIG (lines 99-103).
    expect(cfg).toEqual({
      schedule: { type: "interval", value: 1, unit: "hour" },
      checkinMargin: 10,
      maxRuntime: 5,
    });
    // The wrapped job still executed its DELETE.
    expect(dbExecuteMock).toHaveBeenCalledTimes(1);
  });

  it("passes the exact retention monitor config (interval 6 hours, margins)", async () => {
    process.env.SENTRY_CRON_MONITORS = "1";
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();
    getSettingNumberMock.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    await runSystemJob({ name: SYSTEM_JOBS.retention } as never);

    const [slug, , cfg] = withMonitorMock.mock.calls[0];
    expect(slug).toBe("system-retention");
    // retention MONITOR_CONFIG (lines 104-108).
    expect(cfg).toEqual({
      schedule: { type: "interval", value: 6, unit: "hour" },
      checkinMargin: 15,
      maxRuntime: 30,
    });
  });

  it("floors the storageTtl monitor interval at 1 via Math.max (kills Math.min)", async () => {
    // CLEANUP_INTERVAL_MINUTES=15 => Math.max(1,15)=15 (min would give 1).
    process.env.SENTRY_CRON_MONITORS = "1";
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs({ CLEANUP_INTERVAL_MINUTES: 15 });
    getMaxAgeMsMock.mockResolvedValue(0);
    // storageTtl sweep first reads held users/teams, then deleteAfter jobs.
    queueSelect("users", []);
    queueSelect("teams", []);
    queueSelect("jobs", []);

    await runSystemJob({ name: SYSTEM_JOBS.storageTtl } as never);

    const [slug, , cfg] = withMonitorMock.mock.calls[0];
    expect(slug).toBe("system-storage-ttl");
    // storageTtl MONITOR_CONFIG (lines 90-98): value is the Math.max floor.
    expect(cfg).toEqual({
      schedule: { type: "interval", value: 15, unit: "minute" },
      checkinMargin: 5,
      maxRuntime: 20,
    });
  });

  it("still floors at 1 when CLEANUP_INTERVAL_MINUTES is 0 (disabled sweep)", async () => {
    // Math.max(1, 0) = 1; a Math.min mutant would yield 0.
    process.env.SENTRY_CRON_MONITORS = "1";
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs({ CLEANUP_INTERVAL_MINUTES: 0 });
    getMaxAgeMsMock.mockResolvedValue(0);
    queueSelect("users", []);
    queueSelect("teams", []);
    queueSelect("jobs", []);

    await runSystemJob({ name: SYSTEM_JOBS.storageTtl } as never);

    const [, , cfg] = withMonitorMock.mock.calls[0];
    expect((cfg as { schedule: { value: number } }).schedule.value).toBe(1);
  });

  it('arms the monitor when SENTRY_CRON_MONITORS is exactly "1"', async () => {
    process.env.SENTRY_CRON_MONITORS = "1";
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();

    await runSystemJob({ name: SYSTEM_JOBS.sessionPurge } as never);

    // Kills `v === "1"` -> `v !== "1"` and the StringLiteral "" replacements.
    expect(withMonitorMock).toHaveBeenCalledTimes(1);
  });

  it('arms the monitor when SENTRY_CRON_MONITORS is "true"', async () => {
    process.env.SENTRY_CRON_MONITORS = "true";
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();

    await runSystemJob({ name: SYSTEM_JOBS.sessionPurge } as never);

    expect(withMonitorMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT arm the monitor for an unrelated SENTRY_CRON_MONITORS value", async () => {
    // "0" is neither "1" nor "true": the OR must stay false.
    process.env.SENTRY_CRON_MONITORS = "0";
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();

    await runSystemJob({ name: SYSTEM_JOBS.sessionPurge } as never);

    expect(withMonitorMock).not.toHaveBeenCalled();
    // Job still ran directly.
    expect(dbExecuteMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT arm the monitor when analytics egress is disabled", async () => {
    process.env.SENTRY_CRON_MONITORS = "1";
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();
    analyticsEnabledMock.mockReturnValue(false);

    await runSystemJob({ name: SYSTEM_JOBS.sessionPurge } as never);

    // Kills the `&& analyticsEnabled()` guard: without egress, no monitor.
    expect(analyticsEnabledMock).toHaveBeenCalled();
    expect(withMonitorMock).not.toHaveBeenCalled();
    expect(dbExecuteMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to running the job directly when Sentry.withMonitor throws", async () => {
    process.env.SENTRY_CRON_MONITORS = "1";
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();
    // Force the try body to throw so the catch (line 137) re-runs fn().
    withMonitorMock.mockImplementation(() => {
      throw new Error("sentry boom");
    });

    await runSystemJob({ name: SYSTEM_JOBS.sessionPurge } as never);

    // The catch must swallow and still run the underlying DELETE.
    expect(withMonitorMock).toHaveBeenCalledTimes(1);
    expect(dbExecuteMock).toHaveBeenCalledTimes(1);
  });
});

// -- dispatchSystemJob: sessionPurge SQL text ---------------------------------

describe("dispatchSystemJob sessionPurge SQL", () => {
  it("issues the exact DELETE FROM sessions statement", async () => {
    delete process.env.SENTRY_CRON_MONITORS;
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();

    await runSystemJob({ name: SYSTEM_JOBS.sessionPurge } as never);

    expect(dbExecuteMock).toHaveBeenCalledTimes(1);
    // Kills the StringLiteral `` on the sessions delete template (line 154).
    const text = allSqlText();
    expect(text).toContain("DELETE FROM sessions");
    expect(text).toContain("expires_at < now()");
  });
});

// -- decideExpiry boundary (S3-row branch, line 221) --------------------------

describe("decideExpiry S3-row age boundary", () => {
  it("keeps a row whose age exactly equals the cutoff (strict <, not <=)", async () => {
    const { decideExpiry } = await loadSystemJobs();
    const cutoffMs = new Date("2026-07-01T00:00:00.000Z").getTime();
    // completedAt == cutoff exactly: `ageMs < cutoffMs` is false -> keep.
    const rowsById = new Map([
      ["exact", { createdAt: new Date(cutoffMs - 1000), completedAt: new Date(cutoffMs) }],
    ]);

    expect(decideExpiry({ key: "uploads/exact", mtimeMs: 0 }, cutoffMs, rowsById)).toBe("keep");
    // One millisecond older -> expired (guards the operator direction).
    const rowsOlder = new Map([
      ["older", { createdAt: new Date(cutoffMs - 1000), completedAt: new Date(cutoffMs - 1) }],
    ]);
    expect(decideExpiry({ key: "uploads/older", mtimeMs: 0 }, cutoffMs, rowsOlder)).toBe("expired");
  });

  it("uses createdAt as the age basis when completedAt is null", async () => {
    const { decideExpiry } = await loadSystemJobs();
    const cutoffMs = new Date("2026-07-01T00:00:00.000Z").getTime();
    // completedAt null -> falls back to createdAt (before cutoff) -> expired.
    const rowsById = new Map([["c", { createdAt: new Date(cutoffMs - 1), completedAt: null }]]);
    expect(decideExpiry({ key: "outputs/c", mtimeMs: 0 }, cutoffMs, rowsById)).toBe("expired");
  });
});

// -- storageTtlSweep value/branch pinning -------------------------------------

describe("storageTtlSweep return arithmetic and empty-set handling", () => {
  it("drops the deleteAfter count on the empty-dir early return (removed:0)", async () => {
    // deleteAfterCleaned=2, maxAgeMs>0, but no dirs -> the allDirs.length===0
    // early return intentionally reports removed:0 (NOT removed:2).
    delete process.env.SENTRY_CRON_MONITORS;
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();
    queueSelect("users", []);
    queueSelect("teams", []);
    queueSelect("jobs", [
      { id: "d1", userId: null },
      { id: "d2", userId: null },
    ]);
    getMaxAgeMsMock.mockResolvedValue(3_600_000);
    listJobDirsMock.mockResolvedValue([]); // both uploads + outputs empty

    const result = await runSystemJob({ name: SYSTEM_JOBS.storageTtl } as never);

    // Kills ConditionalExpression `false` on line 285 (fall-through would give
    // removed:2 because deleteAfterCleaned would be added at line 343).
    expect(result).toEqual({ removed: 0, failed: 0 });
    // The two deleteAfter jobs were still cleaned (4 deletePrefix calls).
    expect(deletePrefixMock).toHaveBeenCalledTimes(4);
  });

  it("returns removed = global-sweep removals + deleteAfterCleaned (sum, not diff)", async () => {
    // deleteAfterCleaned=2 and one expired global dir -> 2 + 1 = 3.
    delete process.env.SENTRY_CRON_MONITORS;
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();
    queueSelect("users", []);
    queueSelect("teams", []);
    queueSelect("jobs", [
      { id: "da1", userId: null },
      { id: "da2", userId: null },
    ]);
    getMaxAgeMsMock.mockResolvedValue(3_600_000);
    const oldMtime = Date.now() - 7_200_000;
    listJobDirsMock.mockImplementation(async (prefix: "uploads" | "outputs") => {
      if (prefix === "uploads") return [{ key: "uploads/stale", size: 0, mtimeMs: oldMtime }];
      return [];
    });

    const result = await runSystemJob({ name: SYSTEM_JOBS.storageTtl } as never);

    // Kills ArithmeticOperator `removed - deleteAfterCleaned` (line 343):
    // the minus mutant would yield removed = 1 - 2 = -1.
    expect(result).toEqual({ removed: 3, failed: 0 });
  });

  it("passes 'uploads' and 'outputs' to listJobDirs", async () => {
    delete process.env.SENTRY_CRON_MONITORS;
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();
    queueSelect("users", []);
    queueSelect("teams", []);
    queueSelect("jobs", []);
    getMaxAgeMsMock.mockResolvedValue(3_600_000);

    await runSystemJob({ name: SYSTEM_JOBS.storageTtl } as never);

    // Kills StringLiteral "" on listJobDirs("outputs") (line 283) and its pair.
    expect(listJobDirsMock).toHaveBeenCalledWith("uploads");
    expect(listJobDirsMock).toHaveBeenCalledWith("outputs");
  });
});

describe("storageTtlSweep log-guard boundaries", () => {
  it("does NOT log the deleteAfter line when zero jobs were cleaned", async () => {
    // No expired deleteAfter jobs -> deleteAfterCleaned stays 0.
    delete process.env.SENTRY_CRON_MONITORS;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();
    queueSelect("users", []);
    queueSelect("teams", []);
    queueSelect("jobs", []); // no deleteAfter jobs
    getMaxAgeMsMock.mockResolvedValue(0); // early-return after deleteAfter block

    await runSystemJob({ name: SYSTEM_JOBS.storageTtl } as never);

    // Kills `deleteAfterCleaned > 0` -> `>= 0` (line 270): the mutant would log
    // "cleaned up 0 jobs by deleteAfter".
    const logged = logSpy.mock.calls.map((c) => String(c[0]));
    expect(logged.some((m) => m.includes("cleaned up"))).toBe(false);
    logSpy.mockRestore();
  });

  it("does NOT log the removed line when nothing expired in the global sweep", async () => {
    delete process.env.SENTRY_CRON_MONITORS;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();
    queueSelect("users", []);
    queueSelect("teams", []);
    queueSelect("jobs", []);
    getMaxAgeMsMock.mockResolvedValue(3_600_000);
    // A fresh dir -> kept, removed stays 0.
    listJobDirsMock.mockImplementation(async (prefix: "uploads" | "outputs") => {
      if (prefix === "uploads") return [{ key: "uploads/fresh", size: 0, mtimeMs: Date.now() }];
      return [];
    });

    const result = await runSystemJob({ name: SYSTEM_JOBS.storageTtl } as never);

    // Kills `removed > 0` -> `>= 0` (line 340): mutant logs "removed 0 expired".
    const logged = logSpy.mock.calls.map((c) => String(c[0]));
    expect(logged.some((m) => m.includes("removed"))).toBe(false);
    expect(result).toEqual({ removed: 0, failed: 0 });
    logSpy.mockRestore();
  });

  it("does NOT log the error line when every deletion succeeds", async () => {
    delete process.env.SENTRY_CRON_MONITORS;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();
    queueSelect("users", []);
    queueSelect("teams", []);
    queueSelect("jobs", []);
    getMaxAgeMsMock.mockResolvedValue(3_600_000);
    const oldMtime = Date.now() - 7_200_000;
    listJobDirsMock.mockImplementation(async (prefix: "uploads" | "outputs") => {
      if (prefix === "uploads") return [{ key: "uploads/stale", size: 0, mtimeMs: oldMtime }];
      return [];
    });

    const result = await runSystemJob({ name: SYSTEM_JOBS.storageTtl } as never);

    // Kills `errors.length > 0` -> `>= 0` (line 337): mutant logs "0 dir(s) failed".
    expect(errSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ removed: 1, failed: 0 });
    errSpy.mockRestore();
  });
});

describe("storageTtlSweep legal-hold select gating", () => {
  it("skips the team-member lookup when no teams are under legal hold", async () => {
    // heldTeamRows empty -> the `heldTeamRows.length > 0` guard must stay false,
    // so only 3 selects run (held users, held teams, deleteAfter jobs).
    delete process.env.SENTRY_CRON_MONITORS;
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();
    queueSelect("users", []); // held users
    queueSelect("teams", []); // held teams (empty)
    queueSelect("jobs", []); // deleteAfter jobs
    getMaxAgeMsMock.mockResolvedValue(0); // stop after deleteAfter block

    await runSystemJob({ name: SYSTEM_JOBS.storageTtl } as never);

    // Kills `heldTeamRows.length > 0` -> `>= 0`/true (line 236): a true mutant
    // would run a 4th select (team members) and drain a users-queue slot.
    expect(dbSelectMock).toHaveBeenCalledTimes(3);
  });

  it("runs the team-member lookup exactly once when a team is under legal hold", async () => {
    delete process.env.SENTRY_CRON_MONITORS;
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();
    queueSelect("users", []); // held users (direct)
    queueSelect("teams", [{ id: "t1" }]); // one held team
    queueSelect("users", [{ id: "member-1" }]); // team members
    queueSelect("jobs", []); // deleteAfter jobs
    getMaxAgeMsMock.mockResolvedValue(0);

    await runSystemJob({ name: SYSTEM_JOBS.storageTtl } as never);

    // 4 selects: held users, held teams, team members, deleteAfter jobs.
    expect(dbSelectMock).toHaveBeenCalledTimes(4);
  });

  it("skips the per-dir jobUserMap lookup when no users are under legal hold", async () => {
    // heldUserIds empty -> the `heldUserIds.size > 0 && ...` guard stays false,
    // so the global sweep does NOT issue the jobUserMap select.
    delete process.env.SENTRY_CRON_MONITORS;
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();
    queueSelect("users", []); // no held users
    queueSelect("teams", []); // no held teams
    queueSelect("jobs", []); // no deleteAfter jobs
    getMaxAgeMsMock.mockResolvedValue(3_600_000);
    const oldMtime = Date.now() - 7_200_000;
    listJobDirsMock.mockImplementation(async (prefix: "uploads" | "outputs") => {
      if (prefix === "uploads") return [{ key: "uploads/stale", size: 0, mtimeMs: oldMtime }];
      return [];
    });

    const result = await runSystemJob({ name: SYSTEM_JOBS.storageTtl } as never);

    // Kills the `&&` -> `||` / `size >= 0` mutants (line 308): a truthy guard
    // would run a 4th select (jobUserMap). Only 3 selects should occur.
    expect(dbSelectMock).toHaveBeenCalledTimes(3);
    // And the dir is still deleted (no hold in effect).
    expect(result).toEqual({ removed: 1, failed: 0 });
    expect(deletePrefixMock).toHaveBeenCalledWith("uploads/stale");
  });
});

// -- retentionSweep SQL text + window arithmetic ------------------------------

describe("retentionSweep SQL pinning", () => {
  it("issues jobs + audit deletes with the exact SQL text and window day counts", async () => {
    delete process.env.SENTRY_CRON_MONITORS;
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();
    getSettingNumberMock.mockResolvedValueOnce(30).mockResolvedValueOnce(90);
    queueSelect("settings", []); // tamperResistantAudit unset -> not tamper-resistant

    await runSystemJob({ name: SYSTEM_JOBS.retention } as never);

    expect(dbExecuteMock).toHaveBeenCalledTimes(2);
    const text = allSqlText();
    // Kills StringLiteral `` on the heldUsersSubquery + both DELETE templates.
    expect(text).toContain("DELETE FROM jobs");
    expect(text).toContain("status IN ('completed', 'failed', 'canceled')");
    expect(text).toContain("DELETE FROM audit_log");
    expect(text).toContain("interval '1 day'");
    // The retention day counts are interpolated (kills a mutant that drops the
    // interpolation value from the template).
    const interpolated = sqlCalls.flatMap((c) => c.values);
    expect(interpolated).toContain(30);
    expect(interpolated).toContain(90);
  });

  it("reads the exact settings key when checking tamper-resistant mode", async () => {
    delete process.env.SENTRY_CRON_MONITORS;
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();
    getSettingNumberMock.mockResolvedValueOnce(30).mockResolvedValueOnce(90);
    queueSelect("settings", []);

    await runSystemJob({ name: SYSTEM_JOBS.retention } as never);

    // Kills StringLiteral "" on "tamperResistantAudit" (line 373): eq must have
    // been called with the settings.key column and that literal.
    expect(eqCalls).toContainEqual(["settings.key", "tamperResistantAudit"]);
  });

  it("deletes audit rows when the tamper setting exists but is 'false'", async () => {
    // Row present, value "false" -> `length>0 && value==="true"` is false ->
    // NOT tamper-resistant -> audit delete runs.
    delete process.env.SENTRY_CRON_MONITORS;
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs();
    getSettingNumberMock.mockResolvedValueOnce(30).mockResolvedValueOnce(90);
    queueSelect("settings", [{ value: "false" }]);

    await runSystemJob({ name: SYSTEM_JOBS.retention } as never);

    // Kills the ConditionalExpression `true` on the tamper guard (line 376):
    // a `true` mutant would treat this as tamper-resistant and skip the audit
    // delete, leaving only 1 execute call.
    expect(dbExecuteMock).toHaveBeenCalledTimes(2);
  });

  it("passes the env retention days as the getSettingNumber fallback defaults", async () => {
    delete process.env.SENTRY_CRON_MONITORS;
    const { SYSTEM_JOBS, runSystemJob } = await loadSystemJobs({
      JOBS_RETENTION_DAYS: 45,
      AUDIT_RETENTION_DAYS: 120,
    });
    getSettingNumberMock.mockResolvedValueOnce(45).mockResolvedValueOnce(120);
    queueSelect("settings", []);

    await runSystemJob({ name: SYSTEM_JOBS.retention } as never);

    // Pins the second argument to each getSettingNumber call (the env fallback).
    expect(getSettingNumberMock).toHaveBeenNthCalledWith(1, "jobsRetentionDays", 45);
    expect(getSettingNumberMock).toHaveBeenNthCalledWith(2, "auditRetentionDays", 120);
  });
});
