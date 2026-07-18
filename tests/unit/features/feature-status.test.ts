import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ocrRuntime = vi.hoisted(() => ({
  getCapability: vi.fn(),
  getEffectiveMemory: vi.fn(),
  selectTarget: vi.fn(),
}));

const fsFaults = vi.hoisted(() => ({
  denyOwnerOnlyMutationPath: null as string | null,
  denyRecursiveRemovePath: null as string | null,
  forceNonDocker: false,
  pretendBaseVenvExists: false,
}));

const childProcessFaults = vi.hoisted(() => ({
  nextKernelLockFailure: null as string | null,
  reseedOutcomes: [] as Array<"fail" | "success">,
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execFileSync: (...args: Parameters<typeof actual.execFileSync>) => {
      if (args[0] === "/usr/local/bin/reseed-ai-venv.sh") {
        const outcome = childProcessFaults.reseedOutcomes.shift();
        if (outcome === "fail") throw new Error("simulated reseed failure");
        if (outcome === "success") return Buffer.alloc(0);
      }
      return actual.execFileSync(...args);
    },
    spawnSync: (...args: Parameters<typeof actual.spawnSync>) => {
      if (childProcessFaults.nextKernelLockFailure !== null) {
        const detail = childProcessFaults.nextKernelLockFailure;
        childProcessFaults.nextKernelLockFailure = null;
        return {
          error: undefined,
          output: [null, Buffer.alloc(0), Buffer.from(detail)],
          pid: 42,
          signal: null,
          status: 1,
          stderr: Buffer.from(detail),
          stdout: Buffer.alloc(0),
        };
      }
      return actual.spawnSync(...args);
    },
  };
});

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const permissionError = () =>
    Object.assign(new Error("operation not permitted for non-owner"), { code: "EPERM" });
  return {
    ...actual,
    existsSync: (...args: Parameters<typeof actual.existsSync>) => {
      if (args[0] === "/.dockerenv" && fsFaults.forceNonDocker) return false;
      if (args[0] === "/opt/venv" && fsFaults.pretendBaseVenvExists) return true;
      return actual.existsSync(...args);
    },
    fchmodSync: (...args: Parameters<typeof actual.fchmodSync>) => {
      if (fsFaults.denyOwnerOnlyMutationPath !== null) {
        try {
          const fdInfo = actual.fstatSync(args[0]);
          const pathInfo = actual.statSync(fsFaults.denyOwnerOnlyMutationPath);
          if (fdInfo.dev === pathInfo.dev && fdInfo.ino === pathInfo.ino) throw permissionError();
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EPERM") throw error;
        }
      }
      return actual.fchmodSync(...args);
    },
    futimesSync: (...args: Parameters<typeof actual.futimesSync>) => {
      return actual.futimesSync(...args);
    },
    rmSync: (...args: Parameters<typeof actual.rmSync>) => {
      if (args[0] === fsFaults.denyRecursiveRemovePath) throw permissionError();
      return actual.rmSync(...args);
    },
  };
});

vi.mock("@snapotter/ai", () => ({
  getOcrRuntimeEffectiveMemoryBytes: ocrRuntime.getEffectiveMemory,
  getOcrRuntimeCapability: ocrRuntime.getCapability,
  selectOcrRuntimeTarget: ocrRuntime.selectTarget,
}));

let mod: typeof import("../../../apps/api/src/lib/feature-status.js");
let tempDir: string;
let aiDir: string;
let modelsDir: string;
let installedPath: string;
let lockPath: string;
let kernelLockPath: string;
let mutationEpochPath: string;

beforeEach(async () => {
  vi.resetModules();
  fsFaults.denyOwnerOnlyMutationPath = null;
  fsFaults.denyRecursiveRemovePath = null;
  fsFaults.forceNonDocker = false;
  fsFaults.pretendBaseVenvExists = false;
  childProcessFaults.nextKernelLockFailure = null;
  childProcessFaults.reseedOutcomes.length = 0;
  ocrRuntime.getCapability.mockReset();
  ocrRuntime.getEffectiveMemory.mockReset();
  ocrRuntime.selectTarget.mockReset();
  ocrRuntime.getCapability.mockReturnValue({
    available: false,
    status: "missing",
    reason: "descriptor-missing",
    qualities: [],
    providers: [],
  });
  ocrRuntime.selectTarget.mockReturnValue(
    process.arch === "arm64" ? "linux-arm64-cpu-py311" : "linux-amd64-cpu-py312",
  );
  ocrRuntime.getEffectiveMemory.mockReturnValue(8 * 1024 ** 3);
  tempDir = mkdtempSync(join(tmpdir(), "snapotter-test-"));
  aiDir = join(tempDir, "ai");
  modelsDir = join(aiDir, "models");
  installedPath = join(aiDir, "installed.json");
  lockPath = join(aiDir, "install.lock");
  kernelLockPath = join(aiDir, "install.flock");
  mutationEpochPath = join(aiDir, "install-mutation.epoch");
  mkdirSync(modelsDir, { recursive: true });

  process.env.DATA_DIR = tempDir;
  process.env.FEATURE_MANIFEST_PATH = join(tempDir, "feature-manifest.json");

  mod = await import("../../../apps/api/src/lib/feature-status.js");
});

afterEach(() => {
  mod.stopInterruptedInstallRecovery?.();
  mod.releaseInstallLock();
  delete process.env.DATA_DIR;
  delete process.env.AI_DATA_DIR;
  delete process.env.FEATURE_MANIFEST_PATH;
  rmSync(tempDir, { recursive: true, force: true });
});

function writeTestManifest(
  bundles: Record<string, { models: Array<{ id: string; path?: string; minSize?: number }> }>,
) {
  const manifestPath = process.env.FEATURE_MANIFEST_PATH ?? "";
  writeFileSync(manifestPath, JSON.stringify({ bundles }));
}

function acquireKernelFlock(fd: number): void {
  const result = existsSync("/usr/bin/flock")
    ? spawnSync("/usr/bin/flock", ["--nonblock", "3"], {
        stdio: ["ignore", "ignore", "pipe", fd],
      })
    : spawnSync(
        "/usr/bin/python3",
        ["-c", "import fcntl; fcntl.flock(3, fcntl.LOCK_EX | fcntl.LOCK_NB)"],
        { stdio: ["ignore", "ignore", "pipe", fd] },
      );
  expect(result.status, result.stderr?.toString()).toBe(0);
}

describe("installed.json management", () => {
  it("reads missing file as empty {bundles: {}}", () => {
    const result = mod.isFeatureInstalled("background-removal");
    expect(result).toBe(false);
  });

  it("reads valid JSON correctly", () => {
    writeFileSync(
      installedPath,
      JSON.stringify({
        bundles: {
          "background-removal": {
            version: "1.0.0",
            installedAt: "2026-01-01T00:00:00.000Z",
            models: ["u2net.onnx"],
          },
        },
      }),
    );
    mod.invalidateCache();
    expect(mod.isFeatureInstalled("background-removal")).toBe(true);
  });

  it("reads corrupt JSON as empty (graceful degradation)", () => {
    writeFileSync(installedPath, "{{{{not valid json!!!!}}}}");
    mod.invalidateCache();
    expect(mod.isFeatureInstalled("background-removal")).toBe(false);
  });

  it("writes atomically (.tmp does not persist after write)", () => {
    mod.markInstalled("background-removal", "1.0.0", ["u2net.onnx"]);
    expect(existsSync(installedPath)).toBe(true);
    expect(existsSync(`${installedPath}.tmp`)).toBe(false);
  });

  it("markInstalled records bundleId, version, installedAt, and models", () => {
    mod.markInstalled("face-detection", "2.1.0", ["face_model.tflite"]);
    const data = JSON.parse(readFileSync(installedPath, "utf-8"));
    const entry = data.bundles["face-detection"];
    expect(entry).toBeDefined();
    expect(entry.version).toBe("2.1.0");
    expect(entry.models).toEqual(["face_model.tflite"]);
    expect(new Date(entry.installedAt).toISOString()).toBe(entry.installedAt);
  });

  it("markUninstalled removes bundle entry, preserves others", () => {
    mod.markInstalled("face-detection", "1.0.0", []);
    mod.markInstalled("ocr", "1.0.0", []);
    mod.markUninstalled("face-detection");
    const data = JSON.parse(readFileSync(installedPath, "utf-8"));
    expect(data.bundles["face-detection"]).toBeUndefined();
    expect(data.bundles.ocr).toBeDefined();
  });

  it("multiple bundles can coexist in installed.json", () => {
    mod.markInstalled("background-removal", "1.0.0", ["u2net.onnx"]);
    mod.markInstalled("face-detection", "2.0.0", ["face.tflite"]);
    mod.markInstalled("ocr", "3.0.0", ["ppocr.onnx"]);
    const data = JSON.parse(readFileSync(installedPath, "utf-8"));
    expect(Object.keys(data.bundles)).toHaveLength(3);
  });

  it("round-trip: install 3 bundles, uninstall all, verify empty", () => {
    mod.markInstalled("background-removal", "1.0.0", []);
    mod.markInstalled("face-detection", "1.0.0", []);
    mod.markInstalled("ocr", "1.0.0", []);
    mod.markUninstalled("background-removal");
    mod.markUninstalled("face-detection");
    mod.markUninstalled("ocr");
    const data = JSON.parse(readFileSync(installedPath, "utf-8"));
    expect(Object.keys(data.bundles)).toHaveLength(0);
  });

  it("markInstalled with same bundleId overwrites (version update)", () => {
    mod.markInstalled("ocr", "1.0.0", ["old.onnx"]);
    mod.markInstalled("ocr", "2.0.0", ["new.onnx"]);
    const data = JSON.parse(readFileSync(installedPath, "utf-8"));
    expect(data.bundles.ocr.version).toBe("2.0.0");
    expect(data.bundles.ocr.models).toEqual(["new.onnx"]);
  });
});

