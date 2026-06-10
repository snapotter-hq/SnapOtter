import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { pool } from "./index.js";

// Advisory lock IDs: pick any unique int32. Reserve 7_421_xxx for SnapOtter app locks.
const MIGRATION_LOCK_KEY = 7_421_001;

export async function runMigrations(): Promise<void> {
  const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

  // Advisory locks are session-scoped. With a Pool the lock and unlock could
  // land on different connections, so we acquire a dedicated client and run
  // lock, migration, and unlock on that single session.
  const client = await pool.connect();
  try {
    const clientDb = drizzle(client);
    await clientDb.execute(sql`SELECT pg_advisory_lock(${MIGRATION_LOCK_KEY})`);
    try {
      await migrate(clientDb, { migrationsFolder });
    } finally {
      await clientDb.execute(sql`SELECT pg_advisory_unlock(${MIGRATION_LOCK_KEY})`);
    }
  } finally {
    client.release();
  }
}
