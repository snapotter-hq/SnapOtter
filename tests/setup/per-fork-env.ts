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
await admin.end();

const forkUrl = new URL(baseUrl);
forkUrl.pathname = `/${dbName}`;
process.env.DATABASE_URL = forkUrl.toString();
