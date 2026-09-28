import crypto from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";

// pg lives in the api workspace, and tests/global-setup.ts (which also uses
// this module, at teardown) loads outside the resolution vitest gives test
// files, so resolve it the way global-setup does.
const pg = createRequire(join(process.cwd(), "apps/api/package.json"))("pg") as typeof import("pg");

/**
 * Per-file databases are named `snapotter_test_<run>_<pid>_<hex>`: the test
 * run (minted once in tests/global-setup.ts), the test process that cloned it,
 * and a random tag. Vitest runs each file in its own process, so once that pid
 * is gone the database is garbage.
 *
 * The run id is what keeps a sweep to its own run. A pid only means something
 * inside the sweeper's own pid namespace, so on a server two runs share (a
 * container and the host, say, through TEST_DATABASE_URL) a sweep keyed on pid
 * alone would drop the other run's live databases.
 */
const FORK_DB = /^snapotter_test_([0-9a-f]+)_(\d+)_[0-9a-f]+$/;

export function forkDatabaseName(runId: string, pid: number): string {
  return `snapotter_test_${runId}_${pid}_${crypto.randomUUID().slice(0, 8)}`;
}

/** The pid that owns `name` if it is one of this run's per-file databases, else null. */
export function forkDatabaseOwner(name: string, runId: string): number | null {
  const match = FORK_DB.exec(name);
  return match && match[1] === runId ? Number(match[2]) : null;
}

/**
 * Each file also logs in as its own member of the runtime role (see
 * per-fork-env.ts), named `<runtimeRole>_<run>_<pid>_<hex>` for the same
 * reasons as its database (#1315). The random tag matters more here: with a
 * pid-only name, a file whose pid was reused would find the dead file's role,
 * skip creating it, and then lose it to a sweep.
 */
export function forkRoleName(runtimeRole: string, runId: string, pid: number): string {
  return `${runtimeRole}_${runId}_${pid}_${crypto.randomUUID().slice(0, 8)}`;
}

/** The pid that owns `name` if it is one of this run's per-file roles, else null. */
export function forkRoleOwner(name: string, runtimeRole: string, runId: string): number | null {
  const prefix = `${runtimeRole}_${runId}_`;
  if (!name.startsWith(prefix)) return null;
  const match = /^(\d+)_[0-9a-f]+$/.exec(name.slice(prefix.length));
  return match ? Number(match[1]) : null;
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // Only ESRCH means gone. Anything else (EPERM: someone else's process)
    // counts as alive, so a surprise can only delay a drop.
    return (err as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/**
 * Drop a per-file database. WITH (FORCE) because its owner may have died a
 * moment ago and the server can still be tearing down that session, which a
 * plain DROP DATABASE refuses. Names come from forkDatabaseName (hex and
 * digits), never from test input, so it is safe to interpolate.
 */
export async function dropForkDatabase(baseUrl: string, dbName: string): Promise<void> {
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  } finally {
    await admin.end();
  }
}

/**
 * Drop this run's per-file databases whose test process has exited. Nothing
 * dropped them before, so a full run grew the test Postgres to about 6 GB
 * (#1277), and that now lives on tmpfs, in the Docker VM's memory. Running this
 * as each file starts keeps the total near the number of live forks, and also
 * clears the databases of files that crashed.
 *
 * Only exited owners are touched: a live file's connections are never cut, and
 * a reused pid can only delay a drop, never cause a wrong one (the random tag
 * means a new owner of that pid gets a different name). Failing to list is
 * fatal, since cloning this file's own database would fail next anyway; failing
 * to drop one leftover is not, since a later sweep retries it.
 */
export async function dropOrphanedForkDatabases(baseUrl: string, runId: string): Promise<string[]> {
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  let names: string[];
  try {
    const { rows } = await admin.query<{ datname: string }>(
      "SELECT datname FROM pg_database WHERE datname LIKE 'snapotter\\_test\\_%'",
    );
    names = rows.map((r) => r.datname);
  } finally {
    await admin.end();
  }
  const dropped: string[] = [];
  for (const name of names) {
    const owner = forkDatabaseOwner(name, runId);
    if (owner === null || processAlive(owner)) continue;
    try {
      await dropForkDatabase(baseUrl, name);
      dropped.push(name);
    } catch (err) {
      console.warn(`[fork-db] could not drop orphaned ${name}; a later sweep will retry`, err);
    }
  }
  return dropped;
}

/** Names from `query` (one text column) on the base server. */
async function listNames(baseUrl: string, query: string): Promise<string[]> {
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  try {
    return (await admin.query<{ name: string }>(query)).rows.map((r) => r.name);
  } finally {
    await admin.end();
  }
}

async function dropRole(baseUrl: string, role: string): Promise<void> {
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  try {
    await admin.query(`DROP ROLE IF EXISTS ${role}`);
  } finally {
    await admin.end();
  }
}

/**
 * Drop this run's per-file roles whose test process has exited (#1315). Runs
 * after the database sweep, since a role can't be dropped while it still
 * owns anything, and the file's database is the only thing it could own.
 * Same failure policy as the database sweep: listing fails loudly, a single
 * drop only warns.
 */
export async function dropOrphanedForkRoles(
  baseUrl: string,
  runtimeRole: string,
  runId: string,
): Promise<string[]> {
  const names = await listNames(
    baseUrl,
    `SELECT rolname AS name FROM pg_roles WHERE starts_with(rolname, '${runtimeRole}_${runId}_')`,
  );
  const dropped: string[] = [];
  for (const name of names) {
    const owner = forkRoleOwner(name, runtimeRole, runId);
    if (owner === null || processAlive(owner)) continue;
    try {
      await dropRole(baseUrl, name);
      dropped.push(name);
    } catch (err) {
      console.warn(`[fork-db] could not drop orphaned role ${name}; a later sweep will retry`, err);
    }
  }
  return dropped;
}

/**
 * Drop everything a finished run left behind: its per-file databases and
 * roles, whatever their owners' state. Called from global teardown, when every
 * fork of the run has exited. The per-file sweeps only ever clear files that
 * finished before another one started, so a run's last files outlived it; on
 * a long-lived TEST_DATABASE_URL server they piled up run after run (#1315).
 *
 * One failed drop doesn't stop the rest: the result lists what went and, in
 * `failed`, what's still there, so the caller can name it.
 */
export async function dropRunLeftovers(
  baseUrl: string,
  runtimeRole: string,
  runId: string,
): Promise<{ databases: string[]; roles: string[]; failed: string[] }> {
  const result = { databases: [] as string[], roles: [] as string[], failed: [] as string[] };
  const databases = (
    await listNames(
      baseUrl,
      "SELECT datname AS name FROM pg_database WHERE datname LIKE 'snapotter\\_test\\_%'",
    )
  ).filter((name) => forkDatabaseOwner(name, runId) !== null);
  for (const name of databases) {
    try {
      await dropForkDatabase(baseUrl, name);
      result.databases.push(name);
    } catch {
      result.failed.push(name);
    }
  }
  // Attempted even when a database stayed: every other role can still go.
  const roles = (
    await listNames(
      baseUrl,
      `SELECT rolname AS name FROM pg_roles WHERE starts_with(rolname, '${runtimeRole}_${runId}_')`,
    )
  ).filter((name) => forkRoleOwner(name, runtimeRole, runId) !== null);
  for (const name of roles) {
    try {
      await dropRole(baseUrl, name);
      result.roles.push(name);
    } catch {
      result.failed.push(name);
    }
  }
  return result;
}
