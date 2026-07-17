import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const scriptPath = join(process.cwd(), "packages/ai/python/install_feature.py");

let tempDir: string;
let aiDir: string;
let modelsDir: string;
let venvDir: string;
let sitePackagesDir: string;
let manifestPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "snapotter-install-test-"));
  aiDir = join(tempDir, "ai");
  modelsDir = join(aiDir, "models");
  venvDir = join(aiDir, "venv");
  sitePackagesDir = join(venvDir, "lib", "python3.12", "site-packages");
  manifestPath = join(tempDir, "feature-manifest.json");

  mkdirSync(sitePackagesDir, { recursive: true });
  mkdirSync(modelsDir, { recursive: true });
  mkdirSync(join(aiDir, "staging"), { recursive: true });
  writeFileSync(join(aiDir, "installed.json"), JSON.stringify({ bundles: {} }));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function createTestTar(bundleId: string): { tarPath: string; sha256: string } {
  const buildDir = join(tempDir, "build");
  mkdirSync(join(buildDir, "models", "testmodel"), { recursive: true });
  mkdirSync(join(buildDir, "site-packages", "testpkg"), { recursive: true });
  writeFileSync(join(buildDir, "models", "testmodel", "weights.bin"), "model-weights");
  writeFileSync(join(buildDir, "site-packages", "testpkg", "__init__.py"), "# test");
  writeFileSync(
    join(buildDir, "bundle.json"),
    JSON.stringify({
      bundleId,
      version: "1.0.0-test",
      arch: "amd64-gpu",
      imageVersion: "2.0.0",
      pythonVersion: "3.12",
      models: ["testmodel"],
    }),
  );

  const tarPath = join(tempDir, `${bundleId}-test.tar.gz`);
  execFileSync("tar", ["czf", tarPath, "-C", buildDir, "."]);
  rmSync(buildDir, { recursive: true });

  const hash = createHash("sha256").update(readFileSync(tarPath)).digest("hex");
  return { tarPath, sha256: hash };
}

function writeManifest(
  bundleId: string,
  tarPath: string,
  sha256: string,
  extra: Record<string, unknown> = {},
) {
  const size = readFileSync(tarPath).length;
  const manifest = {
    manifestVersion: 2,
    imageVersion: "2.0.0",
    pythonVersion: "3.12",
    basePackages: [],
    bundleRepo: "snapotter/feature-bundles",
    bundles: {
      [bundleId]: {
        name: "Test Bundle",
        archives: {
          "amd64-gpu": { file: tarPath, sha256, compressedSize: size, extractedSize: size * 2 },
          "arm64-cpu": { file: tarPath, sha256, compressedSize: size, extractedSize: size * 2 },
        },
        models: [{ id: "testmodel", path: "testmodel/weights.bin", minSize: 0 }],
        enablesTools: [],
        ...extra,
      },
    },
  };
  writeFileSync(manifestPath, JSON.stringify(manifest));
}

/** Put a real python3 at venv/bin/python3 so the post-install smoke check runs. */
function linkVenvPython() {
  const py = execFileSync("python3", ["-c", "import sys; print(sys.executable)"]).toString().trim();
  mkdirSync(join(venvDir, "bin"), { recursive: true });
  symlinkSync(py, join(venvDir, "bin", "python3"));
}

