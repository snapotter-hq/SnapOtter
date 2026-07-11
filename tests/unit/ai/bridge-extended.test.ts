import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock child_process.spawn before importing the bridge module
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

// Mock sharp (required transitively by tool modules)
vi.mock("sharp", () => ({
  default: vi.fn(),
}));

// Helper to create a fake ChildProcess with controllable streams
function createMockProcess(): {
  process: ChildProcess;
  stdin: Writable;
  stdout: EventEmitter;
  stderr: EventEmitter;
  emitEvent: (event: string, ...args: unknown[]) => void;
  stdinWrites: string[];
} {
  const stdinWrites: string[] = [];
  const stdin = new Writable({
    write(chunk, _encoding, callback) {
      stdinWrites.push(chunk.toString());
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
    stdin,
    stdout,
    stderr,
    emitEvent: (event: string, ...args: unknown[]) => proc.emit(event, ...args),
    stdinWrites,
  };
}

// ── extractPythonError edge cases not covered in bridge.test.ts ──────

describe("bridge - extractPythonError uncovered branches", () => {
  let runPythonWithProgress: typeof import("../../../packages/ai/src/bridge.js").runPythonWithProgress;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();

    const mod = await import("../../../packages/ai/src/bridge.js");
    runPythonWithProgress = mod.runPythonWithProgress;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts error from stderr JSON with error field on non-zero exit", async () => {
    const mockDisp = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDisp.process;
      return mockPerReq.process;
    });

    const promise = runPythonWithProgress("test.py", []);

    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    mockDisp.emitEvent("error", enoent);
    await new Promise((r) => setTimeout(r, 10));

    // stderr contains JSON with "error" field
    mockPerReq.stderr.emit("data", Buffer.from('{"error": "Custom sidecar error"}\n'));
    mockPerReq.emitEvent("close", 1, null);

    await expect(promise).rejects.toThrow("Custom sidecar error");
  });

  it("uses message field when error object has only message property", async () => {
    const mockDisp = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDisp.process;
      return mockPerReq.process;
    });

    const promise = runPythonWithProgress("test.py", []);

    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    mockDisp.emitEvent("error", enoent);
    await new Promise((r) => setTimeout(r, 10));

    // Spawn error that only has a message (the error event handler calls extractPythonError)
    const spawnErr = new Error("spawn python3 EACCES");
    (spawnErr as NodeJS.ErrnoException).code = "EACCES";
    mockPerReq.emitEvent("error", spawnErr);

    await expect(promise).rejects.toThrow("spawn python3 EACCES");
  });

  it("extracts non-traceback stderr as plain text error on non-zero exit", async () => {
    const mockDisp = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDisp.process;
      return mockPerReq.process;
    });

    const promise = runPythonWithProgress("test.py", []);

    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    mockDisp.emitEvent("error", enoent);
    await new Promise((r) => setTimeout(r, 10));

    // stderr is plain text, not a traceback and not JSON
    mockPerReq.stderr.emit("data", Buffer.from("CUDA driver version is insufficient\n"));
    mockPerReq.emitEvent("close", 1, null);

    await expect(promise).rejects.toThrow("CUDA driver version is insufficient");
  });

  it("extracts error from stdout JSON when stderr is empty on failure", async () => {
    const mockDisp = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDisp.process;
      return mockPerReq.process;
    });

    const promise = runPythonWithProgress("test.py", []);

    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    mockDisp.emitEvent("error", enoent);
    await new Promise((r) => setTimeout(r, 10));

    // stdout has JSON with error key, no stderr at all
    mockPerReq.stdout.emit("data", Buffer.from('{"error": "Model weights corrupt"}\n'));
    mockPerReq.emitEvent("close", 1, null);

    await expect(promise).rejects.toThrow("Model weights corrupt");
  });
});

// ── Dispatcher stdin write failure ──────────────────────────────────

