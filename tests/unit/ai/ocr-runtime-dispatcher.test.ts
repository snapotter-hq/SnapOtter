import { type ChildProcess, type StdioOptions, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  closeSync,
  constants,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { PassThrough, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveRuntimeDescriptor } from "../../../packages/ai/src/runtime-state.js";

const mockSpawn = vi.hoisted(() => vi.fn());
const mockReadActiveRuntime = vi.hoisted(() => vi.fn());
const mockReadPendingOcrRuntimeForHandoff = vi.hoisted(() => vi.fn());
const mockReadCommittedActivationIdentity = vi.hoisted(() => vi.fn());
const mockReadPendingActivationIdentity = vi.hoisted(() => vi.fn());
const fsFaults = vi.hoisted(() => ({
  failNextLeasePublish: false,
  failLeaseCleanupPath: null as string | null,
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawn: mockSpawn };
});
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    writeFileSync: (...args: Parameters<typeof actual.writeFileSync>) => {
      if (
        fsFaults.failNextLeasePublish &&
        typeof args[0] === "string" &&
        args[0].includes(`${join("v3", "leases", "ocr")}/`) &&
        args[0].endsWith(".tmp")
      ) {
        fsFaults.failNextLeasePublish = false;
        throw new Error("simulated lease publish failure");
      }
      return actual.writeFileSync(...args);
    },
    rmSync: (...args: Parameters<typeof actual.rmSync>) => {
      if (args[0] === fsFaults.failLeaseCleanupPath) {
        fsFaults.failLeaseCleanupPath = null;
        throw new Error("simulated lease cleanup failure");
      }
      return actual.rmSync(...args);
    },
  };
});
vi.mock("../../../packages/ai/src/runtime-state.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../packages/ai/src/runtime-state.js")>();
  return {
    ...actual,
    readActiveRuntime: mockReadActiveRuntime,
    readCommittedOcrRuntimeActivationIdentity: mockReadCommittedActivationIdentity,
    readPendingOcrRuntimeActivationIdentity: mockReadPendingActivationIdentity,
    readPendingOcrRuntimeForHandoff: mockReadPendingOcrRuntimeForHandoff,
  };
});

import {
  drainOcrDispatcher,
  handoffOcrDispatcher,
  probeOcrDispatcher,
  rotateOcrDispatcher,
  runOcrRuntime,
  shutdownOcrDispatcher,
} from "../../../packages/ai/src/ocr-runtime-dispatcher.js";

interface MockChild {
  process: ChildProcess;
  stdinWrites: string[];
  stdout: PassThrough;
  stderr: PassThrough;
  kill: ReturnType<typeof vi.fn>;
  stdinEnded: ReturnType<typeof vi.fn>;
  close: (code?: number | null, signal?: NodeJS.Signals | null) => void;
}

let mockChildren: MockChild[] = [];

function createMockChild(pid = 43_210): MockChild {
  const stdinWrites: string[] = [];
  const stdin = new Writable({
    write(chunk, _encoding, callback) {
      stdinWrites.push(chunk.toString());
      callback();
    },
  });
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const child = new EventEmitter() as unknown as ChildProcess;
  const kill = vi.fn(() => true);
  const stdinEnded = vi.fn();
  stdin.on("finish", stdinEnded);
  Object.assign(child, { stdin, stdout, stderr, pid, kill });
  const mockChild: MockChild = {
    process: child,
    stdinWrites,
    stdout,
    stderr,
    kill,
    stdinEnded,
    close: (code = 0, signal = null) => child.emit("close", code, signal),
  };
  mockChildren.push(mockChild);
  return mockChild;
}

function descriptor(generation = "generation-a"): ActiveRuntimeDescriptor {
  const activationDescriptorSha256 = createHash("sha256").update(generation).digest("hex");
  return {
    schemaVersion: 1,
    family: "ocr",
    generation,
    status: "ready",
    activationDescriptorSha256,
    activatedAt: "2026-07-13T00:00:00.000Z",
    artifact: {
      version: "3.0.0",
      target: "linux-amd64-cpu-py312",
      platform: "linux",
      arch: "amd64",
      sha256: "a".repeat(64),
      signedIndex: {
        path: `indexes/${"9".repeat(64)}.json`,
        sha256: "9".repeat(64),
        size: 1024,
      },
      models: {
        medium: "c".repeat(64),
        small: "b".repeat(64),
      },
      modelFiles: {
        medium: {
          path: `runtimes/ocr/linux-amd64-cpu-py312/${generation}/models/medium.onnx`,
          sha256: "c".repeat(64),
          size: 6,
        },
        small: {
          path: `runtimes/ocr/linux-amd64-cpu-py312/${generation}/models/small.onnx`,
          sha256: "b".repeat(64),
          size: 5,
        },
      },
    },
    runtime: {
      root: `/data/ai/v3/runtimes/ocr/linux-amd64-cpu-py312/${generation}`,
      pythonPath: `/data/ai/v3/runtimes/ocr/linux-amd64-cpu-py312/${generation}/venv/bin/python3`,
      entrypoint: `/data/ai/v3/runtimes/ocr/linux-amd64-cpu-py312/${generation}/runtime/dispatcher.py`,
      integrityFiles: {
        python: {
          path: `runtimes/ocr/linux-amd64-cpu-py312/${generation}/venv/bin/python3`,
          sha256: "d".repeat(64),
          size: 1,
        },
        entrypoint: {
          path: `runtimes/ocr/linux-amd64-cpu-py312/${generation}/runtime/dispatcher.py`,
          sha256: "e".repeat(64),
          size: 1,
        },
        adapter: {
          path: `runtimes/ocr/linux-amd64-cpu-py312/${generation}/ocr_runtime.py`,
          sha256: "f".repeat(64),
          size: 1,
        },
      },
    },
    compatibility: {
      protocolVersion: 1,
      snapotterVersion: "2.1.0",
    },
    capabilities: {
      qualities: ["balanced", "best"],
      providers: ["CPUExecutionProvider"],
    },
    health: {
      status: "healthy",
      checkedAt: "2026-07-13T00:00:00.000Z",
    },
  };
}

