import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ensureRuntimeRole,
  grantOnExistingObjects,
  grantRuntimePrivileges,
} from "../../../apps/api/src/db/bootstrap-roles.js";

// DATABASE_URL is this fork's own database, owned by the privileged base user
// (tests/setup/per-fork-env.ts). Roles, unlike databases, are cluster-wide, so
// the probe role name is derived from the fork database to keep parallel forks
// from racing to create and drop the same role.
const privilegedUrl = process.env.DATABASE_URL as string;

function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

const database = databaseName(privilegedUrl);
const role = `probe_${database.replace(/^snapotter_test_/, "")}`;
// A second role that owns none of the tables, standing in for the operator who
// points DATABASE_MIGRATION_URL at a freshly created owner role.
const strangerRole = `${role}_stranger`;
// A pre-existing superuser, standing in for DATABASE_URL still aimed at the
// original single-role account.
const superRole = `${role}_super`;

// A quote in the password is the case %L has to survive; string concatenation
// would produce a syntax error here, or worse.
const password = "pr0be'pw\"x";
const rotatedPassword = "pr0be-rotated";

const base = new URL(privilegedUrl);

let owner: pg.Client;
let createdOnFirstCall: boolean;

async function asRole<T>(
  user: string,
  pw: string,
  fn: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({
    host: base.hostname,
    port: Number(base.port || 5432),
    database,
    user,
    password: pw,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function asRuntime<T>(fn: (client: pg.Client) => Promise<T>, pw = password): Promise<T> {
  return asRole(role, pw, fn);
}

/**
 * Same server-side quoting the module uses. Interpolating a role name into DDL
 * here would undercut the thing this suite exists to pin down, even in teardown.
 */
async function execAsOwner(template: string, arg: string): Promise<void> {
  const { rows } = await owner.query<{ stmt: string }>(
    "SELECT format($1::text, $2::text) AS stmt",
    [template, arg],
  );
  await owner.query(rows[0].stmt);
}

beforeAll(async () => {
  owner = new pg.Client({ connectionString: privilegedUrl });
  await owner.connect();

  await ensureRuntimeRole(owner, strangerRole, password);
  // Not via ensureRuntimeRole, which would create it NOSUPERUSER and defeat the
  // point.
  await execAsOwner("CREATE ROLE %I LOGIN SUPERUSER", superRole);

  createdOnFirstCall = await ensureRuntimeRole(owner, role, password);
  await grantRuntimePrivileges(owner, role, database);
  await grantOnExistingObjects(owner, role);

  // Created AFTER the grants, standing in for a table that a future release's
  // migration adds. Nothing grants anything on it explicitly.
  await owner.query("CREATE TABLE probe_future_table (id serial PRIMARY KEY, note text)");
}, 30_000);

afterAll(async () => {
  // A failed beforeAll leaves nothing to clean up, and throwing here would bury
  // the real error under a second one.
  if (!owner) return;
  await owner.query("DROP TABLE IF EXISTS probe_future_table").catch(() => {});
  for (const name of [role, strangerRole, superRole]) {
    // DROP OWNED BY also strips the default-privilege entries and the database
    // GRANT, which DROP ROLE would otherwise refuse over. It only reaches the
    // current database, which is where every grant was made.
    await execAsOwner("DROP OWNED BY %I", name).catch(() => {});
    await execAsOwner("DROP ROLE IF EXISTS %I", name).catch(() => {});
  }
  await owner.end();
}, 15_000);

describe("runtime role provisioning", () => {
  it("derives a role name that Postgres accepts as an identifier", () => {
    expect(role).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
    expect(Buffer.byteLength(role)).toBeLessThanOrEqual(63);
  });

  it("creates the role on the first call and reports no creation on the second", async () => {
    expect(createdOnFirstCall).toBe(true);
    await expect(ensureRuntimeRole(owner, role, password)).resolves.toBe(false);
  });

  it("creates the role without superuser, createdb, or createrole", async () => {
    const { rows } = await owner.query(
      "SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = $1",
      [role],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolbypassrls: false,
      rolcanlogin: true,
    });
  });

  it("aligns the password of an existing role", async () => {
    const created = await ensureRuntimeRole(owner, role, rotatedPassword);
    expect(created).toBe(false);
    await expect(
      asRuntime((client) => client.query("SELECT 1"), rotatedPassword),
    ).resolves.toBeDefined();

    // Restore so the remaining specs are order-independent.
    await ensureRuntimeRole(owner, role, password);
    await expect(asRuntime((client) => client.query("SELECT 1"))).resolves.toBeDefined();
  });

  // ALTER ROLE cannot clear rolsuper here, so adopting one silently would leave
  // the whole split doing nothing.
  it("refuses to adopt a superuser as the runtime role", async () => {
    const failure = await ensureRuntimeRole(owner, superRole, password).then(
      () => null,
      (err: Error) => err,
    );
    expect(failure?.message).toMatch(/superuser/i);
  });
});

describe("runtime role privileges", () => {
  // The whole point of running grants before migrations: a table the owner
  // creates later must be usable without anyone granting anything on it.
  it("can read and write a table created after the grants ran", async () => {
    const notes = await asRuntime(async (client) => {
      await client.query("INSERT INTO probe_future_table (note) VALUES ($1)", ["future"]);
      const { rows } = await client.query("SELECT note FROM probe_future_table");
      return rows.map((row: { note: string }) => row.note);
    });
    expect(notes).toEqual(["future"]);
  });

  it("can use the sequence behind a serial column", async () => {
    const ids = await asRuntime(async (client) => {
      const { rows } = await client.query(
        "INSERT INTO probe_future_table (note) VALUES ($1) RETURNING id",
        ["serial"],
      );
      return rows.map((row: { id: number }) => row.id);
    });
    expect(ids).toHaveLength(1);
    expect(ids[0]).toBeGreaterThan(0);
  });

  // Writes, not just a read: the backfill sweep grants four privileges and only
  // exercising SELECT would leave the other three unpinned.
  it("can insert, update and delete in a table that predates the role", async () => {
    const key = `probe-${role}`;
    const seen = await asRuntime(async (client) => {
      await client.query(
        "INSERT INTO settings (key, value, updated_at) VALUES ($1, 'one', now())",
        [key],
      );
      const inserted = await client.query("SELECT value FROM settings WHERE key = $1", [key]);
      await client.query("UPDATE settings SET value = 'two' WHERE key = $1", [key]);
      const updated = await client.query("SELECT value FROM settings WHERE key = $1", [key]);
      await client.query("DELETE FROM settings WHERE key = $1", [key]);
      const deleted = await client.query("SELECT value FROM settings WHERE key = $1", [key]);
      return [inserted.rows[0]?.value, updated.rows[0]?.value, deleted.rows.length];
    });
    expect(seen).toEqual(["one", "two", 0]);
  });

  // Boot repeats every statement, so a second pass has to be a no-op rather
  // than an error.
  it("re-runs the grant statements without error", async () => {
    await expect(grantRuntimePrivileges(owner, role, database)).resolves.toBeUndefined();
    await expect(grantOnExistingObjects(owner, role)).resolves.toBeUndefined();
  });
});

describe("runtime role restrictions", () => {
  it("has a drizzle migration schema to be locked out of", async () => {
    const { rows } = await owner.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'",
    );
    expect(rows).toHaveLength(1);
  });

  it.each([
    // The escalation this whole change exists to close: a superuser could shell
    // out from inside the database container.
    ["run a shell command via COPY", "COPY (SELECT 1) TO PROGRAM 'true'"],
    ["drop an app table", "DROP TABLE probe_future_table"],
    ["create a table in public", "CREATE TABLE probe_forbidden (id integer)"],
    ["read migration history", "SELECT 1 FROM drizzle.__drizzle_migrations"],
    ["rewrite migration history", "DELETE FROM drizzle.__drizzle_migrations"],
    // Table ACLs are separate from schema ACLs, so the two rows above stay red
    // even if the drizzle schema itself is opened up. This one is what pins
    // "nothing on the drizzle schema".
    [
      "create a table in the migration schema",
      "CREATE TABLE drizzle.probe_forbidden2 (id integer)",
    ],
  ])("cannot %s", async (_label, statement) => {
    // 42501 is insufficient_privilege. Asserting the code rather than the
    // message keeps this from passing on an unrelated failure such as a typo
    // in the statement.
    await expect(asRuntime((client) => client.query(statement))).rejects.toMatchObject({
      code: "42501",
    });
  });
});

describe("migration role that does not own the tables", () => {
  // Reachable by pointing DATABASE_MIGRATION_URL at a newly created owner role:
  // only a table's owner can grant on it. Task 3 wraps the whole bootstrap
  // sequence in one catch that turns this into an actionable message; until
  // then, pin the raw failure so the behavior cannot drift unnoticed.
  it("fails the backfill sweep with a privilege error", async () => {
    await expect(
      asRole(strangerRole, password, (stranger) => grantOnExistingObjects(stranger, role)),
    ).rejects.toMatchObject({ code: "42501" });
  });
});
