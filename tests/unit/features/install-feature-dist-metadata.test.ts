// install_feature.py must leave a venv whose dist-info describes the files on
// disk (#4740). Published bundles carry metadata for packages whose files they
// do not ship (inpaint-hq's pillow-12.3.0.dist-info without PIL/, filelock and
// certifi dist-info without their packages); placing it relabelled the venv.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
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

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "snapotter-dist-metadata-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function recordHash(content: string): string {
  return `sha256=${createHash("sha256").update(content).digest("base64url")}`;
}

/**
 * Write `<name>-<version>.dist-info` with a RECORD that hashes `files`. The
 * files themselves are written only when `withFiles` is set, which is how a
 * bundle's orphan metadata looks.
 */
function writeDist(
  sp: string,
  name: string,
  version: string,
  files: Record<string, string>,
  withFiles = true,
) {
  const distInfo = `${name}-${version}.dist-info`;
  mkdirSync(join(sp, distInfo), { recursive: true });
  writeFileSync(
    join(sp, distInfo, "METADATA"),
    `Metadata-Version: 2.1\nName: ${name}\nVersion: ${version}\n`,
  );
  const rows = Object.entries(files).map(
    ([rel, content]) => `${rel},${recordHash(content)},${content.length}`,
  );
  rows.push(`${distInfo}/METADATA,,`, `${distInfo}/RECORD,,`);
  writeFileSync(join(sp, distInfo, "RECORD"), `${rows.join("\n")}\n`);
  if (withFiles) {
    for (const [rel, content] of Object.entries(files)) {
      mkdirSync(dirname(join(sp, rel)), { recursive: true });
      writeFileSync(join(sp, rel), content);
    }
  }
  return distInfo;
}

const PIL13 = { "PIL/__init__.py": "__version__ = '13.0.0'\n", "PIL/Image.py": "# 13\n" };
const PIL12 = { "PIL/__init__.py": "__version__ = '12.3.0'\n", "PIL/Image.py": "# 12\n" };
const FILELOCK_BASE = { "filelock/__init__.py": "__version__ = '4.2.7'\n" };
const FILELOCK_NEW = { "filelock/__init__.py": "__version__ = '4.2.10'\n" };

/** Run a snippet against the installer module; it prints one JSON value. */
function runPython(body: string): unknown {
  const program = [
    "import importlib.util, json, sys",
    `spec = importlib.util.spec_from_file_location("inst", ${JSON.stringify(scriptPath)})`,
    "mod = importlib.util.module_from_spec(spec)",
    "spec.loader.exec_module(mod)",
    body,
  ].join("\n");
  const result = spawnSync("python3", ["-c", program], { encoding: "utf8", timeout: 30_000 });
  expect(result.status, result.stderr).toBe(0);
  const lines = result.stdout.trim().split("\n");
  return JSON.parse(lines[lines.length - 1] ?? "null");
}

function distInfos(sp: string): string[] {
  return readdirSync(sp)
    .filter((e) => e.endsWith(".dist-info"))
    .sort();
}

/**
 * Run install_feature.py on a one-bundle local archive. `live` lays out the
 * venv's site-packages, `base` the base venv's (omitted: no base venv), and
 * `staged` the archive's site-packages.
 */