function parsedRequests(child: MockChild): Array<{
  requestId: string;
  script: string;
  args: string[];
}> {
  return child.stdinWrites
    .join("")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function respondLine(child: MockChild, requestIndex: number, result: unknown): void {
  const request = parsedRequests(child)[requestIndex];
  child.stdout.write(
    `${JSON.stringify({
      protocolVersion: 1,
      requestId: request.requestId,
      ok: true,
      result,
    })}\n`,
  );
}

function readinessResult(): Record<string, string> {
  return {
    provider: "CPUExecutionProvider",
    device: "cpu",
    runtimeVersion: "3.0.0",
    target: "linux-amd64-cpu-py312",
    representativeModel: "PP-OCRv6-small+medium+korean+document-orientation",
  };
}

async function publishRuntime(child: MockChild, dataDir: string): Promise<void> {
  const rotation = rotateOcrDispatcher({ aiDataDir: dataDir });
  const requestIndex = parsedRequests(child).length - 1;
  expect(parsedRequests(child)[requestIndex]).toMatchObject({ script: "smoke", args: [] });
  respondLine(child, requestIndex, readinessResult());
  await rotation;
}

function leaseFiles(aiDataDir: string, generation = "generation-a"): string[] {
  const directory = join(aiDataDir, "v3", "leases", "ocr", generation);
  return existsSync(directory) ? readdirSync(directory) : [];
}

const KERNEL_LOCK_BUSY_EXIT_CODE = 73;

function generationLockPath(aiDataDir: string, generation = "generation-a"): string {
  return join(aiDataDir, "v3", "locks", "generations", "ocr", `${generation}.lock`);
}

function acquireKernelLock(fd: number, mode: "shared" | "exclusive"): boolean {
  const stdio: StdioOptions = ["ignore", "ignore", "pipe", fd];
  const pythonOperation = mode === "shared" ? "fcntl.LOCK_SH" : "fcntl.LOCK_EX";
  const result = existsSync("/usr/bin/flock")
    ? spawnSync(
        "/usr/bin/flock",
        [
          `--${mode}`,
          "--nonblock",
          "--conflict-exit-code",
          String(KERNEL_LOCK_BUSY_EXIT_CODE),
          "3",
        ],
        { stdio, timeout: 5_000 },
      )
    : spawnSync(
        "/usr/bin/python3",
        [
          "-c",
          `import fcntl, sys
try:
    fcntl.flock(3, ${pythonOperation} | fcntl.LOCK_NB)
except BlockingIOError:
    sys.exit(${KERNEL_LOCK_BUSY_EXIT_CODE})`,
        ],
        { stdio, timeout: 5_000 },
      );

  if (result.error) throw result.error;
  if (result.status === 0) return true;
  if (result.status === KERNEL_LOCK_BUSY_EXIT_CODE) return false;
  throw new Error(
    `kernel lock probe failed with status ${String(result.status)}: ${result.stderr?.toString().trim() || "no error output"}`,
  );
}

function probeExclusiveGenerationLock(path: string): boolean {
  const fd = openSync(path, constants.O_RDWR | constants.O_NOFOLLOW);
  try {
    return acquireKernelLock(fd, "exclusive");
  } finally {
    closeSync(fd);
  }
}

let aiDataDir: string;

beforeEach(() => {
  mockChildren = [];
  aiDataDir = mkdtempSync(join(tmpdir(), "snapotter-ocr-dispatcher-"));
  mockSpawn.mockReset();
  mockReadActiveRuntime.mockReset();
  mockReadActiveRuntime.mockReturnValue(descriptor());
  mockReadPendingOcrRuntimeForHandoff.mockReset();
  mockReadPendingOcrRuntimeForHandoff.mockReturnValue(descriptor());
  mockReadCommittedActivationIdentity.mockReset();
  mockReadCommittedActivationIdentity.mockReturnValue({
    generation: "generation-a",
    descriptorSha256: descriptor().activationDescriptorSha256,
  });
  mockReadPendingActivationIdentity.mockReset();
  mockReadPendingActivationIdentity.mockReturnValue(null);
  fsFaults.failNextLeasePublish = false;
  fsFaults.failLeaseCleanupPath = null;
});

afterEach(async () => {
  const shutdown = shutdownOcrDispatcher();
  for (const child of mockChildren) child.close(null, "SIGTERM");
  await shutdown;
  vi.useRealTimers();
  vi.unstubAllEnvs();
  rmSync(aiDataDir, { recursive: true, force: true });
});

describe("runOcrRuntime", () => {
  it("reuses one persistent child for sequential requests in the same generation", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child.process);
    await publishRuntime(child, aiDataDir);

    const first = runOcrRuntime("ocr", ["/tmp/first.png", "{}"], { aiDataDir });
    respondLine(child, 1, { text: "first" });
    await expect(first).resolves.toMatchObject({ result: { text: "first" } });

    const second = runOcrRuntime("ocr", ["/tmp/second.png", "{}"], { aiDataDir });
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(child.process.pid).toBe(43_210);
    respondLine(child, 2, { text: "second" });

    await expect(second).resolves.toMatchObject({ result: { text: "second" } });
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const shutdown = shutdownOcrDispatcher();
    child.close(null, "SIGTERM");
    await shutdown;
  }, 1_000);

  it("spawns only the descriptor executable and entrypoint with an isolated environment", async () => {
    vi.stubEnv("PYTHONPATH", "/tmp/ambient-pythonpath");
    vi.stubEnv("PYTHONHOME", "/tmp/ambient-pythonhome");
    vi.stubEnv("DATABASE_URL", "postgres://secret");
    const child = createMockChild();
    mockSpawn.mockReturnValue(child.process);
    await publishRuntime(child, aiDataDir);

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [executable, args, options] = mockSpawn.mock.calls[0];
    expect(executable).toBe(descriptor().runtime.pythonPath);
    expect(args).toEqual([descriptor().runtime.entrypoint]);
    expect(options).toMatchObject({
      cwd: "/data/ai/v3/runtimes/ocr/linux-amd64-cpu-py312/generation-a/runtime",
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    expect(options.env).toEqual({
      LANG: "C.UTF-8",
      HF_HUB_OFFLINE: "1",
      NO_PROXY: "*",
      PIP_NO_INDEX: "1",
      PYTHONDONTWRITEBYTECODE: "1",
      PYTHONUNBUFFERED: "1",
      PYTHONNOUSERSITE: "1",
      SNAPOTTER_ALLOW_MODEL_DOWNLOAD: "0",
      SNAPOTTER_NETWORK_DISABLED: "1",
      SNAPOTTER_OCR_ARTIFACT_SHA256: "a".repeat(64),
      SNAPOTTER_OCR_ARTIFACT_VERSION: "3.0.0",
      SNAPOTTER_OCR_GENERATION: "generation-a",
      SNAPOTTER_OCR_MODELS_JSON: JSON.stringify({
        medium: "c".repeat(64),
        small: "b".repeat(64),
      }),
      SNAPOTTER_OCR_PROTOCOL_VERSION: "1",
      SNAPOTTER_OCR_PROVIDERS_JSON: '["CPUExecutionProvider"]',
      SNAPOTTER_OCR_RUNTIME_TARGET: "linux-amd64-cpu-py312",
      SNAPOTTER_RUNTIME_ROOT: "/data/ai/v3/runtimes/ocr/linux-amd64-cpu-py312/generation-a",
      TRANSFORMERS_OFFLINE: "1",
      no_proxy: "*",
    });
    expect(options.env).not.toHaveProperty("PYTHONPATH");
    expect(options.env).not.toHaveProperty("PYTHONHOME");
    expect(options.env).not.toHaveProperty("DATABASE_URL");

    const promise = runOcrRuntime("ocr", ["/tmp/input image.png", "en", "best"], {
      aiDataDir,
    });
    const request = parsedRequests(child)[1];
    expect(request).toEqual({
      protocolVersion: 1,
      requestId: expect.any(String),
      script: "ocr",
      args: ["/tmp/input image.png", "en", "best"],
    });
    for (const directory of [
      join(aiDataDir, "v3"),
      join(aiDataDir, "v3", "locks"),
      join(aiDataDir, "v3", "locks", "generations"),
      join(aiDataDir, "v3", "locks", "generations", "ocr"),
      join(aiDataDir, "v3", "leases"),
      join(aiDataDir, "v3", "leases", "ocr"),
      join(aiDataDir, "v3", "leases", "ocr", "generation-a"),
    ]) {
      expect(statSync(directory).mode & 0o7777).toBe(0o2770);
    }
    const [lease] = leaseFiles(aiDataDir);
    expect(
      statSync(join(aiDataDir, "v3", "leases", "ocr", "generation-a", lease)).mode & 0o777,
    ).toBe(0o660);
    expect(statSync(generationLockPath(aiDataDir)).mode & 0o777).toBe(0o660);
    respondLine(child, 1, { text: "hello" });

    await expect(promise).resolves.toMatchObject({
      result: { text: "hello" },
      stderr: "",
      runtime: {
        generation: "generation-a",
        artifactVersion: "3.0.0",
        target: "linux-amd64-cpu-py312",
        providers: ["CPUExecutionProvider"],
        models: descriptor().artifact.models,
      },
    });
  });

  it("fails closed without spawning when active state is missing", async () => {
    mockReadActiveRuntime.mockReturnValue(null);

    await expect(runOcrRuntime("ocr", [], { aiDataDir })).rejects.toThrow(
      "Accurate OCR runtime is not active",
    );
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(existsSync(join(aiDataDir, "v3", "leases"))).toBe(false);
  });

  it("fails closed when activation changes between capture and spawn", async () => {
    mockReadActiveRuntime
      .mockReturnValueOnce(descriptor("generation-a"))
      .mockReturnValueOnce(descriptor("generation-b"));

    await expect(runOcrRuntime("ocr", [], { aiDataDir })).rejects.toThrow(
      "OCR runtime activation changed before execution",
    );
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(leaseFiles(aiDataDir, "generation-a")).toEqual([]);
  });

  it("re-reads activation for every request and never reuses a stale generation", async () => {
    const first = descriptor("generation-a");
    const second = descriptor("generation-b");
    let activeDescriptor = first;
    mockReadActiveRuntime.mockImplementation(() => activeDescriptor);
    const childA = createMockChild(1);
    const childB = createMockChild(2);
    mockSpawn.mockReturnValueOnce(childA.process).mockReturnValueOnce(childB.process);

    await publishRuntime(childA, aiDataDir);
    const promiseA = runOcrRuntime("ocr", [], { aiDataDir });
    respondLine(childA, 1, { text: "a" });
    await promiseA;
    activeDescriptor = second;
    const promiseB = runOcrRuntime("ocr_pdf", ["/tmp/file.pdf"], { aiDataDir });
    respondLine(childB, 0, readinessResult());
    await vi.waitFor(() => expect(parsedRequests(childB)).toHaveLength(2));
    respondLine(childB, 1, { text: "b" });
    const resultB = await promiseB;

    expect(mockSpawn.mock.calls[0][0]).toBe(first.runtime.pythonPath);
    expect(mockSpawn.mock.calls[1][0]).toBe(second.runtime.pythonPath);
    expect(resultB.runtime.generation).toBe("generation-b");
  });

  it("rotates generations while the old child drains its captured queue", async () => {
    let activeDescriptor = descriptor("generation-a");
    mockReadActiveRuntime.mockImplementation(() => activeDescriptor);
    const childA = createMockChild(1);
    const childB = createMockChild(2);
    mockSpawn.mockReturnValueOnce(childA.process).mockReturnValueOnce(childB.process);
    await publishRuntime(childA, aiDataDir);

    const firstA = runOcrRuntime("ocr", ["/tmp/a-1.png", "{}"], { aiDataDir });
    const secondA = runOcrRuntime("ocr", ["/tmp/a-2.png", "{}"], { aiDataDir });
    expect(parsedRequests(childA)).toHaveLength(2);

    activeDescriptor = descriptor("generation-b");
    const requestB = runOcrRuntime("ocr", ["/tmp/b.png", "{}"], { aiDataDir });

    expect(mockSpawn).toHaveBeenCalledTimes(2);
    expect(childA.kill).not.toHaveBeenCalled();
    expect(parsedRequests(childB)[0]).toMatchObject({ script: "smoke", args: [] });
    respondLine(childB, 0, readinessResult());
    await vi.waitFor(() => expect(parsedRequests(childB)).toHaveLength(2));
    respondLine(childB, 1, { text: "b" });
    await expect(requestB).resolves.toMatchObject({
      result: { text: "b" },
      runtime: { generation: "generation-b" },
    });

    respondLine(childA, 1, { text: "a-1" });
    await expect(firstA).resolves.toMatchObject({ result: { text: "a-1" } });
    expect(parsedRequests(childA)).toHaveLength(3);
    respondLine(childA, 2, { text: "a-2" });
    await expect(secondA).resolves.toMatchObject({ result: { text: "a-2" } });
    await vi.waitFor(() => expect(childA.stdinEnded).toHaveBeenCalledTimes(1));
    expect(childA.kill).not.toHaveBeenCalled();
    childA.close();

    const shutdown = shutdownOcrDispatcher();
    childB.close(null, "SIGTERM");
    await shutdown;
  });

  it("serializes requests so only one model-heavy request is active at a time", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child.process);
    await publishRuntime(child, aiDataDir);

    const first = runOcrRuntime("ocr", ["/tmp/first.png", "{}"], { aiDataDir });
    const second = runOcrRuntime("ocr_pdf", ["[]", "{}"], { aiDataDir });

    expect(parsedRequests(child)).toHaveLength(2);
    respondLine(child, 1, { text: "first" });
    await first;
    expect(parsedRequests(child)).toHaveLength(3);
    respondLine(child, 2, { text: "second" });
    await second;

    const shutdown = shutdownOcrDispatcher();
    child.close(null, "SIGTERM");
    await shutdown;
  });

  it("never attributes late process stderr to the following request", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child.process);
    await publishRuntime(child, aiDataDir);

    const first = runOcrRuntime("ocr", ["/tmp/first.png", "{}"], { aiDataDir });
    const second = runOcrRuntime("ocr", ["/tmp/second.png", "{}"], { aiDataDir });
    respondLine(child, 1, { text: "first" });
    await expect(first).resolves.toMatchObject({ stderr: "" });

    // stdout and stderr are independent OS pipes. This could be a delayed
    // diagnostic from the completed request and must not leak into request 2.
    child.stderr.write("late diagnostic from request 1");
    respondLine(child, 2, { text: "second" });
    await expect(second).resolves.toMatchObject({ stderr: "" });
  });

  it("creates an atomic generation lease, heartbeats it, and removes it after completion", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T00:00:00.000Z"));
    const child = createMockChild();
    mockSpawn.mockReturnValue(child.process);
    await publishRuntime(child, aiDataDir);

    const promise = runOcrRuntime("ocr", [], { aiDataDir });
    const files = leaseFiles(aiDataDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(new RegExp(`^${process.pid}-[A-Za-z0-9-]+-[A-Za-z0-9-]+\\.json$`));
    expect(files.every((file) => !file.includes(".tmp"))).toBe(true);
    const leasePath = join(aiDataDir, "v3", "leases", "ocr", "generation-a", files[0]);
    const before = JSON.parse(readFileSync(leasePath, "utf8"));
    expect(before).toMatchObject({
      schemaVersion: 2,
      family: "ocr",
      generation: "generation-a",
      pid: process.pid,
      createdAt: "2026-07-13T00:00:00.000Z",
      heartbeatAt: "2026-07-13T00:00:00.000Z",
    });

    await vi.advanceTimersByTimeAsync(5_000);
    const after = JSON.parse(readFileSync(leasePath, "utf8"));
    expect(after.heartbeatAt).toBe("2026-07-13T00:00:05.000Z");
    respondLine(child, 1, { text: "hello" });
    await promise;

    expect(leaseFiles(aiDataDir)).toEqual([]);
    expect(existsSync(generationLockPath(aiDataDir))).toBe(true);
  });

  it("holds a shared kernel lock until an active request settles", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child.process);
    await publishRuntime(child, aiDataDir);

    const promise = runOcrRuntime("ocr", [], { aiDataDir });
    const lockPath = generationLockPath(aiDataDir);
    expect(probeExclusiveGenerationLock(lockPath)).toBe(false);

    respondLine(child, 1, { text: "hello" });
    await promise;
    expect(probeExclusiveGenerationLock(lockPath)).toBe(true);
  });

  it("allows concurrent shared request leases and releases after the last closes", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child.process);
    await publishRuntime(child, aiDataDir);

    const first = runOcrRuntime("ocr", ["/tmp/first.png", "{}"], { aiDataDir });
    const second = runOcrRuntime("ocr", ["/tmp/second.png", "{}"], { aiDataDir });
    const lockPath = generationLockPath(aiDataDir);
    expect(leaseFiles(aiDataDir)).toHaveLength(2);
    expect(probeExclusiveGenerationLock(lockPath)).toBe(false);

    respondLine(child, 1, { text: "first" });
    await first;
    expect(leaseFiles(aiDataDir)).toHaveLength(1);
    expect(probeExclusiveGenerationLock(lockPath)).toBe(false);

    respondLine(child, 2, { text: "second" });
    await second;
    expect(leaseFiles(aiDataDir)).toEqual([]);
    expect(probeExclusiveGenerationLock(lockPath)).toBe(true);
  });

  it("fails a request when an exclusive generation lock is already held", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child.process);
    await publishRuntime(child, aiDataDir);
    const lockPath = generationLockPath(aiDataDir);
    const exclusiveFd = openSync(lockPath, constants.O_RDWR | constants.O_NOFOLLOW);
    expect(acquireKernelLock(exclusiveFd, "exclusive")).toBe(true);

    try {
      await expect(runOcrRuntime("ocr", [], { aiDataDir })).rejects.toThrow(
        "OCR runtime generation lock is busy",
      );
      expect(parsedRequests(child)).toHaveLength(1);
      expect(leaseFiles(aiDataDir)).toEqual([]);
    } finally {
      closeSync(exclusiveFd);
    }
  });

  it("fails closed when the permanent generation lock path is a symlink", async () => {
    const lockPath = generationLockPath(aiDataDir);
    const redirectedLock = join(aiDataDir, "redirected-generation.lock");
    mkdirSync(dirname(lockPath), { recursive: true });
    writeFileSync(redirectedLock, "must not be locked through a symlink");
    symlinkSync(redirectedLock, lockPath);

    await expect(runOcrRuntime("ocr", [], { aiDataDir })).rejects.toThrow(
      /ELOOP|symbolic|symlink/i,
    );
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(readFileSync(redirectedLock, "utf8")).toBe("must not be locked through a symlink");
  });

  it("fails closed when the permanent generation lock has another hard link", async () => {
    const lockPath = generationLockPath(aiDataDir);
    const linkedLock = join(aiDataDir, "hardlinked-generation.lock");
    mkdirSync(dirname(lockPath), { recursive: true });
    writeFileSync(linkedLock, "shared inode");
    linkSync(linkedLock, lockPath);

    await expect(runOcrRuntime("ocr", [], { aiDataDir })).rejects.toThrow(
      "OCR runtime generation lock is not a private regular file",
    );
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("does not leak the shared lock when initial lease publication fails", async () => {
    fsFaults.failNextLeasePublish = true;

    await expect(runOcrRuntime("ocr", [], { aiDataDir })).rejects.toThrow(
      "simulated lease publish failure",
    );
    const lockPath = generationLockPath(aiDataDir);
    expect(existsSync(lockPath)).toBe(true);
    expect(probeExclusiveGenerationLock(lockPath)).toBe(true);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("releases the shared lock when JSON lease cleanup fails", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child.process);
    await publishRuntime(child, aiDataDir);

    const promise = runOcrRuntime("ocr", [], { aiDataDir });
    const [lease] = leaseFiles(aiDataDir);
    fsFaults.failLeaseCleanupPath = join(aiDataDir, "v3", "leases", "ocr", "generation-a", lease);
    respondLine(child, 1, { text: "hello" });

    await expect(promise).rejects.toThrow("simulated lease cleanup failure");
    expect(probeExclusiveGenerationLock(generationLockPath(aiDataDir))).toBe(true);
  });

  it("fails the request if its generation lease can no longer heartbeat", async () => {
    vi.useFakeTimers();
    const child = createMockChild();
    mockSpawn.mockReturnValue(child.process);
    await publishRuntime(child, aiDataDir);
    const promise = runOcrRuntime("ocr", [], { aiDataDir });
    const generationDirectory = join(aiDataDir, "v3", "leases", "ocr", "generation-a");

    rmSync(generationDirectory, { recursive: true });
    writeFileSync(generationDirectory, "blocks atomic heartbeat replacement");
    await vi.advanceTimersByTimeAsync(5_000);

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(probeExclusiveGenerationLock(generationLockPath(aiDataDir))).toBe(false);
    rmSync(generationDirectory);
    mkdirSync(generationDirectory);
    child.close(null, "SIGTERM");
    await expect(promise).rejects.toThrow("OCR runtime lease heartbeat failed");
    expect(probeExclusiveGenerationLock(generationLockPath(aiDataDir))).toBe(true);
  });

  it("rejects a symlinked v3 lease path before writing or spawning", async () => {
    const redirectedDirectory = join(aiDataDir, "redirected-v3");
    mkdirSync(redirectedDirectory);
    symlinkSync(redirectedDirectory, join(aiDataDir, "v3"), "dir");

    await expect(runOcrRuntime("ocr", [], { aiDataDir })).rejects.toThrow(
      "OCR runtime lease path component is a symbolic link",
    );
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(readdirSync(redirectedDirectory)).toEqual([]);
  });

  it("rejects a symlinked AI data root before writing or spawning", async () => {
    const redirectedDirectory = mkdtempSync(join(tmpdir(), "snapotter-ocr-redirected-root-"));
    rmSync(aiDataDir, { recursive: true });
    symlinkSync(redirectedDirectory, aiDataDir, "dir");

    try {
      await expect(runOcrRuntime("ocr", [], { aiDataDir })).rejects.toThrow(
        "OCR runtime lease path component is a symbolic link",
      );
      expect(mockSpawn).not.toHaveBeenCalled();
      expect(readdirSync(redirectedDirectory)).toEqual([]);
    } finally {
      rmSync(redirectedDirectory, { recursive: true, force: true });
    }
  });

  it("rejects a non-directory v3 lease path component before spawning", async () => {
    writeFileSync(join(aiDataDir, "v3"), "not a directory");

    await expect(runOcrRuntime("ocr", [], { aiDataDir })).rejects.toThrow(
      "OCR runtime lease path component is not a directory",
    );
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("rejects an already-aborted request without reading state or spawning", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      runOcrRuntime("ocr", [], { aiDataDir, signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mockReadActiveRuntime).not.toHaveBeenCalled();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("terminates an in-flight request on cancellation and removes its lease", async () => {
    const child = createMockChild();
    const controller = new AbortController();
    mockSpawn.mockReturnValue(child.process);
    await publishRuntime(child, aiDataDir);
    const promise = runOcrRuntime("ocr", [], {
      aiDataDir,
      signal: controller.signal,
    });

    controller.abort();
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    child.close(null, "SIGTERM");

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(leaseFiles(aiDataDir)).toEqual([]);
  });

  it("terminates a request that exceeds its timeout", async () => {
    vi.useFakeTimers();
    const child = createMockChild();
    mockSpawn.mockReturnValue(child.process);
    await publishRuntime(child, aiDataDir);
    const promise = runOcrRuntime("ocr", [], { aiDataDir, timeoutMs: 100 });
    let settled = false;
    const rejection = expect(
      promise.finally(() => {
        settled = true;
      }),
    ).rejects.toThrow(/Accurate OCR runtime timed out after \d+ms/);

    await vi.advanceTimersByTimeAsync(100);
    expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
    expect(leaseFiles(aiDataDir)).not.toEqual([]);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
    expect(leaseFiles(aiDataDir)).not.toEqual([]);
    expect(settled).toBe(false);

    child.close(null, "SIGKILL");
    await rejection;
    expect(leaseFiles(aiDataDir)).toEqual([]);
  });

  it("uses one monotonic timeout across generation readiness and wall-clock jumps", async () => {
    vi.useFakeTimers();
    const monotonicNow = vi.spyOn(performance, "now").mockReturnValue(0);
    vi.setSystemTime(new Date("2026-07-13T00:00:00.000Z"));
    let activeDescriptor = descriptor("generation-a");
    mockReadActiveRuntime.mockImplementation(() => activeDescriptor);
    const oldChild = createMockChild(1);
    const candidate = createMockChild(2);
    mockSpawn.mockReturnValueOnce(oldChild.process).mockReturnValueOnce(candidate.process);
    await publishRuntime(oldChild, aiDataDir);

    activeDescriptor = descriptor("generation-b");
    const request = runOcrRuntime("ocr", ["/tmp/new.png", "{}"], {
      aiDataDir,
      timeoutMs: 100,
    });
    await vi.advanceTimersByTimeAsync(60);
    monotonicNow.mockReturnValue(60);
    vi.setSystemTime(new Date("2026-07-12T00:00:00.000Z"));
    respondLine(candidate, 0, readinessResult());
    for (let index = 0; index < 10; index += 1) await Promise.resolve();
    expect(parsedRequests(candidate)).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(39);
    monotonicNow.mockReturnValue(99);
    expect(candidate.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    monotonicNow.mockReturnValue(100);
    expect(candidate.kill).toHaveBeenCalledWith("SIGTERM");
    candidate.close(null, "SIGTERM");
    await expect(request).rejects.toThrow("timed out after 40ms");

    await vi.waitFor(() => expect(oldChild.stdinEnded).toHaveBeenCalledTimes(1));
    oldChild.close();
    await shutdownOcrDispatcher();
  });

  it("rejects malformed and mismatched protocol responses", async () => {
    const malformed = createMockChild(1);
    const mismatched = createMockChild(2);
    mockSpawn.mockReturnValueOnce(malformed.process).mockReturnValueOnce(mismatched.process);

    await publishRuntime(malformed, aiDataDir);
    const malformedPromise = runOcrRuntime("ocr", [], { aiDataDir });
    malformed.stdout.end("not-json\n");
    malformed.close();
    await expect(malformedPromise).rejects.toThrow("malformed JSON response");

    await publishRuntime(mismatched, aiDataDir);
    const mismatchedPromise = runOcrRuntime("ocr", [], { aiDataDir });
    mismatched.stdout.end(
      `${JSON.stringify({
        protocolVersion: 1,
        requestId: randomUUID(),
        ok: true,
        result: {},
      })}\n`,
    );
    mismatched.close();
    await expect(mismatchedPromise).rejects.toThrow("mismatched response envelope");
  });

  it("rejects all pending requests after a child crash and restarts cleanly", async () => {
    const crashed = createMockChild(1);
    const restarted = createMockChild(2);
    mockSpawn.mockReturnValueOnce(crashed.process).mockReturnValueOnce(restarted.process);

    await publishRuntime(crashed, aiDataDir);
    const active = runOcrRuntime("ocr", ["/tmp/active.png", "{}"], { aiDataDir });
    const queued = runOcrRuntime("ocr", ["/tmp/queued.png", "{}"], { aiDataDir });
    crashed.stderr.write("session initialization failed");
    crashed.close(1);

    await expect(active).rejects.toThrow("exited with code 1: session initialization failed");
    await expect(queued).rejects.toThrow("exited with code 1: session initialization failed");
    expect(leaseFiles(aiDataDir)).toEqual([]);

    await publishRuntime(restarted, aiDataDir);
    const retry = runOcrRuntime("ocr", ["/tmp/retry.png", "{}"], { aiDataDir });
    respondLine(restarted, 1, { text: "restarted" });
    await expect(retry).resolves.toMatchObject({ result: { text: "restarted" } });
    expect(mockSpawn).toHaveBeenCalledTimes(2);

    const shutdown = shutdownOcrDispatcher();
    restarted.close(null, "SIGTERM");
    await shutdown;
  });

  it("actively terminates a child after its process error event", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child.process);
    await publishRuntime(child, aiDataDir);
    const request = runOcrRuntime("ocr", ["/tmp/input.png", "{}"], { aiDataDir });

    child.process.emit("error", new Error("runtime process channel failed"));
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    child.close(null, "SIGTERM");

    await expect(request).rejects.toThrow("runtime process channel failed");
    expect(leaseFiles(aiDataDir)).toEqual([]);
  });

  it("surfaces a well-formed runtime error without falling back", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child.process);
    await publishRuntime(child, aiDataDir);
    const promise = runOcrRuntime("ocr_pdf", ["/tmp/input.pdf"], { aiDataDir });
    const request = parsedRequests(child)[1];
    child.stdout.end(
      `${JSON.stringify({
        protocolVersion: 1,
        requestId: request.requestId,
        ok: false,
        error: { code: "model-load-failed", message: "model digest mismatch" },
      })}\n`,
    );
    child.close();

    await expect(promise).rejects.toThrow(
      "Accurate OCR runtime failed (model-load-failed): model digest mismatch",
    );
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it("accepts realistic stdout responses larger than the stderr limit", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child.process);
    await publishRuntime(child, aiDataDir);
    const promise = runOcrRuntime("ocr", [], { aiDataDir });

    respondLine(child, 1, { text: "a".repeat(2 * 1024 * 1024) });

    await expect(promise).resolves.toMatchObject({
      result: { text: expect.stringMatching(/^a+$/) },
    });
  });

  it("terminates a runtime that exceeds the 8 MiB stdout limit", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child.process);
    await publishRuntime(child, aiDataDir);
    const promise = runOcrRuntime("ocr", [], { aiDataDir });

    child.stdout.write(Buffer.alloc(8 * 1024 * 1024 + 1, 97));
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    child.close(null, "SIGTERM");

    await expect(promise).rejects.toThrow("stdout exceeded 8388608 bytes");
  });

  it("terminates a runtime that exceeds the 1 MiB stderr limit", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child.process);
    await publishRuntime(child, aiDataDir);
    const promise = runOcrRuntime("ocr", [], { aiDataDir });

    child.stderr.write(Buffer.alloc(1024 * 1024 + 1, 97));
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    child.close(null, "SIGTERM");

    await expect(promise).rejects.toThrow("stderr exceeded 1048576 bytes");
  });

  it("rejects invalid script names before reading active state", async () => {
    await expect(runOcrRuntime("background_removal" as "ocr", [], { aiDataDir })).rejects.toThrow(
      'Unsupported OCR runtime script "background_removal"',
    );
    expect(mockReadActiveRuntime).not.toHaveBeenCalled();
  });
});