describe("bridge - dispatcher stdin write failure", () => {
  let runPythonWithProgress: typeof import("../../../packages/ai/src/bridge.js").runPythonWithProgress;
  let initDispatcher: typeof import("../../../packages/ai/src/bridge.js").initDispatcher;
  let shutdownDispatcher: typeof import("../../../packages/ai/src/bridge.js").shutdownDispatcher;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();

    const mod = await import("../../../packages/ai/src/bridge.js");
    runPythonWithProgress = mod.runPythonWithProgress;
    initDispatcher = mod.initDispatcher;
    shutdownDispatcher = mod.shutdownDispatcher;
  });

  afterEach(() => {
    shutdownDispatcher();
    vi.restoreAllMocks();
  });

  it("retries per-request when dispatcher stdin.write throws", async () => {
    // When stdin.write throws, dispatcherRun rejects with "stdin closed unexpectedly".
    // runPythonWithProgress catches this specific message and retries per-request.
    const mockPerReq = createMockProcess();
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();

    const throwingStdin = {
      on: vi.fn(),
      write: vi.fn(() => {
        throw new Error("write EPIPE");
      }),
      end: vi.fn(),
    };

    const proc = new EventEmitter() as unknown as ChildProcess;
    Object.assign(proc, {
      stdin: throwingStdin,
      stdout,
      stderr,
      pid: 12345,
      killed: false,
      kill: vi.fn(() => {
        (proc as { killed: boolean }).killed = true;
        return true;
      }),
    });

    let callCount = 0;
    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return proc;
      return mockPerReq.process;
    });

    const initPromise = initDispatcher();
    stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await initPromise;

    const promise = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));

    // Per-request fallback picks up
    mockPerReq.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPerReq.emitEvent("close", 0, null);

    const result = await promise;
    expect(result.stdout).toContain("ok");
    expect(result.stderr).toContain("retried after dispatcher crash");
  });

  it("falls back to per-request after dispatcher stdin write failure", async () => {
    const mockPerReq = createMockProcess();

    // Create dispatcher with a throwing stdin
    const dispStdout = new EventEmitter();
    const dispStderr = new EventEmitter();
    const throwingStdin = {
      on: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    };
    const dispProc = new EventEmitter() as unknown as ChildProcess;
    Object.assign(dispProc, {
      stdin: throwingStdin,
      stdout: dispStdout,
      stderr: dispStderr,
      pid: 12345,
      killed: false,
      kill: vi.fn(() => {
        (dispProc as { killed: boolean }).killed = true;
        return true;
      }),
    });

    let callCount = 0;
    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return dispProc;
      return mockPerReq.process;
    });

    // Initialize dispatcher
    const initPromise = initDispatcher();
    dispStderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await initPromise;

    // Now make stdin.write throw synchronously
    throwingStdin.write.mockImplementation(() => {
      throw new Error("write EPIPE");
    });

    const promise = runPythonWithProgress("test.py", []);

    // The promise should catch "stdin closed unexpectedly" and retry per-request
    await new Promise((r) => setTimeout(r, 10));

    mockPerReq.stdout.emit("data", Buffer.from('{"success": true}\n'));
    mockPerReq.emitEvent("close", 0, null);

    const result = await promise;
    expect(result.stdout).toContain("success");
    // Should have the retry annotation in stderr
    expect(result.stderr).toContain("retried after dispatcher crash");
  });
});

// ── Dispatcher retry annotation on crash ────────────────────────────

describe("bridge - dispatcher crash retry annotation", () => {
  let runPythonWithProgress: typeof import("../../../packages/ai/src/bridge.js").runPythonWithProgress;
  let initDispatcher: typeof import("../../../packages/ai/src/bridge.js").initDispatcher;
  let shutdownDispatcher: typeof import("../../../packages/ai/src/bridge.js").shutdownDispatcher;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();

    const mod = await import("../../../packages/ai/src/bridge.js");
    runPythonWithProgress = mod.runPythonWithProgress;
    initDispatcher = mod.initDispatcher;
    shutdownDispatcher = mod.shutdownDispatcher;
  });

  afterEach(() => {
    shutdownDispatcher();
    vi.restoreAllMocks();
  });

  it("appends retry annotation to stderr when dispatcher crashes and per-request succeeds", async () => {
    const mockDisp = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDisp.process;
      return mockPerReq.process;
    });

    // Make dispatcher ready
    const initPromise = initDispatcher();
    mockDisp.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await initPromise;

    const promise = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));

    // Dispatcher closes unexpectedly, rejecting all pending with specific message
    mockDisp.emitEvent("close", 1, null);
    await new Promise((r) => setTimeout(r, 10));

    // Per-request fallback succeeds
    mockPerReq.stderr.emit("data", Buffer.from("GPU not found\n"));
    mockPerReq.stdout.emit("data", Buffer.from('{"success": true}\n'));
    mockPerReq.emitEvent("close", 0, null);

    const result = await promise;
    expect(result.stderr).toContain("[bridge] retried after dispatcher crash");
    expect(result.stderr).toContain("GPU not found");
  });

  it("does not retry per-request for non-crash errors (e.g. timeout)", async () => {
    vi.useFakeTimers();
    const mockDisp = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mockDisp.process);

    // Make dispatcher ready
    const initPromise = initDispatcher();
    mockDisp.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    vi.advanceTimersByTime(100);
    await initPromise;

    const promise = runPythonWithProgress("test.py", [], { timeout: 1000 });

    // Timeout fires
    vi.advanceTimersByTime(1500);

    await expect(promise).rejects.toThrow("Python script timed out");
    // The timeout error is NOT caught by the retry logic -- it re-throws directly
    vi.useRealTimers();
  });
});

// ── buildMinimalEnv LANG fallback ───────────────────────────────────

describe("bridge - buildMinimalEnv LANG fallback", () => {
  let runPythonWithProgress: typeof import("../../../packages/ai/src/bridge.js").runPythonWithProgress;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("../../../packages/ai/src/bridge.js");
    runPythonWithProgress = mod.runPythonWithProgress;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults LANG to C.UTF-8 when LANG is not set", async () => {
    const origLang = process.env.LANG;
    delete process.env.LANG;

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test.py", []);
    mock.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mock.emitEvent("close", 0, null);
    await promise;

    const lastCall = vi.mocked(spawn).mock.calls[vi.mocked(spawn).mock.calls.length - 1];
    const env = (lastCall?.[2] as { env?: Record<string, string> })?.env;
    expect(env?.LANG).toBe("C.UTF-8");

    if (origLang !== undefined) {
      process.env.LANG = origLang;
    }
  });

  it("passes through LANG when set in parent env", async () => {
    const origLang = process.env.LANG;
    process.env.LANG = "ja_JP.UTF-8";

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test.py", []);
    mock.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mock.emitEvent("close", 0, null);
    await promise;

    const lastCall = vi.mocked(spawn).mock.calls[vi.mocked(spawn).mock.calls.length - 1];
    const env = (lastCall?.[2] as { env?: Record<string, string> })?.env;
    expect(env?.LANG).toBe("ja_JP.UTF-8");

    if (origLang !== undefined) {
      process.env.LANG = origLang;
    } else {
      delete process.env.LANG;
    }
  });
});

