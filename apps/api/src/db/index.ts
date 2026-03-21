import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { env } from "../config.js";
import * as schema from "./schema.js";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Ensure data directory exists
mkdirSync(dirname(env.DB_PATH), { recursive: true });

const sqlite = new Database(env.DB_PATH);

// Critical SQLite pragmas for reliability
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("synchronous = NORMAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { schema };
