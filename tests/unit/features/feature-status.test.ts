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
});

describe("Composite state - getFeatureStates", () => {
  it("all bundles not_installed when installed.json is empty", () => {
    const states = mod.getFeatureStates();
    for (const state of states) {
      expect(state.status).toBe("not_installed");
    }
    expect(states.length).toBe(6);
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
});
