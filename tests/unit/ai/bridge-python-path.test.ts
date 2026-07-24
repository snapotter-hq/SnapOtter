import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

const ORIGINAL_PLATFORM = Object.getOwnPropertyDescriptor(process, "platform");
const ORIGINAL_VENV_PATH = process.env.PYTHON_VENV_PATH;

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { configurable: true, value: platform });
}

function createMockProcess(): {
  process: ChildProcess;
  stderr: EventEmitter;
} {
  const stdin = new Writable({
    write(_chunk, _encoding, callback) {
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
    kill: vi.fn(() => true),
  });
  return { process, stderr };
}

async function dispatcherExecutable(): Promise<string> {
  const child = createMockProcess();
  vi.mocked(spawn).mockReturnValue(child.process);

  const { PythonDispatcher } = await import("../../../packages/ai/src/bridge.js");
  const dispatcher = new PythonDispatcher({ profile: "docs" });
  const initialized = dispatcher.init(500);
  child.stderr.emit("data", Buffer.from('{"ready":true,"gpu":false}\n'));
  await expect(initialized).resolves.toEqual({ ready: true, gpu: false });

  const executable = vi.mocked(spawn).mock.calls[0]?.[0];
  dispatcher.shutdown();
  expect(typeof executable).toBe("string");
  return executable as string;
}

describe("bridge Python interpreter selection", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();
    vi.mocked(existsSync).mockReset();
    delete process.env.PYTHON_VENV_PATH;
  });

  afterEach(() => {
    if (ORIGINAL_PLATFORM) Object.defineProperty(process, "platform", ORIGINAL_PLATFORM);
    if (ORIGINAL_VENV_PATH === undefined) delete process.env.PYTHON_VENV_PATH;
    else process.env.PYTHON_VENV_PATH = ORIGINAL_VENV_PATH;
  });

  it("selects an existing Unix venv interpreter", async () => {
    setPlatform("linux");
    process.env.PYTHON_VENV_PATH = "/custom/venv";
    vi.mocked(existsSync).mockImplementation((path) => path === "/custom/venv/bin/python3");

    await expect(dispatcherExecutable()).resolves.toBe("/custom/venv/bin/python3");
  });

  it("selects python3 directly when the Unix venv interpreter is missing", async () => {
    setPlatform("linux");
    process.env.PYTHON_VENV_PATH = "/missing/venv";
    vi.mocked(existsSync).mockReturnValue(false);

    await expect(dispatcherExecutable()).resolves.toBe("python3");
  });

  it("selects an existing Windows venv interpreter", async () => {
    setPlatform("win32");
    process.env.PYTHON_VENV_PATH = "C:\\custom\\venv";
    vi.mocked(existsSync).mockImplementation(
      (path) => path === "C:\\custom\\venv\\Scripts\\python.exe",
    );

    await expect(dispatcherExecutable()).resolves.toBe("C:\\custom\\venv\\Scripts\\python.exe");
  });

  it("selects python directly when the Windows venv interpreter is missing", async () => {
    setPlatform("win32");
    process.env.PYTHON_VENV_PATH = "C:\\missing\\venv";
    vi.mocked(existsSync).mockReturnValue(false);

    await expect(dispatcherExecutable()).resolves.toBe("python");
  });
});
