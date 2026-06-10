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
