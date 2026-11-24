import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const script = resolve(here, "../../../docker/wait-for-postgres.mjs");

function runProbe(databaseUrl: string) {
  return spawnSync(process.execPath, [script], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
    timeout: 15_000,
  });
}

// The async twin exists because a socket server living in this process cannot
// accept while spawnSync blocks the event loop.
function runProbeAsync(databaseUrl: string): Promise<{ status: number | null; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => resolvePromise({ status, stderr }));
  });
}

// /tmp rather than os.tmpdir(): macOS caps a unix socket path at 104 bytes and
// its per-user temp dir eats most of that.
function makeSocketDir(): string {
  return mkdtempSync(join("/tmp", "wfp-"));
}

function listenOnSocket(path: string): Promise<Server> {
  return new Promise((resolvePromise, reject) => {
    const server = createServer((conn) => conn.end());
    server.once("error", reject);
    server.listen(path, () => resolvePromise(server));
  });
}

describe("wait-for-postgres probe", () => {
  it("names the unreachable target instead of failing silently", () => {
    // `.invalid` never resolves (RFC 2606), so the probe fails fast rather than
    // waiting for a real host. The point of the fix is that the container log
    // now says which host:port could not be reached (DNS failure, refused
    // connection, or timeout) instead of just "Waiting for Postgres..." forever.
    const res = runProbe("postgres://user:pass@snapotter-db-nope.invalid:5432/snapotter");
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("snapotter-db-nope.invalid:5432");
  });

  describe("unix socket connection strings (#783)", () => {
    let server: Server | undefined;
    let dir: string | undefined;

    afterEach(async () => {
      await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
      server = undefined;
      if (dir) rmSync(dir, { recursive: true, force: true });
      dir = undefined;
    });

    // The URL host never resolves, so a TCP probe can't pass by finding a
    // Postgres the developer happens to run on localhost.
    it("probes the socket named by ?host= instead of TCP on the URL host", async () => {
      dir = makeSocketDir();
      server = await listenOnSocket(join(dir, ".s.PGSQL.54329"));
      const res = await runProbeAsync(
        `postgres://user:pass@snapotter-db-nope.invalid:54329/snapotter?host=${dir}`,
      );
      expect(res.status).toBe(0);
    });

    it("defaults the socket file to port 5432 like libpq", async () => {
      dir = makeSocketDir();
      server = await listenOnSocket(join(dir, ".s.PGSQL.5432"));
      const res = await runProbeAsync(
        `postgres://user:pass@snapotter-db-nope.invalid/snapotter?host=${dir}`,
      );
      expect(res.status).toBe(0);
    });

    it("accepts a percent-encoded socket directory as the URL host", async () => {
      dir = makeSocketDir();
      server = await listenOnSocket(join(dir, ".s.PGSQL.54329"));
      const res = await runProbeAsync(
        `postgres://user:pass@${encodeURIComponent(dir)}:54329/snapotter`,
      );
      expect(res.status).toBe(0);
    });

    it("takes the socket's port from ?port= and tolerates a trailing slash", async () => {
      dir = makeSocketDir();
      server = await listenOnSocket(join(dir, ".s.PGSQL.6543"));
      const res = await runProbeAsync(
        `postgres://user:pass@snapotter-db-nope.invalid/snapotter?host=${dir}/&port=6543`,
      );
      expect(res.status).toBe(0);
    });

    it("names the socket path when nothing is listening on it", () => {
      const res = runProbe("postgres://user:pass@localhost:54329/snapotter?host=/nonexistent-wfp");
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("/nonexistent-wfp/.s.PGSQL.54329");
    });

    // WHATWG URL rejects this form but node-postgres accepts it. The app's own
    // boot wait still covers it, so the probe must not turn it into a 60s FATAL.
    it("steps aside for a connection string WHATWG URL cannot parse", () => {
      const res = runProbe("postgres://user:pass@/var/run/postgresql:5432/snapotter");
      expect(res.status).toBe(0);
      expect(res.stderr).toContain("skipping");
    });
  });
});
