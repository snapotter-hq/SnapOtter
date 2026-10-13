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

describe("OpenCV orphan delta reconciliation and disk precheck (#1248, #1030)", () => {
  it("drops orphan opencv_contrib_python metadata and .libs when a bundle delta has no cv2/ directory", () => {
    // Reproduce Bug 4 from #1248: build-bundle.sh excluded cv2/ (already in
    // basePackages) but leaked opencv_contrib_python.libs/ and its dist-info
    // (claiming cv2/ in RECORD) into the bundle delta. Merging that into a
    // venv whose cv2.abi3.so links against 4.10.0.84's libpng16-ef62451c.so
    // replaced .libs with 4.11.0.86's libpng16-1bde1c40.so while leaving
    // 4.10.0.84's cv2.abi3.so behind.
    const venvCv2 = join(sitePackagesDir, "cv2");
    const venvLibs = join(sitePackagesDir, "opencv_contrib_python.libs");
    const venvDist = join(sitePackagesDir, "opencv_contrib_python-4.10.0.84.dist-info");
    mkdirSync(venvCv2, { recursive: true });
    mkdirSync(venvLibs, { recursive: true });
    mkdirSync(venvDist, { recursive: true });
    writeFileSync(join(venvCv2, "cv2.abi3.so"), "links-libpng16-ef62451c");
    writeFileSync(join(venvLibs, "libpng16-ef62451c.so.16.44.0"), "png-4.10");
    writeFileSync(
      join(venvDist, "RECORD"),
      "cv2/cv2.abi3.so,,\nopencv_contrib_python.libs/libpng16-ef62451c.so.16.44.0,,\n",
    );

    const buildDir = join(tempDir, "build-orphan-cv");
    const stagedLibs = join(buildDir, "site-packages", "opencv_contrib_python.libs");
    const stagedDist = join(buildDir, "site-packages", "opencv_contrib_python-4.11.0.86.dist-info");
    mkdirSync(stagedLibs, { recursive: true });
    mkdirSync(stagedDist, { recursive: true });
    mkdirSync(join(buildDir, "site-packages", "rembg"), { recursive: true });
    writeFileSync(join(buildDir, "site-packages", "rembg", "__init__.py"), "# rembg");
    writeFileSync(join(stagedLibs, "libpng16-1bde1c40.so.16.44.0"), "png-4.11");
    writeFileSync(
      join(stagedDist, "RECORD"),
      "cv2/cv2.abi3.so,,\nopencv_contrib_python.libs/libpng16-1bde1c40.so.16.44.0,,\n",
    );
    writeFileSync(
      join(buildDir, "bundle.json"),
      JSON.stringify({
        bundleId: "background-removal",
        version: "2.0.0",
        arch: "amd64-gpu",
        imageVersion: "2.0.0",
        pythonVersion: "3.12",
        models: [],
      }),
    );

    const tarPath = join(tempDir, "bg-orphan-cv.tar.gz");
    execFileSync("tar", ["czf", tarPath, "-C", buildDir, "."]);
    const sha256 = createHash("sha256").update(readFileSync(tarPath)).digest("hex");
    writeManifest("background-removal", tarPath, sha256, { models: [] });

    const result = installBundle("background-removal", tarPath);
    expect(result.status, `stderr: ${result.stderr?.toString()}`).toBe(0);

    // The venv's matching cv2.abi3.so and libpng16-ef62451c.so stay intact, and
    // the incomplete 4.11.0.86 dist-info / .libs did not overwrite them.
    expect(readFileSync(join(venvCv2, "cv2.abi3.so"), "utf-8")).toBe("links-libpng16-ef62451c");
    expect(existsSync(join(venvLibs, "libpng16-ef62451c.so.16.44.0"))).toBe(true);
    expect(existsSync(join(venvLibs, "libpng16-1bde1c40.so.16.44.0"))).toBe(false);
    expect(existsSync(venvDist)).toBe(true);
    expect(existsSync(join(sitePackagesDir, "opencv_contrib_python-4.11.0.86.dist-info"))).toBe(
      false,
    );
    expect(existsSync(join(sitePackagesDir, "rembg", "__init__.py"))).toBe(true);
  });

  it("credits already-staged partial download bytes and removes the archive before the post-extract disk check", () => {
    const pyCheck = spawnSync(
      "python3",
      [
        "-c",
        `
import importlib.util, os, tempfile

spec = importlib.util.spec_from_file_location("inst", ${JSON.stringify(scriptPath)})
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

with tempfile.TemporaryDirectory() as d:
    staging_base = os.path.join(d, "staging")
    os.makedirs(staging_base, exist_ok=True)
    partial = os.path.join(staging_base, "background-removal-amd64-gpu.tar.gz.partial")
    with open(partial, "wb") as f:
        f.truncate(3 * 1024 ** 3)
    stale_extract = os.path.join(d, "staging-background-removal")
    os.makedirs(stale_extract, exist_ok=True)
    with open(os.path.join(stale_extract, "old.bin"), "wb") as f:
        f.truncate(2 * 1024 ** 3)

    needed = mod.needed_download_disk_bytes(
        d,
        "background-removal",
        "amd64-gpu",
        4 * 1024 ** 3,
        6 * 1024 ** 3,
    )
    # 4 GiB compressed + 6 GiB extracted + 0.5 GiB buffer = 10.5 GiB total,
    # minus 3 GiB already on disk in .partial = 7.5 GiB additional space needed,
    # and the stale staging-background-removal dir is cleaned up before measuring.
    assert not os.path.exists(stale_extract), "stale extraction dir must be removed before precheck"
    expected = (4 + 6) * (1024 ** 3) + 500 * (1024 ** 2) - 3 * (1024 ** 3)
    assert needed == expected, f"expected {expected}, got {needed}"
`,
      ],
      { encoding: "utf-8" },
    );
    expect(pyCheck.status, `stderr: ${pyCheck.stderr}`).toBe(0);
  });

  it("surfaces Python major.minor mismatch and omits the Reset AI Environment hint on native installs", () => {
    linkVenvPython();
    const hostPyMm = execFileSync("python3", [
      "-c",
      "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')",
    ])
      .toString()
      .trim();
    const mismatchedMm = hostPyMm === "3.12" ? "3.11" : "3.12";

    const buildDir = join(tempDir, "build-py-mismatch");
    mkdirSync(join(buildDir, "site-packages", "testpkg"), { recursive: true });
    writeFileSync(join(buildDir, "site-packages", "testpkg", "__init__.py"), "# test");
    writeFileSync(
      join(buildDir, "bundle.json"),
      JSON.stringify({
        bundleId: "background-removal",
        version: "2.0.0",
        arch: "amd64-gpu",
        imageVersion: "2.0.0",
        pythonVersion: `${mismatchedMm}.3`,
        models: [],
      }),
    );
    const tarPath = join(tempDir, "bg-mismatch.tar.gz");
    execFileSync("tar", ["czf", tarPath, "-C", buildDir, "."]);
    const sha256 = createHash("sha256").update(readFileSync(tarPath)).digest("hex");
    writeManifest("background-removal", tarPath, sha256, {
      models: [],
      smokeImports: ["snapotter_missing_c_ext_zzz"],
    });

    const result = installBundle("background-removal", tarPath);
    expect(result.status).not.toBe(0);
    const stderr = result.stderr?.toString() ?? "";
    expect(stderr).toContain(`Python ${mismatchedMm}`);
    expect(stderr).toContain(`Python ${hostPyMm}`);
    // Native installs have no /usr/local/bin/reseed-ai-venv.sh, so telling the
    // user to click Reset AI Environment is misleading (#1248 Bug 3, #796).
    expect(stderr).not.toContain("Reset AI Environment");
  });
});
