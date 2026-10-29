import { AsyncLocalStorage } from "node:async_hooks";
import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { Writable } from "node:stream";
import {
  type Context,
  type ContextManager,
  context,
  createContextKey,
  ROOT_CONTEXT,
} from "@opentelemetry/api";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

// Mock child_process.spawn before importing the bridge module
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

// Mock sharp (required transitively by tool modules)
vi.mock("sharp", () => ({
  default: vi.fn(),
}));

/**
 * Minimal AsyncLocalStorage-based context manager for tests, as in
 * log-trace-mixin.test.ts. Without one, OTel's context.with() is a no-op.
 */
class TestContextManager implements ContextManager {
  private _als = new AsyncLocalStorage<Context>();
  active(): Context {
    return this._als.getStore() ?? ROOT_CONTEXT;
  }
  with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    ctx: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    return this._als.run(ctx, () => fn.call(thisArg, ...args));
  }
  bind<T>(_ctx: Context, target: T): T {
    return target;
  }
  enable(): this {
    return this;
  }
  disable(): this {
    this._als.disable();
    return this;
  }
}

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
  let isGpuAvailable: typeof import("../../../packages/ai/src/bridge.js").isGpuAvailable;
  let initDispatcher: typeof import("../../../packages/ai/src/bridge.js").initDispatcher;
  let shutdownDispatcher: typeof import("../../../packages/ai/src/bridge.js").shutdownDispatcher;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();
    const mod = await import("../../../packages/ai/src/bridge.js");
    isGpuAvailable = mod.isGpuAvailable;
    initDispatcher = mod.initDispatcher;
    shutdownDispatcher = mod.shutdownDispatcher;
  });

  afterEach(() => {
    shutdownDispatcher();
    vi.restoreAllMocks();
  });

  it("returns false by default (no dispatcher started)", () => {
    // Without starting a dispatcher, GPU should default to false
    expect(isGpuAvailable()).toBe(false);
    expect(isGpuAvailable("torch")).toBe(false);
    expect(isGpuAvailable("onnx")).toBe(false);
    expect(isGpuAvailable("ctranslate2")).toBe(false);
  });

  it("returns per-framework GPU availability when gpuFrameworks is populated and falls back to gpuAvail when omitted (issue #2576)", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const initReady = initDispatcher();
    mock.stderr.emit(
      "data",
      Buffer.from(
        '{"ready": true, "gpu": true, "gpuFrameworks": {"torch": false, "onnx": true, "ctranslate2": false}}\n',
      ),
    );
    await initReady;

    expect(isGpuAvailable()).toBe(true);
    expect(isGpuAvailable("torch")).toBe(false);
    expect(isGpuAvailable("onnx")).toBe(true);
    expect(isGpuAvailable("ctranslate2")).toBe(false);

    // After shutdown(), gpuFrameworks is cleared and isGpuAvailable(framework) falls back to gpuAvail
    shutdownDispatcher();
    expect(isGpuAvailable("torch")).toBe(true);
    expect(isGpuAvailable("onnx")).toBe(true);
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

    const err = (await promise.catch((e: unknown) => e)) as Error & {
      isSafeMessage?: unknown;
      kind?: string;
    };
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("RuntimeError: model not found");
    // The sidecar reason is wrapped in a SafeError so it survives the Sentry
    // scrubber instead of showing as "Error: Error" (NODE-24).
    expect(err.isSafeMessage).toBe(true);
    expect(err.kind).toBe("bug");
  });

  it("rejects with OOM message on exit code 137 (SIGKILL)", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test_script.py", []);

    mock.emitEvent("close", 137, "SIGKILL");

    const err = (await promise.catch((e: unknown) => e)) as Error & {
      isSafeMessage?: unknown;
      kind?: string;
      code?: string;
    };
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(
      "Process killed (out of memory) -- try a lighter model or smaller image",
    );
    expect(err.isSafeMessage).toBe(true);
    expect(err.kind).toBe("operational");
    expect(err.code).toBe("exit-137");
  });

  it("rejects with segfault message on exit code 139 (SIGSEGV)", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test_script.py", []);

    mock.emitEvent("close", 139, "SIGSEGV");

    const err = (await promise.catch((e: unknown) => e)) as Error & {
      isSafeMessage?: unknown;
      kind?: string;
      code?: string;
    };
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Process crashed (segmentation fault)");
    expect(err.isSafeMessage).toBe(true);
    expect(err.kind).toBe("operational");
    expect(err.code).toBe("exit-139");
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

  it("rejects a per-request timeout as an operational SafeError with a 'timeout' code", async () => {
    // A timeout is environmental (huge input / slow box), not our bug. Sentry
    // must see it as an operational SafeError, not a message-less "Error: Error".
    vi.useFakeTimers();
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("slow.py", [], { timeout: 1000 });
    const settled = promise.catch((e: unknown) => e); // attach before firing the timer
    vi.advanceTimersByTime(1500);
    mock.emitEvent("close", null, "SIGTERM");

    const err = (await settled) as Error & {
      isSafeMessage?: unknown;
      kind?: string;
      code?: string;
    };
    expect(err.message).toBe("Python script timed out");
    expect(err.isSafeMessage).toBe(true);
    expect(err.kind).toBe("operational");
    expect(err.code).toBe("timeout");
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

    mock.stderr.emit("data", Buffer.from(`${traceback}\n`));
    mock.emitEvent("close", 1, null);

    await expect(promise).rejects.toThrow("ValueError: bad input");
  });

  it("extracts structured JSON error and errorInfo from stderr when diagnostic lines precede it on per-request path (issue #3107)", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("install_feature.py", []);

    mock.stderr.emit(
      "data",
      Buffer.from(
        "[install] rolled the venv back to its state before this bundle\n" +
          `${JSON.stringify({
            error: "Custom sidecar error",
            errorInfo: {
              type: "RuntimeError",
              frames: [{ file: "install_feature.py", line: 64, func: "fail" }],
            },
          })}\n`,
      ),
    );
    mock.emitEvent("close", 1, null);

    const err = (await promise.catch((e: unknown) => e)) as Error & {
      isSafeMessage?: unknown;
      kind?: string;
      pythonType?: string;
      pythonFrames?: Array<{ file: string; line: number; func: string }>;
    };
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Custom sidecar error");
    expect(err.isSafeMessage).toBe(true);
    expect(err.kind).toBe("bug");
    expect(err.pythonType).toBe("RuntimeError");
    expect(err.pythonFrames).toEqual([{ file: "install_feature.py", line: 64, func: "fail" }]);
  });

  it("extracts final traceback line when diagnostic lines precede a traceback on per-request stderr (issue #3107)", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test_script.py", []);

    const stderr = [
      "[model] Loading weights...",
      "Traceback (most recent call last):",
      '  File "script.py", line 10, in <module>',
      '    raise ValueError("bad input")',
      "ValueError: bad input",
    ].join("\n");

    mock.stderr.emit("data", Buffer.from(`${stderr}\n`));
    mock.emitEvent("close", 1, null);

    const err = (await promise.catch((e: unknown) => e)) as Error;
    expect(err.message).toBe("ValueError: bad input");
  });

  it("passes script path and args to spawn correctly", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    // Ungated script name: this test exercises generic spawn-args plumbing, not
    // a specific bundle. The feature gate on the fallback is covered separately
    // in tests/unit/ai/feature-gate.test.ts.
    const promise = runPythonWithProgress("test_script.py", ["/tmp/in.png", "/tmp/out.png"]);

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
    expect(perRequestCall?.[1]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("test_script.py"),
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

    const err = (await promise.catch((e: unknown) => e)) as Error & {
      isSafeMessage?: unknown;
      code?: string;
    };
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("out of memory");
    expect(err.isSafeMessage).toBe(true);
    expect(err.code).toBe("exit-SIGKILL");
  });

  it("treats SIGSEGV signal as segfault error", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test_script.py", []);

    mock.emitEvent("close", null, "SIGSEGV");

    const err = (await promise.catch((e: unknown) => e)) as Error & {
      isSafeMessage?: unknown;
      code?: string;
    };
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("segmentation fault");
    expect(err.isSafeMessage).toBe(true);
    expect(err.code).toBe("exit-SIGSEGV");
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

  it("treats zero PROCESSING_TIMEOUT_S as unlimited despite an explicit timeout", async () => {
    const origTimeout = process.env.PROCESSING_TIMEOUT_S;
    process.env.PROCESSING_TIMEOUT_S = "0";

    vi.useFakeTimers();
    try {
      const mock = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mock.process);

      const promise = runPythonWithProgress("test_script.py", [], { timeout: 50 });

      vi.advanceTimersByTime(600_001);
      expect(mock.process.kill).not.toHaveBeenCalled();

      mock.stdout.emit("data", Buffer.from('{"success": true}\n'));
      mock.emitEvent("close", 0, null);

      await expect(promise).resolves.toBeDefined();
    } finally {
      vi.useRealTimers();
      if (origTimeout !== undefined) {
        process.env.PROCESSING_TIMEOUT_S = origTimeout;
      } else {
        delete process.env.PROCESSING_TIMEOUT_S;
      }
    }
  });

  it("lets positive PROCESSING_TIMEOUT_S override an explicit timeout", async () => {
    const origTimeout = process.env.PROCESSING_TIMEOUT_S;
    process.env.PROCESSING_TIMEOUT_S = "2";

    vi.useFakeTimers();
    try {
      const mock = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mock.process);

      const promise = runPythonWithProgress("test_script.py", [], { timeout: 60_000 });
      const rejection = expect(promise).rejects.toThrow("Python script timed out");

      vi.advanceTimersByTime(2_500);
      mock.emitEvent("close", null, "SIGTERM");

      await rejection;
    } finally {
      vi.useRealTimers();
      if (origTimeout !== undefined) {
        process.env.PROCESSING_TIMEOUT_S = origTimeout;
      } else {
        delete process.env.PROCESSING_TIMEOUT_S;
      }
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
      consecutiveScriptFailures: 0,
      lastRecycleReason: null,
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
    let _callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      _callCount++;
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

  it("sends dispatcher diagnostics to the installed log sink, not the console (#1500)", async () => {
    const mockDispatcher = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDispatcher.process;
      return mockPerReq.process;
    });

    // Same module instance the freshly imported bridge uses.
    const { setAiLogger } = await import("../../../packages/ai/src/log.js");
    const sink = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    setAiLogger(sink);
    onTestFinished(() => setAiLogger(null));
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const promise = runPythonWithProgress("test.py", []);

    mockDispatcher.stderr.emit(
      "data",
      Buffer.from(
        '{"info": "model cached"}\n{"warning": "low memory"}\n[model] Loading weights...\n',
      ),
    );

    await new Promise((r) => setTimeout(r, 10));

    mockPerReq.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPerReq.emitEvent("close", 0, null);
    await promise;

    const messages = (fn: typeof sink.info) => fn.mock.calls.map((call) => call[0]);
    expect(messages(sink.info)).toEqual(
      expect.arrayContaining(["[python] model cached", "[python] [model] Loading weights..."]),
    );
    expect(messages(sink.warn)).toEqual(["[python] low memory"]);
    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("sends a dispatcher spawn error to the installed log sink (#1500)", async () => {
    const mockDispatcher = createMockProcess();
    const mockPerRequest = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDispatcher.process;
      return mockPerRequest.process;
    });

    const { setAiLogger } = await import("../../../packages/ai/src/log.js");
    const sink = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    setAiLogger(sink);
    onTestFinished(() => setAiLogger(null));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const promise = runPythonWithProgress("test.py", []);

    const enoent = new Error("spawn ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    enoent.syscall = "spawn /opt/venv/bin/python3";
    mockDispatcher.emitEvent("error", enoent);

    await new Promise((r) => setTimeout(r, 10));

    mockPerRequest.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPerRequest.emitEvent("close", 0, null);
    await promise;

    // The error itself, not just its message, so pino keeps its syscall and stack.
    expect(sink.error).toHaveBeenCalledWith(
      "[bridge] Dispatcher error: spawn ENOENT (code: ENOENT)",
      enoent,
    );
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("logs the signal and the last stderr lines when an idle dispatcher dies (#1656)", async () => {
    const mockDispatcher = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDispatcher.process;
      return mockPerReq.process;
    });

    const { setAiLogger } = await import("../../../packages/ai/src/log.js");
    const sink = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    setAiLogger(sink);
    onTestFinished(() => setAiLogger(null));

    // A request sent before readiness takes the per-request path, which
    // spawns the fallback process. Finish it, then mark the dispatcher ready.
    const first = runPythonWithProgress("test.py", []);
    mockPerReq.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPerReq.emitEvent("close", 0, null);
    await first;

    mockDispatcher.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await new Promise((r) => setTimeout(r, 10));

    const promise = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));
    const id = JSON.parse(mockDispatcher.stdinWrites.join("").split("\n").filter(Boolean)[0]).id;
    mockDispatcher.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id, exitCode: 0, stdout: "ok" })}\n`),
    );
    await promise;

    // Nothing is pending now, so this traceback reaches no request's error.
    // The flood before it checks that only the last 20 stderr lines are kept.
    const frames = Array.from({ length: 25 }, (_, i) => `frame-${String(i + 1).padStart(2, "0")}`);
    mockDispatcher.stderr.emit("data", Buffer.from(`${frames.join("\n")}\n`));
    mockDispatcher.stderr.emit(
      "data",
      Buffer.from("Traceback (most recent call last):\nRuntimeError: model blew up\n"),
    );
    mockDispatcher.emitEvent("close", null, "SIGKILL");

    const logged = [...sink.warn.mock.calls, ...sink.error.mock.calls]
      .map((call) => String(call[0]))
      .join("\n");
    expect(logged).toContain("exit code null, signal SIGKILL");
    expect(logged).toContain("RuntimeError: model blew up");
    expect(logged).toContain("frame-08");
    expect(logged).not.toContain("frame-07");
  });

  it("spawns the dispatcher outside the requesting job's trace context (#1500)", async () => {
    // The child outlives the job that happened to start it. Its pipe events
    // run in the context spawn() was called in, so spawning inside a job
    // would stamp that job's trace id on every line the dispatcher logs.
    context.setGlobalContextManager(new TestContextManager());
    onTestFinished(() => {
      context.disable();
    });
    const jobKey = createContextKey("job");
    const spawnedIn: unknown[] = [];
    const mockDispatcher = createMockProcess();
    const mockPerReq = createMockProcess();

    vi.mocked(spawn).mockImplementation(() => {
      spawnedIn.push(context.active().getValue(jobKey));
      return spawnedIn.length === 1 ? mockDispatcher.process : mockPerReq.process;
    });

    const promise = context.with(ROOT_CONTEXT.setValue(jobKey, "job-1"), () =>
      runPythonWithProgress("test.py", []),
    );

    await new Promise((r) => setTimeout(r, 10));

    mockPerReq.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPerReq.emitEvent("close", 0, null);
    await promise;

    // The per-request fallback belongs to this job and keeps its context,
    // which also shows the context manager is live.
    expect(spawnedIn).toEqual([undefined, "job-1"]);
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

  it("does not count an intentional shutdown() as a crash", async () => {
    // Regression test: shutdown() kills the child with SIGTERM, which Node
    // reports via the "close" event as code=null (not 0). The close handler
    // must not mistake that for a crash, or repeated legitimate restarts
    // (e.g. shutdownDispatcher() called on every AI bundle install in
    // routes/features.ts) would eventually trip MAX_CONSECUTIVE_CRASHES and
    // permanently disable the dispatcher with nothing having actually crashed.
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = initDispatcher();
    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await promise;

    shutdownDispatcher();
    // Node reports a signal-killed process as code=null, signal="SIGTERM".
    mock.emitEvent("close", null, "SIGTERM");

    expect(getDispatcherStatus().consecutiveCrashes).toBe(0);
  });

  it("does not count or log a shutdown()-induced stdin EPIPE as a crash", async () => {
    // Regression: shutdown() ends stdin then SIGTERMs the child. On a real
    // pipe that teardown can surface as an EPIPE/ERR_STREAM_DESTROYED on the
    // stdin stream (observed in the container shutdown log as a spurious
    // "[bridge] Dispatcher crash #1"). The "close" handler alone is guarded,
    // but the stdin error handler must be too; otherwise shutdownDispatcher()
    // on every AI bundle install accrues false crashes toward the disable cap
    // and emits spurious error-level log lines (#3707).
    const { setAiLogger } = await import("../../../packages/ai/src/log.js");
    const sink = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    setAiLogger(sink);
    onTestFinished(() => setAiLogger(null));

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = initDispatcher();
    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await promise;

    shutdownDispatcher();
    const epipe = new Error("write EPIPE") as NodeJS.ErrnoException;
    epipe.code = "EPIPE";
    mock.stdin.emit("error", epipe);

    const destroyed = new Error(
      "Cannot call write after a stream was destroyed",
    ) as NodeJS.ErrnoException;
    destroyed.code = "ERR_STREAM_DESTROYED";
    mock.stdin.emit("error", destroyed);

    expect(getDispatcherStatus().consecutiveCrashes).toBe(0);
    expect(getDispatcherStatus().failed).toBe(false);
    expect(sink.error).not.toHaveBeenCalled();
  });

  it("does not count or log a shutdown()-induced process error as a crash", async () => {
    // The proc "error" handler (non-ENOENT) also records crashes and logs
    // errors; a kill during shutdown can emit one (e.g. ESRCH), which must not
    // be counted or logged at error level (#3707).
    const { setAiLogger } = await import("../../../packages/ai/src/log.js");
    const sink = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    setAiLogger(sink);
    onTestFinished(() => setAiLogger(null));

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = initDispatcher();
    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await promise;

    shutdownDispatcher();
    const err = new Error("kill ESRCH") as NodeJS.ErrnoException;
    err.code = "ESRCH";
    mock.emitEvent("error", err);

    expect(getDispatcherStatus().consecutiveCrashes).toBe(0);
    expect(getDispatcherStatus().failed).toBe(false);
    expect(sink.error).not.toHaveBeenCalled();
  });

  it("logs and counts an unexpected stdin EPIPE or non-ENOENT process error as a crash", async () => {
    const { setAiLogger } = await import("../../../packages/ai/src/log.js");
    const sink = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    setAiLogger(sink);
    onTestFinished(() => setAiLogger(null));

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = initDispatcher();
    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await promise;

    const epipe = new Error("write EPIPE") as NodeJS.ErrnoException;
    epipe.code = "EPIPE";
    mock.stdin.emit("error", epipe);

    expect(getDispatcherStatus().consecutiveCrashes).toBe(1);
    expect(sink.error).toHaveBeenCalledWith(
      "[bridge] Dispatcher stdin pipe broken (EPIPE), rejecting pending requests",
      epipe,
    );

    const destroyed = new Error(
      "Cannot call write after a stream was destroyed",
    ) as NodeJS.ErrnoException;
    destroyed.code = "ERR_STREAM_DESTROYED";
    mock.stdin.emit("error", destroyed);

    expect(getDispatcherStatus().consecutiveCrashes).toBe(2);
    expect(sink.error).toHaveBeenCalledWith(
      "[bridge] Dispatcher stdin pipe broken (ERR_STREAM_DESTROYED), rejecting pending requests",
      destroyed,
    );

    const procErr = new Error("unexpected EPERM") as NodeJS.ErrnoException;
    procErr.code = "EPERM";
    mock.emitEvent("error", procErr);

    expect(getDispatcherStatus().consecutiveCrashes).toBe(3);
    expect(sink.error).toHaveBeenCalledWith(
      "[bridge] Dispatcher error: unexpected EPERM (code: EPERM)",
      procErr,
    );
    expect(sink.error).toHaveBeenCalledTimes(3);
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

    const promise = runPythonWithProgress("remove_bg.py", ["/tmp/in.png", "/tmp/out.png"], {
      memoryOptions: { availableMemoryBytes: 8 * 1024 ** 3 },
    });
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
    mock.stdout.emit("data", Buffer.from(`${response}\n`));

    const result = await promise;
    expect(result.stdout).toBe('{"success": true}');
  });

  it("rejects a dispatcher-path timeout as an operational SafeError (NODE-26 regression)", async () => {
    // NODE-26: the dispatcher request() timeout rejected with a bare
    // new Error("Python script timed out"), which the Sentry sanitizer scrubbed
    // to a message-less "Error: Error" bug. It must be an operational SafeError.
    vi.useFakeTimers();
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const initPromise = initDispatcher();
    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await vi.advanceTimersByTimeAsync(60); // init() polls childReady every 50ms
    await initPromise;

    const promise = runPythonWithProgress("slow.py", [], { timeout: 1000 });
    const settled = promise.catch((e: unknown) => e); // attach before firing the timer
    await vi.advanceTimersByTimeAsync(0); // flush the request's stdin write
    await vi.advanceTimersByTimeAsync(1100); // fire the dispatcher request timeout

    const err = (await settled) as Error & {
      isSafeMessage?: unknown;
      kind?: string;
      code?: string;
    };
    expect(err.message).toBe("Python script timed out");
    expect(err.isSafeMessage).toBe(true);
    expect(err.kind).toBe("operational");
    expect(err.code).toBe("timeout");
    vi.useRealTimers();
  });

  it("strips .py extension from script name in dispatcher request", async () => {
    const mock = await setupReadyDispatcher();

    const promise = runPythonWithProgress("upscale.py", ["/tmp/in.png"], {
      memoryOptions: { availableMemoryBytes: 8 * 1024 ** 3 },
    });
    await new Promise((r) => setTimeout(r, 10));

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const request = JSON.parse(line);
    expect(request.script).toBe("upscale");

    // Complete the request properly to avoid a hanging retry
    mock.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id: request.id, exitCode: 0, stdout: "{}" })}\n`),
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
      Buffer.from(`${JSON.stringify({ id: id2, exitCode: 0, stdout: '{"result": "two"}' })}\n`),
    );
    // Then respond to the first
    mock.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id: id1, exitCode: 0, stdout: '{"result": "one"}' })}\n`),
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
      Buffer.from(`${JSON.stringify({ id: idFail, exitCode: 1, stdout: "" })}\n`),
    );
    // Succeed request #1
    mock.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id: idOk, exitCode: 0, stdout: '{"ok": true}' })}\n`),
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

    mock.stdout.emit("data", Buffer.from(`${JSON.stringify({ id, exitCode: 137, stdout: "" })}\n`));

    const err = (await promise.catch((e: unknown) => e)) as Error & {
      isSafeMessage?: unknown;
      kind?: string;
      code?: string;
    };
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(
      "Process killed (out of memory) -- try a lighter model or smaller image",
    );
    expect(err.isSafeMessage).toBe(true);
    expect(err.kind).toBe("operational");
    expect(err.code).toBe("exit-137");
  });

  it("rejects with segfault message when dispatcher response has exitCode 139", async () => {
    const mock = await setupReadyDispatcher();

    const promise = runPythonWithProgress("crash.py", []);
    await new Promise((r) => setTimeout(r, 10));

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;

    mock.stdout.emit("data", Buffer.from(`${JSON.stringify({ id, exitCode: 139, stdout: "" })}\n`));

    const err = (await promise.catch((e: unknown) => e)) as Error & {
      isSafeMessage?: unknown;
      kind?: string;
      code?: string;
    };
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Process crashed (segmentation fault)");
    expect(err.isSafeMessage).toBe(true);
    expect(err.kind).toBe("operational");
    expect(err.code).toBe("exit-139");
  });

  it("classifies dispatcher exitCode 137 as an operational OOM SafeError", async () => {
    const mock = await setupReadyDispatcher();

    const promise = runPythonWithProgress("heavy.py", []);
    await new Promise((r) => setTimeout(r, 10));

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;

    // 137 is an OS OOM kill: the operational message keeps "out of memory" so
    // memory-aware callers retry, and it does not surface possibly-unrelated stderr.
    mock.stdout.emit(
      "data",
      Buffer.from(
        `${JSON.stringify({ id, exitCode: 137, stdout: '{"error": "CUDA out of memory"}' })}\n`,
      ),
    );

    const err = (await promise.catch((e: unknown) => e)) as Error & {
      isSafeMessage?: unknown;
      kind?: string;
    };
    expect(err.message).toContain("out of memory");
    expect(err.isSafeMessage).toBe(true);
    expect(err.kind).toBe("operational");
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
      Buffer.from(`${JSON.stringify({ id, exitCode: 0, stdout: '{"ok": true}' })}\n`),
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
      Buffer.from(`${JSON.stringify({ id: realId, exitCode: 0, stdout: '{"ok": true}' })}\n`),
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

    const fullResponse = `${JSON.stringify({ id, exitCode: 0, stdout: '{"ok": true}' })}\n`;
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
    mock.stdout.emit("data", Buffer.from(`${JSON.stringify({ id, exitCode: 0 })}\n`));

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
      Buffer.from(`${JSON.stringify({ id, exitCode: 0, stdout: '{"ok": true}' })}\n`),
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
  let getDispatcherStatus: typeof import("../../../packages/ai/src/bridge.js").getDispatcherStatus;
  let shutdownDispatcher: typeof import("../../../packages/ai/src/bridge.js").shutdownDispatcher;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();

    const mod = await import("../../../packages/ai/src/bridge.js");
    runPythonWithProgress = mod.runPythonWithProgress;
    initDispatcher = mod.initDispatcher;
    getDispatcherStatus = mod.getDispatcherStatus;
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

  it("kills the dispatcher on timeout so subsequent requests can proceed", async () => {
    vi.useFakeTimers();
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const initPromise = initDispatcher();
    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    vi.advanceTimersByTime(100);
    await initPromise;

    const promise = runPythonWithProgress("stuck.py", [], { timeout: 2000 });

    vi.advanceTimersByTime(3000);

    await expect(promise).rejects.toThrow("Python script timed out");
    expect(mock.process.kill).toHaveBeenCalledWith("SIGTERM");
    vi.useRealTimers();
  });

  it("clears childReady on timeout before close fires and signals proc instead of a replacement child (issue #3549)", async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });

    const mockChild1 = createMockProcess();
    const mockChild2 = createMockProcess();
    const mockPerReq = createMockProcess();
    const mockSiblingPerReq = createMockProcess();
    vi.mocked(spawn)
      .mockReturnValueOnce(mockChild1.process)
      .mockReturnValueOnce(mockChild2.process)
      .mockReturnValueOnce(mockPerReq.process)
      .mockReturnValueOnce(mockSiblingPerReq.process);

    const initPromise = initDispatcher();
    mockChild1.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    vi.advanceTimersByTime(100);
    await initPromise;

    const slowPromise = runPythonWithProgress("slow.py", [], { timeout: 1000 });
    const slowerSibling = runPythonWithProgress("slower.py", [], { timeout: 2500 });
    const retrySibling = runPythonWithProgress("retry-sibling.py", [], { timeout: 10_000 });
    const settledSlow = slowPromise.catch((e: unknown) => e);
    const settledSlower = slowerSibling.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10);

    // Fire the internal request timeout on slow.py without emitting "close" on mockChild1 yet.
    vi.advanceTimersByTime(1100);
    await expect(settledSlow).resolves.toMatchObject({
      message: "Python script timed out",
      isSafeMessage: true,
      kind: "operational",
      code: "timeout",
    });
    expect(mockChild1.process.kill).toHaveBeenCalledTimes(1);
    expect(mockChild1.process.kill).toHaveBeenCalledWith("SIGTERM");

    // Immediately after timeout (before "close"), status must report neither running nor ready and pid null.
    expect(getDispatcherStatus().running).toBe(false);
    expect(getDispatcherStatus().ready).toBe(false);
    expect(getDispatcherStatus().pid).toBeNull();

    // A request arriving before mockChild1 emits "close" spawns mockChild2 (not yet ready)
    // and falls back to runPerRequest instead of writing to mockChild2's stdin prematurely.
    const fastPromise = runPythonWithProgress("fast.py", ["arg"]);
    await vi.advanceTimersByTimeAsync(10);

    expect(mockChild2.stdinWrites).toHaveLength(0);
    expect(getDispatcherStatus().ready).toBe(false);

    mockPerReq.stdout.emit("data", Buffer.from('{"fast": true}\n'));
    mockPerReq.emitEvent("close", 0, null);
    await expect(fastPromise).resolves.toEqual({ stdout: '{"fast": true}', stderr: "" });

    // Once mockChild2 emits ready (still before mockChild1 closes), slowerSibling's 2500ms
    // timeout on mockChild1 fires: it must NOT clobber mockChild2's child/childReady state,
    // must NOT kill mockChild2, and must NOT signal mockChild1 a second time (since mockChild1.killed is true).
    mockChild2.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    expect(getDispatcherStatus().running).toBe(true);
    expect(getDispatcherStatus().ready).toBe(true);

    vi.advanceTimersByTime(1500);
    await expect(settledSlower).resolves.toMatchObject({
      message: "Python script timed out",
      isSafeMessage: true,
      kind: "operational",
      code: "timeout",
    });
    expect(mockChild1.process.kill).toHaveBeenCalledTimes(1);
    expect(mockChild2.process.kill).not.toHaveBeenCalled();
    expect(getDispatcherStatus().running).toBe(true);
    expect(getDispatcherStatus().ready).toBe(true);

    // Late "close" from the timed-out mockChild1 records the crash and retries retrySibling
    // via runPerRequest without touching mockChild2.
    mockChild1.emitEvent("close", null, "SIGTERM");
    expect(getDispatcherStatus().consecutiveCrashes).toBe(1);
    expect(getDispatcherStatus().running).toBe(true);
    expect(getDispatcherStatus().ready).toBe(true);

    await vi.advanceTimersByTimeAsync(10);
    mockSiblingPerReq.stdout.emit("data", Buffer.from('{"retried": true}\n'));
    mockSiblingPerReq.emitEvent("close", 0, null);
    await expect(retrySibling).resolves.toMatchObject({
      stdout: '{"retried": true}',
      stderr: expect.stringContaining("[bridge] retried after dispatcher crash"),
    });

    // Also verify startChild() resets childReady = false directly when getChild() sees
    // this.child.killed === true while this.childReady was still true (before close/timeout/shutdown).
    vi.advanceTimersByTime(1000);
    (mockChild2.process as { killed: boolean }).killed = true;
    expect(getDispatcherStatus().ready).toBe(true);

    const mockChild3 = createMockProcess();
    const mockChild3PerReq = createMockProcess();
    vi.mocked(spawn)
      .mockReturnValueOnce(mockChild3.process)
      .mockReturnValueOnce(mockChild3PerReq.process);

    const afterKillPromise = runPythonWithProgress("after-kill.py", []);
    await vi.advanceTimersByTimeAsync(10);

    expect(getDispatcherStatus().ready).toBe(false);
    expect(mockChild3.stdinWrites).toHaveLength(0);
    mockChild3PerReq.stdout.emit("data", Buffer.from('{"afterKill": true}\n'));
    mockChild3PerReq.emitEvent("close", 0, null);
    await expect(afterKillPromise).resolves.toEqual({ stdout: '{"afterKill": true}', stderr: "" });
  });
});

