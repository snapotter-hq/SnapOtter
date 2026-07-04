import { sql } from "drizzle-orm";
import { db } from "./index.js";
import { runMigrations } from "./migrate.js";

// Advisory lock: 7_421_xxx reserved for SnapOtter app locks (7_421_001 = schema migrate).
const SQLITE_IMPORT_LOCK_KEY = 7_421_002;

type SqliteRow = Record<string, unknown>;
export interface MigrationResult {
  tables: Record<string, number>;
}

/** Thrown when the target became non-empty (e.g. another replica imported first). */
export class TargetNonEmptyError extends Error {}

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

// Map 1.x job status values onto the 2.x job_status enum. Anything unrecognized
// is coerced to "failed" so no single row can abort the transaction on an enum error.
const STATUS_MAP: Record<string, string> = {
  queued: "queued",
  processing: "processing",
  running: "processing",
  completed: "completed",
  complete: "completed",
  failed: "failed",
  error: "failed",
  canceled: "canceled",
  cancelled: "canceled",
};
const VALID_STATUS = new Set(["queued", "processing", "completed", "failed", "canceled"]);

// FK-safe copy order. Sessions are intentionally NOT migrated (users re-auth once;
// credentials are unchanged so the same login works).
export const MIGRATED_TABLES = [
  "users",
  "teams",
  "settings",
  "roles",
  "api_keys",
  "pipelines",
  "jobs",
  "audit_log",
  "user_files",
] as const;

// Column renames between 1.x and 2.x (source name -> target name). None today.
const RENAMES: Record<string, Record<string, string>> = {};

/**
 * Target columns the engine can populate for `table` given the 1.x row's source
 * columns. Used by the CI drift guard so it agrees with the actual copy logic.
 */
export function columnsEngineCanFill(table: string, sourceColumns: string[]): Set<string> {
  const rename = RENAMES[table] ?? {};
  const out = new Set(sourceColumns.map((c) => rename[c] ?? c));
  if (table === "jobs") {
    // jobs remap discards source file paths and produces these target columns:
    out.delete("input_files");
    out.delete("output_path");
    out.add("input_refs");
    out.add("output_refs");
    // progress/error/status keep their source names.
  }
  return out;
}

function convertRow(table: string, row: SqliteRow): SqliteRow {
  const out: SqliteRow = {};
  const rename = RENAMES[table] ?? {};
  for (const [rawCol, raw] of Object.entries(row)) {
    const col = rename[rawCol] ?? rawCol;
    // Jobs table: remap removed/renamed 1.x columns to new spine columns.
    if (table === "jobs") {
      if (rawCol === "input_files") {
        // 1.x refs are dead workspace paths; discard content, store empty array
        out.input_refs = [];
        continue;
      }
      if (rawCol === "output_path") {
        // Replaced by output_refs; 1.x paths are dead
        out.output_refs = [];
        continue;
      }
      if (rawCol === "progress") {
        // real 0-1 becomes jsonb {percent}
        const p = typeof raw === "number" ? raw : 0;
        out.progress = { percent: Math.round(p * 100) };
        continue;
      }
      if (rawCol === "error") {
        // text becomes jsonb {message}
        out.error = raw ? { message: String(raw) } : null;
        continue;
      }
      if (rawCol === "status") {
        // Map 1.x status onto the 2.x enum; unknown -> failed.
        const mapped = STATUS_MAP[String(raw).toLowerCase()] ?? "failed";
        out.status = VALID_STATUS.has(mapped) ? mapped : "failed";
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

/** Live target columns for a public table (drizzle transaction handle). */
async function targetColumns(
  tx: { execute: typeof db.execute },
  table: string,
): Promise<Set<string>> {
  const res = await tx.execute(
    sql`SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table}`,
  );
  return new Set(res.rows.map((r) => r.column_name as string));
}

export async function migrateFromSqlite(
  sqlitePath: string,
  opts: { force: boolean },
): Promise<MigrationResult> {
  const { default: Database } = await import("better-sqlite3"); // lazy: only the migrator needs it
  // Intentionally also called by the boot path (idempotent via advisory lock + drizzle journal)
  // so the CLI works standalone; do not remove.
  await runMigrations();

  const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  const result: MigrationResult = { tables: {} };
  try {
    await db.transaction(async (tx) => {
      // Serialize concurrent replicas: only one import proceeds; losers re-check below.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${SQLITE_IMPORT_LOCK_KEY})`);
      const existing = await tx.execute(sql`SELECT count(*)::int AS n FROM users`);
      if ((existing.rows[0].n as number) > 0 && !opts.force) {
        throw new TargetNonEmptyError(
          "Target Postgres database is non-empty; refusing to migrate. Re-run with --force to attempt inserting 1.x rows into the existing database. This will FAIL and roll back if any primary key or unique value (username, team name, role name) collides with existing data.",
        );
      }

      for (const table of MIGRATED_TABLES) {
        let rows: SqliteRow[];
        try {
          rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as SqliteRow[];
        } catch (e) {
          // Older-than-1.17.2 files may lack a table. Skip rather than fatal.
          if (/no such table/i.test((e as Error).message)) {
            result.tables[table] = 0;
            continue;
          }
          throw e;
        }

        const target = await targetColumns(tx, table);
        for (const row of rows) {
          const converted = convertRow(table, row);
          // Self-adjusting: insert only columns that exist in the live target, so a
          // column 1.x has but 2.x dropped (analytics_*) is skipped generically.
          const cols = Object.keys(converted).filter((c) => target.has(c));
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
// The CLI (including --dry-run) lives in sqlite-import.ts, the orchestrator that
// wraps this engine. `pnpm --filter @snapotter/api migrate:sqlite` runs that.