// Regression for NODE-12 (Sentry): installed.json that is *valid JSON* but
// whose shape lacks a usable `bundles` object (e.g. "{}", '{"bundles":null}',
// a top-level array, or an older format) used to crash at boot with
// "Cannot convert undefined or null to object" via Object.keys(data.bundles) in
// recoverInterruptedInstalls, `bundleId in data.bundles` in isFeatureInstalled,
// and installed.bundles[...] in getFeatureStates. readInstalled() must coerce
// any unusable shape to { bundles: {} } so these never throw.
describe("malformed installed.json shape (NODE-12 regression)", () => {
  const BAD_SHAPES: Array<[string, string]> = [
    ["object with no bundles key", JSON.stringify({})],
    ["bundles is null", JSON.stringify({ bundles: null })],
    ["bundles is an array", JSON.stringify({ bundles: [] })],
    ["bundles is a string", JSON.stringify({ bundles: "nope" })],
    ["top-level array", JSON.stringify([{ ocr: {} }])],
    ["top-level number", JSON.stringify(42)],
    ["top-level null", JSON.stringify(null)],
    ["unrelated shape", JSON.stringify({ version: 2, installed: ["ocr"] })],
  ];

  for (const [label, contents] of BAD_SHAPES) {
    it(`recoverInterruptedInstalls does not throw when installed.json is ${label}`, () => {
      // A present manifest is what drives the Object.keys(data.bundles) loop.
      writeTestManifest({ "background-removal": { models: [] } });
      writeFileSync(installedPath, contents);
      mod.invalidateCache();
      expect(() => mod.recoverInterruptedInstalls()).not.toThrow();
    });

    it(`isFeatureInstalled returns false (no throw) when installed.json is ${label}`, () => {
      writeFileSync(installedPath, contents);
      mod.invalidateCache();
      expect(() => mod.isFeatureInstalled("background-removal")).not.toThrow();
      expect(mod.isFeatureInstalled("background-removal")).toBe(false);
    });

    it(`getFeatureStates reports all not_installed (no throw) when installed.json is ${label}`, () => {
      writeFileSync(installedPath, contents);
      mod.invalidateCache();
      expect(() => mod.getFeatureStates()).not.toThrow();
      expect(mod.getFeatureStates().every((s) => s.status === "not_installed")).toBe(true);
    });
  }

  it("still reads a valid bundles object after rejecting bad shapes", () => {
    writeFileSync(
      installedPath,
      JSON.stringify({
        bundles: {
          "background-removal": {
            version: "1.0.0",
            installedAt: "2026-01-01T00:00:00.000Z",
            models: [],
          },
        },
      }),
    );
    mod.invalidateCache();
    expect(mod.isFeatureInstalled("background-removal")).toBe(true);
  });
});

describe("Cache behavior", () => {
  it("isFeatureInstalled reads from cache on second call", () => {
    mod.markInstalled("background-removal", "1.0.0", []);
    expect(mod.isFeatureInstalled("background-removal")).toBe(true);
    writeFileSync(installedPath, JSON.stringify({ bundles: {} }));
    expect(mod.isFeatureInstalled("background-removal")).toBe(true);
  });

  it("invalidateCache forces re-read", () => {
    mod.markInstalled("background-removal", "1.0.0", []);
    expect(mod.isFeatureInstalled("background-removal")).toBe(true);
    writeFileSync(installedPath, JSON.stringify({ bundles: {} }));
    mod.invalidateCache();
    expect(mod.isFeatureInstalled("background-removal")).toBe(false);
  });

  it("markInstalled invalidates cache", () => {
    mod.markInstalled("ocr", "1.0.0", []);
    writeFileSync(
      installedPath,
      JSON.stringify({
        bundles: { ocr: { version: "1.0.0", installedAt: "2026-01-01T00:00:00.000Z", models: [] } },
      }),
    );
    mod.markInstalled("face-detection", "1.0.0", []);
    expect(mod.isFeatureInstalled("face-detection")).toBe(true);
  });

  it("markUninstalled invalidates cache", () => {
    mod.markInstalled("ocr", "1.0.0", []);
    mod.markInstalled("face-detection", "1.0.0", []);
    mod.markUninstalled("ocr");
    expect(mod.isFeatureInstalled("ocr")).toBe(false);
    expect(mod.isFeatureInstalled("face-detection")).toBe(true);
  });

  it("invalidateCache is idempotent", () => {
    mod.invalidateCache();
    mod.invalidateCache();
    mod.invalidateCache();
    expect(mod.isFeatureInstalled("ocr")).toBe(false);
  });
});

