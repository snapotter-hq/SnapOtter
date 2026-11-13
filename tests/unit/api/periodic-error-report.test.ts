/**
 * Periodic system jobs (#4213): a permanently broken database used to cost one
 * Sentry event per hour per call site per instance, forever. These tests pin
 * the long window, the job + code key, and the empty-message pg wrapper
 * (NODE-58). Sentry is mocked, so nothing here leaves the process.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyError,
  type ReportContext,
  reportError,
  resetThrottleForTests,
  shouldReport,
} from "../../../apps/api/src/lib/error-report.js";

const h = vi.hoisted(() => {
  const scope = {
    setTag: vi.fn(),
    setLevel: vi.fn(),
    setFingerprint: vi.fn(),
    setContext: vi.fn(),
  };
  return {
    scope,
    diagnostic: { on: false },
    captureException: vi.fn(),
    withScope: vi.fn((cb: (s: typeof scope) => unknown) => cb(scope)),
  };
});

vi.mock("@sentry/node", () => ({
  captureException: h.captureException,
  withScope: h.withScope,
  getGlobalScope: () => ({ setTag: vi.fn() }),
}));

vi.mock("../../../apps/api/src/lib/analytics-gate.js", () => ({
  analyticsEnabled: () => true,
  sentryDiagnostic: () => h.diagnostic.on,
}));

const HOUR = 3_600_000;
const TICK = 5 * 60_000;

function pgFault(code: string, frameFile: string): Error {
  const cause = Object.assign(new Error("pg fault"), { code });
  const err = Object.assign(new Error("Failed query: select 1", { cause }), {
    name: "DrizzleQueryError",
  });
  err.stack = `DrizzleQueryError: Failed query\n  at run (/app/apps/api/src/jobs/${frameFile}:10:3)`;
  return err;
}

function netFault(frameFile: string): Error {
  const err = Object.assign(new Error("connect EHOSTUNREACH 10.0.0.9:5432"), {
    code: "EHOSTUNREACH",
  });
  err.stack = `Error: connect\n  at run (/app/apps/api/src/jobs/${frameFile}:10:3)`;
  return err;
}

const periodic = (job: string): ReportContext => ({
  source: "worker",
  pool: "system",
  periodic: true,
  job,
});

beforeEach(() => {
  resetThrottleForTests();
  vi.clearAllMocks();
  h.diagnostic.on = false;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-09T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("periodic system-job reporting (#4213)", () => {
  it.each([
    ["28P01", () => pgFault("28P01", "system-jobs.ts")],
    ["42501", () => pgFault("42501", "system-jobs.ts")],
    ["58P01", () => pgFault("58P01", "system-jobs.ts")],
    ["EHOSTUNREACH", () => netFault("system-jobs.ts")],
  ])("sends one event per day for a job failing with %s on every tick", async (_code, make) => {
    for (let i = 0; i < 24 * 12; i++) {
      await reportError(make(), periodic("system:storage-ttl"));
      vi.advanceTimersByTime(TICK);
    }
    expect(h.captureException).toHaveBeenCalledTimes(1);
  });

  it("combines call sites of one job, whatever their stack frames", async () => {
    await reportError(pgFault("28P01", "system-jobs.ts"), periodic("system:job-reconciliation"));
    await reportError(
      pgFault("28P01", "job-reconciliation.ts"),
      periodic("system:job-reconciliation"),
    );
    await reportError(pgFault("28P01", "worker.ts"), periodic("system:job-reconciliation"));
    expect(h.captureException).toHaveBeenCalledTimes(1);
  });

  it("keeps a separate slot per job and per code", async () => {
    await reportError(pgFault("28P01", "a.ts"), periodic("system:storage-ttl"));
    await reportError(pgFault("28P01", "a.ts"), periodic("system:retention"));
    await reportError(pgFault("42501", "a.ts"), periodic("system:storage-ttl"));
    expect(h.captureException).toHaveBeenCalledTimes(3);
  });

  it("does not mute a different code-less operational fault behind the first one", async () => {
    const stall = Object.assign(new Error("Missing lock for job 1. moveToFinished"), {
      name: "UnrecoverableError",
    });
    const pgCause = Object.assign(new Error("x"), { name: "DatabaseError" });
    await reportError(stall, periodic("system:storage-ttl"));
    await reportError(new Error("", { cause: pgCause }), periodic("system:storage-ttl"));
    expect(h.captureException).toHaveBeenCalledTimes(2);
  });

  it("reports again after the window rolls over", async () => {
    await reportError(pgFault("28P01", "a.ts"), periodic("system:storage-ttl"));
    vi.advanceTimersByTime(23 * HOUR);
    await reportError(pgFault("28P01", "a.ts"), periodic("system:storage-ttl"));
    expect(h.captureException).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(HOUR + 1);
    await reportError(pgFault("28P01", "a.ts"), periodic("system:storage-ttl"));
    expect(h.captureException).toHaveBeenCalledTimes(2);
  });

  it("leaves the user-facing path on the one-per-hour rule", async () => {
    const ctx: ReportContext = { source: "http", route: "/api/v1/x", method: "GET" };
    await reportError(pgFault("28P01", "a.ts"), ctx);
    await reportError(pgFault("28P01", "a.ts"), ctx);
    expect(h.captureException).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(HOUR + 1);
    await reportError(pgFault("28P01", "a.ts"), ctx);
    expect(h.captureException).toHaveBeenCalledTimes(2);
  });

  it("does not throttle bug-class errors from a system job any harder", async () => {
    for (let i = 0; i < 10; i++) {
      await reportError(new TypeError("boom"), periodic("system:storage-ttl"));
    }
    expect(h.captureException).toHaveBeenCalledTimes(10);
  });

  it("still sends every event under SNAPOTTER_SENTRY_DIAGNOSTIC", async () => {
    h.diagnostic.on = true;
    for (let i = 0; i < 5; i++) {
      await reportError(pgFault("28P01", "a.ts"), periodic("system:storage-ttl"));
    }
    expect(h.captureException).toHaveBeenCalledTimes(5);
  });

  it("keys on the code, never on message text", () => {
    expect(shouldReport("operational", "periodic:system:storage-ttl:28P01", 0, 24 * HOUR)).toBe(
      true,
    );
    expect(shouldReport("operational", "periodic:system:storage-ttl:28P01", HOUR, 24 * HOUR)).toBe(
      false,
    );
  });
});

describe("NODE-58: a pg client error with an empty message and no SQLSTATE", () => {
  const wrapped = () => {
    const cause = Object.assign(new Error("terminated"), {
      name: "DatabaseError",
      severity: "FATAL",
    });
    return new Error("", { cause });
  };

  it("is operational when a system job throws it", () => {
    expect(classifyError(wrapped(), "worker", { periodic: true })).toBe("operational");
  });

  it("stays a bug off the periodic path", () => {
    expect(classifyError(wrapped(), "worker")).toBe("bug");
    expect(classifyError(wrapped(), "http")).toBe("bug");
  });

  it("keeps a plain empty Error with no pg cause a bug", () => {
    expect(classifyError(new Error(""), "worker", { periodic: true })).toBe("bug");
  });

  it("does not hide a query bug that carries a SQLSTATE", () => {
    const cause = Object.assign(new Error("relation missing"), {
      name: "DatabaseError",
      code: "42P01",
    });
    expect(classifyError(new Error("", { cause }), "worker", { periodic: true })).toBe("bug");
  });
});
