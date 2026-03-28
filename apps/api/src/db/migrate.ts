import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve migrations folder relative to this file, not the working directory
const migrationsFolder = join(__dirname, "../../drizzle");

function isAlreadyExistsError(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.message.includes("already exists")) return true;
    // DrizzleError wraps the real SqliteError in .cause
    if ("cause" in err && err.cause instanceof Error) {
      return err.cause.message.includes("already exists");
    }
  }
  return false;
}

let migrated = false;

export function runMigrations() {
  if (migrated) return;
  try {
    migrate(db, { migrationsFolder });
  } catch (err: unknown) {
    // In test / multi-process environments, concurrent workers may race to
    // apply migrations on the same database file. If a table already exists,
    // the schema is in place and we can safely continue.
    // Drizzle wraps the SqliteError in a DrizzleError, so check both the
    // outer message and the cause chain.
    if (isAlreadyExistsError(err)) {
      // Tables created by another process — DB is ready
    } else {
      throw err;
    }
  }
  migrated = true;
}
