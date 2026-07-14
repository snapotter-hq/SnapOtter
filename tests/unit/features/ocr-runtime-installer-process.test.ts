import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

const childProcessMocks = vi.hoisted(() => ({
  execFileAsync: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock("node:child_process", () => {
  const execFile = vi.fn();
  Object.defineProperty(execFile, Symbol.for("nodejs.util.promisify.custom"), {
    value: childProcessMocks.execFileAsync,
  });
  return { execFile, spawn: childProcessMocks.spawn };
});

import {
  type DownloadedOcrRuntimeRelease,
  runOcrRuntimeInstaller,
  runOcrRuntimeMaintenance,
  waitWithOcrRuntimeHeartbeat,
} from "../../../apps/api/src/lib/ocr-runtime-install.js";

const spawnMock = childProcessMocks.spawn;

interface MockInstallerChild {
  process: ChildProcessWithoutNullStreams;
  stdout: PassThrough;
  stderr: PassThrough;
  kill: ReturnType<typeof vi.fn>;
  error: (error: Error) => void;
  close: (code: number | null, signal?: NodeJS.Signals | null) => void;
}

function createChild(): MockInstallerChild {
  const child = new EventEmitter() as ChildProcessWithoutNullStreams;
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const kill = vi.fn(() => true);
  Object.assign(child, { stdout, stderr, kill, pid: 42_001 });
  return {
    process: child,
    stdout,
    stderr,
    kill,
    error: (error) => child.emit("error", error),
    close: (code, signal = null) => child.emit("close", code, signal),
  };
}

function release(): DownloadedOcrRuntimeRelease {
  return {
    artifact: { target: "linux-amd64-cpu-py312" },
    canonicalIndex: Buffer.from("{}\n"),
    archiveFile: "ocr-linux-amd64-cpu-py312.tar.gz",
    archiveSha256: "a".repeat(64),
    archiveSize: 1,
    archiveExpandedSize: 1,
    indexPath: "/data/ai/v3/downloads/index.json",
    archivePath: "/data/ai/v3/downloads/archive.tar.gz",
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  childProcessMocks.execFileAsync.mockReset();
  spawnMock.mockReset();
});

describe("runOcrRuntimeInstaller process ownership", () => {
  it("keeps a quiet activation visibly alive and clears its timer", async () => {
    vi.useFakeTimers();
    let finish: ((value: string) => void) | undefined;
    const heartbeat = vi.fn();
    const operation = new Promise<string>((resolve) => {
      finish = resolve;
    });

    const pending = waitWithOcrRuntimeHeartbeat(operation, heartbeat);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(heartbeat).toHaveBeenCalledTimes(1);
    finish?.("activated");

    await expect(pending).resolves.toBe("activated");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("accepts one bounded structured result", async () => {
    const child = createChild();
    spawnMock.mockReturnValue(child.process);
    const resultPromise = runOcrRuntimeInstaller({
      release: release(),
      aiDataDir: "/data/ai",
    });

    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ detached: process.platform !== "win32" }),
    );

    child.stdout.end('{"family":"ocr","generation":"generation-a"}\n');
    child.close(0);

    await expect(resultPromise).resolves.toMatchObject({
      family: "ocr",
      generation: "generation-a",
    });
  });

  it("inherits the authoritative install lease into the runtime mutator", async () => {
    const child = createChild();
    spawnMock.mockReturnValue(child.process);
    const resultPromise = runOcrRuntimeInstaller({
      release: release(),
      aiDataDir: "/data/ai",
      installLockFd: 47,
    });

    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ stdio: ["ignore", "pipe", "pipe", 47] }),
    );
    child.stdout.end('{"family":"ocr","generation":"generation-with-lease"}\n');
    child.close(0);
    await expect(resultPromise).resolves.toMatchObject({ generation: "generation-with-lease" });
  });

  it("terminates output flooding and retains ownership through group escalation", async () => {
    vi.useFakeTimers();
    const child = createChild();
    spawnMock.mockReturnValue(child.process);
    const killProcessGroup = vi.spyOn(process, "kill").mockReturnValue(true);
    let settled = false;
    const resultPromise = runOcrRuntimeInstaller({
      release: release(),
      aiDataDir: "/data/ai",
    }).finally(() => {
      settled = true;
    });
    const rejection = expect(resultPromise).rejects.toThrow("stdout exceeded 65536 bytes");

    child.stdout.write(Buffer.alloc(65_537, 0x61));
    await vi.advanceTimersByTimeAsync(0);
    expect(killProcessGroup).toHaveBeenCalledWith(-42_001, "SIGTERM");
    expect(child.kill).not.toHaveBeenCalled();
    expect(settled).toBe(false);

    child.close(null, "SIGTERM");
    expect(killProcessGroup).toHaveBeenNthCalledWith(2, -42_001, "SIGKILL");
    await rejection;
  });

  it("escalates a timed-out installer and retains ownership until close", async () => {
    vi.useFakeTimers();
    const child = createChild();
    spawnMock.mockReturnValue(child.process);
    const killProcessGroup = vi.spyOn(process, "kill").mockReturnValue(true);
    let settled = false;
    const resultPromise = runOcrRuntimeInstaller({
      release: release(),
      aiDataDir: "/data/ai",
      timeoutMs: 10,
    }).finally(() => {
      settled = true;
    });
    const rejection = expect(resultPromise).rejects.toThrow("timed out after 10ms");

    await vi.advanceTimersByTimeAsync(10);
    expect(killProcessGroup).toHaveBeenNthCalledWith(1, -42_001, "SIGTERM");
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(killProcessGroup).toHaveBeenNthCalledWith(2, -42_001, "SIGKILL");
    expect(child.kill).not.toHaveBeenCalled();
    expect(settled).toBe(false);

    child.close(null, "SIGKILL");
    await rejection;
  });

  it("accepts zero to disable the installer deadline", async () => {
    vi.useFakeTimers();
    const child = createChild();
    spawnMock.mockReturnValue(child.process);
    const resultPromise = runOcrRuntimeInstaller({
      release: release(),
      aiDataDir: "/data/ai",
      timeoutMs: 0,
    });

    await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
    expect(child.kill).not.toHaveBeenCalled();
    child.stdout.end('{"family":"ocr","generation":"generation-no-deadline"}\n');
    child.close(0);
    await expect(resultPromise).resolves.toMatchObject({
      generation: "generation-no-deadline",
    });
  });

  it("does not release ownership when signaling emits an error before close", async () => {
    vi.useFakeTimers();
    const child = createChild();
    spawnMock.mockReturnValue(child.process);
    const killProcessGroup = vi.spyOn(process, "kill").mockReturnValue(true);
    let settled = false;
    const resultPromise = runOcrRuntimeInstaller({
      release: release(),
      aiDataDir: "/data/ai",
      timeoutMs: 10,
    }).finally(() => {
      settled = true;
    });
    const rejection = expect(resultPromise).rejects.toThrow("timed out after 10ms");

    await vi.advanceTimersByTimeAsync(10);
    child.error(Object.assign(new Error("kill ESRCH"), { code: "ESRCH" }));
    await Promise.resolve();
    expect(settled).toBe(false);

    child.close(null, "SIGTERM");
    expect(killProcessGroup).toHaveBeenNthCalledWith(2, -42_001, "SIGKILL");
    await rejection;
  });

  it("terminates the installer process group when the caller aborts", async () => {
    vi.useFakeTimers();
    const child = createChild();
    spawnMock.mockReturnValue(child.process);
    const killProcessGroup = vi.spyOn(process, "kill").mockReturnValue(true);
    const controller = new AbortController();
    let settled = false;
    const resultPromise = runOcrRuntimeInstaller({
      release: release(),
      aiDataDir: "/data/ai",
      signal: controller.signal,
    }).finally(() => {
      settled = true;
    });
    const rejection = expect(resultPromise).rejects.toThrow("operator canceled");

    controller.abort(new Error("operator canceled"));
    await vi.advanceTimersByTimeAsync(0);
    expect(killProcessGroup).toHaveBeenCalledWith(-42_001, "SIGTERM");
    expect(child.kill).not.toHaveBeenCalled();
    expect(settled).toBe(false);

    child.close(null, "SIGTERM");
    expect(killProcessGroup).toHaveBeenNthCalledWith(2, -42_001, "SIGKILL");
    await rejection;
  });

  it("kills possible descendants when the installer exits unexpectedly", async () => {
    const child = createChild();
    spawnMock.mockReturnValue(child.process);
    const killProcessGroup = vi.spyOn(process, "kill").mockReturnValue(true);
    const resultPromise = runOcrRuntimeInstaller({
      release: release(),
      aiDataDir: "/data/ai",
    });

    child.stderr.end("installer crashed");
    child.close(1);

    expect(killProcessGroup).toHaveBeenCalledWith(-42_001, "SIGKILL");
    await expect(resultPromise).rejects.toThrow("installer crashed");
  });

  it("falls back to signaling the child when process-group signaling is unavailable", async () => {
    const child = createChild();
    spawnMock.mockReturnValue(child.process);
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("kill EPERM"), { code: "EPERM" });
    });
    const controller = new AbortController();
    const resultPromise = runOcrRuntimeInstaller({
      release: release(),
      aiDataDir: "/data/ai",
      signal: controller.signal,
    });
    const rejection = expect(resultPromise).rejects.toThrow("operator canceled");

    controller.abort(new Error("operator canceled"));
    await new Promise((resolve) => setImmediate(resolve));
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");

    child.close(null, "SIGTERM");
    await rejection;
  });
});

