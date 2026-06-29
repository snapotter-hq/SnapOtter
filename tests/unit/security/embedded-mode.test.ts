import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Exercises the REAL docker/embedded-lib.sh (sourced, not mirrored) so the test
// cannot drift from what ships in the image. Mirrors entrypoint-permissions.test.ts.
const here = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(here, "../../../docker/embedded-lib.sh");

// Run `snippet` with env after sourcing the lib; capture status + output.
function runLib(
  snippet: string,
  env: Record<string, string> = {},
): { status: number; stdout: string; stderr: string } {
  const res = spawnSync("/bin/sh", ["-c", `. "${LIB}"\n${snippet}`], {
    encoding: "utf-8",
    env: { PATH: process.env.PATH ?? "", ...env },
  });
  return { status: res.status ?? 1, stdout: (res.stdout ?? "").trim(), stderr: res.stderr ?? "" };
}

describe("embedded-lib.sh decide_run_mode", () => {
  it("embedded when both URLs unset and EMBEDDED unset", () => {
    const r = runLib("decide_run_mode");
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("embedded");
  });

  it("fails fast when only DATABASE_URL is set (partial config)", () => {
    const r = runLib("decide_run_mode", { DATABASE_URL: "postgres://x@db/y" });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("BOTH");
  });

  it("external when both URLs are set", () => {
    const r = runLib("decide_run_mode", {
      DATABASE_URL: "postgres://x@db/y",
      REDIS_URL: "redis://r",
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("external");
  });

  it("external (not embedded) when EMBEDDED=0 even with no URLs", () => {
    const r = runLib("decide_run_mode", { EMBEDDED: "0" });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("external");
  });

  it("fails fast when exactly one URL is set (partial config)", () => {
    const r = runLib("decide_run_mode", { REDIS_URL: "redis://r" });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("BOTH");
  });
});

describe("embedded-lib.sh embedded_requires_root", () => {
  it("succeeds when uid is 0", () => {
    expect(runLib("embedded_requires_root 0").status).toBe(0);
  });

  it("fails with actionable guidance when uid is non-zero", () => {
    const r = runLib("embedded_requires_root 1000");
    expect(r.status).toBe(1);
    expect(r.stderr.toLowerCase()).toContain("root");
    expect(r.stderr).toContain("Compose");
  });
});

describe("embedded-lib.sh sqlite_autodetect_path", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sqlite-detect-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("echoes empty when no snapotter.db is present", () => {
    expect(runLib(`sqlite_autodetect_path '${dir}'`).stdout).toBe("");
  });

  it("echoes the db path when snapotter.db exists and no override is set", () => {
    writeFileSync(join(dir, "snapotter.db"), "x");
    expect(runLib(`sqlite_autodetect_path '${dir}'`).stdout).toBe(join(dir, "snapotter.db"));
  });

  it("honors an explicit SQLITE_MIGRATE_PATH over auto-detect", () => {
    writeFileSync(join(dir, "snapotter.db"), "x");
    const r = runLib(`sqlite_autodetect_path '${dir}'`, {
      SQLITE_MIGRATE_PATH: "/custom/legacy.db",
    });
    expect(r.stdout).toBe("/custom/legacy.db");
  });
});

describe("embedded-lib.sh check_pg_version", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pgver-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("succeeds when PG_VERSION matches the installed major", () => {
    writeFileSync(join(dir, "PG_VERSION"), "17\n");
    expect(runLib(`check_pg_version '${dir}' 17`).status).toBe(0);
  });

  it("fails loudly when PG_VERSION is a different major", () => {
    writeFileSync(join(dir, "PG_VERSION"), "16\n");
    const r = runLib(`check_pg_version '${dir}' 17`);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("16");
    expect(r.stderr).toContain("17");
    expect(r.stderr.toLowerCase()).toContain("manual");
  });

  it("succeeds (no-op) when PG_VERSION is absent (fresh data dir)", () => {
    expect(runLib(`check_pg_version '${dir}' 17`).status).toBe(0);
  });
});
