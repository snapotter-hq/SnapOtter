// Runs docker/verify-bundle-compatibility.sh against a scratch venv and manifest
// so each documented exit code is observed from the real control flow. The
// script hardcodes /app/docker/feature-manifest.json and /opt/venv, so the copy
// under test rewrites those two paths to scratch locations.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = resolve("docker/verify-bundle-compatibility.sh");
const INSTALLER = resolve("packages/ai/python/install_feature.py");
const FIXTURE = "snapotter-verify-fixture";

interface Fixture {
  /** Packages installed in the scratch venv, as [name, version]. */
  installed?: Array<[string, string]>;
  /** Constraints declared in the scratch manifest. */
  constraints?: string[];
  /** Whether the scratch manifest exists at all. */
  manifest?: boolean;
  /** Distributions with a hashed RECORD: [name, version, files, write the files?]. */
  recorded?: Array<[string, string, Record<string, string>, boolean]>;
  /** Bundle archives to layer: id -> site-packages distributions, same shape. */
  bundles?: Record<string, Array<[string, string, Record<string, string>, boolean]>>;
  basePackages?: string[];
}

function writeRecordedDist(
  sp: string,
  [name, version, files, withFiles]: [string, string, Record<string, string>, boolean],
) {
  const distInfo = join(sp, `${name}-${version}.dist-info`);
  mkdirSync(distInfo, { recursive: true });
  writeFileSync(
    join(distInfo, "METADATA"),
    `Metadata-Version: 2.1\nName: ${name}\nVersion: ${version}\n`,
  );
  const rows = Object.entries(files).map(
    ([rel, content]) =>
      `${rel},sha256=${createHash("sha256").update(content).digest("base64url")},1`,
  );
  writeFileSync(join(distInfo, "RECORD"), `${rows.join("\n")}\n`);
  if (!withFiles) return;
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(sp, rel, ".."), { recursive: true });
    writeFileSync(join(sp, rel), content);
  }
}

function buildFixture(opts: Fixture) {
  const dir = mkdtempSync(join(tmpdir(), "verify-bundle-compat-"));
  const venv = join(dir, "venv");
  const sitePackages = join(venv, "lib", "python3.11", "site-packages");
  mkdirSync(join(venv, "bin"), { recursive: true });
  mkdirSync(sitePackages, { recursive: true });

  // The script runs "${VENV}/bin/python3"; this wrapper points it at the
  // scratch site-packages so importlib.metadata sees only the fixture packages.
  const python = join(venv, "bin", "python3");
  writeFileSync(python, `#!/bin/sh\nPYTHONPATH="${sitePackages}" exec python3 "$@"\n`);
  chmodSync(python, 0o755);

  for (const [name, version] of opts.installed ?? []) {
    const distInfo = join(sitePackages, `${name.replace(/-/g, "_")}-${version}.dist-info`);
    mkdirSync(distInfo);
    writeFileSync(
      join(distInfo, "METADATA"),
      `Metadata-Version: 2.1\nName: ${name}\nVersion: ${version}\n`,
    );
  }

  for (const d of opts.recorded ?? []) writeRecordedDist(sitePackages, d);

  const bundlesDir = join(dir, "bundles");
  mkdirSync(bundlesDir);
  for (const [id, dists] of Object.entries(opts.bundles ?? {})) {
    const build = join(dir, `build-${id}`);
    for (const d of dists) writeRecordedDist(join(build, "site-packages"), d);
    execFileSync("tar", ["czf", join(bundlesDir, `${id}-amd64-gpu.tar.gz`), "-C", build, "."], {
      env: { ...process.env, COPYFILE_DISABLE: "1" },
    });
  }

  const manifest = join(dir, "feature-manifest.json");
  if (opts.manifest !== false) {
    writeFileSync(
      manifest,
      JSON.stringify({
        bundles: Object.fromEntries(
          [...new Set(["alpha", ...Object.keys(opts.bundles ?? {})])].map((id) => [id, {}]),
        ),
        basePackages: opts.basePackages ?? [],
        constraints: opts.constraints ?? [],
      }),
    );
  }

  const script = join(dir, "verify-bundle-compatibility.sh");
  const source = readFileSync(SCRIPT, "utf8")
    .replace('MANIFEST="/app/docker/feature-manifest.json"', `MANIFEST="${manifest}"`)
    .replace('VENV="/opt/venv"', `VENV="${venv}"`);
  if (!source.includes(`MANIFEST="${manifest}"`) || !source.includes(`VENV="${venv}"`)) {
    throw new Error("script no longer hardcodes MANIFEST/VENV; update this fixture");
  }
  writeFileSync(script, source);
  chmodSync(script, 0o755);

  return { dir, script };
}

