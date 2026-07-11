import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

vi.mock("sharp", () => ({
  default: vi.fn(),
}));

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

describe("buildMinimalEnv - env passthrough", () => {
  let runPythonWithProgress: (
    scriptName: string,
    args: string[],
    options?: { onProgress?: (p: number, s: string) => void; timeout?: number },
  ) => Promise<{ stdout: string; stderr: string }>;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("../../../packages/ai/src/bridge.js");
    runPythonWithProgress = mod.runPythonWithProgress;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DATA_DIR;
    delete process.env.SNAPOTTER_GPU;
    delete process.env.MODELS_PATH;
    delete process.env.MODELS_DIR;
  });

  function getSpawnEnv(): Record<string, string> | undefined {
    const allCalls = vi.mocked(spawn).mock.calls;
    const lastCall = allCalls[allCalls.length - 1];
    return (lastCall?.[2] as { env?: Record<string, string> })?.env;
  }

  it("passes SNAPOTTER_GPU to Python subprocess", async () => {
    process.env.SNAPOTTER_GPU = "1";

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test.py", []);
    mock.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mock.emitEvent("close", 0, null);
    await promise;

    const env = getSpawnEnv();
    expect(env).toBeDefined();
    expect(env?.SNAPOTTER_GPU).toBe("1");
  });

  it("passes MODELS_PATH to Python subprocess", async () => {
    process.env.MODELS_PATH = "/data/ai/models";

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test.py", []);
    mock.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mock.emitEvent("close", 0, null);
    await promise;

    const env = getSpawnEnv();
    expect(env).toBeDefined();
    expect(env?.MODELS_PATH).toBe("/data/ai/models");
  });

  it("sets matching native DATA_DIR and MODELS_PATH defaults", async () => {
    delete process.env.DATA_DIR;
    delete process.env.MODELS_PATH;

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test.py", []);
    mock.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mock.emitEvent("close", 0, null);
    await promise;

    const env = getSpawnEnv();
    expect(env).toBeDefined();
    expect(env?.DATA_DIR).toBe("./data");
    expect(env?.MODELS_PATH).toBe("./data/ai/models");
  });

  it("does not pass MODELS_DIR (removed dead entry)", async () => {
    process.env.MODELS_DIR = "/some/path";

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test.py", []);
    mock.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mock.emitEvent("close", 0, null);
    await promise;

    const env = getSpawnEnv();
    expect(env).toBeDefined();
    expect(env?.MODELS_DIR).toBeUndefined();
  });

  it("does not include SNAPOTTER_GPU when not set in parent env", async () => {
    delete process.env.SNAPOTTER_GPU;

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test.py", []);
    mock.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mock.emitEvent("close", 0, null);
    await promise;

    const env = getSpawnEnv();
    expect(env).toBeDefined();
    expect(env?.SNAPOTTER_GPU).toBeUndefined();
  });

  it("always includes PYTHONUNBUFFERED=1", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test.py", []);
    mock.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mock.emitEvent("close", 0, null);
    await promise;

    const env = getSpawnEnv();
    expect(env).toBeDefined();
    expect(env?.PYTHONUNBUFFERED).toBe("1");
  });

  it("passes LD_LIBRARY_PATH when set", async () => {
    process.env.LD_LIBRARY_PATH = "/usr/local/nvidia/lib64";

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test.py", []);
    mock.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mock.emitEvent("close", 0, null);
    await promise;

    const env = getSpawnEnv();
    expect(env?.LD_LIBRARY_PATH).toBe("/usr/local/nvidia/lib64");

    delete process.env.LD_LIBRARY_PATH;
  });

  it("passes CUDA_VISIBLE_DEVICES when set", async () => {
    process.env.CUDA_VISIBLE_DEVICES = "0,1";

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test.py", []);
    mock.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mock.emitEvent("close", 0, null);
    await promise;

    const env = getSpawnEnv();
    expect(env?.CUDA_VISIBLE_DEVICES).toBe("0,1");

    delete process.env.CUDA_VISIBLE_DEVICES;
  });

  it("does not leak unrelated env vars to Python subprocess", async () => {
    process.env.SECRET_API_KEY = "should-not-leak";
    process.env.DATABASE_URL = "sqlite://secret.db";

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test.py", []);
    mock.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mock.emitEvent("close", 0, null);
    await promise;

    const env = getSpawnEnv();
    expect(env?.SECRET_API_KEY).toBeUndefined();
    expect(env?.DATABASE_URL).toBeUndefined();

    delete process.env.SECRET_API_KEY;
    delete process.env.DATABASE_URL;
  });
});