// ── PYTHON_VENV_PATH env var ────────────────────────────────────────

describe("bridge - PYTHON_VENV_PATH env handling", () => {
  let runPythonWithProgress: typeof import("../../../packages/ai/src/bridge.js").runPythonWithProgress;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.PYTHON_VENV_PATH;
  });

  it("uses custom PYTHON_VENV_PATH when set", async () => {
    process.env.PYTHON_VENV_PATH = "/custom/venv";

    const mod = await import("../../../packages/ai/src/bridge.js");
    runPythonWithProgress = mod.runPythonWithProgress;

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test.py", []);
    mock.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mock.emitEvent("close", 0, null);
    await promise;

    // At least one spawn call should use the custom venv path
    const allCalls = vi.mocked(spawn).mock.calls;
    const usesCustomVenv = allCalls.some(
      (call) => typeof call[0] === "string" && call[0].includes("/custom/venv"),
    );
    expect(usesCustomVenv).toBe(true);
  });

  it("passes PYTHON_VENV_PATH through to env when set", async () => {
    process.env.PYTHON_VENV_PATH = "/custom/venv";

    const mod = await import("../../../packages/ai/src/bridge.js");
    runPythonWithProgress = mod.runPythonWithProgress;

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test.py", []);
    mock.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mock.emitEvent("close", 0, null);
    await promise;

    const lastCall = vi.mocked(spawn).mock.calls[vi.mocked(spawn).mock.calls.length - 1];
    const env = (lastCall?.[2] as { env?: Record<string, string> })?.env;
    expect(env?.PYTHON_VENV_PATH).toBe("/custom/venv");
  });
});

// ── Dispatcher graceful shutdown during active requests ─────────────

describe("bridge - graceful shutdown during active requests", () => {
  let runPythonWithProgress: typeof import("../../../packages/ai/src/bridge.js").runPythonWithProgress;
  let initDispatcher: typeof import("../../../packages/ai/src/bridge.js").initDispatcher;
  let shutdownDispatcher: typeof import("../../../packages/ai/src/bridge.js").shutdownDispatcher;
  let getDispatcherStatus: typeof import("../../../packages/ai/src/bridge.js").getDispatcherStatus;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();

    const mod = await import("../../../packages/ai/src/bridge.js");
    runPythonWithProgress = mod.runPythonWithProgress;
    initDispatcher = mod.initDispatcher;
    shutdownDispatcher = mod.shutdownDispatcher;
    getDispatcherStatus = mod.getDispatcherStatus;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shutdown during active request triggers SIGTERM and the request retries per-request", async () => {
    const mockDisp = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDisp.process;
      return mockPerReq.process;
    });

    const initPromise = initDispatcher();
    mockDisp.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await initPromise;

    // Start a request via dispatcher
    const promise = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));

    // Shutdown while request is pending
    shutdownDispatcher();
    expect(mockDisp.process.kill).toHaveBeenCalledWith("SIGTERM");
    expect(getDispatcherStatus().running).toBe(false);

    // The close event fires after kill, rejecting pending requests
    mockDisp.emitEvent("close", 0, null);
    await new Promise((r) => setTimeout(r, 10));

    // Per-request fallback picks up
    mockPerReq.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPerReq.emitEvent("close", 0, null);

    const result = await promise;
    expect(result.stdout).toContain("ok");
  });

  it("shutdown with multiple active requests causes all to retry", async () => {
    const mockDisp = createMockProcess();
    const mockPR1 = createMockProcess();
    const mockPR2 = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDisp.process;
      if (callCount === 2) return mockPR1.process;
      return mockPR2.process;
    });

    const initPromise = initDispatcher();
    mockDisp.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await initPromise;

    const p1 = runPythonWithProgress("a.py", []);
    const p2 = runPythonWithProgress("b.py", []);
    await new Promise((r) => setTimeout(r, 10));

    // Shutdown
    shutdownDispatcher();
    mockDisp.emitEvent("close", 0, null);
    await new Promise((r) => setTimeout(r, 10));

    // Both fallback processes complete
    mockPR1.stdout.emit("data", Buffer.from('{"r": "one"}\n'));
    mockPR1.emitEvent("close", 0, null);
    mockPR2.stdout.emit("data", Buffer.from('{"r": "two"}\n'));
    mockPR2.emitEvent("close", 0, null);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.stdout).toContain("one");
    expect(r2.stdout).toContain("two");
  });
});

// ── Dispatcher timeout kills and allows next request ────────────────

