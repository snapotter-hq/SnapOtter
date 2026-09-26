import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import pg from "pg";
import { describe, expect, it } from "vitest";
import {
  dropForkDatabase,
  dropOrphanedForkDatabases,
  forkDatabaseName,
  forkDatabaseOwner,
} from "../../setup/fork-db.js";

/**
 * #1277. The test Postgres used to keep its data in the anonymous volume the
 * postgres image declares, and every test file cloned a database into it that
 * nothing dropped, so a full run grew it to about 6 GB. A run that crashed
 * before teardown left that volume behind with nothing on it to say whose it
 * was, on a Docker VM shared with other stacks.
 *
 * Now the data lives on tmpfs (nothing on disk to leak), and each file drops
 * the databases of this run's files whose process has exited before cloning
 * its own (so tmpfs stays small).
 */

const baseUrl = process.env.TEST_PG_BASE_URL as string;
const runId = process.env.TEST_RUN_ID as string;
const ownDb = new URL(process.env.TEST_PRIVILEGED_DATABASE_URL as string).pathname.slice(1);

// TEST_DATABASE_URL points the suite at a server someone else runs; there is
// no testcontainer of ours to inspect then. Otherwise global-setup recorded it.
describe.runIf(!process.env.TEST_DATABASE_URL)("test Postgres container (#1277)", () => {
  it("keeps its data dir on a capped tmpfs, with no volume to leak", () => {
    const id = process.env.TEST_PG_CONTAINER_ID as string;
    expect(id, "tests/global-setup.ts sets TEST_PG_CONTAINER_ID").toBeTruthy();
    // Fails rather than skips without the docker CLI: the container exists
    // either way, and a skipped check is a silent one.
    const inspect = JSON.parse(execFileSync("docker", ["inspect", id]).toString())[0];
    expect(inspect.HostConfig.Tmpfs?.["/var/lib/postgresql/data"]).toMatch(/size=/);
    const volumes = (inspect.Mounts as Array<{ Type: string }>).filter((m) => m.Type === "volume");
    expect(volumes).toEqual([]);
  });
});

describe("per-file database cleanup (#1277)", () => {
  async function adminQuery<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) {
    const admin = new pg.Client({ connectionString: baseUrl });
    await admin.connect();
    try {
      return (await admin.query<T>(sql, params)).rows;
    } finally {
      await admin.end();
    }
  }

  const exists = async (name: string) =>
    (await adminQuery("SELECT 1 FROM pg_database WHERE datname = $1", [name])).length > 0;

  /** A pid that just exited, so nothing can own a database named after it. */
  function deadPid(): number {
    const child = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"]);
    return Number(child.stdout.toString());
  }

  it("ran the sweep in this file's own setup", () => {
    // tests/setup/per-fork-env.ts sets this right after sweeping. Without the
    // call, nothing drops per-file databases and a run fills its tmpfs.
    expect(process.env.TEST_FORK_SWEEP_RAN).toBe("1");
  });

  it("names this file's database in the format the sweep reads back", () => {
    // If per-fork-env's names drift from what forkDatabaseOwner parses, the
    // sweep silently matches nothing.
    expect(forkDatabaseOwner(ownDb, runId)).toBe(process.pid);
  });

  it("drops the database even while a connection to it is still open", async () => {
    const name = `snapotter_hygiene_${crypto.randomUUID().slice(0, 8)}`;
    await adminQuery(`CREATE DATABASE ${name}`);
    // The owner of an orphan may have died a moment ago, with the server still
    // tearing its session down. A plain DROP DATABASE refuses then.
    const leaked = new pg.Client({
      connectionString: Object.assign(new URL(baseUrl), { pathname: `/${name}` }).toString(),
    });
    const terminated = new Promise<Error>((resolve) => leaked.on("error", resolve));
    await leaked.connect();

    await dropForkDatabase(baseUrl, name);

    expect(await exists(name)).toBe(false);
    expect((await terminated).message).toMatch(/terminat/i);
  });

  it("drops this run's databases whose test process has exited and keeps live ones", async () => {
    const orphan = forkDatabaseName(runId, deadPid());
    const live = forkDatabaseName(runId, process.pid);
    await adminQuery(`CREATE DATABASE ${orphan}`);
    await adminQuery(`CREATE DATABASE ${live}`);
    try {
      const dropped = await dropOrphanedForkDatabases(baseUrl, runId);
      expect(dropped).not.toContain(live);
      // Asserted as end state: another fork starting a file sweeps too, and
      // may be the one that drops it.
      expect(await exists(orphan)).toBe(false);
      expect(await exists(live)).toBe(true);
      expect(await exists(ownDb)).toBe(true);
    } finally {
      await dropForkDatabase(baseUrl, live);
    }
  });

  it("leaves another run's databases alone, even with a dead owner", async () => {
    // Another run's pids may belong to another pid namespace, where "not
    // running here" says nothing about whether they're alive.
    const otherRunId = runId === "00000000" ? "11111111" : "00000000";
    const otherRun = forkDatabaseName(otherRunId, deadPid());
    await adminQuery(`CREATE DATABASE ${otherRun}`);
    try {
      expect(forkDatabaseOwner(otherRun, runId)).toBeNull();
      await dropOrphanedForkDatabases(baseUrl, runId);
      expect(await exists(otherRun)).toBe(true);
    } finally {
      await dropForkDatabase(baseUrl, otherRun);
    }
  });

  it("leaves databases outside the per-file naming alone", async () => {
    // Passes the LIKE prefilter but not the per-file pattern: the shape
    // users-identity-index-migration.test.ts uses for its scratch database.
    const scratch = `snapotter_test_mig_${deadPid()}_${crypto.randomUUID().slice(0, 8)}`;
    await adminQuery(`CREATE DATABASE ${scratch}`);
    try {
      expect(forkDatabaseOwner(scratch, runId)).toBeNull();
      await dropOrphanedForkDatabases(baseUrl, runId);
      expect(await exists(scratch)).toBe(true);
      expect(await exists("snapotter_template")).toBe(true);
    } finally {
      await dropForkDatabase(baseUrl, scratch);
    }
  });

  it("is a no-op for a database that is already gone", async () => {
    const name = `snapotter_hygiene_${crypto.randomUUID().slice(0, 8)}`;
    await expect(dropForkDatabase(baseUrl, name)).resolves.toBeUndefined();
  });
});