describe("install_feature.py prebuilt mode", () => {
  it("extracts models and site-packages from a local tar", () => {
    const { tarPath, sha256 } = createTestTar("face-detection");
    writeManifest("face-detection", tarPath, sha256);

    const result = spawnSync("python3", [scriptPath, "face-detection", manifestPath, modelsDir], {
      env: {
        ...process.env,
        DATA_DIR: tempDir,
        PYTHON_VENV_PATH: venvDir,
        SNAPOTTER_BUNDLE_LOCAL_PATH: tarPath,
      },
      timeout: 30_000,
    });

    expect(result.status, `stderr: ${result.stderr?.toString()}`).toBe(0);
    expect(existsSync(join(modelsDir, "testmodel", "weights.bin"))).toBe(true);
    expect(existsSync(join(sitePackagesDir, "testpkg", "__init__.py"))).toBe(true);

    const installed = JSON.parse(readFileSync(join(aiDir, "installed.json"), "utf-8"));
    expect(installed.bundles["face-detection"]).toBeDefined();
    expect(installed.bundles["face-detection"].version).toBe("1.0.0-test");
  });

  it("exits non-zero when checksum mismatches", () => {
    const { tarPath } = createTestTar("face-detection");
    writeManifest("face-detection", tarPath, "badhash".padEnd(64, "0"));

    const result = spawnSync("python3", [scriptPath, "face-detection", manifestPath, modelsDir], {
      env: {
        ...process.env,
        DATA_DIR: tempDir,
        PYTHON_VENV_PATH: venvDir,
        SNAPOTTER_BUNDLE_LOCAL_PATH: tarPath,
      },
      timeout: 30_000,
    });

    expect(result.status).not.toBe(0);
  });

  it("writes progress JSON to stderr", () => {
    const { tarPath, sha256 } = createTestTar("face-detection");
    writeManifest("face-detection", tarPath, sha256);

    const result = spawnSync("python3", [scriptPath, "face-detection", manifestPath, modelsDir], {
      env: {
        ...process.env,
        DATA_DIR: tempDir,
        PYTHON_VENV_PATH: venvDir,
        SNAPOTTER_BUNDLE_LOCAL_PATH: tarPath,
      },
      timeout: 30_000,
    });

    const stderr = result.stderr?.toString() ?? "";
    const progressLines = stderr.split("\n").filter((l) => {
      try {
        const p = JSON.parse(l);
        return typeof p.progress === "number";
      } catch {
        return false;
      }
    });
    expect(progressLines.length).toBeGreaterThan(0);

    const last = JSON.parse(progressLines[progressLines.length - 1]);
    expect(last.progress).toBe(100);
  });

  it("passes the post-install smoke import check and clears the venv-writing breadcrumb", () => {
    linkVenvPython();
    const { tarPath, sha256 } = createTestTar("face-detection");
    writeManifest("face-detection", tarPath, sha256, { smokeImports: ["json", "sys"] });

    const result = spawnSync("python3", [scriptPath, "face-detection", manifestPath, modelsDir], {
      env: {
        ...process.env,
        DATA_DIR: tempDir,
        PYTHON_VENV_PATH: venvDir,
        SNAPOTTER_BUNDLE_LOCAL_PATH: tarPath,
      },
      timeout: 30_000,
    });

    expect(result.status, `stderr: ${result.stderr?.toString()}`).toBe(0);
    const installed = JSON.parse(readFileSync(join(aiDir, "installed.json"), "utf-8"));
    expect(installed.bundles["face-detection"]).toBeDefined();
    // The breadcrumb is cleared once the venv write completes cleanly.
    expect(existsSync(join(aiDir, "venv.writing"))).toBe(false);
  });

  it("fails the install (and does NOT record it) when the smoke import cannot load", () => {
    linkVenvPython();
    const { tarPath, sha256 } = createTestTar("face-detection");
    writeManifest("face-detection", tarPath, sha256, {
      smokeImports: ["snapotter_not_a_real_module_zzz"],
    });

    const result = spawnSync("python3", [scriptPath, "face-detection", manifestPath, modelsDir], {
      env: {
        ...process.env,
        DATA_DIR: tempDir,
        PYTHON_VENV_PATH: venvDir,
        SNAPOTTER_BUNDLE_LOCAL_PATH: tarPath,
      },
      timeout: 30_000,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr?.toString()).toContain("verification failed");
    // Not marked installed, so the tool shows as needing install and a retry is clean.
    const installed = JSON.parse(readFileSync(join(aiDir, "installed.json"), "utf-8"));
    expect(installed.bundles["face-detection"]).toBeUndefined();
  });

  it("honors SNAPOTTER_SKIP_INSTALL_SMOKE=1 as a safety valve for false positives", () => {
    linkVenvPython();
    const { tarPath, sha256 } = createTestTar("face-detection");
    writeManifest("face-detection", tarPath, sha256, {
      smokeImports: ["snapotter_not_a_real_module_zzz"],
    });

    const result = spawnSync("python3", [scriptPath, "face-detection", manifestPath, modelsDir], {
      env: {
        ...process.env,
        DATA_DIR: tempDir,
        PYTHON_VENV_PATH: venvDir,
        SNAPOTTER_BUNDLE_LOCAL_PATH: tarPath,
        SNAPOTTER_SKIP_INSTALL_SMOKE: "1",
      },
      timeout: 30_000,
    });

    expect(result.status, `stderr: ${result.stderr?.toString()}`).toBe(0);
    const installed = JSON.parse(readFileSync(join(aiDir, "installed.json"), "utf-8"));
    expect(installed.bundles["face-detection"]).toBeDefined();
  });
});

/** Build a tar whose site-packages carries a fake onnxruntime of the given flavor. */
function createOnnxTar(
  bundleId: string,
  flavor: "cpu" | "gpu",
): { tarPath: string; sha256: string } {
  const buildDir = join(tempDir, `build-${bundleId}`);
  const capi = join(buildDir, "site-packages", "onnxruntime", "capi");
  mkdirSync(capi, { recursive: true });
  writeFileSync(join(buildDir, "site-packages", "onnxruntime", "__init__.py"), flavor);
  writeFileSync(join(capi, "onnxruntime_pybind11_state.so"), flavor);
  if (flavor === "gpu") {
    writeFileSync(join(capi, "libonnxruntime_providers_cuda.so"), "cuda");
  }
  const distInfo =
    flavor === "gpu" ? "onnxruntime_gpu-1.20.1.dist-info" : "onnxruntime-1.20.1.dist-info";
  mkdirSync(join(buildDir, "site-packages", distInfo), { recursive: true });
  writeFileSync(
    join(buildDir, "site-packages", distInfo, "METADATA"),
    flavor === "gpu" ? "Name: onnxruntime-gpu" : "Name: onnxruntime",
  );
  writeFileSync(
    join(buildDir, "bundle.json"),
    JSON.stringify({
      bundleId,
      version: "1.0.0-test",
      arch: "amd64-gpu",
      imageVersion: "2.0.0",
      pythonVersion: "3.12",
      models: [],
    }),
  );

  const tarPath = join(tempDir, `${bundleId}-test.tar.gz`);
  execFileSync("tar", ["czf", tarPath, "-C", buildDir, "."]);
  rmSync(buildDir, { recursive: true });

  const hash = createHash("sha256").update(readFileSync(tarPath)).digest("hex");
  return { tarPath, sha256: hash };
}

function installBundle(bundleId: string, tarPath: string) {
  return spawnSync("python3", [scriptPath, bundleId, manifestPath, modelsDir], {
    env: {
      ...process.env,
      DATA_DIR: tempDir,
      PYTHON_VENV_PATH: venvDir,
      SNAPOTTER_BUNDLE_LOCAL_PATH: tarPath,
    },
    timeout: 30_000,
  });
}

describe("onnxruntime flavor reconciliation (#490)", () => {
  const cudaLib = () =>
    join(sitePackagesDir, "onnxruntime", "capi", "libonnxruntime_providers_cuda.so");
  const coreLib = () =>
    join(sitePackagesDir, "onnxruntime", "capi", "onnxruntime_pybind11_state.so");

  it("a bundle carrying CPU onnxruntime cannot clobber the venv's GPU build", () => {
    const gpu = createOnnxTar("gpu-bundle", "gpu");
    writeManifest("gpu-bundle", gpu.tarPath, gpu.sha256, { models: [] });
    let result = installBundle("gpu-bundle", gpu.tarPath);
    expect(result.status, `stderr: ${result.stderr?.toString()}`).toBe(0);

    const cpu = createOnnxTar("cpu-bundle", "cpu");
    writeManifest("cpu-bundle", cpu.tarPath, cpu.sha256, { models: [] });
    result = installBundle("cpu-bundle", cpu.tarPath);
    expect(result.status, `stderr: ${result.stderr?.toString()}`).toBe(0);

    // The GPU build survives: CUDA provider intact, core lib not downgraded.
    expect(existsSync(cudaLib())).toBe(true);
    expect(readFileSync(coreLib(), "utf-8")).toBe("gpu");
    // Metadata stays truthful: no CPU dist-info shipped in.
    expect(existsSync(join(sitePackagesDir, "onnxruntime-1.20.1.dist-info"))).toBe(false);
    expect(existsSync(join(sitePackagesDir, "onnxruntime_gpu-1.20.1.dist-info"))).toBe(true);
    // Both bundles still recorded as installed.
    const installed = JSON.parse(readFileSync(join(aiDir, "installed.json"), "utf-8"));
    expect(installed.bundles["gpu-bundle"]).toBeDefined();
    expect(installed.bundles["cpu-bundle"]).toBeDefined();
  });

  it("installing a GPU bundle repairs a venv previously downgraded to the CPU build", () => {
    const cpu = createOnnxTar("cpu-bundle", "cpu");
    writeManifest("cpu-bundle", cpu.tarPath, cpu.sha256, { models: [] });
    let result = installBundle("cpu-bundle", cpu.tarPath);
    expect(result.status, `stderr: ${result.stderr?.toString()}`).toBe(0);

    const gpu = createOnnxTar("gpu-bundle", "gpu");
    writeManifest("gpu-bundle", gpu.tarPath, gpu.sha256, { models: [] });
    result = installBundle("gpu-bundle", gpu.tarPath);
    expect(result.status, `stderr: ${result.stderr?.toString()}`).toBe(0);

    expect(existsSync(cudaLib())).toBe(true);
    expect(readFileSync(coreLib(), "utf-8")).toBe("gpu");
    // The stale CPU metadata is cleared so pip metadata matches reality.
    expect(existsSync(join(sitePackagesDir, "onnxruntime-1.20.1.dist-info"))).toBe(false);
    expect(existsSync(join(sitePackagesDir, "onnxruntime_gpu-1.20.1.dist-info"))).toBe(true);
  });
});
