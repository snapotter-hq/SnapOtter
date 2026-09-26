import crypto from "node:crypto";
import pg from "pg";

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

function processAlive(pid: number): boolean {
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
