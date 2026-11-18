#!/usr/bin/env node
// Embedded-mode container lifecycle tests. Requires Docker and a built image.
// Usage: SNAPOTTER_IMAGE=snapotter:embed-wip node tests/e2e-docker/embedded-mode.mjs
//
// Unlike the Playwright e2e-docker specs (which talk to an already-running
// container), these drive `docker run`/`stop` directly to exercise the container
// lifecycle: bare-run boot, restart persistence, clean shutdown, the non-root and
// partial-config fail-fast guards, the 1.x SQLite auto-detect upgrade, and a
// read-only root with tmpfs on /run and /tmp.
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const IMAGE = process.env.SNAPOTTER_IMAGE || "snapotter:embed-wip";
const RUN_ID =
  process.env.SNAPOTTER_TEST_RUN_ID || `${process.pid}_${randomBytes(6).toString("hex")}`;
if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(RUN_ID)) {
  throw new Error("SNAPOTTER_TEST_RUN_ID must be 1-64 letters, digits, underscores, or hyphens");
}
const OWNER_LABEL_KEY = "com.snapotter.e2e.run";
const OWNER_LABEL = `${OWNER_LABEL_KEY}=${RUN_ID}`;
const NAME = `so-embed-test-${RUN_ID}`;
const VOL = `so-embed-test-data-${RUN_ID}`;
const requestedPort = process.env.SNAPOTTER_TEST_PORT;
if (requestedPort && !/^\d+$/.test(requestedPort)) {
  throw new Error("SNAPOTTER_TEST_PORT must be an integer port");
}
if (requestedPort && (Number(requestedPort) < 1024 || Number(requestedPort) > 65_535)) {
  throw new Error("SNAPOTTER_TEST_PORT must be between 1024 and 65535");
}
const PORT_SPEC = requestedPort ? `127.0.0.1:${requestedPort}:1349` : "127.0.0.1::1349";
let PORT = requestedPort || "";

let failures = 0;
const ok = (m) => console.log(`  PASS ${m}`);
const bad = (m) => {
  failures++;
  console.error(`  FAIL ${m}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Run docker, returning stdout. Throws on non-zero exit (callers that expect a
// non-zero exit wrap in try/catch and read combined output from the error).
const docker = (args) =>
  execFileSync("docker", args, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
const quiet = (args) => {
  try {
    return docker(args);
  } catch {
    return "";
  }
};
const combined = (args) => {
  try {
    return docker(args);
  } catch (e) {
    return `${e.stdout || ""}${e.stderr || ""}`;
  }
};
// `docker logs` writes the container's stdout and stderr to docker's own stdout
// and stderr respectively. The embedded banner (entrypoint >&2) and Postgres
// logs go to stderr, so capture BOTH streams or those assertions miss them.
const dockerLogs = (name) => {
  const res = spawnSync("docker", ["logs", name], { encoding: "utf-8" });
  return `${res.stdout || ""}${res.stderr || ""}`;
};
const containerIsOwned = () =>
  quiet(["inspect", "--format", `{{ index .Config.Labels "${OWNER_LABEL_KEY}" }}`, NAME]).trim() ===
  RUN_ID;
const volumeIsOwned = () =>
  quiet([
    "volume",
    "inspect",
    "--format",
    `{{ index .Labels "${OWNER_LABEL_KEY}" }}`,
    VOL,
  ]).trim() === RUN_ID;
const cleanup = () => {
  if (quiet(["inspect", NAME])) {
    if (containerIsOwned()) quiet(["rm", "-f", NAME]);
    else console.error(`Refusing to remove unowned container ${NAME}`);
  }
  if (quiet(["volume", "inspect", VOL])) {
    if (volumeIsOwned()) quiet(["volume", "rm", VOL]);
    else console.error(`Refusing to remove unowned volume ${VOL}`);
  }
};
const exitOnSignal = (exitCode) => {
  process.exitCode = exitCode;
  cleanup();
  process.exit();
};
process.once("SIGINT", () => exitOnSignal(130));
process.once("SIGTERM", () => exitOnSignal(143));
process.once("exit", cleanup);
const createVolume = () => {
  if (quiet(["volume", "inspect", VOL])) {
    throw new Error(`Unique volume name collision: ${VOL}`);
  }
  docker(["volume", "create", "--label", OWNER_LABEL, VOL]);
  if (!volumeIsOwned()) throw new Error(`Created volume failed ownership validation: ${VOL}`);
};
const resolveContainerPort = () => {
  const binding = docker(["port", NAME, "1349/tcp"]).trim();
  const match = /^127\.0\.0\.1:(\d+)$/.exec(binding);
  if (!match) throw new Error(`Invalid Docker port binding: ${binding}`);
  PORT = match[1];
};
const runEmbeddedContainer = (extraArgs = []) => {
  if (quiet(["inspect", NAME])) {
    throw new Error(`Unique container name collision: ${NAME}`);
  }
  docker([
    "run",
    "-d",
    "--name",
    NAME,
    "--label",
    OWNER_LABEL,
    "-p",
    PORT_SPEC,
    "-v",
    `${VOL}:/data`,
    "-e",
    "SNAPOTTER_TELEMETRY=0",
    ...extraArgs,
    IMAGE,
  ]);
  if (!containerIsOwned()) {
    throw new Error(`Created container failed ownership validation: ${NAME}`);
  }
  resolveContainerPort();
};
const restartEmbeddedContainer = () => {
  docker(["restart", NAME]);
  resolveContainerPort();
};
// `docker restart` keeps the old environment, so booting the same volume with
// different settings takes a new container.
const replaceEmbeddedContainer = (extraArgs = []) => {
  if (!containerIsOwned()) throw new Error(`Refusing to replace unowned container ${NAME}`);
  docker(["stop", NAME]);
  docker(["rm", NAME]);
  runEmbeddedContainer(extraArgs);
};

async function waitHealthy(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${PORT}/api/v1/health`);
      if (res.ok) {
        const body = await res.json();
        if (body.status === "healthy") return true;
      }
    } catch {
      // not accepting connections yet
    }
    await sleep(3000);
  }
  return false;
}