describe("Install lock", () => {
  it("acquireInstallLock creates lock file with bundleId and startedAt", () => {
    mod.acquireInstallLock("ocr");
    const data = JSON.parse(readFileSync(lockPath, "utf-8"));
    expect(data.bundleId).toBe("ocr");
    expect(typeof data.startedAt).toBe("string");
  });

  it("acquireInstallLock returns true on success", () => {
    expect(mod.acquireInstallLock("ocr")).toBe(true);
  });

  it("reuses a group-shared kernel inode without requiring ownership", () => {
    writeFileSync(kernelLockPath, "", { mode: 0o660 });
    chmodSync(kernelLockPath, 0o660);
    fsFaults.denyOwnerOnlyMutationPath = kernelLockPath;

    expect(mod.acquireInstallLock("ocr")).toBe(true);
    expect(JSON.parse(readFileSync(lockPath, "utf-8")).bundleId).toBe("ocr");
  });

  it("heartbeats an owned lease so a long install cannot be stolen", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.now());
    try {
      expect(mod.acquireInstallLock("ocr")).toBe(true);
      const before = JSON.parse(readFileSync(lockPath, "utf-8"));
      const beforeMtime = statSync(lockPath).mtimeMs;
      await vi.advanceTimersByTimeAsync(30_000);
      const after = JSON.parse(readFileSync(lockPath, "utf-8"));

      expect(after.ownerToken).toBe(before.ownerToken);
      expect(statSync(lockPath).mtimeMs).toBeGreaterThan(beforeMtime);
      expect(mod.getInstallingBundle()?.bundleId).toBe("ocr");
    } finally {
      mod.releaseInstallLock();
      vi.useRealTimers();
    }
  });

  it("acquireInstallLock returns false when lock already exists", () => {
    mod.acquireInstallLock("ocr");
    expect(mod.acquireInstallLock("face-detection")).toBe(false);
  });

  it("honors a fresh install.lock created by an old replica", () => {
    const oldHolderFd = openSync(
      lockPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o660,
    );
    writeFileSync(
      oldHolderFd,
      JSON.stringify({ bundleId: "ocr", startedAt: new Date().toISOString() }),
    );

    try {
      expect(mod.acquireInstallLock("face-detection")).toBe(false);
      expect(JSON.parse(readFileSync(lockPath, "utf-8")).bundleId).toBe("ocr");
    } finally {
      closeSync(oldHolderFd);
      unlinkSync(lockPath);
    }
  });

  it("keeps install.lock present so an old O_EXCL acquirer cannot overlap", () => {
    expect(mod.acquireInstallLock("ocr")).toBe(true);

    expect(() =>
      openSync(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o660),
    ).toThrow(expect.objectContaining({ code: "EEXIST" }));
  });

  it("surfaces an install-lock helper failure instead of silently treating it as contention", () => {
    childProcessFaults.nextKernelLockFailure = "locking is unsupported on this filesystem";

    expect(() => mod.acquireInstallLock("ocr")).toThrow(/helper failed.*unsupported/i);
  });

  it("keeps the lease until an inherited mutator descriptor closes", async () => {
    const getChildFd = (mod as typeof mod & { getInstallLockFdForChild?: () => number })
      .getInstallLockFdForChild;
    expect(getChildFd).toBeTypeOf("function");
    expect(mod.acquireInstallLock("ocr")).toBe(true);

    const child = spawn("/bin/sleep", ["30"], {
      stdio: ["ignore", "ignore", "ignore", getChildFd?.()],
    });
    await once(child, "spawn");
    mod.releaseInstallLock();

    const contenderFd = openSync(kernelLockPath, constants.O_RDWR);
    try {
      const blocked = existsSync("/usr/bin/flock")
        ? spawnSync("/usr/bin/flock", ["--nonblock", "3"], {
            stdio: ["ignore", "ignore", "pipe", contenderFd],
          })
        : spawnSync(
            "/usr/bin/python3",
            ["-c", "import fcntl; fcntl.flock(3, fcntl.LOCK_EX | fcntl.LOCK_NB)"],
            { stdio: ["ignore", "ignore", "pipe", contenderFd] },
          );
      expect(blocked.status).toBe(1);

      child.kill("SIGTERM");
      await once(child, "close");
      acquireKernelFlock(contenderFd);
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
      closeSync(contenderFd);
    }
  });

  it("never steals a kernel-owned lease even when its status metadata looks stale", () => {
    const externalFd = openSync(kernelLockPath, constants.O_RDWR | constants.O_CREAT, 0o600);
    acquireKernelFlock(externalFd);
    writeFileSync(
      lockPath,
      JSON.stringify({
        bundleId: "ocr",
        startedAt: "2026-01-01T00:00:00.000Z",
        ownerToken: "other-replica",
        pid: 1,
      }),
    );
    const stale = new Date(Date.now() - 3 * 60 * 60 * 1000);
    utimesSync(lockPath, stale, stale);

    try {
      expect(mod.acquireInstallLock("face-detection")).toBe(false);
      expect(JSON.parse(readFileSync(lockPath, "utf-8")).ownerToken).toBe("other-replica");
    } finally {
      closeSync(externalFd);
    }

    expect(mod.acquireInstallLock("face-detection")).toBe(true);
  });

  it("keeps one permanent flock inode and removes the legacy marker on release", () => {
    expect(mod.acquireInstallLock("ocr")).toBe(true);
    const inode = statSync(kernelLockPath).ino;

    mod.releaseInstallLock();

    expect(existsSync(kernelLockPath)).toBe(true);
    expect(statSync(kernelLockPath).ino).toBe(inode);
    expect(existsSync(lockPath)).toBe(false);
  });

  it("lock file contains valid JSON with bundleId and startedAt fields", () => {
    mod.acquireInstallLock("background-removal");
    const data = JSON.parse(readFileSync(lockPath, "utf-8"));
    expect(data).toHaveProperty("bundleId", "background-removal");
    expect(data).toHaveProperty("startedAt");
    expect(data).toHaveProperty("pid", process.pid);
    expect(data.ownerToken).toMatch(/^[0-9a-f-]{36}$/i);
    expect(new Date(data.startedAt).toISOString()).toBe(data.startedAt);
  });

  it("releaseInstallLock removes the legacy marker but keeps the flock inode", () => {
    mod.acquireInstallLock("ocr");
    expect(existsSync(lockPath)).toBe(true);
    mod.releaseInstallLock();
    expect(existsSync(lockPath)).toBe(false);
    expect(existsSync(kernelLockPath)).toBe(true);
  });

  it("releaseInstallLock is idempotent", () => {
    mod.releaseInstallLock();
    mod.releaseInstallLock();
    expect(existsSync(lockPath)).toBe(false);
  });

  it("does not remove a marker whose ownership token was replaced", () => {
    mod.acquireInstallLock("ocr");
    const lock = JSON.parse(readFileSync(lockPath, "utf-8"));
    writeFileSync(lockPath, JSON.stringify({ ...lock, ownerToken: "replacement-owner" }));

    mod.releaseInstallLock();

    expect(existsSync(lockPath)).toBe(true);
    expect(JSON.parse(readFileSync(lockPath, "utf-8")).ownerToken).toBe("replacement-owner");
  });

  it("getInstallingBundle returns null when no lock", () => {
    expect(mod.getInstallingBundle()).toBeNull();
  });

  it("getInstallingBundle returns {bundleId, startedAt} from lock file", () => {
    mod.acquireInstallLock("face-detection");
    const result = mod.getInstallingBundle();
    expect(result).not.toBeNull();
    expect(result?.bundleId).toBe("face-detection");
    expect(typeof result?.startedAt).toBe("string");
  });

  it("clears abandoned status metadata when no kernel lease remains", () => {
    writeFileSync(
      lockPath,
      JSON.stringify({
        bundleId: "ocr",
        startedAt: "2026-01-01T00:00:00.000Z",
        ownerToken: "crashed-replica",
      }),
    );

    expect(mod.getInstallingBundle()).toBeNull();
    expect(existsSync(lockPath)).toBe(false);
  });

  it("preserves partial legacy metadata until its compatibility timeout", () => {
    const externalFd = openSync(kernelLockPath, constants.O_RDWR | constants.O_CREAT, 0o660);
    acquireKernelFlock(externalFd);
    writeFileSync(lockPath, "not-valid-json{{{{");
    try {
      expect(mod.getInstallingBundle()).toMatchObject({ bundleId: "unknown" });
      expect(existsSync(lockPath)).toBe(true);
    } finally {
      closeSync(externalFd);
    }
    expect(mod.getInstallingBundle()).toMatchObject({ bundleId: "unknown" });
    const stale = new Date(Date.now() - 46 * 60 * 1000);
    utimesSync(lockPath, stale, stale);
    expect(mod.getInstallingBundle()).toBeNull();
  });
});

describe("resetAiEnvironment", () => {
  function markDockerEnvironment() {
    // isDockerEnvironment() checks for the manifest path, which the
    // beforeEach already points at a file under tempDir; write something
    // there so ensureAiDirs() actually recreates the skeleton afterward.
    writeFileSync(process.env.FEATURE_MANIFEST_PATH ?? "", JSON.stringify({ bundles: {} }));
  }

  it("removes venv, models, and pip-cache directories", () => {
    markDockerEnvironment();
    const venvDir = join(aiDir, "venv");
    const pipCacheDir = join(aiDir, "pip-cache");
    mkdirSync(join(venvDir, "lib", "python3.12", "site-packages", "scipy"), { recursive: true });
    writeFileSync(join(modelsDir, "some-model.onnx"), "fake weights");
    mkdirSync(pipCacheDir, { recursive: true });
    writeFileSync(join(pipCacheDir, "cached.whl"), "fake wheel");

    mod.resetAiEnvironment();

    expect(existsSync(join(venvDir, "lib"))).toBe(false);
    expect(existsSync(join(modelsDir, "some-model.onnx"))).toBe(false);
    expect(existsSync(join(pipCacheDir, "cached.whl"))).toBe(false);
  });

  it("resets installed.json to empty", () => {
    markDockerEnvironment();
    mod.markInstalled("ocr", "2.0.0", ["paddleocr-server-det"]);
    mod.markInstalled("background-removal", "2.0.0", ["rembg-u2net"]);
    expect(mod.isFeatureInstalled("background-removal")).toBe(true);

    mod.resetAiEnvironment();

    const data = JSON.parse(readFileSync(installedPath, "utf-8"));
    expect(data.bundles).toEqual({});
    expect(mod.isFeatureInstalled("ocr")).toBe(false);
    expect(mod.isFeatureInstalled("background-removal")).toBe(false);
  });

  it("advances the shared mutation epoch so older queued work is invalidated", () => {
    markDockerEnvironment();
    const before = mod.getAiMutationEpoch();

    mod.resetAiEnvironment();

    const after = mod.getAiMutationEpoch();
    expect(after).not.toBe(before);
    expect(readFileSync(mutationEpochPath, "utf-8").trim()).toBe(after);
  });

  it("recreates an empty directory skeleton so a fresh install has somewhere to write", () => {
    markDockerEnvironment();
    mod.resetAiEnvironment();

    expect(existsSync(join(aiDir, "venv"))).toBe(true);
    expect(existsSync(modelsDir)).toBe(true);
    expect(existsSync(join(aiDir, "pip-cache"))).toBe(true);
  });

  it("refuses to reset while a bundle install is in progress", () => {
    markDockerEnvironment();
    mod.acquireInstallLock("ocr");

    expect(() => mod.resetAiEnvironment()).toThrow(/install.*progress/i);

    // Nothing should have been torn down.
    expect(existsSync(lockPath)).toBe(true);
  });

  it("releases its own lock after completing", () => {
    markDockerEnvironment();
    mod.resetAiEnvironment();
    expect(existsSync(lockPath)).toBe(false);
    expect(existsSync(kernelLockPath)).toBe(true);
    expect(mod.acquireInstallLock("ocr")).toBe(true);
  });
});

