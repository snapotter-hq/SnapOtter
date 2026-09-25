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

export function convertRow(table: string, row: SqliteRow): SqliteRow {
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
      // A double-encoded 1.x permissions cell parses to a jsonb string, which
      // the settings UI then chokes on forever (issue #846). Only a string
      // array may cross; api_keys.permissions is nullable, roles.permissions
      // is NOT NULL, so their fallbacks differ.
      if (col === "permissions") {
        const parsed = out[col];
        const clean = Array.isArray(parsed) ? parsed.filter((p) => typeof p === "string") : null;
        out[col] = clean ?? (table === "roles" ? [] : null);
      }
    } else {
      out[col] = raw;
    }
  }
  return out;
}

/** A 1.x user that arrives without the external identity its source row carried. */
export interface DetachedIdentity {
  id: string;
  username: string;
  authProvider: string;
  externalId: string;
  /** The imported row that kept the identity, or null when an existing account holds it. */
  keptBy: { id: string; username: string } | null;
}

/**
 * Key for the `users_auth_provider_external_id_unique` partial index, or null
 * for a row that index ignores. Length-prefixed so no provider/external-id pair
 * can spell another one.
 */
export function identityKey(row: SqliteRow): string | null {
  const external = row.external_id;
  if (external === null || external === undefined) return null;
  // A source predating the auth_provider column leaves it absent, and the target
  // column defaults to 'local', so key the row the way Postgres will store it.
  // Keying it as "" instead would miss a collision the INSERT then hits.
  const provider = row.auth_provider == null ? "local" : String(row.auth_provider);
  return `${provider.length}:${provider}:${String(external)}`;
}

/**
 * Migration 0008's rule (`apps/api/drizzle/0008_users_identity_unique.sql`):
 * oldest created_at first, ties broken on the smallest id. 1.x stores epoch
 * seconds and the #969 race fires well inside one second, so ties are the
 * normal case here rather than the exotic one.
 */
function oldestFirst(a: SqliteRow, b: SqliteRow): number {
  const at = a.created_at instanceof Date ? a.created_at.getTime() : 0;
  const bt = b.created_at instanceof Date ? b.created_at.getTime() : 0;
  if (at !== bt) return at - bt;
  const ai = String(a.id);
  const bi = String(b.id);
  return ai < bi ? -1 : ai > bi ? 1 : 0;
}

/**
 * Settle twin external identities across `rows` before they are inserted.
 *
 * 1.x carried the same auto-create race migration 0008 cleans up (issue #969),
 * so a source database can hold two users rows for one (auth_provider,
 * external_id). runMigrations() has already built the partial unique index by
 * the time the copy runs, so without this the second INSERT raises 23505 and
 * the whole import rolls back (issue #1005).
 *
 * Inside the source the keep-rule is 0008's: the oldest row keeps the identity
 * and the rest get external_id = NULL, so an imported install lands in the same
 * shape an upgraded one does. Against `taken`, the identities already in the
 * target (only non-empty under --force), the row that is already here keeps the
 * identity whatever its age: an import adds rows, it never unlinks an account
 * someone signs into today.
 *
 * Clears external_id on the losing rows in place and returns them in source
 * order, for the caller to report.
 */
