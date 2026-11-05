import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
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

describe("embedded-lib.sh embedded_port", () => {
  it.each(["1", "5432", "65535"])("accepts %s", (port) => {
    const r = runLib(`embedded_port EMBEDDED_PG_PORT ${port}`);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(port);
  });

  it.each(["", "0", "65536", "99999999", "05432", "54x", "-1", " 5432"])(
    "refuses %j and names the variable",
    (port) => {
      const r = runLib(`embedded_port EMBEDDED_PG_PORT '${port}'`);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("EMBEDDED_PG_PORT must be a port number from 1 to 65535");
    },
  );
});

describe("embedded-lib.sh export_embedded_db_env", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "db-env-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // No secrets directory, so the install runs on the fixed passwords.
  const exportEnv = () => `export_embedded_db_env "${join(dir, "secrets")}"`;
  const printEnv =
    'printf "%s\\n" "$EMBEDDED_PG_PORT" "$EMBEDDED_REDIS_PORT" "$DATABASE_URL" "$DATABASE_MIGRATION_URL" "$REDIS_URL"';

  it("uses the container's ports when the variables are unset or empty", () => {
    const unsetOrEmpty: Array<Record<string, string>> = [
      {},
      { EMBEDDED_PG_PORT: "", EMBEDDED_REDIS_PORT: "" },
    ];
    for (const env of unsetOrEmpty) {
      const r = runLib(`${exportEnv()} && ${printEnv}`, env);
      expect(r.status).toBe(0);
      expect(r.stdout.split("\n")).toEqual([
        "5432",
        "6379",
        "postgres://snapotter_app:snapotter_app@127.0.0.1:5432/snapotter",
        "postgres://snapotter:snapotter@127.0.0.1:5432/snapotter",
        "redis://127.0.0.1:6379",
      ]);
    }
  });

  it("puts the configured ports in every URL", () => {
    const r = runLib(`${exportEnv()} && ${printEnv}`, {
      EMBEDDED_PG_PORT: "15432",
      EMBEDDED_REDIS_PORT: "16379",
    });
    expect(r.status).toBe(0);
    expect(r.stdout.split("\n")).toEqual([
      "15432",
      "16379",
      "postgres://snapotter_app:snapotter_app@127.0.0.1:15432/snapotter",
      "postgres://snapotter:snapotter@127.0.0.1:15432/snapotter",
      "redis://127.0.0.1:16379",
    ]);
  });

  it("stops on a bad port instead of building URLs around it", () => {
    const r = runLib(exportEnv(), { EMBEDDED_REDIS_PORT: "6379x" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("EMBEDDED_REDIS_PORT must be a port number from 1 to 65535");
  });

  it("refuses one port for both databases", () => {
    // Redis would take it first, and Postgres would retry the bind until its
    // readiness timeout ran out, ten minutes by default.
    const r = runLib(exportEnv(), {
      EMBEDDED_PG_PORT: "16379",
      EMBEDDED_REDIS_PORT: "16379",
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("EMBEDDED_PG_PORT and EMBEDDED_REDIS_PORT are both 16379");
  });
});

describe("embedded-lib.sh embedded_db_passwords_requested", () => {
  const accepted: Array<[string, string, Record<string, string>]> = [
    ["unset", "0", {}],
    ["empty", "0", { EMBEDDED_DB_PASSWORDS: "" }],
    ["0", "0", { EMBEDDED_DB_PASSWORDS: "0" }],
    ["1", "1", { EMBEDDED_DB_PASSWORDS: "1" }],
  ];

  it.each(accepted)("reads %s as %s", (_label, expected, env) => {
    const r = runLib("embedded_db_passwords_requested", env);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(expected);
  });

  it.each(["true", "yes", "on", "2", " 1", "1 "])("refuses %j and names the variable", (value) => {
    // Only 1 turns the passwords on, so any other value would quietly leave the
    // databases on trust auth.
    const r = runLib("embedded_db_passwords_requested", { EMBEDDED_DB_PASSWORDS: value });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("EMBEDDED_DB_PASSWORDS must be 1 or 0");
  });
});

describe("embedded-lib.sh per-install database secrets", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "db-secrets-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const secrets = () => join(dir, "secrets");
  const mode = (path: string) => statSync(path).mode & 0o777;

  it("creates three 64-hex secrets, root-only, and keeps them on the next call", () => {
    expect(runLib(`ensure_embedded_db_secrets "${secrets()}"`).status).toBe(0);
    expect(mode(secrets())).toBe(0o700);
    const first: Record<string, string> = {};
    for (const name of ["pg-owner", "pg-app", "redis"]) {
      const file = join(secrets(), name);
      expect(mode(file)).toBe(0o600);
      first[name] = readFileSync(file, "utf8");
      expect(first[name]).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(new Set(Object.values(first)).size).toBe(3);
    expect(runLib(`ensure_embedded_db_secrets "${secrets()}"`).status).toBe(0);
    for (const name of ["pg-owner", "pg-app", "redis"]) {
      expect(readFileSync(join(secrets(), name), "utf8")).toBe(first[name]);
    }
  });

  it("clears the setgid bit a new directory inherits under the image's /data", () => {
    // The image makes /data setgid, a directory created there inherits the bit,
    // and GNU chmod keeps it through `chmod 700`.
    chmodSync(dir, 0o2775);
    expect(runLib(`ensure_embedded_db_secrets "${secrets()}"`).status).toBe(0);
    expect(statSync(secrets()).mode & 0o7777).toBe(0o700);
  });

  it("puts the directory and secret modes back on every boot", () => {
    runLib(`ensure_embedded_db_secrets "${secrets()}"`);
    chmodSync(secrets(), 0o755);
    chmodSync(join(secrets(), "pg-owner"), 0o644);
    expect(runLib(`ensure_embedded_db_secrets "${secrets()}"`).status).toBe(0);
    expect(mode(secrets())).toBe(0o700);
    expect(mode(join(secrets(), "pg-owner"))).toBe(0o600);
  });

  it("keeps no secret when the random source fails", () => {
    const bin = join(dir, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "od"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    const r = runLib(`ensure_embedded_db_secrets "${secrets()}"`, {
      PATH: `${bin}:${process.env.PATH ?? ""}`,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("could not write the embedded pg-owner password");
    expect(existsSync(join(secrets(), "pg-owner"))).toBe(false);
  });

  it("counts an install as secured once its secrets directory exists", () => {
    expect(runLib(`embedded_db_secured "${secrets()}"`).status).toBe(1);
    mkdirSync(secrets());
    // Empty, or later missing a file, it still counts: from here on every
    // consumer insists on valid secrets instead of falling back.
    expect(runLib(`embedded_db_secured "${secrets()}"`).status).toBe(0);
    runLib(`ensure_embedded_db_secrets "${secrets()}"`);
    rmSync(join(secrets(), "redis"));
    expect(runLib(`embedded_db_secured "${secrets()}"`).status).toBe(0);
  });

  it("reads a valid secret and refuses one that could break out of SQL or a URL", () => {
    runLib(`ensure_embedded_db_secrets "${secrets()}"`);
    const ok = runLib(`read_embedded_secret "${secrets()}" pg-app`);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toMatch(/^[0-9a-f]{64}$/);
    for (const bad of ["x'; DROP ROLE snapotter; --", "abc", `${"a".repeat(64)}0`, ""]) {
      writeFileSync(join(secrets(), "pg-app"), bad);
      const r = runLib(`read_embedded_secret "${secrets()}" pg-app`);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("is not a valid embedded database password");
    }
  });

  it.each(["directory", "symbolic link"])("refuses a %s in place of a secret", (kind) => {
    // A directory there used to swallow the generated file, and the install then
    // fell back to the fixed passwords and an open Redis.
    mkdirSync(secrets());
    const taken = join(secrets(), "pg-app");
    if (kind === "directory") {
      mkdirSync(taken);
    } else {
      writeFileSync(join(dir, "elsewhere"), "a".repeat(64));
      symlinkSync(join(dir, "elsewhere"), taken);
    }
    for (const call of ["ensure_embedded_db_secrets", "export_embedded_db_env"]) {
      const r = runLib(`${call} "${secrets()}"`);
      expect(r.status, call).toBe(1);
      expect(r.stderr, call).toContain(`${taken} is not a valid embedded database password`);
    }
  });

  it("exports the per-install passwords once every secret exists", () => {
    runLib(`ensure_embedded_db_secrets "${secrets()}"`);
    const secret = (name: string) => readFileSync(join(secrets(), name), "utf8");
    const r = runLib(
      `export_embedded_db_env "${secrets()}" && printf "%s\\n" "$DATABASE_URL" "$DATABASE_MIGRATION_URL" "$REDIS_URL" "$REDISCLI_AUTH"`,
      { EMBEDDED_PG_PORT: "15432", EMBEDDED_REDIS_PORT: "16379" },
    );
    expect(r.status).toBe(0);
    expect(r.stdout.split("\n")).toEqual([
      `postgres://snapotter_app:${secret("pg-app")}@127.0.0.1:15432/snapotter`,
      `postgres://snapotter:${secret("pg-owner")}@127.0.0.1:15432/snapotter`,
      `redis://:${secret("redis")}@127.0.0.1:16379`,
      secret("redis"),
    ]);
  });

  it("stops on a tampered secret instead of falling back to the fixed passwords", () => {
    runLib(`ensure_embedded_db_secrets "${secrets()}"`);
    writeFileSync(join(secrets(), "pg-owner"), "not-hex");
    const r = runLib(`export_embedded_db_env "${secrets()}"`);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("pg-owner is not a valid embedded database password");
  });

  it("fails closed when a secret goes missing after boot", () => {
    // s6 restarts Redis on its own, long after the entrypoint ran. Falling back
    // to an empty config there would bring Redis up with no password.
    runLib(`ensure_embedded_db_secrets "${secrets()}"`);
    rmSync(join(secrets(), "redis"));
    const missing = `${join(secrets(), "redis")} is missing`;
    const conf = join(dir, "redis.conf");
    const redis = runLib(`write_embedded_redis_conf "${conf}" "${secrets()}"`);
    expect(redis.status).toBe(1);
    expect(redis.stderr).toContain(missing);
    expect(existsSync(conf)).toBe(false);
    const env = runLib(
      `export_embedded_db_env "${secrets()}"\nprintf '%s|%s' "$?" "\${REDIS_URL-unset}"`,
    );
    expect(env.stdout).toBe("1|unset");
    expect(env.stderr).toContain(missing);
  });

  it("leaves the caller's port variables as they were when it refuses", () => {
    // Every consumer falls back to 5432 or 6379 when a port is empty or unset, so
    // a caller that carried on after a refusal would quietly use the defaults.
    const stateAfter = (env: Record<string, string>) =>
      runLib(
        `export_embedded_db_env "${secrets()}"\nprintf '%s|%s|%s' "$?" "\${EMBEDDED_PG_PORT-unset}" "\${EMBEDDED_REDIS_PORT-unset}"`,
        env,
      ).stdout;
    expect(stateAfter({ EMBEDDED_PG_PORT: "abc" })).toBe("1|abc|unset");
    expect(stateAfter({ EMBEDDED_REDIS_PORT: "6379x" })).toBe("1|unset|6379x");
    expect(stateAfter({ EMBEDDED_PG_PORT: "6379" })).toBe("1|6379|unset");
    // Good ports and a bad secret: the ports still wait for the secrets to pass.
    runLib(`ensure_embedded_db_secrets "${secrets()}"`);
    writeFileSync(join(secrets(), "pg-owner"), "not-hex");
    expect(stateAfter({ EMBEDDED_REDIS_PORT: "16379" })).toBe("1|unset|16379");
  });

  it("writes a pg_hba.conf that allows only the app roles over TCP", () => {
    expect(runLib(`write_embedded_pg_hba "${dir}"`).status).toBe(0);
    expect(readFileSync(join(dir, "pg_hba.conf"), "utf8")).toBe(
      [
        "# Managed by SnapOtter (EMBEDDED_DB_PASSWORDS). Rewritten on every boot.",
        "local all all trust",
        "host snapotter snapotter,snapotter_app 127.0.0.1/32 scram-sha-256",
        "",
      ].join("\n"),
    );
  });

  it("puts requirepass in the Redis config only on a secured install", () => {
    const conf = join(dir, "redis.conf");
    expect(runLib(`write_embedded_redis_conf "${conf}" "${secrets()}"`).status).toBe(0);
    expect(readFileSync(conf, "utf8")).toBe("");
    runLib(`ensure_embedded_db_secrets "${secrets()}"`);
    expect(runLib(`write_embedded_redis_conf "${conf}" "${secrets()}"`).status).toBe(0);
    const password = readFileSync(join(secrets(), "redis"), "utf8");
    expect(readFileSync(conf, "utf8")).toBe(`requirepass ${password}\n`);
    expect(mode(conf)).toBe(0o600);
  });

  it("refuses an empty secrets directory rather than looking for secrets at /", () => {
    for (const call of [
      'export_embedded_db_env ""',
      `write_embedded_redis_conf "${join(dir, "redis.conf")}" ""`,
    ]) {
      const r = runLib(call);
      expect(r.status, call).toBe(1);
      expect(r.stderr, call).toContain("needs the secrets directory");
    }
  });
});

describe("embedded-lib.sh exec_without_db_urls", () => {
  it("starts the command without the variables that carry the passwords", () => {
    const r = runLib("exec_without_db_urls env", {
      DATABASE_URL: "postgres://snapotter_app:a@127.0.0.1:5432/snapotter",
      DATABASE_MIGRATION_URL: "postgres://snapotter:b@127.0.0.1:5432/snapotter",
      REDIS_URL: "redis://:c@127.0.0.1:6379",
      REDISCLI_AUTH: "c",
      EMBEDDED_REDIS_PORT: "16379",
    });
    expect(r.status).toBe(0);
    expect(r.stdout).not.toMatch(
      /^(DATABASE_URL|DATABASE_MIGRATION_URL|REDIS_URL|REDISCLI_AUTH)=/m,
    );
    expect(r.stdout).toMatch(/^EMBEDDED_REDIS_PORT=16379$/m);
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

  it.each([
    [
      "redis_ready",
      "redis-cli",
      { EMBEDDED_REDIS_PORT: "16379" },
      "-t 2 -h 127.0.0.1 -p 16379 ping",
    ],
    [
      "postgres_ready",
      "pg_isready",
      { EMBEDDED_PG_PORT: "15432" },
      "-t 2 -h 127.0.0.1 -p 15432 -U snapotter -d snapotter",
    ],
  ])("%s probes the configured port", (gate, probe, portEnv, argv) => {
    const args = join(bin.dir, "argv");
    bin.write(probe, `printf '%s' "$*" > "${args}"; echo PONG`);
    expect(bin.run(gate, portEnv).status).toBe(0);
    expect(readFileSync(args, "utf8")).toBe(argv);
  });
});

describe("embedded-lib.sh mark_snapotter_ready", () => {
  let bin: ReturnType<typeof probeBin>;
  beforeEach(() => {
    bin = probeBin();
  });
  afterEach(() => {
    rmSync(bin.dir, { recursive: true, force: true });
  });

  it("writes the readiness marker as soon as the local health endpoint responds", () => {
    const marker = join(bin.dir, "snapotter-ready");
    const args = join(bin.dir, "curl.argv");
    bin.write("curl", `printf '%s' "$*" > "${args}"; printf '{"status":"healthy"}'`);

    const r = bin.run(`mark_snapotter_ready "${process.pid}"`, {
      SNAPOTTER_READY_FILE: marker,
    });

    expect(r.status).toBe(0);
    expect(existsSync(marker)).toBe(true);
    expect(readFileSync(args, "utf8")).toBe(
      "--noproxy * -sf --max-time 2 http://127.0.0.1:1349/api/v1/health",
    );
  });

  it("honors a custom PORT and keeps polling while the API is still booting", () => {
    const marker = join(bin.dir, "snapotter-ready");
    const calls = join(bin.dir, "curl.calls");
    const args = join(bin.dir, "curl.argv");
    bin.write(
      "curl",
      `printf '%s' "$*" > "${args}"\nif [ -f "${calls}" ]; then printf '{"status":"healthy"}'; exit 0; fi\n: > "${calls}"\nexit 7`,
    );

    const r = bin.run(`mark_snapotter_ready "${process.pid}"`, {
      PORT: "4321",
      SNAPOTTER_READY_FILE: marker,
    });

    expect(r.status).toBe(0);
    expect(existsSync(marker)).toBe(true);
    expect(bin.sleepCalls()).toBe(1);
    expect(readFileSync(args, "utf8")).toBe(
      "--noproxy * -sf --max-time 2 http://127.0.0.1:4321/api/v1/health",
    );
  });

  it("keeps waiting when the endpoint responds 200 without a healthy status payload", () => {
    const marker = join(bin.dir, "snapotter-ready");
    const calls = join(bin.dir, "curl.calls");
    bin.write(
      "curl",
      `if [ -f "${calls}" ]; then printf '{"status":"healthy"}'; exit 0; fi\n: > "${calls}"\nprintf '{"status":"starting"}'`,
    );

    const r = bin.run(`mark_snapotter_ready "${process.pid}"`, {
      SNAPOTTER_READY_FILE: marker,
    });

    expect(r.status).toBe(0);
    expect(existsSync(marker)).toBe(true);
    expect(bin.sleepCalls()).toBe(1);
  });

  it("exits without creating the marker when the API process dies before becoming healthy", () => {
    const marker = join(bin.dir, "snapotter-ready");
    const pidFile = join(bin.dir, "api.pid");
    bin.write("curl", `kill "$(cat "${pidFile}")" 2>/dev/null || true; exit 7`);

    const r = bin.run(
      `/bin/sleep 30 &\npid=$!\nprintf '%s' "$pid" > "${pidFile}"\nmark_snapotter_ready "$pid"`,
      {
        SNAPOTTER_READY_FILE: marker,
      },
    );

    expect(r.status).toBe(1);
    expect(existsSync(marker)).toBe(false);
    expect(bin.sleepCalls()).toBe(1);
  });

  it("warns and returns non-zero when the readiness marker path cannot be written", () => {
    const marker = join(bin.dir, "missing-dir", "snapotter-ready");
    bin.write("curl", `printf '{"status":"healthy"}'`);

    const r = bin.run(`mark_snapotter_ready "${process.pid}"`, {
      SNAPOTTER_READY_FILE: marker,
    });

    expect(r.status).toBe(1);
    expect(existsSync(marker)).toBe(false);
    expect(r.stderr).toContain("WARNING: mark_snapotter_ready could not write");
  });

  it("returns immediately without probing when the marker already exists", () => {
    const marker = join(bin.dir, "snapotter-ready");
    const called = join(bin.dir, "curl.called");
    writeFileSync(marker, "");
    bin.write("curl", `: > "${called}"; printf '{"status":"healthy"}'`);

    const r = bin.run(`mark_snapotter_ready "${process.pid}"`, {
      SNAPOTTER_READY_FILE: marker,
    });

    expect(r.status).toBe(0);
    expect(existsSync(called)).toBe(false);
  });

  it("refuses to poll when given an empty PID", () => {
    const marker = join(bin.dir, "snapotter-ready");
    bin.write("curl", `printf '{"status":"healthy"}'`);

    const r = bin.run('mark_snapotter_ready ""', {
      SNAPOTTER_READY_FILE: marker,
    });

    expect(r.status).toBe(1);
    expect(existsSync(marker)).toBe(false);
  });
});

describe("embedded-lib.sh snapotter_finish", () => {
  let bin: ReturnType<typeof probeBin>;
  beforeEach(() => {
    bin = probeBin();
  });
  afterEach(() => {
    rmSync(bin.dir, { recursive: true, force: true });
  });

  it("halts the container with the API exit code when the first start fails before becoming ready (#2267)", () => {
    const marker = join(bin.dir, "snapotter-ready");
    const exitfile = join(bin.dir, "exitcode");
    const halted = join(bin.dir, "halted");
    const haltBin = join(bin.dir, "halt");
    bin.write("halt", `: > "${halted}"`);

    const r = bin.run("snapotter_finish 1 0", {
      SNAPOTTER_READY_FILE: marker,
      S6_EXITCODE_FILE: exitfile,
      S6_HALT_BIN: haltBin,
    });

    // 125 tells s6-supervise not to respawn the service while s6-linux-init
    // tears the supervision tree down.
    expect(r.status).toBe(125);
    expect(readFileSync(exitfile, "utf8")).toBe("1\n");
    expect(existsSync(halted)).toBe(true);
  });

  it("propagates other non-zero startup exit codes (1..255) to the container exitcode file", () => {
    const marker = join(bin.dir, "snapotter-ready");
    const exitfile = join(bin.dir, "exitcode");
    const halted = join(bin.dir, "halted");
    const haltBin = join(bin.dir, "halt");
    bin.write("halt", `: > "${halted}"`);

    const r = bin.run("snapotter_finish 9 0", {
      SNAPOTTER_READY_FILE: marker,
      S6_EXITCODE_FILE: exitfile,
      S6_HALT_BIN: haltBin,
    });

    expect(r.status).toBe(125);
    expect(readFileSync(exitfile, "utf8")).toBe("9\n");
    expect(existsSync(halted)).toBe(true);
  });

  it("logs a fatal diagnostic and avoids permanently downing the service when halt fails", () => {
    const marker = join(bin.dir, "snapotter-ready");
    const exitfile = join(bin.dir, "exitcode");
    const haltBin = join(bin.dir, "halt");
    bin.write("halt", "exit 1");

    const r = bin.run("snapotter_finish 1 0", {
      SNAPOTTER_READY_FILE: marker,
      S6_EXITCODE_FILE: exitfile,
      S6_HALT_BIN: haltBin,
    });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("FATAL: snapotter_finish failed to halt container");
  });

  it("logs a fatal diagnostic when the container exitcode file cannot be written", () => {
    const marker = join(bin.dir, "snapotter-ready");
    const exitfile = join(bin.dir, "missing-dir", "exitcode");
    const halted = join(bin.dir, "halted");
    const haltBin = join(bin.dir, "halt");
    bin.write("halt", `: > "${halted}"`);

    const r = bin.run("snapotter_finish 1 0", {
      SNAPOTTER_READY_FILE: marker,
      S6_EXITCODE_FILE: exitfile,
      S6_HALT_BIN: haltBin,
    });

    expect(r.status).toBe(125);
    expect(r.stderr).toContain("FATAL: snapotter_finish could not write exit code 1");
    expect(existsSync(halted)).toBe(true);
  });

  it("leaves crashes after a successful boot to normal s6 restart supervision", () => {
    const marker = join(bin.dir, "snapotter-ready");
    const exitfile = join(bin.dir, "exitcode");
    const halted = join(bin.dir, "halted");
    const haltBin = join(bin.dir, "halt");
    writeFileSync(marker, "");
    bin.write("halt", `: > "${halted}"`);

    const r = bin.run("snapotter_finish 1 0", {
      SNAPOTTER_READY_FILE: marker,
      S6_EXITCODE_FILE: exitfile,
      S6_HALT_BIN: haltBin,
    });

    expect(r.status).toBe(0);
    expect(existsSync(exitfile)).toBe(false);
    expect(existsSync(halted)).toBe(false);
  });

  it.each([
    ["a clean exit (0)", "0 0"],
    ["a signal termination (256)", "256 15"],
    ["a non-numeric exit code", "invalid 0"],
  ])("does not halt on %s even before the readiness marker exists", (_label, args) => {
    const marker = join(bin.dir, "snapotter-ready");
    const exitfile = join(bin.dir, "exitcode");
    const halted = join(bin.dir, "halted");
    const haltBin = join(bin.dir, "halt");
    bin.write("halt", `: > "${halted}"`);

    const r = bin.run(`snapotter_finish ${args}`, {
      SNAPOTTER_READY_FILE: marker,
      S6_EXITCODE_FILE: exitfile,
      S6_HALT_BIN: haltBin,
    });

    expect(r.status).toBe(0);
    expect(existsSync(exitfile)).toBe(false);
    expect(existsSync(halted)).toBe(false);
  });
});
