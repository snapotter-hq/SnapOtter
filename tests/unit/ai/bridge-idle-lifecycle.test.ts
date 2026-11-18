import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

interface MockProcess {
  process: ChildProcess;
  stdinWrites: string[];
  stdinEnded: ReturnType<typeof vi.fn>;
  stdout: EventEmitter;
  stderr: EventEmitter;
  ready: () => void;
  respond: (index: number, stdout?: string) => void;
  exit: (code?: number | null, signal?: NodeJS.Signals | null) => void;
}

let nextPid = 7000;

function createMockProcess(): MockProcess {
  const stdinWrites: string[] = [];
  const stdinEnded = vi.fn();
  const stdin = new Writable({
    write(chunk, _encoding, callback) {
      stdinWrites.push(chunk.toString());
      callback();
    },
  });
  stdin.on("finish", stdinEnded);
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const proc = new EventEmitter() as unknown as ChildProcess;
  Object.assign(proc, {
    stdin,
    stdout,
    stderr,
    pid: nextPid++,
    killed: false,
    kill: vi.fn(() => {
      (proc as { killed: boolean }).killed = true;
      return true;
    }),
  });
  const requests = () =>
    stdinWrites
      .join("")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { id: string });
  return {
    process: proc,
    stdinWrites,
    stdinEnded,
    stdout,
    stderr,
    ready: () => stderr.emit("data", Buffer.from('{"ready":true,"gpu":false}\n')),
    respond: (index, out = '{"success":true}') =>
      stdout.emit(
        "data",
        Buffer.from(`${JSON.stringify({ id: requests()[index]?.id, exitCode: 0, stdout: out })}\n`),
      ),
    exit: (code = 0, signal = null) => proc.emit("close", code, signal),
  };
}

type Bridge = typeof import("../../../packages/ai/src/bridge.js");

