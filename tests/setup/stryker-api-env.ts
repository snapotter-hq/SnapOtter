// Minimal env stub for the apps/api mutation lane. The api unit tests
// (tests/unit/api) are pure logic and never build a real app or touch the DB
// (0 of 140 use buildTestApp), but some apps/api/src modules read env at import
// time. Set harmless dummy values so those imports resolve WITHOUT any Postgres
// or Redis connection - this lane deliberately skips the testcontainer
// global-setup and per-fork DB cloning that the full suite uses.
import os from "node:os";
import path from "node:path";

process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgres://dummy:dummy@127.0.0.1:5432/dummy";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";
process.env.DATA_DIR ??= path.join(os.tmpdir(), "snapotter-stryker-api");
process.env.WORKSPACE_PATH ??= path.join(os.tmpdir(), "snapotter-stryker-api", "workspace");
process.env.BULLMQ_PREFIX ??= "snapotter_stryker_api";
