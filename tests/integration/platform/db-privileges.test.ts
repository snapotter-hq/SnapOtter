import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The deployment-shaped half of the privilege split.
//
// Every query below runs on process.env.DATABASE_URL, the same string
// apps/api/src/db/index.ts hands to its pool. No probe role, no fixture, nothing
// granted here. That is the whole point of the file.
//
// db-role-bootstrap.test.ts provisions a role of its own and proves that role
// came out restricted. It would go on passing if an operator, or a regression in
// the boot path, left DATABASE_URL aimed at a cluster superuser, because the role
// it inspects is not the role the application runs as. This file asks the other
// question: is the role the application is actually configured with the
// restricted one? A misconfigured deployment sails past every other test in the
// repo and fails here.
//
// So the two files look like they overlap and do not. Nothing here is restated
// from there: the denials are a disjoint set, and each allow names the call site
// that breaks if a future grant change drops it.
//
// Assertions are on SQLSTATE, not message text, which lc_messages localizes.
// 42501 is insufficient_privilege, and every denial below was observed to raise
// exactly that.

// Mirrors MIGRATION_LOCK_KEY in apps/api/src/db/migrate.ts, which does not
// export it.
const MIGRATION_LOCK_KEY = 7_421_001;

let client: pg.Client;

beforeAll(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL missing; tests/setup/per-fork-env.ts did not run");
  }
  client = new pg.Client({ connectionString });
  await client.connect();
});

afterAll(async () => {
  await client?.end();
});

describe("the role DATABASE_URL actually points at", () => {
  // The single most important assertion in this file. Everything else is a
  // consequence of it: a superuser passes none of the denials below, and there
  // is no other test in the repo that would notice.
  it("is not a superuser", async () => {
    const { rows } = await client.query(
      "SELECT rolsuper FROM pg_roles WHERE rolname = current_user",
    );
    expect(rows).toEqual([{ rolsuper: false }]);
  });
});

describe("what the configured role cannot do", () => {
  // The vacuous pass this guards against: with pgcrypto missing from the image,
  // CREATE EXTENSION answers 0A000 ("extension is not available"), and with it
  // already installed, 42710. Neither is a privilege error, so the denial below
  // would go red without saying why. This spec says why.
  it("has pgcrypto available and uninstalled, so the extension denial is a real one", async () => {
    const { rows } = await client.query(
      "SELECT installed_version FROM pg_available_extensions WHERE name = 'pgcrypto'",
    );
    expect(rows).toEqual([{ installed_version: null }]);
  });

  it.each([
    // The read side of the escalation COPY ... TO PROGRAM covers on the write
    // side: postgresql.conf, the server key, /etc/passwd. Superusers and members
    // of pg_read_server_files only.
    ["read a file off the database server", "SELECT pg_read_file('/etc/passwd')"],
    // A real extension on purpose. CREATE EXTENSION IF NOT EXISTS plpgsql is the
    // trap here: plpgsql ships installed, so that form returns success for any
    // role and proves nothing at all. pgcrypto is also the tighter of the two
    // gates to be denied, being a trusted extension. Postgres asks it for CREATE
    // on the database rather than superuser, and bootstrap-roles.ts grants
    // CONNECT and never CREATE.
    ["install an extension", "CREATE EXTENSION pgcrypto"],
    ["create a database", "CREATE DATABASE privilege_probe"],
    // Self-escalation, which would quietly undo every other row in this table.
    ["promote itself to superuser", "ALTER ROLE CURRENT_USER SUPERUSER"],
    // TRUNCATE is a privilege in its own right that DELETE does not imply, and
    // it also comes free with ownership. The migrating role owns the app tables,
    // so neither route reaches this one.
    ["truncate an app table", "TRUNCATE TABLE jobs"],
    // Every role's password verifier in the cluster, this role's included.
    ["read the cluster password hashes", "SELECT rolname, rolpassword FROM pg_authid"],
  ])("cannot %s", async (_label, statement) => {
    await expect(client.query(statement)).rejects.toMatchObject({ code: "42501" });
  });
});

describe("what the configured role must still be able to do", () => {
  // apps/api/src/lib/support-bundle.ts, dbCounts().
  it("reads per-table row counts for the support bundle", async () => {
    const { rows } = await client.query<{ relname: string; n_live_tup: number }>(
      "SELECT relname, n_live_tup::int AS n_live_tup FROM pg_stat_user_tables ORDER BY relname",
    );
    // pg_stat_user_tables reports the whole database instead of filtering by
    // privilege, so what is worth pinning is that the view is reachable at all
    // and still names the app tables. dbCounts() swallows its own error and
    // returns [], which is exactly why a lost grant would otherwise surface as
    // an empty section in a support bundle and nowhere else.
    expect(rows.map((row) => row.relname)).toEqual(
      expect.arrayContaining(["jobs", "settings", "users"]),
    );
  });

  // apps/api/src/db/migrate-from-sqlite.ts, targetColumns(), called per table on
  // a 1.x import to drop columns the target schema does not have.
  it("reads the jobs column list for the 1.x SQLite import", async () => {
    const { rows } = await client.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'jobs'",
    );
    // information_schema does filter by privilege: for a table this role cannot
    // touch it returns no rows rather than an error, which is why the assertion
    // has to be that real columns came back and not merely that the query
    // survived. A silently empty set here would make the importer drop every
    // column it was asked to write.
    expect(rows.map((row) => row.column_name)).toEqual(
      expect.arrayContaining(["id", "status", "tool_id", "user_id"]),
    );
  });

  // apps/api/src/db/migrate.ts. In single-role mode, which is every install that
  // has not set DATABASE_MIGRATION_URL, the migration advisory lock is taken on
  // the runtime pool itself, so the runtime role has to be able to hold it.
  it("takes and releases the migration advisory lock", async () => {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    const { rows } = await client.query<{ released: boolean }>(
      "SELECT pg_advisory_unlock($1) AS released",
      [MIGRATION_LOCK_KEY],
    );
    // A session that never held the lock gets false back plus a warning, not an
    // error. Asserting true is what makes the acquire above load-bearing.
    expect(rows[0].released).toBe(true);
  });
});
