import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Unit tests for the venv upgrade-stamp mechanism: bootstrap_ai_venv in
 * docker/embedded-lib.sh, the function docker/entrypoint.sh calls.
 *
 * It compares /opt/venv/.venv-version (baked into the image at build time)
 * against /data/ai/venv/.venv-version (persisted on the volume). When missing
 * or mismatched, the venv is nuked and re-copied so upgraded base packages
 * take effect immediately.
 *
 * These tests source the real function and point it at temp dirs.
 */

let root: string;
let optVenv: string;
let dataAi: string;
let aiVenv: string;
let aiVenvTmp: string;
let installedJson: string;

const here = dirname(fileURLToPath(import.meta.url));
const ENTRYPOINT_LIB = resolve(here, "../../../docker/entrypoint-lib.sh");
const EMBEDDED_LIB = resolve(here, "../../../docker/embedded-lib.sh");

// Stands in for docker/reseed-ai-venv.sh, which copies between the image's
// fixed paths. bootstrap_ai_venv only decides when to call it.
const RESEED_SCRIPT = `#!/bin/sh
set -e
. "$TEST_ENTRYPOINT_LIB"
rm -rf "$TEST_DATA_AI/venv"
cp -r "$TEST_OPT_VENV" "$TEST_DATA_AI/venv.bootstrapping"
mv "$TEST_DATA_AI/venv.bootstrapping" "$TEST_DATA_AI/venv"
rewrite_venv_paths "$TEST_DATA_AI/venv" "$TEST_OPT_VENV" "$TEST_DATA_AI/venv"
[ -z "$TEST_RESEED_FAIL" ] || exit 1
`;

let reseedScript: string;

