import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock child_process.spawn before importing the bridge module.
// Each test gets its own mock process via `createMockProcess`.
// ---------------------------------------------------------------------------

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

const spawnMock = vi.mocked(spawn);

// ---------------------------------------------------------------------------
// Helpers: Build a fake ChildProcess with piped stdin / stdout / stderr
// ---------------------------------------------------------------------------

interface MockProcess extends EventEmitter {
  pid: number;
  stdin: Writable & { _written: string[] };
  stdout: Readable;
  stderr: Readable;
  killed: boolean;
  kill: ReturnType<typeof vi.fn>;
  _pushStdout: (data: string) => void;
  _pushStderr: (data: string) => void;
  _emitClose: (code: number | null, signal?: string | null) => void;
  _emitError: (err: NodeJS.ErrnoException) => void;
}

function createMockProcess(pid = 12345): MockProcess {
  const proc = new EventEmitter() as MockProcess;
  proc.pid = pid;
  proc.killed = false;

  const stdinBuf: string[] = [];
  const writable = new Writable({
    write(chunk, _enc, cb) {
      stdinBuf.push(chunk.toString());
      cb();
    },
  });
  (writable as Writable & { _written: string[] })._written = stdinBuf;
  proc.stdin = writable as Writable & { _written: string[] };

  proc.stdout = new Readable({ read() {} });
  proc.stderr = new Readable({ read() {} });

  proc.kill = vi.fn(() => {
    proc.killed = true;
    return true;
  });

  proc._pushStdout = (data: string) => proc.stdout.push(data);
  proc._pushStderr = (data: string) => proc.stderr.push(data);
  proc._emitClose = (code, signal = null) => proc.emit("close", code, signal);
  proc._emitError = (err) => proc.emit("error", err);

  return proc;
}

// ---------------------------------------------------------------------------
// Module-level state reset between tests.
//
// bridge.ts stores dispatcher state in module-level variables. To isolate
// tests we re-import the module fresh each time.
// ---------------------------------------------------------------------------

let bridge: typeof import("../../../packages/ai/src/bridge.js");

async function freshBridge() {
  vi.resetModules();
  // Re-mock child_process after resetModules
  vi.doMock("node:child_process", () => ({
    spawn: spawnMock,
  }));
  bridge = await import("../../../packages/ai/src/bridge.js");
}

