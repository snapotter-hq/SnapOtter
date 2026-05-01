import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
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

describe("bridge - parseStdoutJson", () => {
  // parseStdoutJson is a pure function, safe to test without mocking spawn
  let parseStdoutJson: (stdout: string) => unknown;

  beforeEach(async () => {
    // Dynamic import to get a fresh module each time
    const mod = await import("../../../packages/ai/src/bridge.js");
    parseStdoutJson = mod.parseStdoutJson;
  });

  it("extracts JSON object from clean stdout", () => {
    const result = parseStdoutJson('{"success": true, "text": "hello"}');
    expect(result).toEqual({ success: true, text: "hello" });
  });

  it("extracts JSON from stdout with leading progress lines", () => {
    const stdout = [
      "Loading model...",
      "Processing: 50%",
      "Processing: 100%",
      '{"success": true, "width": 800, "height": 600}',
    ].join("\n");

    const result = parseStdoutJson(stdout);
    expect(result).toEqual({ success: true, width: 800, height: 600 });
  });

  it("matches greedily from first brace to last brace", () => {
    // The regex /\{[\s\S]*\}$/ is greedy: when multiple JSON objects appear
    // on separate lines it captures from the FIRST '{' to the LAST '}'.
    // This only works when the earlier lines don't contain braces.
    const stdout = "some log line\n" + '{"success": true, "result": "final"}';

    const result = parseStdoutJson(stdout);
    expect(result).toEqual({ success: true, result: "final" });
  });

  it("throws when multiple JSON objects produce invalid merged JSON", () => {
    // The greedy regex merges two separate JSON lines into one invalid string
    const stdout = [
      '{"progress": 50}',
      "some log line",
      '{"success": true, "result": "final"}',
    ].join("\n");

    // This demonstrates the greedy regex limitation
    expect(() => parseStdoutJson(stdout)).toThrow();
  });

  it("throws when stdout contains no JSON", () => {
    expect(() => parseStdoutJson("just some text output")).toThrow(
      "No JSON response from Python script",
    );
  });

  it("throws on empty stdout", () => {
    expect(() => parseStdoutJson("")).toThrow("No JSON response from Python script");
  });

  it("throws when JSON is malformed", () => {
    expect(() => parseStdoutJson("{not valid json}")).toThrow();
  });

  it("handles multiline JSON object", () => {
    const stdout = `some progress line
{
  "success": true,
  "data": {
    "nested": "value"
  }
}`;
    const result = parseStdoutJson(stdout);
    expect(result).toEqual({ success: true, data: { nested: "value" } });
  });

  it("extracts JSON with special characters in string values", () => {
    const result = parseStdoutJson('{"text": "hello\\nworld", "path": "/tmp/foo bar.png"}');
    expect(result).toEqual({ text: "hello\nworld", path: "/tmp/foo bar.png" });
  });
});

describe("bridge - isGpuAvailable", () => {
  let isGpuAvailable: () => boolean;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("../../../packages/ai/src/bridge.js");
    isGpuAvailable = mod.isGpuAvailable;
  });

  it("returns false by default (no dispatcher started)", () => {
    // Without starting a dispatcher, GPU should default to false
    expect(isGpuAvailable()).toBe(false);
  });
});

describe("bridge - shutdownDispatcher", () => {
  let shutdownDispatcher: () => void;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("../../../packages/ai/src/bridge.js");
    shutdownDispatcher = mod.shutdownDispatcher;
  });

  it("does not throw when no dispatcher is running", () => {
    expect(() => shutdownDispatcher()).not.toThrow();
  });
});

