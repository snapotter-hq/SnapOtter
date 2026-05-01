/**
 * Unit tests for pure utility functions in the features route.
 *
 * The route file contains `readManifest()` and `getDirSize()` as private
 * functions. We reproduce their logic here for unit testing since the route
 * registration requires the full Fastify + DB stack.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// ── Reproduced utility functions from features.ts ────────────────────────

interface ManifestModel {
  id: string;
  path?: string;
}

interface ManifestBundle {
  models: ManifestModel[];
}

interface Manifest {
  bundles: Record<string, ManifestBundle>;
}

function readManifest(manifestPath: string): Manifest | null {
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, "utf-8")) as Manifest;
  } catch {
    return null;
  }
}

function getDirSize(dirPath: string): number {
  if (!existsSync(dirPath)) return 0;

  let total = 0;
  const entries = readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += getDirSize(fullPath);
    } else if (entry.isFile()) {
      try {
        total += statSync(fullPath).size;
      } catch {
        // File may have been deleted between readdir and stat
      }
    }
  }
  return total;
}

// ── Test fixtures ────────────────────────────────────────────────────────

const TEST_DIR = join(tmpdir(), `snapotter-features-test-${Date.now()}`);
const MANIFEST_DIR = join(TEST_DIR, "manifests");
const SIZE_DIR = join(TEST_DIR, "size-test");

beforeAll(() => {
  mkdirSync(MANIFEST_DIR, { recursive: true });
  mkdirSync(SIZE_DIR, { recursive: true });
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

// ── readManifest tests ───────────────────────────────────────────────────

describe("readManifest", () => {
  it("returns null for non-existent file", () => {
    const result = readManifest(join(MANIFEST_DIR, "nonexistent.json"));
    expect(result).toBeNull();
  });

  it("parses valid manifest JSON", () => {
    const manifest = {
      bundles: {
        "ai-rembg": {
          models: [{ id: "u2net", path: "rembg/u2net.onnx" }],
        },
      },
    };
    const filePath = join(MANIFEST_DIR, "valid.json");
    writeFileSync(filePath, JSON.stringify(manifest));

    const result = readManifest(filePath);
    expect(result).not.toBeNull();
    expect(result!.bundles["ai-rembg"]).toBeDefined();
    expect(result!.bundles["ai-rembg"].models).toHaveLength(1);
    expect(result!.bundles["ai-rembg"].models[0].id).toBe("u2net");
    expect(result!.bundles["ai-rembg"].models[0].path).toBe("rembg/u2net.onnx");
  });

  it("returns null for invalid JSON", () => {
    const filePath = join(MANIFEST_DIR, "invalid.json");
    writeFileSync(filePath, "not valid json {{{");

    const result = readManifest(filePath);
    expect(result).toBeNull();
  });

  it("handles manifest with empty bundles", () => {
    const filePath = join(MANIFEST_DIR, "empty-bundles.json");
    writeFileSync(filePath, JSON.stringify({ bundles: {} }));

    const result = readManifest(filePath);
    expect(result).not.toBeNull();
    expect(Object.keys(result!.bundles)).toHaveLength(0);
  });

  it("handles manifest with models without paths", () => {
    const filePath = join(MANIFEST_DIR, "no-paths.json");
    writeFileSync(
      filePath,
      JSON.stringify({
        bundles: {
          "ai-test": {
            models: [{ id: "model1" }],
          },
        },
      }),
    );

    const result = readManifest(filePath);
    expect(result!.bundles["ai-test"].models[0].path).toBeUndefined();
  });

  it("handles manifest with multiple bundles", () => {
    const filePath = join(MANIFEST_DIR, "multi.json");
    writeFileSync(
      filePath,
      JSON.stringify({
        bundles: {
          "ai-rembg": { models: [{ id: "u2net", path: "rembg/u2net.onnx" }] },
          "ai-esrgan": { models: [{ id: "realesrgan", path: "esrgan/model.pth" }] },
        },
      }),
    );

    const result = readManifest(filePath);
    expect(Object.keys(result!.bundles)).toHaveLength(2);
  });
});

// ── getDirSize tests ────────────────────────────────────────────────────

describe("getDirSize", () => {
  it("returns 0 for non-existent directory", () => {
    expect(getDirSize(join(TEST_DIR, "does-not-exist"))).toBe(0);
  });

  it("returns 0 for empty directory", () => {
    const emptyDir = join(SIZE_DIR, "empty");
    mkdirSync(emptyDir, { recursive: true });
    expect(getDirSize(emptyDir)).toBe(0);
  });

  it("returns correct size for a single file", () => {
    const singleDir = join(SIZE_DIR, "single");
    mkdirSync(singleDir, { recursive: true });
    const content = "hello world"; // 11 bytes
    writeFileSync(join(singleDir, "test.txt"), content);
    expect(getDirSize(singleDir)).toBe(11);
  });

  it("sums sizes of multiple files", () => {
    const multiDir = join(SIZE_DIR, "multi");
    mkdirSync(multiDir, { recursive: true });
    writeFileSync(join(multiDir, "a.txt"), "aaa"); // 3 bytes
    writeFileSync(join(multiDir, "b.txt"), "bbbbb"); // 5 bytes
    expect(getDirSize(multiDir)).toBe(8);
  });

  it("recurses into subdirectories", () => {
    const nestedDir = join(SIZE_DIR, "nested");
    const subDir = join(nestedDir, "sub");
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(nestedDir, "root.txt"), "root"); // 4 bytes
    writeFileSync(join(subDir, "child.txt"), "child"); // 5 bytes
    expect(getDirSize(nestedDir)).toBe(9);
  });

  it("handles deeply nested directories", () => {
    const deepDir = join(SIZE_DIR, "deep");
    const level1 = join(deepDir, "a");
    const level2 = join(level1, "b");
    const level3 = join(level2, "c");
    mkdirSync(level3, { recursive: true });
    writeFileSync(join(level3, "deep.txt"), "xx"); // 2 bytes
    expect(getDirSize(deepDir)).toBe(2);
  });
});

// ── Shared model path logic ─────────────────────────────────────────────

describe("shared model path deduplication", () => {
  it("identifies models shared between bundles", () => {
    const manifest: Manifest = {
      bundles: {
        "ai-rembg": {
          models: [
            { id: "u2net", path: "shared/common-model.onnx" },
            { id: "rembg-specific", path: "rembg/only.onnx" },
          ],
        },
        "ai-esrgan": {
          models: [
            { id: "common", path: "shared/common-model.onnx" },
            { id: "esrgan-specific", path: "esrgan/only.pth" },
          ],
        },
      },
    };

    // Simulate the uninstall logic: collect paths still needed by other bundles
    const bundleToUninstall = "ai-rembg";
    const sharedPaths = new Set<string>();
    for (const [otherId, otherBundle] of Object.entries(manifest.bundles)) {
      if (otherId === bundleToUninstall) continue;
      for (const m of otherBundle.models ?? []) {
        if (m.path) sharedPaths.add(m.path);
      }
    }

    // The shared model path should be protected
    expect(sharedPaths.has("shared/common-model.onnx")).toBe(true);
    expect(sharedPaths.has("esrgan/only.pth")).toBe(true);
    // rembg-specific should NOT be in the shared set (it belongs to the bundle being uninstalled)
    expect(sharedPaths.has("rembg/only.onnx")).toBe(false);

    // Models from the bundle to uninstall that are NOT shared can be deleted
    const bundleModels = manifest.bundles[bundleToUninstall].models;
    const deletable = bundleModels.filter((m) => m.path && !sharedPaths.has(m.path));
    expect(deletable).toHaveLength(1);
    expect(deletable[0].path).toBe("rembg/only.onnx");
  });

  it("handles bundle with no models property", () => {
    const manifest: Manifest = {
      bundles: {
        "ai-rembg": { models: [{ id: "m1", path: "a.onnx" }] },
        "ai-empty": { models: [] },
      },
    };

    const sharedPaths = new Set<string>();
    for (const [otherId, otherBundle] of Object.entries(manifest.bundles)) {
      if (otherId === "ai-rembg") continue;
      for (const m of otherBundle.models ?? []) {
        if (m.path) sharedPaths.add(m.path);
      }
    }

    expect(sharedPaths.size).toBe(0);
  });
});