describe("runOcrRuntimeMaintenance", () => {
  it("defaults to the immutable system Python", async () => {
    vi.stubEnv("SNAPOTTER_SYSTEM_PYTHON", undefined);
    childProcessMocks.execFileAsync.mockResolvedValue({
      stderr: "",
      stdout: '{"deactivatedFamilies":1}\n',
    });

    await expect(
      runOcrRuntimeMaintenance("deactivate", {
        aiDataDir: "/data/ai",
        installerPath: "/app/install_runtime.py",
      }),
    ).resolves.toEqual({ deactivatedFamilies: 1 });
    expect(childProcessMocks.execFileAsync).toHaveBeenCalledWith(
      "/usr/bin/python3",
      ["/app/install_runtime.py", "deactivate", "--ai-data-dir", "/data/ai", "--family", "ocr"],
      expect.objectContaining({
        encoding: "utf8",
        windowsHide: true,
      }),
    );
  });

  it("inherits the authoritative install lease into maintenance mutators", async () => {
    const child = createChild();
    spawnMock.mockReturnValue(child.process);
    childProcessMocks.execFileAsync.mockResolvedValue({
      stderr: "",
      stdout: '{"removed":[]}\n',
    });

    const resultPromise = runOcrRuntimeMaintenance("gc", {
      aiDataDir: "/data/ai",
      installerPath: "/app/install_runtime.py",
      installLockFd: 48,
    });
    expect(spawnMock).toHaveBeenCalledWith(
      "/usr/bin/python3",
      ["/app/install_runtime.py", "gc", "--ai-data-dir", "/data/ai", "--keep-unreferenced", "0"],
      expect.objectContaining({ stdio: ["ignore", "pipe", "pipe", 48] }),
    );
    child.stdout.end('{"removed":[]}\n');
    child.close(0);
    await expect(resultPromise).resolves.toEqual({ removed: [] });
  });

  it("binds rollback to the generation whose handoff failed", async () => {
    childProcessMocks.execFileAsync.mockResolvedValue({
      stderr: "",
      stdout: '{"restoredGeneration":"generation-old"}\n',
    });

    await expect(
      runOcrRuntimeMaintenance("rollback", {
        aiDataDir: "/data/ai",
        installerPath: "/app/install_runtime.py",
        expectedGeneration: "generation-new",
      }),
    ).resolves.toEqual({ restoredGeneration: "generation-old" });
    expect(childProcessMocks.execFileAsync).toHaveBeenCalledWith(
      "/usr/bin/python3",
      [
        "/app/install_runtime.py",
        "rollback",
        "--ai-data-dir",
        "/data/ai",
        "--family",
        "ocr",
        "--expected-generation",
        "generation-new",
      ],
      expect.objectContaining({ encoding: "utf8", windowsHide: true }),
    );
  });

  it("binds commit to the generation whose dispatcher handoff succeeded", async () => {
    childProcessMocks.execFileAsync.mockResolvedValue({
      stderr: "",
      stdout: '{"committed":true,"generation":"generation-new"}\n',
    });

    await expect(
      runOcrRuntimeMaintenance("commit", {
        aiDataDir: "/data/ai",
        installerPath: "/app/install_runtime.py",
        expectedGeneration: "generation-new",
      }),
    ).resolves.toEqual({ committed: true, generation: "generation-new" });
    expect(childProcessMocks.execFileAsync).toHaveBeenCalledWith(
      "/usr/bin/python3",
      [
        "/app/install_runtime.py",
        "commit",
        "--ai-data-dir",
        "/data/ai",
        "--family",
        "ocr",
        "--expected-generation",
        "generation-new",
      ],
      expect.objectContaining({ encoding: "utf8", windowsHide: true }),
    );
  });

  it("runs startup reconciliation without guessing a generation", async () => {
    childProcessMocks.execFileAsync.mockResolvedValue({
      stderr: "",
      stdout: '{"restored":{"ocr":"generation-old"}}\n',
    });

    await expect(
      runOcrRuntimeMaintenance("reconcile", {
        aiDataDir: "/data/ai",
        installerPath: "/app/install_runtime.py",
      }),
    ).resolves.toEqual({ restored: { ocr: "generation-old" } });
    expect(childProcessMocks.execFileAsync).toHaveBeenCalledWith(
      "/usr/bin/python3",
      ["/app/install_runtime.py", "reconcile", "--ai-data-dir", "/data/ai"],
      expect.objectContaining({ encoding: "utf8", windowsHide: true }),
    );
  });
});