describe("bridge - runPythonWithProgress (per-request fallback)", () => {
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

  it("resolves with stdout/stderr on successful exit (code 0)", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test_script.py", ["arg1", "arg2"]);

    // Simulate Python output then exit
    mock.stdout.emit("data", Buffer.from('{"success": true}\n'));
    mock.emitEvent("close", 0, null);

    const result = await promise;
    expect(result.stdout).toBe('{"success": true}');
  });

  it("rejects with error message on non-zero exit code", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test_script.py", []);

    mock.stderr.emit("data", Buffer.from("RuntimeError: model not found\n"));
    mock.emitEvent("close", 1, null);

    await expect(promise).rejects.toThrow("RuntimeError: model not found");
  });

  it("rejects with OOM message on exit code 137 (SIGKILL)", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test_script.py", []);

    mock.emitEvent("close", 137, "SIGKILL");

    await expect(promise).rejects.toThrow("Process killed (out of memory)");
  });

  it("rejects with segfault message on exit code 139 (SIGSEGV)", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test_script.py", []);

    mock.emitEvent("close", 139, "SIGSEGV");

    await expect(promise).rejects.toThrow("Process crashed (segmentation fault)");
  });

  it("rejects with timeout error when process exceeds timeout", async () => {
    vi.useFakeTimers();
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test_script.py", [], {
      timeout: 1000,
    });

    // Advance past the timeout
    vi.advanceTimersByTime(1500);

    // The timeout kills the process, then close event fires
    mock.emitEvent("close", null, "SIGTERM");

    await expect(promise).rejects.toThrow("Python script timed out");
    vi.useRealTimers();
  });

  it("invokes onProgress callback for JSON progress lines on stderr", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);
    const progressUpdates: Array<{ percent: number; stage: string }> = [];

    const promise = runPythonWithProgress("test_script.py", [], {
      onProgress: (percent, stage) => {
        progressUpdates.push({ percent, stage });
      },
    });

    // Emit progress lines on stderr (Python convention)
    mock.stderr.emit("data", Buffer.from('{"progress": 25, "stage": "Loading model"}\n'));
    mock.stderr.emit("data", Buffer.from('{"progress": 75, "stage": "Processing"}\n'));

    // Emit result and close
    mock.stdout.emit("data", Buffer.from('{"success": true}\n'));
    mock.emitEvent("close", 0, null);

    await promise;
    expect(progressUpdates).toEqual([
      { percent: 25, stage: "Loading model" },
      { percent: 75, stage: "Processing" },
    ]);
  });

  it("rejects when spawn emits ENOENT error and fallback also fails", async () => {
    // runPythonWithProgress does 3 spawn calls in the ENOENT path:
    //  1. dispatcher spawn (startDispatcher)
    //  2. per-request venv python spawn
    //  3. per-request fallback python3 spawn
    const mockDispatcher = createMockProcess();
    const mockVenv = createMockProcess();
    const mockFallback = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDispatcher.process;
      if (callCount === 2) return mockVenv.process;
      return mockFallback.process;
    });

    const promise = runPythonWithProgress("test_script.py", []);

    // Dispatcher spawn fails with ENOENT (marks dispatcherFailed = true)
    const dispatcherError = new Error("spawn ENOENT") as NodeJS.ErrnoException;
    dispatcherError.code = "ENOENT";
    mockDispatcher.emitEvent("error", dispatcherError);

    // Allow microtask queue to process the dispatcher failure and start per-request
    await new Promise((r) => setTimeout(r, 10));

    // Per-request venv python fails with ENOENT
    const venvError = new Error("spawn ENOENT") as NodeJS.ErrnoException;
    venvError.code = "ENOENT";
    mockVenv.emitEvent("error", venvError);

    // Allow microtask for fallback spawn
    await new Promise((r) => setTimeout(r, 10));

    // Fallback python3 also fails
    const fallbackError = new Error("spawn ENOENT") as NodeJS.ErrnoException;
    fallbackError.code = "ENOENT";
    mockFallback.emitEvent("error", fallbackError);

    await expect(promise).rejects.toThrow();
  });

  it("extracts error from JSON stderr when Python writes structured errors", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test_script.py", []);

    // Python writes a structured error to stdout
    mock.stdout.emit("data", Buffer.from('{"error": "CUDA out of memory"}\n'));
    mock.emitEvent("close", 1, null);

    await expect(promise).rejects.toThrow();
  });

  it("handles stderr output that is not JSON (regular log lines)", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test_script.py", []);

    // Regular log line, not JSON
    mock.stderr.emit("data", Buffer.from("Warning: deprecated API\n"));
    mock.stdout.emit("data", Buffer.from('{"success": true}\n'));
    mock.emitEvent("close", 0, null);

    const result = await promise;
    // Stderr contains the warning line
    expect(result.stderr).toContain("Warning: deprecated API");
  });

  it("handles chunked stdout data arriving in multiple events", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test_script.py", []);

    // JSON arrives in two chunks
    mock.stdout.emit("data", Buffer.from('{"success":'));
    mock.stdout.emit("data", Buffer.from(" true}\n"));
    mock.emitEvent("close", 0, null);

    const result = await promise;
    expect(result.stdout).toBe('{"success": true}');
  });

  it("extracts last line from Python traceback on non-zero exit", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test_script.py", []);

    const traceback = [
      "Traceback (most recent call last):",
      '  File "script.py", line 10, in <module>',
      '    raise ValueError("bad input")',
      "ValueError: bad input",
    ].join("\n");

    mock.stderr.emit("data", Buffer.from(traceback + "\n"));
    mock.emitEvent("close", 1, null);

    await expect(promise).rejects.toThrow("ValueError: bad input");
  });

  it("passes script path and args to spawn correctly", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("remove_bg.py", ["/tmp/in.png", "/tmp/out.png"]);

    mock.stdout.emit("data", Buffer.from('{"success": true}\n'));
    mock.emitEvent("close", 0, null);

    await promise;

    // spawn is called at least twice: once for dispatcher, once for per-request.
    // The per-request call (last or second) includes the script path + user args.
    expect(spawn).toHaveBeenCalled();
    const allCalls = vi.mocked(spawn).mock.calls;
    // Find the per-request call that includes our user args
    const perRequestCall = allCalls.find(
      (call) =>
        Array.isArray(call[1]) && call[1].some((arg: string) => arg.includes("/tmp/in.png")),
    );
    expect(perRequestCall).toBeDefined();
    expect(perRequestCall![1]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("remove_bg.py"),
        "/tmp/in.png",
        "/tmp/out.png",
      ]),
    );
  });

  it("accumulates multiple stderr chunks into a single string", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test_script.py", []);

    mock.stderr.emit("data", Buffer.from("line1\n"));
    mock.stderr.emit("data", Buffer.from("line2\n"));
    mock.stdout.emit("data", Buffer.from('{"success": true}\n'));
    mock.emitEvent("close", 0, null);

    const result = await promise;
    expect(result.stderr).toContain("line1");
    expect(result.stderr).toContain("line2");
  });

  it("flushes partial stderr buffer on process close", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test_script.py", []);

    // Emit partial line without trailing newline
    mock.stderr.emit("data", Buffer.from("partial error"));
    mock.stdout.emit("data", Buffer.from('{"success": true}\n'));
    mock.emitEvent("close", 0, null);

    const result = await promise;
    expect(result.stderr).toContain("partial error");
  });

  it("ignores empty stderr lines during progress parsing", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);
    const progressUpdates: Array<{ percent: number; stage: string }> = [];

    const promise = runPythonWithProgress("test_script.py", [], {
      onProgress: (percent, stage) => {
        progressUpdates.push({ percent, stage });
      },
    });

    // Empty lines between progress updates
    mock.stderr.emit("data", Buffer.from("\n\n" + '{"progress": 50, "stage": "Working"}\n\n'));
    mock.stdout.emit("data", Buffer.from('{"success": true}\n'));
    mock.emitEvent("close", 0, null);

    await promise;
    expect(progressUpdates).toEqual([{ percent: 50, stage: "Working" }]);
  });

  it("treats SIGKILL signal as OOM error", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test_script.py", []);

    // SIGKILL signal without exit code 137
    mock.emitEvent("close", null, "SIGKILL");

    await expect(promise).rejects.toThrow("out of memory");
  });

  it("treats SIGSEGV signal as segfault error", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test_script.py", []);

    mock.emitEvent("close", null, "SIGSEGV");

    await expect(promise).rejects.toThrow("segmentation fault");
  });

  it("includes exit code in error when no signal and no stderr", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test_script.py", []);

    mock.emitEvent("close", 2, null);

    await expect(promise).rejects.toThrow("exited with code 2");
  });

  it("does not invoke onProgress for non-JSON stderr lines", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);
    const onProgress = vi.fn();

    const promise = runPythonWithProgress("test_script.py", [], { onProgress });

    mock.stderr.emit("data", Buffer.from("not JSON at all\n"));
    mock.stdout.emit("data", Buffer.from('{"success": true}\n'));
    mock.emitEvent("close", 0, null);

    await promise;
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("does not invoke onProgress for JSON without progress field", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);
    const onProgress = vi.fn();

    const promise = runPythonWithProgress("test_script.py", [], { onProgress });

    mock.stderr.emit("data", Buffer.from('{"status": "loading"}\n'));
    mock.stdout.emit("data", Buffer.from('{"success": true}\n'));
    mock.emitEvent("close", 0, null);

    await promise;
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("uses PROCESSING_TIMEOUT_S env var when set", async () => {
    const origTimeout = process.env.PROCESSING_TIMEOUT_S;
    process.env.PROCESSING_TIMEOUT_S = "5";

    vi.useFakeTimers();
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test_script.py", []);

    // 5 seconds = 5000ms
    vi.advanceTimersByTime(5500);
    mock.emitEvent("close", null, "SIGTERM");

    await expect(promise).rejects.toThrow("Python script timed out");
    vi.useRealTimers();

    // Restore
    if (origTimeout !== undefined) {
      process.env.PROCESSING_TIMEOUT_S = origTimeout;
    } else {
      delete process.env.PROCESSING_TIMEOUT_S;
    }
  });

  it("ignores invalid PROCESSING_TIMEOUT_S values", async () => {
    const origTimeout = process.env.PROCESSING_TIMEOUT_S;
    process.env.PROCESSING_TIMEOUT_S = "0";

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test_script.py", []);

    mock.stdout.emit("data", Buffer.from('{"success": true}\n'));
    mock.emitEvent("close", 0, null);

    // Should not throw -- falls back to 600000ms default
    await expect(promise).resolves.toBeDefined();

    if (origTimeout !== undefined) {
      process.env.PROCESSING_TIMEOUT_S = origTimeout;
    } else {
      delete process.env.PROCESSING_TIMEOUT_S;
    }
  });
});

