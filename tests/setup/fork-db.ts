import pg from "pg";

/**
 * Per-file databases are named `snapotter_test_<pid>_<hex>` by per-fork-env.ts,
 * where pid is the test process that cloned it. Vitest runs each file in its
 * own process, so once that pid is gone the database is garbage.
 */
const FORK_DB = /^snapotter_test_(\d+)_[0-9a-f]+$/;

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: it exists but belongs to someone else. Only ESRCH means gone.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Drop a per-file database. WITH (FORCE) because its owner may have died a
 * moment ago and the server can still be tearing down that session, which a
 * plain DROP DATABASE refuses. The name comes from the harness (a pid and a
 * uuid), never from test input, so it is safe to interpolate.
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
 * Drop every per-file database whose test process has exited. Nothing dropped
 * them before, so a full run grew the test Postgres to about 6 GB (#1277), and
 * that now lives on tmpfs, in the Docker VM's memory. Running this as each file
 * starts keeps the total near the number of live forks, and also clears the
 * databases of files that crashed.
 *
 * Only exited owners are touched: a live file's connections are never cut, and
 * a reused pid can only delay a drop, never cause a wrong one.
 */
export async function dropOrphanedForkDatabases(baseUrl: string): Promise<string[]> {
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
  const orphaned = names.filter((name) => {
    const match = FORK_DB.exec(name);
    return match !== null && !processAlive(Number(match[1]));
  });
  for (const name of orphaned) await dropForkDatabase(baseUrl, name);
  return orphaned;
}
