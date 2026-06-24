import { sql } from "drizzle-orm";
import { db } from "./index.js";
import { runMigrations } from "./migrate.js";

type SqliteRow = Record<string, unknown>;
export interface MigrationResult {
  tables: Record<string, number>;
}

// columns storing epoch-seconds integers in 1.x
const TS = new Set(["created_at", "updated_at", "expires_at", "completed_at", "last_used_at"]);
// columns storing 0/1 booleans in 1.x
const BOOL = new Set(["must_change_password", "is_builtin"]);
// per-table columns whose values must be cast to jsonb in the INSERT
const JSONB: Record<string, Set<string>> = {
  jobs: new Set(["settings", "input_refs", "output_refs", "progress", "error"]),
  pipelines: new Set(["steps"]),
  api_keys: new Set(["permissions"]),
  roles: new Set(["permissions"]),
  audit_log: new Set(["details"]),
  user_files: new Set(["tool_chain"]),
};
// FK-safe copy order
const TABLE_ORDER = [
  "users",
  "teams",
  "settings",
  "roles",
  "sessions",
  "api_keys",
  "pipelines",
  "jobs",
  "audit_log",
  "user_files",
] as const;

function convertRow(table: string, row: SqliteRow): SqliteRow {
  const out: SqliteRow = {};
  for (const [col, raw] of Object.entries(row)) {
    // Jobs table: remap removed 1.x columns to new spine columns
    if (table === "jobs") {
      if (col === "input_files") {
        // 1.x refs are dead workspace paths; discard content, store empty array
        out.input_refs = [];
        continue;
      }
      if (col === "output_path") {
        // Replaced by output_refs; 1.x paths are dead
        out.output_refs = [];
        continue;
      }
      if (col === "progress") {
        // real 0-1 becomes jsonb {percent}
        const p = typeof raw === "number" ? raw : 0;
        out.progress = { percent: Math.round(p * 100) };
        continue;
      }
      if (col === "error") {
        // text becomes jsonb {message}
        out.error = raw ? { message: String(raw) } : null;
        continue;
      }
    }

    if (raw === null || raw === undefined) {
      out[col] = null;
    } else if (TS.has(col)) {
      out[col] = new Date((raw as number) * 1000);
    } else if (BOOL.has(col)) {
      out[col] = raw === 1;
    } else if (JSONB[table]?.has(col)) {
      try {
        out[col] = JSON.parse(raw as string);
      } catch (e) {
        throw new Error(
          `Invalid JSON in ${table}.${col} (row id=${String(row.id)}): ${(e as Error).message}`,
        );
      }
    } else {
      out[col] = raw;
    }
  }
  return out;
}

export async function migrateFromSqlite(
  sqlitePath: string,
  opts: { force: boolean },
): Promise<MigrationResult> {
  const { default: Database } = await import("better-sqlite3"); // lazy: only the migrator needs it
  // Intentionally also called by the boot path (idempotent via advisory lock + drizzle journal)
  // so the CLI works standalone; do not remove.
  await runMigrations();

  const existing = await db.execute(sql`SELECT count(*)::int AS n FROM users`);
  if ((existing.rows[0].n as number) > 0 && !opts.force) {
    throw new Error(
      "Target Postgres database is non-empty; refusing to migrate. Re-run with --force to attempt inserting 1.x rows into the existing database. This will FAIL and roll back if any primary key or unique value (username, team name, role name) collides with existing data.",
    );
  }

  const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  const result: MigrationResult = { tables: {} };
  try {
    await db.transaction(async (tx) => {
      for (const table of TABLE_ORDER) {
        const rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as SqliteRow[];
        for (const row of rows) {
          const converted = convertRow(table, row);
          const cols = Object.keys(converted);
          const colList = sql.raw(cols.map((c) => `"${c}"`).join(", "));
          const values = sql.join(
            cols.map((c) => {
              const v = converted[c];
              // jsonb columns: the pg driver sends JS arrays as postgres ARRAY
              // literals, not json. Explicitly stringify and cast to jsonb.
              if (JSONB[table]?.has(c) && v !== null) {
                return sql`${JSON.stringify(v)}::jsonb`;
              }
              return sql`${v}`;
            }),
            sql.raw(", "),
          );
          await tx.execute(
            sql`INSERT INTO ${sql.raw(`"${table}"`)} (${colList}) VALUES (${values})`,
          );
        }
        const count = (
          await tx.execute(sql`SELECT count(*)::int AS n FROM ${sql.raw(`"${table}"`)}`)
        ).rows[0].n as number;
        if (count < rows.length) {
          throw new Error(`Row count mismatch for ${table}: sqlite=${rows.length} pg=${count}`);
        }
        result.tables[table] = rows.length;
      }
    });
  } finally {
    sqlite.close();
  }
  return result;
}

// CLI entry: pnpm --filter @snapotter/api migrate:sqlite -- <path> [--force]
const invokedDirectly = /migrate-from-sqlite\.[tj]s$/.test(process.argv[1] ?? "");
if (invokedDirectly) {
  // pnpm forwards "--" as a literal arg; skip it and any flags to find the positional path
  const args = process.argv.slice(2);
  const path = args.find((a) => a !== "--" && !a.startsWith("--"));
  const force = args.includes("--force");
  if (!path) {
    console.error("Usage: migrate-from-sqlite <path-to-1.x-sqlite-db> [--force]");
    process.exit(1);
  }
  migrateFromSqlite(path, { force })
    .then((r) => {
      console.log("Migration complete:", JSON.stringify(r.tables));
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration FAILED (no partial state; transaction rolled back):", err.message);
      process.exit(1);
    });
}