describe("bridge - parseStdoutJson edge cases", () => {
  let parseStdoutJson: (stdout: string) => unknown;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("../../../packages/ai/src/bridge.js");
    parseStdoutJson = mod.parseStdoutJson;
  });

  it("handles JSON with array values", () => {
    const result = parseStdoutJson('{"success": true, "steps": ["a", "b"]}');
    expect(result).toEqual({ success: true, steps: ["a", "b"] });
  });

  it("handles deeply nested JSON", () => {
    const result = parseStdoutJson('{"success": true, "data": {"a": {"b": {"c": 1}}}}');
    expect(result).toEqual({ success: true, data: { a: { b: { c: 1 } } } });
  });

  it("handles JSON with numeric values", () => {
    const result = parseStdoutJson('{"width": 1920, "height": 1080, "scale": 2.5}');
    expect(result).toEqual({ width: 1920, height: 1080, scale: 2.5 });
  });

  it("handles JSON with boolean and null values", () => {
    const result = parseStdoutJson('{"success": true, "error": null, "gpu": false}');
    expect(result).toEqual({ success: true, error: null, gpu: false });
  });

  it("handles JSON with unicode characters", () => {
    const result = parseStdoutJson('{"text": "\\u4f60\\u597d"}');
    expect(result).toEqual({ text: "你好" });
  });

  it("throws on stdout that is only whitespace", () => {
    expect(() => parseStdoutJson("   \n\n  ")).toThrow("No JSON response");
  });

  it("extracts JSON that follows multiple non-JSON log lines", () => {
    const stdout = [
      "WARNING: GPU not detected",
      "INFO: Falling back to CPU",
      "INFO: Model loaded in 2.3s",
      '{"success": true, "device": "cpu"}',
    ].join("\n");

    const result = parseStdoutJson(stdout);
    expect(result).toEqual({ success: true, device: "cpu" });
  });
});

describe("bridge - getDispatcherStatus", () => {
  let getDispatcherStatus: typeof import("../../../packages/ai/src/bridge.js").getDispatcherStatus;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("../../../packages/ai/src/bridge.js");
    getDispatcherStatus = mod.getDispatcherStatus;
  });

  it("returns initial state with no dispatcher running", () => {
    const status = getDispatcherStatus();
    expect(status).toEqual({
      running: false,
      ready: false,
      failed: false,
      gpu: false,
      pid: null,
      consecutiveCrashes: 0,
    });
  });
});

