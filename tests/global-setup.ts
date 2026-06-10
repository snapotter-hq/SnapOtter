import { createRequire } from "node:module";
import { join } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

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

  // Build the migrated template database once; forks clone it.
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  await admin.query("DROP DATABASE IF EXISTS snapotter_template");
  await admin.query("CREATE DATABASE snapotter_template");
  await admin.end();

  const templateUrl = new URL(baseUrl);
  templateUrl.pathname = "/snapotter_template";
  const pool = new pg.Pool({ connectionString: templateUrl.toString(), max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: join(process.cwd(), "apps/api/drizzle") });
  } finally {
    await pool.end();
  }
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