function runVerify(opts: Fixture) {
  const { dir, script } = buildFixture(opts);
  const result = spawnSync("bash", [script, "amd64-gpu", join(dir, "bundles")], {
    encoding: "utf8",
    env: { ...process.env, INSTALL_FEATURE_PY: INSTALLER },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe("verify-bundle-compatibility.sh exit codes", () => {
  it("exits 0 when every constrained package matches its pin", () => {
    const run = runVerify({
      installed: [[FIXTURE, "1.0.0"]],
      constraints: [`${FIXTURE}==1.0.0`],
    });
    expect(run.status).toBe(0);
    expect(run.output).toContain("All bundles for amd64-gpu are mutually compatible");
  });

  it("exits 2 when an installed version differs from its constraint", () => {
    const run = runVerify({
      installed: [[FIXTURE, "2.0.0"]],
      constraints: [`${FIXTURE}==1.0.0`],
    });
    expect(run.status).toBe(2);
    expect(run.output).toContain("Constrained-package consistency check failed");
    expect(run.output).not.toContain("Scanning every package");
  });

  it("exits 2 when two versions of a constrained package are installed together", () => {
    const run = runVerify({
      installed: [
        [FIXTURE, "1.0.0"],
        [FIXTURE, "1.1.0"],
      ],
      constraints: [`${FIXTURE}==1.0.0`],
    });
    expect(run.status).toBe(2);
    expect(run.output).toContain("multiple DIFFERENT versions installed simultaneously");
  });

  it("exits 2 when a dist-info's files are missing from the merged venv (#4740)", () => {
    const run = runVerify({
      recorded: [["certifi", "2026.10.23", { "certifi/__init__.py": "# c" }, false]],
    });
    expect(run.status).toBe(2);
    expect(run.output).toContain(
      "certifi-2026.10.23.dist-info: none of the files its RECORD lists",
    );
    expect(run.output).toContain("Installed metadata does not match the installed files");
  });

  it("exits 2 when one package is left with two dist-info directories (#4740)", () => {
    const run = runVerify({
      recorded: [
        ["filelock", "4.2.7", { "filelock/__init__.py": "# f" }, true],
        ["filelock", "4.2.10", { "filelock/__init__.py": "# f" }, false],
      ],
    });
    expect(run.status).toBe(2);
    expect(run.output).toContain("filelock: 2 dist-info directories");
  });

  it("warns, without failing, when installed files differ from a dist-info's hashes", () => {
    const run = runVerify({
      recorded: [
        ["pillow-files", "0", { "PIL/__init__.py": "# 13" }, true],
        ["pillow", "12.3.0", { "PIL/__init__.py": "# 12" }, false],
      ],
    });
    expect(run.status, run.output).toBe(0);
    expect(run.output).toContain(
      "WARNING: pillow-12.3.0.dist-info: most installed files differ from its RECORD hashes",
    );
  });

  it("layers bundles through the installer, so orphan base-package metadata never lands (#4740)", () => {
    // inpaint-hq as published: pillow-12.3.0.dist-info with no PIL/.
    const run = runVerify({
      basePackages: ["Pillow==13.0.0"],
      recorded: [["pillow", "13.0.0", { "PIL/__init__.py": "# 13" }, true]],
      bundles: {
        "inpaint-hq": [
          ["pillow", "12.3.0", { "PIL/__init__.py": "# 12" }, false],
          ["diffusers", "0.31.0", { "diffusers/__init__.py": "# d" }, true],
        ],
      },
    });
    expect(run.status, run.output).toBe(0);
    expect(run.output).toContain("Installed inpaint-hq");
    expect(run.output).toContain("Every dist-info has its files installed, one per package");
  });

  it("exits 2 when two bundles ship one package at different versions (#4739)", () => {
    const run = runVerify({
      bundles: {
        "background-removal": [
          ["protobuf", "7.36.2", { "google/protobuf/__init__.py": "# 7.36.2" }, true],
        ],
        transcription: [
          ["protobuf", "7.35.1", { "google/protobuf/__init__.py": "# 7.35.1" }, true],
        ],
      },
    });
    expect(run.status, run.output).toBe(2);
    expect(run.output).toContain("protobuf: background-removal 7.36.2, transcription 7.35.1");
    expect(run.output).toContain("Bundles ship different versions of the same package");
  });

  it("passes when every bundle ships the same version of a shared package", () => {
    const run = runVerify({
      bundles: {
        "background-removal": [
          ["protobuf", "7.36.2", { "google/protobuf/__init__.py": "# 7.36.2" }, true],
        ],
        transcription: [
          ["protobuf", "7.36.2", { "google/protobuf/__init__.py": "# 7.36.2" }, true],
        ],
      },
    });
    expect(run.status, run.output).toBe(0);
    expect(run.output).toContain(
      "No package is shipped at more than one version across the bundles",
    );
  });

  it("exits 1 when the manifest is missing (integrity failure)", () => {
    const run = runVerify({ manifest: false });
    expect(run.status).toBe(1);
    expect(run.output).toContain("Manifest not found");
  });
});