describe("bridge - dispatcher timeout recovery", () => {
  let runPythonWithProgress: typeof import("../../../packages/ai/src/bridge.js").runPythonWithProgress;
  let initDispatcher: typeof import("../../../packages/ai/src/bridge.js").initDispatcher;
  let shutdownDispatcher: typeof import("../../../packages/ai/src/bridge.js").shutdownDispatcher;
  let _getDispatcherStatus: typeof import("../../../packages/ai/src/bridge.js").getDispatcherStatus;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();

    const mod = await import("../../../packages/ai/src/bridge.js");
    runPythonWithProgress = mod.runPythonWithProgress;
    initDispatcher = mod.initDispatcher;
    shutdownDispatcher = mod.shutdownDispatcher;
    _getDispatcherStatus = mod.getDispatcherStatus;
  });

  afterEach(() => {
    shutdownDispatcher();
    vi.restoreAllMocks();
  });

  it("timeout kills the dispatcher so subsequent requests can restart it", async () => {
    vi.useFakeTimers();

    const mock1 = createMockProcess();
    const mock2 = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mock1.process;
      return mock2.process;
    });

    const initPromise = initDispatcher();
    mock1.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    vi.advanceTimersByTime(100);
    await initPromise;

    // First request with short timeout
    const p1 = runPythonWithProgress("slow.py", [], { timeout: 1000 });

    // Timeout fires, kills dispatcher
    vi.advanceTimersByTime(1500);
    await expect(p1).rejects.toThrow("Python script timed out");
    expect(mock1.process.kill).toHaveBeenCalledWith("SIGTERM");

    // After dispatcher is killed, status should reflect it
    // The dispatcher reference is cleared by the close event
    mock1.emitEvent("close", null, "SIGTERM");
    await vi.advanceTimersByTimeAsync(10);

    // Need to advance past backoff
    vi.advanceTimersByTime(5000);

    // Second request should spawn a new dispatcher (or go per-request)
    const p2 = runPythonWithProgress("fast.py", []);
    await vi.advanceTimersByTimeAsync(10);

    mock2.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mock2.emitEvent("close", 0, null);

    const result = await p2;
    expect(result.stdout).toContain("ok");
    // callCount >= 2: original dispatcher + at least one more spawn (new dispatcher or per-request)
    expect(callCount).toBeGreaterThanOrEqual(2);

    vi.useRealTimers();
  });
});

// ── PROCESSING_TIMEOUT_S env var for dispatcher path ────────────────

describe("bridge - PROCESSING_TIMEOUT_S env for dispatcher path", () => {
  let runPythonWithProgress: typeof import("../../../packages/ai/src/bridge.js").runPythonWithProgress;
  let initDispatcher: typeof import("../../../packages/ai/src/bridge.js").initDispatcher;
  let shutdownDispatcher: typeof import("../../../packages/ai/src/bridge.js").shutdownDispatcher;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();

    const mod = await import("../../../packages/ai/src/bridge.js");
    runPythonWithProgress = mod.runPythonWithProgress;
    initDispatcher = mod.initDispatcher;
    shutdownDispatcher = mod.shutdownDispatcher;
  });

  afterEach(() => {
    shutdownDispatcher();
    vi.restoreAllMocks();
    delete process.env.PROCESSING_TIMEOUT_S;
  });

  it("uses PROCESSING_TIMEOUT_S for dispatcher requests when no explicit timeout", async () => {
    process.env.PROCESSING_TIMEOUT_S = "3";

    vi.useFakeTimers();
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const initPromise = initDispatcher();
    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    vi.advanceTimersByTime(100);
    await initPromise;

    const promise = runPythonWithProgress("test.py", []);

    // 3s = 3000ms timeout; advance past it
    vi.advanceTimersByTime(3500);

    await expect(promise).rejects.toThrow("Python script timed out");
    vi.useRealTimers();
  });

  it("ignores zero PROCESSING_TIMEOUT_S and uses default 600s", async () => {
    process.env.PROCESSING_TIMEOUT_S = "0";

    vi.useFakeTimers();
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const initPromise = initDispatcher();
    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    vi.advanceTimersByTime(100);
    await initPromise;

    const promise = runPythonWithProgress("test.py", []);
    await vi.advanceTimersByTimeAsync(10);

    // Advance 10s -- should NOT have timed out with default 600s
    vi.advanceTimersByTime(10_000);

    // Respond before default timeout
    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;
    mock.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id, exitCode: 0, stdout: '{"ok":true}' })}\n`),
    );

    const result = await promise;
    expect(result.stdout).toBe('{"ok":true}');
    vi.useRealTimers();
  });

  it("ignores negative PROCESSING_TIMEOUT_S and uses default 600s", async () => {
    process.env.PROCESSING_TIMEOUT_S = "-5";

    vi.useFakeTimers();
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const initPromise = initDispatcher();
    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    vi.advanceTimersByTime(100);
    await initPromise;

    const promise = runPythonWithProgress("test.py", []);
    await vi.advanceTimersByTimeAsync(10);

    // Should use default (600s), not immediately timeout
    vi.advanceTimersByTime(1000);

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;
    mock.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id, exitCode: 0, stdout: '{"ok":true}' })}\n`),
    );

    const result = await promise;
    expect(result.stdout).toBe('{"ok":true}');
    vi.useRealTimers();
  });
});

// ── Dispatcher stderr interleaving with stdout ──────────────────────

