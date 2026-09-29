/**
 * The users_scim_external_id migration (#1510) gives SCIM's externalId its own
 * column. On an upgrading install, rows SCIM provisioned carry that id in
 * users.external_id, next to OIDC subjects and SAML NameIDs; the migration
 * moves the SCIM ones over and leaves every other provider's alone.
 *
 * Drives the real migrator over a scratch database the way an upgrading
 * install goes through it: every migration before this one, rows seeded
 * straight into the table, then the rest of the folder.
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

/** The migrations folder as it stood before SCIM had its own column. */
function folderBeforeScimColumn(): string {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8"),
  ) as Journal;
  const scimColumn = journal.entries.find((e) => e.tag.endsWith("_users_scim_external_id"));
  if (!scimColumn) throw new Error(`no *_users_scim_external_id migration in ${MIGRATIONS}`);

  const dir = mkdtempSync(join(tmpdir(), "snapotter-pre-scim-column-"));
  mkdirSync(join(dir, "meta"));
  const kept = journal.entries.filter((e) => e.idx < scimColumn.idx);
  for (const entry of kept) {
    cpSync(join(MIGRATIONS, `${entry.tag}.sql`), join(dir, `${entry.tag}.sql`));
  }
  writeFileSync(join(dir, "meta/_journal.json"), JSON.stringify({ ...journal, entries: kept }));
  return dir;
}

// Superuser on the shared test server (tests/global-setup.ts); the file's own
// database is already fully migrated, so the scenario needs a fresh one.
const baseUrl = process.env.TEST_PG_BASE_URL as string;
const created: string[] = [];
const pools: pg.Pool[] = [];
let preScimColumnFolder: string;

async function asAdmin(fn: (client: pg.Client) => Promise<unknown>): Promise<void> {
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  try {
    await fn(admin);
  } finally {
    await admin.end();
  }
}

/** A database migrated up to just before the SCIM column, seeded with these users. */
async function preScimColumnDatabase(
  users: Array<[id: string, provider: string, externalId: string | null]>,
): Promise<pg.Pool> {
  const name = `snapotter_test_mig_${process.pid}_${randomUUID().slice(0, 8).replace(/-/g, "")}`;
  await asAdmin((admin) => admin.query(`CREATE DATABASE ${name}`));
  created.push(name);
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 1 });
  pools.push(pool);

  await migrate(drizzle(pool), { migrationsFolder: preScimColumnFolder });
  for (const [id, provider, externalId] of users) {
    await pool.query(
      "INSERT INTO users (id, username, auth_provider, external_id, created_at, updated_at) VALUES ($1, $1, $2, $3, now(), now())",
      [id, provider, externalId],
    );
  }
  return pool;
}

async function identities(
  pool: pg.Pool,
): Promise<Record<string, { external: string | null; scim: string | null }>> {
  const { rows } = await pool.query<{
    id: string;
    external_id: string | null;
    scim_external_id: string | null;
  }>("SELECT id, external_id, scim_external_id FROM users");
  return Object.fromEntries(
    rows.map((r) => [r.id, { external: r.external_id, scim: r.scim_external_id }]),
  );
}

beforeAll(() => {
  preScimColumnFolder = folderBeforeScimColumn();
});

afterAll(async () => {
  await Promise.all(pools.map((p) => p.end()));
  for (const name of created) {
    await asAdmin((admin) => admin.query(`DROP DATABASE IF EXISTS ${name}`));
  }
  if (preScimColumnFolder) rmSync(preScimColumnFolder, { recursive: true, force: true });
}, 30_000);

describe("migration: SCIM externalId gets its own column (#1510)", () => {
  it("moves SCIM rows' external_id over and leaves OIDC, SAML, and local rows alone", async () => {
    const pool = await preScimColumnDatabase([
      ["scim_user", "scim", "shared-id"],
      // Same value under another provider: allowed before, and still allowed.
      ["oidc_user", "oidc", "shared-id"],
      ["saml_user", "saml", "name-id"],
      ["scim_no_id", "scim", null],
      ["local_user", "local", null],
    ]);

    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS });

    expect(await identities(pool)).toEqual({
      scim_user: { external: null, scim: "shared-id" },
      oidc_user: { external: "shared-id", scim: null },
      saml_user: { external: "name-id", scim: null },
      scim_no_id: { external: null, scim: null },
      local_user: { external: null, scim: null },
    });
  });

  it("refuses a second user with the same SCIM externalId, whatever its provider", async () => {
    const pool = await preScimColumnDatabase([["scim_user", "scim", "taken-id"]]);
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS });

    const err = await pool
      .query(
        "INSERT INTO users (id, username, auth_provider, scim_external_id, created_at, updated_at) VALUES ('twin', 'twin', 'oidc', 'taken-id', now(), now())",
      )
      .then(
        () => null,
        (e: { code?: string; constraint?: string }) => e,
      );

    expect(err?.code).toBe("23505");
    expect(err?.constraint).toBe("users_scim_external_id_unique");
  });
});
