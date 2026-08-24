import { SafeError } from "@snapotter/shared";
import type { Client } from "pg";

/**
 * Build and run a DDL statement with Postgres doing its own identifier and
 * literal quoting. Role names and passwords cannot be bound as query parameters
 * in DDL, and string-concatenating them would be an injection vector, so
 * format() runs server-side and the result is executed verbatim.
 */
async function exec(client: Client, template: string, args: string[]): Promise<void> {
  // $1 holds the template, so format() arguments start at $2.
  const placeholders = args.map((_, i) => `, $${i + 2}::text`).join("");
  const { rows } = await client.query<{ stmt: string }>(
    `SELECT format($1::text${placeholders}) AS stmt`,
    [template, ...args],
  );
  await client.query(rows[0].stmt);
}

/**
 * Create the runtime role if it is missing and align its password with
 * DATABASE_URL. Idempotent: safe on every boot.
 *
 * Returns true when the role did not exist and was created.
 */
export async function ensureRuntimeRole(
  client: Client,
  role: string,
  password: string,
): Promise<boolean> {
  const { rows } = await client.query<{ rolsuper: boolean }>(
    "SELECT rolsuper FROM pg_roles WHERE rolname = $1",
    [role],
  );
  const created = rows.length === 0;

  // An existing superuser cannot be demoted from here: only a superuser may
  // clear that attribute, and the migration role may be no more than
  // CREATEROLE. Serving requests as one would leave COPY ... FROM PROGRAM
  // reachable while the deployment looks split, so refuse instead.
  if (!created && rows[0].rolsuper) {
    throw new SafeError(
      "The role in DATABASE_URL is a Postgres superuser, so the privilege split would have no effect. Point DATABASE_URL at a non-superuser role, or run ALTER ROLE <role> NOSUPERUSER as a superuser.",
      { kind: "operational", code: "runtime-role-superuser" },
    );
  }

  if (created) {
    await exec(
      client,
      "CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS",
      [role, password],
    );
  } else {
    await exec(client, "ALTER ROLE %I WITH LOGIN PASSWORD %L", [role, password]);
  }
  return created;
}

/**
 * Grant the runtime role exactly what the app needs: DML on app tables and use
 * of their sequences. Nothing on the `drizzle` schema, so the runtime role
 * cannot rewrite migration history.
 *
 * grantOnExistingObjects() runs after migrations, so this release's new tables
 * are already covered by that sweep. What ALTER DEFAULT PRIVILEGES adds is that
 * anything the owner creates later inherits the grants on its own, with no
 * sweep and no reboot. Both are idempotent.
 *
 * ALTER DEFAULT PRIVILEGES without FOR ROLE applies to objects created by
 * current_user, which is the same connection that runs the migrations. Do not
 * add an explicit FOR ROLE: it would silently stop applying if the migration
 * role ever changed.
 */
export async function grantRuntimePrivileges(
  client: Client,
  role: string,
  database: string,
): Promise<void> {
  // A stock cluster hands both of these to PUBLIC already, so on one of those
  // they change nothing. They are here for hardened clusters that revoked those
  // defaults, where the runtime role would otherwise not get in the door.
  await exec(client, "GRANT CONNECT ON DATABASE %I TO %I", [database, role]);
  await exec(client, "GRANT USAGE ON SCHEMA public TO %I", [role]);
  await exec(
    client,
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I",
    [role],
  );
  await exec(
    client,
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I",
    [role],
  );
}

/** Sweep grants onto objects that already existed. Run AFTER migrations. */
export async function grantOnExistingObjects(client: Client, role: string): Promise<void> {
  await exec(client, "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I", [
    role,
  ]);
  await exec(client, "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I", [role]);
}
