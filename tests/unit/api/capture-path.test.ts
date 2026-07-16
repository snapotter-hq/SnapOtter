/**
 * Regression guard for the single deliberate Sentry capture path.
 *
 * Before the overhaul a failed tool job was captured twice (processToolJob
 * catch + worker.on("failed")) and wrapped in new Error(String(err)), which
 * produced frameless events. These tests pin the contract: one reportError
 * call yields exactly one captureException with the ORIGINAL error object,
 * and the throttle allows one capture per distinct signature.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  reportError,
  resetThrottleForTests,
  setSentryInstanceTag,
} from "../../../apps/api/src/lib/error-report.js";

const h = vi.hoisted(() => {
  const scope = {
    setTag: vi.fn(),
    setLevel: vi.fn(),
    setFingerprint: vi.fn(),
    setContext: vi.fn(),
  };
  const globalScope = { setTag: vi.fn() };
  return {
    scope,
    globalScope,
    captureException: vi.fn(),
    withScope: vi.fn((cb: (s: typeof scope) => unknown) => cb(scope)),
    getGlobalScope: vi.fn(() => globalScope),
  };
});

vi.mock("@sentry/node", () => ({
  captureException: h.captureException,
  withScope: h.withScope,
  getGlobalScope: h.getGlobalScope,
}));

vi.mock("../../../apps/api/src/lib/analytics-gate.js", () => ({
  analyticsEnabled: () => true,
}));

beforeEach(() => {
  resetThrottleForTests();
  vi.clearAllMocks();
});

describe("capture path", () => {
  it("a single worker-failure reportError yields exactly one capture, unwrapped, tagged", async () => {
    const boom = new Error("boom");
    await reportError(boom, { source: "worker", pool: "image" });

    expect(h.captureException).toHaveBeenCalledTimes(1);
    // The original object flows through: no new Error(String(err)) wrapping,
    // so stacks, codes, and marker properties survive.
    expect(h.captureException).toHaveBeenCalledWith(boom);
    expect(h.scope.setTag).toHaveBeenCalledWith("source", "worker");
    expect(h.scope.setTag).toHaveBeenCalledWith("pool", "image");
  });

  it("tags error_code from a code nested in the cause chain, not just the top level", async () => {
    // pg/undici bury the real code under a drizzle/wrapper Error whose own
    // .code is undefined; reading only the top level left error_code empty.
    const pg = Object.assign(new Error("password authentication failed"), {
      code: "28P01",
      severity: "FATAL",
    });
    const wrapped = Object.assign(new Error("Failed query: select 1"), { cause: pg });

    await reportError(wrapped, { source: "worker", pool: "docs" });

    expect(h.captureException).toHaveBeenCalledTimes(1);
    expect(h.scope.setTag).toHaveBeenCalledWith("error_code", "28P01");
  });

  it("captures once per distinct signature; operational repeats are throttled", async () => {
    const full = Object.assign(new Error("disk full"), { code: "ENOSPC" });
    await reportError(full, { source: "worker", pool: "image" });
    await reportError(full, { source: "worker", pool: "image" });
    expect(h.captureException).toHaveBeenCalledTimes(1);

    const denied = Object.assign(new Error("denied"), { code: "EACCES" });
    await reportError(denied, { source: "worker", pool: "image" });
    expect(h.captureException).toHaveBeenCalledTimes(2);
  });

  it("tags job_id so the event cross-references the DB row, logs, and PostHog stream", async () => {
    await reportError(new Error("boom"), { source: "worker", pool: "image", jobId: "job-abc" });
    expect(h.scope.setTag).toHaveBeenCalledWith("job_id", "job-abc");
  });

  it("collapses operational errors to one issue per code via fingerprint", async () => {
    const full = Object.assign(new Error("disk full"), { code: "ENOSPC" });
    await reportError(full, { source: "worker", pool: "image" });
    expect(h.scope.setFingerprint).toHaveBeenCalledWith(["operational", "ENOSPC"]);
  });

  it("prefers the connectivity fingerprint for infra-connectivity operational errors", async () => {
    const pg = Object.assign(new Error("Failed query: select 1"), {
      cause: Object.assign(new Error("57P01"), { code: "57P01" }),
    });
    await reportError(pg, { source: "worker", pool: "docs" });
    expect(h.scope.setFingerprint).toHaveBeenCalledWith(["connectivity", "pg-unavailable"]);
  });

  it("leaves bug-class errors on default per-frame grouping (no fingerprint)", async () => {
    await reportError(new Error("undefined is not a function"), {
      source: "worker",
      pool: "image",
    });
    expect(h.scope.setFingerprint).not.toHaveBeenCalled();
  });

  it("attaches a vetted tool context for bug-class events to aid reproduction", async () => {
    await reportError(new Error("boom"), {
      source: "worker",
      pool: "image",
      settings: { format: "png", quality: 80, filename: "my secret vacation.png" },
    });
    expect(h.scope.setContext).toHaveBeenCalledWith("tool", { format: "png", quality: 80 });
  });

  it("does not attach a settings context for non-bug errors", async () => {
    const full = Object.assign(new Error("disk full"), { code: "ENOSPC" });
    await reportError(full, { source: "worker", pool: "image", settings: { format: "png" } });
    expect(h.scope.setContext).not.toHaveBeenCalled();
  });
});

describe("setSentryInstanceTag", () => {
  it("sets instance_id on the global scope so every event carries it", async () => {
    await setSentryInstanceTag("inst-xyz");
    expect(h.globalScope.setTag).toHaveBeenCalledWith("instance_id", "inst-xyz");
  });

  it("is a no-op on a falsy id and never throws", async () => {
    await expect(setSentryInstanceTag("")).resolves.toBeUndefined();
    expect(h.globalScope.setTag).not.toHaveBeenCalled();
  });
});
