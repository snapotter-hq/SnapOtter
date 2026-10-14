import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const scriptPath = join(process.cwd(), "packages/ai/python/install_feature.py");

const hostPython = (() => {
  const out = execFileSync(
    "python3",
    [
      "-c",
      [
        "import json, os, sys, sysconfig",
        "scheme = 'venv' if 'venv' in sysconfig.get_scheme_names() else 'posix_prefix'",
        "rel_sp = os.path.relpath(sysconfig.get_path('purelib', scheme, vars={'base': '/v', 'platbase': '/v'}), '/v')",
        "base_exe = getattr(sys, '_base_executable', None) or sys.executable",
        "print(json.dumps({'executable': base_exe, 'relSitePackages': rel_sp}))",
      ].join("; "),
    ],
    { encoding: "utf-8" },
  ).trim();
  return JSON.parse(out) as { executable: string; relSitePackages: string };
})();

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
  sitePackagesDir = join(venvDir, hostPython.relSitePackages);
  manifestPath = join(tempDir, "feature-manifest.json");

  mkdirSync(sitePackagesDir, { recursive: true });
  mkdirSync(join(venvDir, "bin"), { recursive: true });
  symlinkSync(hostPython.executable, join(venvDir, "bin", "python3"));
  writeFileSync(
    join(venvDir, "pyvenv.cfg"),
    `home = ${dirname(hostPython.executable)}\ninclude-system-site-packages = false\n`,
  );
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

/** Ensure venv/bin/python3 and pyvenv.cfg exist so the venv interpreter runs. */
function linkVenvPython() {
  const binPy = join(venvDir, "bin", "python3");
  if (!existsSync(binPy)) {
    mkdirSync(join(venvDir, "bin"), { recursive: true });
    symlinkSync(hostPython.executable, binPy);
  }
  const cfgPath = join(venvDir, "pyvenv.cfg");
  if (!existsSync(cfgPath)) {
    writeFileSync(
      cfgPath,
      `home = ${dirname(hostPython.executable)}\ninclude-system-site-packages = false\n`,
    );
  }
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
    writeManifest("face-detection", tarPath, sha256, { smokeImports: ["json", "sys", "testpkg"] });

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

    const progressFrames = (result.stderr?.toString() ?? "").split("\n").flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as { progress?: number; stage?: string };
        return typeof parsed.progress === "number" ? [parsed] : [];
      } catch {
        return [];
      }
    });
    const percents = progressFrames.map((f) => f.progress as number);
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
    const stageOrder = progressFrames
      .map((f) => f.stage)
      .filter((s) =>
        [
          "Installing packages...",
          "Finalizing...",
          "Verifying installation...",
          "Installing models...",
          "Recording installation...",
          "Complete",
        ].includes(s ?? ""),
      );
    expect(stageOrder).toEqual([
      "Installing packages...",
      "Finalizing...",
      "Verifying installation...",
      "Installing models...",
      "Recording installation...",
      "Complete",
    ]);
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
    expect(existsSync(join(modelsDir, "testmodel", "weights.bin"))).toBe(false);
    expect(existsSync(join(aiDir, "staging-face-detection"))).toBe(false);
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