// ── Max consecutive crash threshold ─────────────────────────────────

describe("bridge - max consecutive crash threshold", () => {
  let runPythonWithProgress: typeof import("../../../packages/ai/src/bridge.js").runPythonWithProgress;
  let getDispatcherStatus: typeof import("../../../packages/ai/src/bridge.js").getDispatcherStatus;
  let _shutdownDispatcher: typeof import("../../../packages/ai/src/bridge.js").shutdownDispatcher;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();

    const mod = await import("../../../packages/ai/src/bridge.js");
    runPythonWithProgress = mod.runPythonWithProgress;
    getDispatcherStatus = mod.getDispatcherStatus;
    _shutdownDispatcher = mod.shutdownDispatcher;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets dispatcherFailed after 5 consecutive crashes within the crash window", async () => {
    // Use fake timers so all crashes happen within the 60s window.
    // Also need to advance past backoff between crashes.
    vi.useFakeTimers();
    const { setAiLogger } = await import("../../../packages/ai/src/log.js");
    const sink = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    setAiLogger(sink);
    onTestFinished(() => setAiLogger(null));

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
    // Each crash, and giving up, reaches the log sink (#1500).
    expect(sink.warn.mock.calls.map((call) => call[0])).toEqual([
      "[bridge] Dispatcher crash #1, backing off 1000ms before restart (exit code 1, signal none)",
      "[bridge] Dispatcher crash #2, backing off 2000ms before restart (exit code 1, signal none)",
      "[bridge] Dispatcher crash #3, backing off 4000ms before restart (exit code 1, signal none)",
      "[bridge] Dispatcher crash #4, backing off 8000ms before restart (exit code 1, signal none)",
    ]);
    expect(sink.error.mock.calls.map((call) => call[0])).toEqual([
      "[bridge] Dispatcher crashed 5 times in 60s, disabling permanently (exit code 1, signal none)",
    ]);

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
          `${JSON.stringify({ id: req.id, exitCode: 0, stdout: `{"script":"${req.script}"}` })}\n`,
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
      Buffer.from(`${JSON.stringify({ id: reqs[1].id, exitCode: 1, stdout: "" })}\n`),
    );
    // Succeed the other two
    mock.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id: reqs[0].id, exitCode: 0, stdout: '{"r": "one"}' })}\n`),
    );
    mock.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id: reqs[2].id, exitCode: 0, stdout: '{"r": "two"}' })}\n`),
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
      Buffer.from(`${JSON.stringify({ id: reqs[0].id, exitCode: 0, stdout: "{}" })}\n`),
    );
    mock.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id: reqs[1].id, exitCode: 0, stdout: "{}" })}\n`),
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
        `${JSON.stringify({
          id,
          exitCode: 1,
          stdout: '{"error": "CUDA out of memory"}',
        })}\n`,
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
    mock.stdout.emit("data", Buffer.from(`${JSON.stringify({ id, exitCode: 1, stdout: "" })}\n`));

    await expect(promise).rejects.toThrow("RuntimeError: model not found");
  });

  it("extracts error from JSON stderr in dispatcher response when stdout is empty (issue #3096)", async () => {
    const mock = await setupReadyDispatcher();

    const promise = runPythonWithProgress("install_feature.py", []);
    await new Promise((r) => setTimeout(r, 10));

    mock.stderr.emit(
      "data",
      Buffer.from(
        `${JSON.stringify({
          error: "Custom sidecar error",
          errorInfo: {
            type: "RuntimeError",
            frames: [{ file: "install_feature.py", line: 64, func: "fail" }],
          },
        })}\n`,
      ),
    );

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;

    mock.stdout.emit("data", Buffer.from(`${JSON.stringify({ id, exitCode: 1, stdout: "" })}\n`));

    const err = (await promise.catch((e: unknown) => e)) as Error & {
      isSafeMessage?: unknown;
      kind?: string;
      pythonType?: string;
      pythonFrames?: Array<{ file: string; line: number; func: string }>;
    };
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Custom sidecar error");
    expect(err.isSafeMessage).toBe(true);
    expect(err.kind).toBe("bug");
    expect(err.pythonType).toBe("RuntimeError");
    expect(err.pythonFrames).toEqual([{ file: "install_feature.py", line: 64, func: "fail" }]);
  });

  it("extracts structured JSON error and errorInfo from dispatcher stderr when diagnostic lines precede it (issue #3107)", async () => {
    const mock = await setupReadyDispatcher();

    const promise = runPythonWithProgress("install_feature.py", []);
    await new Promise((r) => setTimeout(r, 10));

    mock.stderr.emit(
      "data",
      Buffer.from(
        "[install] rolled the venv back to its state before this bundle\n" +
          `${JSON.stringify({
            error: "Custom sidecar error",
            errorInfo: {
              type: "RuntimeError",
              frames: [{ file: "install_feature.py", line: 64, func: "fail" }],
            },
          })}\n`,
      ),
    );

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;

    mock.stdout.emit("data", Buffer.from(`${JSON.stringify({ id, exitCode: 1, stdout: "" })}\n`));

    const err = (await promise.catch((e: unknown) => e)) as Error & {
      isSafeMessage?: unknown;
      kind?: string;
      pythonType?: string;
      pythonFrames?: Array<{ file: string; line: number; func: string }>;
    };
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Custom sidecar error");
    expect(err.isSafeMessage).toBe(true);
    expect(err.kind).toBe("bug");
    expect(err.pythonType).toBe("RuntimeError");
    expect(err.pythonFrames).toEqual([{ file: "install_feature.py", line: 64, func: "fail" }]);
  });

  it("extracts final traceback line from dispatcher stderr when diagnostic lines precede a traceback (issue #3107)", async () => {
    const mock = await setupReadyDispatcher();

    const promise = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));

    mock.stderr.emit(
      "data",
      Buffer.from(
        "[model] Loading weights...\n" +
          "Traceback (most recent call last):\n" +
          '  File "script.py", line 10\n' +
          "RuntimeError: model not found\n",
      ),
    );

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;

    mock.stdout.emit("data", Buffer.from(`${JSON.stringify({ id, exitCode: 1, stdout: "" })}\n`));

    const err = (await promise.catch((e: unknown) => e)) as Error;
    expect(err.message).toBe("RuntimeError: model not found");
  });

  it("prefers structured JSON error on stderr over non-JSON stdout lines (issue #3107)", async () => {
    const mock = await setupReadyDispatcher();

    const promise = runPythonWithProgress("install_feature.py", []);
    await new Promise((r) => setTimeout(r, 10));

    mock.stderr.emit(
      "data",
      Buffer.from(
        "[install] rolled the venv back to its state before this bundle\n" +
          `${JSON.stringify({ error: "Disk quota exceeded" })}\n`,
      ),
    );

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;

    mock.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id, exitCode: 1, stdout: "Checking bundle...\n" })}\n`),
    );

    const err = (await promise.catch((e: unknown) => e)) as Error;
    expect(err.message).toBe("Disk quota exceeded");
  });

  it("extracts traceback exception line when bracketed cleanup diagnostics follow a traceback on stderr (issue #3107)", async () => {
    const mock = await setupReadyDispatcher();

    const promise = runPythonWithProgress("install_feature.py", []);
    await new Promise((r) => setTimeout(r, 10));

    mock.stderr.emit(
      "data",
      Buffer.from(
        "[install] extracting archive...\n" +
          "Traceback (most recent call last):\n" +
          '  File "install_feature.py", line 210, in main\n' +
          '    raise RuntimeError("corrupt tar header")\n' +
          "RuntimeError: corrupt tar header\n" +
          "[install] rolled the venv back to its state before this bundle\n",
      ),
    );

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;

    mock.stdout.emit(
      "data",
      Buffer.from(
        `${JSON.stringify({ id, exitCode: 1, stdout: '[install] partial output\n{"error": ""}' })}\n`,
      ),
    );

    const err = (await promise.catch((e: unknown) => e)) as Error;
    expect(err.message).toBe("RuntimeError: corrupt tar header");
  });

  it("skips trailing non-error JSON lines and chained tracebacks when extracting errors (issue #3107)", async () => {
    const mock = await setupReadyDispatcher();

    const promise = runPythonWithProgress("install_feature.py", []);
    await new Promise((r) => setTimeout(r, 10));

    mock.stderr.emit(
      "data",
      Buffer.from(
        "Traceback (most recent call last):\n" +
          '  File "install_feature.py", line 100, in download\n' +
          "OSError: socket closed\n" +
          "\n" +
          "During handling of the above exception, another exception occurred:\n" +
          "\n" +
          "Traceback (most recent call last):\n" +
          '  File "install_feature.py", line 210, in main\n' +
          "RuntimeError: bundle download aborted\n" +
          '{"status": "cleanup_done"}\n',
      ),
    );

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;

    mock.stdout.emit("data", Buffer.from(`${JSON.stringify({ id, exitCode: 1, stdout: "" })}\n`));

    const err = (await promise.catch((e: unknown) => e)) as Error;
    expect(err.message).toBe("RuntimeError: bundle download aborted");
  });

  it("falls back to errorInfo.type when diagnostic lines precede an empty-error JSON envelope on stderr (issue #3107)", async () => {
    const mock = await setupReadyDispatcher();

    const promise = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));

    mock.stderr.emit(
      "data",
      Buffer.from(
        "[model] allocating buffer...\n" +
          `${JSON.stringify({
            success: false,
            error: "",
            errorInfo: { type: "MemoryError", message: "", frames: [] },
          })}\n` +
          '{"status": "cleanup_done"}\n',
      ),
    );

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;

    mock.stdout.emit("data", Buffer.from(`${JSON.stringify({ id, exitCode: 1, stdout: "" })}\n`));

    const err = (await promise.catch((e: unknown) => e)) as Error & {
      isSafeMessage?: unknown;
      kind?: string;
      pythonType?: string;
    };
    expect(err.message).toBe("MemoryError");
    expect(err.isSafeMessage).toBe(true);
    expect(err.kind).toBe("operational");
    expect(err.pythonType).toBe("MemoryError");
  });

  it("prefers plain-text stderr over plain-text stdout and falls back to exit code on truncated traceback (issue #3107)", async () => {
    const mock = await setupReadyDispatcher();

    const p1 = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));
    mock.stderr.emit("data", Buffer.from("PermissionError: [Errno 13] Permission denied\n"));
    const id1 = JSON.parse(mock.stdinWrites.join("").split("\n").filter(Boolean)[0]).id;
    mock.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id: id1, exitCode: 1, stdout: "Loading model..." })}\n`),
    );
    await expect(p1).rejects.toThrow("PermissionError: [Errno 13] Permission denied");

    const p2 = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));
    mock.stderr.emit(
      "data",
      Buffer.from("[model] Loading weights...\nTraceback (most recent call last):\n"),
    );
    const lines = mock.stdinWrites.join("").split("\n").filter(Boolean);
    const id2 = JSON.parse(lines[lines.length - 1]).id;
    mock.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id: id2, exitCode: 2, stdout: "" })}\n`),
    );
    await expect(p2).rejects.toThrow("Python script exited with code 2");
  });

  it("preserves unrecognized JSON and malformed-JSON stderr lines without polluting stderr with {info} or {warning} (issue #3096)", async () => {
    const mock = await setupReadyDispatcher();

    const { setAiLogger } = await import("../../../packages/ai/src/log.js");
    const sink = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    setAiLogger(sink);
    onTestFinished(() => setAiLogger(null));

    const promise = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));

    mock.stderr.emit(
      "data",
      Buffer.from(
        '{"info": "cached"}\n{"warning": "low vram"}\n[model] Loading weights...\n{"status": "loading"}\n{malformed json\nnull\n',
      ),
    );

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;

    mock.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id, exitCode: 0, stdout: '{"ok": true}' })}\n`),
    );

    const result = await promise;
    expect(result.stdout).toBe('{"ok": true}');
    expect(result.stderr).toBe(
      '[model] Loading weights...\n{"status": "loading"}\n{malformed json\nnull',
    );
    expect(sink.info.mock.calls.map((call) => call[0])).toEqual([
      "[python] cached",
      "[python] [model] Loading weights...",
    ]);
    expect(sink.warn.mock.calls.map((call) => call[0])).toEqual(["[python] low vram"]);
  });

  it("uses generic exit code message when dispatcher stderr and stdout are both empty", async () => {
    const mock = await setupReadyDispatcher();

    const promise = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;

    mock.stdout.emit("data", Buffer.from(`${JSON.stringify({ id, exitCode: 42, stdout: "" })}\n`));

    await expect(promise).rejects.toThrow("exited with code 42");
  });

  it("rejects a non-zero exit with a bug-classed SafeError so the reason survives Sentry scrubbing", async () => {
    const mock = await setupReadyDispatcher();
    const promise = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));
    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;
    mock.stdout.emit(
      "data",
      Buffer.from(
        `${JSON.stringify({ id, exitCode: 1, stdout: '{"error": "model not found"}' })}\n`,
      ),
    );
    const err = (await promise.catch((e: unknown) => e)) as Error & {
      isSafeMessage?: unknown;
      kind?: string;
    };
    expect(err.message).toBe("model not found");
    expect(err.isSafeMessage).toBe(true);
    expect(err.kind).toBe("bug");
  });

  it("classifies an out-of-memory exit reported in-band as operational", async () => {
    const mock = await setupReadyDispatcher();
    const promise = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));
    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;
    mock.stdout.emit(
      "data",
      Buffer.from(
        `${JSON.stringify({ id, exitCode: 1, stdout: '{"error": "CUDA out of memory"}' })}\n`,
      ),
    );
    const err = (await promise.catch((e: unknown) => e)) as Error & {
      isSafeMessage?: unknown;
      kind?: string;
    };
    expect(err.isSafeMessage).toBe(true);
    expect(err.kind).toBe("operational");
    expect(err.message).toContain("out of memory");
  });

  it("classifies PyTorch CPU allocator errors reported on exit as operational (#2543)", async () => {
    for (const oomMsg of [
      "RuntimeError: [enforce fail at alloc_cpu.cpp:114] DefaultCPUAllocator: not enough memory: you tried to allocate 600000000 bytes.",
      "DefaultCPUAllocator: can't allocate memory: you tried to allocate 104857600 bytes.",
      "OSError: [Errno 12] Cannot allocate memory",
      "OSError: [Errno 12] Nicht genügend Hauptspeicher verfügbar",
      "[Errno 12] Не удалось выделить память",
      "Unable to allocate 1.86 GiB for an array with shape (4096, 4096, 30) and data type float32",
    ]) {
      const mock = await setupReadyDispatcher();
      const promise = runPythonWithProgress("test.py", []);
      await new Promise((r) => setTimeout(r, 10));
      const lines = mock.stdinWrites.join("").split("\n").filter(Boolean);
      const id = JSON.parse(lines[lines.length - 1]).id;
      mock.stdout.emit(
        "data",
        Buffer.from(
          `${JSON.stringify({ id, exitCode: 1, stdout: JSON.stringify({ error: oomMsg }) })}\n`,
        ),
      );
      const err = (await promise.catch((e: unknown) => e)) as Error & {
        isSafeMessage?: unknown;
        kind?: string;
      };
      expect(err.isSafeMessage).toBe(true);
      expect(err.kind).toBe("operational");
      expect(err.message).toBe(oomMsg);
      shutdownDispatcher();
    }
  });

  it("classifies an in-band Python MemoryError as operational and falls back to errorInfo.type when error is empty", async () => {
    const mock = await setupReadyDispatcher();
    const promise = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));
    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;
    mock.stdout.emit(
      "data",
      Buffer.from(
        `${JSON.stringify({
          id,
          exitCode: 1,
          stdout: JSON.stringify({
            success: false,
            error: "",
            errorInfo: { type: "MemoryError", message: "", frames: [] },
          }),
        })}\n`,
      ),
    );
    const err = (await promise.catch((e: unknown) => e)) as Error & {
      isSafeMessage?: unknown;
      kind?: string;
      pythonType?: string;
    };
    expect(err.isSafeMessage).toBe(true);
    expect(err.message).toBe("MemoryError");
    expect(err.kind).toBe("operational");
    expect(err.pythonType).toBe("MemoryError");
  });
});

// ── Dispatcher partial stderr buffering ──────────────────────────────

describe("bridge - dispatcher stderr partial buffering", () => {
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

  it("buffers partial JSON progress lines across stderr chunks", async () => {
    const mock = await setupReadyDispatcher();
    const progressUpdates: Array<{ percent: number; stage: string }> = [];

    const promise = runPythonWithProgress("test.py", [], {
      onProgress: (p, s) => progressUpdates.push({ percent: p, stage: s }),
    });
    await new Promise((r) => setTimeout(r, 10));

    // Send a progress line split across two stderr chunks
    mock.stderr.emit("data", Buffer.from('{"progress": 30, "sta'));
    mock.stderr.emit("data", Buffer.from('ge": "Loading"}\n'));

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;

    mock.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id, exitCode: 0, stdout: '{"ok": true}' })}\n`),
    );

    await promise;
    expect(progressUpdates).toEqual([{ percent: 30, stage: "Loading" }]);
  });

  it("handles readiness signal split across stderr chunks", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const initPromise = initDispatcher();

    // Split the ready signal across two chunks
    mock.stderr.emit("data", Buffer.from('{"ready": tr'));
    mock.stderr.emit("data", Buffer.from('ue, "gpu": false}\n'));

    const result = await initPromise;
    expect(result).toEqual({ ready: true, gpu: false });
  });

  it("handles multiple complete lines in a single stderr chunk", async () => {
    const mock = await setupReadyDispatcher();
    const progressUpdates: Array<{ percent: number; stage: string }> = [];

    const promise = runPythonWithProgress("test.py", [], {
      onProgress: (p, s) => progressUpdates.push({ percent: p, stage: s }),
    });
    await new Promise((r) => setTimeout(r, 10));

    // Two progress lines in one chunk
    mock.stderr.emit(
      "data",
      Buffer.from('{"progress": 25, "stage": "Step 1"}\n{"progress": 75, "stage": "Step 2"}\n'),
    );

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;

    mock.stdout.emit("data", Buffer.from(`${JSON.stringify({ id, exitCode: 0, stdout: "{}" })}\n`));

    await promise;
    expect(progressUpdates).toEqual([
      { percent: 25, stage: "Step 1" },
      { percent: 75, stage: "Step 2" },
    ]);
  });

  it("does not fire progress for partial JSON that is not yet complete", async () => {
    const mock = await setupReadyDispatcher();
    const progressUpdates: Array<{ percent: number; stage: string }> = [];

    const promise = runPythonWithProgress("test.py", [], {
      onProgress: (p, s) => progressUpdates.push({ percent: p, stage: s }),
    });
    await new Promise((r) => setTimeout(r, 10));

    // Send incomplete JSON with no trailing newline
    mock.stderr.emit("data", Buffer.from('{"progress": 50, "stage": "Half'));

    // No progress should have fired yet
    expect(progressUpdates).toEqual([]);

    // Complete the line
    mock.stderr.emit("data", Buffer.from('way"}\n'));
    expect(progressUpdates).toEqual([{ percent: 50, stage: "Halfway" }]);

    // Finish
    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;
    mock.stdout.emit("data", Buffer.from(`${JSON.stringify({ id, exitCode: 0, stdout: "{}" })}\n`));
    await promise;
  });

  it("flushes trailing un-newlined stderrBuf on dispatcher close (issue #3096)", async () => {
    const mockDisp = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDisp.process;
      return mockPerReq.process;
    });

    const { setAiLogger } = await import("../../../packages/ai/src/log.js");
    const sink = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    setAiLogger(sink);
    onTestFinished(() => setAiLogger(null));

    const initPromise = initDispatcher();
    mockDisp.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await initPromise;

    const promise = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));

    // Emit a trailing diagnostic without a newline right before the dispatcher exits
    mockDisp.stderr.emit("data", Buffer.from('{"warning": "final warning before exit"}'));
    mockDisp.emitEvent("close", 1, null);

    await new Promise((r) => setTimeout(r, 10));
    mockPerReq.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPerReq.emitEvent("close", 0, null);
    await promise;

    expect(sink.warn.mock.calls.map((call) => call[0])).toContain(
      "[python] final warning before exit",
    );
  });

  it("does not mark a closing child ready when flushing an un-newlined ready frame on close (issue #3096)", async () => {
    const { getDispatcherStatus } = await import("../../../packages/ai/src/bridge.js");
    const mockDisp = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDisp.process;
      return mockPerReq.process;
    });

    const promise = runPythonWithProgress("test.py", []);

    // Dispatcher emits partial ready frame without newline and crashes before completing startup
    mockDisp.stderr.emit("data", Buffer.from('{"ready": true, "gpu": true}'));
    mockDisp.emitEvent("close", 1, null);

    await new Promise((r) => setTimeout(r, 10));
    mockPerReq.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPerReq.emitEvent("close", 0, null);
    await promise;

    const status = getDispatcherStatus();
    expect(status.ready).toBe(false);
    expect(status.gpu).toBe(false);
    expect(status.consecutiveCrashes).toBe(1);
  });

  it("does not invoke onProgress for an un-newlined progress frame when the dispatcher closes mid-request (issue #3096)", async () => {
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

    const onProgress = vi.fn();
    const promise = runPythonWithProgress("test.py", [], { onProgress });
    await new Promise((r) => setTimeout(r, 10));

    // Un-newlined progress frame buffered right before the dispatcher crashes
    mockDisp.stderr.emit("data", Buffer.from('{"progress": 90, "stage": "Crashing"}'));
    mockDisp.emitEvent("close", 1, null);

    await new Promise((r) => setTimeout(r, 10));
    mockPerReq.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPerReq.emitEvent("close", 0, null);
    await promise;

    expect(onProgress).not.toHaveBeenCalled();
  });
});

