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
import { reportError, resetThrottleForTests } from "../../../apps/api/src/lib/error-report.js";

const h = vi.hoisted(() => {
  const scope = { setTag: vi.fn(), setLevel: vi.fn(), setFingerprint: vi.fn() };
  return {
    scope,
    captureException: vi.fn(),
    withScope: vi.fn((cb: (s: typeof scope) => unknown) => cb(scope)),
  };
});

vi.mock("@sentry/node", () => ({
  captureException: h.captureException,
  withScope: h.withScope,
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

  it("captures once per distinct signature; operational repeats are throttled", async () => {
    const full = Object.assign(new Error("disk full"), { code: "ENOSPC" });
    await reportError(full, { source: "worker", pool: "image" });
    await reportError(full, { source: "worker", pool: "image" });
    expect(h.captureException).toHaveBeenCalledTimes(1);

    const denied = Object.assign(new Error("denied"), { code: "EACCES" });
    await reportError(denied, { source: "worker", pool: "image" });
    expect(h.captureException).toHaveBeenCalledTimes(2);
  });
});