function installFixture(layout: {
  live: (sp: string) => void;
  staged: (sp: string) => void;
  base?: (sp: string) => void;
}) {
  const aiDir = join(tempDir, "ai");
  const modelsDir = join(aiDir, "models");
  const venvDir = join(aiDir, "venv");
  const sp = join(venvDir, hostPython.relSitePackages);
  mkdirSync(sp, { recursive: true });
  mkdirSync(join(venvDir, "bin"), { recursive: true });
  symlinkSync(hostPython.executable, join(venvDir, "bin", "python3"));
  writeFileSync(
    join(venvDir, "pyvenv.cfg"),
    `home = ${dirname(hostPython.executable)}\ninclude-system-site-packages = false\n`,
  );
  mkdirSync(modelsDir, { recursive: true });
  writeFileSync(join(aiDir, "installed.json"), JSON.stringify({ bundles: {} }));
  layout.live(sp);

  const baseVenv = join(tempDir, "base-venv");
  if (layout.base) {
    const baseSp = join(baseVenv, hostPython.relSitePackages);
    mkdirSync(baseSp, { recursive: true });
    layout.base(baseSp);
  }

  const build = join(tempDir, "build");
  mkdirSync(join(build, "models"), { recursive: true });
  layout.staged(join(build, "site-packages"));
  writeFileSync(
    join(build, "bundle.json"),
    JSON.stringify({ bundleId: "inpaint-hq", version: "1.0.0-test", models: [] }),
  );
  const tarPath = join(tempDir, "inpaint-hq.tar.gz");
  // COPYFILE_DISABLE stops macOS tar adding ._* AppleDouble entries.
  execFileSync("tar", ["czf", tarPath, "-C", build, "."], {
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  const sha256 = createHash("sha256").update(readFileSync(tarPath)).digest("hex");
  const size = readFileSync(tarPath).length;
  const manifestPath = join(tempDir, "feature-manifest.json");
  const archive = { file: tarPath, sha256, compressedSize: size, extractedSize: size * 2 };
  writeFileSync(
    manifestPath,
    JSON.stringify({
      manifestVersion: 2,
      imageVersion: "2.0.0",
      basePackages: ["numpy==1.26.4", "Pillow==13.0.0"],
      bundles: {
        "inpaint-hq": {
          name: "Inpaint",
          archives: { "amd64-gpu": archive, "arm64-cpu": archive },
          models: [],
          enablesTools: [],
        },
      },
    }),
  );

  const run = spawnSync("python3", [scriptPath, "inpaint-hq", manifestPath, modelsDir], {
    env: {
      ...process.env,
      DATA_DIR: tempDir,
      PYTHON_VENV_PATH: venvDir,
      SNAPOTTER_BUNDLE_LOCAL_PATH: tarPath,
      SNAPOTTER_BASE_VENV_PATH: baseVenv,
    },
    encoding: "utf8",
    timeout: 30_000,
  });
  return { sp, run };
}

describe("install_feature.py keeps metadata true to the installed files (#4740)", () => {
  it("installs a bundle carrying orphan base-package metadata without relabelling the venv", () => {
    // The published inpaint-hq archive, in miniature: Pillow's dist-info with
    // no PIL/, filelock's dist-info with no filelock/, and one real package.
    const { sp, run } = installFixture({
      live: (live) => {
        writeDist(live, "pillow", "13.0.0", PIL13);
        writeDist(live, "filelock", "4.2.7", FILELOCK_BASE);
      },
      staged: (staged) => {
        writeDist(staged, "pillow", "12.3.0", PIL12, false);
        writeDist(staged, "filelock", "4.2.10", FILELOCK_NEW, false);
        writeDist(staged, "diffusers", "0.31.0", { "diffusers/__init__.py": "# d\n" });
      },
    });

    expect(run.status, run.stderr).toBe(0);
    expect(distInfos(sp)).toEqual([
      "diffusers-0.31.0.dist-info",
      "filelock-4.2.7.dist-info",
      "pillow-13.0.0.dist-info",
    ]);
    expect(readFileSync(join(sp, "PIL", "__init__.py"), "utf8")).toBe(PIL13["PIL/__init__.py"]);
    expect(existsSync(join(sp, "diffusers", "__init__.py"))).toBe(true);
    expect(run.stderr).toContain("pillow-12.3.0.dist-info");
  });

  it("repairs a relabelled venv once an install succeeds, from the base venv", () => {
    const { sp, run } = installFixture({
      live: (live) => {
        // What an earlier install of inpaint-hq left: 13's files, 12.3.0's metadata.
        writeDist(live, "pillow", "12.3.0", PIL12, false);
        for (const [rel, content] of Object.entries(PIL13)) {
          mkdirSync(dirname(join(live, rel)), { recursive: true });
          writeFileSync(join(live, rel), content);
        }
      },
      base: (base) => writeDist(base, "pillow", "13.0.0", PIL13),
      staged: (staged) => writeDist(staged, "rembg", "2.0.69", { "rembg/__init__.py": "# r\n" }),
    });

    expect(run.status, run.stderr).toBe(0);
    expect(distInfos(sp)).toEqual(["pillow-13.0.0.dist-info", "rembg-2.0.69.dist-info"]);
    expect(run.stderr).toContain("removed metadata that did not match the installed files");
  });

  it("drops orphan metadata from staging but keeps complete and partial distributions", () => {
    const staging = join(tempDir, "staging");
    writeDist(staging, "filelock", "4.2.10", FILELOCK_NEW, false);
    writeDist(staging, "rembg", "2.0.69", { "rembg/__init__.py": "# r\n" });
    // setuptools as upscale-enhance ships it: setuptools/ without _distutils_hack/.
    const partial = writeDist(staging, "setuptools", "74.1.3", {
      "setuptools/__init__.py": "# s\n",
      "_distutils_hack/__init__.py": "# h\n",
    });
    rmSync(join(staging, "_distutils_hack"), { recursive: true });
    // Metadata with no RECORD can't be judged, so it is left in place.
    mkdirSync(join(staging, "norecord-1.0.dist-info"));

    const dropped = runPython(
      `print(json.dumps(mod.drop_orphan_dist_infos(${JSON.stringify(staging)})))`,
    );

    expect(dropped).toEqual(["filelock-4.2.10.dist-info"]);
    expect(distInfos(staging)).toEqual([
      "norecord-1.0.dist-info",
      "rembg-2.0.69.dist-info",
      partial,
    ]);
  });

  it("judges orphans on package files only, not bytecode or scripts outside site-packages", () => {
    const staging = join(tempDir, "staging");
    const tool = writeDist(staging, "tool", "1.0", { "tool/__init__.py": "# t\n" });
    writeFileSync(
      join(staging, tool, "RECORD"),
      [
        "tool/__init__.py,,",
        "tool/__pycache__/__init__.cpython-312.pyc,,",
        "../../../bin/tool,,",
        `${tool}/RECORD,,`,
      ].join("\n"),
    );
    const scriptsOnly = writeDist(staging, "scripts-only", "1.0", {}, false);
    writeFileSync(
      join(staging, scriptsOnly, "RECORD"),
      ["../../../bin/x,,", "x/__pycache__/a.cpython-312.pyc,,"].join("\n"),
    );
    rmSync(join(staging, "tool", "__init__.py"));

    const dropped = runPython(
      `print(json.dumps(mod.drop_orphan_dist_infos(${JSON.stringify(staging)})))`,
    );

    expect(dropped).toEqual([tool]);
    expect(distInfos(staging)).toEqual([scriptsOnly]);
  });

  it("removes staged base packages with their files and leaves files other distributions own", () => {
    const staging = join(tempDir, "staging");
    writeDist(staging, "pillow", "12.3.0", { ...PIL12, "shared/x.py": "# s\n" });
    writeDist(staging, "numpy", "2.1.0", { "numpy/__init__.py": "# n\n" });
    writeDist(staging, "other", "1.0", { "shared/x.py": "# s\n", "other/__init__.py": "# o\n" });

    const dropped = runPython(
      `print(json.dumps(mod.drop_base_distributions(${JSON.stringify(staging)}, mod.base_package_names({"basePackages": ["numpy==1.26.4", "Pillow==13.0.0", "huggingface-hub[hf_xet,hf_transfer]==0.36.2"]}))))`,
    );

    expect(dropped).toEqual(["numpy-2.1.0.dist-info", "pillow-12.3.0.dist-info"]);
    expect(distInfos(staging)).toEqual(["other-1.0.dist-info"]);
    expect(existsSync(join(staging, "PIL"))).toBe(false);
    expect(existsSync(join(staging, "numpy"))).toBe(false);
    expect(existsSync(join(staging, "shared", "x.py"))).toBe(true);
  });

  it("parses base package names with extras, pins and odd spelling", () => {
    const names = runPython(
      `print(json.dumps(sorted(mod.base_package_names({"basePackages": ["numpy==1.26.4", "Pillow==13.0.0", "opencv-python-headless==4.10.0.84", "huggingface-hub[hf_xet,hf_transfer]==0.36.2"]}))))`,
    );
    expect(names).toEqual(["huggingface-hub", "numpy", "opencv-python-headless", "pillow"]);
  });

  it("repairs a venv an earlier install relabelled, using the base venv's metadata", () => {
    const base = join(tempDir, "base");
    const live = join(tempDir, "live");
    writeDist(base, "pillow", "13.0.0", PIL13);
    // The relabelled state: Pillow 13's files under 12.3.0's metadata.
    writeDist(live, "pillow", "12.3.0", PIL12, false);
    for (const [rel, content] of Object.entries(PIL13)) {
      mkdirSync(dirname(join(live, rel)), { recursive: true });
      writeFileSync(join(live, rel), content);
    }

    const repaired = runPython(
      `print(json.dumps(mod.repair_metadata_from_base(${JSON.stringify(live)}, ${JSON.stringify(base)})))`,
    );

    expect(repaired).toEqual(["pillow-12.3.0.dist-info"]);
    expect(distInfos(live)).toEqual(["pillow-13.0.0.dist-info"]);
    expect(readFileSync(join(live, "pillow-13.0.0.dist-info", "RECORD"), "utf8")).toBe(
      readFileSync(join(base, "pillow-13.0.0.dist-info", "RECORD"), "utf8"),
    );
  });

  it("leaves metadata alone when the files match neither it nor the base venv", () => {
    const base = join(tempDir, "base");
    const live = join(tempDir, "live");
    writeDist(base, "pillow", "13.0.0", PIL13);
    writeDist(live, "pillow", "12.3.0", PIL12, false);
    mkdirSync(join(live, "PIL"));
    writeFileSync(join(live, "PIL", "__init__.py"), "# something else\n");

    const repaired = runPython(
      `print(json.dumps(mod.repair_metadata_from_base(${JSON.stringify(live)}, ${JSON.stringify(base)})))`,
    );

    expect(repaired).toEqual([]);
    expect(distInfos(live)).toEqual(["pillow-12.3.0.dist-info"]);
  });

  it("keeps a truthful upgrade of a base package", () => {
    const base = join(tempDir, "base");
    const live = join(tempDir, "live");
    writeDist(base, "filelock", "4.2.7", FILELOCK_BASE);
    writeDist(live, "filelock", "4.2.10", FILELOCK_NEW);

    const repaired = runPython(
      `print(json.dumps(mod.repair_metadata_from_base(${JSON.stringify(live)}, ${JSON.stringify(base)})))`,
    );

    expect(repaired).toEqual([]);
    expect(distInfos(live)).toEqual(["filelock-4.2.10.dist-info"]);
  });

  it("resolves duplicate metadata to the copy the files match", () => {
    const base = join(tempDir, "base");
    const live = join(tempDir, "live");
    writeDist(base, "filelock", "4.2.7", FILELOCK_BASE);
    writeDist(live, "filelock", "4.2.10", FILELOCK_NEW);
    writeDist(live, "filelock", "3.32.2", { "filelock/__init__.py": "# old\n" }, false);

    const repaired = runPython(
      `print(json.dumps(mod.repair_metadata_from_base(${JSON.stringify(live)}, ${JSON.stringify(base)})))`,
    );

    expect(repaired).toEqual(["filelock-3.32.2.dist-info"]);
    expect(distInfos(live)).toEqual(["filelock-4.2.10.dist-info"]);
  });

  it("does nothing when the live venv is the base venv", () => {
    const live = join(tempDir, "live");
    writeDist(live, "pillow", "12.3.0", PIL12, false);
    const repaired = runPython(
      `print(json.dumps(mod.repair_metadata_from_base(${JSON.stringify(live)}, ${JSON.stringify(live)})))`,
    );
    expect(repaired).toEqual([]);
  });

  it("audits duplicates, orphans and relabelled metadata, and passes a clean venv", () => {
    const clean = join(tempDir, "clean");
    writeDist(clean, "pillow", "13.0.0", PIL13);
    writeDist(clean, "filelock", "4.2.7", FILELOCK_BASE);
    expect(
      runPython(`print(json.dumps(mod.audit_distribution_metadata(${JSON.stringify(clean)})))`),
    ).toEqual({ duplicates: {}, orphans: [], mismatched: [] });

    const dirty = join(tempDir, "dirty");
    writeDist(dirty, "pillow", "12.3.0", PIL12, false);
    for (const [rel, content] of Object.entries(PIL13)) {
      mkdirSync(dirname(join(dirty, rel)), { recursive: true });
      writeFileSync(join(dirty, rel), content);
    }
    writeDist(dirty, "certifi", "2026.10.23", { "certifi/__init__.py": "# c\n" }, false);
    writeDist(dirty, "protobuf", "7.35.1", { "google/protobuf/__init__.py": "# 7.35\n" });
    writeDist(dirty, "protobuf", "7.36.2", { "google/protobuf/__init__.py": "# 7.35\n" }, false);

    expect(
      runPython(`print(json.dumps(mod.audit_distribution_metadata(${JSON.stringify(dirty)})))`),
    ).toEqual({
      duplicates: { protobuf: ["protobuf-7.35.1.dist-info", "protobuf-7.36.2.dist-info"] },
      orphans: ["certifi-2026.10.23.dist-info"],
      mismatched: ["pillow-12.3.0.dist-info"],
    });
  });

  it("finds the base venv's site-packages at the live venv's relative path", () => {
    const live = join(tempDir, "data", "venv");
    const base = join(tempDir, "opt", "venv");
    mkdirSync(join(live, hostPython.relSitePackages), { recursive: true });
    mkdirSync(join(base, hostPython.relSitePackages), { recursive: true });
    const found = runPython(
      `print(json.dumps([mod.base_site_packages_for(${JSON.stringify(join(live, hostPython.relSitePackages))}, ${JSON.stringify(live)}, ${JSON.stringify(base)}), mod.base_site_packages_for(${JSON.stringify(join(live, hostPython.relSitePackages))}, ${JSON.stringify(live)}, ${JSON.stringify(join(tempDir, "missing"))})]))`,
    );
    expect(found).toEqual([join(base, hostPython.relSitePackages), ""]);
  });
});