async function waitExited(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (quiet(["inspect", "--format", "{{.State.Running}}", NAME]).trim() === "false") return true;
    await sleep(3000);
  }
  return false;
}

const countMatches = (haystack, re) => (haystack.match(re) || []).length;

const SAMPLE_PNG = fileURLToPath(new URL("../fixtures/image/formats/sample.png", import.meta.url));

// Resizes the sample PNG and returns the size of the file the API hands back,
// or 0. A 202 streams progress until the job's terminal frame, which carries
// the download URL, then the stream closes.
async function resizedBytes() {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(SAMPLE_PNG)], { type: "image/png" }), "sample.png");
  form.append("settings", JSON.stringify({ width: 64 }));
  const res = await fetch(`http://localhost:${PORT}/api/v1/tools/image/resize`, {
    method: "POST",
    body: form,
  });
  let result = await res.json();
  if (res.status === 202) {
    const stream = await fetch(`http://localhost:${PORT}/api/v1/jobs/${result.jobId}/progress`);
    const frames = (await stream.text())
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice(6)));
    result = frames.findLast((frame) => frame.phase === "complete")?.result ?? {};
  } else if (res.status !== 200) {
    return 0;
  }
  if (!result.downloadUrl) return 0;
  const file = await fetch(`http://localhost:${PORT}${result.downloadUrl}`);
  return file.ok ? (await file.arrayBuffer()).byteLength : 0;
}

