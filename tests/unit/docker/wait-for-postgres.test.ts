import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const script = resolve(here, "../../../docker/wait-for-postgres.mjs");

function runProbe(databaseUrl: string) {
  return spawnSync(process.execPath, [script], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
    timeout: 15_000,
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
});
