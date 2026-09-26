import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { dropForkDatabase, dropOrphanedForkDatabases } from "../../setup/fork-db.js";

/**
 * #1277. The test Postgres used to keep its data in the anonymous volume the
 * postgres image declares, and every test file cloned a database into it that
 * nothing dropped, so a full run grew it to about 6 GB. A run that crashed
 * before teardown left that volume behind with nothing on it to say whose it
 * was, on a Docker VM shared with other stacks.
 *
 * Now the data lives on tmpfs (nothing on disk to leak), and each file drops
 * the databases of files whose process has exited before cloning its own (so
 * tmpfs stays small).
 */

const baseUrl = process.env.TEST_PG_BASE_URL as string;
// TEST_DATABASE_URL points the suite at a server someone else runs; there is
// no testcontainer to inspect then.
const ownContainer = !process.env.TEST_DATABASE_URL;

function dockerAvailable(): boolean {
  try {
    execFileSync("docker", ["version", "--format", "{{.Server.Version}}"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/** The testcontainer publishing TEST_PG_BASE_URL's port. */
function postgresContainerId(): string {
  const port = new URL(baseUrl).port;
  const rows = execFileSync("docker", ["ps", "--no-trunc", "--format", "{{.ID}} {{.Ports}}"])
    .toString()
    .split("\n");
  const row = rows.find((r) => r.includes(`:${port}->5432/tcp`));
  if (!row) throw new Error(`no running container publishes port ${port} for 5432`);
  return row.split(" ")[0];
}

describe.runIf(ownContainer && dockerAvailable())("test Postgres container (#1277)", () => {
  it("keeps its data dir on tmpfs, with no volume to leak", () => {
    const id = postgresContainerId();
    const inspect = JSON.parse(execFileSync("docker", ["inspect", id]).toString())[0];
    const dataDir = "/var/lib/postgresql/data";
    expect(Object.keys(inspect.HostConfig.Tmpfs ?? {})).toContain(dataDir);
    const volumes = (inspect.Mounts as Array<{ Type: string; Destination: string }>).filter(
      (m) => m.Type === "volume",
    );
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

  it("drops the database even while a connection to it is still open", async () => {
    const name = `snapotter_hygiene_${crypto.randomUUID().slice(0, 8)}`;
    await adminQuery(`CREATE DATABASE ${name}`);
    // A test that forgot to close its pool leaves a session like this one. A
    // plain DROP DATABASE refuses while it exists; the drop must not.
    const leaked = new pg.Client({
      connectionString: Object.assign(new URL(baseUrl), { pathname: `/${name}` }).toString(),
    });
    const terminated = new Promise<Error>((resolve) => leaked.on("error", resolve));
    await leaked.connect();

    await dropForkDatabase(baseUrl, name);

    expect(await exists(name)).toBe(false);
    expect((await terminated).message).toMatch(/terminat/i);
  });

  /** A pid that just exited, so nothing can own a database named after it. */
  function deadPid(): number {
    const child = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"]);
    return Number(child.stdout.toString());
  }

  it("drops databases whose test process has exited and keeps live ones", async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    const orphan = `snapotter_test_${deadPid()}_${tag}`;
    const live = `snapotter_test_${process.pid}_${tag}`;
    await adminQuery(`CREATE DATABASE ${orphan}`);
    await adminQuery(`CREATE DATABASE ${live}`);
    try {
      const dropped = await dropOrphanedForkDatabases(baseUrl);
      expect(dropped).toContain(orphan);
      expect(dropped).not.toContain(live);
      expect(await exists(orphan)).toBe(false);
      expect(await exists(live)).toBe(true);
      // This file's own database belongs to a live process too.
      const own = new URL(process.env.TEST_PRIVILEGED_DATABASE_URL as string).pathname.slice(1);
      expect(await exists(own)).toBe(true);
    } finally {
      await dropForkDatabase(baseUrl, live);
    }
  });

  it("leaves databases that don't follow the per-file naming alone", async () => {
    const other = `snapotter_hygiene_${crypto.randomUUID().slice(0, 8)}`;
    await adminQuery(`CREATE DATABASE ${other}`);
    try {
      await dropOrphanedForkDatabases(baseUrl);
      expect(await exists(other)).toBe(true);
      expect(await exists("snapotter_template")).toBe(true);
    } finally {
      await dropForkDatabase(baseUrl, other);
    }
  });

  it("is a no-op for a database that is already gone", async () => {
    const name = `snapotter_hygiene_${crypto.randomUUID().slice(0, 8)}`;
    await expect(dropForkDatabase(baseUrl, name)).resolves.toBeUndefined();
  });
});
