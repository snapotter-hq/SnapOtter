import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { Writable } from "node:stream";
import { isSafeMessageError, type SafeError } from "@snapotter/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock child_process.spawn before importing the bridge module
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

function createMockProcess(): {
  process: ChildProcess;
  stdout: EventEmitter;
  stderr: EventEmitter;
  emitEvent: (event: string, ...args: unknown[]) => void;
} {
  const stdin = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const proc = new EventEmitter() as unknown as ChildProcess;
  Object.assign(proc, {
    stdin,
    stdout,
    stderr,
    pid: 12345,
    killed: false,
    kill: vi.fn(() => {
      (proc as { killed: boolean }).killed = true;
      return true;
    }),
  });
  return {
    process: proc,
    stdout,
    stderr,
    emitEvent: (event: string, ...args: unknown[]) => proc.emit(event, ...args),
  };
}

// Every rejection the bridge hands to a tool wrapper must be a SafeError:
// plain Errors get reduced to "Error: Error" by the API's Sentry scrubber
// (NODE-24, NODE-1R), losing the failure reason.
describe("bridge rejections are SafeErrors", () => {
  let bridge: typeof import("../../../packages/ai/src/bridge.js");

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();
    bridge = await import("../../../packages/ai/src/bridge.js");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parseStdoutJson throws a SafeError (bug) when the sidecar returns no JSON", () => {
    let caught: unknown;
    try {
      bridge.parseStdoutJson("not json at all");
    } catch (e) {
      caught = e;
    }
    expect(isSafeMessageError(caught)).toBe(true);
    expect((caught as SafeError).kind).toBe("bug");
    expect((caught as SafeError).message).toBe("No JSON response from Python script");
  });

  it("per-request spawn failure (non-ENOENT) rejects with an operational SafeError", async () => {
    const mockDisp = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;
    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDisp.process;
      return mockPerReq.process;
    });

    const promise = bridge.runPythonWithProgress("test.py", []);

    // Kill the dispatcher attempt so the per-request fallback runs.
    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    mockDisp.emitEvent("error", enoent);
    await new Promise((r) => setTimeout(r, 10));

    const eacces = new Error("spawn python3 EACCES") as NodeJS.ErrnoException;
    eacces.code = "EACCES";
    mockPerReq.emitEvent("error", eacces);

    let caught: unknown;
    try {
      await promise;
    } catch (e) {
      caught = e;
    }
    expect(isSafeMessageError(caught)).toBe(true);
    expect((caught as SafeError).kind).toBe("operational");
    expect((caught as SafeError).message).toBe("spawn python3 EACCES");
  });

  it("a dispatcher process error mid-request rejects pending requests with an operational SafeError", async () => {
    const mockDisp = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mockDisp.process);

    // Let the dispatcher come up, then issue a request against it.
    const initPromise = bridge.initDispatcher(1_000);
    mockDisp.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await initPromise;

    const promise = bridge.runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));

    // A process-level error whose message matches no retry rule propagates
    // straight to the caller, so it must already be a SafeError.
    const eagain = new Error("spawn EAGAIN") as NodeJS.ErrnoException;
    eagain.code = "EAGAIN";
    mockDisp.emitEvent("error", eagain);

    let caught: unknown;
    try {
      await promise;
    } catch (e) {
      caught = e;
    }
    expect(isSafeMessageError(caught)).toBe(true);
    expect((caught as SafeError).kind).toBe("operational");
  });
});
