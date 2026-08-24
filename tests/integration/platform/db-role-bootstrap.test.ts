import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import {
  ensureRuntimeRole,
  grantOnExistingObjects,
  grantRuntimePrivileges,
} from "../../../apps/api/src/db/bootstrap-roles.js";
import {
  assertDatabaseConfig,
  bootConnectionLabel,
  probeDatabase,
  runMigrations,
} from "../../../apps/api/src/db/migrate.js";

// Covers db/bootstrap-roles.ts and the boot path in db/migrate.ts: role
// provisioning, the grants, and runMigrations / probeDatabase /
// assertDatabaseConfig / bootConnectionLabel in split mode.
//
// TEST_PRIVILEGED_DATABASE_URL is this fork's own database as the base role that
// owns it (tests/setup/per-fork-env.ts). DATABASE_URL is deliberately NOT that:
// the suite runs as the least-privilege runtime role, which cannot create roles
// or grant anything, so every owner-side statement below needs this one. Roles,
// unlike databases, are cluster-wide, so the probe role name is derived from the
// fork database to keep parallel forks from racing to create and drop the same
// role.
const privilegedUrl = process.env.TEST_PRIVILEGED_DATABASE_URL as string;

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
// The runtime role a boot in split mode would provision from scratch. Nothing
// creates it up front: runMigrations() has to, through the stranger.
const adoptedRole = `${role}_adopted`;
// Same, but for the boot that succeeds, with the owner as the migration role.
const bootRole = `${role}_boot`;
// Never created at all. Standing in for the runtime role of an install that is
// only now being switched to the split.
const ghostRole = `${role}_ghost`;
// Does not exist until the concurrent-creation spec races several boots at it.
const raceRole = `${role}_race`;

// Mirrors MIGRATION_LOCK_KEY in apps/api/src/db/migrate.ts, which does not
// export it.
const MIGRATION_LOCK_KEY = 7_421_001;

// How many boots the concurrency specs fire at once. Three already collided on
// every one of 15 trials against both the unconditional ALTER and the
// unguarded CREATE; four keeps a margin without adding much to the connection
// count parallel forks share.
const CONCURRENT_BOOTS = 4;

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

/** A connection string for this fork's database as some role. */
function urlAs(user: string, pw: string): string {
  const url = new URL(base);
  url.username = encodeURIComponent(user);
  url.password = encodeURIComponent(pw);
  return url.toString();
}

/**
 * Point the boot path's two connection strings somewhere else for one spec.
 *
 * The migrate module reads env per call, so this is enough to drive it. The
 * runtime pool was built from the DATABASE_URL captured at import and is not
 * used in split mode, so it stays consistent throughout.
 */
async function withSplitEnv<T>(
  runtimeUrl: string,
  migrationUrl: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  const previous = { runtime: env.DATABASE_URL, migration: env.DATABASE_MIGRATION_URL };
  env.DATABASE_URL = runtimeUrl;
  env.DATABASE_MIGRATION_URL = migrationUrl;
  try {
    return await fn();
  } finally {
    env.DATABASE_URL = previous.runtime;
    env.DATABASE_MIGRATION_URL = previous.migration;
  }
}

/** Backends currently attached to this fork's database. */
async function backendCount(): Promise<number> {
  const { rows } = await owner.query<{ open: number }>(
    "SELECT count(*)::int AS open FROM pg_stat_activity WHERE datname = $1",
    [database],
  );
  return rows[0].open;
}

/**
 * Poll until `read` reports `want`, giving up after about two seconds. A backend
 * leaves pg_stat_activity shortly after its client socket closes, not the
 * instant client.end() resolves, so a bare read here would be a coin flip.
 */
