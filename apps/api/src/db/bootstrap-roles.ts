import { SafeError } from "@snapotter/shared";
import pg, { type Client } from "pg";

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
 * Does the runtime role already accept this password?
 *
 * Answered by logging in, because SQL offers no way to compare a password
 * against the stored SCRAM verifier.
 *
 * The target comes from the privileged client's own connection rather than a
 * second connection string. resolveRoleSplit() has already required that
 * DATABASE_URL and DATABASE_MIGRATION_URL name the same host, port, and
 * database, so by then they are the same server by construction.
 *
 * Any failure answers false, not only 28P01. A pg_hba rule or an exhausted
 * connection limit leaves the password unknowable, and falling through to the
 * ALTER is what this did before the probe existed. A runtime role that truly
 * cannot connect fails later against the runtime pool, which says so plainly.
 */
async function passwordAlreadyWorks(
  client: Client,
  role: string,
  password: string,
): Promise<boolean> {
  const probe = new pg.Client({
    host: client.host,
    port: client.port,
    database: client.database,
    ssl: client.ssl,
    user: role,
    password,
  });
  try {
    await probe.connect();
  } catch {
    return false;
  }
  await probe.end();
  return true;
}

/** XX000 internal_error, which is what "tuple concurrently updated" reports as. */
function isConcurrentUpdate(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "XX000";
}

/**
 * Create the runtime role if it is missing, and align its password with
 * DATABASE_URL only when it does not already match. Idempotent: safe on every
 * boot.
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
    return true;
  }

  // The overwhelmingly common boot: nothing to change, so change nothing. The
  // ALTER below used to run unconditionally, which rewrote pg_authid and
  // invalidated the role cache cluster-wide on every restart for no benefit.
  if (await passwordAlreadyWorks(client, role, password)) return false;

  try {
    await exec(client, "ALTER ROLE %I WITH LOGIN PASSWORD %L", [role, password]);
  } catch (err) {
    // Postgres does not queue concurrent writers of a pg_authid row, so two
    // boots that both found the password stale can still collide here and the
    // loser gets "tuple concurrently updated". The advisory lock in migrate.ts
    // does not cover this: advisory lock ids are scoped per database, so it
    // serializes the replicas of one deployment but not two SnapOtter databases
    // on one cluster whose DATABASE_URLs name the same role.
    //
    // Re-probe rather than retry. If the boot that won set the value this one
    // wanted, the work is already done and repeating the ALTER would only
    // recreate the race.
    if (!isConcurrentUpdate(err) || !(await passwordAlreadyWorks(client, role, password))) {
      throw err;
    }
  }
  return false;
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
