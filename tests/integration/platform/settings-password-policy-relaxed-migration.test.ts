/**
 * Migration 0013 relaxes the password policy for new installs only. The rules
 * now default off and the minimum to 1, so an install that already has users
 * gets the old defaults (8 characters, uppercase, lowercase, digit) written as
 * rows wherever none exists, and keeps enforcing what it always did. A fresh
 * database has no users when migrations run, so it stays relaxed.
 */
import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const MIGRATIONS = join(process.cwd(), "apps/api/drizzle");

interface JournalEntry {
  idx: number;
  tag: string;
}
interface Journal {
  entries: JournalEntry[];
}

function folderBeforeRelaxedPolicy(): string {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8"),
  ) as Journal;
  const relaxed = journal.entries.find((e) => e.tag.endsWith("_settings_password_policy_relaxed"));
  if (!relaxed) {
    throw new Error(`no *_settings_password_policy_relaxed migration in ${MIGRATIONS}`);
  }

  const dir = mkdtempSync(join(tmpdir(), "snapotter-pre-relaxed-policy-"));
  mkdirSync(join(dir, "meta"));
  const kept = journal.entries.filter((e) => e.idx < relaxed.idx);
  for (const entry of kept) {
    cpSync(join(MIGRATIONS, `${entry.tag}.sql`), join(dir, `${entry.tag}.sql`));
  }
  writeFileSync(join(dir, "meta/_journal.json"), JSON.stringify({ ...journal, entries: kept }));
  return dir;
}

const baseUrl = process.env.TEST_PG_BASE_URL as string;
const created: string[] = [];
const pools: pg.Pool[] = [];
let preRelaxedFolder: string;

async function asAdmin(fn: (client: pg.Client) => Promise<unknown>): Promise<void> {
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  try {
    await fn(admin);
  } finally {
    await admin.end();
  }
}

async function preRelaxedDatabase(opts: {
  users: number;
  settings?: ReadonlyArray<[key: string, value: string]>;
}): Promise<pg.Pool> {
  const name = `snapotter_test_mig_${process.pid}_${randomUUID().slice(0, 8).replace(/-/g, "")}`;
  await asAdmin((admin) => admin.query(`CREATE DATABASE ${name}`));
  created.push(name);
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 1 });
  pools.push(pool);

  await migrate(drizzle(pool), { migrationsFolder: preRelaxedFolder });
  for (let i = 0; i < opts.users; i++) {
    await pool.query(
      "INSERT INTO users (id, username, created_at, updated_at) VALUES ($1, $2, now(), now())",
      [randomUUID(), `user${i}`],
    );
  }
  for (const [key, value] of opts.settings ?? []) {
    await pool.query("INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())", [
      key,
      value,
    ]);
  }
  return pool;
}

async function readSettings(pool: pg.Pool): Promise<Record<string, string>> {
  const { rows } = await pool.query<{ key: string; value: string }>(
    "SELECT key, value FROM settings ORDER BY key",
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

beforeAll(() => {
  preRelaxedFolder = folderBeforeRelaxedPolicy();
});

afterAll(async () => {
  await Promise.all(pools.map((p) => p.end()));
  for (const name of created) {
    await asAdmin((admin) => admin.query(`DROP DATABASE IF EXISTS ${name}`));
  }
  if (preRelaxedFolder) rmSync(preRelaxedFolder, { recursive: true, force: true });
});

describe("migration 0013: relaxed password policy for new installs only", () => {
  it("pins the old defaults on an install that already has users", async () => {
    const pool = await preRelaxedDatabase({ users: 1, settings: [["defaultTheme", "dark"]] });

    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS });

    expect(await readSettings(pool)).toEqual({
      defaultTheme: "dark",
      passwordMinLength: "8",
      passwordRequireDigit: "true",
      passwordRequireLowercase: "true",
      passwordRequireUppercase: "true",
    });
  });

  it("keeps every rule an admin already saved", async () => {
    const pool = await preRelaxedDatabase({
      users: 2,
      settings: [
        ["passwordMinLength", "4"],
        ["passwordRequireUppercase", "false"],
        ["passwordRequireSpecial", "true"],
      ],
    });

    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS });

    expect(await readSettings(pool)).toEqual({
      passwordMinLength: "4",
      passwordRequireDigit: "true",
      passwordRequireLowercase: "true",
      passwordRequireSpecial: "true",
      passwordRequireUppercase: "false",
    });
  });

  it("writes nothing on a fresh install, which then has no password rules", async () => {
    const pool = await preRelaxedDatabase({ users: 0 });

    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS });

    expect(await readSettings(pool)).toEqual({});
  });
});