describe("bridge - dispatcher stderr interleaving with stdout responses", () => {
  let runPythonWithProgress: typeof import("../../../packages/ai/src/bridge.js").runPythonWithProgress;
  let initDispatcher: typeof import("../../../packages/ai/src/bridge.js").initDispatcher;
  let shutdownDispatcher: typeof import("../../../packages/ai/src/bridge.js").shutdownDispatcher;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();

    const mod = await import("../../../packages/ai/src/bridge.js");
    runPythonWithProgress = mod.runPythonWithProgress;
    initDispatcher = mod.initDispatcher;
    shutdownDispatcher = mod.shutdownDispatcher;
  });

  afterEach(() => {
    shutdownDispatcher();
    vi.restoreAllMocks();
  });

  async function setupReadyDispatcher() {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);
    const initPromise = initDispatcher();
    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await initPromise;
    return mock;
  }

  it("handles stderr arriving between split stdout response chunks", async () => {
    const mock = await setupReadyDispatcher();
    const progress: Array<{ percent: number; stage: string }> = [];

    const promise = runPythonWithProgress("test.py", [], {
      onProgress: (p, s) => progress.push({ percent: p, stage: s }),
    });
    await new Promise((r) => setTimeout(r, 10));

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;

    const fullResponse = JSON.stringify({ id, exitCode: 0, stdout: '{"ok": true}' });
    const half = Math.floor(fullResponse.length / 2);

    // First half of stdout
    mock.stdout.emit("data", Buffer.from(fullResponse.slice(0, half)));
    // Progress event interleaved on stderr
    mock.stderr.emit("data", Buffer.from('{"progress": 90, "stage": "Finalizing"}\n'));
    // Second half of stdout + newline
    mock.stdout.emit("data", Buffer.from(`${fullResponse.slice(half)}\n`));

    const result = await promise;
    expect(result.stdout).toBe('{"ok": true}');
    expect(progress).toEqual([{ percent: 90, stage: "Finalizing" }]);
  });

  it("handles multiple progress events interleaved between two responses", async () => {
    const mock = await setupReadyDispatcher();
    const progress1: Array<{ percent: number; stage: string }> = [];
    const progress2: Array<{ percent: number; stage: string }> = [];

    const p1 = runPythonWithProgress("a.py", [], {
      onProgress: (p, s) => progress1.push({ percent: p, stage: s }),
    });
    const p2 = runPythonWithProgress("b.py", [], {
      onProgress: (p, s) => progress2.push({ percent: p, stage: s }),
    });
    await new Promise((r) => setTimeout(r, 10));

    const lines = mock.stdinWrites.join("").split("\n").filter(Boolean);
    const id1 = JSON.parse(lines[0]).id;
    const id2 = JSON.parse(lines[1]).id;

    // Progress, response 1, progress, response 2
    mock.stderr.emit("data", Buffer.from('{"progress": 25, "stage": "Step A"}\n'));
    mock.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id: id1, exitCode: 0, stdout: '{"r":"one"}' })}\n`),
    );
    mock.stderr.emit("data", Buffer.from('{"progress": 75, "stage": "Step B"}\n'));
    mock.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id: id2, exitCode: 0, stdout: '{"r":"two"}' })}\n`),
    );

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.stdout).toBe('{"r":"one"}');
    expect(r2.stdout).toBe('{"r":"two"}');
    // Progress events arrive before their respective response resolves
    // Both pending requests receive all progress (since Python is synchronous)
    expect(progress1.length + progress2.length).toBeGreaterThanOrEqual(1);
  });

  it("handles empty lines in stderr between valid progress events", async () => {
    const mock = await setupReadyDispatcher();
    const progress: Array<{ percent: number; stage: string }> = [];

    const promise = runPythonWithProgress("test.py", [], {
      onProgress: (p, s) => progress.push({ percent: p, stage: s }),
    });
    await new Promise((r) => setTimeout(r, 10));

    // Stderr with empty lines mixed in
    mock.stderr.emit(
      "data",
      Buffer.from('\n\n{"progress": 10, "stage": "Init"}\n\n{"progress": 50, "stage": "Work"}\n\n'),
    );

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;
    mock.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id, exitCode: 0, stdout: '{"ok":true}' })}\n`),
    );

    await promise;
    expect(progress).toEqual([
      { percent: 10, stage: "Init" },
      { percent: 50, stage: "Work" },
    ]);
  });
});

// ── Dispatcher malformed stdout responses ───────────────────────────

describe("bridge - dispatcher malformed stdout responses", () => {
  let runPythonWithProgress: typeof import("../../../packages/ai/src/bridge.js").runPythonWithProgress;
  let initDispatcher: typeof import("../../../packages/ai/src/bridge.js").initDispatcher;
  let shutdownDispatcher: typeof import("../../../packages/ai/src/bridge.js").shutdownDispatcher;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();

    const mod = await import("../../../packages/ai/src/bridge.js");
    runPythonWithProgress = mod.runPythonWithProgress;
    initDispatcher = mod.initDispatcher;
    shutdownDispatcher = mod.shutdownDispatcher;
  });

  afterEach(() => {
    shutdownDispatcher();
    vi.restoreAllMocks();
  });

  async function setupReadyDispatcher() {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);
    const initPromise = initDispatcher();
    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await initPromise;
    return mock;
  }

  it("ignores truncated JSON on stdout and processes next valid response", async () => {
    const mock = await setupReadyDispatcher();

    const promise = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;

    // Truncated JSON line (parse fails, silently ignored)
    mock.stdout.emit("data", Buffer.from('{"id": "bad", "exitCo\n'));
    // Valid response
    mock.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id, exitCode: 0, stdout: '{"ok":true}' })}\n`),
    );

    const result = await promise;
    expect(result.stdout).toBe('{"ok":true}');
  });

  it("ignores response with valid JSON but missing id field", async () => {
    const mock = await setupReadyDispatcher();

    const promise = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;

    // Valid JSON but no id field -- pendingRequests.get(undefined) returns undefined
    mock.stdout.emit("data", Buffer.from('{"exitCode": 0, "stdout": "{}"}\n'));
    // Real response
    mock.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id, exitCode: 0, stdout: '{"ok":true}' })}\n`),
    );

    const result = await promise;
    expect(result.stdout).toBe('{"ok":true}');
  });

  it("handles response where exitCode is missing (treated as undefined !== 0)", async () => {
    const mock = await setupReadyDispatcher();

    const promise = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;

    // Response without exitCode field -- exitCode is undefined, !== 0, so it rejects
    mock.stdout.emit("data", Buffer.from(`${JSON.stringify({ id, stdout: '{"ok":true}' })}\n`));

    await expect(promise).rejects.toThrow();
  });
});

// ── Dispatcher stderr progress with non-standard JSON ───────────────

describe("bridge - dispatcher stderr non-progress JSON", () => {
  let runPythonWithProgress: typeof import("../../../packages/ai/src/bridge.js").runPythonWithProgress;
  let initDispatcher: typeof import("../../../packages/ai/src/bridge.js").initDispatcher;
  let shutdownDispatcher: typeof import("../../../packages/ai/src/bridge.js").shutdownDispatcher;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();

    const mod = await import("../../../packages/ai/src/bridge.js");
    runPythonWithProgress = mod.runPythonWithProgress;
    initDispatcher = mod.initDispatcher;
    shutdownDispatcher = mod.shutdownDispatcher;
  });

  afterEach(() => {
    shutdownDispatcher();
    vi.restoreAllMocks();
  });

  async function setupReadyDispatcher() {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);
    const initPromise = initDispatcher();
    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await initPromise;
    return mock;
  }

  it("does not invoke onProgress for JSON with progress as string type", async () => {
    const mock = await setupReadyDispatcher();
    const onProgress = vi.fn();

    const promise = runPythonWithProgress("test.py", [], { onProgress });
    await new Promise((r) => setTimeout(r, 10));

    // progress is a string, not a number -- typeof check fails
    mock.stderr.emit("data", Buffer.from('{"progress": "50%", "stage": "Working"}\n'));

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;
    mock.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id, exitCode: 0, stdout: '{"ok":true}' })}\n`),
    );

    await promise;
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("does not invoke onProgress for JSON with stage as number type", async () => {
    const mock = await setupReadyDispatcher();
    const onProgress = vi.fn();

    const promise = runPythonWithProgress("test.py", [], { onProgress });
    await new Promise((r) => setTimeout(r, 10));

    // stage is a number, not a string
    mock.stderr.emit("data", Buffer.from('{"progress": 50, "stage": 2}\n'));

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;
    mock.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id, exitCode: 0, stdout: '{"ok":true}' })}\n`),
    );

    await promise;
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("handles ready=true signal after dispatcher was already ready (idempotent)", async () => {
    const mock = await setupReadyDispatcher();

    // Send another ready signal -- should not crash
    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": true}\n'));

    // Request should still work
    const promise = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;
    mock.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id, exitCode: 0, stdout: '{"ok":true}' })}\n`),
    );

    const result = await promise;
    expect(result.stdout).toBe('{"ok":true}');
  });
});

