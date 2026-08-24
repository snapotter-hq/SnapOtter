import { createRequire } from "node:module";
import { join } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";

// pg and drizzle-orm live in the api workspace's node_modules. Global-setup
// files run outside Vite's transform pipeline, so vitest resolve.alias does
// not apply. Use createRequire pointed at the api workspace instead.
const apiRequire = createRequire(join(process.cwd(), "apps/api/package.json"));
const pg = apiRequire("pg") as typeof import("pg");
const { drizzle } = apiRequire(
  "drizzle-orm/node-postgres",
) as typeof import("drizzle-orm/node-postgres");
const { migrate } = apiRequire(
  "drizzle-orm/node-postgres/migrator",
) as typeof import("drizzle-orm/node-postgres/migrator");

let container: StartedPostgreSqlContainer | undefined;
let redisContainer: StartedRedisContainer | undefined;

// The least-privilege role every fork serves requests as, so the integration
// suite exercises the same grants a split deployment runs on. Roles are
// cluster-wide while databases are per-fork, so it is created once here and the
// grants go on the template, which CREATE DATABASE ... TEMPLATE then clones.
//
// Both are compile-time literals, never operator or test input, so interpolating
// them into DDL below cannot be an injection vector. Everything in the shipping
// path quotes identifiers server-side with format(%I) instead; see
// apps/api/src/db/bootstrap-roles.ts.
const TEST_RUNTIME_ROLE = "snapotter_app_test";
const TEST_RUNTIME_PASSWORD = "snapotter_app_test_pw";

export async function setup(): Promise<void> {
  // Base server: testcontainer by default, or an existing server via
  // TEST_DATABASE_URL (must allow CREATE DATABASE, e.g. postgres://...:5432/postgres).
  let baseUrl: string;
  if (process.env.TEST_DATABASE_URL) {
    baseUrl = process.env.TEST_DATABASE_URL;
  } else {
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    baseUrl = container.getConnectionUri();
  }
  process.env.TEST_PG_BASE_URL = baseUrl; // forks inherit this
  // Setup files load outside Vite's transform pipeline (the reason for
  // createRequire above), so per-fork-env.ts reads these from env rather than
  // importing them.
  process.env.TEST_RUNTIME_ROLE = TEST_RUNTIME_ROLE;
  process.env.TEST_RUNTIME_PASSWORD = TEST_RUNTIME_PASSWORD;

  // Build the migrated template database once; forks clone it.
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  // CREATE ROLE has no IF NOT EXISTS, and TEST_DATABASE_URL can point at a
  // long-lived server where an earlier run already created it.
  const { rows: existing } = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [
    TEST_RUNTIME_ROLE,
  ]);
  if (existing.length === 0) {
    await admin.query(
      `CREATE ROLE ${TEST_RUNTIME_ROLE} LOGIN PASSWORD '${TEST_RUNTIME_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`,
    );
  }
  await admin.query("DROP DATABASE IF EXISTS snapotter_template");
  await admin.query("CREATE DATABASE snapotter_template");
  await admin.end();

  const templateUrl = new URL(baseUrl);
  templateUrl.pathname = "/snapotter_template";
  const pool = new pg.Pool({ connectionString: templateUrl.toString(), max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: join(process.cwd(), "apps/api/drizzle") });
    // Grants live inside the database, so cloning the template carries them into
    // every fork. Mirrors grantRuntimePrivileges/grantOnExistingObjects in
    // apps/api/src/db/bootstrap-roles.ts: DML on app tables, their sequences,
    // and nothing on the drizzle migration schema.
    await pool.query(`GRANT USAGE ON SCHEMA public TO ${TEST_RUNTIME_ROLE}`);
    await pool.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${TEST_RUNTIME_ROLE}`,
    );
    await pool.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${TEST_RUNTIME_ROLE}`,
    );
    await pool.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${TEST_RUNTIME_ROLE}`,
    );
    await pool.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${TEST_RUNTIME_ROLE}`,
    );
  } finally {
    await pool.end();
  }

  // Redis server: testcontainer by default, or an existing server via
  // TEST_REDIS_URL (e.g. inside Docker where testcontainers cannot spawn).
  if (process.env.TEST_REDIS_URL) {
    process.env.TEST_REDIS_BASE_URL = process.env.TEST_REDIS_URL;
  } else {
    redisContainer = await new RedisContainer("redis:8-alpine").start();
    process.env.TEST_REDIS_BASE_URL = redisContainer.getConnectionUrl();
  }
}

export async function teardown(): Promise<void> {
  await redisContainer?.stop();
  await container?.stop();
}