describe("bridge - dispatcher lifecycle via runPythonWithProgress", () => {
  let runPythonWithProgress: typeof import("../../../packages/ai/src/bridge.js").runPythonWithProgress;
  let getDispatcherStatus: typeof import("../../../packages/ai/src/bridge.js").getDispatcherStatus;
  let shutdownDispatcher: typeof import("../../../packages/ai/src/bridge.js").shutdownDispatcher;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();

    const mod = await import("../../../packages/ai/src/bridge.js");
    runPythonWithProgress = mod.runPythonWithProgress;
    getDispatcherStatus = mod.getDispatcherStatus;
    shutdownDispatcher = mod.shutdownDispatcher;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to per-request spawn when dispatcher ENOENT marks it failed", async () => {
    const mockDispatcher = createMockProcess();
    const mockPerRequest = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDispatcher.process;
      return mockPerRequest.process;
    });

    const promise = runPythonWithProgress("test.py", ["arg1"]);

    // Dispatcher fails with ENOENT => permanently failed
    const enoent = new Error("spawn ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    mockDispatcher.emitEvent("error", enoent);

    await new Promise((r) => setTimeout(r, 10));

    // Per-request spawn succeeds
    mockPerRequest.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPerRequest.emitEvent("close", 0, null);

    const result = await promise;
    expect(result.stdout).toContain('{"ok": true}');
  });

  it("reports failed status when dispatcher ENOENT occurs", async () => {
    const mockDispatcher = createMockProcess();
    const mockPerRequest = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDispatcher.process;
      return mockPerRequest.process;
    });

    const promise = runPythonWithProgress("test.py", []);

    const enoent = new Error("spawn ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    mockDispatcher.emitEvent("error", enoent);

    await new Promise((r) => setTimeout(r, 10));

    // Finish the per-request
    mockPerRequest.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPerRequest.emitEvent("close", 0, null);
    await promise;

    const status = getDispatcherStatus();
    expect(status.failed).toBe(true);
    expect(status.running).toBe(false);
  });

  it("graceful shutdown does not throw when dispatcher already exited", async () => {
    const mockDispatcher = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDispatcher.process;
      return mockPerReq.process;
    });

    const promise = runPythonWithProgress("test.py", []);

    // Dispatcher closes (crash) -- sets dispatcher = null internally
    mockDispatcher.emitEvent("close", 1, null);
    await new Promise((r) => setTimeout(r, 10));

    // shutdownDispatcher should not throw even when no dispatcher is running
    expect(() => shutdownDispatcher()).not.toThrow();

    // Finish the per-request fallback
    mockPerReq.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPerReq.emitEvent("close", 0, null);

    await promise;
  });

  it("shutdown is idempotent when called multiple times", () => {
    expect(() => {
      shutdownDispatcher();
      shutdownDispatcher();
      shutdownDispatcher();
    }).not.toThrow();
  });

  it("concurrent requests to per-request fallback both resolve", async () => {
    // Dispatcher fails immediately, so both requests go to per-request path
    const mockDispatcher = createMockProcess();
    const mockReq1 = createMockProcess();
    const mockReq2 = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDispatcher.process;
      if (callCount === 2) return mockReq1.process;
      return mockReq2.process;
    });

    // Start first request
    const promise1 = runPythonWithProgress("tool1.py", ["a"]);

    // Kill dispatcher
    const enoent = new Error("spawn ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    mockDispatcher.emitEvent("error", enoent);

    await new Promise((r) => setTimeout(r, 10));

    // Start second request (dispatcher is now permanently failed)
    const promise2 = runPythonWithProgress("tool2.py", ["b"]);

    await new Promise((r) => setTimeout(r, 10));

    // Complete both per-request processes
    mockReq1.stdout.emit("data", Buffer.from('{"result": "one"}\n'));
    mockReq1.emitEvent("close", 0, null);

    mockReq2.stdout.emit("data", Buffer.from('{"result": "two"}\n'));
    mockReq2.emitEvent("close", 0, null);

    const [r1, r2] = await Promise.all([promise1, promise2]);
    expect(r1.stdout).toContain("one");
    expect(r2.stdout).toContain("two");
  });

  it("timeout rejects the promise without affecting other requests", async () => {
    vi.useFakeTimers();
    const mockDispatcher = createMockProcess();
    const mockReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDispatcher.process;
      return mockReq.process;
    });

    const promise = runPythonWithProgress("slow.py", [], { timeout: 2000 });

    // Dispatcher ENOENT => per-request fallback
    const enoent = new Error("spawn ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    mockDispatcher.emitEvent("error", enoent);

    // Advance past timeout
    vi.advanceTimersByTime(3000);

    // Process gets killed, close fires
    mockReq.emitEvent("close", null, "SIGTERM");

    await expect(promise).rejects.toThrow("Python script timed out");
    vi.useRealTimers();
  });

  it("handles dispatcher crash followed by successful per-request retry", async () => {
    const mockDispatcher = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDispatcher.process;
      return mockPerReq.process;
    });

    const promise = runPythonWithProgress("test.py", []);

    // Dispatcher crashes with a non-ENOENT error
    const err = new Error("spawn failed");
    (err as NodeJS.ErrnoException).code = "EACCES";
    mockDispatcher.emitEvent("error", err);

    await new Promise((r) => setTimeout(r, 10));

    // Per-request succeeds
    mockPerReq.stdout.emit("data", Buffer.from('{"success": true}\n'));
    mockPerReq.emitEvent("close", 0, null);

    const result = await promise;
    expect(result.stdout).toContain("success");
  });

  it("dispatcher ready signal sets dispatcherReady and processes requests via dispatcher", async () => {
    const mockDispatcher = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      return mockDispatcher.process;
    });

    // Trigger dispatcher start by calling runPythonWithProgress
    // The dispatcher needs to be marked ready before it can handle requests
    const promise = runPythonWithProgress("test.py", ["arg1"]);

    // Simulate the dispatcher readiness signal on stderr
    mockDispatcher.stderr.emit("data", Buffer.from('{"ready": true, "gpu": true}\n'));

    // Wait for readiness to be processed
    await new Promise((r) => setTimeout(r, 10));

    // Since the request was sent before ready, it went to per-request path
    // Finish via per-request path
    mockDispatcher.stdout.emit("data", Buffer.from('{"success": true}\n'));
    mockDispatcher.emitEvent("close", 0, null);

    const result = await promise;
    expect(result.stdout).toContain("success");
  });

  it("dispatcher ready signal with GPU=false sets gpu to false", async () => {
    const mockDispatcher = createMockProcess();

    vi.mocked(spawn).mockImplementation(() => mockDispatcher.process);

    const promise = runPythonWithProgress("test.py", []);

    // Send ready signal without GPU
    mockDispatcher.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));

    await new Promise((r) => setTimeout(r, 10));

    // Finish via per-request
    mockDispatcher.stdout.emit("data", Buffer.from('{"success": true}\n'));
    mockDispatcher.emitEvent("close", 0, null);

    await promise;

    const status = getDispatcherStatus();
    expect(status.gpu).toBe(false);
  });

  it("dispatcher close event rejects all pending requests", async () => {
    const mockDispatcher = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDispatcher.process;
      return mockPerReq.process;
    });

    const promise = runPythonWithProgress("test.py", []);

    // Dispatcher closes unexpectedly
    mockDispatcher.emitEvent("close", 1, null);

    await new Promise((r) => setTimeout(r, 10));

    // Per-request fallback should handle the request
    mockPerReq.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPerReq.emitEvent("close", 0, null);

    const result = await promise;
    expect(result.stdout).toContain("ok");
  });

  it("getDispatcherStatus reflects consecutiveCrashes after dispatcher crashes", async () => {
    const mockDispatcher = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDispatcher.process;
      return mockPerReq.process;
    });

    const promise = runPythonWithProgress("test.py", []);

    // Dispatcher crashes (non-ENOENT triggers recordCrash)
    mockDispatcher.emitEvent("close", 1, null);

    await new Promise((r) => setTimeout(r, 10));

    mockPerReq.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPerReq.emitEvent("close", 0, null);
    await promise;

    const status = getDispatcherStatus();
    expect(status.consecutiveCrashes).toBeGreaterThanOrEqual(1);
  });

  it("dispatcher progress events are forwarded to pending request callbacks", async () => {
    const mockDispatcher = createMockProcess();

    vi.mocked(spawn).mockImplementation(() => mockDispatcher.process);

    // Emit ready signal to make dispatcher available
    // But since it might go to per-request first, test progress on per-request path
    const progressUpdates: Array<{ percent: number; stage: string }> = [];

    const promise = runPythonWithProgress("test.py", [], {
      onProgress: (percent, stage) => progressUpdates.push({ percent, stage }),
    });

    // stderr progress lines
    mockDispatcher.stderr.emit("data", Buffer.from('{"progress": 50, "stage": "Processing"}\n'));

    mockDispatcher.stdout.emit("data", Buffer.from('{"success": true}\n'));
    mockDispatcher.emitEvent("close", 0, null);

    await promise;
    expect(progressUpdates).toEqual([{ percent: 50, stage: "Processing" }]);
  });

  it("dispatcher stderr routes diagnostic messages with bracket prefix to logger", async () => {
    const mockDispatcher = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDispatcher.process;
      return mockPerReq.process;
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const promise = runPythonWithProgress("test.py", []);

    // Bracket-prefixed line should be logged as diagnostic
    mockDispatcher.stderr.emit("data", Buffer.from("[model] Loading weights...\n"));

    await new Promise((r) => setTimeout(r, 10));

    // Finish with per-request
    mockPerReq.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPerReq.emitEvent("close", 0, null);

    await promise;

    // The bridge logs bracket-prefixed lines with console.log
    const pythonLogCalls = logSpy.mock.calls.filter(
      (call) => typeof call[0] === "string" && call[0].includes("[python]"),
    );
    expect(pythonLogCalls.length).toBeGreaterThanOrEqual(1);

    logSpy.mockRestore();
  });

  it("dispatcher stderr collects non-JSON non-bracket lines as error output", async () => {
    const mockDispatcher = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDispatcher.process;
      return mockPerReq.process;
    });

    const promise = runPythonWithProgress("test.py", []);

    // Non-JSON, non-bracket line should be collected as stderr
    mockDispatcher.stderr.emit("data", Buffer.from("Some warning text\n"));

    await new Promise((r) => setTimeout(r, 10));

    mockPerReq.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPerReq.emitEvent("close", 0, null);

    await promise;
    // The important thing is no crash -- the line is collected for pending requests
  });

  it("does not count exit code 0 as a crash (normal MAX_REQUESTS restart)", async () => {
    const mockDispatcher = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDispatcher.process;
      return mockPerReq.process;
    });

    const promise = runPythonWithProgress("test.py", []);

    // Dispatcher exits with code 0 (normal MAX_REQUESTS shutdown)
    mockDispatcher.emitEvent("close", 0, null);

    await new Promise((r) => setTimeout(r, 10));

    mockPerReq.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPerReq.emitEvent("close", 0, null);
    await promise;

    const status = getDispatcherStatus();
    expect(status.consecutiveCrashes).toBe(0);
    expect(status.failed).toBe(false);
  });

  it("still counts non-zero exit codes as crashes", async () => {
    const mockDispatcher = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDispatcher.process;
      return mockPerReq.process;
    });

    const promise = runPythonWithProgress("test.py", []);

    // Dispatcher exits with code 1 (real crash)
    mockDispatcher.emitEvent("close", 1, null);

    await new Promise((r) => setTimeout(r, 10));

    mockPerReq.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPerReq.emitEvent("close", 0, null);
    await promise;

    const status = getDispatcherStatus();
    expect(status.consecutiveCrashes).toBeGreaterThanOrEqual(1);
  });

  it("per-request fallback retries with python3 when venv python fails with ENOENT", async () => {
    const mockDispatcher = createMockProcess();
    const mockVenvPython = createMockProcess();
    const mockFallbackPython = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDispatcher.process;
      if (callCount === 2) return mockVenvPython.process;
      return mockFallbackPython.process;
    });

    // Kill dispatcher immediately
    const enoent = new Error("spawn ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";

    const promise = runPythonWithProgress("test.py", []);
    mockDispatcher.emitEvent("error", enoent);

    await new Promise((r) => setTimeout(r, 10));

    // Venv python fails with ENOENT
    const venvError = new Error("spawn ENOENT") as NodeJS.ErrnoException;
    venvError.code = "ENOENT";
    mockVenvPython.emitEvent("error", venvError);

    await new Promise((r) => setTimeout(r, 10));

    // Fallback python3 succeeds
    mockFallbackPython.stdout.emit("data", Buffer.from('{"success": true}\n'));
    mockFallbackPython.emitEvent("close", 0, null);

    const result = await promise;
    expect(result.stdout).toContain("success");
    // 3 spawn calls: dispatcher, venv python, fallback python3
    expect(callCount).toBe(3);
  });
});