beforeEach(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  spawnMock.mockReset();
  await freshBridge();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helper: Spawn the dispatcher, send readiness signal, return the mock proc.
// ---------------------------------------------------------------------------

async function spawnReadyDispatcher(opts?: { gpu?: boolean }): Promise<MockProcess> {
  const proc = createMockProcess();
  spawnMock.mockReturnValue(proc as unknown as ChildProcess);

  const initPromise = bridge.initDispatcher(5_000);

  // Emit readiness signal on stderr
  proc._pushStderr(`${JSON.stringify({ ready: true, gpu: opts?.gpu ?? false })}\n`);

  const status = await initPromise;
  expect(status.ready).toBe(true);
  return proc;
}

// Helper: Disable the dispatcher permanently via ENOENT so tests can
// exercise the per-request fallback path.
async function disableDispatcher(): Promise<void> {
  const badProc = createMockProcess();
  spawnMock.mockReturnValueOnce(badProc as unknown as ChildProcess);

  const initPromise = bridge.initDispatcher(200);
  const enoent = new Error("not found") as NodeJS.ErrnoException;
  enoent.code = "ENOENT";
  badProc._emitError(enoent);
  await initPromise;

  expect(bridge.getDispatcherStatus().failed).toBe(true);
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("AI Bridge - parseStdoutJson", () => {
  it("extracts JSON object from the end of stdout", () => {
    const result = bridge.parseStdoutJson('Some text\n{"success":true,"width":100}');
    expect(result).toEqual({ success: true, width: 100 });
  });

  it("handles stdout that is only JSON", () => {
    const result = bridge.parseStdoutJson('{"ok":1}');
    expect(result).toEqual({ ok: 1 });
  });

  it("throws when no JSON object is present", () => {
    expect(() => bridge.parseStdoutJson("no json here")).toThrow(
      "No JSON response from Python script",
    );
  });

  it("throws on empty string", () => {
    expect(() => bridge.parseStdoutJson("")).toThrow("No JSON response from Python script");
  });

  it("handles nested JSON objects", () => {
    const input = '{"outer":{"inner":42},"list":[1,2]}';
    const result = bridge.parseStdoutJson(input);
    expect(result).toEqual({ outer: { inner: 42 }, list: [1, 2] });
  });
});

describe("AI Bridge - isGpuAvailable", () => {
  it("returns false when dispatcher has not started", () => {
    expect(bridge.isGpuAvailable()).toBe(false);
  });

  it("returns true when dispatcher reports GPU", async () => {
    await spawnReadyDispatcher({ gpu: true });
    expect(bridge.isGpuAvailable()).toBe(true);
  });

  it("returns false when dispatcher reports no GPU", async () => {
    await spawnReadyDispatcher({ gpu: false });
    expect(bridge.isGpuAvailable()).toBe(false);
  });
});

describe("AI Bridge - getDispatcherStatus", () => {
  it("reports not running initially", () => {
    const status = bridge.getDispatcherStatus();
    expect(status.running).toBe(false);
    expect(status.ready).toBe(false);
    expect(status.failed).toBe(false);
    expect(status.gpu).toBe(false);
    expect(status.pid).toBeNull();
    expect(status.consecutiveCrashes).toBe(0);
  });

  it("reports running after init", async () => {
    const proc = await spawnReadyDispatcher({ gpu: true });
    const status = bridge.getDispatcherStatus();
    expect(status.running).toBe(true);
    expect(status.ready).toBe(true);
    expect(status.gpu).toBe(true);
    expect(status.pid).toBe(proc.pid);
  });
});

describe("AI Bridge - initDispatcher", () => {
  it("spawns python process with dispatcher.py", async () => {
    const proc = createMockProcess();
    spawnMock.mockReturnValue(proc as unknown as ChildProcess);

    const initPromise = bridge.initDispatcher(5_000);
    proc._pushStderr(`${JSON.stringify({ ready: true, gpu: false })}\n`);
    const result = await initPromise;

    expect(result).toEqual({ ready: true, gpu: false });
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const callArgs = spawnMock.mock.calls[0];
    expect(callArgs[1]?.[0]).toContain("dispatcher.py");
  });

  it("returns ready:false on timeout", async () => {
    const proc = createMockProcess();
    spawnMock.mockReturnValue(proc as unknown as ChildProcess);

    const initPromise = bridge.initDispatcher(200);
    // Do NOT send the ready signal
    vi.advanceTimersByTime(300);
    const result = await initPromise;

    expect(result).toEqual({ ready: false, gpu: false });
  });

  it("is idempotent when already ready", async () => {
    await spawnReadyDispatcher();
    const result = await bridge.initDispatcher(500);
    expect(result).toEqual({ ready: true, gpu: false });
    // spawn should have been called only once total
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it("returns ready:false when dispatcher failed permanently", async () => {
    await disableDispatcher();

    const result = await bridge.initDispatcher(200);
    expect(result).toEqual({ ready: false, gpu: false });
    expect(bridge.getDispatcherStatus().failed).toBe(true);
  });
});

describe("AI Bridge - shutdownDispatcher", () => {
  it("kills the dispatcher process", async () => {
    const proc = await spawnReadyDispatcher();
    bridge.shutdownDispatcher();
    expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("marks status as not running after shutdown", async () => {
    await spawnReadyDispatcher();
    bridge.shutdownDispatcher();
    const status = bridge.getDispatcherStatus();
    expect(status.running).toBe(false);
    expect(status.ready).toBe(false);
  });

  it("is safe to call when no dispatcher is running", () => {
    expect(() => bridge.shutdownDispatcher()).not.toThrow();
  });
});

describe("AI Bridge - runPythonWithProgress (dispatcher path)", () => {
  it("sends JSON-lines request to dispatcher stdin", async () => {
    const proc = await spawnReadyDispatcher();

    const resultPromise = bridge.runPythonWithProgress("test_script.py", ["arg1", "arg2"]);

    // Read the request that was written to stdin
    expect(proc.stdin._written.length).toBe(1);

    const request = JSON.parse(proc.stdin._written[0].trim());
    expect(request.script).toBe("test_script");
    expect(request.args).toEqual(["arg1", "arg2"]);
    expect(request.id).toBeDefined();

    // Send matching response on stdout
    proc._pushStdout(`${JSON.stringify({ id: request.id, stdout: '{"ok":true}', exitCode: 0 })}\n`);

    const result = await resultPromise;
    expect(result.stdout).toBe('{"ok":true}');
  });

  it("strips .py from script name in dispatcher request", async () => {
    const proc = await spawnReadyDispatcher();

    bridge.runPythonWithProgress("remove_bg.py", []);

    const request = JSON.parse(proc.stdin._written[0].trim());
    expect(request.script).toBe("remove_bg");
  });

  it("resolves with stdout and stderr", async () => {
    const proc = await spawnReadyDispatcher();

    const resultPromise = bridge.runPythonWithProgress("test.py", []);

    const request = JSON.parse(proc.stdin._written[0].trim());

    // Push a non-JSON stderr line (gets collected)
    proc._pushStderr("some warning\n");
    // Now send the response
    proc._pushStdout(`${JSON.stringify({ id: request.id, stdout: "output", exitCode: 0 })}\n`);

    const result = await resultPromise;
    expect(result.stdout).toBe("output");
    expect(result.stderr).toContain("some warning");
  });

  it("rejects on non-zero exit code", async () => {
    const proc = await spawnReadyDispatcher();

    const resultPromise = bridge.runPythonWithProgress("fail.py", []);

    const request = JSON.parse(proc.stdin._written[0].trim());

    proc._pushStdout(`${JSON.stringify({ id: request.id, stdout: "", exitCode: 1 })}\n`);

    await expect(resultPromise).rejects.toThrow("Python script exited with code 1");
  });

  it("returns OOM message for exit code 137", async () => {
    const proc = await spawnReadyDispatcher();

    const resultPromise = bridge.runPythonWithProgress("oom.py", []);

    const request = JSON.parse(proc.stdin._written[0].trim());

    proc._pushStdout(`${JSON.stringify({ id: request.id, stdout: "", exitCode: 137 })}\n`);

    await expect(resultPromise).rejects.toThrow("out of memory");
  });

  it("returns segfault message for exit code 139", async () => {
    const proc = await spawnReadyDispatcher();

    const resultPromise = bridge.runPythonWithProgress("crash.py", []);

    const request = JSON.parse(proc.stdin._written[0].trim());

    proc._pushStdout(`${JSON.stringify({ id: request.id, stdout: "", exitCode: 139 })}\n`);

    await expect(resultPromise).rejects.toThrow("segmentation fault");
  });

  it("extracts error from JSON stdout on failure", async () => {
    const proc = await spawnReadyDispatcher();

    const resultPromise = bridge.runPythonWithProgress("fail.py", []);

    const request = JSON.parse(proc.stdin._written[0].trim());

    proc._pushStdout(
      `${JSON.stringify({
        id: request.id,
        stdout: '{"error":"Model not found"}',
        exitCode: 1,
      })}\n`,
    );

    await expect(resultPromise).rejects.toThrow("Model not found");
  });

  it("handles concurrent requests matched by id", async () => {
    const proc = await spawnReadyDispatcher();

    const promise1 = bridge.runPythonWithProgress("script1.py", ["a"]);
    const promise2 = bridge.runPythonWithProgress("script2.py", ["b"]);

    const req1 = JSON.parse(proc.stdin._written[0].trim());
    const req2 = JSON.parse(proc.stdin._written[1].trim());

    // Respond to req2 first, then req1 (out of order)
    proc._pushStdout(`${JSON.stringify({ id: req2.id, stdout: "result-2", exitCode: 0 })}\n`);
    proc._pushStdout(`${JSON.stringify({ id: req1.id, stdout: "result-1", exitCode: 0 })}\n`);

    const [res1, res2] = await Promise.all([promise1, promise2]);
    expect(res1.stdout).toBe("result-1");
    expect(res2.stdout).toBe("result-2");
  });

  it("routes progress events to the onProgress callback", async () => {
    const proc = await spawnReadyDispatcher();

    const progressCalls: Array<{ percent: number; stage: string }> = [];
    const onProgress = (percent: number, stage: string) => {
      progressCalls.push({ percent, stage });
    };

    const resultPromise = bridge.runPythonWithProgress("slow.py", [], { onProgress });

    const request = JSON.parse(proc.stdin._written[0].trim());

    // Emit progress events on stderr
    proc._pushStderr(`${JSON.stringify({ progress: 25, stage: "Loading model" })}\n`);
    proc._pushStderr(`${JSON.stringify({ progress: 75, stage: "Processing" })}\n`);

    // Complete the request
    proc._pushStdout(`${JSON.stringify({ id: request.id, stdout: "done", exitCode: 0 })}\n`);

    await resultPromise;

    expect(progressCalls).toEqual([
      { percent: 25, stage: "Loading model" },
      { percent: 75, stage: "Processing" },
    ]);
  });

  it("rejects with timeout error and kills dispatcher", async () => {
    const proc = await spawnReadyDispatcher();

    const resultPromise = bridge.runPythonWithProgress("slow.py", [], { timeout: 500 });

    // Advance past the timeout
    vi.advanceTimersByTime(600);

    await expect(resultPromise).rejects.toThrow("Python script timed out");
    expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("uses PROCESSING_TIMEOUT_S env var when set", async () => {
    const savedEnv = process.env.PROCESSING_TIMEOUT_S;
    process.env.PROCESSING_TIMEOUT_S = "2";

    try {
      await freshBridge();
      const _proc = await spawnReadyDispatcher();

      const resultPromise = bridge.runPythonWithProgress("env_timeout.py", []);

      // 2s timeout from env var
      vi.advanceTimersByTime(2100);

      await expect(resultPromise).rejects.toThrow("Python script timed out");
    } finally {
      if (savedEnv === undefined) {
        delete process.env.PROCESSING_TIMEOUT_S;
      } else {
        process.env.PROCESSING_TIMEOUT_S = savedEnv;
      }
    }
  });

  it("clears timeout on successful response", async () => {
    const proc = await spawnReadyDispatcher();

    const resultPromise = bridge.runPythonWithProgress("fast.py", [], { timeout: 1000 });

    const request = JSON.parse(proc.stdin._written[0].trim());

    // Respond quickly
    proc._pushStdout(`${JSON.stringify({ id: request.id, stdout: "ok", exitCode: 0 })}\n`);

    const result = await resultPromise;
    expect(result.stdout).toBe("ok");

    // Advance time past the would-be timeout -- should not throw
    vi.advanceTimersByTime(2000);
  });
});

describe("AI Bridge - runPythonWithProgress (per-request fallback)", () => {
  it("falls back to per-request mode when dispatcher is not available", async () => {
    await disableDispatcher();

    // Now runPythonWithProgress should use per-request fallback
    const fallbackProc = createMockProcess(99999);
    spawnMock.mockReturnValue(fallbackProc as unknown as ChildProcess);

    const resultPromise = bridge.runPythonWithProgress("fallback.py", ["x", "y"]);

    // Per-request mode spawns python with [scriptPath, ...args]
    expect(spawnMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    const lastCall = spawnMock.mock.calls[spawnMock.mock.calls.length - 1];
    expect(lastCall[1]?.[0]).toContain("fallback.py");
    expect(lastCall[1]?.slice(1)).toEqual(["x", "y"]);

    // Simulate successful exit -- use nextTick to ensure listeners are attached
    await vi.advanceTimersByTimeAsync(0);
    fallbackProc._pushStdout('{"success":true}');
    fallbackProc._emitClose(0);

    const result = await resultPromise;
    // Per-request mode trims stdout
    expect(result.stdout).toBe('{"success":true}');
  });

  it("per-request mode parses progress events on stderr", async () => {
    await disableDispatcher();

    const fallbackProc = createMockProcess();
    spawnMock.mockReturnValue(fallbackProc as unknown as ChildProcess);

    const progressCalls: Array<{ percent: number; stage: string }> = [];
    const resultPromise = bridge.runPythonWithProgress("progress.py", [], {
      onProgress: (p, s) => progressCalls.push({ percent: p, stage: s }),
    });

    // Let listeners attach
    await vi.advanceTimersByTimeAsync(0);
    fallbackProc._pushStderr(`${JSON.stringify({ progress: 50, stage: "Half done" })}\n`);
    fallbackProc._pushStdout("output");
    fallbackProc._emitClose(0);

    await resultPromise;
    expect(progressCalls).toEqual([{ percent: 50, stage: "Half done" }]);
  });

  it("per-request mode rejects on timeout", async () => {
    await disableDispatcher();

    const fallbackProc = createMockProcess();
    spawnMock.mockReturnValue(fallbackProc as unknown as ChildProcess);

    const resultPromise = bridge.runPythonWithProgress("slow.py", [], { timeout: 400 });

    // Advance past timeout
    vi.advanceTimersByTime(500);

    // The timeout handler calls child.kill("SIGTERM"), then the close event fires
    // with the timedOut flag set
    fallbackProc._emitClose(null, "SIGTERM");

    await expect(resultPromise).rejects.toThrow("Python script timed out");
  });

  it("per-request mode rejects on non-zero exit", async () => {
    await disableDispatcher();

    const fallbackProc = createMockProcess();
    spawnMock.mockReturnValue(fallbackProc as unknown as ChildProcess);

    const resultPromise = bridge.runPythonWithProgress("bad.py", []);

    // Let listeners attach, then push data
    await vi.advanceTimersByTimeAsync(0);
    fallbackProc._pushStdout('{"error":"something broke"}');
    fallbackProc._emitClose(1);

    await expect(resultPromise).rejects.toThrow("something broke");
  });

  it("per-request SIGKILL maps to OOM message", async () => {
    await disableDispatcher();

    const fallbackProc = createMockProcess();
    spawnMock.mockReturnValue(fallbackProc as unknown as ChildProcess);

    const resultPromise = bridge.runPythonWithProgress("oom.py", []);

    // Let listeners attach
    await vi.advanceTimersByTimeAsync(0);
    fallbackProc._emitClose(null, "SIGKILL");

    await expect(resultPromise).rejects.toThrow("out of memory");
  });

  it("per-request SIGSEGV maps to segfault message", async () => {
    await disableDispatcher();

    const fallbackProc = createMockProcess();
    spawnMock.mockReturnValue(fallbackProc as unknown as ChildProcess);

    const resultPromise = bridge.runPythonWithProgress("seg.py", []);

    // Let listeners attach
    await vi.advanceTimersByTimeAsync(0);
    fallbackProc._emitClose(null, "SIGSEGV");

    await expect(resultPromise).rejects.toThrow("segmentation fault");
  });

  it("per-request fallback tries system python3 on ENOENT", async () => {
    await disableDispatcher();

    // First per-request spawn gets ENOENT (venv python not found),
    // then the fallback to "python3" succeeds.
    const failProc = createMockProcess();
    const successProc = createMockProcess();

    let perRequestCallCount = 0;
    spawnMock.mockImplementation(() => {
      perRequestCallCount++;
      if (perRequestCallCount === 1) {
        // First per-request attempt (venv python)
        return failProc as unknown as ChildProcess;
      }
      // The python3 fallback
      return successProc as unknown as ChildProcess;
    });

    const resultPromise = bridge.runPythonWithProgress("test.py", []);

    // Let listeners attach to failProc
    await vi.advanceTimersByTimeAsync(0);

    // First attempt fails with ENOENT
    const enoent2 = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent2.code = "ENOENT";
    failProc._emitError(enoent2);

    // Let listeners attach to successProc
    await vi.advanceTimersByTimeAsync(0);

    // Fallback succeeds
    successProc._pushStdout("fallback ok");
    successProc._emitClose(0);

    const result = await resultPromise;
    expect(result.stdout).toBe("fallback ok");
  });
});

describe("AI Bridge - crash recovery", () => {
  it("rejects pending requests when dispatcher closes unexpectedly", async () => {
    const proc = await spawnReadyDispatcher();

    // Set up the fallback proc that will also reject, so the promise settles
    const fallbackProc = createMockProcess();
    spawnMock.mockReturnValue(fallbackProc as unknown as ChildProcess);

    const resultPromise = bridge.runPythonWithProgress("test.py", []);

    // Simulate unexpected close -- triggers "Python dispatcher exited unexpectedly"
    // which runPythonWithProgress catches and retries with per-request mode
    proc._emitClose(1);

    // Let the per-request fallback spawn
    await vi.advanceTimersByTimeAsync(0);

    // Complete the fallback
    fallbackProc._pushStdout("recovered");
    fallbackProc._emitClose(0);

    const result = await resultPromise;
    // The retry path appends a note to stderr
    expect(result.stderr).toContain("retried after dispatcher crash");
  });

  it("increments crash count on non-zero close", async () => {
    const proc = await spawnReadyDispatcher();
    proc._emitClose(1);

    const status = bridge.getDispatcherStatus();
    expect(status.consecutiveCrashes).toBe(1);
  });

  it("retries with per-request mode after dispatcher crash during request", async () => {
    const proc = await spawnReadyDispatcher();

    // Set up a per-request fallback proc
    const fallbackProc = createMockProcess();
    spawnMock.mockReturnValue(fallbackProc as unknown as ChildProcess);

    const resultPromise = bridge.runPythonWithProgress("test.py", ["arg"]);

    // Crash the dispatcher
    proc._emitClose(1);

    // The bridge retries with per-request mode on "Python dispatcher exited unexpectedly"
    // Wait for the fallback to be spawned
    await vi.advanceTimersByTimeAsync(100);

    fallbackProc._pushStdout("fallback result");
    fallbackProc._emitClose(0);

    const result = await resultPromise;
    expect(result.stdout).toBe("fallback result");
    expect(result.stderr).toContain("retried after dispatcher crash");
  });

  it("marks dispatcher as permanently failed after max consecutive crashes", async () => {
    // Crash the dispatcher 5 times within the crash window on a single bridge instance
    for (let i = 0; i < 5; i++) {
      const proc = createMockProcess();
      spawnMock.mockReturnValue(proc as unknown as ChildProcess);

      bridge.initDispatcher(200);
      proc._emitClose(1); // Non-zero close triggers recordCrash

      // Advance past backoff (but stay within crash window)
      vi.advanceTimersByTime(10_000);
    }

    const status = bridge.getDispatcherStatus();
    expect(status.failed).toBe(true);
  });

  it("applies exponential backoff between crash restarts", async () => {
    const proc1 = createMockProcess();
    spawnMock.mockReturnValue(proc1 as unknown as ChildProcess);

    const initPromise = bridge.initDispatcher(200);
    proc1._pushStderr(`${JSON.stringify({ ready: true, gpu: false })}\n`);
    await initPromise;

    // Crash once
    proc1._emitClose(1);

    // Immediately trying to use the dispatcher should get null (backoff)
    // The status should show consecutiveCrashes = 1
    const status = bridge.getDispatcherStatus();
    expect(status.consecutiveCrashes).toBe(1);
    expect(status.running).toBe(false);
  });

  it("rejects all pending requests on dispatcher error", async () => {
    const proc = await spawnReadyDispatcher();

    // We need fallback procs for the retry path. Make them also fail so
    // the promises reject rather than hanging.
    const fallback1 = createMockProcess();
    const fallback2 = createMockProcess();
    let fallbackIdx = 0;
    spawnMock.mockImplementation(() => {
      fallbackIdx++;
      return (fallbackIdx === 1 ? fallback1 : fallback2) as unknown as ChildProcess;
    });

    const promise1 = bridge.runPythonWithProgress("a.py", []);
    const promise2 = bridge.runPythonWithProgress("b.py", []);

    // Emit error -- this rejects both pending requests with the error message.
    // But runPythonWithProgress only retries on "exited unexpectedly", not other errors.
    const err = new Error("connection lost");
    proc._emitError(err);

    await expect(promise1).rejects.toThrow();
    await expect(promise2).rejects.toThrow();
  });

  it("ENOENT error permanently disables dispatcher", async () => {
    const proc = createMockProcess();
    spawnMock.mockReturnValue(proc as unknown as ChildProcess);

    bridge.initDispatcher(200);

    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    proc._emitError(enoent);

    expect(bridge.getDispatcherStatus().failed).toBe(true);
  });
});

describe("AI Bridge - progress event parsing", () => {
  it("routes JSON progress events from stderr to onProgress", async () => {
    const proc = await spawnReadyDispatcher();

    const progressCalls: Array<{ percent: number; stage: string }> = [];
    const resultPromise = bridge.runPythonWithProgress("test.py", [], {
      onProgress: (p, s) => progressCalls.push({ percent: p, stage: s }),
    });

    const request = JSON.parse(proc.stdin._written[0].trim());

    proc._pushStderr(`${JSON.stringify({ progress: 10, stage: "Init" })}\n`);
    proc._pushStderr(`${JSON.stringify({ progress: 50, stage: "Processing" })}\n`);
    proc._pushStderr(`${JSON.stringify({ progress: 100, stage: "Done" })}\n`);

    proc._pushStdout(`${JSON.stringify({ id: request.id, stdout: "ok", exitCode: 0 })}\n`);
    await resultPromise;

    expect(progressCalls).toHaveLength(3);
    expect(progressCalls[0]).toEqual({ percent: 10, stage: "Init" });
    expect(progressCalls[2]).toEqual({ percent: 100, stage: "Done" });
  });

  it("ignores non-JSON stderr lines (logs them, does not crash)", async () => {
    const proc = await spawnReadyDispatcher();

    const resultPromise = bridge.runPythonWithProgress("test.py", []);

    const request = JSON.parse(proc.stdin._written[0].trim());

    // Push plain text stderr - should not crash
    proc._pushStderr("UserWarning: some library warning\n");
    proc._pushStderr("[python] Loading module...\n");

    proc._pushStdout(`${JSON.stringify({ id: request.id, stdout: "ok", exitCode: 0 })}\n`);

    const result = await resultPromise;
    expect(result.stdout).toBe("ok");
  });

  it("readiness signal sets GPU status", async () => {
    const proc = createMockProcess();
    spawnMock.mockReturnValue(proc as unknown as ChildProcess);

    const initPromise = bridge.initDispatcher(5_000);
    proc._pushStderr(`${JSON.stringify({ ready: true, gpu: true })}\n`);

    const result = await initPromise;
    expect(result.gpu).toBe(true);
    expect(bridge.isGpuAvailable()).toBe(true);
  });

  it("collects non-JSON stderr as error context for failed requests", async () => {
    const proc = await spawnReadyDispatcher();

    const resultPromise = bridge.runPythonWithProgress("fail.py", []);

    const request = JSON.parse(proc.stdin._written[0].trim());

    // Push diagnostic stderr before the error
    proc._pushStderr("RuntimeError: CUDA out of memory\n");

    proc._pushStdout(`${JSON.stringify({ id: request.id, stdout: "", exitCode: 1 })}\n`);

    await expect(resultPromise).rejects.toThrow("CUDA out of memory");
  });

  it("forwards {info} shaped stderr JSON to the logger instead of dropping it", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const proc = await spawnReadyDispatcher();

    const resultPromise = bridge.runPythonWithProgress("ocr.py", []);
    const request = JSON.parse(proc.stdin._written[0].trim());

    // This is the exact shape ocr.py emits on its GPU-to-tesseract downgrade notice.
    proc._pushStderr(`${JSON.stringify({ info: "best OCR needs a GPU; using tesseract" })}\n`);
    proc._pushStdout(`${JSON.stringify({ id: request.id, stdout: "ok", exitCode: 0 })}\n`);
    await resultPromise;

    expect(
      logSpy.mock.calls.some((call) =>
        String(call[0]).includes("best OCR needs a GPU; using tesseract"),
      ),
    ).toBe(true);
    logSpy.mockRestore();
  });

  it("forwards {warning} shaped stderr JSON to the logger instead of dropping it", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const proc = await spawnReadyDispatcher();

    const resultPromise = bridge.runPythonWithProgress("ocr.py", []);
    const request = JSON.parse(proc.stdin._written[0].trim());

    proc._pushStderr(`${JSON.stringify({ warning: "Enhancement skipped: boom" })}\n`);
    proc._pushStdout(`${JSON.stringify({ id: request.id, stdout: "ok", exitCode: 0 })}\n`);
    await resultPromise;

    expect(
      warnSpy.mock.calls.some((call) => String(call[0]).includes("Enhancement skipped: boom")),
    ).toBe(true);
    warnSpy.mockRestore();
  });
});

describe("AI Bridge - stdout buffering (partial JSON lines)", () => {
  it("handles response split across multiple chunks", async () => {
    const proc = await spawnReadyDispatcher();

    const resultPromise = bridge.runPythonWithProgress("test.py", []);

    const request = JSON.parse(proc.stdin._written[0].trim());

    const fullResponse = JSON.stringify({ id: request.id, stdout: "chunked", exitCode: 0 });

    // Split the response across two pushes (no newline until the end)
    const mid = Math.floor(fullResponse.length / 2);
    proc._pushStdout(fullResponse.slice(0, mid));
    proc._pushStdout(`${fullResponse.slice(mid)}\n`);

    const result = await resultPromise;
    expect(result.stdout).toBe("chunked");
  });
});
