import { existsSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { getSettingString, upsertSetting } from "../lib/settings-helpers.js";
import { db } from "./index.js";
import { MIGRATED_TABLES, migrateFromSqlite, TargetNonEmptyError } from "./migrate-from-sqlite.js";

export const IMPORT_MARKER_KEY = "sqlite_import";

export type ImportStatus = "completed" | "detected_locked";
export interface ImportMarker {
  status: ImportStatus;
  tables?: Record<string, number>;
  blobs?: { present: number; missing: number };
  sourcePath?: string;
  at?: string;
}

export type BootState = "import" | "leftover" | "locked" | "none";

/** Resolve which SQLite file to consider. Explicit path wins; "off" disables; else probe DATA_DIR. */
export function resolveSource(env: {
  SQLITE_MIGRATE_PATH: string;
  DATA_DIR: string;
}): string | null {
  const explicit = env.SQLITE_MIGRATE_PATH.trim();
  if (explicit.toLowerCase() === "off") return null;
  if (explicit) return explicit;
  const probed = join(env.DATA_DIR, "snapotter.db");
  return existsSync(probed) ? probed : null;
}

/**
 * Decide the boot action from the three inputs. `import` runs the copy; `leftover`
 * means we already imported (source file is a harmless leftover); `locked` means a
 * source is present but the instance already has data, so we cannot auto-import.
 */
export function evaluateBootState(input: {
  usersCount: number;
  source: string | null;
  marker: { status: ImportStatus } | null;
}): BootState {
  if (!input.source) return "none";
  if (input.marker?.status === "completed") return "leftover";
  if (input.usersCount === 0) return "import";
  return "locked";
}

/**
 * Count how many user_files.stored_name blobs exist under filesStoragePath.
 * Read-only; only ever called during an actual import or the CLI, never on
 * leftover/locked boots (a large library must not stat-scan on every boot).
 */
export async function countLibraryBlobs(
  sqlitePath: string,
  filesStoragePath: string,
): Promise<{ present: number; missing: number }> {
  const { default: Database } = await import("better-sqlite3");
  const s = new Database(sqlitePath, { readonly: true });
  let present = 0;
  let missing = 0;
  try {
    const rows = s.prepare("SELECT stored_name FROM user_files").all() as Array<{
      stored_name: string;
    }>;
    for (const r of rows) {
      if (existsSync(join(filesStoragePath, r.stored_name))) present++;
      else missing++;
    }
  } catch {
    /* no user_files table on very old files */
  } finally {
    s.close();
  }
  return { present, missing };
}

const VALID_JOB_STATUS = new Set(["queued", "processing", "completed", "failed", "canceled"]);

export interface AnalyzeReport {
  tables: Record<string, number>;
  blobs: { present: number; missing: number };
  badStatuses: string[];
}

/**
 * Read-only pre-flight analysis of a 1.x SQLite file. Needs no live Postgres, so an
 * operator can run it before starting the stack. Reports per-table row counts,
 * library-blob presence, and any job status values outside the 2.x enum (which the
 * importer maps to "failed"/"processing").
 */
export async function analyzeSqlite(
  sqlitePath: string,
  filesStoragePath: string,
): Promise<AnalyzeReport> {
  const { default: Database } = await import("better-sqlite3");
  const s = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  const tables: Record<string, number> = {};
  const badStatuses = new Set<string>();
  try {
    for (const t of MIGRATED_TABLES) {
      try {
        tables[t] = (s.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n;
      } catch {
        tables[t] = 0; // table absent in an older 1.x file
      }
    }
    try {
      const rows = s.prepare("SELECT DISTINCT status FROM jobs").all() as Array<{ status: string }>;
      for (const r of rows) {
        if (!VALID_JOB_STATUS.has(String(r.status).toLowerCase())) {
          badStatuses.add(String(r.status));
        }
      }
    } catch {
      /* no jobs table */
    }
  } finally {
    s.close();
  }
  const blobs = await countLibraryBlobs(sqlitePath, filesStoragePath);
  return { tables, blobs, badStatuses: [...badStatuses] };
}

export async function getImportMarker(): Promise<ImportMarker | null> {
  const raw = await getSettingString(IMPORT_MARKER_KEY, "");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ImportMarker;
  } catch {
    return null;
  }
}

async function writeImportMarker(marker: ImportMarker): Promise<void> {
  await upsertSetting(IMPORT_MARKER_KEY, JSON.stringify(marker));
}

/**
 * Boot entry point. Resolves the source, evaluates the state, and acts, keeping
 * the "import before any seeding" ordering the caller relies on. Never deletes
 * the source. Returns the resolved state for logging.
 */
export async function runBootImport(env: {
  SQLITE_MIGRATE_PATH: string;
  DATA_DIR: string;
  FILES_STORAGE_PATH: string;
}): Promise<BootState> {
  const source = resolveSource(env);
  const marker = await getImportMarker();
  const { rows } = await db.execute(sql`SELECT count(*)::int AS n FROM users`);
  const state = evaluateBootState({ usersCount: rows[0].n as number, source, marker });

  if (state === "import" && source) {
    try {
      const result = await migrateFromSqlite(source, { force: false });
      const blobs = await countLibraryBlobs(source, env.FILES_STORAGE_PATH);
      await writeImportMarker({
        status: "completed",
        tables: result.tables,
        blobs,
        sourcePath: source,
        at: new Date().toISOString(),
      });
      console.log(
        "Imported 1.x SQLite database:",
        JSON.stringify({ tables: result.tables, blobs }),
      );
    } catch (err) {
      if (err instanceof TargetNonEmptyError) {
        // Another replica imported first; benign.
        console.log("1.x import skipped: another instance populated the database first.");
        return "leftover";
      }
      console.error(
        `FATAL: 1.x SQLite import failed from ${source}: ${(err as Error).message}. No partial data was written.`,
      );
      process.exit(1);
    }
  } else if (state === "locked" && source) {
    console.warn(
      `WARNING: a 1.x database was found at ${source} but this instance already has data, so it was NOT imported. ` +
        "Importing 1.x data requires an empty instance. See the upgrade guide.",
    );
    await writeImportMarker({ status: "detected_locked", sourcePath: source });
  } else if (state === "leftover" && source) {
    console.log(`1.x import already applied; you may delete ${source}.`);
  }
  return state;
}

// CLI: pnpm --filter @snapotter/api migrate:sqlite -- <path> [--dry-run|--verify] [--force]
const invokedDirectly = /sqlite-import\.[tj]s$/.test(process.argv[1] ?? "");
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const cliPath = args.find((a) => a !== "--" && !a.startsWith("--"));
  const dryRun = args.includes("--dry-run") || args.includes("--verify");
  const force = args.includes("--force");
  if (!cliPath) {
    console.error("Usage: migrate:sqlite -- <path-to-1.x-sqlite-db> [--dry-run] [--force]");
    process.exit(1);
  }
  const filesStoragePath = process.env.FILES_STORAGE_PATH || "./data/files";
  if (dryRun) {
    analyzeSqlite(cliPath, filesStoragePath)
      .then((r) => {
        const total = Object.values(r.tables).reduce((a, b) => a + b, 0);
        console.log("1.x import dry run (no writes):");
        console.log("  rows per table:", JSON.stringify(r.tables));
        console.log(`  library blobs: ${r.blobs.present} present, ${r.blobs.missing} missing`);
        if (r.blobs.missing > 0) {
          console.log("  WARNING: some saved-library files are missing from the files directory.");
        }
        if (r.badStatuses.length) {
          console.log(
            `  job statuses to be mapped: ${r.badStatuses.join(", ")} -> failed/processing`,
          );
        }
        console.log(`  would import ${total} rows total (sessions are intentionally skipped).`);
        process.exit(0);
      })
      .catch((err) => {
        console.error("Dry run failed:", (err as Error).message);
        process.exit(1);
      });
  } else {
    migrateFromSqlite(cliPath, { force })
      .then((r) => {
        console.log("Migration complete:", JSON.stringify(r.tables));
        process.exit(0);
      })
      .catch((err) => {
        console.error(
          "Migration FAILED (no partial state; transaction rolled back):",
          (err as Error).message,
        );
        process.exit(1);
      });
  }
}