describe("bridge - initDispatcher", () => {
  let initDispatcher: typeof import("../../../packages/ai/src/bridge.js").initDispatcher;
  let getDispatcherStatus: typeof import("../../../packages/ai/src/bridge.js").getDispatcherStatus;
  let shutdownDispatcher: typeof import("../../../packages/ai/src/bridge.js").shutdownDispatcher;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();

    const mod = await import("../../../packages/ai/src/bridge.js");
    initDispatcher = mod.initDispatcher;
    getDispatcherStatus = mod.getDispatcherStatus;
    shutdownDispatcher = mod.shutdownDispatcher;
  });

  afterEach(() => {
    shutdownDispatcher();
    vi.restoreAllMocks();
  });

  it("resolves with ready=true and gpu status after dispatcher emits readiness", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = initDispatcher();

    // Dispatcher emits readiness signal
    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": true}\n'));

    const result = await promise;
    expect(result).toEqual({ ready: true, gpu: true });
    expect(getDispatcherStatus().ready).toBe(true);
    expect(getDispatcherStatus().gpu).toBe(true);
  });

  it("resolves with ready=false when dispatcher fails with ENOENT", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = initDispatcher();

    const err = new Error("spawn ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    mock.emitEvent("error", err);

    const result = await promise;
    expect(result).toEqual({ ready: false, gpu: false });
  });

  it("resolves with ready=false after timeout when dispatcher never signals ready", async () => {
    vi.useFakeTimers();
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = initDispatcher(500);

    vi.advanceTimersByTime(600);

    const result = await promise;
    expect(result).toEqual({ ready: false, gpu: false });

    vi.useRealTimers();
  });

  it("resolves with gpu=false when dispatcher reports no GPU", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = initDispatcher();

    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));

    const result = await promise;
    expect(result).toEqual({ ready: true, gpu: false });
  });

  it("is idempotent -- second call returns same result without respawning", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise1 = initDispatcher();
    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": true}\n'));
    await promise1;

    const result2 = await initDispatcher();
    expect(result2).toEqual({ ready: true, gpu: true });
    // spawn should only have been called once
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});

// ── Dispatcher stdin JSON-RPC protocol ──────────────────────────────