describe("shutdownOcrDispatcher", () => {
  it("only terminates OCR runtime children owned by this module", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child.process);
    await publishRuntime(child, aiDataDir);
    const promise = runOcrRuntime("ocr", [], { aiDataDir });

    const shutdown = shutdownOcrDispatcher();

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    child.close(null, "SIGTERM");
    await shutdown;
    await expect(promise).rejects.toThrow("OCR runtime dispatcher shut down");
  });
});

describe("shared activation watcher", () => {
  it("retires a remote replica after descriptor removal without aborting leased work", async () => {
    vi.useFakeTimers();
    const child = createMockChild();
    mockSpawn.mockReturnValue(child.process);
    await publishRuntime(child, aiDataDir);

    const active = runOcrRuntime("ocr", ["/tmp/input.png", "{}"], { aiDataDir });
    mockReadActiveRuntime.mockReturnValue(null);
    mockReadCommittedActivationIdentity.mockReturnValue(null);
    mockReadPendingActivationIdentity.mockReturnValue(null);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(child.stdinEnded).not.toHaveBeenCalled();
    expect(child.kill).not.toHaveBeenCalled();

    respondLine(child, 1, { text: "finished before remote retirement" });
    await expect(active).resolves.toMatchObject({
      result: { text: "finished before remote retirement" },
    });
    await vi.waitFor(() => expect(child.stdinEnded).toHaveBeenCalledTimes(1));
    child.close();
  });

  it("retains only the exact pending handoff candidate", async () => {
    vi.useFakeTimers();
    const child = createMockChild();
    mockSpawn.mockReturnValue(child.process);
    await publishRuntime(child, aiDataDir);
    const current = descriptor();

    mockReadCommittedActivationIdentity.mockReturnValue(null);
    mockReadPendingActivationIdentity.mockReturnValue({
      generation: current.generation,
      descriptorSha256: current.activationDescriptorSha256,
    });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(child.stdinEnded).not.toHaveBeenCalled();

    const replacement = descriptor("generation-b");
    mockReadPendingActivationIdentity.mockReturnValue({
      generation: replacement.generation,
      descriptorSha256: replacement.activationDescriptorSha256,
    });
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.waitFor(() => expect(child.stdinEnded).toHaveBeenCalledTimes(1));
    child.close();
  });
});