function runBootstrap(extraEnv: Record<string, string> = {}): { status: number; out: string } {
  const res = spawnSync(
    "/bin/sh",
    [
      "-c",
      '. "$TEST_ENTRYPOINT_LIB"; . "$TEST_EMBEDDED_LIB"; bootstrap_ai_venv "$TEST_OPT_VENV" "$TEST_DATA_AI" "$TEST_RESEED"',
    ],
    {
      env: {
        TEST_OPT_VENV: optVenv,
        TEST_DATA_AI: dataAi,
        TEST_RESEED: reseedScript,
        TEST_ENTRYPOINT_LIB: ENTRYPOINT_LIB,
        TEST_EMBEDDED_LIB: EMBEDDED_LIB,
        TEST_RESEED_FAIL: "",
        PATH: process.env.PATH,
        // A python3 wrapper on PATH may resolve its venv under $HOME (the fleet
        // hosts do), so the shell needs HOME like any login shell has (#4118).
        HOME: process.env.HOME,
        ...extraEnv,
      },
      encoding: "utf-8",
      timeout: 15_000,
    },
  );
  return { status: res.status ?? 1, out: `${res.stdout ?? ""}${res.stderr ?? ""}`.trim() };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "venv-stamp-"));
  optVenv = join(root, "opt-venv");
  dataAi = join(root, "data-ai");
  aiVenv = join(dataAi, "venv");
  aiVenvTmp = join(dataAi, "venv.bootstrapping");
  installedJson = join(dataAi, "installed.json");

  // Simulate /opt/venv with a stamp and a marker file
  mkdirSync(optVenv, { recursive: true });
  mkdirSync(join(optVenv, "bin"), { recursive: true });
  writeFileSync(join(optVenv, ".venv-version"), "abc123\n");
  writeFileSync(join(optVenv, "marker.txt"), "base-package-content");
  writeFileSync(join(optVenv, "bin", "pip"), `#!${optVenv}/bin/python3\n`);
  writeFileSync(join(optVenv, "bin", "activate"), `VIRTUAL_ENV=${optVenv}\n`);
  writeFileSync(join(optVenv, "pyvenv.cfg"), `command = python3 -m venv ${optVenv}\n`);

  mkdirSync(dataAi, { recursive: true });
  reseedScript = join(root, "reseed.sh");
  writeFileSync(reseedScript, RESEED_SCRIPT);
  chmodSync(reseedScript, 0o755);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("venv upgrade stamp", () => {
  it("bootstraps on first run when no venv exists", () => {
    const { status, out } = runBootstrap();
    expect(status).toBe(0);
    expect(out).toContain("First run: bootstrapping AI venv from base image...");
    expect(out).toContain(`AI venv ready at ${aiVenv}`);
    expect(existsSync(join(aiVenv, ".venv-version"))).toBe(true);
    expect(readFileSync(join(aiVenv, "marker.txt"), "utf-8")).toBe("base-package-content");
    expect(readFileSync(join(aiVenv, "bin", "pip"), "utf-8")).toContain(aiVenv);
    expect(readFileSync(join(aiVenv, "bin", "activate"), "utf-8")).toContain(aiVenv);
    expect(readFileSync(join(aiVenv, "pyvenv.cfg"), "utf-8")).toContain(aiVenv);
    expect(readFileSync(join(aiVenv, "bin", "pip"), "utf-8")).not.toContain(optVenv);
  });

  it("skips when stamps match", () => {
    // Simulate an existing venv with matching stamp
    mkdirSync(aiVenv, { recursive: true });
    writeFileSync(join(aiVenv, ".venv-version"), "abc123\n");

    expect(runBootstrap()).toEqual({ status: 0, out: "" });
  });

  it("repairs copied venv paths even when stamps already match", () => {
    mkdirSync(join(aiVenv, "bin"), { recursive: true });
    writeFileSync(join(aiVenv, ".venv-version"), "abc123\n");
    writeFileSync(join(aiVenv, "bin", "pip"), `#!${optVenv}/bin/python3\n`);
    writeFileSync(join(aiVenv, "bin", "activate"), `VIRTUAL_ENV=${optVenv}\n`);
    writeFileSync(join(aiVenv, "pyvenv.cfg"), `command = python3 -m venv ${optVenv}\n`);

    expect(runBootstrap()).toEqual({ status: 0, out: "" });
    for (const file of [
      join(aiVenv, "bin", "pip"),
      join(aiVenv, "bin", "activate"),
      join(aiVenv, "pyvenv.cfg"),
    ]) {
      const content = readFileSync(file, "utf-8");
      expect(content).toContain(aiVenv);
      expect(content).not.toContain(optVenv);
    }
  });

  it("refreshes when stamps differ (upgrade)", () => {
    // Simulate stale venv with old stamp
    mkdirSync(aiVenv, { recursive: true });
    writeFileSync(join(aiVenv, ".venv-version"), "old-hash\n");
    writeFileSync(join(aiVenv, "stale-file.txt"), "should-be-removed");

    const { status, out } = runBootstrap();
    expect(status).toBe(0);
    expect(out).toContain("Base venv updated (stamp mismatch): refreshing AI venv...");
    expect(out).toContain(`AI venv ready at ${aiVenv}`);
    // Old content replaced with fresh copy
    expect(existsSync(join(aiVenv, "stale-file.txt"))).toBe(false);
    expect(readFileSync(join(aiVenv, "marker.txt"), "utf-8")).toBe("base-package-content");
    expect(readFileSync(join(aiVenv, ".venv-version"), "utf-8")).toBe("abc123\n");
  });

  it("refreshes when venv has no stamp (pre-stamp image upgrade)", () => {
    // Simulate old venv without any stamp file
    mkdirSync(aiVenv, { recursive: true });
    writeFileSync(join(aiVenv, "old-pkg.txt"), "legacy");

    const { status, out } = runBootstrap();
    expect(status).toBe(0);
    expect(out).toContain("Base venv updated (stamp mismatch): refreshing AI venv...");
    expect(out).toContain(`AI venv ready at ${aiVenv}`);
    expect(existsSync(join(aiVenv, "old-pkg.txt"))).toBe(false);
  });

  it("resets installed.json when refreshing", () => {
    // Simulate existing venv + installed bundles
    mkdirSync(aiVenv, { recursive: true });
    writeFileSync(join(aiVenv, ".venv-version"), "old-hash\n");
    writeFileSync(
      installedJson,
      JSON.stringify({
        bundles: {
          "background-removal": {
            version: "1.0.0",
            installedAt: "2025-01-01T00:00:00Z",
          },
        },
      }),
    );

    const { out } = runBootstrap();
    expect(out).toContain(
      "WARNING: Installed AI feature bundles were reset after base venv upgrade.",
    );
    const data = JSON.parse(readFileSync(installedJson, "utf-8"));
    expect(data).toEqual({ bundles: {} });
  });

  it("does not reset installed.json when no bundles were installed", () => {
    // No installed.json exists
    mkdirSync(aiVenv, { recursive: true });
    writeFileSync(join(aiVenv, ".venv-version"), "old-hash\n");

    const { out } = runBootstrap();
    expect(out).toContain(`AI venv ready at ${aiVenv}`);
    expect(out).not.toContain("WARNING: Installed AI feature bundles");
  });

  it("does nothing when /opt/venv has no stamp (old image)", () => {
    // Remove the stamp from the image venv
    rmSync(join(optVenv, ".venv-version"));
    mkdirSync(aiVenv, { recursive: true });
    writeFileSync(join(aiVenv, "existing.txt"), "keep");

    expect(runBootstrap()).toEqual({ status: 0, out: "" });
    // Existing venv untouched
    expect(existsSync(join(aiVenv, "existing.txt"))).toBe(true);
  });

  it("cleans up interrupted bootstrap from previous start", () => {
    mkdirSync(aiVenvTmp, { recursive: true });
    writeFileSync(join(aiVenvTmp, "partial.txt"), "incomplete");

    const { out } = runBootstrap();
    expect(out).toContain("Cleaning up interrupted venv bootstrap...");
    expect(existsSync(aiVenvTmp)).toBe(false);
  });

  it("does nothing when /opt/venv does not exist", () => {
    rmSync(optVenv, { recursive: true });
    expect(runBootstrap()).toEqual({ status: 0, out: "" });
  });

  // Root writes through a read-only mode, so the write can't be made to fail there.
  it.skipIf(process.getuid?.() === 0)(
    "returns 1 when installed.json can't be reset after a reseed",
    () => {
      // A stale installed.json would claim bundles whose packages left with the
      // old venv, so a failed reset has to stop the boot.
      mkdirSync(aiVenv, { recursive: true });
      writeFileSync(join(aiVenv, ".venv-version"), "old-hash\n");
      writeFileSync(installedJson, '{"bundles":{"background-removal":{}}}');
      chmodSync(installedJson, 0o444);

      const { status, out } = runBootstrap();
      expect(status).toBe(1);
      expect(out).not.toContain("AI venv ready");
      expect(readFileSync(installedJson, "utf-8")).toContain("background-removal");
    },
  );

  it("returns 1 and claims nothing when the reseed fails", () => {
    const { status, out } = runBootstrap({ TEST_RESEED_FAIL: "1" });
    expect(status).toBe(1);
    expect(out).not.toContain("AI venv ready");
  });
});