describe("site-packages resolution and smoke verification (#1236)", () => {
  function expectRejectedInstall(result: ReturnType<typeof installBundle>, pattern: RegExp) {
    expect(result.status).not.toBe(0);
    expect(result.stderr?.toString() ?? "").toMatch(pattern);
    const installed = JSON.parse(readFileSync(join(aiDir, "installed.json"), "utf-8"));
    expect(installed.bundles["face-detection"]).toBeUndefined();
    expect(existsSync(join(modelsDir, "testmodel", "weights.bin"))).toBe(false);
    expect(existsSync(join(aiDir, "venv.writing"))).toBe(false);
    expect(existsSync(join(aiDir, "staging-face-detection"))).toBe(false);
  }

  it("fails the install before moving models or opening venv.writing when the venv has no interpreter", () => {
    unlinkSync(join(venvDir, "bin", "python3"));
    rmSync(sitePackagesDir, { recursive: true, force: true });

    const { tarPath, sha256 } = createTestTar("face-detection");
    writeManifest("face-detection", tarPath, sha256, { smokeImports: ["testpkg"] });

    expectRejectedInstall(installBundle("face-detection", tarPath), /could not be queried/i);
  });

  it("fails the install when the venv interpreter reports a site-packages directory outside the venv", () => {
    // Symlinked host python3 without pyvenv.cfg answers with the host's own
    // site-packages outside venvDir.
    unlinkSync(join(venvDir, "pyvenv.cfg"));

    const { tarPath, sha256 } = createTestTar("face-detection");
    writeManifest("face-detection", tarPath, sha256);

    expectRejectedInstall(
      installBundle("face-detection", tarPath),
      /outside the environment itself/i,
    );
  });

  it("fails the install when the venv interpreter names a site-packages directory that does not exist", () => {
    rmSync(sitePackagesDir, { recursive: true, force: true });

    const { tarPath, sha256 } = createTestTar("face-detection");
    writeManifest("face-detection", tarPath, sha256);

    expectRejectedInstall(
      installBundle("face-detection", tarPath),
      /has no site-packages directory/i,
    );
  });

  it("fails the install with the interpreter stderr when querying sysconfig exits non-zero", () => {
    const binPy = join(venvDir, "bin", "python3");
    unlinkSync(binPy);
    writeFileSync(binPy, "#!/bin/sh\necho 'corrupt python runtime' >&2\nexit 1\n");
    chmodSync(binPy, 0o755);

    const { tarPath, sha256 } = createTestTar("face-detection");
    writeManifest("face-detection", tarPath, sha256);

    expectRejectedInstall(installBundle("face-detection", tarPath), /corrupt python runtime/i);
  });

  it("places site-packages into the path reported by sysconfig even when it does not match lib/python*/site-packages", () => {
    rmSync(sitePackagesDir, { recursive: true, force: true });
    const customSp = join(venvDir, "custom-platlib", "packages");
    mkdirSync(customSp, { recursive: true });

    const binPy = join(venvDir, "bin", "python3");
    unlinkSync(binPy);
    writeFileSync(
      binPy,
      `#!/bin/sh\necho "pth warning on stdout"\necho ${JSON.stringify(customSp)}\n`,
    );
    chmodSync(binPy, 0o755);

    const { tarPath, sha256 } = createTestTar("face-detection");
    writeManifest("face-detection", tarPath, sha256);

    const result = installBundle("face-detection", tarPath);
    expect(result.status, `stderr: ${result.stderr?.toString()}`).toBe(0);
    expect(existsSync(join(customSp, "testpkg", "__init__.py"))).toBe(true);
    expect(existsSync(join(modelsDir, "testmodel", "weights.bin"))).toBe(true);
  });

  it("fails smoke verification instead of skipping it when venv/bin/python3 is missing on a models-only bundle", () => {
    unlinkSync(join(venvDir, "bin", "python3"));

    const buildDir = join(tempDir, "build-models-only");
    mkdirSync(join(buildDir, "models", "testmodel"), { recursive: true });
    writeFileSync(join(buildDir, "models", "testmodel", "weights.bin"), "model-weights");
    writeFileSync(
      join(buildDir, "bundle.json"),
      JSON.stringify({
        bundleId: "face-detection",
        version: "1.0.0-test",
        arch: "amd64-gpu",
        imageVersion: "2.0.0",
        pythonVersion: "3.12",
        models: ["testmodel"],
      }),
    );
    const tarPath = join(tempDir, "models-only.tar.gz");
    execFileSync("tar", ["czf", tarPath, "-C", buildDir, "."]);
    const sha256 = createHash("sha256").update(readFileSync(tarPath)).digest("hex");
    writeManifest("face-detection", tarPath, sha256, { smokeImports: ["json"] });

    const result = installBundle("face-detection", tarPath);
    expectRejectedInstall(result, /verification failed.*does not exist/i);
  });

  it("rolls back site-packages and fails when venv/bin/python3 raises OSError during smoke verification", () => {
    // Seed an existing version of testpkg in the venv so abandon_merge has a
    // superseded version to restore on rollback.
    mkdirSync(join(sitePackagesDir, "testpkg"), { recursive: true });
    mkdirSync(join(sitePackagesDir, "testpkg-0.9.0.dist-info"), { recursive: true });
    writeFileSync(join(sitePackagesDir, "testpkg", "__init__.py"), "# v0.9.0");
    writeFileSync(
      join(sitePackagesDir, "testpkg-0.9.0.dist-info", "RECORD"),
      "testpkg/__init__.py,,\ntestpkg-0.9.0.dist-info/RECORD,,\n",
    );

    const buildDir = join(tempDir, "build-rollback");
    mkdirSync(join(buildDir, "models", "testmodel"), { recursive: true });
    mkdirSync(join(buildDir, "site-packages", "testpkg"), { recursive: true });
    mkdirSync(join(buildDir, "site-packages", "testpkg-1.0.0.dist-info"), { recursive: true });
    writeFileSync(join(buildDir, "models", "testmodel", "weights.bin"), "model-weights");
    writeFileSync(join(buildDir, "site-packages", "testpkg", "__init__.py"), "# v1.0.0");
    writeFileSync(
      join(buildDir, "site-packages", "testpkg-1.0.0.dist-info", "RECORD"),
      "testpkg/__init__.py,,\ntestpkg-1.0.0.dist-info/RECORD,,\n",
    );
    writeFileSync(
      join(buildDir, "bundle.json"),
      JSON.stringify({
        bundleId: "face-detection",
        version: "1.0.0-test",
        arch: "amd64-gpu",
        imageVersion: "2.0.0",
        pythonVersion: "3.12",
        models: ["testmodel"],
      }),
    );
    const tarPath = join(tempDir, "rollback-smoke.tar.gz");
    execFileSync("tar", ["czf", tarPath, "-C", buildDir, "."]);
    const sha256 = createHash("sha256").update(readFileSync(tarPath)).digest("hex");
    writeManifest("face-detection", tarPath, sha256, {
      smokeImports: ["testpkg"],
    });

    // Wrapper answers sysconfig purelib on first invocation, then rewrites its
    // shebang to a nonexistent interpreter so the smoke-import spawn raises
    // FileNotFoundError (OSError) deterministically even when running as root.
    const binPy = join(venvDir, "bin", "python3");
    unlinkSync(binPy);
    writeFileSync(
      binPy,
      [
        "#!/bin/sh",
        'case "$*" in',
        "  *sysconfig*)",
        `    echo ${JSON.stringify(sitePackagesDir)}`,
        `    printf '#!/nonexistent_interpreter_zzz\\n' > ${JSON.stringify(binPy)}`,
        `    chmod 755 ${JSON.stringify(binPy)}`,
        "    ;;",
        "esac",
        "",
      ].join("\n"),
    );
    chmodSync(binPy, 0o755);

    const result = installBundle("face-detection", tarPath);

    expect(result.status).not.toBe(0);
    expect(result.stderr?.toString() ?? "").toMatch(/could not be run/i);
    expect(readFileSync(join(sitePackagesDir, "testpkg", "__init__.py"), "utf-8")).toBe("# v0.9.0");
    expect(existsSync(join(sitePackagesDir, "testpkg-0.9.0.dist-info"))).toBe(true);
    expect(existsSync(join(sitePackagesDir, "testpkg-1.0.0.dist-info"))).toBe(false);
    expect(existsSync(join(modelsDir, "testmodel", "weights.bin"))).toBe(false);
    expect(existsSync(join(venvDir, ".superseded"))).toBe(false);
    expect(existsSync(join(aiDir, "staging-face-detection"))).toBe(false);
    expect(existsSync(join(aiDir, "venv.writing"))).toBe(false);
    const installed = JSON.parse(readFileSync(join(aiDir, "installed.json"), "utf-8"));
    expect(installed.bundles["face-detection"]).toBeUndefined();
  });

  it("returns empty string and diagnostic reason on timeout, OSError, empty stdout, relative path, symlink escape, or non-directory", () => {
    const pyCheck = spawnSync(
      "python3",
      [
        "-c",
        `
import importlib.util, os, subprocess, tempfile

spec = importlib.util.spec_from_file_location("inst", ${JSON.stringify(scriptPath)})
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

with tempfile.TemporaryDirectory() as d:
    venv = os.path.join(d, "venv")
    outside = os.path.join(d, "outside")
    os.makedirs(os.path.join(venv, "bin"), exist_ok=True)
    os.makedirs(outside, exist_ok=True)
    py = os.path.join(venv, "bin", "python3")
    with open(py, "w") as f:
        f.write("#!/bin/sh\\nexit 0\\n")
    os.chmod(py, 0o755)

    real_run = mod.subprocess.run

    def raise_timeout(*a, **kw):
        raise subprocess.TimeoutExpired(cmd=a[0], timeout=10)
    mod.subprocess.run = raise_timeout
    assert mod.get_site_packages_dir(venv) == ""
    sp, err = mod._probe_site_packages_dir(venv)
    assert sp == "" and "could not be queried" in err

    def raise_oserror(*a, **kw):
        raise OSError("exec format error")
    mod.subprocess.run = raise_oserror
    assert mod.get_site_packages_dir(venv) == ""
    sp, err = mod._probe_site_packages_dir(venv)
    assert sp == "" and "exec format error" in err

    class FakeResult:
        def __init__(self, returncode, stdout="", stderr=""):
            self.returncode = returncode
            self.stdout = stdout
            self.stderr = stderr

    mod.subprocess.run = lambda *a, **kw: FakeResult(0, "   \\n")
    sp, err = mod._probe_site_packages_dir(venv)
    assert sp == "" and "python3 exited with status 0" in err

    mod.subprocess.run = lambda *a, **kw: FakeResult(2, "", "")
    sp, err = mod._probe_site_packages_dir(venv)
    assert sp == "" and "python3 exited with status 2" in err

    mod.subprocess.run = lambda *a, **kw: FakeResult(0, "relative/site-packages\\n")
    assert mod.get_site_packages_dir(venv) == ""
    sp, err = mod._probe_site_packages_dir(venv)
    assert sp == "" and "non-absolute" in err

    mod.subprocess.run = lambda *a, **kw: FakeResult(0, venv + "\\n")
    sp, err = mod._probe_site_packages_dir(venv)
    assert sp == "" and "outside the environment itself" in err

    escaped_link = os.path.join(venv, "lib", "python3.12", "site-packages")
    os.makedirs(os.path.dirname(escaped_link), exist_ok=True)
    os.symlink(outside, escaped_link)
    mod.subprocess.run = lambda *a, **kw: FakeResult(0, escaped_link + "\\n")
    assert mod.get_site_packages_dir(venv) == ""
    sp, err = mod._probe_site_packages_dir(venv)
    assert sp == "" and "outside the environment itself" in err

    file_sp = os.path.join(venv, "lib", "python3.12", "not-a-dir")
    with open(file_sp, "w") as f:
        f.write("file")
    mod.subprocess.run = lambda *a, **kw: FakeResult(0, file_sp + "\\n")
    sp, err = mod._probe_site_packages_dir(venv)
    assert sp == "" and "has no site-packages directory" in err

    mod.subprocess.run = real_run
`,
      ],
      { encoding: "utf-8" },
    );
    expect(pyCheck.status, `stderr: ${pyCheck.stderr}`).toBe(0);
  });
});