// ── Dispatcher shutdown behavior ─────────────────────────────────────

describe("bridge - dispatcher shutdown behavior", () => {
  let initDispatcher: typeof import("../../../packages/ai/src/bridge.js").initDispatcher;
  let runPythonWithProgress: typeof import("../../../packages/ai/src/bridge.js").runPythonWithProgress;
  let shutdownDispatcher: typeof import("../../../packages/ai/src/bridge.js").shutdownDispatcher;
  let getDispatcherStatus: typeof import("../../../packages/ai/src/bridge.js").getDispatcherStatus;
  let isGpuAvailable: typeof import("../../../packages/ai/src/bridge.js").isGpuAvailable;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();

    const mod = await import("../../../packages/ai/src/bridge.js");
    initDispatcher = mod.initDispatcher;
    runPythonWithProgress = mod.runPythonWithProgress;
    shutdownDispatcher = mod.shutdownDispatcher;
    getDispatcherStatus = mod.getDispatcherStatus;
    isGpuAvailable = mod.isGpuAvailable;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls kill(SIGTERM) on the dispatcher process", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const initPromise = initDispatcher();
    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await initPromise;

    shutdownDispatcher();

    expect(mock.process.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("calls stdin.end() before killing the process", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const stdinEndSpy = vi.spyOn(mock.stdin, "end");

    const initPromise = initDispatcher();
    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await initPromise;

    shutdownDispatcher();

    expect(stdinEndSpy).toHaveBeenCalled();
  });

  it("sets status to not running and not ready after shutdown", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const initPromise = initDispatcher();
    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": true}\n'));
    await initPromise;

    expect(getDispatcherStatus().running).toBe(true);
    expect(getDispatcherStatus().ready).toBe(true);

    shutdownDispatcher();

    expect(getDispatcherStatus().running).toBe(false);
    expect(getDispatcherStatus().ready).toBe(false);
  });

  it("does not change GPU status after shutdown (isGpuAvailable returns module-level state)", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const initPromise = initDispatcher();
    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": true}\n'));
    await initPromise;

    expect(isGpuAvailable()).toBe(true);

    shutdownDispatcher();

    // GPU status persists at module level even after shutdown
    expect(isGpuAvailable()).toBe(true);
  });

  it("rejects in-flight requests on shutdown and retries via runPerRequest before close fires (issue #3566)", async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });

    const mockDispatcher1 = createMockProcess();
    const mockPerReq1 = createMockProcess();
    const mockPerReq2 = createMockProcess();
    const mockDispatcher2 = createMockProcess();
    vi.mocked(spawn)
      .mockReturnValueOnce(mockDispatcher1.process)
      .mockReturnValueOnce(mockPerReq1.process)
      .mockReturnValueOnce(mockPerReq2.process)
      .mockReturnValueOnce(mockDispatcher2.process);

    const initPromise = initDispatcher();
    mockDispatcher1.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await vi.advanceTimersByTimeAsync(60);
    await initPromise;

    const p1 = runPythonWithProgress("test1.py", ["arg1"], { timeout: 1000 });
    const p2 = runPythonWithProgress("test2.py", ["arg2"], { timeout: 5000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(mockDispatcher1.stdinWrites).toHaveLength(2);
    const oldReq1Id = JSON.parse(mockDispatcher1.stdinWrites[0].trim()).id;

    // Shut down the dispatcher while both requests are in flight without emitting "close" yet.
    shutdownDispatcher();
    await vi.advanceTimersByTimeAsync(0);

    // Both in-flight requests immediately fall back to runPerRequest before "close" fires.
    expect(spawn).toHaveBeenCalledTimes(3);

    mockPerReq1.stdout.emit("data", Buffer.from('{"ok": 1}\n'));
    mockPerReq1.emitEvent("close", 0, null);
    await expect(p1).resolves.toMatchObject({
      stdout: '{"ok": 1}',
      stderr: expect.stringContaining("[bridge] retried after dispatcher crash"),
    });

    // Advancing past p1's original 1000ms timeout proves dispatcherRun cleaned up its timer on shutdown.
    await vi.advanceTimersByTimeAsync(1500);
    expect(mockDispatcher1.process.kill).toHaveBeenCalledTimes(1);

    mockPerReq2.stdout.emit("data", Buffer.from('{"ok": 2}\n'));
    mockPerReq2.emitEvent("close", 0, null);
    await expect(p2).resolves.toMatchObject({
      stdout: '{"ok": 2}',
      stderr: expect.stringContaining("[bridge] retried after dispatcher crash"),
    });

    // Spawn a replacement dispatcher before mockDispatcher1 finishes closing.
    const initPromise2 = initDispatcher();
    mockDispatcher2.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await vi.advanceTimersByTimeAsync(60);
    await initPromise2;

    // Late stdout and close from the stopped mockDispatcher1 are ignored and do not count as a crash.
    mockDispatcher1.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id: oldReq1Id, exitCode: 1, stdout: "" })}\n`),
    );
    mockDispatcher1.emitEvent("close", null, "SIGTERM");
    expect(getDispatcherStatus().consecutiveCrashes).toBe(0);
    expect(getDispatcherStatus().running).toBe(true);
    expect(getDispatcherStatus().ready).toBe(true);
  });
});

// ── initDispatcher edge cases ────────────────────────────────────────

describe("bridge - initDispatcher edge cases", () => {
  let initDispatcher: typeof import("../../../packages/ai/src/bridge.js").initDispatcher;
  let _runPythonWithProgress: typeof import("../../../packages/ai/src/bridge.js").runPythonWithProgress;
  let shutdownDispatcher: typeof import("../../../packages/ai/src/bridge.js").shutdownDispatcher;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();

    const mod = await import("../../../packages/ai/src/bridge.js");
    initDispatcher = mod.initDispatcher;
    _runPythonWithProgress = mod.runPythonWithProgress;
    shutdownDispatcher = mod.shutdownDispatcher;
  });

  afterEach(() => {
    shutdownDispatcher();
    vi.restoreAllMocks();
  });

  it("returns ready=false immediately when dispatcher already permanently failed", async () => {
    // Force dispatcherFailed by triggering ENOENT error
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const initPromise1 = initDispatcher();

    const enoent = new Error("spawn ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    mock.emitEvent("error", enoent);

    const result1 = await initPromise1;
    expect(result1).toEqual({ ready: false, gpu: false });

    // Second call should return immediately without spawning
    const result2 = await initDispatcher();
    expect(result2).toEqual({ ready: false, gpu: false });
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("returns ready=false when spawn throws synchronously", async () => {
    vi.mocked(spawn).mockImplementation(() => {
      throw new Error("Cannot spawn");
    });

    const result = await initDispatcher();
    expect(result).toEqual({ ready: false, gpu: false });
  });

  it("resolves with ready=false when dispatcher fails during init timeout", async () => {
    vi.useFakeTimers();
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = initDispatcher(500);

    // Dispatcher crashes before timeout
    const err = new Error("spawn error") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    mock.emitEvent("error", err);

    vi.advanceTimersByTime(100);

    const result = await promise;
    expect(result).toEqual({ ready: false, gpu: false });

    vi.useRealTimers();
  });
});

// ── Per-request fallback edge cases ──────────────────────────────────

describe("bridge - per-request fallback edge cases", () => {
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

  it("handles stderr that mixes progress JSON and regular text", async () => {
    const mockDisp = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDisp.process;
      return mockPerReq.process;
    });

    const progressUpdates: Array<{ percent: number; stage: string }> = [];
    const promise = runPythonWithProgress("test.py", [], {
      onProgress: (p, s) => progressUpdates.push({ percent: p, stage: s }),
    });

    // Kill dispatcher
    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    mockDisp.emitEvent("error", enoent);

    await new Promise((r) => setTimeout(r, 10));

    // Mix of progress JSON and regular log lines on per-request stderr
    mockPerReq.stderr.emit(
      "data",
      Buffer.from(
        'WARNING: GPU not found\n{"progress": 40, "stage": "Loading model"}\nINFO: Using CPU\n',
      ),
    );

    mockPerReq.stdout.emit("data", Buffer.from('{"success": true}\n'));
    mockPerReq.emitEvent("close", 0, null);

    const result = await promise;

    expect(progressUpdates).toEqual([{ percent: 40, stage: "Loading model" }]);
    expect(result.stderr).toContain("WARNING: GPU not found");
    expect(result.stderr).toContain("INFO: Using CPU");
  });

  it("per-request stderr JSON with only progress is not collected as error output", async () => {
    const mockDisp = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDisp.process;
      return mockPerReq.process;
    });

    const promise = runPythonWithProgress("test.py", [], {
      onProgress: vi.fn(),
    });

    // Kill dispatcher
    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    mockDisp.emitEvent("error", enoent);

    await new Promise((r) => setTimeout(r, 10));

    // Only progress JSON on stderr
    mockPerReq.stderr.emit("data", Buffer.from('{"progress": 100, "stage": "Done"}\n'));

    mockPerReq.stdout.emit("data", Buffer.from('{"success": true}\n'));
    mockPerReq.emitEvent("close", 0, null);

    const result = await promise;
    // Stderr should not contain the progress JSON since it was parsed as progress
    expect(result.stderr).toBe("");
  });

  it("handles empty stdout with successful exit", async () => {
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

    // Empty stdout, exit code 0
    mockPerReq.emitEvent("close", 0, null);

    const result = await promise;
    expect(result.stdout).toBe("");
  });

  it("handles large stdout that arrives in many small chunks", async () => {
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

    // Send large JSON result in many small pieces
    const fullJson = JSON.stringify({ success: true, data: "x".repeat(1000) });
    for (let i = 0; i < fullJson.length; i += 50) {
      mockPerReq.stdout.emit("data", Buffer.from(fullJson.slice(i, i + 50)));
    }
    mockPerReq.stdout.emit("data", Buffer.from("\n"));
    mockPerReq.emitEvent("close", 0, null);

    const result = await promise;
    expect(result.stdout).toBe(fullJson);
  });

  it("does not invoke onProgress for JSON stderr that lacks stage field", async () => {
    const mockDisp = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDisp.process;
      return mockPerReq.process;
    });

    const onProgress = vi.fn();
    const promise = runPythonWithProgress("test.py", [], { onProgress });

    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    mockDisp.emitEvent("error", enoent);

    await new Promise((r) => setTimeout(r, 10));

    // JSON on stderr but missing "stage" field
    mockPerReq.stderr.emit("data", Buffer.from('{"progress": 50}\n'));

    mockPerReq.stdout.emit("data", Buffer.from('{"success": true}\n'));
    mockPerReq.emitEvent("close", 0, null);

    await promise;
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("does not invoke onProgress for JSON stderr that lacks progress field", async () => {
    const mockDisp = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDisp.process;
      return mockPerReq.process;
    });

    const onProgress = vi.fn();
    const promise = runPythonWithProgress("test.py", [], { onProgress });

    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    mockDisp.emitEvent("error", enoent);

    await new Promise((r) => setTimeout(r, 10));

    // JSON on stderr but missing "progress" field
    mockPerReq.stderr.emit("data", Buffer.from('{"stage": "Loading"}\n'));

    mockPerReq.stdout.emit("data", Buffer.from('{"success": true}\n'));
    mockPerReq.emitEvent("close", 0, null);

    await promise;
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("forwards per-request stderr diagnostics ({info}, {warning}, and bracket-prefixed lines) to aiLog on exit 0 (issue #2568)", async () => {
    const mockDisp = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDisp.process;
      return mockPerReq.process;
    });

    const { setAiLogger } = await import("../../../packages/ai/src/log.js");
    const sink = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    setAiLogger(sink);
    onTestFinished(() => setAiLogger(null));

    const promise = runPythonWithProgress("test.py", []);

    mockPerReq.stderr.emit(
      "data",
      Buffer.from(
        '{"info": "model cached"}\n{"warning": "low memory"}\n[model] Loading weights...\n',
      ),
    );
    // Trailing partial diagnostic without newline flushed on close
    mockPerReq.stderr.emit("data", Buffer.from('{"warning": "trailing notice"}'));
    mockPerReq.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPerReq.emitEvent("close", 0, null);

    const result = await promise;
    expect(result.stdout).toBe('{"ok": true}');
    expect(result.stderr).toBe("[model] Loading weights...");
    expect(sink.info.mock.calls.map((call) => call[0])).toEqual([
      "[python] model cached",
      "[python] [model] Loading weights...",
    ]);
    expect(sink.warn.mock.calls.map((call) => call[0])).toEqual([
      "[python] low memory",
      "[python] trailing notice",
    ]);
  });

  it("forwards runDocsScript per-request stderr diagnostics to aiLog even though runDocsScript returns only stdout (issue #2568)", async () => {
    const mockDisp = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDisp.process;
      return mockPerReq.process;
    });

    const { runDocsScript, shutdownDocsDispatcher } = await import(
      "../../../packages/ai/src/bridge.js"
    );
    const { setAiLogger } = await import("../../../packages/ai/src/log.js");
    const sink = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    setAiLogger(sink);
    onTestFinished(async () => {
      setAiLogger(null);
      await shutdownDocsDispatcher();
    });

    const promise = runDocsScript("doc_to_word", { path: "/tmp/in.pdf", out: "/tmp/out.docx" });

    mockPerReq.stderr.emit(
      "data",
      Buffer.from(
        '[doc_to_word] pymupdf message redirect unavailable: boom\n{"warning": "fallback"}\n',
      ),
    );
    mockPerReq.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPerReq.emitEvent("close", 0, null);

    await expect(promise).resolves.toBe('{"ok": true}');
    expect(sink.info.mock.calls.map((call) => call[0])).toEqual([
      "[python] [doc_to_word] pymupdf message redirect unavailable: boom",
    ]);
    expect(sink.warn.mock.calls.map((call) => call[0])).toEqual(["[python] fallback"]);
  });

  it("ignores late stderr chunks after abort and suppresses trailing onProgress on timeout while still logging diagnostics (issue #2568)", async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });

    const mockDisp = createMockProcess();
    const mockAborted = createMockProcess();
    const mockTimedOut = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockDisp.process;
      if (callCount === 2) return mockAborted.process;
      return mockTimedOut.process;
    });

    const { setAiLogger } = await import("../../../packages/ai/src/log.js");
    const sink = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    setAiLogger(sink);
    onTestFinished(() => setAiLogger(null));

    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";

    const abortController = new AbortController();
    const abortedProgress = vi.fn();
    const pAborted = runPythonWithProgress("test.py", [], {
      signal: abortController.signal,
      onProgress: abortedProgress,
    });
    mockDisp.emitEvent("error", enoent);
    await vi.advanceTimersByTimeAsync(10);

    abortController.abort();
    await expect(pAborted).rejects.toThrow("Python script canceled");

    // Late stderr/stdout from the SIGTERMed child after abort is ignored
    mockAborted.stderr.emit(
      "data",
      Buffer.from('{"progress": 90, "stage": "late"}\n{"warning": "stale"}\n'),
    );
    mockAborted.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    expect(abortedProgress).not.toHaveBeenCalled();
    expect(sink.warn).not.toHaveBeenCalled();

    // Now test timeout with a trailing progress frame vs diagnostic in stderrBuffer
    const timeoutProgress = vi.fn();
    const pTimedOut = runPythonWithProgress("slow.py", [], {
      timeout: 1000,
      onProgress: timeoutProgress,
    });
    const settledTimedOut = pTimedOut.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10);

    // Partial progress without newline before timeout, followed by close after timeout
    mockTimedOut.stderr.emit("data", Buffer.from('{"progress": 99, "stage": "Hung"}'));
    vi.advanceTimersByTime(1500);
    mockTimedOut.emitEvent("close", null, "SIGTERM");

    const err = (await settledTimedOut) as Error;
    expect(err.message).toBe("Python script timed out");
    expect(timeoutProgress).not.toHaveBeenCalled();
  });
});

// ── Dispatcher error event handling ──────────────────────────────────

describe("bridge - dispatcher error event handling", () => {
  let runPythonWithProgress: typeof import("../../../packages/ai/src/bridge.js").runPythonWithProgress;
  let getDispatcherStatus: typeof import("../../../packages/ai/src/bridge.js").getDispatcherStatus;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();

    const mod = await import("../../../packages/ai/src/bridge.js");
    runPythonWithProgress = mod.runPythonWithProgress;
    getDispatcherStatus = mod.getDispatcherStatus;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ENOENT error permanently disables the dispatcher", async () => {
    const mock = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mock.process;
      return mockPerReq.process;
    });

    const promise = runPythonWithProgress("test.py", []);

    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    mock.emitEvent("error", enoent);

    await new Promise((r) => setTimeout(r, 10));

    mockPerReq.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPerReq.emitEvent("close", 0, null);
    await promise;

    expect(getDispatcherStatus().failed).toBe(true);
  });

  it("non-ENOENT error records a crash but does not permanently disable", async () => {
    const mock = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mock.process;
      return mockPerReq.process;
    });

    const promise = runPythonWithProgress("test.py", []);

    const eacces = new Error("EACCES") as NodeJS.ErrnoException;
    eacces.code = "EACCES";
    mock.emitEvent("error", eacces);

    await new Promise((r) => setTimeout(r, 10));

    mockPerReq.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPerReq.emitEvent("close", 0, null);
    await promise;

    const status = getDispatcherStatus();
    expect(status.failed).toBe(false);
    expect(status.consecutiveCrashes).toBeGreaterThanOrEqual(1);
  });

  it("non-ENOENT dispatcher error increments crash counter and clears dispatcher state", async () => {
    const mock = createMockProcess();
    const mockPerReq = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mock.process;
      return mockPerReq.process;
    });

    const promise = runPythonWithProgress("test.py", []);

    // Non-ENOENT error: records a crash, does NOT permanently disable
    const eacces = new Error("permission denied") as NodeJS.ErrnoException;
    eacces.code = "EACCES";
    mock.emitEvent("error", eacces);

    await new Promise((r) => setTimeout(r, 10));

    // Per-request fallback picks up
    mockPerReq.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPerReq.emitEvent("close", 0, null);

    await promise;

    const status = getDispatcherStatus();
    expect(status.consecutiveCrashes).toBeGreaterThanOrEqual(1);
    expect(status.failed).toBe(false);
    expect(status.running).toBe(false);
    expect(status.ready).toBe(false);
  });
});

// ── Dispatcher stdout partial line buffering ─────────────────────────

describe("bridge - dispatcher stdout partial line buffering", () => {
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

  it("handles dispatcher response split across 3 or more stdout chunks", async () => {
    const mock = await setupReadyDispatcher();

    const promise = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));

    const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
    const id = JSON.parse(line).id;

    const fullResponse = JSON.stringify({ id, exitCode: 0, stdout: '{"ok":true}' });

    // Split into 3 chunks
    const third = Math.floor(fullResponse.length / 3);
    mock.stdout.emit("data", Buffer.from(fullResponse.slice(0, third)));
    mock.stdout.emit("data", Buffer.from(fullResponse.slice(third, third * 2)));
    mock.stdout.emit("data", Buffer.from(`${fullResponse.slice(third * 2)}\n`));

    const result = await promise;
    expect(result.stdout).toBe('{"ok":true}');
  });

  it("handles two complete responses in a single stdout data event", async () => {
    const mock = await setupReadyDispatcher();

    const p1 = runPythonWithProgress("a.py", []);
    const p2 = runPythonWithProgress("b.py", []);
    await new Promise((r) => setTimeout(r, 10));

    const lines = mock.stdinWrites.join("").split("\n").filter(Boolean);
    const id1 = JSON.parse(lines[0]).id;
    const id2 = JSON.parse(lines[1]).id;

    // Both responses in a single chunk
    const response1 = JSON.stringify({ id: id1, exitCode: 0, stdout: '{"r":"one"}' });
    const response2 = JSON.stringify({ id: id2, exitCode: 0, stdout: '{"r":"two"}' });
    mock.stdout.emit("data", Buffer.from(`${response1}\n${response2}\n`));

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.stdout).toBe('{"r":"one"}');
    expect(r2.stdout).toBe('{"r":"two"}');
  });
});

// ── Crash recovery resets on success ─────────────────────────────────

describe("bridge - crash recovery resets on successful readiness", () => {
  let runPythonWithProgress: typeof import("../../../packages/ai/src/bridge.js").runPythonWithProgress;
  let initDispatcher: typeof import("../../../packages/ai/src/bridge.js").initDispatcher;
  let getDispatcherStatus: typeof import("../../../packages/ai/src/bridge.js").getDispatcherStatus;
  let shutdownDispatcher: typeof import("../../../packages/ai/src/bridge.js").shutdownDispatcher;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();

    const mod = await import("../../../packages/ai/src/bridge.js");
    runPythonWithProgress = mod.runPythonWithProgress;
    initDispatcher = mod.initDispatcher;
    getDispatcherStatus = mod.getDispatcherStatus;
    shutdownDispatcher = mod.shutdownDispatcher;
  });

  afterEach(() => {
    shutdownDispatcher();
    vi.restoreAllMocks();
  });

  it("resets consecutiveCrashes to 0 when dispatcher becomes ready", async () => {
    vi.useFakeTimers();

    // First: cause a crash to increment the counter
    const mock1 = createMockProcess();
    const mockPR = createMockProcess();
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mock1.process;
      if (callCount === 2) return mockPR.process;
      // Third call will be a new dispatcher
      return createMockProcess().process;
    });

    const promise = runPythonWithProgress("test.py", []);
    mock1.emitEvent("close", 1, null);

    await vi.advanceTimersByTimeAsync(20);

    mockPR.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPR.emitEvent("close", 0, null);
    await promise;

    expect(getDispatcherStatus().consecutiveCrashes).toBeGreaterThanOrEqual(1);

    // Now: successfully initialize dispatcher after backoff
    vi.advanceTimersByTime(5000);

    const mock2 = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock2.process);

    const initPromise = initDispatcher();
    mock2.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));

    vi.advanceTimersByTime(100);
    await initPromise;

    expect(getDispatcherStatus().consecutiveCrashes).toBe(0);
    expect(getDispatcherStatus().ready).toBe(true);

    vi.useRealTimers();
  });
});

// ── Backoff prevents restarts during cooldown ────────────────────────

describe("bridge - backoff prevents restart during cooldown", () => {
  let runPythonWithProgress: typeof import("../../../packages/ai/src/bridge.js").runPythonWithProgress;
  let getDispatcherStatus: typeof import("../../../packages/ai/src/bridge.js").getDispatcherStatus;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();

    const mod = await import("../../../packages/ai/src/bridge.js");
    runPythonWithProgress = mod.runPythonWithProgress;
    getDispatcherStatus = mod.getDispatcherStatus;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("second crash has 2x the backoff delay of the first crash", async () => {
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

    // First crash: backoff = 1000ms
    const p1 = runPythonWithProgress("test.py", []);
    mocks[0].emitEvent("close", 1, null);
    await vi.advanceTimersByTimeAsync(20);
    mocks[1].stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mocks[1].emitEvent("close", 0, null);
    await p1;

    expect(getDispatcherStatus().consecutiveCrashes).toBe(1);

    // Still in first backoff: advance only 500ms (< 1000ms)
    vi.advanceTimersByTime(500);

    // Second request during backoff: should skip dispatcher, go to per-request only
    const spawnCountBefore = callCount;
    const p2 = runPythonWithProgress("test2.py", []);
    await vi.advanceTimersByTimeAsync(20);

    mocks[callCount - 1].stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mocks[callCount - 1].emitEvent("close", 0, null);
    await p2;

    // Only 1 additional spawn (per-request), not 2 (dispatcher + per-request)
    expect(callCount - spawnCountBefore).toBe(1);

    vi.useRealTimers();
  });
});

// ── extractPythonError comprehensive coverage ────────────────────────

describe("bridge - extractPythonError coverage via per-request path", () => {
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

  it("extracts error from JSON on stdout when non-zero exit", async () => {
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

    // stdout contains JSON error, stderr is empty
    mockPerReq.stdout.emit("data", Buffer.from('{"error": "Model failed to load"}\n'));
    mockPerReq.emitEvent("close", 1, null);

    await expect(promise).rejects.toThrow("Model failed to load");
  });

  it("falls back to stderr traceback line when per-request stdout JSON error is empty", async () => {
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

    mockPerReq.stdout.emit("data", Buffer.from('{"success": false, "error": "   "}\n'));
    mockPerReq.stderr.emit(
      "data",
      Buffer.from('Traceback (most recent call last):\n  File "test.py", line 1\nMemoryError\n'),
    );
    mockPerReq.emitEvent("close", 1, null);

    const err = (await promise.catch((e: unknown) => e)) as Error & {
      isSafeMessage?: unknown;
      kind?: string;
    };
    expect(err.message).toBe("MemoryError");
    expect(err.isSafeMessage).toBe(true);
    expect(err.kind).toBe("operational");
  });

  it("extracts last meaningful line from traceback when error is only in stderr", async () => {
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

    // Full Python traceback on stderr
    mockPerReq.stderr.emit(
      "data",
      Buffer.from(
        "Traceback (most recent call last):\n" +
          '  File "model.py", line 42, in load\n' +
          "    weights = torch.load(path)\n" +
          "FileNotFoundError: [Errno 2] No such file or directory: 'model.pth'\n",
      ),
    );
    mockPerReq.emitEvent("close", 1, null);

    await expect(promise).rejects.toThrow("FileNotFoundError");
  });

  it("returns generic exit code message when stderr has only the traceback header", async () => {
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

    // Only traceback header, no actual error line
    mockPerReq.stderr.emit("data", Buffer.from("Traceback (most recent call last):\n"));
    mockPerReq.emitEvent("close", 3, null);

    await expect(promise).rejects.toThrow("exited with code 3");
  });
});

// ── parseStdoutJson boundary conditions ──────────────────────────────

describe("bridge - parseStdoutJson boundary conditions", () => {
  let parseStdoutJson: (stdout: string) => unknown;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("../../../packages/ai/src/bridge.js");
    parseStdoutJson = mod.parseStdoutJson;
  });

  it("handles JSON with escaped quotes in string values", () => {
    const result = parseStdoutJson('{"text": "he said \\"hello\\""}');
    expect(result).toEqual({ text: 'he said "hello"' });
  });

  it("handles JSON with empty object", () => {
    const result = parseStdoutJson("{}");
    expect(result).toEqual({});
  });

  it("handles JSON with empty arrays and nested empty objects", () => {
    const result = parseStdoutJson('{"faces": [], "meta": {}}');
    expect(result).toEqual({ faces: [], meta: {} });
  });

  it("handles JSON with very long string values", () => {
    const longText = "a".repeat(10000);
    const result = parseStdoutJson(`{"text": "${longText}"}`);
    expect((result as { text: string }).text).toBe(longText);
  });

  it("handles JSON preceded by ANSI escape codes in stdout", () => {
    // Some Python programs write ANSI codes before output
    const stdout = '\x1b[32mProcessing complete\x1b[0m\n{"success": true}';
    // The regex matches from the first { to the last }
    const result = parseStdoutJson(stdout);
    expect(result).toEqual({ success: true });
  });

  it("handles JSON with negative numbers", () => {
    const result = parseStdoutJson('{"x": -10, "y": -0.5}');
    expect(result).toEqual({ x: -10, y: -0.5 });
  });

  it("throws on truncated JSON", () => {
    expect(() => parseStdoutJson('{"success": true, "dat')).toThrow();
  });

  it("handles JSON with only whitespace before the object", () => {
    const result = parseStdoutJson('   \n  \t  {"success": true}');
    expect(result).toEqual({ success: true });
  });
});

describe("bridge - pre-dispatch sidecar memory floor (issue #1162)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses a gated AI script before spawning or writing to Python when CPU free memory is below the bundle floor", async () => {
    const { runPythonWithProgress, shutdownDispatcher } = await import(
      "../../../packages/ai/src/bridge.js"
    );
    onTestFinished(() => shutdownDispatcher());

    const settled = await runPythonWithProgress("upscale.py", ["/tmp/in.png", "/tmp/out.png"], {
      memoryOptions: {
        gpuAvailable: false,
        availableMemoryBytes: 1.2 * 1024 ** 3,
      },
    }).catch((err: unknown) => err);

    expect(spawn).not.toHaveBeenCalled();
    expect(settled).toBeInstanceOf(Error);
    const err = settled as Error & { isSafeMessage?: boolean; kind?: string; code?: string };
    expect(err.message).toContain("upscale needs about 2.5 GB free");
    expect(err.message).toContain("this host has 1.2 GB");
    expect(err.isSafeMessage).toBe(true);
    expect(err.kind).toBe("operational");
    expect(err.code).toBe("insufficient-memory");
  });

  it("evaluates isNvidiaDevicePresent and respects SNAPOTTER_GPU and CUDA_VISIBLE_DEVICES overrides", async () => {
    const { isNvidiaDevicePresent } = await import("../../../packages/ai/src/bridge.js");
    const savedGpu = process.env.SNAPOTTER_GPU;
    const savedVisible = process.env.CUDA_VISIBLE_DEVICES;
    onTestFinished(() => {
      if (savedGpu === undefined) delete process.env.SNAPOTTER_GPU;
      else process.env.SNAPOTTER_GPU = savedGpu;
      if (savedVisible === undefined) delete process.env.CUDA_VISIBLE_DEVICES;
      else process.env.CUDA_VISIBLE_DEVICES = savedVisible;
    });

    delete process.env.SNAPOTTER_GPU;
    delete process.env.CUDA_VISIBLE_DEVICES;
    expect(isNvidiaDevicePresent((p) => p === "/dev/nvidiactl")).toBe(true);
    expect(isNvidiaDevicePresent((p) => p === "/dev/nvidia0")).toBe(true);
    expect(isNvidiaDevicePresent(() => false)).toBe(false);

    process.env.SNAPOTTER_GPU = " false ";
    expect(isNvidiaDevicePresent(() => true)).toBe(false);
    delete process.env.SNAPOTTER_GPU;

    for (const val of ["", "-1", "NONE"]) {
      process.env.CUDA_VISIBLE_DEVICES = val;
      expect(isNvidiaDevicePresent(() => true)).toBe(false);
    }
  });

  it("uses probed dispatcher GPU state when ready and falls back to deviceExists on cold start", async () => {
    const { initDispatcher, runPythonWithProgress, shutdownDispatcher } = await import(
      "../../../packages/ai/src/bridge.js"
    );
    onTestFinished(() => shutdownDispatcher());

    // Cold start with /dev/nvidiactl present bypasses the CPU memory floor
    // (reaching runPerRequest's feature_not_installed check instead of insufficient-memory).
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);
    await expect(
      runPythonWithProgress("upscale.py", ["/tmp/in.png"], {
        memoryOptions: {
          availableMemoryBytes: 1.0 * 1024 ** 3,
          deviceExists: (p) => p === "/dev/nvidiactl",
        },
      }),
    ).rejects.toThrow("feature_not_installed");

    // Once the spawned dispatcher emits ready with gpu: false, the probed CPU
    // state wins even if deviceExists returns true.
    const initCpu = initDispatcher();
    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await initCpu;

    await expect(
      runPythonWithProgress("upscale.py", ["/tmp/in.png"], {
        memoryOptions: {
          availableMemoryBytes: 1.0 * 1024 ** 3,
          deviceExists: () => true,
        },
      }),
    ).rejects.toThrow("upscale needs about 2.5 GB free on CPU hosts");
  });

  it("uses per-framework GPU readiness from dispatcher.py and caller toolId in pre-dispatch refusals (issue #2524)", async () => {
    const { initDispatcher, runPythonWithProgress, shutdownDispatcher } = await import(
      "../../../packages/ai/src/bridge.js"
    );
    onTestFinished(() => shutdownDispatcher());

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const initReady = initDispatcher();
    mock.stderr.emit(
      "data",
      Buffer.from(
        '{"ready": true, "gpu": true, "gpuFrameworks": {"torch": false, "onnx": true, "ctranslate2": false}}\n',
      ),
    );
    await initReady;

    // Torch script (upscale.py) is refused at 1.5 GiB because gpuFrameworks.torch is false.
    await expect(
      runPythonWithProgress("upscale.py", ["/tmp/in.png"], {
        memoryOptions: { availableMemoryBytes: 1.5 * 1024 ** 3 },
      }),
    ).rejects.toThrow("upscale needs about 2.5 GB free on CPU hosts, this host has 1.5 GB");
    expect(mock.stdinWrites).toHaveLength(0);

    // CTranslate2 script (transcribe.py) with toolId="auto-subtitles" is refused naming auto-subtitles.
    await expect(
      runPythonWithProgress("transcribe.py", ["/tmp/in.wav", "{}"], {
        toolId: "auto-subtitles",
        memoryOptions: { availableMemoryBytes: 1.2 * 1024 ** 3 },
      }),
    ).rejects.toThrow("auto-subtitles needs about 2 GB free on CPU hosts, this host has 1.2 GB");
    expect(mock.stdinWrites).toHaveLength(0);

    // passport-photo Step 1 (face_landmarks.py) with toolId="passport-photo" is refused at 1.2 GiB
    // when ONNX GPU is unavailable.
    await expect(
      runPythonWithProgress("face_landmarks.py", ["/tmp/in.png", "unused", "{}"], {
        toolId: "passport-photo",
        memoryOptions: {
          gpuAvailable: false,
          availableMemoryBytes: 1.2 * 1024 ** 3,
        },
      }),
    ).rejects.toThrow("passport-photo needs about 2.5 GB free on CPU hosts, this host has 1.2 GB");
    expect(mock.stdinWrites).toHaveLength(0);

    // ONNX script (remove_bg.py) proceeds to dispatcher stdin at 1.5 GiB because gpuFrameworks.onnx is true.
    const onnxPromise = runPythonWithProgress("remove_bg.py", ["/tmp/in.png", "/tmp/out.png"], {
      toolId: "background-replace",
      memoryOptions: { availableMemoryBytes: 1.5 * 1024 ** 3 },
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(mock.stdinWrites.length).toBe(1);
    const req = JSON.parse(mock.stdinWrites[0].trim());
    mock.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id: req.id, exitCode: 0, stdout: '{"success": true}' })}\n`),
    );
    await expect(onnxPromise).resolves.toMatchObject({ stdout: '{"success": true}' });

    // Shutting down the dispatcher (as routes/features.ts does after a bundle install)
    // clears the stale gpuFrameworks map so newly installed GPU frameworks re-probe
    // via cold-start deviceExists until the replacement dispatcher signals ready.
    shutdownDispatcher();
    const mockAfterInstall = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mockAfterInstall.process);
    await expect(
      runPythonWithProgress("upscale.py", ["/tmp/in.png"], {
        memoryOptions: {
          availableMemoryBytes: 1.5 * 1024 ** 3,
          deviceExists: (p) => p === "/dev/nvidiactl",
        },
      }),
    ).rejects.toThrow("feature_not_installed");
  });
});

