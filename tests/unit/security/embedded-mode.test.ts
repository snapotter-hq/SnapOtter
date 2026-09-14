import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    // spawnSync blocks the worker, so vitest's own timeout cannot reach it. A
    // regression that reintroduces an unbounded wait (#962) would hang the run
    // rather than fail it; this turns that into a distinct, fast failure.
    timeout: 15_000,
    killSignal: "SIGKILL",
  });
  if (res.error) {
    return {
      status: 124,
      stdout: (res.stdout ?? "").trim(),
      stderr: `${res.stderr ?? ""}\nrunLib: ${res.error.message}`,
    };
  }
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

// Probe stubs live in a temp dir prepended to PATH: the readiness helpers call
// redis-cli / pg_isready by name, and neither exists on a dev machine. The
// `sleep` stub records each call and then really sleeps, because the wait loop's
// deadline is wall clock; a no-op stub would turn a bounded wait into a spin and
// would hide the removal of the pacing sleep entirely.
function probeBin() {
  const dir = mkdtempSync(join(tmpdir(), "probe-bin-"));
  writeFileSync(
    join(dir, "sleep"),
    `#!/bin/sh\necho . >> "${dir}/sleep.calls"\nexec /bin/sleep "$@"\n`,
    {
      mode: 0o755,
    },
  );
  return {
    dir,
    write: (name: string, body: string) =>
      writeFileSync(join(dir, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 }),
    sleepCalls: () => {
      try {
        return readFileSync(join(dir, "sleep.calls"), "utf8").trim().split("\n").length;
      } catch {
        return 0;
      }
    },
    run: (snippet: string, env: Record<string, string> = {}) =>
      runLib(snippet, { PATH: `${dir}:${process.env.PATH ?? ""}`, ...env }),
  };
}

describe("embedded-lib.sh wait_for_service", () => {
  let bin: ReturnType<typeof probeBin>;
  beforeEach(() => {
    bin = probeBin();
  });
  afterEach(() => {
    rmSync(bin.dir, { recursive: true, force: true });
  });

  it("returns as soon as the probe answers, and says nothing on the way", () => {
    const r = bin.run("wait_for_service Redis 5 PONG echo PONG");
    expect(r.status).toBe(0);
    expect(r.stderr).toBe("");
  });

  it("gives up instead of looping forever when the service never answers", () => {
    const r = bin.run("wait_for_service Redis 1 PONG false");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("FATAL");
    expect(r.stderr).toContain("Redis");
  });

  // The probe writes to its own stderr, which this shell inherits, so asserting
  // on stderr alone would pass even if the loop never captured the output. Pin
  // the text to the block the FATAL line introduces instead.
  it("carries the probe's own error into the failure report", () => {
    bin.write("redis-cli", 'echo "Could not connect to Redis: Connection refused" >&2; exit 1');
    const r = bin.run("wait_for_service Redis 1 PONG redis-cli");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(
      "Last probe output:\n  Could not connect to Redis: Connection refused",
    );
  });

  it("keeps backslashes in the probe output intact", () => {
    // dash's echo eats escapes, so a `\c` in a database error would truncate the
    // one line worth reading.
    bin.write("pg_isready", 'printf "%s\\n" "FATAL: auth failed\\context: startup"; exit 2');
    const r = bin.run('wait_for_service PostgreSQL 1 "" pg_isready');
    expect(r.stderr).toContain("Last probe output:\n  FATAL: auth failed\\context: startup");
  });

  it("keeps waiting when the probe exits 0 but answers something other than the expected reply", () => {
    const r = bin.run("wait_for_service Redis 1 PONG echo LOADING");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("LOADING");
  });

  it("treats an empty expectation as exit-status-only, whatever the probe prints", () => {
    const r = bin.run('wait_for_service PostgreSQL 5 "" echo anything-at-all');
    expect(r.status).toBe(0);
  });

  it("says so plainly when the probe fails without printing anything", () => {
    const r = bin.run("wait_for_service Redis 1 PONG false");
    expect(r.stderr).toContain("the probe printed nothing");
  });

  it("paces its attempts instead of spinning the CPU", () => {
    bin.run("wait_for_service Redis 2 PONG false");
    expect(bin.sleepCalls()).toBeGreaterThan(0);
  });

  it.each(["abc", "180s", "5m", "1.5", "0", "-5", "9999999999999999999999", ""])(
    "refuses the unusable timeout %j rather than looping forever on it",
    (timeout) => {
      // `[ 1 -ge abc ]` errors instead of comparing, and `if` reads that as "not
      // expired", which is #962 all over again through the knob that was added
      // to make the bound safe.
      const r = bin.run(`wait_for_service Redis '${timeout}' PONG false`);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("whole seconds");
      expect(r.stderr).toContain(timeout);
    },
  );

  it("refuses to report ready when handed no probe to run", () => {
    const r = bin.run('wait_for_service PostgreSQL 5 ""');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("no probe");
  });
});

describe("embedded-lib.sh readiness gates", () => {
  let bin: ReturnType<typeof probeBin>;
  beforeEach(() => {
    bin = probeBin();
  });
  afterEach(() => {
    rmSync(bin.dir, { recursive: true, force: true });
  });

  it("clears the Redis gate once redis-cli answers PONG", () => {
    bin.write("redis-cli", "echo PONG");
    expect(bin.run("redis_ready").status).toBe(0);
  });

  it("holds the Redis gate while Redis is still loading its dataset", () => {
    // redis-cli exits 0 for a -LOADING reply, so exit status alone would let the
    // app start against a Redis that cannot serve yet.
    bin.write("redis-cli", 'echo "LOADING Redis is loading the dataset in memory"');
    const r = bin.run("redis_ready", { EMBEDDED_REDIS_TIMEOUT_S: "1" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("LOADING");
  });

  it("fails the Redis gate with the reason and the way out", () => {
    bin.write("redis-cli", 'echo "Could not connect to Redis at 127.0.0.1:6379" >&2; exit 1');
    const r = bin.run("redis_ready", { EMBEDDED_REDIS_TIMEOUT_S: "1" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(
      "Last probe output:\n  Could not connect to Redis at 127.0.0.1:6379",
    );
    expect(r.stderr).toContain("EMBEDDED_REDIS_TIMEOUT_S");
  });

  it("clears the Postgres gate once pg_isready succeeds", () => {
    bin.write("pg_isready", "exit 0");
    expect(bin.run("postgres_ready").status).toBe(0);
  });

  it("fails the Postgres gate with the reason and the way out", () => {
    bin.write("pg_isready", 'echo "127.0.0.1:5432 - no response"; exit 2');
    const r = bin.run("postgres_ready", { EMBEDDED_POSTGRES_TIMEOUT_S: "1" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Last probe output:\n  127.0.0.1:5432 - no response");
    expect(r.stderr).toContain("EMBEDDED_POSTGRES_TIMEOUT_S");
  });

  it.each([
    ["redis_ready", "redis-cli", "-t 2 -h 127.0.0.1 -p 6379 ping"],
    ["postgres_ready", "pg_isready", "-t 2 -h 127.0.0.1 -p 5432 -U snapotter -d snapotter"],
  ])("%s probes the real endpoint with a per-attempt timeout", (gate, probe, argv) => {
    // -t matters on its own: redis-cli defaults to no timeout, so one wedged
    // call would sit inside the window and the deadline would never be reached.
    const args = join(bin.dir, "argv");
    bin.write(probe, `printf '%s' "$*" > "${args}"; echo PONG`);
    expect(bin.run(gate).status).toBe(0);
    expect(readFileSync(args, "utf8")).toBe(argv);
  });
});
