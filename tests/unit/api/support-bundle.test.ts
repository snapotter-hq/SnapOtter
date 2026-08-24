/**
 * Unit tests for the support-bundle.ts library module.
 *
 * The integration suite (tests/integration/platform/support-bundle.test.ts)
 * covers the happy path through the HTTP route. These unit tests drive the
 * error/catch branches that the integration test cannot reach with a real
 * DB and filesystem: DB query failures, an unreadable log file, a missing
 * LOG_DIR, a statfs failure, and the various env-redaction branches.
 *
 * Strategy: mock node:fs, ../config.js, and ../db/index.js, then import
 * buildSupportBundle directly, consume the returned zip stream to
 * completion, and unzip it with AdmZip to assert on the produced entries.
 */
import { Buffer } from "node:buffer";
import type { Readable } from "node:stream";
import AdmZip from "adm-zip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mock state ──────────────────────────────────────────────────

const fsMock = vi.hoisted(() => ({
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  statfsSync: vi.fn(),
}));

const dbMock = vi.hoisted(() => ({
  execute: vi.fn(),
  selectResult: {
    promise: Promise.resolve([]) as Promise<unknown>,
  },
}));

const envMock = vi.hoisted(() => ({
  env: {
    LOG_DIR: "/var/log/snapotter",
    WORKSPACE_PATH: "/data/workspace",
    DATABASE_URL: "postgres://user:secret@db:5432/snapotter",
    DATABASE_MIGRATION_URL: "postgres://owner:0wner@P4ss@db:5432/snapotter",
    REDIS_URL: "redis://user:secret@redis:6379",
    DEFAULT_PASSWORD: "hunter2",
    SESSION_SECRET: "topsecret",
    SENTRY_DSN: "https://abc@sentry.io/1",
    S3_ACCESS_KEY_ID: "AKIA123",
    PORT: 13490,
    AUTH_ENABLED: true,
  } as Record<string, unknown>,
}));

// ── Module mocks ────────────────────────────────────────────────────────

vi.mock("node:fs", () => ({
  readdirSync: fsMock.readdirSync,
  readFileSync: fsMock.readFileSync,
  statfsSync: fsMock.statfsSync,
}));

vi.mock("../../../apps/api/src/config.js", () => envMock);

// A drizzle-style select chain that terminates in a thenable at .limit().
function makeSelectChain() {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => dbMock.selectResult.promise,
  };
  return chain;
}

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    execute: (...args: unknown[]) => dbMock.execute(...args),
    select: () => makeSelectChain(),
  },
  schema: {
    jobs: {
      id: {},
      toolId: {},
      pool: {},
      error: {},
      createdAt: {},
      durationMs: {},
      status: {},
    },
  },
}));

import { buildSupportBundle } from "../../../apps/api/src/lib/support-bundle.js";