describe("AI mutation epoch", () => {
  it("uses a stable baseline before the first destructive mutation", () => {
    expect(mod.getAiMutationEpoch()).toBe("initial");
    expect(mod.getAiMutationEpoch()).toBe("initial");
  });

  it("can only be advanced while this process owns the install lease", () => {
    expect(() => mod.advanceAiMutationEpoch()).toThrow(/install lock.*held/i);
    expect(existsSync(mutationEpochPath)).toBe(false);
  });

  it("atomically publishes and persists a new epoch", () => {
    expect(mod.acquireInstallLock("__uninstall__")).toBe(true);
    const next = mod.advanceAiMutationEpoch();
    mod.releaseInstallLock();

    expect(next).toMatch(/^[0-9a-f-]{36}$/i);
    expect(mod.getAiMutationEpoch()).toBe(next);
    expect(readFileSync(mutationEpochPath, "utf-8").trim()).toBe(next);
  });
});

describe("Feature status queries", () => {
  it("isFeatureInstalled returns true for installed bundle", () => {
    mod.markInstalled("background-removal", "1.0.0", []);
    expect(mod.isFeatureInstalled("background-removal")).toBe(true);
  });

  it("isFeatureInstalled returns false for not-installed bundle", () => {
    expect(mod.isFeatureInstalled("background-removal")).toBe(false);
  });

  it("isFeatureInstalled returns false for random string", () => {
    expect(mod.isFeatureInstalled("this-does-not-exist-at-all")).toBe(false);
  });

  it("isToolInstalled returns true when bundle is installed", () => {
    mod.markInstalled("face-detection", "1.0.0", []);
    expect(mod.isToolInstalled("blur-faces")).toBe(true);
  });

  it("isToolInstalled returns false when bundle not installed", () => {
    expect(mod.isToolInstalled("blur-faces")).toBe(false);
  });

  it("isToolInstalled returns true for non-AI tools like resize", () => {
    expect(mod.isToolInstalled("resize")).toBe(true);
  });

  it("isToolInstalled consistent after install then uninstall", () => {
    mod.markInstalled("face-detection", "1.0.0", []);
    expect(mod.isToolInstalled("blur-faces")).toBe(true);
    mod.markUninstalled("face-detection");
    expect(mod.isToolInstalled("blur-faces")).toBe(false);
  });

  // passport-photo needs TWO bundles: background-removal (its primary) and
  // face-detection (for face-landmark detection). Installing only one must not
  // report the tool as ready. This is the bug behind issue #327.
  it("isToolInstalled is false for passport-photo when only background-removal is installed", () => {
    mod.markInstalled("background-removal", "1.0.0", []);
    expect(mod.isToolInstalled("passport-photo")).toBe(false);
  });

  it("isToolInstalled is true for passport-photo only when both bundles are installed", () => {
    mod.markInstalled("background-removal", "1.0.0", []);
    mod.markInstalled("face-detection", "1.0.0", []);
    expect(mod.isToolInstalled("passport-photo")).toBe(true);
  });

  it("isToolInstalled is false for enhance-faces when only upscale-enhance is installed", () => {
    mod.markInstalled("upscale-enhance", "1.0.0", []);
    expect(mod.isToolInstalled("enhance-faces")).toBe(false);
  });

  it("getFirstMissingBundleForTool names face-detection for enhance-faces when only upscale-enhance is installed", () => {
    mod.markInstalled("upscale-enhance", "1.0.0", []);
    expect(mod.getFirstMissingBundleForTool("enhance-faces")).toBe("face-detection");
  });

  it("getFirstMissingBundleForTool names face-detection when only background-removal is installed", () => {
    mod.markInstalled("background-removal", "1.0.0", []);
    expect(mod.getFirstMissingBundleForTool("passport-photo")).toBe("face-detection");
  });

  it("getFirstMissingBundleForTool returns the primary bundle first when nothing is installed", () => {
    expect(mod.getFirstMissingBundleForTool("passport-photo")).toBe("background-removal");
  });

  it("getFirstMissingBundleForTool returns null when all required bundles are installed", () => {
    mod.markInstalled("background-removal", "1.0.0", []);
    mod.markInstalled("face-detection", "1.0.0", []);
    expect(mod.getFirstMissingBundleForTool("passport-photo")).toBeNull();
  });

  it("getFirstMissingBundleForTool returns null for non-AI tools", () => {
    expect(mod.getFirstMissingBundleForTool("resize")).toBeNull();
  });
});

describe("Model verification via getFeatureStates", () => {
  it("returns installed when all models exist and meet minSize", () => {
    mod.markInstalled("background-removal", "1.0.0", ["u2net.onnx"]);
    writeTestManifest({
      "background-removal": {
        models: [{ id: "u2net", path: "u2net.onnx", minSize: 10 }],
      },
    });
    writeFileSync(join(modelsDir, "u2net.onnx"), Buffer.alloc(1024));
    mod.invalidateCache();
    const states = mod.getFeatureStates();
    const bg = states.find((s) => s.id === "background-removal");
    expect(bg?.status).toBe("installed");
  });

  it("returns error with message when model file missing", () => {
    mod.markInstalled("background-removal", "1.0.0", ["u2net.onnx"]);
    writeTestManifest({
      "background-removal": {
        models: [{ id: "u2net", path: "u2net.onnx" }],
      },
    });
    mod.invalidateCache();
    const states = mod.getFeatureStates();
    const bg = states.find((s) => s.id === "background-removal");
    expect(bg?.status).toBe("error");
    expect(bg?.error).toContain("u2net.onnx");
  });

  it("returns error when model file is undersized", () => {
    mod.markInstalled("background-removal", "1.0.0", ["u2net.onnx"]);
    writeTestManifest({
      "background-removal": {
        models: [{ id: "u2net", path: "u2net.onnx", minSize: 1000 }],
      },
    });
    writeFileSync(join(modelsDir, "u2net.onnx"), Buffer.alloc(10));
    mod.invalidateCache();
    const states = mod.getFeatureStates();
    const bg = states.find((s) => s.id === "background-removal");
    expect(bg?.status).toBe("error");
    expect(bg?.error).toContain("undersized");
  });

  it("ignores models without path field", () => {
    mod.markInstalled("background-removal", "1.0.0", ["session"]);
    writeTestManifest({
      "background-removal": {
        models: [{ id: "rembg-session" }],
      },
    });
    mod.invalidateCache();
    const states = mod.getFeatureStates();
    const bg = states.find((s) => s.id === "background-removal");
    expect(bg?.status).toBe("installed");
  });

  it("returns installed when manifest is missing", () => {
    mod.markInstalled("background-removal", "1.0.0", []);
    mod.invalidateCache();
    const states = mod.getFeatureStates();
    const bg = states.find((s) => s.id === "background-removal");
    expect(bg?.status).toBe("installed");
  });

  it("returns installed when bundle not in manifest", () => {
    mod.markInstalled("background-removal", "1.0.0", []);
    writeTestManifest({ "some-other-bundle": { models: [] } });
    mod.invalidateCache();
    const states = mod.getFeatureStates();
    const bg = states.find((s) => s.id === "background-removal");
    expect(bg?.status).toBe("installed");
  });

  it("error message identifies which model failed", () => {
    mod.markInstalled("background-removal", "1.0.0", ["a.onnx", "b.onnx"]);
    writeTestManifest({
      "background-removal": {
        models: [
          { id: "a", path: "a.onnx" },
          { id: "b", path: "b.onnx" },
        ],
      },
    });
    writeFileSync(join(modelsDir, "a.onnx"), Buffer.alloc(100));
    mod.invalidateCache();
    const states = mod.getFeatureStates();
    const bg = states.find((s) => s.id === "background-removal");
    expect(bg?.status).toBe("error");
    expect(bg?.error).toContain("b.onnx");
  });

  it("checks minSize only when minSize > 0", () => {
    mod.markInstalled("background-removal", "1.0.0", ["small.onnx"]);
    writeTestManifest({
      "background-removal": {
        models: [{ id: "small", path: "small.onnx", minSize: 0 }],
      },
    });
    writeFileSync(join(modelsDir, "small.onnx"), Buffer.alloc(1));
    mod.invalidateCache();
    const states = mod.getFeatureStates();
    const bg = states.find((s) => s.id === "background-removal");
    expect(bg?.status).toBe("installed");
  });
});

