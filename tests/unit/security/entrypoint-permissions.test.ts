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

// The PUID/PGID remap edits /etc/passwd and /etc/group, which fails on a
// read-only root (#4570). `id` is shadowed with a shell function so the test
// controls what the user resolves to after the remap.
describe("entrypoint-lib.sh verify_user_remap", () => {
  const withId = (uid: string, gid: string, call: string) =>
    runLib(`id() { case "$1" in -u) echo ${uid} ;; -g) echo ${gid} ;; esac; }\n${call}`);

  it("succeeds when the user already has the requested ids", () => {
    const { status, stderr } = withId("2345", "2345", "verify_user_remap snapotter 2345 2345");
    expect(status, stderr).toBe(0);
    expect(stderr).toBe("");
  });

  it("fails naming the cause and the --user alternative when the uid did not change", () => {
    const { status, stderr } = withId("999", "999", "verify_user_remap snapotter 2345 2345");
    expect(status).not.toBe(0);
    expect(stderr).toContain("PUID=2345 PGID=2345");
    expect(stderr).toContain("999:999");
    expect(stderr).toContain("read-only");
    expect(stderr).toContain("--user 2345:2345");
    expect(stderr).toContain("security#why-read-only-is-not-set");
  });

  it("fails when only the gid did not change", () => {
    const { status, stderr } = withId("2345", "999", "verify_user_remap snapotter 2345 2345");
    expect(status).not.toBe(0);
    expect(stderr).toContain("2345:999");
  });
});

// The check has to run before the chown, or a failed remap still re-owns /data.
describe("entrypoint.sh PUID/PGID remap", () => {
  const entrypoint = readFileSync(resolve(here, "../../../docker/entrypoint.sh"), "utf-8");

  it("verifies the remap before chowning /data", () => {
    const verify = entrypoint.indexOf("verify_user_remap snapotter");
    expect(verify).toBeGreaterThan(-1);
    expect(verify).toBeLessThan(entrypoint.indexOf("chown -R snapotter:snapotter /data"));
    expect(verify).toBeLessThan(entrypoint.indexOf("-exec chown -R snapotter:snapotter"));
  });

  it("lets usermod and groupmod report their own errors", () => {
    expect(entrypoint).not.toMatch(/usermod -u "\$PUID" snapotter 2>\/dev\/null/);
    expect(entrypoint).not.toMatch(/groupmod -g "\$PGID" snapotter 2>\/dev\/null/);
  });
});
