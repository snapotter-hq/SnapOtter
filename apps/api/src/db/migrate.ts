import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isSafeMessageError, SafeError } from "@snapotter/shared";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { env } from "../config.js";
import { redactUrl } from "../lib/redact-url.js";
import {
  ensureRuntimeRole,
  grantOnExistingObjects,
  grantRuntimePrivileges,
} from "./bootstrap-roles.js";
import { pool } from "./index.js";
import { resolveRoleSplit } from "./roles.js";

// Advisory lock IDs: pick any unique int32. Reserve 7_421_xxx for SnapOtter app locks.
const MIGRATION_LOCK_KEY = 7_421_001;

function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

/**
 * Deepest a wrapped driver error is looked for. drizzle nests one level; the
 * rest is slack so a self-referencing cause cannot spin.
 */
const MAX_CAUSE_DEPTH = 5;

/**
 * First `code` in an error chain, which for a failed statement is its SQLSTATE.
 *
 * The bootstrap grants run through client.query(), which rejects with the
 * driver's error directly, but drizzle's migrator rethrows a failed statement as
 * its own error and hangs the driver's underneath as `cause`. Reading only the
 * top level would therefore miss every failure that lands inside migrate(),
 * which is where a non-owner role trips first on a stock cluster.
 *
 * Any other `code` wins if it comes first, Node's ECONNREFUSED included, so
 * compare against a specific value rather than testing for presence.
 */
function errorCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current instanceof Error; depth++) {
    const { code } = current as { code?: unknown };
    if (typeof code === "string") return code;
    current = current.cause;
  }
  return undefined;
}

export async function runMigrations(): Promise<void> {
  const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");
  const split = resolveRoleSplit(env.DATABASE_URL, env.DATABASE_MIGRATION_URL);

  if (!split.active) {
    if (split.reason === "same-role") {
      console.warn(
        "DATABASE_MIGRATION_URL names the same role as DATABASE_URL, so the privilege split is NOT active. Running single-role.",
      );
    }
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
    return;
  }

  // Split mode: everything privileged happens on this short-lived client, which
  // is closed before the app serves a single request.
  const client = new pg.Client({ connectionString: split.migrationUrl });

  // Postgres answers a GRANT by a non-owner with a warning rather than an error,
  // and node-postgres discards notices unless something listens. That warning is
  // the earliest signal that the migration role does not own what it is granting
  // on, so surface it instead of dropping it. Match on the SQLSTATE for
  // warning_privilege_not_granted, since the text is localized by lc_messages.
  client.on("notice", (note) => {
    if (note.code === "01007") {
      console.warn(`Postgres: ${note.message}`);
    }
  });

  await client.connect();
  try {
    const clientDb = drizzle(client);
    await clientDb.execute(sql`SELECT pg_advisory_lock(${MIGRATION_LOCK_KEY})`);
    try {
      const created = await ensureRuntimeRole(client, split.runtimeRole, split.runtimePassword);
      if (created) {
        console.log(`Created least-privilege runtime role "${split.runtimeRole}".`);
      }
      // Order is not load-bearing: the sweep after migrate() covers whatever this
      // boot creates. See grantRuntimePrivileges() for what the default
      // privileges add.
      await grantRuntimePrivileges(client, split.runtimeRole, databaseName(split.migrationUrl));
      await migrate(clientDb, { migrationsFolder });
      // Covers tables that predate the default privileges, which on an existing
      // install is every table it has.
      await grantOnExistingObjects(client, split.runtimeRole);
    } finally {
      await clientDb.execute(sql`SELECT pg_advisory_unlock(${MIGRATION_LOCK_KEY})`);
    }
  } catch (err) {
    // One catch for the whole privileged sequence: which statement an
    // underprivileged role trips on varies, so per-function catches would miss
    // whichever fires first. The message below names every requirement.
    if (errorCode(err) === "42501") {
      throw new SafeError(
        "The role in DATABASE_MIGRATION_URL lacks privileges this database needs at boot. It has to own the SnapOtter tables (only an owner can grant on them), be allowed to create the drizzle schema, and hold CREATEROLE so it can create or alter the runtime role. Point DATABASE_MIGRATION_URL at the role that owns the tables (on an existing install, the role you have been running SnapOtter as), or transfer ownership with REASSIGN OWNED BY.",
        { kind: "operational", code: "migration-role-not-owner", cause: err },
      );
    }
    throw err;
  } finally {
    await client.end();
  }
}

/**
 * Reject an unusable DATABASE_URL / DATABASE_MIGRATION_URL pair up front.
 *
 * resolveRoleSplit is pure, so a rejection is deterministic and cannot become
 * valid by retrying. Left to the boot retry loop it would raise on every
 * attempt, costing the operator the whole DB_STARTUP_TIMEOUT_MS window before
 * saying anything.
 */
export function assertDatabaseConfig(): void {
  try {
    resolveRoleSplit(env.DATABASE_URL, env.DATABASE_MIGRATION_URL);
  } catch (err) {
    if (isSafeMessageError(err)) throw err;
    // Enabling the split is what makes both strings get parsed, so this is
    // reachable only by opting in with a form WHATWG URL rejects. Left raw it
    // reaches the operator as "FATAL: Invalid URL", naming no variable.
    throw new SafeError(
      "DATABASE_URL and DATABASE_MIGRATION_URL must both be URL-form connection strings when the split is enabled. Socket-path and libpq keyword forms are supported single-role only, with DATABASE_MIGRATION_URL empty.",
      { kind: "operational", code: "database-url-unparseable", cause: err },
    );
  }
}

/**
 * Probe the connection the boot path actually needs first. In split mode the
 * runtime role may not exist yet (an existing install upgrading), so probing the
 * runtime pool would fail on authentication rather than retry usefully.
 */
export async function probeDatabase(): Promise<void> {
  const split = resolveRoleSplit(env.DATABASE_URL, env.DATABASE_MIGRATION_URL);
  if (!split.active) {
    await pool.query("SELECT 1");
    return;
  }
  const client = new pg.Client({ connectionString: split.migrationUrl });
  await client.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    await client.end();
  }
}

/** The connection string the boot path probes, redacted for logs. */
export function bootConnectionLabel(): string {
  try {
    const split = resolveRoleSplit(env.DATABASE_URL, env.DATABASE_MIGRATION_URL);
    return redactUrl(split.active ? split.migrationUrl : env.DATABASE_URL);
  } catch {
    // Backstop: every caller is already reporting another error, and this one is
    // only a log label. assertDatabaseConfig() is what actually rejects these.
    return redactUrl(env.DATABASE_URL);
  }
}