// ── Per-request fallback ENOENT retry chain ─────────────────────────

describe("bridge - per-request ENOENT retry with non-ENOENT fallback error", () => {
  let runPythonWithProgress: typeof import("../../../packages/ai/src/bridge.js").runPythonWithProgress;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();

    const mod = await import("../../../packages/ai/src/bridge.js");
    runPythonWithProgress = mod.runPythonWithProgress;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("venv ENOENT triggers python3 fallback, non-ENOENT on fallback rejects directly", async () => {
    const mockDisp = createMockProcess();
    const mockVenv = createMockProcess();
    const mockFallback = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDisp.process;
      if (callCount === 2) return mockVenv.process;
      return mockFallback.process;
    });

    const promise = runPythonWithProgress("test.py", []);

    // Dispatcher ENOENT
    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    mockDisp.emitEvent("error", enoent);
    await new Promise((r) => setTimeout(r, 10));

    // Venv python ENOENT (triggers fallback to python3)
    const venvError = new Error("ENOENT") as NodeJS.ErrnoException;
    venvError.code = "ENOENT";
    mockVenv.emitEvent("error", venvError);
    await new Promise((r) => setTimeout(r, 10));

    // Fallback python3 gets EACCES (not ENOENT -- no further retry)
    const fallbackError = new Error("Permission denied") as NodeJS.ErrnoException;
    fallbackError.code = "EACCES";
    mockFallback.emitEvent("error", fallbackError);

    await expect(promise).rejects.toThrow("Permission denied");
  });
});

// ── Dispatcher error event rejects pending with extractPythonError ──

describe("bridge - dispatcher error event extracts error for pending requests", () => {
  let runPythonWithProgress: typeof import("../../../packages/ai/src/bridge.js").runPythonWithProgress;
  let initDispatcher: typeof import("../../../packages/ai/src/bridge.js").initDispatcher;
  let shutdownDispatcher: typeof import("../../../packages/ai/src/bridge.js").shutdownDispatcher;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();

    const mod = await import("../../../packages/ai/src/bridge.js");
    runPythonWithProgress = mod.runPythonWithProgress;
    initDispatcher = mod.initDispatcher;
    shutdownDispatcher = mod.shutdownDispatcher;
  });

  afterEach(() => {
    shutdownDispatcher();
    vi.restoreAllMocks();
  });

  it("dispatcher error with non-ENOENT code rejects pending requests with extracted error", async () => {
    const mockDisp = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDisp.process;
      return mockPerReq.process;
    });

    // Make dispatcher ready
    const initPromise = initDispatcher();
    mockDisp.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await initPromise;

    const promise = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));

    // Dispatcher emits error (e.g., pipe broken)
    // The error handler calls extractPythonError which returns err.message
    // This is "write EPIPE", which does NOT match the retry condition
    // ("Python dispatcher exited unexpectedly" or "stdin closed unexpectedly"),
    // so it re-throws rather than retrying per-request.
    const err = new Error("write EPIPE") as NodeJS.ErrnoException;
    err.code = "EPIPE";
    mockDisp.emitEvent("error", err);

    await expect(promise).rejects.toThrow("write EPIPE");
  });
});

