import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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