async function main() {
  console.log(`Embedded-mode tests against ${IMAGE}`);
  createVolume();

  // 1. Bare `docker run` with no DB env boots and becomes healthy.
  // Prod images bake real telemetry keys, so every container start in this
  // harness sets SNAPOTTER_TELEMETRY=0 to keep test-fleet boots silent.
  console.log("\n[1] bare docker run boots healthy");
  runEmbeddedContainer();
  const healthy = await waitHealthy(300000);
  healthy
    ? ok("embedded container reached healthy")
    : bad("embedded container never became healthy");

  const logs1 = dockerLogs(NAME);
  logs1.includes("embedded mode") ? ok("embedded banner printed") : bad("no embedded banner");
  countMatches(logs1, /first-boot initdb/g) === 1
    ? ok("initdb ran exactly once")
    : bad("initdb did not run exactly once");
  let readyMarkerPresent = false;
  for (let i = 0; i < 10; i++) {
    if (spawnSync("docker", ["exec", NAME, "test", "-f", "/run/s6/snapotter-ready"]).status === 0) {
      readyMarkerPresent = true;
      break;
    }
    await sleep(500);
  }
  readyMarkerPresent
    ? ok("wrote /run/s6/snapotter-ready after reaching healthy")
    : bad("missing /run/s6/snapotter-ready after healthy boot");
  // A crash after a healthy boot must respawn the API rather than halting the container (#2267).
  const pidBeforeCrash = quiet([
    "exec",
    NAME,
    "/command/s6-svstat",
    "-o",
    "pid",
    "/run/service/snapotter",
  ]).trim();
  quiet(["exec", NAME, "kill", "-9", pidBeforeCrash]);
  let respawned = false;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    const pidNow = quiet([
      "exec",
      NAME,
      "/command/s6-svstat",
      "-o",
      "pid",
      "/run/service/snapotter",
    ]).trim();
    if (pidNow && pidNow !== "-1" && pidNow !== pidBeforeCrash) {
      respawned = true;
      break;
    }
  }
  respawned && (await waitHealthy(60000))
    ? ok("s6 respawned the API after a post-boot crash")
    : bad("API did not recover from a post-boot crash");

  // 2. Restart reuses PGDATA (no second initdb), stays healthy.
  console.log("\n[2] restart persists data, no re-init");
  restartEmbeddedContainer();
  (await waitHealthy(180000)) ? ok("healthy after restart") : bad("unhealthy after restart");
  countMatches(dockerLogs(NAME), /first-boot initdb/g) === 1
    ? ok("no second initdb on restart")
    : bad("re-initialized on restart (data loss risk)");

  // 3. Clean shutdown: docker stop returns fast, Postgres logs a clean stop.
  console.log("\n[3] clean shutdown");
  const t0 = Date.now();
  docker(["stop", NAME]);
  const stopMs = Date.now() - t0;
  stopMs < 9000
    ? ok(`stopped in ${stopMs}ms (before kill timeout)`)
    : bad(`stop took ${stopMs}ms (likely SIGKILL)`);
  dockerLogs(NAME).includes("database system is shut down")
    ? ok("Postgres logged a clean shutdown")
    : bad("no clean Postgres shutdown line");
  cleanup();

  // 4. Non-root fails fast.
  console.log("\n[4] non-root fail-fast");
  combined(["run", "--rm", "--user", "1000:1000", "-e", "SNAPOTTER_TELEMETRY=0", IMAGE]).includes(
    "embedded mode needs root",
  )
    ? ok("non-root rejected with guidance")
    : bad("non-root not rejected");

  // 5. Partial config fails fast.
  console.log("\n[5] partial-config fail-fast");
  combined([
    "run",
    "--rm",
    "-e",
    "REDIS_URL=redis://x:6379",
    "-e",
    "SNAPOTTER_TELEMETRY=0",
    IMAGE,
  ]).includes("set BOTH DATABASE_URL and REDIS_URL")
    ? ok("partial config rejected")
    : bad("partial config not rejected");

  // 6. 1.x SQLite auto-detect upgrade: a /data/snapotter.db present with no
  //    SQLITE_MIGRATE_PATH set is auto-imported on first boot. Seed all 10 tables
  //    the importer reads (empty) so the import succeeds without column-mismatch;
  //    this proves the auto-detect wiring (row migration is covered elsewhere).
  console.log("\n[6] 1.x SQLite auto-detect upgrade");
  cleanup();
  createVolume();
  const tables = [
    "users",
    "teams",
    "settings",
    "roles",
    "sessions",
    "api_keys",
    "pipelines",
    "jobs",
    "audit_log",
    "user_files",
  ];
  const seedSql = tables.map((t) => `CREATE TABLE ${t}(id TEXT);`).join(" ");
  docker([
    "run",
    "--rm",
    "-v",
    `${VOL}:/data`,
    "alpine:3.20",
    "sh",
    "-c",
    `apk add --no-cache sqlite >/dev/null 2>&1 && sqlite3 /data/snapotter.db "${seedSql}"`,
  ]);
  runEmbeddedContainer();
  (await waitHealthy(300000))
    ? ok("healthy after upgrade boot")
    : bad("unhealthy after upgrade boot");
  dockerLogs(NAME).includes("Imported 1.x SQLite database")
    ? ok("auto-detected and imported the 1.x SQLite DB")
    : bad("did not auto-import the 1.x SQLite DB");

  // Second boot must NOT re-import (target Postgres now non-empty).
  restartEmbeddedContainer();
  (await waitHealthy(180000))
    ? ok("healthy after second boot")
    : bad("unhealthy after second boot");
  countMatches(dockerLogs(NAME), /Imported 1\.x SQLite database/g) === 1
    ? ok("did not re-import on the second boot")
    : bad("re-imported on the second boot");
  cleanup();

  // 7. A database that cannot start fails the boot instead of hanging it.
  //    Before #962 the readiness oneshots looped forever with `2>/dev/null`, so
  //    the container sat "Up" with nothing serving and no clue why (#734 was a
  //    real instance). REDIS_MAXMEMORY is passed straight through to
  //    redis-server, so a garbage value makes it exit at startup the same way.
  console.log("\n[7] a Redis that never starts fails the boot");
  cleanup();
  createVolume();
  if (quiet(["inspect", NAME])) throw new Error(`Unique container name collision: ${NAME}`);
  docker([
    "run",
    "-d",
    "--name",
    NAME,
    "--label",
    OWNER_LABEL,
    "-v",
    `${VOL}:/data`,
    "-e",
    "SNAPOTTER_TELEMETRY=0",
    "-e",
    "REDIS_MAXMEMORY=not-a-size",
    "-e",
    "EMBEDDED_REDIS_TIMEOUT_S=20",
    IMAGE,
  ]);
  if (!containerIsOwned()) {
    throw new Error(`Created container failed ownership validation: ${NAME}`);
  }
  // Same budget as the other first-boot waits: this pays for initdb too, since
  // s6 brings the Postgres branch up in parallel and the transition has to
  // settle before the container halts.
  (await waitExited(300000))
    ? ok("container exited instead of hanging")
    : bad("container still running (the old silent hang)");
  // Exiting is not enough. `restart: on-failure`, Kubernetes and systemd all
  // read the code, and a zero would tell them the boot was a clean shutdown.
  Number(quiet(["inspect", "--format", "{{.State.ExitCode}}", NAME]).trim()) !== 0
    ? ok("exited non-zero, so restart policies see a failure")
    : bad("exited 0; orchestrators would read a dead database as a clean stop");
  const brokenLogs = dockerLogs(NAME);
  brokenLogs.includes("FATAL: Redis did not become ready")
    ? ok("failure names Redis")
    : bad("no Redis failure message in the logs");
  brokenLogs.includes("Last probe output:\n  Could not connect to Redis")
    ? ok("carried the probe's own error into the report")
    : bad("probe error still discarded");
  // The 20s cap crosses the 15s heartbeat, so a slow boot proves it looks alive.
  /Waiting for Redis\.\.\. \d+s/.test(brokenLogs)
    ? ok("printed progress while waiting")
    : bad("no progress output during the wait");
  cleanup();

  // 8. An invalid API env value fails the boot instead of restart-looping (#2267).
  //    Without docker/s6/s6-rc.d/snapotter/finish, s6-supervise respawned the API
  //    forever while Postgres and Redis stayed up, leaving the container "Up" and
  //    serving nothing.
  console.log("\n[8] an invalid API env value fails the boot instead of restart-looping");
  cleanup();
  createVolume();
  if (quiet(["inspect", NAME])) throw new Error(`Unique container name collision: ${NAME}`);
  docker([
    "run",
    "-d",
    "--name",
    NAME,
    "--label",
    OWNER_LABEL,
    "-v",
    `${VOL}:/data`,
    "-e",
    "SNAPOTTER_TELEMETRY=0",
    "-e",
    "BASE_PATH=snapotter",
    IMAGE,
  ]);
  if (!containerIsOwned()) {
    throw new Error(`Created container failed ownership validation: ${NAME}`);
  }
  (await waitExited(300000))
    ? ok("container exited on invalid env instead of restart-looping")
    : bad("container still running after invalid env startup failure");
  Number(quiet(["inspect", "--format", "{{.State.ExitCode}}", NAME]).trim()) === 1
    ? ok("exited with the API's exit code (1) on invalid env")
    : bad("did not exit with code 1 on invalid env");
  const badEnvLogs = dockerLogs(NAME);
  badEnvLogs.includes("BASE_PATH must be empty, /, or a path such as /snapotter")
    ? ok("logged the BASE_PATH validation error")
    : bad("missing BASE_PATH validation error in logs");
  countMatches(badEnvLogs, /ZodError:/g) === 1
    ? ok("API ran once and did not respawn")
    : bad("API respawned more than once before halting");
  cleanup();

  // 9. A host-network setup: custom loopback ports and per-install passwords.
  console.log("\n[9] custom ports and per-install database passwords");
  cleanup();
  createVolume();
  runEmbeddedContainer([
    "-e",
    "EMBEDDED_PG_PORT=15432",
    "-e",
    "EMBEDDED_REDIS_PORT=16379",
    "-e",
    "EMBEDDED_DB_PASSWORDS=1",
  ]);
  (await waitHealthy(300000))
    ? ok("secured container reached healthy")
    : bad("secured container never became healthy");
  const modes = quiet([
    "exec",
    NAME,
    "stat",
    "-c",
    "%a %U",
    "/data/.embedded-db-secrets",
    "/data/.embedded-db-secrets/pg-owner",
    "/data/.embedded-db-secrets/pg-app",
    "/data/.embedded-db-secrets/redis",
  ])
    .trim()
    .split("\n")
    .join("|");
  modes === "700 root|600 root|600 root|600 root"
    ? ok("secrets are root-only")
    : bad(`unexpected secret modes: ${modes}`);
  const psql = (user, password) =>
    spawnSync(
      "docker",
      [
        "exec",
        "-e",
        `PGPASSWORD=${password}`,
        NAME,
        "psql",
        "-h",
        "127.0.0.1",
        "-p",
        "15432",
        "-U",
        user,
        "-d",
        "snapotter",
        "-c",
        "select 1",
      ],
      { encoding: "utf-8" },
    );
  const superuser = psql("postgres", "");
  superuser.status !== 0 && /no pg_hba\.conf entry/.test(superuser.stderr)
    ? ok("the superuser cannot log in over TCP")
    : bad(`superuser TCP login was not refused: ${superuser.stderr}`);
  const staleLogin = psql("snapotter_app", "snapotter_app");
  staleLogin.status !== 0 && /password authentication failed/.test(staleLogin.stderr)
    ? ok("the old fixed app password is refused")
    : bad(`the old app password still works: ${staleLogin.stderr}`);
  combined(["exec", NAME, "redis-cli", "-p", "16379", "ping"]).includes("NOAUTH")
    ? ok("Redis refuses unauthenticated clients")
    : bad("Redis answered without a password");
  quiet([
    "exec",
    NAME,
    "sh",
    "-c",
    'REDISCLI_AUTH="$(cat /data/.embedded-db-secrets/redis)" redis-cli -p 16379 ping',
  ]).trim() === "PONG"
    ? ok("Redis answers with the per-install password")
    : bad("Redis rejected its own password");
  // pg_isready exits 2 when nothing answers, and 1 for a server that answers
  // but rejects connections, which would still mean something listens there.
  const defaultPort = spawnSync("docker", [
    "exec",
    NAME,
    "pg_isready",
    "-h",
    "127.0.0.1",
    "-p",
    "5432",
  ]).status;
  defaultPort === 2
    ? ok("nothing listens on the default Postgres port")
    : bad(`pg_isready on port 5432 exited ${defaultPort}, not 2 (no response)`);
  // The passwords may live in files and in the services' environment, never in
  // a log line or an argv, which every local user can read in /proc.
  const secretValues = quiet([
    "exec",
    NAME,
    "sh",
    "-c",
    'for f in /data/.embedded-db-secrets/*; do cat "$f"; echo; done',
  ])
    .trim()
    .split("\n");
  const commandLines = quiet([
    "exec",
    NAME,
    "sh",
    "-c",
    "for f in /proc/[0-9]*/cmdline; do tr '\\0' ' ' < \"$f\"; echo; done",
  ]);
  const logs9 = dockerLogs(NAME);
  secretValues.length === 3 &&
  secretValues.every((secret) => /^[0-9a-f]{64}$/.test(secret)) &&
  !secretValues.some((secret) => logs9.includes(secret) || commandLines.includes(secret))
    ? ok("no password in the logs or on a command line")
    : bad("a per-install password reached the logs or a command line");
  // Nor in the database servers' environment, which any account with the
  // server's UID can read in /proc. The app itself needs its URLs.
  const serverEnvs = quiet([
    "exec",
    NAME,
    "sh",
    "-c",
    'for d in /proc/[0-9]*; do c="$(cat "$d/comm" 2>/dev/null)"; case "$c" in postgres|redis-server) echo "== $c"; tr "\\0" "\\n" < "$d/environ";; esac; done',
  ]);
  serverEnvs.includes("== postgres") &&
  serverEnvs.includes("== redis-server") &&
  !/^(DATABASE_URL|DATABASE_MIGRATION_URL|REDIS_URL|REDISCLI_AUTH)=/m.test(serverEnvs)
    ? ok("the database servers run without the connection URLs")
    : bad("a database server's environment carries a connection URL");
  // docker exec starts without the entrypoint's exports, so this proves
  // snapotter-admin finds both databases on its own: Postgres for the user
  // lookup, Redis for the throttle key.
  combined(["exec", NAME, "snapotter-admin", "unlock-user", "admin"]).includes(
    'User "admin" is not locked out',
  )
    ? ok("snapotter-admin reaches both databases under docker exec")
    : bad("snapotter-admin could not reach the embedded databases");
  const secretsBefore = quiet(["exec", NAME, "sh", "-c", "cat /data/.embedded-db-secrets/*"]);
  restartEmbeddedContainer();
  (await waitHealthy(300000))
    ? ok("secured container healthy after a restart")
    : bad("secured container unhealthy after a restart");
  quiet(["exec", NAME, "sh", "-c", "cat /data/.embedded-db-secrets/*"]) === secretsBefore
    ? ok("passwords survive a restart")
    : bad("passwords changed across a restart");
  cleanup();

  // 10. An existing volume turns the passwords on and keeps them: unsetting the
  //     variable changes nothing, a deleted secret comes back, and a directory
  //     handed to the app user, as booting with external databases does, is
  //     taken back.
  console.log("\n[10] an existing volume turns the passwords on and keeps them");
  cleanup();
  createVolume();
  runEmbeddedContainer();
  (await waitHealthy(300000))
    ? ok("unsecured container reached healthy")
    : bad("unsecured container never became healthy");
  // Reaching healthy already proves the app's own passwords work: the boot stops
  // unless Postgres takes them and Redis answers PONG. These prove TCP and Redis
  // turn away a client without them.
  const expectSecured = (when) => {
    const fixed = spawnSync(
      "docker",
      [
        "exec",
        "-e",
        "PGPASSWORD=snapotter_app",
        NAME,
        "psql",
        "-h",
        "127.0.0.1",
        "-U",
        "snapotter_app",
        "-d",
        "snapotter",
        "-c",
        "select 1",
      ],
      { encoding: "utf-8" },
    );
    fixed.status !== 0 && /password authentication failed/.test(fixed.stderr)
      ? ok(`${when}: TCP refuses the fixed app password`)
      : bad(`${when}: TCP did not refuse the fixed app password: ${fixed.stderr}`);
    combined(["exec", NAME, "redis-cli", "ping"]).includes("NOAUTH")
      ? ok(`${when}: Redis refuses unauthenticated clients`)
      : bad(`${when}: Redis answered without a password`);
  };
  replaceEmbeddedContainer(["-e", "EMBEDDED_DB_PASSWORDS=1"]);
  (await waitHealthy(300000))
    ? ok("healthy after turning the passwords on")
    : bad("unhealthy after turning the passwords on");
  expectSecured("turned on");
  replaceEmbeddedContainer();
  (await waitHealthy(300000))
    ? ok("healthy with the variable unset again")
    : bad("unhealthy with the variable unset again");
  expectSecured("variable unset");
  const appSecret = quiet(["exec", NAME, "cat", "/data/.embedded-db-secrets/pg-app"]);
  quiet(["exec", NAME, "rm", "/data/.embedded-db-secrets/pg-app"]);
  quiet(["exec", NAME, "chown", "-R", "snapotter:snapotter", "/data/.embedded-db-secrets"]);
  restartEmbeddedContainer();
  (await waitHealthy(300000))
    ? ok("healthy after a secret was deleted")
    : bad("unhealthy after a secret was deleted");
  const newAppSecret = quiet(["exec", NAME, "cat", "/data/.embedded-db-secrets/pg-app"]);
  /^[0-9a-f]{64}$/.test(newAppSecret) && newAppSecret !== appSecret
    ? ok("the deleted secret was generated again")
    : bad("the deleted secret was not generated again");
  expectSecured("secret regenerated");
  const owners = quiet([
    "exec",
    NAME,
    "stat",
    "-c",
    "%a %U:%G",
    "/data/.embedded-db-secrets",
    "/data/.embedded-db-secrets/pg-owner",
    "/data/.embedded-db-secrets/pg-app",
    "/data/.embedded-db-secrets/redis",
  ])
    .trim()
    .split("\n")
    .join("|");
  owners === "700 root:root|600 root:root|600 root:root|600 root:root"
    ? ok("the boot took the secrets back from the app user")
    : bad(`unexpected secret owners: ${owners}`);
  cleanup();

  // 11. A read-only root with tmpfs on /run and /tmp, the usual hardening
  //     recipe. The fresh /run hides the package's /run/postgresql, so the
  //     bootstrap has to make it on every boot (#4504), and a restart gives
  //     the container another fresh /run.
  console.log("\n[11] read-only root with tmpfs on /run and /tmp");
  cleanup();
  createVolume();
  runEmbeddedContainer([
    "--read-only",
    "--tmpfs",
    "/run:rw,exec,size=64m",
    "--tmpfs",
    "/tmp:rw,exec,size=2g",
    "-e",
    "AUTH_ENABLED=false",
    "-e",
    "EMBEDDED_POSTGRES_TIMEOUT_S=60",
  ]);
  // The checks after the first boot need a running API, and against a stopped
  // container they would throw instead of counting as one failure.
  if (await waitHealthy(300000)) {
    ok("read-only container reached healthy");
    const bytes = await resizedBytes();
    bytes > 0
      ? ok(`a tool runs on the read-only root (${bytes} bytes back)`)
      : bad("the resize on the read-only root returned no file");
    const layer = docker(["diff", NAME]).trim();
    layer === ""
      ? ok("nothing was written to the read-only root")
      : bad(`the container layer changed:\n${layer}`);
    restartEmbeddedContainer();
    (await waitHealthy(300000))
      ? ok("healthy again after a restart's fresh /run")
      : bad(`unhealthy after a restart:\n${dockerLogs(NAME).slice(-3000)}`);
    countMatches(dockerLogs(NAME), /existing data dir OK/g) >= 1
      ? ok("the restart kept the database")
      : bad("the restart did not reuse the data dir");
  } else {
    bad(`read-only container never became healthy:\n${dockerLogs(NAME).slice(-3000)}`);
  }
  cleanup();

  console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}`);
  return failures === 0 ? 0 : 1;
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(cleanup);
