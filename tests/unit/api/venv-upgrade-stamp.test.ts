import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Unit tests for the venv upgrade-stamp mechanism in docker/entrypoint.sh.
 *
 * The entrypoint compares /opt/venv/.venv-version (baked into the image at
 * build time) against /data/ai/venv/.venv-version (persisted on the volume).
 * When missing or mismatched, the venv is nuked and re-copied so upgraded
 * base packages take effect immediately.
 *
 * These tests exercise the bootstrap logic in isolation using temp dirs.
 */

let root: string;
let optVenv: string;
let dataAi: string;
let aiVenv: string;
let aiVenvTmp: string;
let installedJson: string;

const here = dirname(fileURLToPath(import.meta.url));
const ENTRYPOINT_LIB = resolve(here, "../../../docker/entrypoint-lib.sh");

// Self-contained shell script mirroring the entrypoint bootstrap block.
// Uses env vars for paths so we can point at temp directories.
const BOOTSTRAP_SCRIPT = `
#!/bin/sh
set -e

. "$TEST_ENTRYPOINT_LIB"

AI_VENV="$TEST_AI_VENV"
AI_VENV_TMP="$TEST_AI_VENV_TMP"
OPT_VENV="$TEST_OPT_VENV"

if [ -d "$AI_VENV_TMP" ]; then
  echo "CLEANUP_INTERRUPTED"
  rm -rf "$AI_VENV_TMP"
fi

if [ -d "$OPT_VENV" ]; then
  NEED_BOOTSTRAP=false

  if [ ! -d "$AI_VENV" ]; then
    NEED_BOOTSTRAP=true
    echo "FIRST_RUN"
  elif [ -f "$OPT_VENV/.venv-version" ]; then
    IMAGE_STAMP=$(cat "$OPT_VENV/.venv-version")
    CURRENT_STAMP=""
    if [ -f "$AI_VENV/.venv-version" ]; then
      CURRENT_STAMP=$(cat "$AI_VENV/.venv-version")
    fi
    if [ "$CURRENT_STAMP" != "$IMAGE_STAMP" ]; then
      NEED_BOOTSTRAP=true
      echo "STAMP_MISMATCH"
    fi
  fi

  if [ "$NEED_BOOTSTRAP" = true ]; then
    rm -rf "$AI_VENV"
    cp -r "$OPT_VENV" "$AI_VENV_TMP"
    mv "$AI_VENV_TMP" "$AI_VENV"
    rewrite_venv_paths "$AI_VENV" "$OPT_VENV" "$AI_VENV"
    if [ -f "$TEST_INSTALLED_JSON" ]; then
      echo '{"bundles":{}}' > "$TEST_INSTALLED_JSON"
      echo "BUNDLES_RESET"
    fi
    echo "VENV_READY"
  else
    rewrite_venv_paths "$AI_VENV" "$OPT_VENV" "$AI_VENV"
    echo "SKIP"
  fi
else
  echo "NO_OPT_VENV"
fi
`;

function runBootstrap(): string {
  return execFileSync("/bin/sh", ["-c", BOOTSTRAP_SCRIPT], {
    env: {
      TEST_AI_VENV: aiVenv,
      TEST_AI_VENV_TMP: aiVenvTmp,
      TEST_OPT_VENV: optVenv,
      TEST_INSTALLED_JSON: installedJson,
      TEST_ENTRYPOINT_LIB: ENTRYPOINT_LIB,
      PATH: process.env.PATH,
    },
    encoding: "utf-8",
  }).trim();
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
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("venv upgrade stamp", () => {
  it("bootstraps on first run when no venv exists", () => {
    const output = runBootstrap();
    expect(output).toContain("FIRST_RUN");
    expect(output).toContain("VENV_READY");
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

    const output = runBootstrap();
    expect(output).toBe("SKIP");
  });

  it("repairs copied venv paths even when stamps already match", () => {
    mkdirSync(join(aiVenv, "bin"), { recursive: true });
    writeFileSync(join(aiVenv, ".venv-version"), "abc123\n");
    writeFileSync(join(aiVenv, "bin", "pip"), `#!${optVenv}/bin/python3\n`);
    writeFileSync(join(aiVenv, "bin", "activate"), `VIRTUAL_ENV=${optVenv}\n`);
    writeFileSync(join(aiVenv, "pyvenv.cfg"), `command = python3 -m venv ${optVenv}\n`);

    const output = runBootstrap();
    expect(output).toBe("SKIP");
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

    const output = runBootstrap();
    expect(output).toContain("STAMP_MISMATCH");
    expect(output).toContain("VENV_READY");
    // Old content replaced with fresh copy
    expect(existsSync(join(aiVenv, "stale-file.txt"))).toBe(false);
    expect(readFileSync(join(aiVenv, "marker.txt"), "utf-8")).toBe("base-package-content");
    expect(readFileSync(join(aiVenv, ".venv-version"), "utf-8")).toBe("abc123\n");
  });

  it("refreshes when venv has no stamp (pre-stamp image upgrade)", () => {
    // Simulate old venv without any stamp file
    mkdirSync(aiVenv, { recursive: true });
    writeFileSync(join(aiVenv, "old-pkg.txt"), "legacy");

    const output = runBootstrap();
    expect(output).toContain("STAMP_MISMATCH");
    expect(output).toContain("VENV_READY");
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

    const output = runBootstrap();
    expect(output).toContain("BUNDLES_RESET");
    const data = JSON.parse(readFileSync(installedJson, "utf-8"));
    expect(data).toEqual({ bundles: {} });
  });

  it("does not reset installed.json when no bundles were installed", () => {
    // No installed.json exists
    mkdirSync(aiVenv, { recursive: true });
    writeFileSync(join(aiVenv, ".venv-version"), "old-hash\n");

    const output = runBootstrap();
    expect(output).toContain("VENV_READY");
    expect(output).not.toContain("BUNDLES_RESET");
  });

  it("does nothing when /opt/venv has no stamp (old image)", () => {
    // Remove the stamp from the image venv
    rmSync(join(optVenv, ".venv-version"));
    mkdirSync(aiVenv, { recursive: true });
    writeFileSync(join(aiVenv, "existing.txt"), "keep");

    const output = runBootstrap();
    expect(output).toBe("SKIP");
    // Existing venv untouched
    expect(existsSync(join(aiVenv, "existing.txt"))).toBe(true);
  });

  it("cleans up interrupted bootstrap from previous start", () => {
    mkdirSync(aiVenvTmp, { recursive: true });
    writeFileSync(join(aiVenvTmp, "partial.txt"), "incomplete");

    const output = runBootstrap();
    expect(output).toContain("CLEANUP_INTERRUPTED");
    expect(existsSync(aiVenvTmp)).toBe(false);
  });

  it("does nothing when /opt/venv does not exist", () => {
    rmSync(optVenv, { recursive: true });
    const output = runBootstrap();
    expect(output).toBe("NO_OPT_VENV");
  });
});
