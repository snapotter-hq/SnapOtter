import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./index.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve migrations folder relative to this file, not the working directory
const migrationsFolder = join(__dirname, "../../drizzle");

export function runMigrations() {
  migrate(db, { migrationsFolder });
}