describe("drainOcrDispatcher", () => {
  it("stops admission, lets active work finish, and never terminates it", async () => {
    const child = createMockChild();
    const restarted = createMockChild(2);
    mockSpawn.mockReturnValueOnce(child.process).mockReturnValueOnce(restarted.process);
    await publishRuntime(child, aiDataDir);
    const active = runOcrRuntime("ocr", ["/tmp/input.png", "{}"], { aiDataDir });

    let drainSettled = false;
    const drain = drainOcrDispatcher().then(() => {
      drainSettled = true;
    });

    await expect(runOcrRuntime("ocr", ["/tmp/late.png", "{}"], { aiDataDir })).rejects.toThrow(
      "dispatcher is draining",
    );
    expect(child.kill).not.toHaveBeenCalled();
    expect(drainSettled).toBe(false);

    respondLine(child, 1, { text: "finished" });
    await expect(active).resolves.toMatchObject({ result: { text: "finished" } });
    await vi.waitFor(() => expect(child.stdinEnded).toHaveBeenCalledTimes(1));
    expect(child.kill).not.toHaveBeenCalled();
    expect(drainSettled).toBe(false);

    child.close();
    await drain;
    expect(drainSettled).toBe(true);

    const afterDrain = runOcrRuntime("ocr", ["/tmp/after.png", "{}"], { aiDataDir });
    await vi.waitFor(() => expect(parsedRequests(restarted)).toHaveLength(1));
    respondLine(restarted, 0, readinessResult());
    await vi.waitFor(() => expect(parsedRequests(restarted)).toHaveLength(2));
    respondLine(restarted, 1, { text: "accepted" });
    await expect(afterDrain).resolves.toMatchObject({ result: { text: "accepted" } });
    const shutdown = shutdownOcrDispatcher();
    restarted.close(null, "SIGTERM");
    await shutdown;
  });
});

