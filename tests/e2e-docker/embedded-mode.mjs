#!/usr/bin/env node
// Embedded-mode container lifecycle tests. Requires Docker and a built image.
// Usage: SNAPOTTER_IMAGE=snapotter:embed-wip node tests/e2e-docker/embedded-mode.mjs
//
// Unlike the Playwright e2e-docker specs (which talk to an already-running
// container), these drive `docker run`/`stop` directly to exercise the container
// lifecycle: bare-run boot, restart persistence, clean shutdown, the non-root and
// partial-config fail-fast guards, and the 1.x SQLite auto-detect upgrade.
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

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
const runEmbeddedContainer = () => {
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

const countMatches = (haystack, re) => (haystack.match(re) || []).length;

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
