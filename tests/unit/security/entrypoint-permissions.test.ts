import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Exercises the REAL docker/entrypoint-lib.sh functions (sourced, not mirrored)
// so the test cannot drift from what ships in the image. Mirrors the approach
// in docker-file-secrets.test.ts.
const here = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(here, "../../../docker/entrypoint-lib.sh");

// A read-only directory does not block writes for root (DAC_OVERRIDE), so the
// "not writable" assertions only hold for an unprivileged user.
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

let root: string;
let writable: string;
let readonly: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "entrypoint-perms-"));
  writable = join(root, "writable");
  mkdirSync(writable, { recursive: true });
  readonly = join(root, "readonly");
  mkdirSync(readonly, { recursive: true });
  chmodSync(readonly, 0o555);
});

afterAll(() => {
  try {
    chmodSync(readonly, 0o755);
  } catch {
    /* may not exist */
  }
  rmSync(root, { recursive: true, force: true });
});

// Sources the lib, runs `snippet`, and returns its exit code + captured output
// without throwing on non-zero exit.
function runLib(snippet: string): { status: number; stdout: string; stderr: string } {
  const res = spawnSync("/bin/sh", ["-c", `. "${LIB}"\n${snippet}`], { encoding: "utf-8" });
  return { status: res.status ?? 1, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

describe("entrypoint-lib.sh dir_writable", () => {
  it("succeeds for a writable directory", () => {
    expect(runLib(`dir_writable '${writable}'`).status).toBe(0);
  });

  it("creates and succeeds for a missing directory under a writable parent", () => {
    const fresh = join(root, "fresh", "nested");
    expect(runLib(`dir_writable '${fresh}'`).status).toBe(0);
  });

  it.skipIf(isRoot)("fails for a read-only directory", () => {
    expect(runLib(`dir_writable '${readonly}'`).status).not.toBe(0);
  });
});

describe("entrypoint-lib.sh ensure_writable", () => {
  it("succeeds when all directories are writable", () => {
    expect(runLib(`ensure_writable '${writable}'`).status).toBe(0);
  });

  it.skipIf(isRoot)("fails with actionable guidance for a read-only directory", () => {
    const { status, stderr } = runLib(`ensure_writable '${readonly}'`);
    expect(status).not.toBe(0);
    expect(stderr).toContain(readonly);
    expect(stderr.toLowerCase()).toContain("not writable");
    expect(stderr).toContain("chown");
  });
});

describe("entrypoint-lib.sh rewrite_venv_paths", () => {
  it("rewrites copied venv text entrypoints literally without touching binary files", () => {
    const optVenv = join(root, "opt&venv");
    const aiVenv = join(root, "data|ai", "venv&runtime");
    const binDir = join(aiVenv, "bin");
    mkdirSync(binDir, { recursive: true });

    const pip = join(binDir, "pip");
    const activate = join(binDir, "activate");
    const pyvenv = join(aiVenv, "pyvenv.cfg");
    const binary = join(binDir, "python3");

    writeFileSync(pip, `#!${optVenv}/bin/python3\nprint('pip')\n`);
    writeFileSync(activate, `VIRTUAL_ENV=${optVenv}\nexport VIRTUAL_ENV\n`);
    writeFileSync(pyvenv, `command = python3 -m venv ${optVenv}\n`);
    writeFileSync(binary, Buffer.from([0x00, ...Buffer.from(optVenv), 0x00]));

    const result = runLib(`rewrite_venv_paths '${aiVenv}' '${optVenv}' '${aiVenv}'`);
    expect(result.status, result.stderr).toBe(0);

    for (const file of [pip, activate, pyvenv]) {
      const content = readFileSync(file, "utf-8");
      expect(content).toContain(aiVenv);
      expect(content).not.toContain(optVenv);
    }
    expect(readFileSync(binary)).toEqual(Buffer.from([0x00, ...Buffer.from(optVenv), 0x00]));
  });
});
