import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

interface MockProcess {
  process: ChildProcess;
  stdinWrites: string[];
  stdout: EventEmitter;
  stderr: EventEmitter;
  emit: (event: string, ...args: unknown[]) => void;
}

function createMockProcess(): MockProcess {
  const stdinWrites: string[] = [];
  const stdin = new Writable({
    write(chunk, _encoding, callback) {
      stdinWrites.push(chunk.toString());
      callback();
    },
  });
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const process = new EventEmitter() as unknown as ChildProcess;
  Object.assign(process, {
    stdin,
    stdout,
    stderr,
    pid: 12345,
    killed: false,
    kill: vi.fn(() => {
      (process as { killed: boolean }).killed = true;
      return true;
    }),
  });
  return {
    process,
    stdinWrites,
    stdout,
    stderr,
    emit: (event, ...args) => process.emit(event, ...args),
  };
}

describe("Python bridge cancellation", () => {
  let shutdownDispatcher: (() => void) | undefined;

  beforeEach(() => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();
    delete process.env.PROCESSING_TIMEOUT_S;
  });

  afterEach(() => {
    shutdownDispatcher?.();
    shutdownDispatcher = undefined;
    delete process.env.PROCESSING_TIMEOUT_S;
    vi.restoreAllMocks();
  });

  it("aborts and terminates a per-request Python process even when timeouts are unlimited", async () => {
    process.env.PROCESSING_TIMEOUT_S = "0";
    const dispatcher = createMockProcess();
    const request = createMockProcess();
    vi.mocked(spawn).mockReturnValueOnce(dispatcher.process).mockReturnValueOnce(request.process);

    const bridge = await import("../../../packages/ai/src/bridge.js");
    shutdownDispatcher = bridge.shutdownDispatcher;
    const controller = new AbortController();
    const result = bridge.runPythonWithProgress("test.py", [], { signal: controller.signal });

    controller.abort("job canceled");
    request.stdout.emit("data", Buffer.from('{"success":true}\n'));
    request.emit("close", 0, null);

    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(request.process.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("aborts a dispatcher request, kills that dispatcher, and ignores its stale response", async () => {
    const dispatcher = createMockProcess();
    vi.mocked(spawn).mockReturnValue(dispatcher.process);

    const bridge = await import("../../../packages/ai/src/bridge.js");
    shutdownDispatcher = bridge.shutdownDispatcher;
    const ready = bridge.initDispatcher();
    dispatcher.stderr.emit("data", Buffer.from('{"ready":true,"gpu":false}\n'));
    await ready;

    const controller = new AbortController();
    const result = bridge.runPythonWithProgress("test.py", [], { signal: controller.signal });
    const request = JSON.parse(dispatcher.stdinWrites.at(-1) ?? "{}") as { id?: string };

    controller.abort("job canceled");
    dispatcher.stdout.emit(
      "data",
      Buffer.from(
        `${JSON.stringify({ id: request.id, exitCode: 0, stdout: '{"success":true}' })}\n`,
      ),
    );

    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(dispatcher.process.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("terminates only the active ENOENT fallback attempt when cancellation races startup", async () => {
    const dispatcher = createMockProcess();
    const missingVenvPython = createMockProcess();
    const fallbackPython = createMockProcess();
    vi.mocked(spawn)
      .mockReturnValueOnce(dispatcher.process)
      .mockReturnValueOnce(missingVenvPython.process)
      .mockReturnValueOnce(fallbackPython.process);

    const bridge = await import("../../../packages/ai/src/bridge.js");
    shutdownDispatcher = bridge.shutdownDispatcher;
    const controller = new AbortController();
    const result = bridge.runPythonWithProgress("test.py", [], { signal: controller.signal });

    const enoent = Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" });
    missingVenvPython.emit("error", enoent);
    controller.abort("job canceled");
    fallbackPython.stdout.emit("data", Buffer.from('{"success":true}\n'));
    fallbackPython.emit("close", 0, null);
    missingVenvPython.emit("close", null, "SIGTERM");

    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(fallbackPython.process.kill).toHaveBeenCalledWith("SIGTERM");
    expect(missingVenvPython.process.kill).not.toHaveBeenCalled();
  });
});