describe("bridge - dispatcher failure recycling and diagnostics (issue #2709)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DISPATCHER_MAX_CONSECUTIVE_FAILURES;
  });

  it("recycles the dispatcher immediately on CUDA or ORT context-poison signatures without incrementing consecutiveCrashes", async () => {
    const { getDispatcherStatus, initDispatcher, runPythonWithProgress, shutdownDispatcher } =
      await import("../../../packages/ai/src/bridge.js");
    onTestFinished(() => shutdownDispatcher());

    const cudaSignatures = [
      {
        exitCode: 0,
        stdout: JSON.stringify({
          success: false,
          error: "[ONNXRuntimeError] : 1 : FAIL : CUDA failure 999: unknown error",
        }),
      },
      {
        exitCode: 1,
        stdout: JSON.stringify({
          success: false,
          error: "RuntimeError: cudaErrorIllegalAddress: an illegal memory access was encountered",
        }),
      },
      {
        exitCode: 1,
        stdout: JSON.stringify({
          success: false,
          error: "cuDNN error: CUDNN_STATUS_INTERNAL_ERROR",
        }),
      },
      {
        exitCode: 1,
        stdout: JSON.stringify({
          success: false,
          error: "ORT_RUNTIME_EXCEPTION: failed to run session",
        }),
      },
      {
        exitCode: 1,
        stdout: JSON.stringify({
          success: false,
          error: "RuntimeError: CUDA error: device-side assert triggered",
        }),
      },
      {
        exitCode: 1,
        stdout: JSON.stringify({
          success: false,
          error: "RuntimeError: CUDA failure 700",
        }),
      },
    ];

    // Run 6 CUDA poison recycles back-to-back (> MAX_CONSECUTIVE_CRASHES = 5)
    // to prove recycling never trips the 5-crashes-in-60s permanent disable.
    for (let i = 0; i < cudaSignatures.length; i++) {
      const mock = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mock.process);

      const readyPromise = initDispatcher();
      mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": true}\n'));
      await readyPromise;

      const sig = cudaSignatures[i];
      const reqPromise = runPythonWithProgress("test.py", []);
      const settled = reqPromise.then(
        (res) => ({ ok: true as const, res }),
        (err: Error) => ({ ok: false as const, err }),
      );
      await new Promise((r) => setTimeout(r, 10));

      const line = mock.stdinWrites.join("").split("\n").filter(Boolean)[0];
      const { id } = JSON.parse(line);
      mock.stdout.emit(
        "data",
        Buffer.from(`${JSON.stringify({ id, exitCode: sig.exitCode, stdout: sig.stdout })}\n`),
      );
      mock.emitEvent("close", null, "SIGTERM");

      const outcome = await settled;
      if (sig.exitCode === 0) {
        expect(outcome.ok).toBe(true);
      } else {
        expect(outcome.ok).toBe(false);
      }

      const status = getDispatcherStatus();
      expect(status.running).toBe(false);
      expect(status.ready).toBe(false);
      expect(status.failed).toBe(false);
      expect(status.consecutiveCrashes).toBe(0);
      expect(status.consecutiveScriptFailures).toBe(i + 1);
      expect(status.lastRecycleReason).toBe("cuda_error");
      expect(mock.process.kill).toHaveBeenCalledWith("SIGTERM");
    }

    // Subsequent successful request on a fresh dispatcher resets consecutiveScriptFailures to 0.
    const freshMock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(freshMock.process);
    const readyPromise = initDispatcher();
    freshMock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": true}\n'));
    await readyPromise;

    const okPromise = runPythonWithProgress("test.py", []);
    await new Promise((r) => setTimeout(r, 10));
    const { id } = JSON.parse(freshMock.stdinWrites.join("").trim());
    freshMock.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id, exitCode: 0, stdout: '{"success": true}' })}\n`),
    );
    await expect(okPromise).resolves.toMatchObject({ stdout: '{"success": true}' });

    const finalStatus = getDispatcherStatus();
    expect(finalStatus.running).toBe(true);
    expect(finalStatus.ready).toBe(true);
    expect(finalStatus.failed).toBe(false);
    expect(finalStatus.consecutiveCrashes).toBe(0);
    expect(finalStatus.consecutiveScriptFailures).toBe(0);
    expect(finalStatus.lastRecycleReason).toBe("cuda_error");
  });

  it("recycles the dispatcher after 3 consecutive script failures and resets on success without tripping MAX_CONSECUTIVE_CRASHES", async () => {
    const { getDispatcherStatus, initDispatcher, runPythonWithProgress, shutdownDispatcher } =
      await import("../../../packages/ai/src/bridge.js");
    const { setAiLogger } = await import("../../../packages/ai/src/log.js");
    const sink = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    setAiLogger(sink);
    onTestFinished(() => {
      setAiLogger(null);
      shutdownDispatcher();
    });

    const mock1 = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock1.process);
    const ready1 = initDispatcher();
    mock1.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await ready1;

    async function sendAndRespond(
      mock: ReturnType<typeof createMockProcess>,
      exitCode: number,
      stdout: string,
    ) {
      const p = runPythonWithProgress("test.py", []);
      const settled = p.catch((e: unknown) => e);
      await new Promise((r) => setTimeout(r, 10));
      const lines = mock.stdinWrites.join("").split("\n").filter(Boolean);
      const { id } = JSON.parse(lines[lines.length - 1]);
      mock.stdout.emit("data", Buffer.from(`${JSON.stringify({ id, exitCode, stdout })}\n`));
      return settled;
    }

    // 2 failures followed by 1 success -> resets consecutiveScriptFailures, does NOT recycle
    await sendAndRespond(mock1, 1, '{"success": false, "error": "bad input 1"}');
    expect(getDispatcherStatus().consecutiveScriptFailures).toBe(1);
    expect(getDispatcherStatus().running).toBe(true);

    await sendAndRespond(mock1, 0, '{"success": false, "error": "bad input 2"}');
    expect(getDispatcherStatus().consecutiveScriptFailures).toBe(2);
    expect(getDispatcherStatus().running).toBe(true);

    // Cooperative cancel ("error": "canceled") does not count as a failure
    await sendAndRespond(mock1, 0, '{"success": false, "error": "canceled"}');
    expect(getDispatcherStatus().consecutiveScriptFailures).toBe(2);
    expect(getDispatcherStatus().running).toBe(true);

    await sendAndRespond(mock1, 0, '{"success": true}');
    expect(getDispatcherStatus().consecutiveScriptFailures).toBe(0);
    expect(getDispatcherStatus().running).toBe(true);
    expect(getDispatcherStatus().lastRecycleReason).toBeNull();

    // Now 3 consecutive failures -> recycles on the 3rd without incrementing consecutiveCrashes
    await sendAndRespond(mock1, 1, '{"success": false, "error": "fail 1"}');
    expect(getDispatcherStatus().consecutiveScriptFailures).toBe(1);
    expect(getDispatcherStatus().running).toBe(true);

    await sendAndRespond(mock1, 1, '{"success": false, "error": "fail 2"}');
    expect(getDispatcherStatus().consecutiveScriptFailures).toBe(2);
    expect(getDispatcherStatus().running).toBe(true);

    await sendAndRespond(mock1, 1, '{"success": false, "error": "fail 3"}');
    const recycleEpipe = new Error("write EPIPE") as NodeJS.ErrnoException;
    recycleEpipe.code = "EPIPE";
    mock1.stdin.emit("error", recycleEpipe);
    const recycleEsrch = new Error("kill ESRCH") as NodeJS.ErrnoException;
    recycleEsrch.code = "ESRCH";
    mock1.emitEvent("error", recycleEsrch);
    mock1.emitEvent("close", null, "SIGTERM");

    const statusAfterRecycle = getDispatcherStatus();
    expect(statusAfterRecycle.running).toBe(false);
    expect(statusAfterRecycle.ready).toBe(false);
    expect(statusAfterRecycle.failed).toBe(false);
    expect(statusAfterRecycle.consecutiveCrashes).toBe(0);
    expect(statusAfterRecycle.consecutiveScriptFailures).toBe(3);
    expect(statusAfterRecycle.lastRecycleReason).toBe("consecutive_failures");
    expect(mock1.process.kill).toHaveBeenCalledWith("SIGTERM");
    expect(sink.error).not.toHaveBeenCalled();
  });

  it("records lastRecycleReason as max_requests when dispatcher shuts down at request limit", async () => {
    const { getDispatcherStatus, initDispatcher, shutdownDispatcher } = await import(
      "../../../packages/ai/src/bridge.js"
    );
    onTestFinished(() => shutdownDispatcher());

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);
    const ready = initDispatcher();
    mock.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await ready;

    mock.stderr.emit(
      "data",
      Buffer.from("[dispatcher] Reached max requests (50), shutting down for restart\n"),
    );
    mock.emitEvent("close", 0, null);

    const status = getDispatcherStatus();
    expect(status.running).toBe(false);
    expect(status.consecutiveCrashes).toBe(0);
    expect(status.lastRecycleReason).toBe("max_requests");
  });

  it("respects DISPATCHER_MAX_CONSECUTIVE_FAILURES env override and retries concurrent requests on recycle", async () => {
    process.env.DISPATCHER_MAX_CONSECUTIVE_FAILURES = "2";
    const {
      buildMinimalEnv,
      getDispatcherStatus,
      initDispatcher,
      runPythonWithProgress,
      shutdownDispatcher,
    } = await import("../../../packages/ai/src/bridge.js");
    onTestFinished(() => shutdownDispatcher());

    expect(buildMinimalEnv().DISPATCHER_MAX_CONSECUTIVE_FAILURES).toBe("2");

    const mockDisp = createMockProcess();
    const mockPerReq = createMockProcess();
    let spawnCalls = 0;
    vi.mocked(spawn).mockImplementation(() => {
      spawnCalls++;
      return spawnCalls === 1 ? mockDisp.process : mockPerReq.process;
    });

    const ready = initDispatcher();
    mockDisp.stderr.emit("data", Buffer.from('{"ready": true, "gpu": true}\n'));
    await ready;

    // Failure 1 (non-CUDA, non-JSON traceback) -> consecutiveScriptFailures = 1
    const p1 = runPythonWithProgress("test.py", []);
    const s1 = p1.catch((e: unknown) => e);
    await new Promise((r) => setTimeout(r, 10));
    const id1 = JSON.parse(mockDisp.stdinWrites[0].trim()).id;
    mockDisp.stderr.emit("data", Buffer.from("ValueError: bad frame\n"));
    mockDisp.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id: id1, exitCode: 1, stdout: "" })}\n`),
    );
    await s1;
    expect(getDispatcherStatus().consecutiveScriptFailures).toBe(1);
    expect(getDispatcherStatus().running).toBe(true);

    // Pre-exec gate refusal ("feature_not_installed") is ignored and preserves consecutiveScriptFailures = 1
    const pGate = runPythonWithProgress("test.py", []);
    const sGate = pGate.catch((e: unknown) => e);
    await new Promise((r) => setTimeout(r, 10));
    const idGate = JSON.parse(mockDisp.stdinWrites[1].trim()).id;
    mockDisp.stdout.emit(
      "data",
      Buffer.from(
        `${JSON.stringify({
          id: idGate,
          exitCode: 1,
          stdout: '{"success": false, "error": "feature_not_installed"}',
        })}\n`,
      ),
    );
    await sGate;
    expect(getDispatcherStatus().consecutiveScriptFailures).toBe(1);
    expect(getDispatcherStatus().running).toBe(true);

    // Enqueue 2 concurrent requests; the first hits failure #2 (reaching threshold=2),
    // which recycles the dispatcher and causes the second pending request to retry per-request.
    const pFail2 = runPythonWithProgress("test.py", []);
    const pConcurrent = runPythonWithProgress("other.py", []);
    const sFail2 = pFail2.catch((e: unknown) => e);
    await new Promise((r) => setTimeout(r, 10));

    const lines = mockDisp.stdinWrites.join("").split("\n").filter(Boolean);
    const idFail2 = JSON.parse(lines[2]).id;
    mockDisp.stdout.emit(
      "data",
      Buffer.from(
        `${JSON.stringify({ id: idFail2, exitCode: 1, stdout: '{"error": "second failure"}' })}\n`,
      ),
    );
    mockDisp.emitEvent("close", null, "SIGTERM");

    const err2 = (await sFail2) as Error;
    expect(err2.message).toBe("second failure");
    expect(getDispatcherStatus().lastRecycleReason).toBe("consecutive_failures");
    expect(getDispatcherStatus().consecutiveScriptFailures).toBe(2);

    await new Promise((r) => setTimeout(r, 10));
    mockPerReq.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockPerReq.emitEvent("close", 0, null);

    const concurrentRes = await pConcurrent;
    expect(concurrentRes.stdout).toBe('{"ok": true}');
    expect(concurrentRes.stderr).toContain("[bridge] retried after dispatcher crash");
  });

  it("tracks per-child failure threshold independently of cumulative consecutiveScriptFailures and ignores late close from recycled child", async () => {
    const { getDispatcherStatus, initDispatcher, runPythonWithProgress, shutdownDispatcher } =
      await import("../../../packages/ai/src/bridge.js");
    onTestFinished(() => shutdownDispatcher());

    const mockChild1 = createMockProcess();
    const mockChild2 = createMockProcess();
    let spawnCount = 0;
    vi.mocked(spawn).mockImplementation(() => {
      spawnCount++;
      return spawnCount === 1 ? mockChild1.process : mockChild2.process;
    });

    const ready1 = initDispatcher();
    mockChild1.stderr.emit("data", Buffer.from('{"ready": true, "gpu": true}\n'));
    await ready1;

    // 3 non-CUDA failures on Child 1 -> recycles Child 1 (consecutiveScriptFailures = 3)
    for (let i = 0; i < 3; i++) {
      const p = runPythonWithProgress("test.py", []);
      const s = p.catch((e: unknown) => e);
      await new Promise((r) => setTimeout(r, 10));
      const lines = mockChild1.stdinWrites.join("").split("\n").filter(Boolean);
      const { id } = JSON.parse(lines[lines.length - 1]);
      mockChild1.stdout.emit(
        "data",
        Buffer.from(`${JSON.stringify({ id, exitCode: 1, stdout: '{"error": "bad input"}' })}\n`),
      );
      await s;
    }

    expect(getDispatcherStatus().consecutiveScriptFailures).toBe(3);
    expect(getDispatcherStatus().lastRecycleReason).toBe("consecutive_failures");
    expect(getDispatcherStatus().running).toBe(false);

    // Spawn Child 2 BEFORE Child 1's SIGTERM close event arrives
    const ready2 = initDispatcher();
    mockChild2.stderr.emit("data", Buffer.from('{"ready": true, "gpu": true}\n'));
    await ready2;

    // Now Child 1's late close event arrives: must not null Child 2 or increment consecutiveCrashes
    mockChild1.emitEvent("close", null, "SIGTERM");
    expect(getDispatcherStatus().running).toBe(true);
    expect(getDispatcherStatus().ready).toBe(true);
    expect(getDispatcherStatus().consecutiveCrashes).toBe(0);

    // 1st non-CUDA failure on Child 2 increments cumulative consecutiveScriptFailures to 4,
    // but Child 2's own childScriptFailures is only 1 (< 3), so Child 2 stays running!
    const pChild2Fail1 = runPythonWithProgress("test.py", []);
    const sChild2Fail1 = pChild2Fail1.catch((e: unknown) => e);
    await new Promise((r) => setTimeout(r, 10));
    const idChild2Fail1 = JSON.parse(mockChild2.stdinWrites[0].trim()).id;
    mockChild2.stdout.emit(
      "data",
      Buffer.from(
        `${JSON.stringify({ id: idChild2Fail1, exitCode: 1, stdout: '{"error": "bad input 4"}' })}\n`,
      ),
    );
    await sChild2Fail1;

    expect(getDispatcherStatus().consecutiveScriptFailures).toBe(4);
    expect(getDispatcherStatus().running).toBe(true);
    expect(mockChild2.process.kill).not.toHaveBeenCalled();

    // CUDA poison on stderr with empty stdout on Child 2 immediately recycles Child 2
    const pChild2Cuda = runPythonWithProgress("test.py", []);
    const sChild2Cuda = pChild2Cuda.catch((e: unknown) => e);
    await new Promise((r) => setTimeout(r, 10));
    const idChild2Cuda = JSON.parse(mockChild2.stdinWrites[1].trim()).id;
    mockChild2.stderr.emit(
      "data",
      Buffer.from("RuntimeError: CUDA error: an illegal memory access was encountered\n"),
    );
    mockChild2.stdout.emit(
      "data",
      Buffer.from(`${JSON.stringify({ id: idChild2Cuda, exitCode: 1, stdout: "" })}\n`),
    );
    await sChild2Cuda;

    expect(getDispatcherStatus().consecutiveScriptFailures).toBe(5);
    expect(getDispatcherStatus().lastRecycleReason).toBe("cuda_error");
    expect(getDispatcherStatus().running).toBe(false);
    expect(mockChild2.process.kill).toHaveBeenCalledWith("SIGTERM");
  });
});