export function detachTwinIdentities(
  rows: SqliteRow[],
  taken: ReadonlySet<string>,
): DetachedIdentity[] {
  const groups = new Map<string, SqliteRow[]>();
  for (const row of rows) {
    const key = identityKey(row);
    if (key === null) continue;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  // Maps each losing row to the imported row that kept the identity, or to null
  // when the target already holds it and no imported row wins.
  const losers = new Map<SqliteRow, SqliteRow | null>();
  for (const [key, group] of groups) {
    group.sort(oldestFirst);
    const targetHolds = taken.has(key);
    for (const row of group.slice(targetHolds ? 0 : 1)) {
      losers.set(row, targetHolds ? null : group[0]);
    }
  }

  const detached: DetachedIdentity[] = [];
  for (const row of rows) {
    if (!losers.has(row)) continue;
    const keeper = losers.get(row) ?? null;
    detached.push({
      id: String(row.id),
      username: String(row.username),
      authProvider: row.auth_provider == null ? "local" : String(row.auth_provider),
      externalId: String(row.external_id),
      keptBy: keeper ? { id: String(keeper.id), username: String(keeper.username) } : null,
    });
    row.external_id = null;
  }
  return detached;
}

/**
 * One operator-facing line per detached row. It has to name the row that kept
 * the identity, because unpicking this afterwards means hand-written SQL against
 * external_id: there is no UI for it.
 */
export function detachedIdentityWarning(d: DetachedIdentity): string {
  const who = `user "${d.username}" (id ${d.id})`;
  const identity = `${d.authProvider} identity "${d.externalId}"`;
  if (d.keptBy) {
    return `1.x import: ${who} shares the ${identity} with user "${d.keptBy.username}" (id ${d.keptBy.id}), which keeps the link. Both rows were imported; only the older one signs in through that identity.`;
  }
  return `1.x import: ${who} was imported without its ${identity}, which an account already in this database holds. The imported row keeps its files and its provider, but no longer answers to that identity.`;
}

/** External identities the target already answers for. Empty on a fresh import. */
async function heldIdentities(tx: { execute: typeof db.execute }): Promise<Set<string>> {
  const res = await tx.execute(
    sql`SELECT auth_provider, external_id FROM users WHERE external_id IS NOT NULL`,
  );
  const held = new Set<string>();
  for (const row of res.rows) {
    const key = identityKey(row as SqliteRow);
    if (key !== null) held.add(key);
  }
  return held;
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
  const detached: DetachedIdentity[] = [];
  try {
    await db.transaction(async (tx) => {
      // Serialize concurrent replicas: only one import proceeds; losers re-check below.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${SQLITE_IMPORT_LOCK_KEY})`);
      const existing = await tx.execute(sql`SELECT count(*)::int AS n FROM users`);
      if ((existing.rows[0].n as number) > 0 && !opts.force) {
        throw new TargetNonEmptyError(
          "Target Postgres database is non-empty; refusing to migrate. Re-run with --force to attempt inserting 1.x rows into the existing database. This will FAIL and roll back if any primary key or unique value (username, team name, role name) collides with existing data. The one exception is the (auth_provider, external_id) identity index: a 1.x user whose external identity already belongs to an account here is imported without that link instead of colliding.",
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
        // users converts up front so twin external identities can be settled
        // across the whole table before any INSERT: the partial unique index is
        // already built and one 23505 aborts the transaction (issue #1005).
        // Every other table stays row-at-a-time, so a large jobs table is never
        // held twice over.
        let convertedUsers: SqliteRow[] | null = null;
        if (table === "users") {
          convertedUsers = rows.map((row) => convertRow(table, row));
          detached.push(...detachTwinIdentities(convertedUsers, await heldIdentities(tx)));
        }

        // Sum what each INSERT reports rather than counting the table. Under
        // --force the target is pre-populated, so a whole-table count(*) stays
        // above rows.length however many rows go missing (issue #1217), and a
        // before/after count(*) delta would also pick up rows other sessions
        // commit or delete meanwhile on a live instance.
        let inserted = 0;
        for (let i = 0; i < rows.length; i++) {
          const converted = convertedUsers ? convertedUsers[i] : convertRow(table, rows[i]);
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
          const res = await tx.execute(
            sql`INSERT INTO ${sql.raw(`"${table}"`)} (${colList}) VALUES (${values})`,
          );
          inserted += res.rowCount ?? 0;
        }
        if (inserted < rows.length) {
          throw new Error(
            `Row count mismatch for ${table}: sqlite=${rows.length} inserted=${inserted}`,
          );
        }
        result.tables[table] = inserted;
      }
    });
  } finally {
    sqlite.close();
  }
  // Reported only once the transaction committed: a rolled-back import detached
  // nothing, and saying otherwise sends the operator looking for ghosts.
  for (const d of detached) console.warn(detachedIdentityWarning(d));
  return result;
}
// The CLI (including --dry-run) lives in sqlite-import.ts, the orchestrator that
// wraps this engine. `pnpm --filter @snapotter/api migrate:sqlite` runs that.
