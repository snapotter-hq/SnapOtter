import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import pg from "pg";

// Each test file (forks pool, isolated) gets its own Postgres database cloned
// from the migrated template built in tests/global-setup.ts, plus its own
// workspace dir. setupFiles run before any app module loads, so
// apps/api/src/config.ts captures the per-file DATABASE_URL.
const suffix = `${process.pid}_${crypto.randomUUID().slice(0, 8).replace(/-/g, "")}`;
const forkDir = path.join(os.tmpdir(), `SnapOtter-test-${suffix}`);
process.env.WORKSPACE_PATH = path.join(forkDir, "workspace");

const baseUrl = process.env.TEST_PG_BASE_URL;
if (!baseUrl) {
  throw new Error("TEST_PG_BASE_URL missing; tests/global-setup.ts did not run");
}

// The least-privilege role the app serves requests as. Created cluster-wide and
// granted on the template in tests/global-setup.ts, so this fork's cloned
// database already carries the grants.
const runtimeRole = process.env.TEST_RUNTIME_ROLE;
const runtimePassword = process.env.TEST_RUNTIME_PASSWORD;
if (!runtimeRole || !runtimePassword) {
  throw new Error(
    "TEST_RUNTIME_ROLE / TEST_RUNTIME_PASSWORD missing; tests/global-setup.ts did not run",
  );
}

// Each worker process logs in as its own member of that role rather than as the
// role itself.
//
// ensureRuntimeRole() realigns the runtime password on every boot, and every
// test file boots. Postgres does not queue concurrent writers of a pg_authid
// row: the losers get "tuple concurrently updated" (XX000, simple_heap_update),
// which fails the boot outright. A deployment is safe from that because its
// replicas share one database and the migration advisory lock (which is
// database-scoped) serializes them. This harness is the one shape where that
// lock does not help, since it runs a database per test file against a single
// cluster. One login role per worker process restores the invariant: files
// inside a process run one at a time, so no pg_authid row ever has two writers.
//
// Membership is what carries the privileges: the fork role inherits exactly the
// grant set global-setup applied to the template and nothing besides.
const forkRole = `${runtimeRole}_${process.pid}`;

const redisBaseUrl = process.env.TEST_REDIS_BASE_URL;
if (!redisBaseUrl) {
  throw new Error("TEST_REDIS_BASE_URL missing; tests/global-setup.ts did not run");
}
process.env.REDIS_URL = redisBaseUrl;
process.env.BULLMQ_PREFIX = `snapotter_test_${suffix}`;

// Heavy format conversions can exceed the 8s production default under parallel
// test forks; 30s keeps tool routes synchronous (200) in tests while production
// stays at 8s.
//
// An explicit SYNC_WAIT_MS is honored verbatim rather than floored, so the
// constrained docker test image (macOS Docker VM, where Sharp and FFmpeg run
// ~2-3x slower) can widen the window.
//
// Careful with 0: per the repo-wide convention it means unlimited, not
// instant. BullMQ's waitUntilFinished only arms its timer under `if (ttl)`, so
// 0 waits forever and every route answers 200. To force the 202 path (the only
// way to exercise it on a machine fast enough never to hit it naturally), pass
// a small positive value such as SYNC_WAIT_MS=1. Note that most specs assert a
// bare 200 and will fail under it; only the ones that call
// settleAsyncFallback are written to survive.
const requestedSyncWait = process.env.SYNC_WAIT_MS?.trim();
const hasExplicitSyncWait =
  Boolean(requestedSyncWait) && Number.isFinite(Number(requestedSyncWait));
process.env.SYNC_WAIT_MS = hasExplicitSyncWait ? (requestedSyncWait as string) : "30000";
const dbName = `snapotter_test_${suffix}`; // pid digits + uuid hex: identifier-safe
const admin = new pg.Client({ connectionString: baseUrl });
await admin.connect();
// Concurrent CREATE DATABASE ... TEMPLATE from parallel forks can transiently
// conflict; retry briefly.
let created = false;
for (let attempt = 0; attempt < 5 && !created; attempt++) {
  try {
    await admin.query(`CREATE DATABASE ${dbName} TEMPLATE snapotter_template`);
    created = true;
  } catch (err) {
    if (attempt === 4) throw err;
    await new Promise((r) => setTimeout(r, 150 + Math.floor(150 * attempt)));
  }
}
// Every file in this process reuses the same role, so this runs once per worker
// and is a lookup thereafter. The name is derived from the pid and the password
// is a harness constant, so neither can carry injection into the DDL below; the
// shipping path quotes both server-side with format() instead (see
// apps/api/src/db/bootstrap-roles.ts).
const { rows: roleRows } = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [
  forkRole,
]);
if (roleRows.length === 0) {
  await admin.query(
    `CREATE ROLE ${forkRole} LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS IN ROLE ${runtimeRole}`,
  );
}
await admin.end();

const forkUrl = new URL(baseUrl);
forkUrl.pathname = `/${dbName}`;

// Every integration test boots through the real privilege split: the boot path
// migrates and provisions as the owning base role, then the app serves as the
// restricted runtime role. Anything that quietly needs more than DML on the app
// tables fails here rather than in a shipped deployment.
const privilegedUrl = forkUrl.toString();
process.env.DATABASE_MIGRATION_URL = privilegedUrl;
// Tests whose own setup or teardown legitimately needs owner rights (TRUNCATE,
// DDL) use this instead of widening what the runtime role may do.
process.env.TEST_PRIVILEGED_DATABASE_URL = privilegedUrl;

const runtimeUrl = new URL(forkUrl);
runtimeUrl.username = encodeURIComponent(forkRole);
runtimeUrl.password = encodeURIComponent(runtimePassword);
process.env.DATABASE_URL = runtimeUrl.toString();