describe("AI dispatcher lazy start and idle exit", () => {
  let bridge: Bridge;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();
    vi.useFakeTimers();
    vi.stubEnv("AI_SIDECAR_IDLE_TIMEOUT", "60");
    vi.stubEnv("PROCESSING_TIMEOUT_S", "0");
    bridge = await import("../../../packages/ai/src/bridge.js");
    bridge.enableLazyAiDispatcher();
  });

  afterEach(() => {
    bridge.shutdownDispatcher();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("does not spawn anything until the first request", () => {
    expect(spawn).not.toHaveBeenCalled();
    expect(bridge.getDispatcherStatus()).toMatchObject({ running: false, ready: false });
  });

  it("spawns on first use, waits for readiness, and serves the request from that child", async () => {
    const child = createMockProcess();
    vi.mocked(spawn).mockReturnValue(child.process);

    const result = bridge.runPythonWithProgress("test.py", []);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(child.stdinWrites).toHaveLength(0);

    child.ready();
    await vi.advanceTimersByTimeAsync(60);
    expect(child.stdinWrites).toHaveLength(1);
    child.respond(0);

    await expect(result).resolves.toMatchObject({ stdout: '{"success":true}' });
    // One interpreter only: no per-request fallback process was started.
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("shares one start between concurrent first requests", async () => {
    const child = createMockProcess();
    vi.mocked(spawn).mockReturnValue(child.process);

    const a = bridge.runPythonWithProgress("a.py", []);
    const b = bridge.runPythonWithProgress("b.py", []);
    child.ready();
    await vi.advanceTimersByTimeAsync(60);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(child.stdinWrites.join("").split("\n").filter(Boolean)).toHaveLength(2);
    child.respond(0);
    child.respond(1);
    await expect(Promise.all([a, b])).resolves.toHaveLength(2);
  });

  it("exits the child after the idle window and respawns on the next request", async () => {
    const first = createMockProcess();
    vi.mocked(spawn).mockReturnValueOnce(first.process);
    const run1 = bridge.runPythonWithProgress("test.py", []);
    first.ready();
    await vi.advanceTimersByTimeAsync(60);
    first.respond(0);
    await run1;

    await vi.advanceTimersByTimeAsync(59_000);
    expect(first.process.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(first.process.kill).toHaveBeenCalledWith("SIGTERM");
    expect(first.stdinEnded).toHaveBeenCalled();
    expect(bridge.getDispatcherStatus()).toMatchObject({ running: false, ready: false });
    first.exit(null, "SIGTERM");
    // A deliberate exit is not a crash.
    expect(bridge.getDispatcherStatus().consecutiveCrashes).toBe(0);
    expect(bridge.getDispatcherStatus().failed).toBe(false);

    const second = createMockProcess();
    vi.mocked(spawn).mockReturnValueOnce(second.process);
    const run2 = bridge.runPythonWithProgress("test.py", []);
    second.ready();
    await vi.advanceTimersByTimeAsync(60);
    second.respond(0, '{"again":true}');
    await expect(run2).resolves.toMatchObject({ stdout: '{"again":true}' });
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it("a request during the exit window gets a fresh child, not the stopping one", async () => {
    const first = createMockProcess();
    vi.mocked(spawn).mockReturnValueOnce(first.process);
    const run1 = bridge.runPythonWithProgress("test.py", []);
    first.ready();
    await vi.advanceTimersByTimeAsync(60);
    first.respond(0);
    await run1;

    await vi.advanceTimersByTimeAsync(60_500);
    expect(first.process.kill).toHaveBeenCalledWith("SIGTERM");

    // The old child has not closed yet.
    const second = createMockProcess();
    vi.mocked(spawn).mockReturnValueOnce(second.process);
    const racing = bridge.runPythonWithProgress("test.py", []);
    second.ready();
    await vi.advanceTimersByTimeAsync(60);
    expect(first.stdinWrites.join("").split("\n").filter(Boolean)).toHaveLength(1);
    expect(second.stdinWrites.join("").split("\n").filter(Boolean)).toHaveLength(1);
    second.respond(0, '{"raced":true}');
    await expect(racing).resolves.toMatchObject({ stdout: '{"raced":true}' });

    // The stale child's late close must not take the fresh one down.
    first.exit(null, "SIGTERM");
    expect(bridge.getDispatcherStatus()).toMatchObject({ running: true, ready: true });
    expect(bridge.getDispatcherStatus().consecutiveCrashes).toBe(0);
  });

  it("does not exit while a request is in flight", async () => {
    const child = createMockProcess();
    vi.mocked(spawn).mockReturnValueOnce(child.process);
    const run = bridge.runPythonWithProgress("slow.py", []);
    child.ready();
    await vi.advanceTimersByTimeAsync(60);

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(child.process.kill).not.toHaveBeenCalled();
    child.respond(0);
    await run;

    // The idle window restarts when the last request settles.
    await vi.advanceTimersByTimeAsync(59_000);
    expect(child.process.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(child.process.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("a request resets the idle window", async () => {
    const child = createMockProcess();
    vi.mocked(spawn).mockReturnValueOnce(child.process);
    const run1 = bridge.runPythonWithProgress("test.py", []);
    child.ready();
    await vi.advanceTimersByTimeAsync(60);
    child.respond(0);
    await run1;

    await vi.advanceTimersByTimeAsync(50_000);
    const run2 = bridge.runPythonWithProgress("test.py", []);
    await vi.advanceTimersByTimeAsync(0);
    child.respond(1);
    await run2;

    await vi.advanceTimersByTimeAsync(50_000);
    expect(child.process.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(11_000);
    expect(child.process.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("keeps the child for good when AI_SIDECAR_IDLE_TIMEOUT is 0", async () => {
    vi.stubEnv("AI_SIDECAR_IDLE_TIMEOUT", "0");
    const child = createMockProcess();
    vi.mocked(spawn).mockReturnValueOnce(child.process);
    const run = bridge.runPythonWithProgress("test.py", []);
    child.ready();
    await vi.advanceTimersByTimeAsync(60);
    child.respond(0);
    await run;

    await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
    expect(child.process.kill).not.toHaveBeenCalled();
    expect(bridge.getDispatcherStatus()).toMatchObject({ running: true, ready: true });
  });

  it("keeps the GPU probe across an idle exit", async () => {
    const child = createMockProcess();
    vi.mocked(spawn).mockReturnValueOnce(child.process);
    const run = bridge.runPythonWithProgress("test.py", []);
    child.stderr.emit("data", Buffer.from('{"ready":true,"gpu":true}\n'));
    await vi.advanceTimersByTimeAsync(60);
    child.respond(0);
    await run;
    expect(bridge.isGpuAvailable()).toBe(true);

    await vi.advanceTimersByTimeAsync(61_000);
    expect(child.process.kill).toHaveBeenCalled();
    expect(bridge.isGpuAvailable()).toBe(true);
  });

  it("stops waiting for the first start when the caller aborts", async () => {
    const child = createMockProcess();
    vi.mocked(spawn).mockReturnValueOnce(child.process);
    const controller = new AbortController();
    const run = bridge.runPythonWithProgress("test.py", [], { signal: controller.signal });
    controller.abort("job canceled");
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(child.stdinWrites).toHaveLength(0);
  });
});

describe("docs dispatcher lazy start and idle exit", () => {
  let bridge: Bridge;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();
    vi.useFakeTimers();
    vi.stubEnv("AI_SIDECAR_IDLE_TIMEOUT", "60");
    vi.stubEnv("PROCESSING_TIMEOUT_S", "0");
    bridge = await import("../../../packages/ai/src/bridge.js");
    bridge.enableLazyDocsDispatcher();
  });

  afterEach(async () => {
    await bridge.shutdownDocsDispatcher();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("does not spawn anything until the first request", () => {
    expect(spawn).not.toHaveBeenCalled();
    expect(bridge.getDocsDispatcher().getStatus()).toMatchObject({ running: false, ready: false });
  });

  it("waits for the first start instead of spawning a per-request interpreter", async () => {
    const child = createMockProcess();
    vi.mocked(spawn).mockReturnValue(child.process);

    const result = bridge.runDocsScript("pdf_info", { path: "/tmp/a.pdf" });
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(child.stdinWrites).toHaveLength(0);

    child.ready();
    await vi.advanceTimersByTimeAsync(60);
    expect(child.stdinWrites).toHaveLength(1);
    child.respond(0, '{"pages":1}');

    await expect(result).resolves.toBe('{"pages":1}');
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("exits the child after the idle window and respawns on the next request", async () => {
    const first = createMockProcess();
    vi.mocked(spawn).mockReturnValueOnce(first.process);
    const run1 = bridge.runDocsScript("pdf_info", {});
    first.ready();
    await vi.advanceTimersByTimeAsync(60);
    first.respond(0);
    await run1;

    await vi.advanceTimersByTimeAsync(59_000);
    expect(first.process.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(first.process.kill).toHaveBeenCalledWith("SIGTERM");
    expect(bridge.getDocsDispatcher().getStatus()).toMatchObject({ running: false, ready: false });
    first.exit(null, "SIGTERM");
    expect(bridge.getDocsDispatcher().getStatus().consecutiveCrashes).toBe(0);

    const second = createMockProcess();
    vi.mocked(spawn).mockReturnValueOnce(second.process);
    const run2 = bridge.runDocsScript("pdf_info", {});
    second.ready();
    await vi.advanceTimersByTimeAsync(60);
    second.respond(0, '{"again":true}');
    await expect(run2).resolves.toBe('{"again":true}');
    expect(spawn).toHaveBeenCalledTimes(2);
  });
});