// ── Helpers ─────────────────────────────────────────────────────────────

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (c: Buffer) => chunks.push(Buffer.from(c)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

async function buildAndUnzip(): Promise<AdmZip> {
  const stream = buildSupportBundle();
  const buf = await collect(stream);
  return new AdmZip(buf);
}

function readEntry(zip: AdmZip, name: string): unknown {
  const entry = zip.getEntry(name);
  if (!entry) throw new Error(`missing entry: ${name}`);
  return JSON.parse(entry.getData().toString("utf-8"));
}

// ── Default happy state, reset per test ─────────────────────────────────

beforeEach(() => {
  fsMock.readdirSync.mockReset();
  fsMock.readFileSync.mockReset();
  fsMock.statfsSync.mockReset();
  dbMock.execute.mockReset();

  // Default: LOG_DIR has one readable file.
  fsMock.readdirSync.mockReturnValue(["app.log"]);
  fsMock.readFileSync.mockReturnValue(Buffer.from("log line\n"));
  // Default: statfs succeeds.
  fsMock.statfsSync.mockReturnValue({ bfree: 100, bsize: 4096 });
  // Default: db.execute returns two table counts.
  dbMock.execute.mockResolvedValue({
    rows: [
      { relname: "jobs", n_live_tup: 5 },
      { relname: "users", n_live_tup: 2 },
    ],
  });
  // Default: failedJobs select resolves to one row.
  dbMock.selectResult.promise = Promise.resolve([
    { id: "j1", toolId: "resize", pool: "image", error: null, createdAt: null, durationMs: 10 },
  ]);

  // Restore env mutations from prior tests.
  envMock.env.DATABASE_URL = "postgres://user:secret@db:5432/snapotter";
  envMock.env.DATABASE_MIGRATION_URL = "postgres://owner:0wner@P4ss@db:5432/snapotter";
  envMock.env.LOG_DIR = "/var/log/snapotter";
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── config.json redaction ───────────────────────────────────────────────

describe("buildSupportBundle config.json redaction", () => {
  it("masks userinfo in DATABASE_URL and REDIS_URL", async () => {
    const zip = await buildAndUnzip();
    const config = readEntry(zip, "config.json") as Record<string, unknown>;
    expect(config.DATABASE_URL).toBe("postgres://***@db:5432/snapotter");
    expect(config.REDIS_URL).toBe("redis://***@redis:6379");
  });

  // DATABASE_MIGRATION_URL carries the OWNER password, more privileged than the
  // runtime credential, and its key matches no REDACT_PATTERN token. The
  // password holds an "@" on purpose: a first-"@" regex would emit
  // "://***@P4ss@db..." and leak the tail. Asserted against the whole
  // serialized config so a passthrough anywhere else trips this too.
  it("masks userinfo in DATABASE_MIGRATION_URL", async () => {
    const zip = await buildAndUnzip();
    const raw = zip.getEntry("config.json")?.getData().toString("utf-8") ?? "";
    const config = JSON.parse(raw) as Record<string, unknown>;
    expect(config.DATABASE_MIGRATION_URL).toBe("postgres://***@db:5432/snapotter");
    expect(config.DATABASE_MIGRATION_URL).toMatch(/:\/\/\*\*\*@/);
    expect(raw).not.toContain("P4ss");
  });

  it("fully redacts keys matching PASSWORD|SECRET|KEY|DSN", async () => {
    const zip = await buildAndUnzip();
    const config = readEntry(zip, "config.json") as Record<string, unknown>;
    expect(config.DEFAULT_PASSWORD).toBe("<redacted>");
    expect(config.SESSION_SECRET).toBe("<redacted>");
    expect(config.SENTRY_DSN).toBe("<redacted>");
    expect(config.S3_ACCESS_KEY_ID).toBe("<redacted>");
  });

  it("passes non-sensitive keys through unchanged and stamps version + node", async () => {
    const zip = await buildAndUnzip();
    const config = readEntry(zip, "config.json") as Record<string, unknown>;
    expect(config.PORT).toBe(13490);
    expect(config.AUTH_ENABLED).toBe(true);
    // version comes from APP_VERSION, node from process.version.
    expect(typeof config.version).toBe("string");
    expect(config.node).toBe(process.version);
  });

  it("does not apply userinfo masking when a URL key is not a string", async () => {
    // typeof value === "string" is false, and DATABASE_URL matches no
    // REDACT_PATTERN token, so it falls through to the passthrough branch.
    envMock.env.DATABASE_URL = undefined;
    const zip = await buildAndUnzip();
    const config = readEntry(zip, "config.json") as Record<string, unknown>;
    // undefined values are dropped by JSON.stringify.
    expect("DATABASE_URL" in config).toBe(false);
  });
});

// ── log file collection ─────────────────────────────────────────────────

describe("buildSupportBundle log collection", () => {
  it("includes readable log files under logs/", async () => {
    fsMock.readdirSync.mockReturnValue(["a.log", "b.log"]);
    fsMock.readFileSync.mockReturnValue(Buffer.from("data"));
    const zip = await buildAndUnzip();
    const names = zip.getEntries().map((e) => e.entryName);
    expect(names).toContain("logs/a.log");
    expect(names).toContain("logs/b.log");
  });

  it("skips an unreadable log file but keeps the rest", async () => {
    fsMock.readdirSync.mockReturnValue(["ok.log", "locked.log"]);
    fsMock.readFileSync.mockImplementation((p: string) => {
      if (String(p).endsWith("locked.log")) throw new Error("EACCES");
      return Buffer.from("ok");
    });
    const zip = await buildAndUnzip();
    const names = zip.getEntries().map((e) => e.entryName);
    expect(names).toContain("logs/ok.log");
    expect(names).not.toContain("logs/locked.log");
    // The bundle is still assembled: config.json is present.
    expect(names).toContain("config.json");
  });

  it("silently skips log collection when LOG_DIR is missing", async () => {
    fsMock.readdirSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const zip = await buildAndUnzip();
    const names = zip.getEntries().map((e) => e.entryName);
    expect(names.some((n) => n.startsWith("logs/"))).toBe(false);
    // The rest of the bundle still assembles.
    expect(names).toContain("config.json");
    expect(names).toContain("db-counts.json");
    expect(names).toContain("host.json");
  });
});

// ── db-counts.json ──────────────────────────────────────────────────────

describe("buildSupportBundle db-counts.json", () => {
  it("includes the rows returned by pg_stat_user_tables", async () => {
    const zip = await buildAndUnzip();
    const counts = readEntry(zip, "db-counts.json") as Array<Record<string, unknown>>;
    expect(counts).toEqual([
      { relname: "jobs", n_live_tup: 5 },
      { relname: "users", n_live_tup: 2 },
    ]);
  });

  it("falls back to an empty array when the count query throws", async () => {
    dbMock.execute.mockRejectedValue(new Error("connection reset"));
    const zip = await buildAndUnzip();
    const counts = readEntry(zip, "db-counts.json");
    expect(counts).toEqual([]);
  });
});

// ── failed-jobs.json ────────────────────────────────────────────────────

describe("buildSupportBundle failed-jobs.json", () => {
  it("includes the rows returned by the jobs query", async () => {
    const zip = await buildAndUnzip();
    const jobs = readEntry(zip, "failed-jobs.json") as Array<Record<string, unknown>>;
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ id: "j1", toolId: "resize", pool: "image" });
  });

  it("falls back to an empty array when the jobs query throws", async () => {
    dbMock.selectResult.promise = Promise.reject(new Error("query failed"));
    const zip = await buildAndUnzip();
    const jobs = readEntry(zip, "failed-jobs.json");
    expect(jobs).toEqual([]);
  });
});

// ── host.json ───────────────────────────────────────────────────────────

describe("buildSupportBundle host.json", () => {
  it("reports workspace free bytes as bfree * bsize when statfs succeeds", async () => {
    fsMock.statfsSync.mockReturnValue({ bfree: 100, bsize: 4096 });
    const zip = await buildAndUnzip();
    const host = readEntry(zip, "host.json") as Record<string, unknown>;
    expect(host.workspaceFreeBytes).toBe(100 * 4096);
    // Platform metadata is always populated from os.*.
    expect(typeof host.platform).toBe("string");
    expect(typeof host.cpus).toBe("number");
  });

  it("reports workspaceFreeBytes: null when statfs throws", async () => {
    fsMock.statfsSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const zip = await buildAndUnzip();
    const host = readEntry(zip, "host.json") as Record<string, unknown>;
    expect(host.workspaceFreeBytes).toBeNull();
  });
});

// ── full-bundle smoke ───────────────────────────────────────────────────

describe("buildSupportBundle assembly", () => {
  it("produces a zip containing all five expected artifacts", async () => {
    const zip = await buildAndUnzip();
    const names = zip.getEntries().map((e) => e.entryName);
    expect(names).toContain("config.json");
    expect(names).toContain("db-counts.json");
    expect(names).toContain("failed-jobs.json");
    expect(names).toContain("host.json");
    expect(names).toContain("logs/app.log");
  });
});