describe("fixup wheel installation and rollback (#2561)", () => {
  function seedExistingTestPkg() {
    mkdirSync(join(sitePackagesDir, "testpkg"), { recursive: true });
    mkdirSync(join(sitePackagesDir, "testpkg-0.9.0.dist-info"), { recursive: true });
    writeFileSync(join(sitePackagesDir, "testpkg", "__init__.py"), "# v0.9.0");
    writeFileSync(
      join(sitePackagesDir, "testpkg-0.9.0.dist-info", "RECORD"),
      "testpkg/__init__.py,,\ntestpkg-0.9.0.dist-info/RECORD,,\n",
    );
  }

  function createFixupRollbackTar(wheelName = "broken-1.0.0-py3-none-any.whl"): {
    tarPath: string;
    sha256: string;
  } {
    const buildDir = join(tempDir, "build-fixup-rollback");
    mkdirSync(join(buildDir, "models", "testmodel"), { recursive: true });
    mkdirSync(join(buildDir, "site-packages", "testpkg"), { recursive: true });
    mkdirSync(join(buildDir, "site-packages", "testpkg-1.0.0.dist-info"), { recursive: true });
    mkdirSync(join(buildDir, "fixups"), { recursive: true });
    writeFileSync(join(buildDir, "models", "testmodel", "weights.bin"), "model-weights");
    writeFileSync(join(buildDir, "site-packages", "testpkg", "__init__.py"), "# v1.0.0");
    writeFileSync(
      join(buildDir, "site-packages", "testpkg-1.0.0.dist-info", "RECORD"),
      "testpkg/__init__.py,,\ntestpkg-1.0.0.dist-info/RECORD,,\n",
    );
    writeFileSync(join(buildDir, "fixups", wheelName), "not-a-valid-wheel-zip");
    writeFileSync(
      join(buildDir, "bundle.json"),
      JSON.stringify({
        bundleId: "face-detection",
        version: "1.0.0-test",
        arch: "amd64-gpu",
        imageVersion: "2.0.0",
        pythonVersion: "3.12",
        models: ["testmodel"],
      }),
    );
    const tarPath = join(tempDir, "fixup-rollback.tar.gz");
    execFileSync("tar", ["czf", tarPath, "-C", buildDir, "."]);
    rmSync(buildDir, { recursive: true, force: true });
    const sha256 = createHash("sha256").update(readFileSync(tarPath)).digest("hex");
    return { tarPath, sha256 };
  }

  function expectRolledBackTestPkg() {
    expect(readFileSync(join(sitePackagesDir, "testpkg", "__init__.py"), "utf-8")).toBe("# v0.9.0");
    expect(existsSync(join(sitePackagesDir, "testpkg-0.9.0.dist-info"))).toBe(true);
    expect(existsSync(join(sitePackagesDir, "testpkg-1.0.0.dist-info"))).toBe(false);
    expect(existsSync(join(modelsDir, "testmodel", "weights.bin"))).toBe(false);
    expect(existsSync(join(venvDir, ".superseded"))).toBe(false);
    expect(existsSync(join(aiDir, "staging-face-detection"))).toBe(false);
    expect(existsSync(join(aiDir, "venv.writing"))).toBe(false);
    const installed = JSON.parse(readFileSync(join(aiDir, "installed.json"), "utf-8"));
    expect(installed.bundles["face-detection"]).toBeUndefined();
  }

  it("brackets fixup pip install with venv.writing and rolls back site-packages when pip exits non-zero", () => {
    seedExistingTestPkg();
    const { tarPath, sha256 } = createFixupRollbackTar();
    writeManifest("face-detection", tarPath, sha256, { models: [] });

    const markerSeenDuringPip = join(tempDir, "marker-seen.txt");
    const binPy = join(venvDir, "bin", "python3");
    unlinkSync(binPy);
    writeFileSync(
      binPy,
      [
        "#!/bin/sh",
        'case "$*" in',
        "  *sysconfig*)",
        `    echo ${JSON.stringify(sitePackagesDir)}`,
        "    ;;",
        "  *pip*install*)",
        `    if [ -f ${JSON.stringify(join(aiDir, "venv.writing"))} ]; then`,
        `      cp ${JSON.stringify(join(aiDir, "venv.writing"))} ${JSON.stringify(markerSeenDuringPip)}`,
        "    fi",
        "    echo 'ERROR: Wheel broken-1.0.0-py3-none-any.whl is invalid' >&2",
        "    exit 1",
        "    ;;",
        "esac",
        "",
      ].join("\n"),
    );
    chmodSync(binPy, 0o755);

    const result = installBundle("face-detection", tarPath);

    expect(result.status).not.toBe(0);
    expect(result.stderr?.toString() ?? "").toMatch(
      /Failed to install fixup wheel 'broken'.*Wheel broken-1\.0\.0-py3-none-any\.whl is invalid/s,
    );
    expect(existsSync(markerSeenDuringPip)).toBe(true);
    expect(JSON.parse(readFileSync(markerSeenDuringPip, "utf-8")).bundleId).toBe("face-detection");
    expectRolledBackTestPkg();
  });

  it("rolls back site-packages and fails when venv/bin/python3 is missing during apply_fixups", () => {
    seedExistingTestPkg();
    const { tarPath, sha256 } = createFixupRollbackTar();
    writeManifest("face-detection", tarPath, sha256, { models: [] });

    const binPy = join(venvDir, "bin", "python3");
    unlinkSync(binPy);
    writeFileSync(
      binPy,
      [
        "#!/bin/sh",
        'case "$*" in',
        "  *sysconfig*)",
        `    echo ${JSON.stringify(sitePackagesDir)}`,
        `    rm -f ${JSON.stringify(binPy)}`,
        "    ;;",
        "esac",
        "",
      ].join("\n"),
    );
    chmodSync(binPy, 0o755);

    const result = installBundle("face-detection", tarPath);

    expect(result.status).not.toBe(0);
    expect(result.stderr?.toString() ?? "").toMatch(/Python interpreter.*does not exist/i);
    expectRolledBackTestPkg();
  });

  it("rolls back site-packages and fails when venv/bin/python3 raises OSError during apply_fixups", () => {
    seedExistingTestPkg();
    const { tarPath, sha256 } = createFixupRollbackTar();
    writeManifest("face-detection", tarPath, sha256, { models: [] });

    const binPy = join(venvDir, "bin", "python3");
    unlinkSync(binPy);
    writeFileSync(
      binPy,
      [
        "#!/bin/sh",
        'case "$*" in',
        "  *sysconfig*)",
        `    echo ${JSON.stringify(sitePackagesDir)}`,
        `    printf '#!/nonexistent_interpreter_zzz\\n' > ${JSON.stringify(binPy)}`,
        `    chmod 755 ${JSON.stringify(binPy)}`,
        "    ;;",
        "esac",
        "",
      ].join("\n"),
    );
    chmodSync(binPy, 0o755);

    const result = installBundle("face-detection", tarPath);

    expect(result.status).not.toBe(0);
    expect(result.stderr?.toString() ?? "").toMatch(/could not be run/i);
    expectRolledBackTestPkg();
  });

  it("rolls back and fails on TimeoutExpired or empty-stderr pip failure, and clears venv.writing on success", () => {
    const pyCheck = spawnSync(
      "python3",
      [
        "-c",
        `
import importlib.util, json, os, subprocess, tempfile

spec = importlib.util.spec_from_file_location("inst", ${JSON.stringify(scriptPath)})
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def setup_case(d):
    venv = os.path.join(d, "venv")
    sp = os.path.join(venv, "lib", "python3.12", "site-packages")
    quarantine = os.path.join(venv, ".superseded")
    staging = os.path.join(d, "staging-face-detection")
    marker = os.path.join(d, "venv.writing")
    os.makedirs(os.path.join(venv, "bin"), exist_ok=True)
    os.makedirs(sp, exist_ok=True)
    os.makedirs(os.path.join(staging, "fixups"), exist_ok=True)
    py = os.path.join(venv, "bin", "python3")
    with open(py, "w") as f:
        f.write("#!/bin/sh\\nexit 0\\n")
    os.chmod(py, 0o755)
    with open(os.path.join(staging, "fixups", "nvidia_nccl_cu12-2.21.5-py3-none-manylinux1_x86_64.whl"), "w") as f:
        f.write("wheel")

    # Seed a superseded distribution in quarantine and a placed one in sp
    os.makedirs(os.path.join(sp, "pkg"), exist_ok=True)
    os.makedirs(os.path.join(sp, "pkg-2.0.0.dist-info"), exist_ok=True)
    with open(os.path.join(sp, "pkg", "__init__.py"), "w") as f:
        f.write("v2")
    with open(os.path.join(sp, "pkg-2.0.0.dist-info", "RECORD"), "w") as f:
        f.write("pkg/__init__.py,,\\npkg-2.0.0.dist-info/RECORD,,\\n")

    os.makedirs(os.path.join(quarantine, "pkg", "1.0.0", "pkg"), exist_ok=True)
    os.makedirs(os.path.join(quarantine, "pkg", "1.0.0", "pkg-1.0.0.dist-info"), exist_ok=True)
    with open(os.path.join(quarantine, "pkg", "1.0.0", "pkg", "__init__.py"), "w") as f:
        f.write("v1")
    with open(os.path.join(quarantine, "pkg", "1.0.0", "pkg-1.0.0.dist-info", "RECORD"), "w") as f:
        f.write("pkg/__init__.py,,\\npkg-1.0.0.dist-info/RECORD,,\\n")

    plan = [{
        "name": "pkg",
        "version": "2.0.0",
        "dist_info": "pkg-2.0.0.dist-info",
        "files": ["pkg/__init__.py", "pkg-2.0.0.dist-info/RECORD"],
        "replaces": {"pkg", "pkg-2.0.0.dist-info"},
        "superseded": [("1.0.0", "pkg-1.0.0.dist-info")],
    }]
    return venv, sp, quarantine, staging, marker, plan

real_run = mod.subprocess.run
errors = []
def fake_fail(msg):
    errors.append(msg)
    raise SystemExit(1)
mod.fail = fake_fail

# 1. TimeoutExpired rolls back and clears marker
with tempfile.TemporaryDirectory() as d:
    venv, sp, quarantine, staging, marker, plan = setup_case(d)
    marker_during_call = []
    def raise_timeout(*a, **kw):
        marker_during_call.append(os.path.exists(marker))
        raise subprocess.TimeoutExpired(cmd=a[0], timeout=60)
    mod.subprocess.run = raise_timeout
    try:
        mod.apply_fixups(staging, venv, sp, plan, quarantine, marker, "face-detection")
        assert False, "expected SystemExit"
    except SystemExit:
        pass
    assert marker_during_call == [True]
    assert not os.path.exists(marker)
    assert not os.path.exists(staging)
    assert open(os.path.join(sp, "pkg", "__init__.py")).read() == "v1"
    assert "Timed out while installing fixup wheel 'nvidia_nccl_cu12'" in errors[-1]

# 2. Non-zero exit with empty stderr/stdout reports exit status; whitespace stderr falls back to stdout
with tempfile.TemporaryDirectory() as d:
    venv, sp, quarantine, staging, marker, plan = setup_case(d)
    class FakeProc:
        returncode = 2
        stdout = ""
        stderr = "   \\n"
    mod.subprocess.run = lambda *a, **kw: FakeProc()
    try:
        mod.apply_fixups(staging, venv, sp, plan, quarantine, marker, "face-detection")
        assert False, "expected SystemExit"
    except SystemExit:
        pass
    assert not os.path.exists(marker)
    assert not os.path.exists(staging)
    assert open(os.path.join(sp, "pkg", "__init__.py")).read() == "v1"
    assert "pip exited with status 2" in errors[-1]

with tempfile.TemporaryDirectory() as d:
    venv, sp, quarantine, staging, marker, plan = setup_case(d)
    class StdoutErrProc:
        returncode = 1
        stdout = "ERROR: Invalid wheel archive on stdout\\n"
        stderr = "   \\n"
    mod.subprocess.run = lambda *a, **kw: StdoutErrProc()
    try:
        mod.apply_fixups(staging, venv, sp, plan, quarantine, marker, "face-detection")
        assert False, "expected SystemExit"
    except SystemExit:
        pass
    assert not os.path.exists(marker)
    assert not os.path.exists(staging)
    assert open(os.path.join(sp, "pkg", "__init__.py")).read() == "v1"
    assert "Invalid wheel archive on stdout" in errors[-1]

# 3. Successful fixup install writes marker during pip and clears it afterward
with tempfile.TemporaryDirectory() as d:
    venv, sp, quarantine, staging, marker, plan = setup_case(d)
    # AppleDouble dotfiles in fixups/ are ignored rather than passed to pip
    with open(os.path.join(staging, "fixups", "._nvidia_nccl_cu12-2.21.5-py3-none-manylinux1_x86_64.whl"), "w") as f:
        f.write("appledouble")
    seen = []
    cmds = []
    class OkProc:
        returncode = 0
        stdout = "Successfully installed nvidia_nccl_cu12"
        stderr = ""
    def ok_run(*a, **kw):
        cmds.append(a[0])
        seen.append(json.loads(open(marker).read())["bundleId"])
        return OkProc()
    mod.subprocess.run = ok_run
    mod.apply_fixups(staging, venv, sp, plan, quarantine, marker, "face-detection")
    assert seen == ["face-detection"]
    assert len(cmds) == 1 and cmds[0][-1] == "nvidia_nccl_cu12"
    assert not os.path.exists(marker)
    assert os.path.exists(staging)
    assert open(os.path.join(sp, "pkg", "__init__.py")).read() == "v2"

# 4. Dotfile-only fixups/ directory is a no-op
with tempfile.TemporaryDirectory() as d:
    venv, sp, quarantine, staging, marker, plan = setup_case(d)
    os.unlink(os.path.join(staging, "fixups", "nvidia_nccl_cu12-2.21.5-py3-none-manylinux1_x86_64.whl"))
    with open(os.path.join(staging, "fixups", "._ignored-1.0.0-py3-none-any.whl"), "w") as f:
        f.write("appledouble")
    called = []
    mod.subprocess.run = lambda *a, **kw: called.append(a)
    mod.apply_fixups(staging, venv, sp, plan, quarantine, marker, "face-detection")
    assert called == []
    assert not os.path.exists(marker)

# 5. OSError from os.listdir(fixups_dir) rolls back and fails
with tempfile.TemporaryDirectory() as d:
    venv, sp, quarantine, staging, marker, plan = setup_case(d)
    real_listdir = mod.os.listdir
    def bad_listdir(p):
        if p == os.path.join(staging, "fixups"):
            raise OSError("permission denied reading fixups")
        return real_listdir(p)
    mod.os.listdir = bad_listdir
    try:
        mod.apply_fixups(staging, venv, sp, plan, quarantine, marker, "face-detection")
        assert False, "expected SystemExit"
    except SystemExit:
        pass
    finally:
        mod.os.listdir = real_listdir
    assert not os.path.exists(staging)
    assert open(os.path.join(sp, "pkg", "__init__.py")).read() == "v1"
    assert "Failed to read bundle fixups directory" in errors[-1]

# 6. OSError from mark_venv_writing rolls back without spawning pip
with tempfile.TemporaryDirectory() as d:
    venv, sp, quarantine, staging, marker, plan = setup_case(d)
    called = []
    mod.subprocess.run = lambda *a, **kw: called.append(a)
    missing_dir_marker = os.path.join(d, "missing-dir", "venv.writing")
    try:
        mod.apply_fixups(staging, venv, sp, plan, quarantine, missing_dir_marker, "face-detection")
        assert False, "expected SystemExit"
    except SystemExit:
        pass
    assert called == []
    assert not os.path.exists(staging)
    assert open(os.path.join(sp, "pkg", "__init__.py")).read() == "v1"
    assert "Failed to record venv write marker before installing fixups" in errors[-1]

# 7. When rollback_reconciliation raises OSError during abort, venv.writing stays on disk
with tempfile.TemporaryDirectory() as d:
    venv, sp, quarantine, staging, marker, plan = setup_case(d)
    class FailProc:
        returncode = 1
        stdout = ""
        stderr = "pip error"
    mod.subprocess.run = lambda *a, **kw: FailProc()
    real_rollback = mod.rollback_reconciliation
    def broken_rollback(*a, **kw):
        raise OSError("disk read-only during rollback")
    mod.rollback_reconciliation = broken_rollback
    try:
        mod.apply_fixups(staging, venv, sp, plan, quarantine, marker, "face-detection")
        assert False, "expected SystemExit"
    except SystemExit:
        pass
    finally:
        mod.rollback_reconciliation = real_rollback
    assert os.path.exists(marker), "venv.writing must survive when rollback itself fails"
    assert not os.path.exists(staging)

# 8. OSError from clear_venv_writing after pip succeeds rolls back and fails
with tempfile.TemporaryDirectory() as d:
    venv, sp, quarantine, staging, marker, plan = setup_case(d)
    class OkProc2:
        returncode = 0
        stdout = "ok"
        stderr = ""
    mod.subprocess.run = lambda *a, **kw: OkProc2()
    real_clear = mod.clear_venv_writing
    calls = [0]
    def fail_first_clear(m):
        calls[0] += 1
        if calls[0] == 1:
            raise OSError("unlink EPERM")
        real_clear(m)
    mod.clear_venv_writing = fail_first_clear
    try:
        mod.apply_fixups(staging, venv, sp, plan, quarantine, marker, "face-detection")
        assert False, "expected SystemExit"
    except SystemExit:
        pass
    finally:
        mod.clear_venv_writing = real_clear
    assert not os.path.exists(staging)
    assert open(os.path.join(sp, "pkg", "__init__.py")).read() == "v1"
    assert "Failed to clear venv write marker after installing fixups" in errors[-1]

mod.subprocess.run = real_run
`,
      ],
      { encoding: "utf-8" },
    );
    expect(pyCheck.status, `stderr: ${pyCheck.stderr}`).toBe(0);
  });

  it("rolls back site-packages and leaves models_dir untouched when smoke verification fails or moving models raises OSError (#2562)", () => {
    seedExistingTestPkg();
    const buildDir = join(tempDir, "build-smoke-models-rollback");
    mkdirSync(join(buildDir, "models", "testmodel"), { recursive: true });
    mkdirSync(join(buildDir, "site-packages", "testpkg"), { recursive: true });
    mkdirSync(join(buildDir, "site-packages", "testpkg-1.0.0.dist-info"), { recursive: true });
    writeFileSync(join(buildDir, "models", "testmodel", "weights.bin"), "model-weights");
    writeFileSync(join(buildDir, "site-packages", "testpkg", "__init__.py"), "# v1.0.0");
    writeFileSync(
      join(buildDir, "site-packages", "testpkg-1.0.0.dist-info", "RECORD"),
      "testpkg/__init__.py,,\ntestpkg-1.0.0.dist-info/RECORD,,\n",
    );
    writeFileSync(
      join(buildDir, "bundle.json"),
      JSON.stringify({
        bundleId: "face-detection",
        version: "1.0.0-test",
        arch: "amd64-gpu",
        imageVersion: "2.0.0",
        pythonVersion: "3.12",
        models: ["testmodel"],
      }),
    );
    const tarPath = join(tempDir, "smoke-models-rollback.tar.gz");
    execFileSync("tar", ["czf", tarPath, "-C", buildDir, "."]);
    rmSync(buildDir, { recursive: true, force: true });
    const sha256 = createHash("sha256").update(readFileSync(tarPath)).digest("hex");

    // 1. Smoke import fails with non-zero exit code: neither site-packages nor modelsDir retains files.
    writeManifest("face-detection", tarPath, sha256, {
      smokeImports: ["snapotter_not_a_real_module_zzz"],
    });
    const failedSmoke = installBundle("face-detection", tarPath);
    expect(failedSmoke.status).not.toBe(0);
    expect(failedSmoke.stderr?.toString() ?? "").toMatch(/verification failed/i);
    expectRolledBackTestPkg();

    // 2. Smoke import passes, but moving models into modelsDir raises OSError (modelsDir is a file):
    // site-packages is still rolled back cleanly and installed.json is not updated.
    rmSync(modelsDir, { recursive: true, force: true });
    writeFileSync(modelsDir, "blocking-file-at-models-dir");
    writeManifest("face-detection", tarPath, sha256, {
      smokeImports: ["testpkg"],
    });
    const failedMove = installBundle("face-detection", tarPath);
    expect(failedMove.status).not.toBe(0);
    expect(failedMove.stderr?.toString() ?? "").toMatch(/Failed to install bundle files/i);
    expect(readFileSync(join(sitePackagesDir, "testpkg", "__init__.py"), "utf-8")).toBe("# v0.9.0");
    expect(existsSync(join(sitePackagesDir, "testpkg-0.9.0.dist-info"))).toBe(true);
    expect(existsSync(join(sitePackagesDir, "testpkg-1.0.0.dist-info"))).toBe(false);
    expect(existsSync(join(venvDir, ".superseded"))).toBe(false);
    expect(existsSync(join(aiDir, "staging-face-detection"))).toBe(false);
    expect(existsSync(join(aiDir, "venv.writing"))).toBe(false);
    const installed = JSON.parse(readFileSync(join(aiDir, "installed.json"), "utf-8"));
    expect(installed.bundles["face-detection"]).toBeUndefined();

    // 3. Smoke import TimeoutExpired and ENOSPC during model move also roll back cleanly without leaving models.
    unlinkSync(modelsDir);
    mkdirSync(modelsDir, { recursive: true });
    const pyCheck = spawnSync(
      "python3",
      [
        "-c",
        `
import errno, importlib.util, json, os, subprocess, sys

spec = importlib.util.spec_from_file_location("inst", ${JSON.stringify(scriptPath)})
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

errors = []
def fake_fail(msg):
    errors.append(msg)
    raise SystemExit(1)
mod.fail = fake_fail
mod.emit_progress = lambda p, s: None

os.environ["PYTHON_VENV_PATH"] = ${JSON.stringify(venvDir)}
os.environ["SNAPOTTER_BUNDLE_LOCAL_PATH"] = ${JSON.stringify(tarPath)}
sys.argv = ["install_feature.py", "face-detection", ${JSON.stringify(manifestPath)}, ${JSON.stringify(modelsDir)}]

real_run = mod.subprocess.run
def timeout_on_smoke(cmd, *a, **kw):
    if "-c" in cmd and "import testpkg" in cmd[-1]:
        raise subprocess.TimeoutExpired(cmd=cmd, timeout=300)
    return real_run(cmd, *a, **kw)

mod.subprocess.run = timeout_on_smoke
try:
    mod._install()
    assert False, "expected SystemExit on smoke timeout"
except SystemExit:
    pass
finally:
    mod.subprocess.run = real_run

assert "Installation verification timed out" in errors[-1], errors[-1]
assert not os.path.exists(os.path.join(${JSON.stringify(modelsDir)}, "testmodel", "weights.bin"))
assert not os.path.exists(os.path.join(${JSON.stringify(aiDir)}, "staging-face-detection"))
assert not os.path.exists(os.path.join(${JSON.stringify(venvDir)}, ".superseded"))
assert open(os.path.join(${JSON.stringify(sitePackagesDir)}, "testpkg", "__init__.py")).read() == "# v0.9.0"

real_move_tree = mod.move_tree
def enospc_on_models(src, dst, *a, **kw):
    if dst == ${JSON.stringify(modelsDir)}:
        raise OSError(errno.ENOSPC, "No space left on device")
    return real_move_tree(src, dst, *a, **kw)

mod.move_tree = enospc_on_models
try:
    mod._install()
    assert False, "expected SystemExit on models ENOSPC"
except SystemExit:
    pass
finally:
    mod.move_tree = real_move_tree

assert "Ran out of disk space while installing the bundle" in errors[-1], errors[-1]
assert not os.path.exists(os.path.join(${JSON.stringify(modelsDir)}, "testmodel", "weights.bin"))
assert not os.path.exists(os.path.join(${JSON.stringify(aiDir)}, "staging-face-detection"))
assert not os.path.exists(os.path.join(${JSON.stringify(venvDir)}, ".superseded"))
assert open(os.path.join(${JSON.stringify(sitePackagesDir)}, "testpkg", "__init__.py")).read() == "# v0.9.0"
`,
      ],
      { encoding: "utf-8" },
    );
    expect(pyCheck.status, `stderr: ${pyCheck.stderr}`).toBe(0);
  });

  it("brackets CUDA/OpenCV fallback pip installs with venv.writing, surfaces fallback pip errors, and rolls back pip writes when verification still fails (#2563)", () => {
    seedExistingTestPkg();
    // Seed pre-existing onnxruntime_gpu and opencv_python in the shared venv
    mkdirSync(join(sitePackagesDir, "onnxruntime"), { recursive: true });
    mkdirSync(join(sitePackagesDir, "onnxruntime_gpu-1.20.1.dist-info"), { recursive: true });
    writeFileSync(join(sitePackagesDir, "onnxruntime", "__init__.py"), "# gpu-1.20.1");
    writeFileSync(
      join(sitePackagesDir, "onnxruntime_gpu-1.20.1.dist-info", "RECORD"),
      "onnxruntime/__init__.py,,\nonnxruntime_gpu-1.20.1.dist-info/RECORD,,\n",
    );

    mkdirSync(join(sitePackagesDir, "cv2"), { recursive: true });
    mkdirSync(join(sitePackagesDir, "opencv_python-4.10.0.84.dist-info"), { recursive: true });
    writeFileSync(join(sitePackagesDir, "cv2", "__init__.py"), "# gui-4.10.0.84");
    writeFileSync(
      join(sitePackagesDir, "opencv_python-4.10.0.84.dist-info", "RECORD"),
      "cv2/__init__.py,,\nopencv_python-4.10.0.84.dist-info/RECORD,,\n",
    );

    const buildDir = join(tempDir, "build-remediation-rollback");
    mkdirSync(join(buildDir, "models", "testmodel"), { recursive: true });
    mkdirSync(join(buildDir, "site-packages", "testpkg"), { recursive: true });
    mkdirSync(join(buildDir, "site-packages", "testpkg-1.0.0.dist-info"), { recursive: true });
    writeFileSync(join(buildDir, "models", "testmodel", "weights.bin"), "model-weights");
    writeFileSync(join(buildDir, "site-packages", "testpkg", "__init__.py"), "# v1.0.0");
    writeFileSync(
      join(buildDir, "site-packages", "testpkg-1.0.0.dist-info", "RECORD"),
      "testpkg/__init__.py,,\ntestpkg-1.0.0.dist-info/RECORD,,\n",
    );
    writeFileSync(
      join(buildDir, "bundle.json"),
      JSON.stringify({
        bundleId: "face-detection",
        version: "1.0.0-test",
        arch: "amd64-gpu",
        imageVersion: "2.0.0",
        pythonVersion: "3.12",
        models: ["testmodel"],
      }),
    );
    const tarPath = join(tempDir, "remediation-rollback.tar.gz");
    execFileSync("tar", ["czf", tarPath, "-C", buildDir, "."]);
    rmSync(buildDir, { recursive: true, force: true });
    const sha256 = createHash("sha256").update(readFileSync(tarPath)).digest("hex");

    writeManifest("face-detection", tarPath, sha256, {
      smokeImports: ["onnxruntime", "cv2", "testpkg"],
    });

    const pyCheck = spawnSync(
      "python3",
      [
        "-c",
        `
import importlib.util, json, os, shutil, subprocess, sys

spec = importlib.util.spec_from_file_location("inst", ${JSON.stringify(scriptPath)})
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

ai_dir = ${JSON.stringify(aiDir)}
venv_dir = ${JSON.stringify(venvDir)}
sp_dir = ${JSON.stringify(sitePackagesDir)}
models_dir = ${JSON.stringify(modelsDir)}
manifest_path = ${JSON.stringify(manifestPath)}
tar_path = ${JSON.stringify(tarPath)}
marker = os.path.join(ai_dir, "venv.writing")

os.environ["PYTHON_VENV_PATH"] = venv_dir
os.environ["SNAPOTTER_BUNDLE_LOCAL_PATH"] = tar_path
sys.argv = ["install_feature.py", "face-detection", manifest_path, models_dir]

real_run = mod.subprocess.run
errors = []
def fake_fail(msg):
    errors.append(msg)
    raise SystemExit(1)
mod.fail = fake_fail
mod.emit_progress = lambda p, s: None

class ProcResult:
    def __init__(self, returncode, stdout="", stderr=""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr

def assert_clean_baseline():
    assert open(os.path.join(sp_dir, "testpkg", "__init__.py")).read() == "# v0.9.0"
    assert os.path.isdir(os.path.join(sp_dir, "testpkg-0.9.0.dist-info"))
    assert not os.path.exists(os.path.join(sp_dir, "testpkg-1.0.0.dist-info"))
    assert open(os.path.join(sp_dir, "onnxruntime", "__init__.py")).read() == "# gpu-1.20.1"
    assert not os.path.exists(os.path.join(sp_dir, "onnxruntime", "cpu_extra.py"))
    assert os.path.isdir(os.path.join(sp_dir, "onnxruntime_gpu-1.20.1.dist-info"))
    assert not os.path.exists(os.path.join(sp_dir, "onnxruntime-1.20.1.dist-info"))
    assert open(os.path.join(sp_dir, "cv2", "__init__.py")).read() == "# gui-4.10.0.84"
    assert not os.path.exists(os.path.join(sp_dir, "cv2", "headless_extra.py"))
    assert os.path.isdir(os.path.join(sp_dir, "opencv_python-4.10.0.84.dist-info"))
    assert not os.path.exists(os.path.join(sp_dir, "opencv_contrib_python_headless-4.10.0.84.dist-info"))
    assert not os.path.exists(marker)
    assert not os.path.exists(os.path.join(venv_dir, ".superseded"))
    assert not os.path.exists(os.path.join(ai_dir, "staging-face-detection"))

# 1. ONNX fallback pip exits non-zero: venv.writing held during pip, partial writes undone, pip stderr surfaced
marker_seen_onnx = []
def onnx_pip_fails(cmd, *a, **kw):
    joined = " ".join(cmd)
    if "sysconfig" in joined or "version_info" in joined:
        return real_run(cmd, *a, **kw)
    if "-m pip install" in joined and "onnxruntime==1.20.1" in joined:
        marker_seen_onnx.append(os.path.exists(marker) and json.loads(open(marker).read())["bundleId"])
        with open(os.path.join(sp_dir, "onnxruntime", "__init__.py"), "w") as f:
            f.write("# half-broken-cpu")
        return ProcResult(1, "", "ERROR: Could not connect to pypi.org for onnxruntime==1.20.1\\nNo matching distribution")
    if "-c" in cmd and "import onnxruntime" in cmd[-1]:
        return ProcResult(1, "", "ImportError: libcudart.so.12: cannot open shared object file")
    return real_run(cmd, *a, **kw)

mod.subprocess.run = onnx_pip_fails
try:
    mod._install()
    assert False, "expected SystemExit"
except SystemExit:
    pass
assert marker_seen_onnx == ["face-detection"], f"marker_seen_onnx={marker_seen_onnx}"
assert "libcudart.so.12" in errors[-1], errors[-1]
assert "Could not connect to pypi.org for onnxruntime==1.20.1" in errors[-1], errors[-1]
assert_clean_baseline()

# 2. ONNX fallback pip succeeds (writes CPU files + deletes onnxruntime_gpu dist-info),
#    OpenCV fallback pip also succeeds (writes headless files + deletes opencv_python dist-info),
#    then subsequent smoke re-check still fails: both pip writes and dist-info deletions are rolled back!
markers_seen_both = []
smoke_calls = [0]
def both_remediations_then_smoke_fails(cmd, *a, **kw):
    joined = " ".join(cmd)
    if "sysconfig" in joined or "version_info" in joined:
        return real_run(cmd, *a, **kw)
    if "-m pip install" in joined and "onnxruntime==1.20.1" in joined:
        markers_seen_both.append(("onnx", os.path.exists(marker)))
        with open(os.path.join(sp_dir, "onnxruntime", "__init__.py"), "w") as f:
            f.write("# cpu-1.20.1")
        with open(os.path.join(sp_dir, "onnxruntime", "cpu_extra.py"), "w") as f:
            f.write("# extra")
        os.makedirs(os.path.join(sp_dir, "onnxruntime-1.20.1.dist-info"), exist_ok=True)
        with open(os.path.join(sp_dir, "onnxruntime-1.20.1.dist-info", "RECORD"), "w") as f:
            f.write("onnxruntime/__init__.py,,\\nonnxruntime/cpu_extra.py,,\\nonnxruntime-1.20.1.dist-info/RECORD,,\\n")
        return ProcResult(0, "Successfully installed onnxruntime-1.20.1", "")
    if "-m pip install" in joined and "opencv-contrib-python-headless==4.10.0.84" in joined:
        markers_seen_both.append(("opencv-pip", os.path.exists(marker)))
        with open(os.path.join(sp_dir, "cv2", "__init__.py"), "w") as f:
            f.write("# headless-4.10.0.84")
        with open(os.path.join(sp_dir, "cv2", "headless_extra.py"), "w") as f:
            f.write("# headless-extra")
        os.makedirs(os.path.join(sp_dir, "opencv_contrib_python_headless-4.10.0.84.dist-info"), exist_ok=True)
        with open(os.path.join(sp_dir, "opencv_contrib_python_headless-4.10.0.84.dist-info", "RECORD"), "w") as f:
            f.write("cv2/__init__.py,,\\ncv2/headless_extra.py,,\\nopencv_contrib_python_headless-4.10.0.84.dist-info/RECORD,,\\n")
        return ProcResult(0, "Successfully installed opencv-contrib-python-headless-4.10.0.84", "")
    if "opencv_contrib_python_headless-" in joined:
        markers_seen_both.append(("opencv-clean", os.path.exists(marker)))
        shutil.rmtree(os.path.join(sp_dir, "opencv_python-4.10.0.84.dist-info"), ignore_errors=True)
        return ProcResult(0, "", "")
    if "-c" in cmd and "import onnxruntime" in cmd[-1]:
        smoke_calls[0] += 1
        if smoke_calls[0] == 1:
            return ProcResult(1, "", "ImportError: libcudart.so.12: cannot open shared object file")
        if smoke_calls[0] == 2:
            # Verify onnxruntime_gpu dist-info was cleaned up after onnx pip succeeded
            assert not os.path.exists(os.path.join(sp_dir, "onnxruntime_gpu-1.20.1.dist-info"))
            return ProcResult(1, "", "ImportError: libGL.so.1: cannot open shared object file")
        # Third smoke check still fails on another module
        assert not os.path.exists(os.path.join(sp_dir, "opencv_python-4.10.0.84.dist-info"))
        return ProcResult(1, "", "ImportError: testpkg native symbol mismatch")
    return real_run(cmd, *a, **kw)

mod.subprocess.run = both_remediations_then_smoke_fails
try:
    mod._install()
    assert False, "expected SystemExit"
except SystemExit:
    pass
assert markers_seen_both == [("onnx", True), ("opencv-pip", True), ("opencv-clean", True)], markers_seen_both
assert "testpkg native symbol mismatch" in errors[-1], errors[-1]
assert_clean_baseline()

# 3. TimeoutExpired and OSError on fix_cmd and clean_cmd do not crash or leak venv.writing, and surface details
for exc_to_raise, expected_substr in [
    (subprocess.TimeoutExpired(cmd=["pip"], timeout=120), "timed out"),
    (OSError("Exec format error"), "Exec format error"),
]:
    def onnx_pip_raises(cmd, *a, _exc=exc_to_raise, **kw):
        joined = " ".join(cmd)
        if "sysconfig" in joined or "version_info" in joined:
            return real_run(cmd, *a, **kw)
        if "-m pip install" in joined and "onnxruntime==1.20.1" in joined:
            assert os.path.exists(marker)
            raise _exc
        if "-c" in cmd and "import onnxruntime" in cmd[-1]:
            return ProcResult(1, "", "AttributeError: module 'onnxruntime' has no attribute 'SessionOptions'")
        return real_run(cmd, *a, **kw)

    mod.subprocess.run = onnx_pip_raises
    try:
        mod._install()
        assert False, "expected SystemExit"
    except SystemExit:
        pass
    assert expected_substr in errors[-1], errors[-1]
    assert_clean_baseline()

    def opencv_clean_raises(cmd, *a, _exc=exc_to_raise, **kw):
        joined = " ".join(cmd)
        if "sysconfig" in joined or "version_info" in joined:
            return real_run(cmd, *a, **kw)
        if "-m pip install" in joined and "opencv-contrib-python-headless==4.10.0.84" in joined:
            assert os.path.exists(marker)
            return ProcResult(0, "ok", "")
        if "opencv_contrib_python_headless-" in joined:
            assert os.path.exists(marker)
            raise _exc
        if "-c" in cmd and "import onnxruntime" in cmd[-1]:
            return ProcResult(1, "", "ImportError: cv2.abi3.so: undefined symbol")
        return real_run(cmd, *a, **kw)

    mod.subprocess.run = opencv_clean_raises
    try:
        mod._install()
        assert False, "expected SystemExit"
    except SystemExit:
        pass
    assert expected_substr in errors[-1], errors[-1]
    assert_clean_baseline()

# 4. OpenCV pip fails with empty stderr/stdout (reports exit status), does NOT run clean_cmd,
#    and preserves prev_stderr when re-check smoke import exits non-zero with empty stderr
clean_called = []
empty_smoke_calls = [0]
def opencv_pip_empty_fails(cmd, *a, **kw):
    joined = " ".join(cmd)
    if "sysconfig" in joined or "version_info" in joined:
        return real_run(cmd, *a, **kw)
    if "-m pip install" in joined and "opencv-contrib-python-headless==4.10.0.84" in joined:
        with open(os.path.join(sp_dir, "cv2", "__init__.py"), "w") as f:
            f.write("# half-broken-cv2")
        return ProcResult(2, "", "   \\n")
    if "opencv_contrib_python_headless-" in joined:
        clean_called.append(True)
        return ProcResult(0, "", "")
    if "-c" in cmd and "import onnxruntime" in cmd[-1]:
        empty_smoke_calls[0] += 1
        if empty_smoke_calls[0] == 1:
            return ProcResult(1, "", "ImportError: libpng16.so.16: cannot open shared object file")
        return ProcResult(1, "", "   \\n")
    return real_run(cmd, *a, **kw)

mod.subprocess.run = opencv_pip_empty_fails
try:
    mod._install()
    assert False, "expected SystemExit"
except SystemExit:
    pass
assert clean_called == [], "clean_cmd must not run when opencv pip install fails"
assert "libpng16.so.16" in errors[-1], errors[-1]
assert "pip exited with status 2" in errors[-1], errors[-1]
assert_clean_baseline()

# 5. Snapshot ENOSPC, restore_remediation_state OSError, re-check smoke TimeoutExpired, and clear_venv_writing OSError
def opencv_trigger_fail(cmd, *a, **kw):
    joined = " ".join(cmd)
    if "sysconfig" in joined or "version_info" in joined:
        return real_run(cmd, *a, **kw)
    if "-m pip install" in joined and "opencv-contrib-python-headless==4.10.0.84" in joined:
        with open(os.path.join(sp_dir, "cv2", "__init__.py"), "w") as f:
            f.write("# half-broken-cv2")
        return ProcResult(2, "", "   \\n")
    if "-c" in cmd and "import onnxruntime" in cmd[-1]:
        return ProcResult(1, "", "ImportError: libpng16.so.16: cannot open shared object file")
    return real_run(cmd, *a, **kw)

mod.subprocess.run = opencv_trigger_fail
real_snapshot = mod.snapshot_remediation_state
def enospc_snapshot(*a, **kw):
    import errno
    raise OSError(errno.ENOSPC, "No space left on device")
mod.snapshot_remediation_state = enospc_snapshot
try:
    mod._install()
    assert False, "expected SystemExit"
except SystemExit:
    pass
finally:
    mod.snapshot_remediation_state = real_snapshot
assert "Ran out of disk space while preparing opencv fallback" in errors[-1], errors[-1]
assert_clean_baseline()

real_restore_rem = mod.restore_remediation_state
def fail_in_place_restore(sp, q, kind="", remove_backup=True):
    if not remove_backup:
        raise OSError("EIO restoring pre-fallback state")
    return real_restore_rem(sp, q, kind, remove_backup)
mod.restore_remediation_state = fail_in_place_restore
try:
    mod._install()
    assert False, "expected SystemExit"
except SystemExit:
    pass
finally:
    mod.restore_remediation_state = real_restore_rem
assert "could not be restored (EIO restoring pre-fallback state)" in errors[-1], errors[-1]
assert "pip exited with status 2" in errors[-1], errors[-1]
assert_clean_baseline()

recheck_timeout_calls = [0]
def onnx_pip_fails_then_smoke_times_out(cmd, *a, **kw):
    joined = " ".join(cmd)
    if "sysconfig" in joined or "version_info" in joined:
        return real_run(cmd, *a, **kw)
    if "-m pip install" in joined and "onnxruntime==1.20.1" in joined:
        return ProcResult(1, "", "ERROR: Offline network unreachable")
    if "-c" in cmd and "import onnxruntime" in cmd[-1]:
        recheck_timeout_calls[0] += 1
        if recheck_timeout_calls[0] == 1:
            return ProcResult(1, "", "ImportError: libcudart.so.12: cannot open shared object file")
        raise subprocess.TimeoutExpired(cmd=cmd, timeout=300)
    return real_run(cmd, *a, **kw)

mod.subprocess.run = onnx_pip_fails_then_smoke_times_out
try:
    mod._install()
    assert False, "expected SystemExit"
except SystemExit:
    pass
assert "Installation verification timed out" in errors[-1], errors[-1]
assert "Offline network unreachable" in errors[-1], errors[-1]
assert_clean_baseline()

mod.subprocess.run = opencv_trigger_fail
real_clear = mod.clear_venv_writing
clear_calls = [0]
def fail_second_clear(m):
    clear_calls[0] += 1
    # First clear is after move_tree; second clear is after opencv fallback
    if clear_calls[0] == 2:
        raise OSError("EPERM clearing marker after fallback")
    real_clear(m)
mod.clear_venv_writing = fail_second_clear
try:
    mod._install()
    assert False, "expected SystemExit"
except SystemExit:
    pass
finally:
    mod.clear_venv_writing = real_clear
assert "Failed to clear venv write marker after opencv fallback" in errors[-1], errors[-1]
assert_clean_baseline()

# 6. Successful fallback completes the install, keeps CPU onnxruntime, and deletes .superseded
ok_calls = [0]
def onnx_fallback_succeeds(cmd, *a, **kw):
    joined = " ".join(cmd)
    if "sysconfig" in joined or "version_info" in joined:
        return real_run(cmd, *a, **kw)
    if "-m pip install" in joined and "onnxruntime==1.20.1" in joined:
        with open(os.path.join(sp_dir, "onnxruntime", "__init__.py"), "w") as f:
            f.write("# cpu-1.20.1")
        os.makedirs(os.path.join(sp_dir, "onnxruntime-1.20.1.dist-info"), exist_ok=True)
        with open(os.path.join(sp_dir, "onnxruntime-1.20.1.dist-info", "RECORD"), "w") as f:
            f.write("onnxruntime/__init__.py,,\\nonnxruntime-1.20.1.dist-info/RECORD,,\\n")
        return ProcResult(0, "Successfully installed onnxruntime-1.20.1", "")
    if "-c" in cmd and "import onnxruntime" in cmd[-1]:
        ok_calls[0] += 1
        if ok_calls[0] == 1:
            return ProcResult(1, "", "ImportError: libcudnn.so.9: cannot open shared object file")
        return ProcResult(0, "", "")
    return real_run(cmd, *a, **kw)

mod.subprocess.run = onnx_fallback_succeeds
mod._install()
assert open(os.path.join(sp_dir, "onnxruntime", "__init__.py")).read() == "# cpu-1.20.1"
assert os.path.isdir(os.path.join(sp_dir, "onnxruntime-1.20.1.dist-info"))
assert not os.path.exists(os.path.join(sp_dir, "onnxruntime_gpu-1.20.1.dist-info"))
assert open(os.path.join(sp_dir, "testpkg", "__init__.py")).read() == "# v1.0.0"
assert not os.path.exists(marker)
assert not os.path.exists(os.path.join(venv_dir, ".superseded"))

mod.subprocess.run = real_run
`,
      ],
      { encoding: "utf-8" },
    );
    expect(pyCheck.status, `stderr: ${pyCheck.stderr}`).toBe(0);
  });
});
