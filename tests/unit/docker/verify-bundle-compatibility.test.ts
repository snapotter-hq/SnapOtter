// Runs docker/verify-bundle-compatibility.sh against a scratch venv and manifest
// so each documented exit code is observed from the real control flow. The
// script hardcodes /app/docker/feature-manifest.json and /opt/venv, so the copy
// under test rewrites those two paths to scratch locations.
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = resolve("docker/verify-bundle-compatibility.sh");
const FIXTURE = "snapotter-verify-fixture";

interface Fixture {
  /** Packages installed in the scratch venv, as [name, version]. */
  installed?: Array<[string, string]>;
  /** Constraints declared in the scratch manifest. */
  constraints?: string[];
  /** Whether the scratch manifest exists at all. */
  manifest?: boolean;
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

  const manifest = join(dir, "feature-manifest.json");
  if (opts.manifest !== false) {
    writeFileSync(
      manifest,
      JSON.stringify({
        bundles: { alpha: {} },
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

  it("exits 1 when the manifest is missing (integrity failure)", () => {
    const run = runVerify({ manifest: false });
    expect(run.status).toBe(1);
    expect(run.output).toContain("Manifest not found");
  });
});