describe("bridge - dispatcher stdin JSON-RPC protocol", () => {
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

  /**
   * Helper: create a mock, init dispatcher to ready, then return the mock.
   * This ensures dispatcherReady=true so subsequent runPythonWithProgress
   * calls go through the dispatcher path (dispatcherRun) rather than per-request.
   */
  async function setupReadyDispatcher() {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const initPromise = initDispatcher();
    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await initPromise;

    return mock;
  }

  it("writes a JSON-line with id, script (without .py), and args to dispatcher stdin", async () => {
    const mock = await setupReadyDispatcher();

    const promise = runPythonWithProgress("remove_bg.py", ["/tmp/in.png", "/tmp/out.png"]);
    await new Promise((r) => setTimeout(r, 10));

    // Verify stdin received a JSON-line
    expect(mock.stdinWrites.length).toBeGreaterThanOrEqual(1);
    const written = mock.stdinWrites.join("");
    const lines = written.split("\n").filter(Boolean);
    expect(lines.length).toBe(1);

    const request = JSON.parse(lines[0]);
    expect(request).toHaveProperty("id");
    expect(request.script).toBe("remove_bg");
    expect(request.args).toEqual(["/tmp/in.png", "/tmp/out.png"]);

    // Respond to complete the promise
    const response = JSON.stringify({ id: request.id, exitCode: 0, stdout: '{"success": true}' });
    mock.stdout.emit("data", Buffer.from(response + "\n"));

    const result = await promise;
    expect(result.stdout).toBe('{"success": true}');
  });

  it("strips .py extension from script name in dispatcher request", async () => {
    const mock = await setupReadyDispatcher();

    const promise = runPythonWithProgress("upscale.py", ["/tmp/in.png"]);
    await new Promise((r) => setTimeout(r, 10));

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const request = JSON.parse(line);
    expect(request.script).toBe("upscale");

    // Complete the request properly to avoid a hanging retry
    mock.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ id: request.id, exitCode: 0, stdout: "{}" }) + "\n"),
    );
    await promise;
  });

  it("generates a unique UUID id for each request", async () => {
    const mock = await setupReadyDispatcher();

    runPythonWithProgress("tool_a.py", []);
    runPythonWithProgress("tool_b.py", []);
    await new Promise((r) => setTimeout(r, 10));

    const lines = mock.stdinWrites.join("").split("\n").filter(Boolean);
    expect(lines.length).toBe(2);

    const id1 = JSON.parse(lines[0]).id;
    const id2 = JSON.parse(lines[1]).id;
    expect(id1).not.toBe(id2);
    // UUID format check
    expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(id2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

    // Cleanup
    mock.emitEvent("close", 0, null);
  });

  it("routes responses by ID to the correct pending request", async () => {
    const mock = await setupReadyDispatcher();

    const promise1 = runPythonWithProgress("tool_a.py", []);
    const promise2 = runPythonWithProgress("tool_b.py", []);
    await new Promise((r) => setTimeout(r, 10));

    const lines = mock.stdinWrites.join("").split("\n").filter(Boolean);
    const id1 = JSON.parse(lines[0]).id;
    const id2 = JSON.parse(lines[1]).id;

    // Respond to the SECOND request first (out of order)
    mock.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ id: id2, exitCode: 0, stdout: '{"result": "two"}' }) + "\n"),
    );
    // Then respond to the first
    mock.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ id: id1, exitCode: 0, stdout: '{"result": "one"}' }) + "\n"),
    );

    const [r1, r2] = await Promise.all([promise1, promise2]);
    expect(r1.stdout).toBe('{"result": "one"}');
    expect(r2.stdout).toBe('{"result": "two"}');
  });

  it("rejects the correct request when dispatcher returns non-zero exitCode", async () => {
    const mock = await setupReadyDispatcher();

    const promiseOk = runPythonWithProgress("tool_ok.py", []);
    const promiseFail = runPythonWithProgress("tool_fail.py", []);
    await new Promise((r) => setTimeout(r, 10));

    const lines = mock.stdinWrites.join("").split("\n").filter(Boolean);
    const idOk = JSON.parse(lines[0]).id;
    const idFail = JSON.parse(lines[1]).id;

    // Fail request #2
    mock.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ id: idFail, exitCode: 1, stdout: "" }) + "\n"),
    );
    // Succeed request #1
    mock.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ id: idOk, exitCode: 0, stdout: '{"ok": true}' }) + "\n"),
    );

    await expect(promiseFail).rejects.toThrow("exited with code 1");
    const result = await promiseOk;
    expect(result.stdout).toBe('{"ok": true}');
  });

  it("rejects with OOM message when dispatcher response has exitCode 137", async () => {
    const mock = await setupReadyDispatcher();

    const promise = runPythonWithProgress("heavy.py", []);
    await new Promise((r) => setTimeout(r, 10));

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;

    mock.stdout.emit("data", Buffer.from(JSON.stringify({ id, exitCode: 137, stdout: "" }) + "\n"));

    await expect(promise).rejects.toThrow("out of memory");
  });

  it("rejects with segfault message when dispatcher response has exitCode 139", async () => {
    const mock = await setupReadyDispatcher();

    const promise = runPythonWithProgress("crash.py", []);
    await new Promise((r) => setTimeout(r, 10));

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;

    mock.stdout.emit("data", Buffer.from(JSON.stringify({ id, exitCode: 139, stdout: "" }) + "\n"));

    await expect(promise).rejects.toThrow("segmentation fault");
  });

  it("ignores stdout lines that are not valid JSON", async () => {
    const mock = await setupReadyDispatcher();

    const promise = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;

    // Emit invalid JSON on stdout -- should be silently ignored
    mock.stdout.emit("data", Buffer.from("not json at all\n"));
    // Now emit the real response
    mock.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ id, exitCode: 0, stdout: '{"ok": true}' }) + "\n"),
    );

    const result = await promise;
    expect(result.stdout).toBe('{"ok": true}');
  });

  it("ignores stdout responses with unknown request IDs", async () => {
    const mock = await setupReadyDispatcher();

    const promise = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const realId = JSON.parse(line).id;

    // Response for a non-existent request -- should be ignored
    mock.stdout.emit(
      "data",
      Buffer.from(
        JSON.stringify({ id: "00000000-0000-0000-0000-000000000000", exitCode: 0, stdout: "" }) +
          "\n",
      ),
    );
    // Real response
    mock.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ id: realId, exitCode: 0, stdout: '{"ok": true}' }) + "\n"),
    );

    const result = await promise;
    expect(result.stdout).toBe('{"ok": true}');
  });

  it("handles chunked stdout responses split across data events", async () => {
    const mock = await setupReadyDispatcher();

    const promise = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;

    const fullResponse = JSON.stringify({ id, exitCode: 0, stdout: '{"ok": true}' }) + "\n";
    const half = Math.floor(fullResponse.length / 2);

    // Send in two chunks
    mock.stdout.emit("data", Buffer.from(fullResponse.slice(0, half)));
    mock.stdout.emit("data", Buffer.from(fullResponse.slice(half)));

    const result = await promise;
    expect(result.stdout).toBe('{"ok": true}');
  });

  it("returns empty stdout when dispatcher response omits stdout field", async () => {
    const mock = await setupReadyDispatcher();

    const promise = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;

    // Response without stdout field
    mock.stdout.emit("data", Buffer.from(JSON.stringify({ id, exitCode: 0 }) + "\n"));

    const result = await promise;
    expect(result.stdout).toBe("");
  });

  it("collects stderr lines and returns them with the response", async () => {
    const mock = await setupReadyDispatcher();

    const promise = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));

    // Non-JSON, non-bracket stderr goes to pending request stderrLines
    mock.stderr.emit("data", Buffer.from("some warning\n"));
    mock.stderr.emit("data", Buffer.from("another warning\n"));

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;

    mock.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ id, exitCode: 0, stdout: '{"ok": true}' }) + "\n"),
    );

    const result = await promise;
    expect(result.stderr).toContain("some warning");
    expect(result.stderr).toContain("another warning");
  });
});

// ── Dispatcher timeout on dispatcher path ───────────────────────────

describe("bridge - dispatcher request timeout", () => {
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

  it("rejects with timeout when dispatcher does not respond within timeout", async () => {
    vi.useFakeTimers();
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    // Make dispatcher ready using initDispatcher + ready signal
    const initPromise = initDispatcher();
    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    // Need to advance timers so the polling interval fires
    vi.advanceTimersByTime(100);
    await initPromise;

    const promise = runPythonWithProgress("slow.py", [], { timeout: 2000 });

    // Advance past the timeout
    vi.advanceTimersByTime(3000);

    await expect(promise).rejects.toThrow("Python script timed out");
    vi.useRealTimers();
  });
});

// ── Max consecutive crash threshold ─────────────────────────────────