describe("OCR dispatcher readiness handoff", () => {
  it("serializes a pending installer handoff behind a different committed rotation", async () => {
    let committedDescriptor: ActiveRuntimeDescriptor | null = descriptor("generation-a");
    let pendingDescriptor: ActiveRuntimeDescriptor | null = null;
    mockReadActiveRuntime.mockImplementation(() => committedDescriptor);
    mockReadPendingOcrRuntimeForHandoff.mockImplementation(() => pendingDescriptor);
    const committedChild = createMockChild(1);
    const pendingChild = createMockChild(2);
    mockSpawn.mockReturnValueOnce(committedChild.process).mockReturnValueOnce(pendingChild.process);

    const committedRotation = rotateOcrDispatcher({ aiDataDir });
    committedDescriptor = null;
    pendingDescriptor = descriptor("generation-b");
    const pendingHandoff = handoffOcrDispatcher({ aiDataDir });

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    respondLine(committedChild, 0, readinessResult());
    await vi.waitFor(() => expect(committedChild.kill).toHaveBeenCalledWith("SIGTERM"));
    committedChild.close(null, "SIGTERM");
    await expect(committedRotation).rejects.toThrow("activation changed before execution");

    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(2));
    respondLine(pendingChild, 0, readinessResult());
    await expect(pendingHandoff).resolves.toMatchObject({
      runtime: { generation: "generation-b" },
    });

    await expect(
      runOcrRuntime("ocr", ["/tmp/uncommitted.png", "{}"], { aiDataDir }),
    ).rejects.toThrow("not active");
    const shutdown = shutdownOcrDispatcher();
    pendingChild.close(null, "SIGTERM");
    await shutdown;
  });

  it("rejects a protocol-success response that does not prove model readiness", async () => {
    const candidate = createMockChild();
    mockSpawn.mockReturnValue(candidate.process);
    const rotation = rotateOcrDispatcher({ aiDataDir });

    respondLine(candidate, 0, { provider: "CPUExecutionProvider" });
    await vi.waitFor(() => expect(candidate.kill).toHaveBeenCalledWith("SIGTERM"));
    candidate.close(null, "SIGTERM");

    await expect(rotation).rejects.toThrow("malformed readiness result");
  });

  it("keeps the old generation published when the candidate readiness probe fails", async () => {
    let activeDescriptor = descriptor("generation-a");
    mockReadActiveRuntime.mockImplementation(() => activeDescriptor);
    const oldChild = createMockChild(1);
    const candidate = createMockChild(2);
    mockSpawn.mockReturnValueOnce(oldChild.process).mockReturnValueOnce(candidate.process);

    const initialRotation = rotateOcrDispatcher({ aiDataDir });
    expect(parsedRequests(oldChild)[0]).toMatchObject({ script: "smoke", args: [] });
    respondLine(oldChild, 0, readinessResult());
    await initialRotation;

    activeDescriptor = descriptor("generation-b");
    const failedRotation = rotateOcrDispatcher({ aiDataDir });
    expect(parsedRequests(candidate)[0]).toMatchObject({ script: "smoke", args: [] });
    const request = parsedRequests(candidate)[0];
    candidate.stdout.write(
      `${JSON.stringify({
        protocolVersion: 1,
        requestId: request.requestId,
        ok: false,
        error: { code: "model-load-failed", message: "medium model is corrupt" },
      })}\n`,
    );
    await vi.waitFor(() => expect(candidate.kill).toHaveBeenCalledWith("SIGTERM"));
    expect(oldChild.kill).not.toHaveBeenCalled();
    expect(oldChild.stdinEnded).not.toHaveBeenCalled();
    candidate.close(null, "SIGTERM");
    await expect(failedRotation).rejects.toThrow("model-load-failed");

    activeDescriptor = descriptor("generation-a");
    const oldProbe = probeOcrDispatcher({ aiDataDir });
    respondLine(oldChild, 1, readinessResult());
    await expect(oldProbe).resolves.toMatchObject({
      result: { provider: "CPUExecutionProvider" },
      runtime: { generation: "generation-a" },
    });
    expect(mockSpawn).toHaveBeenCalledTimes(2);

    const shutdown = shutdownOcrDispatcher();
    oldChild.close(null, "SIGTERM");
    await shutdown;
  }, 2_000);

  it("publishes a ready candidate before gracefully retiring the old generation", async () => {
    let activeDescriptor = descriptor("generation-a");
    mockReadActiveRuntime.mockImplementation(() => activeDescriptor);
    const oldChild = createMockChild(1);
    const candidate = createMockChild(2);
    mockSpawn.mockReturnValueOnce(oldChild.process).mockReturnValueOnce(candidate.process);

    const initialRotation = rotateOcrDispatcher({ aiDataDir });
    respondLine(oldChild, 0, readinessResult());
    await initialRotation;

    activeDescriptor = descriptor("generation-b");
    const rotation = rotateOcrDispatcher({ aiDataDir });
    expect(oldChild.stdinEnded).not.toHaveBeenCalled();
    respondLine(candidate, 0, readinessResult());
    await expect(rotation).resolves.toMatchObject({ runtime: { generation: "generation-b" } });
    await vi.waitFor(() => expect(oldChild.stdinEnded).toHaveBeenCalledTimes(1));
    expect(oldChild.kill).not.toHaveBeenCalled();
    oldChild.close();

    const probe = probeOcrDispatcher({ aiDataDir });
    respondLine(candidate, 1, readinessResult());
    await expect(probe).resolves.toMatchObject({ runtime: { generation: "generation-b" } });
    expect(mockSpawn).toHaveBeenCalledTimes(2);

    const shutdown = shutdownOcrDispatcher();
    candidate.close(null, "SIGTERM");
    await shutdown;
  });

  it("does not reuse a process after an integrity field in its descriptor changes", async () => {
    let activeDescriptor = descriptor("generation-a");
    mockReadActiveRuntime.mockImplementation(() => activeDescriptor);
    const oldChild = createMockChild(1);
    const candidate = createMockChild(2);
    mockSpawn.mockReturnValueOnce(oldChild.process).mockReturnValueOnce(candidate.process);

    const initialRotation = rotateOcrDispatcher({ aiDataDir });
    respondLine(oldChild, 0, readinessResult());
    await initialRotation;

    activeDescriptor = structuredClone(activeDescriptor);
    activeDescriptor.runtime.integrityFiles.adapter.sha256 = "7".repeat(64);
    const rotation = rotateOcrDispatcher({ aiDataDir });
    const spawnedCandidate = mockSpawn.mock.calls.length === 2;
    if (spawnedCandidate) {
      respondLine(candidate, 0, readinessResult());
    } else {
      respondLine(oldChild, 1, readinessResult());
    }
    await rotation;

    expect(mockSpawn).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(oldChild.stdinEnded).toHaveBeenCalledTimes(1));
    oldChild.close();
    const shutdown = shutdownOcrDispatcher();
    candidate.close(null, "SIGTERM");
    await shutdown;
  });

  it("rejects rotation while a graceful drain barrier is active", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child.process);
    const initialRotation = rotateOcrDispatcher({ aiDataDir });
    respondLine(child, 0, readinessResult());
    await initialRotation;

    const drain = drainOcrDispatcher();
    await expect(rotateOcrDispatcher({ aiDataDir })).rejects.toThrow("dispatcher is draining");
    child.close();
    await drain;
  });

  it("lets restored-generation work reuse the old manager after candidate rollback", async () => {
    let activeDescriptor = descriptor("generation-a");
    mockReadActiveRuntime.mockImplementation(() => activeDescriptor);
    const oldChild = createMockChild(1);
    const candidate = createMockChild(2);
    mockSpawn.mockReturnValueOnce(oldChild.process).mockReturnValueOnce(candidate.process);

    await publishRuntime(oldChild, aiDataDir);

    activeDescriptor = descriptor("generation-b");
    const rotation = rotateOcrDispatcher({ aiDataDir });
    activeDescriptor = descriptor("generation-a");
    const restoredRequest = runOcrRuntime("ocr", ["/tmp/restored.png", "{}"], { aiDataDir });

    respondLine(candidate, 0, readinessResult());
    await vi.waitFor(() => expect(candidate.kill).toHaveBeenCalledWith("SIGTERM"));
    candidate.close(null, "SIGTERM");
    await expect(rotation).rejects.toThrow("activation changed before execution");

    await vi.waitFor(() => expect(parsedRequests(oldChild)).toHaveLength(2));
    respondLine(oldChild, 1, { text: "restored" });
    await expect(restoredRequest).resolves.toMatchObject({
      result: { text: "restored" },
      runtime: { generation: "generation-a" },
    });

    const shutdown = shutdownOcrDispatcher();
    oldChild.close(null, "SIGTERM");
    await shutdown;
  });

  it("aborts a request promptly while another caller owns the generation handoff", async () => {
    let activeDescriptor = descriptor("generation-a");
    mockReadActiveRuntime.mockImplementation(() => activeDescriptor);
    const oldChild = createMockChild(1);
    const candidate = createMockChild(2);
    mockSpawn.mockReturnValueOnce(oldChild.process).mockReturnValueOnce(candidate.process);
    await publishRuntime(oldChild, aiDataDir);

    activeDescriptor = descriptor("generation-b");
    const rotation = rotateOcrDispatcher({ aiDataDir });
    const controller = new AbortController();
    const waitingRequest = runOcrRuntime("ocr", ["/tmp/waiting.png", "{}"], {
      aiDataDir,
      signal: controller.signal,
    });
    controller.abort();

    await expect(waitingRequest).rejects.toMatchObject({ name: "AbortError" });
    expect(candidate.kill).not.toHaveBeenCalled();

    respondLine(candidate, 0, readinessResult());
    await rotation;
    await vi.waitFor(() => expect(oldChild.stdinEnded).toHaveBeenCalledTimes(1));
    oldChild.close();
    const shutdown = shutdownOcrDispatcher();
    candidate.close(null, "SIGTERM");
    await shutdown;
  }, 1_000);
});