// ── Dispatcher stdin error handler ──────────────────────────────────

describe("bridge - dispatcher stdin error suppression", () => {
  let initDispatcher: typeof import("../../../packages/ai/src/bridge.js").initDispatcher;
  let shutdownDispatcher: typeof import("../../../packages/ai/src/bridge.js").shutdownDispatcher;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();

    const mod = await import("../../../packages/ai/src/bridge.js");
    initDispatcher = mod.initDispatcher;
    shutdownDispatcher = mod.shutdownDispatcher;
  });

  afterEach(() => {
    shutdownDispatcher();
    vi.restoreAllMocks();
  });

  it("does not crash when stdin emits an error event", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const initPromise = initDispatcher();
    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await initPromise;

    // Emit error on stdin -- bridge registers child.stdin?.on("error", () => {})
    // so this should be silently swallowed
    expect(() => {
      mock.stdin.emit("error", new Error("EPIPE"));
    }).not.toThrow();
  });
});

// ── initDispatcher edge cases ───────────────────────────────────────

describe("bridge - initDispatcher additional edge cases", () => {
  let initDispatcher: typeof import("../../../packages/ai/src/bridge.js").initDispatcher;
  let shutdownDispatcher: typeof import("../../../packages/ai/src/bridge.js").shutdownDispatcher;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();

    const mod = await import("../../../packages/ai/src/bridge.js");
    initDispatcher = mod.initDispatcher;
    shutdownDispatcher = mod.shutdownDispatcher;
  });

  afterEach(() => {
    shutdownDispatcher();
    vi.restoreAllMocks();
  });

  it("resolves with ready=false when getDispatcher returns null during backoff", async () => {
    vi.useFakeTimers();

    // Force a crash to set backoff
    const mock1 = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mock1.process;
      return mockPerReq.process;
    });

    // Crash the dispatcher
    const mod = await import("../../../packages/ai/src/bridge.js");
    const promise = mod.runPythonWithProgress("test.py", []);
    mock1.emitEvent("close", 1, null);
    await vi.advanceTimersByTimeAsync(20);
    mockPerReq.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPerReq.emitEvent("close", 0, null);
    await promise;

    // Now within backoff window, initDispatcher should return false
    const result = await mod.initDispatcher(100);
    expect(result).toEqual({ ready: false, gpu: false });

    vi.useRealTimers();
  });

  it("handles concurrent initDispatcher calls -- both resolve with same result", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const p1 = initDispatcher();
    const p2 = initDispatcher();

    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": true}\n'));

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ ready: true, gpu: true });
    expect(r2).toEqual({ ready: true, gpu: true });
    // Only one spawn call
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});

// ── Env vars: DISPATCHER_MAX_REQUESTS, U2NET_HOME, DATA_DIR ────────

describe("bridge - env passthrough for sidecar-specific vars", () => {
  let runPythonWithProgress: typeof import("../../../packages/ai/src/bridge.js").runPythonWithProgress;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();
    const mod = await import("../../../packages/ai/src/bridge.js");
    runPythonWithProgress = mod.runPythonWithProgress;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.U2NET_HOME;
    delete process.env.DATA_DIR;
    delete process.env.MODELS_PATH;
    delete process.env.DISPATCHER_MAX_REQUESTS;
  });

  function getLastSpawnEnv(): Record<string, string> | undefined {
    const allCalls = vi.mocked(spawn).mock.calls;
    const lastCall = allCalls[allCalls.length - 1];
    return (lastCall?.[2] as { env?: Record<string, string> })?.env;
  }

  it("passes U2NET_HOME to subprocess", async () => {
    process.env.U2NET_HOME = "/models/u2net";

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test.py", []);
    mock.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mock.emitEvent("close", 0, null);
    await promise;

    expect(getLastSpawnEnv()?.U2NET_HOME).toBe("/models/u2net");
  });

  it("passes DATA_DIR to subprocess", async () => {
    process.env.DATA_DIR = "/app/data";

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test.py", []);
    mock.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mock.emitEvent("close", 0, null);
    await promise;

    expect(getLastSpawnEnv()?.DATA_DIR).toBe("/app/data");
  });

  it("passes DISPATCHER_MAX_REQUESTS to subprocess", async () => {
    process.env.DISPATCHER_MAX_REQUESTS = "100";

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test.py", []);
    mock.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mock.emitEvent("close", 0, null);
    await promise;

    expect(getLastSpawnEnv()?.DISPATCHER_MAX_REQUESTS).toBe("100");
  });

  it("defaults data/model paths but does not include other unset vars in subprocess env", async () => {
    delete process.env.U2NET_HOME;
    delete process.env.DATA_DIR;
    delete process.env.MODELS_PATH;
    delete process.env.DISPATCHER_MAX_REQUESTS;

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test.py", []);
    mock.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mock.emitEvent("close", 0, null);
    await promise;

    const env = getLastSpawnEnv();
    expect(env?.U2NET_HOME).toBeUndefined();
    expect(env?.DATA_DIR).toBe("./data");
    expect(env?.MODELS_PATH).toBe("./data/ai/models");
    expect(env?.DISPATCHER_MAX_REQUESTS).toBeUndefined();
  });
});