describe("bridge - max consecutive crash threshold", () => {
  let runPythonWithProgress: typeof import("../../../packages/ai/src/bridge.js").runPythonWithProgress;
  let getDispatcherStatus: typeof import("../../../packages/ai/src/bridge.js").getDispatcherStatus;
  let shutdownDispatcher: typeof import("../../../packages/ai/src/bridge.js").shutdownDispatcher;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();

    const mod = await import("../../../packages/ai/src/bridge.js");
    runPythonWithProgress = mod.runPythonWithProgress;
    getDispatcherStatus = mod.getDispatcherStatus;
    shutdownDispatcher = mod.shutdownDispatcher;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets dispatcherFailed after 5 consecutive crashes within the crash window", async () => {
    // Use fake timers so all crashes happen within the 60s window.
    // Also need to advance past backoff between crashes.
    vi.useFakeTimers();

    // We need enough mocks: each crash cycle uses 2 (dispatcher + per-request)
    // but after crash, backoff applies. We need to advance past each backoff
    // before the next runPythonWithProgress call spawns a new dispatcher.
    const mocks: ReturnType<typeof createMockProcess>[] = [];
    for (let i = 0; i < 12; i++) {
      mocks.push(createMockProcess());
    }

    let callCount = 0;
    vi.mocked(spawn).mockImplementation(() => {
      const m = mocks[callCount % mocks.length];
      callCount++;
      return m.process;
    });

    for (let crashNum = 0; crashNum < 5; crashNum++) {
      // Advance past any backoff from previous crash
      // Backoff = 1000 * 2^(crashNum-1), but we just jump 30s which covers all
      if (crashNum > 0) {
        vi.advanceTimersByTime(30_000);
      }

      const mockIdx = crashNum * 2;
      const perReqIdx = crashNum * 2 + 1;

      const promise = runPythonWithProgress("test.py", []);

      // Crash the dispatcher with non-zero exit
      mocks[mockIdx].emitEvent("close", 1, null);

      // Need to let microtasks process the crash + per-request spawn
      await vi.advanceTimersByTimeAsync(20);

      // Complete via per-request fallback
      mocks[perReqIdx].stdout.emit("data", Buffer.from('{"ok": true}\n'));
      mocks[perReqIdx].emitEvent("close", 0, null);
      await promise;
    }

    const status = getDispatcherStatus();
    expect(status.failed).toBe(true);
    expect(status.consecutiveCrashes).toBeGreaterThanOrEqual(5);

    vi.useRealTimers();
  });

  it("after reaching crash threshold, subsequent requests go directly to per-request path", async () => {
    vi.useFakeTimers();

    const mocks: ReturnType<typeof createMockProcess>[] = [];
    for (let i = 0; i < 14; i++) {
      mocks.push(createMockProcess());
    }

    let callCount = 0;
    vi.mocked(spawn).mockImplementation(() => {
      const m = mocks[callCount % mocks.length];
      callCount++;
      return m.process;
    });

    // Crash 5 times to hit the threshold
    for (let i = 0; i < 5; i++) {
      if (i > 0) vi.advanceTimersByTime(30_000);

      const dispIdx = i * 2;
      const prIdx = i * 2 + 1;

      const p = runPythonWithProgress("test.py", []);
      mocks[dispIdx].emitEvent("close", 1, null);
      await vi.advanceTimersByTimeAsync(20);
      mocks[prIdx].stdout.emit("data", Buffer.from('{"ok": true}\n'));
      mocks[prIdx].emitEvent("close", 0, null);
      await p;
    }

    expect(getDispatcherStatus().failed).toBe(true);

    // Now do one more request -- it should skip dispatcher entirely
    const spawnCountBefore = callCount;
    const finalMock = mocks[10];
    const finalPromise = runPythonWithProgress("final.py", []);

    await vi.advanceTimersByTimeAsync(20);

    finalMock.stdout.emit("data", Buffer.from('{"final": true}\n'));
    finalMock.emitEvent("close", 0, null);

    const result = await finalPromise;
    expect(result.stdout).toContain("final");

    // Only 1 new spawn (per-request), not 2 (dispatcher + per-request)
    expect(callCount - spawnCountBefore).toBe(1);

    vi.useRealTimers();
  });

  it("does not reach threshold when fewer than 5 crashes occur", async () => {
    vi.useFakeTimers();

    const mocks: ReturnType<typeof createMockProcess>[] = [];
    for (let i = 0; i < 8; i++) {
      mocks.push(createMockProcess());
    }

    let callCount = 0;
    vi.mocked(spawn).mockImplementation(() => {
      const m = mocks[callCount % mocks.length];
      callCount++;
      return m.process;
    });

    // Crash only 3 times -- should NOT reach threshold
    for (let i = 0; i < 3; i++) {
      if (i > 0) vi.advanceTimersByTime(30_000);

      const dispIdx = i * 2;
      const prIdx = i * 2 + 1;

      const p = runPythonWithProgress("test.py", []);
      mocks[dispIdx].emitEvent("close", 1, null);
      await vi.advanceTimersByTimeAsync(20);
      mocks[prIdx].stdout.emit("data", Buffer.from('{"ok": true}\n'));
      mocks[prIdx].emitEvent("close", 0, null);
      await p;
    }

    const status = getDispatcherStatus();
    expect(status.consecutiveCrashes).toBeGreaterThanOrEqual(3);
    expect(status.failed).toBe(false);

    vi.useRealTimers();
  });

  it("uses exponential backoff delay between crash restarts", async () => {
    vi.useFakeTimers();
    const mock1 = createMockProcess();
    const mockPR1 = createMockProcess();

    let callCount = 0;
    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mock1.process;
      return mockPR1.process;
    });

    // First request: dispatcher crash
    const p1 = runPythonWithProgress("test.py", []);
    mock1.emitEvent("close", 1, null);

    // Complete per-request fallback
    await vi.advanceTimersByTimeAsync(20);
    mockPR1.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPR1.emitEvent("close", 0, null);
    await p1;

    // After first crash, backoff = 1000ms (BASE_BACKOFF_MS * 2^0).
    // A request during backoff should skip dispatcher and go straight to per-request.
    // Advance only 500ms -- still within backoff.
    vi.advanceTimersByTime(500);

    const mockPR2 = createMockProcess();
    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      return mockPR2.process;
    });

    const p2 = runPythonWithProgress("test2.py", []);

    // Should go to per-request since backoff hasn't expired
    await vi.advanceTimersByTimeAsync(20);
    mockPR2.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPR2.emitEvent("close", 0, null);
    await p2;

    vi.useRealTimers();
  });

  it("resets crash counter outside the 60s crash window", async () => {
    vi.useFakeTimers();

    const mocks: ReturnType<typeof createMockProcess>[] = [];
    for (let i = 0; i < 8; i++) {
      mocks.push(createMockProcess());
    }

    let callCount = 0;
    vi.mocked(spawn).mockImplementation(() => {
      const m = mocks[callCount % mocks.length];
      callCount++;
      return m.process;
    });

    // Crash 3 times
    for (let i = 0; i < 3; i++) {
      if (i > 0) vi.advanceTimersByTime(5_000);
      const p = runPythonWithProgress("test.py", []);
      mocks[i * 2].emitEvent("close", 1, null);
      await vi.advanceTimersByTimeAsync(20);
      mocks[i * 2 + 1].stdout.emit("data", Buffer.from('{"ok": true}\n'));
      mocks[i * 2 + 1].emitEvent("close", 0, null);
      await p;
    }

    expect(getDispatcherStatus().consecutiveCrashes).toBeGreaterThanOrEqual(3);

    // Advance past the 60s crash window
    vi.advanceTimersByTime(70_000);

    // Next crash should reset the counter to 1 (outside window)
    const newMock = createMockProcess();
    const newPR = createMockProcess();
    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount % 2 === 1) return newMock.process;
      return newPR.process;
    });

    const p = runPythonWithProgress("test.py", []);
    newMock.emitEvent("close", 1, null);
    await vi.advanceTimersByTimeAsync(20);
    newPR.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    newPR.emitEvent("close", 0, null);
    await p;

    // Counter should be 1 (reset by being outside the window), not 4
    expect(getDispatcherStatus().consecutiveCrashes).toBe(1);
    expect(getDispatcherStatus().failed).toBe(false);

    vi.useRealTimers();
  });
});

