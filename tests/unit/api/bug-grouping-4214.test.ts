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
    expect(prints[0]).toEqual(["bug", "remove-background", "ENOENT", "open"]);
  });

  it("keeps a different tool or code in its own group", async () => {
    await reportError(enoent("a.ts"), { source: "worker", toolId: "remove-background" });
    await reportError(enoent("a.ts"), { source: "worker", toolId: "upscale" });
    const [first, second] = h.scope.setFingerprint.mock.calls.map((c) => c[0]);
    expect(first).not.toEqual(second);
  });

  it("keeps the same errno from another syscall in its own group", async () => {
    const cleanup = Object.assign(enoent("a.ts"), { syscall: "unlink" });
    await reportError(enoent("a.ts"), { source: "worker", toolId: "upscale" });
    await reportError(cleanup, { source: "worker", toolId: "upscale" });
    const [first, second] = h.scope.setFingerprint.mock.calls.map((c) => c[0]);
    expect(first).not.toEqual(second);
  });

  it("keeps a different errno of the same tool in its own group", async () => {
    const exists = Object.assign(enoent("a.ts"), { code: "EEXIST" });
    await reportError(enoent("a.ts"), { source: "worker", toolId: "upscale" });
    await reportError(exists, { source: "worker", toolId: "upscale" });
    const [first, second] = h.scope.setFingerprint.mock.calls.map((c) => c[0]);
    expect(first).not.toEqual(second);
  });

  it("leaves default grouping for ERR_* codes and non-errno codes", async () => {
    const node = Object.assign(new Error("bad arg"), { code: "ERR_INVALID_ARG_TYPE" });
    const custom = Object.assign(new Error("tool broke"), { code: "TOOL_FAILED" });
    await reportError(node, { source: "worker", toolId: "upscale" });
    await reportError(custom, { source: "worker", toolId: "upscale" });
    expect(h.scope.setFingerprint).not.toHaveBeenCalled();
  });

  it("leaves default grouping when there is no tool or no errno", async () => {
    await reportError(enoent("a.ts"), { source: "worker" });
    await reportError(new Error("plain bug"), { source: "worker", toolId: "upscale" });
    expect(h.scope.setFingerprint).not.toHaveBeenCalled();
  });
});