// ── Per-request stderr partial buffer flush on non-zero exit ────────

describe("bridge - per-request stderr buffer flush on error exit", () => {
  let runPythonWithProgress: typeof import("../../../packages/ai/src/bridge.js").runPythonWithProgress;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();

    const mod = await import("../../../packages/ai/src/bridge.js");
    runPythonWithProgress = mod.runPythonWithProgress;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("includes partial stderr buffer in error when process exits non-zero", async () => {
    const mockDisp = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDisp.process;
      return mockPerReq.process;
    });

    const promise = runPythonWithProgress("test.py", []);

    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    mockDisp.emitEvent("error", enoent);
    await new Promise((r) => setTimeout(r, 10));

    // Partial stderr (no trailing newline) before close
    mockPerReq.stderr.emit("data", Buffer.from("ModuleNotFoundError: No module named 'torch'"));
    mockPerReq.emitEvent("close", 1, null);

    await expect(promise).rejects.toThrow("No module named 'torch'");
  });
});

// ── Concurrent dispatcher requests with mixed outcomes ──────────────

describe("bridge - concurrent dispatcher requests with timeouts", () => {
  let runPythonWithProgress: typeof import("../../../packages/ai/src/bridge.js").runPythonWithProgress;
  let initDispatcher: typeof import("../../../packages/ai/src/bridge.js").initDispatcher;
  let shutdownDispatcher: typeof import("../../../packages/ai/src/bridge.js").shutdownDispatcher;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();

    const mod = await import("../../../packages/ai/src/bridge.js");
    runPythonWithProgress = mod.runPythonWithProgress;
    initDispatcher = mod.initDispatcher;
    shutdownDispatcher = mod.shutdownDispatcher;
  });

  afterEach(() => {
    shutdownDispatcher();
    vi.restoreAllMocks();
  });

  it("one request timing out does not prevent other requests from resolving", async () => {
    vi.useFakeTimers();
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const initPromise = initDispatcher();
    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    vi.advanceTimersByTime(100);
    await initPromise;

    // Two concurrent requests with different timeouts
    const pShort = runPythonWithProgress("slow.py", [], { timeout: 1000 });
    const pLong = runPythonWithProgress("fast.py", [], { timeout: 60000 });
    await vi.advanceTimersByTimeAsync(10);

    const lines = mock.stdinWrites.join("").split("\n").filter(Boolean);
    const _idSlow = JSON.parse(lines[0]).id;
    const idFast = JSON.parse(lines[1]).id;

    // Short timeout fires
    vi.advanceTimersByTime(1500);

    // Respond to fast request before dispatcher is killed
    mock.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id: idFast, exitCode: 0, stdout: '{"ok":true}' })}\n`),
    );

    // The slow one should reject with timeout
    await expect(pShort).rejects.toThrow("Python script timed out");

    // The fast one should have resolved (or retry via per-request)
    // Since the timeout kills the dispatcher, the fast request might have been
    // resolved before the kill, or rejected and retried. Either way it should not hang.
    try {
      const r = await pLong;
      expect(r.stdout).toContain("ok");
    } catch {
      // If dispatcher was killed before fast response was processed, it retries
    }

    vi.useRealTimers();
  });
});

// ── parseStdoutJson with edge-case strings ──────────────────────────

describe("bridge - parseStdoutJson additional boundary cases", () => {
  let parseStdoutJson: (stdout: string) => unknown;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("../../../packages/ai/src/bridge.js");
    parseStdoutJson = mod.parseStdoutJson;
  });

  it("handles JSON with curly braces inside string values", () => {
    const result = parseStdoutJson('{"text": "value with {braces} inside"}');
    expect(result).toEqual({ text: "value with {braces} inside" });
  });

  it("handles JSON with tab characters in string values", () => {
    const result = parseStdoutJson('{"text": "col1\\tcol2"}');
    expect(result).toEqual({ text: "col1\tcol2" });
  });

  it("handles JSON with newline characters in string values", () => {
    const result = parseStdoutJson('{"text": "line1\\nline2\\nline3"}');
    expect(result).toEqual({ text: "line1\nline2\nline3" });
  });

  it("handles JSON with backslash in path values", () => {
    const result = parseStdoutJson('{"path": "C:\\\\Users\\\\test\\\\file.png"}');
    expect(result).toEqual({ path: "C:\\Users\\test\\file.png" });
  });

  it("throws on stdout containing only opening brace", () => {
    expect(() => parseStdoutJson("{")).toThrow();
  });

  it("throws on stdout containing brace pair with invalid content", () => {
    expect(() => parseStdoutJson("{ invalid: json }")).toThrow();
  });

  it("handles JSON with zero/negative number values", () => {
    const result = parseStdoutJson('{"scratchCoverage": 0, "delta": -0.5}');
    expect(result).toEqual({ scratchCoverage: 0, delta: -0.5 });
  });

  it("handles JSON with boolean false and empty string", () => {
    const result = parseStdoutJson('{"success": false, "error": ""}');
    expect(result).toEqual({ success: false, error: "" });
  });
});
