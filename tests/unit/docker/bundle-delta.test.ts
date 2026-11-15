// docker/bundle-delta.py is the build-bundle.sh pass that keeps a bundle from
// shipping a dist-info without its files (#4740). Runs the real script against
// scratch trees laid out like a build venv and its Step 6 delta.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = resolve("docker/bundle-delta.py");

let dir: string;
let buildSp: string;
let staging: string;
let manifest: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "bundle-delta-"));
  buildSp = join(dir, "site-packages");
  staging = join(dir, "staging");
  manifest = join(dir, "feature-manifest.json");
  mkdirSync(buildSp, { recursive: true });
  mkdirSync(staging, { recursive: true });
  writeFileSync(manifest, JSON.stringify({ basePackages: ["Pillow==13.0.0", "numpy==1.26.4"] }));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A dist-info whose RECORD lists `files`; written under each root given. */
function dist(name: string, version: string, files: string[], metaRoots: string[]) {
  const distInfo = `${name}-${version}.dist-info`;
  for (const root of metaRoots) {
    mkdirSync(join(root, distInfo), { recursive: true });
    writeFileSync(
      join(root, distInfo, "RECORD"),
      `${[...files.map((f) => `${f},sha256=x,1`), `${distInfo}/RECORD,,`, "../../../bin/tool,,"].join("\n")}\n`,
    );
  }
  return distInfo;
}

function put(root: string, rel: string) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), rel);
}

function run() {
  const result = spawnSync("python3", [SCRIPT, buildSp, staging, manifest], {
    encoding: "utf8",
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

const entries = (root: string) => readdirSync(root).sort();

describe("docker/bundle-delta.py", () => {
  it("ships the files of an upgraded package whose directory the base venv already had", () => {
    // The build upgraded filelock 4.2.7 (base) to 4.2.10; filelock/ already
    // existed in the base venv, so Step 6 staged only the new dist-info.
    put(buildSp, "filelock/__init__.py");
    put(buildSp, "filelock/_api.py");
    dist("filelock", "4.2.10", ["filelock/__init__.py", "filelock/_api.py"], [buildSp, staging]);

    const r = run();

    expect(r.status, r.output).toBe(0);
    expect(entries(staging)).toEqual(["filelock", "filelock-4.2.10.dist-info"]);
    expect(entries(join(staging, "filelock"))).toEqual(["__init__.py", "_api.py"]);
    expect(r.output).toContain("Completed filelock-4.2.10.dist-info: copied 2 file(s)");
  });

  it("drops a manifest base package and every staged file it owns", () => {
    dist("pillow", "12.3.0", ["PIL/__init__.py", "pillow.libs/libz.so"], [staging]);
    put(staging, "pillow.libs/libz.so");

    const r = run();

    expect(r.status, r.output).toBe(0);
    expect(entries(staging)).toEqual([]);
    expect(r.output).toContain("removed 1 staged file(s)");
  });

  it("keeps a file another staged distribution also owns", () => {
    dist("numpy", "2.1.0", ["numpy/__init__.py", "shared/common.py"], [staging]);
    put(staging, "numpy/__init__.py");
    dist("other", "1.0", ["other/__init__.py", "shared/common.py"], [staging]);
    put(staging, "other/__init__.py");
    put(staging, "shared/common.py");

    const r = run();

    expect(r.status, r.output).toBe(0);
    expect(entries(staging)).toEqual(["other", "other-1.0.dist-info", "shared"]);
  });

  it("completes a distribution whose files sit partly in a top-level directory the base venv had", () => {
    put(buildSp, "_distutils_hack/__init__.py");
    put(staging, "newtool/__init__.py");
    dist("newtool", "1.0", ["newtool/__init__.py", "_distutils_hack/__init__.py"], [staging]);

    const r = run();

    expect(r.status, r.output).toBe(0);
    expect(existsSync(join(staging, "_distutils_hack", "__init__.py"))).toBe(true);
    expect(r.output).toContain("Completed newtool-1.0.dist-info: copied 1 file(s)");
  });

  it("ignores bytecode and paths outside site-packages in RECORD", () => {
    put(staging, "tool/__init__.py");
    dist(
      "tool",
      "1.0",
      ["tool/__init__.py", "tool/__pycache__/__init__.cpython-312.pyc"],
      [staging],
    );

    const r = run();

    expect(r.status, r.output).toBe(0);
    expect(r.output).toContain("Delta metadata consistent: 1 distribution(s), 0 dropped");
  });

  it("fails when a staged distribution's files exist nowhere", () => {
    dist("ghost", "1.0", ["ghost/__init__.py"], [staging]);

    const r = run();

    expect(r.status).toBe(1);
    expect(r.output).toContain("ERROR: ghost-1.0.dist-info lists 1 file(s)");
  });
});
