/**
 * Migration 0012 (#2036) normalizes stored password-rule boolean settings to
 * canonical "true" or "false" (default-on rules become "true" unless "false";
 * passwordRequireSpecial becomes "false" unless "true") and migrates 2.0/2.1
 * passwordRequireNumber rows into passwordRequireDigit when that row is
 * missing, deleting any leftover passwordRequireNumber row.
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

function folderBeforePasswordRules(): string {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8"),
  ) as Journal;
  const passwordRules = journal.entries.find((e) => e.tag.endsWith("_settings_password_rules"));
  if (!passwordRules) {
    throw new Error(`no *_settings_password_rules migration in ${MIGRATIONS}`);
  }

  const dir = mkdtempSync(join(tmpdir(), "snapotter-pre-password-rules-"));
  mkdirSync(join(dir, "meta"));
  const kept = journal.entries.filter((e) => e.idx < passwordRules.idx);
  for (const entry of kept) {
    cpSync(join(MIGRATIONS, `${entry.tag}.sql`), join(dir, `${entry.tag}.sql`));
  }
  writeFileSync(join(dir, "meta/_journal.json"), JSON.stringify({ ...journal, entries: kept }));
  return dir;
}

const baseUrl = process.env.TEST_PG_BASE_URL as string;
const created: string[] = [];
const pools: pg.Pool[] = [];
let prePasswordRulesFolder: string;

async function asAdmin(fn: (client: pg.Client) => Promise<unknown>): Promise<void> {
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  try {
    await fn(admin);
  } finally {
    await admin.end();
  }
}

async function prePasswordRulesDatabase(
  rows: ReadonlyArray<[key: string, value: string]>,
): Promise<pg.Pool> {
  const name = `snapotter_test_mig_${process.pid}_${randomUUID().slice(0, 8).replace(/-/g, "")}`;
  await asAdmin((admin) => admin.query(`CREATE DATABASE ${name}`));
  created.push(name);
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 1 });
  pools.push(pool);

  await migrate(drizzle(pool), { migrationsFolder: prePasswordRulesFolder });
  for (const [key, value] of rows) {
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
  prePasswordRulesFolder = folderBeforePasswordRules();
});

afterAll(async () => {
  await Promise.all(pools.map((p) => p.end()));
  for (const name of created) {
    await asAdmin((admin) => admin.query(`DROP DATABASE IF EXISTS ${name}`));
  }
  if (prePasswordRulesFolder) rmSync(prePasswordRulesFolder, { recursive: true, force: true });
});

describe("migration 0012: password-rule settings normalization and alias cleanup (#2036)", () => {
  it("normalizes non-canonical rule values and moves passwordRequireNumber into passwordRequireDigit when missing", async () => {
    const pool = await prePasswordRulesDatabase([
      ["passwordRequireUppercase", "TRUE"],
      ["passwordRequireLowercase", "false"],
      ["passwordRequireNumber", "false"],
      ["passwordRequireSpecial", "1"],
      ["defaultTheme", "dark"],
    ]);

    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS });

    expect(await readSettings(pool)).toEqual({
      defaultTheme: "dark",
      passwordRequireDigit: "false",
      passwordRequireLowercase: "false",
      passwordRequireSpecial: "false",
      passwordRequireUppercase: "true",
    });
  });

  it("keeps and normalizes an existing passwordRequireDigit row while dropping the stale passwordRequireNumber row", async () => {
    const pool = await prePasswordRulesDatabase([
      ["passwordRequireDigit", "TRUE"],
      ["passwordRequireNumber", "false"],
      ["passwordRequireSpecial", "true"],
    ]);

    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS });

    expect(await readSettings(pool)).toEqual({
      passwordRequireDigit: "true",
      passwordRequireSpecial: "true",
    });
  });

  it("normalizes a moved passwordRequireNumber row that held a non-canonical value", async () => {
    const pool = await prePasswordRulesDatabase([["passwordRequireNumber", "0"]]);

    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS });

    expect(await readSettings(pool)).toEqual({
      passwordRequireDigit: "true",
    });
  });
});
