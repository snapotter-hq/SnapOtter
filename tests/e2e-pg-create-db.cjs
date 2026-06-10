/**
 * Create a fresh Postgres database for an e2e Playwright run.
 *
 * Usage: node tests/e2e-pg-create-db.cjs <db-name>
 *
 * Connects to E2E_PG_BASE_URL (default postgres://snapotter:snapotter@localhost:5432/snapotter),
 * drops the target database if it exists, then creates it.  The API server
 * (started right after this script) auto-migrates the empty database at boot.
 */
"use strict";

const { createRequire } = require("node:module");
const { join } = require("node:path");

const apiRequire = createRequire(join(process.cwd(), "apps/api/package.json"));
const pg = apiRequire("pg");

const baseUrl =
  process.env.E2E_PG_BASE_URL ||
  "postgres://snapotter:snapotter@localhost:5432/snapotter";
const dbName = process.argv[2];

if (!dbName) {
  console.error("Usage: node tests/e2e-pg-create-db.cjs <db-name>");
  process.exit(1);
}

async function main() {
  const client = new pg.Client({ connectionString: baseUrl });
  await client.connect();
  try {
    // Clean up stale e2e databases from previous runs (best-effort).
    const { rows } = await client.query(
      "SELECT datname FROM pg_database WHERE datname LIKE 'snapotter_e2e_%'",
    );
    for (const row of rows) {
      if (row.datname !== dbName) {
        try {
          await client.query(
            `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
             WHERE datname = $1 AND pid <> pg_backend_pid()`,
            [row.datname],
          );
          await client.query(`DROP DATABASE IF EXISTS "${row.datname}"`);
        } catch {
          // ignore: another process may still be using it
        }
      }
    }

    await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log(`[e2e-pg] created database: ${dbName}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[e2e-pg] failed to create database:", err.message);
  process.exit(1);
});
