/**
 * Migration 0013 (#4579) rewrites each raw session token in sessions.id to
 * sha256(token) as lowercase hex, the same digest hashSessionToken computes,
 * so sessions that exist at upgrade keep working. Rows already 64 characters
 * long are left alone, which makes a re-run a no-op.
 */
import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashSessionToken } from "../../../apps/api/src/lib/session-token.js";

const MIGRATIONS = join(process.cwd(), "apps/api/drizzle");

interface JournalEntry {
  idx: number;
  tag: string;
}
interface Journal {
  entries: JournalEntry[];
}

function folderBeforeSessionHash(): string {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8"),
  ) as Journal;
  const sessionHash = journal.entries.find((e) => e.tag.endsWith("_sessions_hash_token_id"));
  if (!sessionHash) {
    throw new Error(`no *_sessions_hash_token_id migration in ${MIGRATIONS}`);
  }

  const dir = mkdtempSync(join(tmpdir(), "snapotter-pre-session-hash-"));
  mkdirSync(join(dir, "meta"));
  const kept = journal.entries.filter((e) => e.idx < sessionHash.idx);
  for (const entry of kept) {
    cpSync(join(MIGRATIONS, `${entry.tag}.sql`), join(dir, `${entry.tag}.sql`));
  }
  writeFileSync(join(dir, "meta/_journal.json"), JSON.stringify({ ...journal, entries: kept }));
  return dir;
}

const baseUrl = process.env.TEST_PG_BASE_URL as string;
const created: string[] = [];
const pools: pg.Pool[] = [];
let preSessionHashFolder: string;

async function asAdmin(fn: (client: pg.Client) => Promise<unknown>): Promise<void> {
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  try {
    await fn(admin);
  } finally {
    await admin.end();
  }
}

async function preSessionHashDatabase(sessionIds: readonly string[]): Promise<pg.Pool> {
  const name = `snapotter_test_mig_${process.pid}_${randomUUID().slice(0, 8).replace(/-/g, "")}`;
  await asAdmin((admin) => admin.query(`CREATE DATABASE ${name}`));
  created.push(name);
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 1 });
  pools.push(pool);

  await migrate(drizzle(pool), { migrationsFolder: preSessionHashFolder });
  await pool.query(
    "INSERT INTO teams (id, name, created_at) VALUES ('t-4579', 'Session hash test', now())",
  );
  await pool.query(
    `INSERT INTO users (id, username, role, team, created_at, updated_at)
     VALUES ('u1', 'alice', 'user', 't-4579', now(), now())`,
  );
  for (const id of sessionIds) {
    await pool.query(
      "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ($1, 'u1', now() + interval '1 day', now())",
      [id],
    );
  }
  return pool;
}

async function readSessionIds(pool: pg.Pool): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>("SELECT id FROM sessions ORDER BY id");
  return rows.map((r) => r.id);
}

beforeAll(() => {
  preSessionHashFolder = folderBeforeSessionHash();
});

afterAll(async () => {
  await Promise.all(pools.map((p) => p.end()));
  for (const name of created) {
    await asAdmin((admin) => admin.query(`DROP DATABASE IF EXISTS ${name}`));
  }
  if (preSessionHashFolder) rmSync(preSessionHashFolder, { recursive: true, force: true });
});

describe("migration 0013: hash stored session tokens (#4579)", () => {
  it("rewrites a raw token to the digest hashSessionToken computes", async () => {
    const token = randomUUID();
    const pool = await preSessionHashDatabase([token]);

    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS });

    expect(await readSessionIds(pool)).toEqual([hashSessionToken(token)]);
  });

  it("leaves a row that is already a 64-character digest alone", async () => {
    const token = randomUUID();
    const digest = hashSessionToken(randomUUID());
    const pool = await preSessionHashDatabase([token, digest]);

    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS });

    expect(await readSessionIds(pool)).toEqual([hashSessionToken(token), digest].sort());
  });
});
