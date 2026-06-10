import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

// Each Vitest fork gets its own SQLite DB + workspace so test files can run
// in parallel. setupFiles run before any test file (and therefore before any
// app module) loads, so apps/api/src/config.ts captures the per-fork paths.
const forkDir = path.join(
  os.tmpdir(),
  `SnapOtter-test-${process.pid}-${crypto.randomUUID().slice(0, 8)}`,
);
process.env.DB_PATH = path.join(forkDir, "test.db");
process.env.WORKSPACE_PATH = path.join(forkDir, "workspace");
