/**
 * Migration 0009 (#1474) moves users.team from team names to team ids on
 * installs that already hold names: the old column default 'Default', and any
 * other value that names a team. Values that are already ids, or match no
 * team, stay as they are.
 *
 * Drives the real migrator over scratch databases, the way an upgrading
 * install goes through it: every migration before 0009, rows seeded straight
 * into the tables, then the rest of the folder. Two databases, because the
 * two ways a 'Default' can resolve can't coexist (team names are unique).
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
const SEEDED_ID = "default-team-00000000";

interface JournalEntry {
  idx: number;
  tag: string;
}
interface Journal {
  entries: JournalEntry[];
}

/** The migrations folder as it stood before users.team held ids. */
function folderBeforeTeamIds(): string {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8"),
  ) as Journal;
  const teamIds = journal.entries.find((e) => e.tag.endsWith("_users_team_id"));
  if (!teamIds) throw new Error(`no *_users_team_id migration in ${MIGRATIONS}`);

  const dir = mkdtempSync(join(tmpdir(), "snapotter-pre-team-ids-"));
  mkdirSync(join(dir, "meta"));
  const kept = journal.entries.filter((e) => e.idx < teamIds.idx);
  for (const entry of kept) {
    cpSync(join(MIGRATIONS, `${entry.tag}.sql`), join(dir, `${entry.tag}.sql`));
  }
  writeFileSync(join(dir, "meta/_journal.json"), JSON.stringify({ ...journal, entries: kept }));
  return dir;
}

// Superuser on the shared test server (tests/global-setup.ts); the file's own
// database is already fully migrated, so each scenario needs a fresh one.
const baseUrl = process.env.TEST_PG_BASE_URL as string;
const created: string[] = [];
const pools: pg.Pool[] = [];
let preTeamIdsFolder: string;

async function asAdmin(fn: (client: pg.Client) => Promise<unknown>): Promise<void> {
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  try {
    await fn(admin);
  } finally {
    await admin.end();
  }
}

/**
 * A database migrated up to just before 0009 and seeded with these teams and
 * users. A user whose team is undefined takes the column default of the time.
 */
async function preTeamIdsDatabase(
  teams: Array<[id: string, name: string]>,
  users: Array<[id: string, team: string | undefined]>,
): Promise<pg.Pool> {
  const name = `snapotter_test_mig_${process.pid}_${randomUUID().slice(0, 8).replace(/-/g, "")}`;
  await asAdmin((admin) => admin.query(`CREATE DATABASE ${name}`));
  created.push(name);
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 1 });
  pools.push(pool);

  await migrate(drizzle(pool), { migrationsFolder: preTeamIdsFolder });
  for (const [id, teamName] of teams) {
    await pool.query("INSERT INTO teams (id, name, created_at) VALUES ($1, $2, now())", [
      id,
      teamName,
    ]);
  }
  for (const [id, team] of users) {
    if (team === undefined) {
      await pool.query(
        "INSERT INTO users (id, username, created_at, updated_at) VALUES ($1, $1, now(), now())",
        [id],
      );
    } else {
      await pool.query(
        "INSERT INTO users (id, username, team, created_at, updated_at) VALUES ($1, $1, $2, now(), now())",
        [id, team],
      );
    }
  }
  return pool;
}

async function teams(pool: pg.Pool): Promise<Record<string, string>> {
  const { rows } = await pool.query<{ id: string; team: string }>("SELECT id, team FROM users");
  return Object.fromEntries(rows.map((r) => [r.id, r.team]));
}

beforeAll(() => {
  preTeamIdsFolder = folderBeforeTeamIds();
});

afterAll(async () => {
  await Promise.all(pools.map((p) => p.end()));
  for (const name of created) {
    await asAdmin((admin) => admin.query(`DROP DATABASE IF EXISTS ${name}`));
  }
  if (preTeamIdsFolder) rmSync(preTeamIdsFolder, { recursive: true, force: true });
}, 30_000);

describe("migration 0009: users.team names become team ids (#1474)", () => {
  it("maps names to ids and a leftover 'Default' to the seeded team, and sets the new default", async () => {
    const pool = await preTeamIdsDatabase(
      [
        // The seeded Default team, renamed: no team is called Default any more.
        [SEEDED_ID, "Staff"],
        ["t-eng", "Engineering"],
        // A team whose name is another team's id.
        ["t-alpha", "t-beta"],
        ["t-beta", "Beta"],
      ],
      [
        ["col_default", undefined],
        ["by_name", "Engineering"],
        ["already_id", "t-eng"],
        ["id_and_name", "t-beta"],
        ["unknown", "NoSuchTeam"],
      ],
    );
    expect((await teams(pool)).col_default).toBe("Default");

    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS });

    expect(await teams(pool)).toEqual({
      col_default: SEEDED_ID,
      by_name: "t-eng",
      already_id: "t-eng",
      // Already a team's id, so it isn't read as the other team's name.
      id_and_name: "t-beta",
      unknown: "NoSuchTeam",
    });

    await pool.query(
      "INSERT INTO users (id, username, created_at, updated_at) VALUES ('after', 'after', now(), now())",
    );
    expect((await teams(pool)).after).toBe(SEEDED_ID);
  });

  it("maps 'Default' to the team named Default even when that isn't the seeded one", async () => {
    const pool = await preTeamIdsDatabase(
      [
        [SEEDED_ID, "Staff"],
        ["t-default", "Default"],
      ],
      [["col_default", undefined]],
    );

    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS });

    expect((await teams(pool)).col_default).toBe("t-default");
  });
});
