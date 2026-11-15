/**
 * Bug-class errno events from one tool group into one Sentry issue (#4214).
 * Sentry is mocked, so nothing here leaves the process.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reportError, resetThrottleForTests } from "../../../apps/api/src/lib/error-report.js";

const h = vi.hoisted(() => {
  const scope = {
    setTag: vi.fn(),
    setLevel: vi.fn(),
    setFingerprint: vi.fn(),
    setContext: vi.fn(),
  };
  return {
    scope,
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
  sentryDiagnostic: () => false,
}));

function enoent(frameFile: string): Error {
  const err = Object.assign(new Error("ENOENT: no such file or directory, open '/m/x.onnx'"), {
    code: "ENOENT",
    syscall: "open",
  });
  err.stack = `Error: ENOENT\n  at load (/app/apps/api/src/${frameFile}:10:3)`;
  return err;
}

beforeEach(() => {
  resetThrottleForTests();
  vi.clearAllMocks();
});

describe("bug-class errno fingerprint (#4214)", () => {
  it("gives ENOENTs from different frames of one tool the same fingerprint", async () => {
    await reportError(enoent("a.ts"), { source: "worker", toolId: "remove-background" });
    await reportError(enoent("b.ts"), { source: "worker", toolId: "remove-background" });
    const prints = h.scope.setFingerprint.mock.calls.map((c) => c[0]);
    expect(prints).toHaveLength(2);
    expect(prints[0]).toEqual(prints[1]);
    expect(prints[0]).toEqual(["bug", "remove-background", "ENOENT"]);
  });

  it("keeps a different tool or code in its own group", async () => {
    await reportError(enoent("a.ts"), { source: "worker", toolId: "remove-background" });
    await reportError(enoent("a.ts"), { source: "worker", toolId: "upscale" });
    const [first, second] = h.scope.setFingerprint.mock.calls.map((c) => c[0]);
    expect(first).not.toEqual(second);
  });

  it("leaves default grouping when there is no tool or no errno", async () => {
    await reportError(enoent("a.ts"), { source: "worker" });
    await reportError(new Error("plain bug"), { source: "worker", toolId: "upscale" });
    expect(h.scope.setFingerprint).not.toHaveBeenCalled();
  });
});