describe("bridge - dispatcherRun onAbort timeout vs cancel crash accounting (issue #3274)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("increments consecutiveCrashes when options.signal aborts with reason 'timeout' and keeps it at 0 on standard AbortError", async () => {
    const {
      getDispatcherStatus,
      getDocsDispatcher,
      initDispatcher,
      runDocsScript,
      runPythonWithProgress,
      shutdownDispatcher,
      shutdownDocsDispatcher,
    } = await import("../../../packages/ai/src/bridge.js");
    const { setAiLogger } = await import("../../../packages/ai/src/log.js");
    const sink = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    setAiLogger(sink);
    onTestFinished(async () => {
      setAiLogger(null);
      shutdownDispatcher();
      await shutdownDocsDispatcher();
    });

    // 1. Standard user cancel (5 consecutive cancels >= MAX_CONSECUTIVE_CRASHES across
    // default AbortError, string, null, and Error reasons) must NOT count as a crash
    for (const cancelReason of [
      undefined,
      "job canceled",
      null,
      new Error("user canceled"),
      "abort",
    ]) {
      const mockCancel = createMockProcess();
      vi.mocked(spawn).mockReturnValueOnce(mockCancel.process);
      const readyCancel = initDispatcher();
      mockCancel.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
      await readyCancel;

      const cancelAc = new AbortController();
      const cancelRun = runPythonWithProgress("test.py", [], { signal: cancelAc.signal });

      if (cancelReason === undefined) {
        cancelAc.abort();
      } else {
        cancelAc.abort(cancelReason);
      }
      await expect(cancelRun).rejects.toMatchObject({ name: "AbortError" });
      expect(mockCancel.process.kill).toHaveBeenCalledWith("SIGTERM");
      expect(getDispatcherStatus().running).toBe(false);
      expect(getDispatcherStatus().ready).toBe(false);

      const cancelEpipe = new Error("write EPIPE") as NodeJS.ErrnoException;
      cancelEpipe.code = "EPIPE";
      mockCancel.stdin.emit("error", cancelEpipe);
      const cancelEsrch = new Error("kill ESRCH") as NodeJS.ErrnoException;
      cancelEsrch.code = "ESRCH";
      mockCancel.emitEvent("error", cancelEsrch);
      mockCancel.emitEvent("close", null, "SIGTERM");
      expect(getDispatcherStatus().consecutiveCrashes).toBe(0);
      expect(getDispatcherStatus().failed).toBe(false);
      expect(sink.error).not.toHaveBeenCalled();
    }

    // 2. Pre-aborted timeout signal rejects before touching or killing a ready dispatcher
    const mockIdle = createMockProcess();
    vi.mocked(spawn).mockReturnValueOnce(mockIdle.process);
    const readyIdle = initDispatcher();
    mockIdle.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await readyIdle;

    const preAbortedAc = new AbortController();
    preAbortedAc.abort("timeout");
    await expect(
      runPythonWithProgress("test.py", [], { signal: preAbortedAc.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mockIdle.process.kill).not.toHaveBeenCalled();
    expect(getDispatcherStatus().running).toBe(true);
    expect(getDispatcherStatus().ready).toBe(true);
    expect(getDispatcherStatus().consecutiveCrashes).toBe(0);

    // 3. Worker deadline abort (ac.abort("timeout")) on that ready dispatcher MUST count
    // as a crash when the child closes, even if a sibling request is user-canceled
    // before the SIGTERMed process finishes closing.
    const timeoutAc = new AbortController();
    const siblingCancelAc = new AbortController();
    const timeoutRun = runPythonWithProgress("test.py", [], { signal: timeoutAc.signal });
    const siblingCancelRun = runPythonWithProgress("sibling.py", [], {
      signal: siblingCancelAc.signal,
    });

    timeoutAc.abort("timeout");
    await expect(timeoutRun).rejects.toMatchObject({ name: "AbortError" });
    expect(mockIdle.process.kill).toHaveBeenCalledWith("SIGTERM");
    expect(getDispatcherStatus().running).toBe(false);
    expect(getDispatcherStatus().ready).toBe(false);

    // Sibling request aborts with a non-timeout user cancel before close fires
    siblingCancelAc.abort("job canceled");
    await expect(siblingCancelRun).rejects.toMatchObject({ name: "AbortError" });

    mockIdle.emitEvent("close", null, "SIGTERM");
    expect(getDispatcherStatus().consecutiveCrashes).toBe(1);

    // 4. TimeoutError reason (e.g. AbortSignal.timeout / DOMException TimeoutError) on docsDispatcher also counts as a crash
    const mockDocsTimeout = createMockProcess();
    vi.mocked(spawn).mockReturnValueOnce(mockDocsTimeout.process);
    const readyDocs = getDocsDispatcher().init();
    mockDocsTimeout.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await readyDocs;

    const docsTimeoutAc = new AbortController();
    const docsTimeoutRun = runDocsScript(
      "doc_pagecount",
      { path: "/tmp/in.pdf" },
      { signal: docsTimeoutAc.signal },
    );

    docsTimeoutAc.abort(
      new DOMException("The operation was aborted due to timeout", "TimeoutError"),
    );
    await expect(docsTimeoutRun).rejects.toMatchObject({ name: "AbortError" });
    expect(mockDocsTimeout.process.kill).toHaveBeenCalledWith("SIGTERM");

    mockDocsTimeout.emitEvent("close", null, "SIGTERM");
    expect(getDocsDispatcher().getStatus().consecutiveCrashes).toBe(1);
  });

  it("arms crash backoff and retries sibling pending requests when a deadline abort kills the dispatcher", async () => {
    vi.useFakeTimers();
    const { getDispatcherStatus, initDispatcher, runPythonWithProgress, shutdownDispatcher } =
      await import("../../../packages/ai/src/bridge.js");
    onTestFinished(() => {
      shutdownDispatcher();
      vi.useRealTimers();
    });

    const mockDisp = createMockProcess();
    const mockSiblingFallback = createMockProcess();
    const mockBackoffFallback = createMockProcess();
    vi.mocked(spawn)
      .mockReturnValueOnce(mockDisp.process)
      .mockReturnValueOnce(mockSiblingFallback.process)
      .mockReturnValueOnce(mockBackoffFallback.process);

    const ready = initDispatcher();
    mockDisp.stderr.emit("data", Buffer.from('{"ready": true, "gpu": false}\n'));
    await vi.advanceTimersByTimeAsync(60);
    await ready;

    const ac = new AbortController();
    const timedOutRun = runPythonWithProgress("hung.py", [], { signal: ac.signal });
    const siblingRun = runPythonWithProgress("sibling.py", []);
    const settledTimedOut = timedOutRun.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10);

    ac.abort("timeout");
    await expect(settledTimedOut).resolves.toMatchObject({ name: "AbortError" });
    mockDisp.emitEvent("close", null, "SIGTERM");

    expect(getDispatcherStatus().consecutiveCrashes).toBe(1);

    // Sibling request in the same generation retries via runPerRequest
    await vi.advanceTimersByTimeAsync(10);
    mockSiblingFallback.stdout.emit("data", Buffer.from('{"sibling": true}\n'));
    mockSiblingFallback.emitEvent("close", 0, null);
    await expect(siblingRun).resolves.toMatchObject({ stdout: '{"sibling": true}' });

    // During the 1000ms crash backoff window, a subsequent request skips spawning
    // a new dispatcher and goes straight to runPerRequest (only 1 new spawn).
    vi.advanceTimersByTime(500);
    const spawnCallsBefore = vi.mocked(spawn).mock.calls.length;
    const duringBackoffRun = runPythonWithProgress("fast.py", []);
    await vi.advanceTimersByTimeAsync(10);
    mockBackoffFallback.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mockBackoffFallback.emitEvent("close", 0, null);
    await expect(duringBackoffRun).resolves.toMatchObject({ stdout: '{"ok": true}' });
    expect(vi.mocked(spawn).mock.calls.length - spawnCallsBefore).toBe(1);
  });
});