describe("Crash recovery - recoverInterruptedInstalls", () => {
  it("deletes .downloading files in models dir", () => {
    writeFileSync(join(modelsDir, "model.downloading"), "partial");
    mod.recoverInterruptedInstalls();
    expect(existsSync(join(modelsDir, "model.downloading"))).toBe(false);
  });

  it("deletes nested .downloading files", () => {
    const subdir = join(modelsDir, "subdir");
    mkdirSync(subdir, { recursive: true });
    writeFileSync(join(subdir, "nested.downloading"), "partial");
    mod.recoverInterruptedInstalls();
    expect(existsSync(join(subdir, "nested.downloading"))).toBe(false);
  });

  it("does NOT delete non-.downloading files", () => {
    writeFileSync(join(modelsDir, "real-model.onnx"), "model-data");
    mod.recoverInterruptedInstalls();
    expect(existsSync(join(modelsDir, "real-model.onnx"))).toBe(true);
  });

  it("deletes stale installed.json.tmp", () => {
    writeFileSync(`${installedPath}.tmp`, "stale");
    mod.recoverInterruptedInstalls();
    expect(existsSync(`${installedPath}.tmp`)).toBe(false);
  });

  it("deletes venv.bootstrapping/ directory", () => {
    const bootstrapping = join(aiDir, "venv.bootstrapping");
    mkdirSync(bootstrapping, { recursive: true });
    writeFileSync(join(bootstrapping, "somefile"), "data");
    mod.recoverInterruptedInstalls();
    expect(existsSync(bootstrapping)).toBe(false);
  });

  it("recovers stale-looking metadata when no kernel lease remains", () => {
    writeFileSync(
      lockPath,
      JSON.stringify({ bundleId: "ocr", startedAt: "2026-01-01T00:00:00.000Z" }),
    );
    const stale = new Date(Date.now() - 3 * 60 * 60 * 1000);
    utimesSync(lockPath, stale, stale);
    expect(mod.recoverInterruptedInstalls()).toBe(true);
    expect(existsSync(lockPath)).toBe(false);
    expect(existsSync(kernelLockPath)).toBe(true);
  });

  it("defers recovery while a kernel-owned lease is held even if metadata is stale", () => {
    const externalFd = openSync(kernelLockPath, constants.O_RDWR | constants.O_CREAT, 0o600);
    acquireKernelFlock(externalFd);
    writeFileSync(
      lockPath,
      JSON.stringify({
        bundleId: "ocr",
        startedAt: "2026-01-01T00:00:00.000Z",
        ownerToken: "other-replica",
        pid: 1,
      }),
    );
    const stale = new Date(Date.now() - 3 * 60 * 60 * 1000);
    utimesSync(lockPath, stale, stale);
    const partial = join(modelsDir, "model.downloading");
    writeFileSync(partial, "live partial");

    try {
      expect(mod.recoverInterruptedInstalls()).toBe(false);
      expect(existsSync(partial)).toBe(true);
      expect(JSON.parse(readFileSync(lockPath, "utf-8")).ownerToken).toBe("other-replica");
    } finally {
      closeSync(externalFd);
    }
  });

  it("retries deferred startup recovery after the owning replica exits", async () => {
    vi.useFakeTimers();
    const externalFd = openSync(kernelLockPath, constants.O_RDWR | constants.O_CREAT, 0o660);
    acquireKernelFlock(externalFd);
    writeFileSync(
      lockPath,
      JSON.stringify({
        bundleId: "ocr",
        startedAt: new Date().toISOString(),
        ownerToken: "other-replica",
      }),
    );
    const partial = join(modelsDir, "model.downloading");
    writeFileSync(partial, "live partial");
    const recovered = vi.fn();

    const startRecovery = (
      mod as typeof mod & {
        startInterruptedInstallRecovery?: (options: {
          retryMs: number;
          onRecovered: () => void;
        }) => void;
      }
    ).startInterruptedInstallRecovery;
    expect(startRecovery).toBeTypeOf("function");
    startRecovery?.({ retryMs: 25, onRecovered: recovered });
    expect(existsSync(partial)).toBe(true);
    expect(recovered).not.toHaveBeenCalled();

    closeSync(externalFd);
    await vi.advanceTimersByTimeAsync(25);

    expect(existsSync(partial)).toBe(false);
    expect(recovered).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("retries when post-recovery cleanup loses the lease handoff race", async () => {
    vi.useFakeTimers();
    try {
      const recovered = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);

      mod.startInterruptedInstallRecovery({ retryMs: 25, onRecovered: recovered });
      await vi.runAllTicks();
      expect(recovered).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(25);
      expect(recovered).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retains venv.writing and reports incomplete recovery when Docker reseed fails", () => {
    writeTestManifest({});
    fsFaults.pretendBaseVenvExists = true;
    childProcessFaults.reseedOutcomes.push("fail");
    const marker = join(aiDir, "venv.writing");
    writeFileSync(
      marker,
      JSON.stringify({ bundleId: "transcription", startedAt: new Date().toISOString() }),
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(mod.recoverInterruptedInstalls()).toBe(false);
    expect(existsSync(marker)).toBe(true);
    expect(error.mock.calls.flat().join(" ")).toMatch(/reseed|interrupted/i);

    error.mockRestore();
  });

  it("retries a failed Docker reseed and clears the breadcrumb only after success", async () => {
    vi.useFakeTimers();
    try {
      writeTestManifest({ "background-removal": { models: [] } });
      mod.markInstalled("background-removal", "2.1.0", []);
      fsFaults.pretendBaseVenvExists = true;
      childProcessFaults.reseedOutcomes.push("fail", "success");
      const marker = join(aiDir, "venv.writing");
      writeFileSync(
        marker,
        JSON.stringify({ bundleId: "background-removal", startedAt: new Date().toISOString() }),
      );
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const recovered = vi.fn();

      mod.startInterruptedInstallRecovery({ retryMs: 25, onRecovered: recovered });
      expect(existsSync(marker)).toBe(true);
      expect(recovered).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(25);

      expect(existsSync(marker)).toBe(false);
      expect(recovered).toHaveBeenCalledTimes(1);
      expect(JSON.parse(readFileSync(installedPath, "utf-8")).bundles).toEqual({});
      error.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it("warns and consumes an unmanaged non-Docker venv.writing breadcrumb", () => {
    fsFaults.forceNonDocker = true;
    const marker = join(aiDir, "venv.writing");
    writeFileSync(
      marker,
      JSON.stringify({ bundleId: "ocr", startedAt: "2026-01-01T00:00:00.000Z" }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() => mod.recoverInterruptedInstalls()).not.toThrow();

    // The breadcrumb is always consumed so it can't retrigger recovery forever.
    expect(existsSync(marker)).toBe(false);
    // And the interruption is surfaced in the logs.
    expect(warn.mock.calls.flat().join(" ")).toMatch(/interrupted|venv/i);
    warn.mockRestore();
  });

  it("handles missing directories gracefully", async () => {
    vi.resetModules();
    const emptyTemp = mkdtempSync(join(tmpdir(), "snapotter-empty-"));
    process.env.DATA_DIR = emptyTemp;
    const freshMod = await import("../../../apps/api/src/lib/feature-status.js");
    expect(() => freshMod.recoverInterruptedInstalls()).not.toThrow();
    rmSync(emptyTemp, { recursive: true, force: true });
  });

  it("preserves valid installed.json through recovery", () => {
    writeFileSync(
      installedPath,
      JSON.stringify({
        bundles: {
          ocr: { version: "1.0.0", installedAt: "2026-01-01T00:00:00.000Z", models: [] },
        },
      }),
    );
    mod.recoverInterruptedInstalls();
    const data = JSON.parse(readFileSync(installedPath, "utf-8"));
    expect(data.bundles.ocr).toBeDefined();
  });

  it("invalidates cache after recovery", () => {
    mod.markInstalled("background-removal", "1.0.0", []);
    expect(mod.isFeatureInstalled("background-removal")).toBe(true);
    writeFileSync(installedPath, JSON.stringify({ bundles: {} }));
    expect(mod.isFeatureInstalled("background-removal")).toBe(true);
    mod.recoverInterruptedInstalls();
    expect(mod.isFeatureInstalled("background-removal")).toBe(false);
  });

  it("deletes staging-{bundleId}/ directories", () => {
    const staging = join(aiDir, "staging-ocr");
    mkdirSync(staging, { recursive: true });
    writeFileSync(join(staging, "somefile"), "data");
    mod.recoverInterruptedInstalls();
    expect(existsSync(staging)).toBe(false);
  });

  it("deletes multiple staging directories", () => {
    mkdirSync(join(aiDir, "staging-ocr"), { recursive: true });
    mkdirSync(join(aiDir, "staging-upscale-enhance"), { recursive: true });
    mod.recoverInterruptedInstalls();
    expect(existsSync(join(aiDir, "staging-ocr"))).toBe(false);
    expect(existsSync(join(aiDir, "staging-upscale-enhance"))).toBe(false);
  });

  it("deletes crash-stranded lock-owned import staging", () => {
    const offlineUpload = join(aiDir, ".offline-import-v2-abandoned");
    const legacyExtraction = join(aiDir, "import-abandoned");
    for (const directory of [offlineUpload, legacyExtraction]) {
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, "payload"), "data");
    }

    expect(mod.recoverInterruptedInstalls()).toBe(true);

    expect(existsSync(offlineUpload)).toBe(false);
    expect(existsSync(legacyExtraction)).toBe(false);
  });

  it("age-gates pre-lock offline staging from older rolling replicas", () => {
    const legacyUpload = join(aiDir, ".offline-import-legacy-replica");
    mkdirSync(legacyUpload, { recursive: true });
    writeFileSync(join(legacyUpload, "payload"), "data");

    mod.recoverInterruptedInstalls();
    expect(existsSync(legacyUpload)).toBe(true);

    const stale = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(legacyUpload, stale, stale);
    mod.recoverInterruptedInstalls();
    expect(existsSync(legacyUpload)).toBe(false);
  });

  it("keeps recovery pending until orphaned import staging can be removed", () => {
    const offlineUpload = join(aiDir, ".offline-import-v2-permission-retry");
    mkdirSync(offlineUpload, { recursive: true });
    writeFileSync(join(offlineUpload, "payload"), "data");
    fsFaults.denyRecursiveRemovePath = offlineUpload;

    expect(mod.recoverInterruptedInstalls()).toBe(false);
    expect(existsSync(offlineUpload)).toBe(true);

    fsFaults.denyRecursiveRemovePath = null;
    expect(mod.recoverInterruptedInstalls()).toBe(true);
    expect(existsSync(offlineUpload)).toBe(false);
  });

  it("does NOT delete non-staging directories", () => {
    const venvDir = join(aiDir, "venv");
    mkdirSync(venvDir, { recursive: true });
    writeFileSync(join(venvDir, "file"), "data");
    mod.recoverInterruptedInstalls();
    expect(existsSync(venvDir)).toBe(true);
  });

  it("deletes stale download files in staging/", () => {
    const staging = join(aiDir, "staging");
    mkdirSync(staging, { recursive: true });
    writeFileSync(join(staging, "bundle.tar.gz.partial"), "partial");
    writeFileSync(join(staging, "bundle.tar.gz.meta"), '{"bytesDownloaded":0}');
    mod.recoverInterruptedInstalls();
    expect(existsSync(join(staging, "bundle.tar.gz.partial"))).toBe(false);
    expect(existsSync(join(staging, "bundle.tar.gz.meta"))).toBe(false);
  });

  it("deletes orphaned .tar.gz in staging when bundle not installed", () => {
    const staging = join(aiDir, "staging");
    mkdirSync(staging, { recursive: true });
    writeFileSync(join(staging, "background-removal-amd64-gpu.tar.gz"), "tar-data");
    mod.recoverInterruptedInstalls();
    expect(existsSync(join(staging, "background-removal-amd64-gpu.tar.gz"))).toBe(false);
  });
});

describe("Composite state - getFeatureStates", () => {
  it("keeps DATA_DIR authoritative when AI_DATA_DIR is also present", async () => {
    const customAiDir = join(tempDir, "custom-ai");
    process.env.AI_DATA_DIR = customAiDir;
    vi.resetModules();
    const customRootMod = await import("../../../apps/api/src/lib/feature-status.js");

    ocrRuntime.getCapability.mockClear();
    expect(customRootMod.getAiDir()).toBe(aiDir);
    expect(customRootMod.isFeatureInstalled("ocr")).toBe(false);
    expect(ocrRuntime.getCapability).toHaveBeenLastCalledWith({ aiDataDir: aiDir });
  });

  it("all bundles not_installed when installed.json is empty", () => {
    const states = mod.getFeatureStates();
    for (const state of states) {
      expect(state.status).toBe("not_installed");
    }
    expect(states.length).toBe(8);
  });

  it("installed bundle with valid models returns installed with version", () => {
    mod.markInstalled("background-removal", "3.5.0", ["u2net.onnx"]);
    writeTestManifest({
      "background-removal": { models: [{ id: "u2net", path: "u2net.onnx" }] },
    });
    writeFileSync(join(modelsDir, "u2net.onnx"), Buffer.alloc(100));
    mod.invalidateCache();
    const states = mod.getFeatureStates();
    const backgroundRemoval = states.find((s) => s.id === "background-removal");
    expect(backgroundRemoval?.status).toBe("installed");
    expect(backgroundRemoval?.installedVersion).toBe("3.5.0");
  });

  it("does not treat a legacy OCR ledger entry as a healthy accurate runtime", () => {
    mod.markInstalled("ocr", "2.1.0", ["legacy-paddle-model"]);

    expect(mod.isFeatureInstalled("ocr")).toBe(false);
    const ocr = mod.getFeatureStates().find((state) => state.id === "ocr");

    expect(ocr).toMatchObject({
      status: "not_installed",
      installedVersion: null,
      compatibility: "compatible",
      compatibilityReason: "descriptor-missing",
      healthyGeneration: null,
      availableQualities: ["fast"],
    });
  });

  it("derives installed OCR state and accurate qualities from the healthy v3 descriptor", () => {
    ocrRuntime.getCapability.mockReturnValue({
      available: true,
      status: "ready",
      qualities: ["balanced", "best"],
      providers: ["CPUExecutionProvider"],
      descriptor: {
        generation: "ocr-3.0.0-cpu",
        artifact: {
          version: "3.0.0",
          target: process.arch === "arm64" ? "linux-arm64-cpu-py311" : "linux-amd64-cpu-py312",
        },
      },
    });
    writeFileSync(
      process.env.FEATURE_MANIFEST_PATH ?? "",
      JSON.stringify({
        bundles: {
          ocr: {
            models: [],
            archives: {
              [process.arch === "arm64" ? "arm64-cpu" : "amd64-gpu"]: {
                compressedSize: 293_000_000,
                extractedSize: 626_000_000,
              },
            },
          },
        },
      }),
    );

    expect(mod.isFeatureInstalled("ocr")).toBe(true);
    const ocr = mod.getFeatureStates().find((state) => state.id === "ocr");

    expect(ocr).toMatchObject({
      status: "installed",
      installedVersion: "3.0.0",
      compatibility: "compatible",
      compatibilityReason: null,
      selectedTarget: process.arch === "arm64" ? "linux-arm64-cpu-py311" : "linux-amd64-cpu-py312",
      missingDownloadBytes: 0,
      installedBytes: 626_000_000,
      healthyGeneration: "ocr-3.0.0-cpu",
      availableQualities: ["fast", "balanced", "best"],
    });
  });

  it("surfaces a corrupt v3 descriptor as an OCR health error", () => {
    ocrRuntime.getCapability.mockReturnValue({
      available: false,
      status: "invalid",
      reason: "descriptor-invalid",
      qualities: [],
      providers: [],
    });

    const ocr = mod.getFeatureStates().find((state) => state.id === "ocr");

    expect(ocr).toMatchObject({
      status: "error",
      compatibility: "invalid",
      compatibilityReason: "descriptor-invalid",
      healthyGeneration: null,
      availableQualities: ["fast"],
    });
    expect(ocr?.error).toMatch(/descriptor.*invalid/i);
  });

  it("keeps a stale incompatible artifact repairable on a supported host", () => {
    const target = process.arch === "arm64" ? "linux-arm64-cpu-py311" : "linux-amd64-cpu-py312";
    ocrRuntime.getCapability.mockReturnValue({
      available: false,
      status: "incompatible",
      reason: "artifact-incompatible",
      qualities: [],
      providers: [],
    });
    writeFileSync(
      process.env.FEATURE_MANIFEST_PATH ?? "",
      JSON.stringify({
        bundles: {
          ocr: {
            models: [],
            targets: {
              [target]: {
                compressedSizeEstimate: 293_502_277,
                extractedSizeEstimate: 656_408_576,
              },
            },
          },
        },
      }),
    );

    const ocr = mod.getFeatureStates().find((state) => state.id === "ocr");

    expect(ocr).toMatchObject({
      status: "error",
      compatibility: "compatible",
      compatibilityReason: "artifact-incompatible",
      selectedTarget: target,
      missingDownloadBytes: 293_502_277,
      availableQualities: ["fast"],
    });
  });

  it("reports unsupported OCR hosts without inventing a selected target", () => {
    ocrRuntime.selectTarget.mockReturnValue(null);
    ocrRuntime.getCapability.mockReturnValue({
      available: false,
      status: "incompatible",
      reason: "unsupported-host",
      qualities: [],
      providers: [],
    });

    const ocr = mod.getFeatureStates().find((state) => state.id === "ocr");

    expect(ocr).toMatchObject({
      status: "error",
      compatibility: "incompatible",
      compatibilityReason: "unsupported-host",
      selectedTarget: null,
      missingDownloadBytes: null,
      availableQualities: ["fast"],
    });
  });

  it("reports signed-manifest memory incompatibility before an accurate runtime download", () => {
    const target = process.arch === "arm64" ? "linux-arm64-cpu-py311" : "linux-amd64-cpu-py312";
    ocrRuntime.getEffectiveMemory.mockReturnValue(3 * 1024 ** 3);
    writeFileSync(
      process.env.FEATURE_MANIFEST_PATH ?? "",
      JSON.stringify({
        bundles: {
          ocr: {
            models: [],
            targets: {
              [target]: {
                compressedSizeEstimate: 217_000_000,
                extractedSizeEstimate: 429_000_000,
                minimumMemoryBytes: 4 * 1024 ** 3,
              },
            },
          },
        },
      }),
    );

    const ocr = mod.getFeatureStates().find((state) => state.id === "ocr");

    expect(ocr).toMatchObject({
      status: "not_installed",
      compatibility: "incompatible",
      compatibilityReason: "insufficient-memory",
      selectedTarget: target,
      missingDownloadBytes: null,
      requiredMemoryBytes: 4 * 1024 ** 3,
      effectiveMemoryBytes: 3 * 1024 ** 3,
      availableQualities: ["fast"],
    });
    expect(ocr?.error).toMatch(/4 GiB.*3 GiB.*Fast OCR remains available/i);
  });

  it("reports configured memory when an installed OCR runtime becomes incompatible", () => {
    const target = process.arch === "arm64" ? "linux-arm64-cpu-py311" : "linux-amd64-cpu-py312";
    ocrRuntime.getCapability.mockReturnValue({
      available: false,
      status: "incompatible",
      reason: "insufficient-memory",
      qualities: [],
      providers: [],
    });
    ocrRuntime.getEffectiveMemory.mockReturnValue(3 * 1024 ** 3);
    writeFileSync(
      join(tempDir, "feature-manifest.json"),
      JSON.stringify({
        bundles: {
          ocr: {
            models: [],
            targets: {
              [target]: {
                compressedSizeEstimate: 217_000_000,
                extractedSizeEstimate: 429_000_000,
                minimumMemoryBytes: 4 * 1024 ** 3,
              },
            },
          },
        },
      }),
    );

    const ocr = mod.getFeatureStates().find((state) => state.id === "ocr");

    expect(ocr).toMatchObject({
      status: "error",
      compatibility: "incompatible",
      compatibilityReason: "insufficient-memory",
      selectedTarget: target,
      requiredMemoryBytes: 4 * 1024 ** 3,
      effectiveMemoryBytes: 3 * 1024 ** 3,
      availableQualities: ["fast"],
    });
    expect(ocr?.error).toMatch(/4 GiB.*3 GiB.*Fast OCR remains available/i);
  });

  it("keeps Fast available when the container memory controller cannot be inspected", () => {
    ocrRuntime.getEffectiveMemory.mockImplementation(() => {
      throw new Error("unable to read the process cgroup memory capacity");
    });

    const ocr = mod.getFeatureStates().find((state) => state.id === "ocr");

    expect(ocr).toMatchObject({
      status: "not_installed",
      compatibility: "incompatible",
      compatibilityReason: "memory-capacity-unknown",
      effectiveMemoryBytes: null,
      missingDownloadBytes: null,
      availableQualities: ["fast"],
    });
    expect(ocr?.error).toMatch(/cannot safely determine.*memory.*Fast OCR remains available/i);
  });

  it("lock held for bundle returns installing", () => {
    mod.acquireInstallLock("ocr");
    const states = mod.getFeatureStates();
    const ocr = states.find((s) => s.id === "ocr");
    expect(ocr?.status).toBe("installing");
  });

  it("lock held + progress set returns installing with progress data", () => {
    mod.acquireInstallLock("ocr");
    mod.setInstallProgress("ocr", { percent: 42, stage: "downloading" }, null);
    const states = mod.getFeatureStates();
    const ocr = states.find((s) => s.id === "ocr");
    expect(ocr?.status).toBe("installing");
    expect(ocr?.progress).toEqual({ percent: 42, stage: "downloading" });
  });

  it("lock held + progress with error returns error with message", () => {
    mod.acquireInstallLock("ocr");
    mod.setInstallProgress("ocr", { percent: 80, stage: "verifying" }, "Checksum mismatch");
    const states = mod.getFeatureStates();
    const ocr = states.find((s) => s.id === "ocr");
    expect(ocr?.status).toBe("error");
    expect(ocr?.error).toBe("Checksum mismatch");
  });

  it("installed bundle + missing model returns error with model error", () => {
    mod.markInstalled("background-removal", "1.0.0", ["u2net.onnx"]);
    writeTestManifest({
      "background-removal": { models: [{ id: "u2net", path: "u2net.onnx" }] },
    });
    mod.invalidateCache();
    const states = mod.getFeatureStates();
    const backgroundRemoval = states.find((s) => s.id === "background-removal");
    expect(backgroundRemoval?.status).toBe("error");
    expect(backgroundRemoval?.error).toContain("u2net.onnx");
  });

  it("not installed + stale error progress returns error", () => {
    mod.setInstallProgress("ocr", null, "Install failed: disk full");
    const states = mod.getFeatureStates();
    const ocr = states.find((s) => s.id === "ocr");
    expect(ocr?.status).toBe("error");
    expect(ocr?.error).toBe("Install failed: disk full");
  });

  it("reports a queued bundle as status 'queued'", async () => {
    // The queue is a leaf module feature-status imports FROM; enqueue via the
    // same (freshly reset) instance so getFeatureStates sees it.
    const queue = await import("../../../apps/api/src/lib/feature-install-queue.js");
    queue.enqueue({ bundleId: "ocr", jobId: "job-queued", mutationEpoch: "initial" });
    try {
      const states = mod.getFeatureStates();
      const ocr = states.find((s) => s.id === "ocr");
      expect(ocr?.status).toBe("queued");
      // Bundles not in the queue stay not_installed.
      const face = states.find((s) => s.id === "face-detection");
      expect(face?.status).toBe("not_installed");
    } finally {
      queue.resetQueueState();
    }
  });

  it("the currently-installing (lock) bundle takes precedence over queued", async () => {
    const queue = await import("../../../apps/api/src/lib/feature-install-queue.js");
    // ocr holds the lock (active install); face-detection is queued behind it.
    mod.acquireInstallLock("ocr");
    queue.enqueue({ bundleId: "face-detection", jobId: "job-2", mutationEpoch: "initial" });
    try {
      const states = mod.getFeatureStates();
      expect(states.find((s) => s.id === "ocr")?.status).toBe("installing");
      expect(states.find((s) => s.id === "face-detection")?.status).toBe("queued");
    } finally {
      queue.resetQueueState();
      mod.releaseInstallLock();
    }
  });

  it("each result has correct shape", () => {
    mod.markInstalled("ocr", "1.0.0", []);
    const states = mod.getFeatureStates();
    for (const state of states) {
      expect(state).toHaveProperty("id");
      expect(state).toHaveProperty("name");
      expect(state).toHaveProperty("description");
      expect(state).toHaveProperty("status");
      expect(state).toHaveProperty("installedVersion");
      expect(state).toHaveProperty("estimatedSize");
      expect(state).toHaveProperty("enablesTools");
      expect(state).toHaveProperty("progress");
      expect(state).toHaveProperty("error");
      expect(Array.isArray(state.enablesTools)).toBe(true);
    }

    const ocr = states.find((state) => state.id === "ocr");
    expect(ocr).toHaveProperty("compatibility");
    expect(ocr).toHaveProperty("compatibilityReason");
    expect(ocr).toHaveProperty("selectedTarget");
    expect(ocr).toHaveProperty("missingDownloadBytes");
    expect(ocr).toHaveProperty("healthyGeneration");
    expect(ocr).toHaveProperty("availableQualities");

    const faceDetection = states.find((state) => state.id === "face-detection");
    expect(faceDetection).not.toHaveProperty("compatibility");
    expect(faceDetection).not.toHaveProperty("availableQualities");
  });

  it("surfaces real per-arch download/on-disk sizes from the manifest", () => {
    // Write a manifest carrying archives for both arches; the API should
    // surface the entry matching this host's arch.
    const arch = process.arch === "arm64" ? "arm64-cpu" : "amd64-gpu";
    const other = arch === "arm64-cpu" ? "amd64-gpu" : "arm64-cpu";
    writeFileSync(
      process.env.FEATURE_MANIFEST_PATH ?? "",
      JSON.stringify({
        bundles: {
          ocr: {
            models: [],
            archives: {
              [arch]: { compressedSize: 5_930_000_000, extractedSize: 9_370_000_000 },
              [other]: { compressedSize: 1, extractedSize: 2 },
            },
          },
          // extractedSize omitted / 0 must surface as null, not 0.
          "background-removal": {
            models: [],
            archives: { [arch]: { compressedSize: 4_810_000_000, extractedSize: 0 } },
          },
        },
      }),
    );
    const states = mod.getFeatureStates();
    const ocr = states.find((s) => s.id === "ocr");
    expect(ocr?.downloadBytes).toBe(5_930_000_000);
    expect(ocr?.installedBytes).toBe(9_370_000_000);
    const rembg = states.find((s) => s.id === "background-removal");
    expect(rembg?.downloadBytes).toBe(4_810_000_000);
    expect(rembg?.installedBytes).toBeNull();
    // A bundle with no archives entry surfaces both as null (not undefined/0).
    const transcription = states.find((s) => s.id === "transcription");
    expect(transcription?.downloadBytes).toBeNull();
    expect(transcription?.installedBytes).toBeNull();
  });

  it("surfaces v3 OCR target estimates before release archive metadata exists", () => {
    const target = process.arch === "arm64" ? "linux-arm64-cpu-py311" : "linux-amd64-cpu-py312";
    writeFileSync(
      process.env.FEATURE_MANIFEST_PATH ?? "",
      JSON.stringify({
        bundles: {
          ocr: {
            models: [],
            targets: {
              [target]: {
                compressedSizeEstimate: 293_502_277,
                extractedSizeEstimate: 656_408_576,
              },
            },
          },
        },
      }),
    );

    const ocr = mod.getFeatureStates().find((state) => state.id === "ocr");

    expect(ocr).toMatchObject({
      selectedTarget: target,
      downloadBytes: 293_502_277,
      installedBytes: 656_408_576,
      missingDownloadBytes: 293_502_277,
    });
  });
});

describe("auto-repair state transition (install endpoint logic)", () => {
  it("markUninstalled clears stale entry when models are broken, allowing reinstall", () => {
    mod.markInstalled("background-removal", "1.0.0", ["u2net.onnx"]);
    writeTestManifest({
      "background-removal": {
        models: [{ id: "u2net", path: "u2net.onnx" }],
      },
    });
    mod.invalidateCache();

    expect(mod.isFeatureInstalled("background-removal")).toBe(true);
    const modelError = mod.verifyBundleModels("background-removal");
    expect(modelError).not.toBeNull();

    mod.markUninstalled("background-removal");
    expect(mod.isFeatureInstalled("background-removal")).toBe(false);
  });

  it("does not clear entry when models are healthy", () => {
    mod.markInstalled("background-removal", "1.0.0", ["u2net.onnx"]);
    writeTestManifest({
      "background-removal": {
        models: [{ id: "u2net", path: "u2net.onnx" }],
      },
    });
    writeFileSync(join(modelsDir, "u2net.onnx"), Buffer.alloc(1024));
    mod.invalidateCache();

    expect(mod.isFeatureInstalled("background-removal")).toBe(true);
    const modelError = mod.verifyBundleModels("background-removal");
    expect(modelError).toBeNull();
    expect(mod.isFeatureInstalled("background-removal")).toBe(true);
  });
});

describe("verifyBundleModels", () => {
  it("returns null when all models exist and meet minSize", () => {
    writeTestManifest({
      "background-removal": {
        models: [{ id: "u2net", path: "u2net.onnx", minSize: 10 }],
      },
    });
    writeFileSync(join(modelsDir, "u2net.onnx"), Buffer.alloc(1024));
    expect(mod.verifyBundleModels("background-removal")).toBeNull();
  });

  it("returns error string when model file is missing", () => {
    writeTestManifest({
      "background-removal": {
        models: [{ id: "u2net", path: "u2net.onnx" }],
      },
    });
    const result = mod.verifyBundleModels("background-removal");
    expect(result).toBe("Missing model file: u2net.onnx");
  });

  it("returns error string when model file is undersized", () => {
    writeTestManifest({
      "background-removal": {
        models: [{ id: "u2net", path: "u2net.onnx", minSize: 1000 }],
      },
    });
    writeFileSync(join(modelsDir, "u2net.onnx"), Buffer.alloc(10));
    const result = mod.verifyBundleModels("background-removal");
    expect(result).toContain("undersized");
  });

  it("returns null when manifest is missing", () => {
    expect(mod.verifyBundleModels("background-removal")).toBeNull();
  });

  it("returns null when bundle not in manifest", () => {
    writeTestManifest({ "some-other-bundle": { models: [] } });
    expect(mod.verifyBundleModels("background-removal")).toBeNull();
  });
});

describe("ensureAiDirs", () => {
  it("creates AI directories when the manifest exists and DATA_DIR is writable", () => {
    writeTestManifest({});
    mod.ensureAiDirs();
    expect(existsSync(join(aiDir, "venv"))).toBe(true);
    expect(existsSync(modelsDir)).toBe(true);
    expect(existsSync(join(aiDir, "pip-cache"))).toBe(true);
  });

  it("warns instead of throwing when DATA_DIR is uncreatable", async () => {
    // Point DATA_DIR below a regular file so mkdir fails (ENOTDIR), the same
    // failure class as the default /data on a sealed macOS root (ENOENT).
    const blocker = join(tempDir, "blocker");
    writeFileSync(blocker, "not a directory");
    process.env.DATA_DIR = join(blocker, "data");
    writeTestManifest({});
    vi.resetModules();
    mod = await import("../../../apps/api/src/lib/feature-status.js");

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => mod.ensureAiDirs()).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Cannot create AI directories"));
    errorSpy.mockRestore();
  });

  // /.dockerenv always exists inside the test container, which makes
  // isDockerEnvironment() true regardless of the manifest path; skip there.
  it.skipIf(existsSync("/.dockerenv"))(
    "is a no-op outside managed environments (no manifest, no /.dockerenv)",
    async () => {
      process.env.FEATURE_MANIFEST_PATH = join(tempDir, "missing-manifest.json");
      process.env.DATA_DIR = join(tempDir, "fresh-data");
      vi.resetModules();
      mod = await import("../../../apps/api/src/lib/feature-status.js");

      mod.ensureAiDirs();
      expect(existsSync(join(tempDir, "fresh-data"))).toBe(false);
    },
  );
});