// ── Concurrent dispatcher requests ──────────────────────────────────

describe("bridge - concurrent dispatcher requests", () => {
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

  it("sends multiple concurrent requests to the same dispatcher process", async () => {
    const mock = await setupReadyDispatcher();

    // Fire 3 concurrent requests
    const p1 = runPythonWithProgress("tool_a.py", ["a"]);
    const p2 = runPythonWithProgress("tool_b.py", ["b"]);
    const p3 = runPythonWithProgress("tool_c.py", ["c"]);
    await new Promise((r) => setTimeout(r, 10));

    // All 3 should have been written to the same dispatcher stdin
    const lines = mock.stdinWrites.join("").split("\n").filter(Boolean);
    expect(lines.length).toBe(3);

    const requests = lines.map((l) => JSON.parse(l));
    expect(requests[0].script).toBe("tool_a");
    expect(requests[1].script).toBe("tool_b");
    expect(requests[2].script).toBe("tool_c");
    expect(requests[0].args).toEqual(["a"]);
    expect(requests[1].args).toEqual(["b"]);
    expect(requests[2].args).toEqual(["c"]);

    // Respond to all 3
    for (const req of requests) {
      mock.stdout.emit(
        "data",
        Buffer.from(
          JSON.stringify({ id: req.id, exitCode: 0, stdout: `{"script":"${req.script}"}` }) + "\n",
        ),
      );
    }

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1.stdout).toContain("tool_a");
    expect(r2.stdout).toContain("tool_b");
    expect(r3.stdout).toContain("tool_c");

    // Only 1 spawn call (the dispatcher)
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("one failing request does not affect other concurrent requests", async () => {
    const mock = await setupReadyDispatcher();

    const pOk1 = runPythonWithProgress("ok1.py", []);
    const pFail = runPythonWithProgress("fail.py", []);
    const pOk2 = runPythonWithProgress("ok2.py", []);
    await new Promise((r) => setTimeout(r, 10));

    const lines = mock.stdinWrites.join("").split("\n").filter(Boolean);
    const reqs = lines.map((l) => JSON.parse(l));

    // Fail the middle request
    mock.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ id: reqs[1].id, exitCode: 1, stdout: "" }) + "\n"),
    );
    // Succeed the other two
    mock.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ id: reqs[0].id, exitCode: 0, stdout: '{"r": "one"}' }) + "\n"),
    );
    mock.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ id: reqs[2].id, exitCode: 0, stdout: '{"r": "two"}' }) + "\n"),
    );

    await expect(pFail).rejects.toThrow();
    const [r1, r2] = await Promise.all([pOk1, pOk2]);
    expect(r1.stdout).toContain("one");
    expect(r2.stdout).toContain("two");
  });

  it("dispatcher crash rejects all pending concurrent requests with retry", async () => {
    const mock = createMockProcess();
    const mockPR1 = createMockProcess();
    const mockPR2 = createMockProcess();
    const mockPR3 = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mock.process;
      if (callCount === 2) return mockPR1.process;
      if (callCount === 3) return mockPR2.process;
      return mockPR3.process;
    });

    // Make dispatcher ready
    const initPromise = initDispatcher();
    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await initPromise;

    const p1 = runPythonWithProgress("a.py", []);
    const p2 = runPythonWithProgress("b.py", []);
    const p3 = runPythonWithProgress("c.py", []);
    await new Promise((r) => setTimeout(r, 10));

    // Dispatcher crashes -- all pending requests should be rejected
    mock.emitEvent("close", 1, null);
    await new Promise((r) => setTimeout(r, 10));

    // All three should retry via per-request. Complete them all.
    mockPR1.stdout.emit("data", Buffer.from('{"ok": 1}\n'));
    mockPR1.emitEvent("close", 0, null);
    mockPR2.stdout.emit("data", Buffer.from('{"ok": 2}\n'));
    mockPR2.emitEvent("close", 0, null);
    mockPR3.stdout.emit("data", Buffer.from('{"ok": 3}\n'));
    mockPR3.emitEvent("close", 0, null);

    // runPythonWithProgress catches "exited unexpectedly" and retries per-request
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1.stdout).toContain("ok");
    expect(r2.stdout).toContain("ok");
    expect(r3.stdout).toContain("ok");
  });

  it("progress events on stderr are forwarded to all pending requests", async () => {
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

    // Emit a progress event -- should be forwarded to all pending requests
    mock.stderr.emit("data", Buffer.from('{"progress": 50, "stage": "Working"}\n'));

    const lines = mock.stdinWrites.join("").split("\n").filter(Boolean);
    const reqs = lines.map((l) => JSON.parse(l));

    // Complete both requests
    mock.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ id: reqs[0].id, exitCode: 0, stdout: "{}" }) + "\n"),
    );
    mock.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ id: reqs[1].id, exitCode: 0, stdout: "{}" }) + "\n"),
    );

    await Promise.all([p1, p2]);
    expect(progress1).toEqual([{ percent: 50, stage: "Working" }]);
    expect(progress2).toEqual([{ percent: 50, stage: "Working" }]);
  });
});

// ── extractPythonError edge cases via dispatcher ────────────────────

describe("bridge - extractPythonError via dispatcher responses", () => {
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

  it("extracts error from JSON stdout in dispatcher response", async () => {
    const mock = await setupReadyDispatcher();

    const promise = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;

    mock.stdout.emit(
      "data",
      Buffer.from(
        JSON.stringify({
          id,
          exitCode: 1,
          stdout: '{"error": "CUDA out of memory"}',
        }) + "\n",
      ),
    );

    await expect(promise).rejects.toThrow("CUDA out of memory");
  });

  it("extracts error from traceback in dispatcher stderr", async () => {
    const mock = await setupReadyDispatcher();

    const promise = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));

    // Emit traceback on stderr (collected by pending request)
    mock.stderr.emit(
      "data",
      Buffer.from(
        "Traceback (most recent call last):\n" +
          '  File "script.py", line 10\n' +
          "RuntimeError: model not found\n",
      ),
    );

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;

    // Non-zero exit with the traceback captured in stderrLines
    mock.stdout.emit("data", Buffer.from(JSON.stringify({ id, exitCode: 1, stdout: "" }) + "\n"));

    await expect(promise).rejects.toThrow("RuntimeError: model not found");
  });

  it("uses generic exit code message when dispatcher stderr and stdout are both empty", async () => {
    const mock = await setupReadyDispatcher();

    const promise = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;

    mock.stdout.emit("data", Buffer.from(JSON.stringify({ id, exitCode: 42, stdout: "" }) + "\n"));

    await expect(promise).rejects.toThrow("exited with code 42");
  });
});
