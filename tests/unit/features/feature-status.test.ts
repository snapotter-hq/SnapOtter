import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mod: typeof import("../../../apps/api/src/lib/feature-status.js");
let tempDir: string;
let aiDir: string;
let modelsDir: string;
let installedPath: string;
let lockPath: string;

beforeEach(async () => {
  vi.resetModules();
  tempDir = mkdtempSync(join(tmpdir(), "snapotter-test-"));
  aiDir = join(tempDir, "ai");
  modelsDir = join(aiDir, "models");
  installedPath = join(aiDir, "installed.json");
  lockPath = join(aiDir, "install.lock");
  mkdirSync(modelsDir, { recursive: true });

  process.env.DATA_DIR = tempDir;
  process.env.FEATURE_MANIFEST_PATH = join(tempDir, "feature-manifest.json");

  mod = await import("../../../apps/api/src/lib/feature-status.js");
});

afterEach(() => {
  delete process.env.DATA_DIR;
  delete process.env.FEATURE_MANIFEST_PATH;
  rmSync(tempDir, { recursive: true, force: true });
});

function writeTestManifest(
  bundles: Record<string, { models: Array<{ id: string; path?: string; minSize?: number }> }>,
) {
  const manifestPath = process.env.FEATURE_MANIFEST_PATH ?? "";
  writeFileSync(manifestPath, JSON.stringify({ bundles }));
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
        bundles: { ocr: { version: "1.0.0", installedAt: "2026-01-01T00:00:00.000Z", models: [] } },
      }),
    );
    mod.invalidateCache();
    expect(mod.isFeatureInstalled("ocr")).toBe(true);
  });
});

describe("Cache behavior", () => {
  it("isFeatureInstalled reads from cache on second call", () => {
    mod.markInstalled("ocr", "1.0.0", []);
    expect(mod.isFeatureInstalled("ocr")).toBe(true);
    writeFileSync(installedPath, JSON.stringify({ bundles: {} }));
    expect(mod.isFeatureInstalled("ocr")).toBe(true);
  });

  it("invalidateCache forces re-read", () => {
    mod.markInstalled("ocr", "1.0.0", []);
    expect(mod.isFeatureInstalled("ocr")).toBe(true);
    writeFileSync(installedPath, JSON.stringify({ bundles: {} }));
    mod.invalidateCache();
    expect(mod.isFeatureInstalled("ocr")).toBe(false);
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

  it("acquireInstallLock returns false when lock already exists", () => {
    mod.acquireInstallLock("ocr");
    expect(mod.acquireInstallLock("face-detection")).toBe(false);
  });

  it("lock file contains valid JSON with bundleId and startedAt fields", () => {
    mod.acquireInstallLock("background-removal");
    const data = JSON.parse(readFileSync(lockPath, "utf-8"));
    expect(data).toHaveProperty("bundleId", "background-removal");
    expect(data).toHaveProperty("startedAt");
    expect(new Date(data.startedAt).toISOString()).toBe(data.startedAt);
  });

  it("releaseInstallLock deletes lock file", () => {
    mod.acquireInstallLock("ocr");
    expect(existsSync(lockPath)).toBe(true);
    mod.releaseInstallLock();
    expect(existsSync(lockPath)).toBe(false);
  });

  it("releaseInstallLock is idempotent", () => {
    mod.releaseInstallLock();
    mod.releaseInstallLock();
    expect(existsSync(lockPath)).toBe(false);
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

  it("getInstallingBundle deletes corrupt lock and returns null", () => {
    writeFileSync(lockPath, "not-valid-json{{{{");
    expect(mod.getInstallingBundle()).toBeNull();
    expect(existsSync(lockPath)).toBe(false);
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
    expect(mod.isFeatureInstalled("ocr")).toBe(true);

    mod.resetAiEnvironment();

    const data = JSON.parse(readFileSync(installedPath, "utf-8"));
    expect(data.bundles).toEqual({});
    expect(mod.isFeatureInstalled("ocr")).toBe(false);
    expect(mod.isFeatureInstalled("background-removal")).toBe(false);
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

  it("removes stale install lock", () => {
    writeFileSync(
      lockPath,
      JSON.stringify({ bundleId: "ocr", startedAt: "2026-01-01T00:00:00.000Z" }),
    );
    mod.recoverInterruptedInstalls();
    expect(existsSync(lockPath)).toBe(false);
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
    mod.markInstalled("ocr", "1.0.0", []);
    expect(mod.isFeatureInstalled("ocr")).toBe(true);
    writeFileSync(installedPath, JSON.stringify({ bundles: {} }));
    expect(mod.isFeatureInstalled("ocr")).toBe(true);
    mod.recoverInterruptedInstalls();
    expect(mod.isFeatureInstalled("ocr")).toBe(false);
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
  it("all bundles not_installed when installed.json is empty", () => {
    const states = mod.getFeatureStates();
    for (const state of states) {
      expect(state.status).toBe("not_installed");
    }
    expect(states.length).toBe(7);
  });

  it("installed bundle with valid models returns installed with version", () => {
    mod.markInstalled("ocr", "3.5.0", ["ppocr.onnx"]);
    writeTestManifest({
      ocr: { models: [{ id: "ppocr", path: "ppocr.onnx" }] },
    });
    writeFileSync(join(modelsDir, "ppocr.onnx"), Buffer.alloc(100));
    mod.invalidateCache();
    const states = mod.getFeatureStates();
    const ocr = states.find((s) => s.id === "ocr");
    expect(ocr?.status).toBe("installed");
    expect(ocr?.installedVersion).toBe("3.5.0");
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
    mod.markInstalled("ocr", "1.0.0", ["ppocr.onnx"]);
    writeTestManifest({
      ocr: { models: [{ id: "ppocr", path: "ppocr.onnx" }] },
    });
    mod.invalidateCache();
    const states = mod.getFeatureStates();
    const ocr = states.find((s) => s.id === "ocr");
    expect(ocr?.status).toBe("error");
    expect(ocr?.error).toContain("ppocr.onnx");
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
    queue.enqueue({ bundleId: "ocr", jobId: "job-queued" });
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
    queue.enqueue({ bundleId: "face-detection", jobId: "job-2" });
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
