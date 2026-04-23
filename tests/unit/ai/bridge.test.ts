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
    stdin,
    stdout,
    stderr,
    emitEvent: (event: string, ...args: unknown[]) => proc.emit(event, ...args),
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
});