async function settleTo(read: () => Promise<number>, want: number): Promise<void> {
  for (let attempt = 0; attempt < 40 && (await read()) !== want; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * Every SQLSTATE in an error chain. drizzle's migrator rethrows a failed
 * statement as its own error with the driver's underneath, so the code is not
 * always at the top level.
 */
function sqlStatesOf(err: unknown): string[] {
  const codes: string[] = [];
  for (let current = err; current instanceof Error; current = current.cause) {
    const { code } = current as { code?: unknown };
    if (typeof code === "string") codes.push(code);
  }
  return codes;
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

/**
 * The row version of a role, which changes on a write and never on a read.
 *
 * pg_roles is a view and exposes no xmin, so this reads pg_authid, the table
 * behind it. Only a superuser may, which the fork's base role is.
 */
async function roleXmin(name: string): Promise<string> {
  const { rows } = await owner.query<{ xmin: string }>(
    "SELECT xmin::text AS xmin FROM pg_authid WHERE rolname = $1",
    [name],
  );
  return rows[0].xmin;
}

beforeAll(async () => {
  owner = new pg.Client({ connectionString: privilegedUrl });
  await owner.connect();

  await ensureRuntimeRole(owner, strangerRole, password);
  // CREATEROLE is what an operator would hand a purpose-made migration role, and
  // without it the boot-path spec below would stop at CREATE ROLE instead of
  // reaching the grants it is there to exercise.
  await execAsOwner("ALTER ROLE %I CREATEROLE", strangerRole);
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
  await owner.query("DROP TABLE IF EXISTS probe_after_boot_table").catch(() => {});
  for (const name of [role, strangerRole, superRole, adoptedRole, bootRole, raceRole]) {
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
    const before = await roleXmin(role);
    const created = await ensureRuntimeRole(owner, role, rotatedPassword);
    expect(created).toBe(false);
    // The write the steady-state boot skips. Without this the no-write spec
    // below could pass on a call that never does anything.
    expect(await roleXmin(role)).not.toBe(before);
    await expect(
      asRuntime((client) => client.query("SELECT 1"), rotatedPassword),
    ).resolves.toBeDefined();

    // Restore so the remaining specs are order-independent.
    await ensureRuntimeRole(owner, role, password);
    await expect(asRuntime((client) => client.query("SELECT 1"))).resolves.toBeDefined();
  });

  // Every boot called ALTER ROLE whether or not the password had changed, which
  // rewrote pg_authid and invalidated the role cache cluster-wide for nothing.
  it("writes nothing when the password already matches", async () => {
    const before = await roleXmin(role);
    await expect(ensureRuntimeRole(owner, role, password)).resolves.toBe(false);
    expect(await roleXmin(role)).toBe(before);
  });

  // The failure that rewrite caused. Postgres does not queue concurrent writers
  // of a pg_authid row, so simultaneous boots issuing the same no-op ALTER got
  // "tuple concurrently updated" (XX000) and died at boot. Separate clients and
  // one Promise.all are what make the statements truly land together; issued in
  // sequence they would prove nothing.
  it("survives simultaneous boots passing the password it already has", async () => {
    const baseline = await backendCount();
    const clients = Array.from(
      { length: CONCURRENT_BOOTS },
      () => new pg.Client({ connectionString: privilegedUrl }),
    );
    await Promise.all(clients.map((client) => client.connect()));
    try {
      const results = await Promise.all(
        clients.map((client) => ensureRuntimeRole(client, role, password)),
      );
      expect(results).toEqual(Array(CONCURRENT_BOOTS).fill(false));
    } finally {
      await Promise.all(clients.map((client) => client.end()));
    }
    // Hand the backend count back as it was found: the boot spec below asserts
    // on it, and a connection still draining here would read as a leak there.
    await settleTo(backendCount, baseline);
  });

  // The same race one step earlier, on a role that does not exist yet: every
  // boot looks, sees nothing, and issues CREATE ROLE. Exactly one can win.
  it("survives simultaneous boots that all create the role", async () => {
    const baseline = await backendCount();
    const clients = Array.from(
      { length: CONCURRENT_BOOTS },
      () => new pg.Client({ connectionString: privilegedUrl }),
    );
    await Promise.all(clients.map((client) => client.connect()));
    try {
      const results = await Promise.all(
        clients.map((client) => ensureRuntimeRole(client, raceRole, password)),
      );
      // Only the boot that really created it may say so: migrate.ts logs
      // "Created least-privilege runtime role" off this, and several
      // deployments each claiming the creation would be a lie.
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(results).toHaveLength(CONCURRENT_BOOTS);

      // The losers adopted the winner's role rather than half-configuring one.
      const { rows } = await owner.query(
        "SELECT rolsuper, rolcanlogin FROM pg_roles WHERE rolname = $1",
        [raceRole],
      );
      expect(rows).toEqual([{ rolsuper: false, rolcanlogin: true }]);
      await expect(
        asRole(raceRole, password, (client) => client.query("SELECT 1")),
      ).resolves.toBeDefined();
    } finally {
      await Promise.all(clients.map((client) => client.end()));
      await settleTo(backendCount, baseline);
    }
  });

  // The residual race: skipping the write when the password matches does not
  // help boots that all find it stale, so they still collide on the ALTER. The
  // loser has to notice the winner set the value it wanted and carry on.
  it("survives simultaneous boots that all need the same password change", async () => {
    const baseline = await backendCount();
    const clients = Array.from(
      { length: CONCURRENT_BOOTS },
      () => new pg.Client({ connectionString: privilegedUrl }),
    );
    await Promise.all(clients.map((client) => client.connect()));
    try {
      const results = await Promise.all(
        clients.map((client) => ensureRuntimeRole(client, role, rotatedPassword)),
      );
      expect(results).toEqual(Array(CONCURRENT_BOOTS).fill(false));
      await expect(
        asRuntime((client) => client.query("SELECT 1"), rotatedPassword),
      ).resolves.toBeDefined();
    } finally {
      await Promise.all(clients.map((client) => client.end()));
      // Restore even when the assertions above threw. Leaving the password
      // rotated would redden every later spec instead of only this one.
      await ensureRuntimeRole(owner, role, password).catch(() => {});
      await settleTo(backendCount, baseline);
    }
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
  // What ALTER DEFAULT PRIVILEGES buys: probe_future_table is created in
  // beforeAll after both grant calls, so nothing has granted anything on it and
  // only the standing default privileges can make it reachable.
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

describe("split-mode boot that succeeds", () => {
  let backendsBefore = 0;
  let backendsAfter = 0;

  beforeAll(async () => {
    backendsBefore = await backendCount();
    // The owner migrates, and the runtime role does not exist yet: an existing
    // install being switched to the split for the first time.
    await withSplitEnv(urlAs(bootRole, password), privilegedUrl, () => runMigrations());
    // Created only after the boot sequence returned, and nothing grants on it.
    // Standing default privileges are the only thing that can make it reachable,
    // which is the hand-run `drizzle-kit migrate` case from CLAUDE.md.
    await owner.query("CREATE TABLE probe_after_boot_table (id serial PRIMARY KEY, note text)");
    await settleTo(backendCount, backendsBefore);
    backendsAfter = await backendCount();
  }, 30_000);

  it("provisions the runtime role as a non-superuser that can log in", async () => {
    const { rows } = await owner.query(
      "SELECT rolsuper, rolcanlogin FROM pg_roles WHERE rolname = $1",
      [bootRole],
    );
    expect(rows).toEqual([{ rolsuper: false, rolcanlogin: true }]);
  });

  // The backfill sweep, reached through the boot path rather than called directly.
  it("leaves the runtime role able to write a table that predates the boot", async () => {
    const key = `probe-boot-${bootRole}`;
    const seen = await asRole(bootRole, password, async (client) => {
      await client.query(
        "INSERT INTO settings (key, value, updated_at) VALUES ($1, 'one', now())",
        [key],
      );
      await client.query("UPDATE settings SET value = 'two' WHERE key = $1", [key]);
      const { rows } = await client.query("SELECT value FROM settings WHERE key = $1", [key]);
      await client.query("DELETE FROM settings WHERE key = $1", [key]);
      return rows[0]?.value;
    });
    expect(seen).toBe("two");
  });

  // What ALTER DEFAULT PRIVILEGES buys, and the only spec that can see it: a
  // table created outside the boot sequence, with no sweep and no restart.
  it("leaves a table created after the boot usable with no further grant", async () => {
    const notes = await asRole(bootRole, password, async (client) => {
      await client.query("INSERT INTO probe_after_boot_table (note) VALUES ($1)", ["later"]);
      const { rows } = await client.query("SELECT note FROM probe_after_boot_table");
      return rows.map((row: { note: string }) => row.note);
    });
    expect(notes).toEqual(["later"]);
  });

  it("leaves no advisory lock and no open backend behind", async () => {
    // Ending the session would release the lock on its own, so this pins the end
    // state rather than the unlock statement: a pooled or leaked connection
    // holding it would show up here.
    //
    // Scoped to this fork's database. pg_locks reports the whole cluster, while
    // an advisory lock's tag carries the database it was taken in, so an
    // unscoped count also sees the sibling forks that hold this same key for the
    // duration of their own boot.
    const { rows } = await owner.query<{ held: number }>(
      `SELECT count(*)::int AS held FROM pg_locks
       WHERE locktype = 'advisory' AND objid = $1
         AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
      [MIGRATION_LOCK_KEY],
    );
    expect(rows[0].held).toBe(0);
    expect(backendsAfter).toBe(backendsBefore);
  });
});

describe("migration role that does not own the tables", () => {
  // Reachable by pointing DATABASE_MIGRATION_URL at a newly created owner role:
  // only a table's owner can grant on it. The bootstrap module raises the raw
  // driver error; runMigrations() is where that gets translated, so pin both
  // halves rather than only the one an operator sees.
  it("fails the backfill sweep with a privilege error", async () => {
    await expect(
      asRole(strangerRole, password, (stranger) => grantOnExistingObjects(stranger, role)),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("turns a boot in that state into an actionable failure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let failure: (Error & { code?: string; cause?: unknown }) | null;
    let warned: string[] = [];
    try {
      failure = await withSplitEnv(
        urlAs(adoptedRole, password),
        urlAs(strangerRole, password),
        () =>
          runMigrations().then(
            () => null,
            (err: Error & { code?: string; cause?: unknown }) => err,
          ),
      );
      // Read before restoring: mockRestore also resets the recorded calls.
      warned = warn.mock.calls.map((args) => String(args[0]));
    } finally {
      warn.mockRestore();
    }
    expect(failure?.code).toBe("migration-role-not-owner");
    expect(failure?.message).toMatch(/DATABASE_MIGRATION_URL/);
    // Which statement trips first depends on how the cluster was set up, which
    // is the reason the catch sits around the whole sequence. Pin the SQLSTATE
    // it keys on instead of the statement that raised it.
    expect(sqlStatesOf(failure?.cause)).toContain("42501");

    // Postgres downgrades a GRANT by a non-owner to a warning, so without the
    // notice listener this boot would run to its failure with no hint of what
    // went wrong. Deleting that listener has to fail something. Matching the
    // prefix rather than the warning text keeps this off lc_messages, which is
    // the same reason the listener itself keys on the SQLSTATE.
    expect(warned.some((line) => line.startsWith("Postgres: "))).toBe(true);
  }, 30_000);
});

describe("split configuration rejected before the boot retry loop", () => {
  // None of these touch Postgres, which is the point: index.ts runs this check
  // before waitForService so a config that can never work fails immediately
  // instead of after the whole DB_STARTUP_TIMEOUT_MS window.
  it.each([
    [
      "a migration URL on a different database",
      urlAs(role, password),
      urlAs(strangerRole, password).replace(`/${database}`, `/${database}_elsewhere`),
      /same database/i,
    ],
    ["a runtime URL with no password", urlAs(role, ""), urlAs(strangerRole, password), /password/i],
    [
      "a runtime role name Postgres would not accept unquoted",
      urlAs("not-an-identifier", password),
      urlAs(strangerRole, password),
      /plain Postgres identifier/i,
    ],
    // node-postgres takes socket-path forms that WHATWG URL will not parse.
    // Opting into the split is what starts parsing them, and the raw TypeError
    // says only "Invalid URL", naming neither variable nor a way out.
    [
      "a socket-path runtime URL, which only URL-form strings can pair with",
      "postgres://user:pw@/var/run/postgresql:5432/snapotter",
      urlAs(strangerRole, password),
      /URL-form connection strings/i,
    ],
  ])("rejects %s", async (_label, runtimeUrl, migrationUrl, expected) => {
    await withSplitEnv(runtimeUrl, migrationUrl, () => {
      expect(() => assertDatabaseConfig()).toThrow(expected);
    });
  });

  it.each([
    ["single-role, where the migration URL is empty", urlAs(role, password), ""],
    ["a split naming a second role on the same database", urlAs(role, password), privilegedUrl],
  ])("accepts %s", async (_label, runtimeUrl, migrationUrl) => {
    await withSplitEnv(runtimeUrl, migrationUrl, () => {
      expect(() => assertDatabaseConfig()).not.toThrow();
    });
  });
});

describe("boot-path connection helpers", () => {
  // Why probeDatabase exists: on the boot that adopts the split, the runtime
  // role has not been created yet, so probing the runtime pool would fail
  // authentication and burn the startup window instead of retrying usefully.
  it("probes successfully while the runtime role does not exist", async () => {
    await withSplitEnv(urlAs(ghostRole, password), privilegedUrl, async () => {
      await expect(probeDatabase()).resolves.toBeUndefined();
    });
  });

  it("probes the migration connection, not the runtime pool", async () => {
    // The pool was built from the real DATABASE_URL at import and would answer
    // happily whatever env says now, so unusable migration credentials are what
    // tells the two implementations apart.
    const migrationUser = decodeURIComponent(base.username);
    await withSplitEnv(urlAs(ghostRole, password), urlAs(migrationUser, "not-the-password"), () =>
      expect(probeDatabase()).rejects.toMatchObject({ code: "28P01" }),
    );
  });

  it("labels the connection it probes without leaking the password", async () => {
    const label = await withSplitEnv(
      urlAs(role, password),
      urlAs(strangerRole, "s3cr3t-label-probe"),
      () => bootConnectionLabel(),
    );
    expect(label).toContain("***");
    expect(label).toContain(database);
    expect(label).not.toContain("s3cr3t-label-probe");
  });

  it("still returns a label when the split configuration is rejected", async () => {
    // Its only caller is already reporting a different error, so throwing a
    // second one here would replace the one worth reading.
    const label = await withSplitEnv(
      urlAs(role, password),
      urlAs(strangerRole, password).replace(`/${database}`, `/${database}_elsewhere`),
      () => bootConnectionLabel(),
    );
    expect(label).toContain("***");
    expect(label).toContain(database);
  });
});
