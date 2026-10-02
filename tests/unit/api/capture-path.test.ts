/**
 * Regression guard for the single deliberate Sentry capture path.
 *
 * Before the overhaul a failed tool job was captured twice (processToolJob
 * catch + worker.on("failed")) and wrapped in new Error(String(err)), which
 * produced frameless events. These tests pin the contract: one reportError
 * call yields exactly one captureException with the ORIGINAL error object,
 * and the throttle allows one capture per distinct signature.
 */
import { SafeError } from "@snapotter/shared";
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
  sentryDiagnostic: () => false,
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

  // #1414: without the job's age a sweep-aged input and a young miss look the same.
  it.each([
    [0, "lt_10s"],
    [9_999, "lt_10s"],
    [10_000, "lt_1h"],
    [3_599_999, "lt_1h"],
    [3_600_000, "lt_24h"],
    [86_399_999, "lt_24h"],
    [86_400_000, "gte_24h"],
  ])("tags a %i ms job age as job_age=%s", async (ms, bucket) => {
    await reportError(new Error("boom"), { source: "worker", pool: "image", jobAgeMs: ms });
    expect(h.scope.setTag).toHaveBeenCalledWith("job_age", bucket);
  });

  it.each([
    ["missing", undefined],
    ["negative (clock skew)", -5],
    ["not a number", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
  ])("sets no job_age tag when the age is %s", async (_label, ms) => {
    await reportError(new Error("boom"), { source: "worker", pool: "image", jobAgeMs: ms });
    const tags = h.scope.setTag.mock.calls.map((c) => c[0]);
    expect(tags).not.toContain("job_age");
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

  it("groups an operational SafeError by its own code, whatever backend error it wraps (#1413)", async () => {
    // The worker's INPUT_MISSING wraps a local ENOENT or an S3 NoSuchKey
    // (which has no string .code). Both must land in the same Sentry issue.
    const make = (cause: unknown) =>
      new SafeError("Input file is no longer available. Upload it again.", {
        kind: "operational",
        code: "INPUT_MISSING",
        statusCode: 410,
        cause,
      });
    const local = Object.assign(new Error("ENOENT: no such file or directory, open '/x'"), {
      code: "ENOENT",
      syscall: "open",
    });
    const s3 = Object.assign(new Error("The specified key does not exist."), {
      name: "NoSuchKey",
      $metadata: { httpStatusCode: 404 },
    });

    await reportError(make(local), { source: "worker", pool: "image" });
    expect(h.scope.setFingerprint).toHaveBeenLastCalledWith(["operational", "INPUT_MISSING"]);
    expect(h.scope.setTag).toHaveBeenCalledWith("error_code", "INPUT_MISSING");

    resetThrottleForTests();
    await reportError(make(s3), { source: "worker", pool: "image" });
    expect(h.scope.setFingerprint).toHaveBeenLastCalledWith(["operational", "INPUT_MISSING"]);
  });

  it("groups a coded SafeError wrapping a network failure by its own code, not the shared connectivity issue (#1907)", async () => {
    // OIDC discovery against an IdP that refuses the connection: openid-client
    // throws undici's "fetch failed" TypeError with the ECONNREFUSED below it.
    const refused = new TypeError("fetch failed", {
      cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:9"), {
        code: "ECONNREFUSED",
        syscall: "connect",
      }),
    });
    const notFound = Object.assign(new Error("unexpected HTTP response status code"), {
      name: "ResponseBodyError",
      status: 404,
    });
    const discoveryFault = (cause: unknown) =>
      new SafeError("OIDC discovery failed", { code: "OIDC_DISCOVERY_FAILED", cause });

    await reportError(discoveryFault(refused), { source: "http", subsystem: "oidc-login" });
    expect(h.scope.setFingerprint).toHaveBeenLastCalledWith([
      "operational",
      "OIDC_DISCOVERY_FAILED",
    ]);
    expect(h.scope.setTag).toHaveBeenCalledWith("error_code", "OIDC_DISCOVERY_FAILED");
    expect(h.scope.setLevel).toHaveBeenCalledWith("warning");

    // The same code over a 404 lands in the same issue.
    resetThrottleForTests();
    vi.clearAllMocks();
    await reportError(discoveryFault(notFound), { source: "http", subsystem: "oidc-login" });
    expect(h.scope.setFingerprint).toHaveBeenCalledTimes(1);
    expect(h.scope.setFingerprint).toHaveBeenLastCalledWith([
      "operational",
      "OIDC_DISCOVERY_FAILED",
    ]);
  });

  it("a coded SafeError wrapping a lost database connection also groups by its own code (#1907)", async () => {
    const err = new SafeError("Could not discard a staged upload", {
      kind: "operational",
      code: "STAGED_DISCARD_FAILED",
      cause: Object.assign(new Error("Failed query: delete"), {
        cause: Object.assign(new Error("57P01"), { code: "57P01" }),
      }),
    });
    await reportError(err, { source: "http", subsystem: "upload-storage" });
    expect(h.scope.setFingerprint).toHaveBeenLastCalledWith([
      "operational",
      "STAGED_DISCARD_FAILED",
    ]);
    expect(h.scope.setTag).toHaveBeenCalledWith("error_code", "STAGED_DISCARD_FAILED");
  });

  it("a marker-copied SafeError with a code groups by that code over a network failure (#1907)", async () => {
    // Copied across a module boundary: the marker survives, kind does not.
    const err = Object.assign(new Error("OIDC discovery failed"), {
      isSafeMessage: true,
      code: "OIDC_DISCOVERY_FAILED",
      cause: Object.assign(new Error("getaddrinfo ENOTFOUND idp.example"), { code: "ENOTFOUND" }),
    });
    await reportError(err, { source: "http", subsystem: "oidc-login" });
    expect(h.scope.setFingerprint).toHaveBeenLastCalledWith([
      "operational",
      "OIDC_DISCOVERY_FAILED",
    ]);
  });

  it("keeps the connectivity fingerprint when a SafeError's own code is too long to tag", async () => {
    // extractErrorCode drops a code over 40 characters and tags the errno
    // instead, so there is no own code to group on.
    const err = new SafeError("upstream down", {
      kind: "operational",
      code: "X".repeat(41),
      cause: Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:443"), {
        code: "ECONNREFUSED",
      }),
    });
    await reportError(err, { source: "worker", pool: "image" });
    expect(h.scope.setFingerprint).toHaveBeenLastCalledWith(["connectivity", "net-unavailable"]);
    expect(h.scope.setTag).toHaveBeenCalledWith("error_code", "ECONNREFUSED");
  });

  it("keeps the connectivity fingerprint for a SafeError with no code of its own", async () => {
    // With no authored code there is nothing better to group on than the
    // outage itself.
    const err = new SafeError("upstream down", {
      kind: "operational",
      cause: Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:443"), {
        code: "ECONNREFUSED",
      }),
    });
    await reportError(err, { source: "worker", pool: "image" });
    expect(h.scope.setFingerprint).toHaveBeenLastCalledWith(["connectivity", "net-unavailable"]);
    expect(h.scope.setTag).toHaveBeenCalledWith("error_code", "ECONNREFUSED");
  });

  it("keeps the connectivity fingerprint for a bug-kind SafeError that wraps a network failure", async () => {
    // A bug-kind code is settings-derived (an output format), not a fault
    // name, so this change leaves its grouping as it was.
    const err = new SafeError("Image conversion failed", {
      kind: "bug",
      code: "png",
      cause: Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:443"), {
        code: "ECONNREFUSED",
      }),
    });
    await reportError(err, { source: "worker", pool: "image" });
    expect(h.scope.setFingerprint).toHaveBeenLastCalledWith(["connectivity", "net-unavailable"]);
  });

  it("reports an undici connect timeout as a connectivity warning, not a bug (#1908)", async () => {
    // A firewall that drops packets: undici's 10s connect timeout fires first.
    const err = new TypeError("fetch failed", {
      cause: Object.assign(new Error("Connect Timeout Error"), { code: "UND_ERR_CONNECT_TIMEOUT" }),
    });
    await reportError(err, { source: "worker", pool: "image" });
    expect(h.scope.setLevel).toHaveBeenCalledWith("warning");
    expect(h.scope.setTag).toHaveBeenCalledWith("error_class", "operational");
    expect(h.scope.setTag).toHaveBeenCalledWith("error_code", "UND_ERR_CONNECT_TIMEOUT");
    expect(h.scope.setFingerprint).toHaveBeenLastCalledWith(["connectivity", "net-unavailable"]);
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
