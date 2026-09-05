/**
 * The (auth_provider, external_id) unique index behind issue #969 lands on
 * installs that may already hold twin accounts for one identity, minted by
 * that very race. Their boot must not fail on the index build: the migration
 * detaches every twin but the oldest first, and only that oldest row keeps
 * the identity.
 *
 * Drives the real migrator over a scratch database: every migration that
 * predates the index, the twins seeded straight into the table, then the
 * rest of the folder. That is exactly what an upgrading install goes through.
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
const IDENTITY_INDEX = "users_auth_provider_external_id_unique";

interface JournalEntry {
  idx: number;
  tag: string;
}
interface Journal {
  entries: JournalEntry[];
}

/** The migrations folder as it stood before the identity index. */
function folderBeforeIndex(): string {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8"),
  ) as Journal;
  const indexEntry = journal.entries.find((e) =>
    readFileSync(join(MIGRATIONS, `${e.tag}.sql`), "utf8").includes(IDENTITY_INDEX),
  );
  if (!indexEntry) throw new Error(`no migration in ${MIGRATIONS} creates ${IDENTITY_INDEX}`);

  const dir = mkdtempSync(join(tmpdir(), "snapotter-pre-identity-index-"));
  mkdirSync(join(dir, "meta"));
  const kept = journal.entries.filter((e) => e.idx < indexEntry.idx);
  for (const entry of kept) {
    cpSync(join(MIGRATIONS, `${entry.tag}.sql`), join(dir, `${entry.tag}.sql`));
  }
  writeFileSync(join(dir, "meta/_journal.json"), JSON.stringify({ ...journal, entries: kept }));
  return dir;
}

// Superuser on the shared test server (tests/global-setup.ts); the fork's own
// database is already fully migrated, so the scenario needs a fresh one.
const baseUrl = process.env.TEST_PG_BASE_URL as string;
const scratchName = `snapotter_test_mig_${process.pid}_${randomUUID().slice(0, 8).replace(/-/g, "")}`;

let scratch: pg.Pool;
let preIndexFolder: string;

async function asAdmin(fn: (client: pg.Client) => Promise<unknown>): Promise<void> {
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  try {
    await fn(admin);
  } finally {
    await admin.end();
  }
}

const OLD = new Date("2026-01-01T00:00:00Z");
const NEW = new Date("2026-02-01T00:00:00Z");

interface SeedRow {
  id: string;
  provider: string;
  externalId: string | null;
  createdAt: Date;
}

const SEED: SeedRow[] = [
  // The #969 shape: one oidc identity, three rows. The oldest keeps it, and
  // its id sorts last on purpose so this pins created_at, not id order.
  { id: "zz_keep", provider: "oidc", externalId: "ext-twin", createdAt: OLD },
  { id: "aa_late", provider: "oidc", externalId: "ext-twin", createdAt: NEW },
  { id: "ab_late", provider: "oidc", externalId: "ext-twin", createdAt: NEW },
  // Same second, so the id breaks the tie: tie_a stays linked.
  { id: "tie_a", provider: "saml", externalId: "ext-tie", createdAt: NEW },
  { id: "tie_b", provider: "saml", externalId: "ext-tie", createdAt: NEW },
  // Same external id under another provider is a different identity.
  { id: "other_provider", provider: "saml", externalId: "ext-twin", createdAt: NEW },
  // Local accounts carry no external id and are outside the index entirely.
  { id: "local_a", provider: "local", externalId: null, createdAt: OLD },
  { id: "local_b", provider: "local", externalId: null, createdAt: OLD },
];

async function seededRows(): Promise<
  Map<string, { externalId: string | null; provider: string; updatedAt: Date }>
> {
  const { rows } = await scratch.query<{
    id: string;
    external_id: string | null;
    auth_provider: string;
    updated_at: Date;
  }>("SELECT id, external_id, auth_provider, updated_at FROM users WHERE id = ANY($1)", [
    SEED.map((r) => r.id),
  ]);
  return new Map(
    rows.map((r) => [
      r.id,
      { externalId: r.external_id, provider: r.auth_provider, updatedAt: r.updated_at },
    ]),
  );
}

beforeAll(async () => {
  preIndexFolder = folderBeforeIndex();
  await asAdmin((admin) => admin.query(`CREATE DATABASE ${scratchName}`));
  const url = new URL(baseUrl);
  url.pathname = `/${scratchName}`;
  scratch = new pg.Pool({ connectionString: url.toString(), max: 1 });

  await migrate(drizzle(scratch), { migrationsFolder: preIndexFolder });
  for (const row of SEED) {
    await scratch.query(
      `INSERT INTO users (id, username, auth_provider, external_id, created_at, updated_at)
       VALUES ($1, $1, $2, $3, $4, $4)`,
      [row.id, row.provider, row.externalId, row.createdAt],
    );
  }
}, 60_000);

afterAll(async () => {
  await scratch?.end();
  await asAdmin((admin) => admin.query(`DROP DATABASE IF EXISTS ${scratchName}`));
  if (preIndexFolder) rmSync(preIndexFolder, { recursive: true, force: true });
}, 30_000);

describe("users identity index migration (issue #969)", () => {
  it("detaches every twin but the oldest, then builds the partial unique index", async () => {
    const before = await seededRows();
    expect(before.get("aa_late")?.externalId).toBe("ext-twin");

    await migrate(drizzle(scratch), { migrationsFolder: MIGRATIONS });

    const after = await seededRows();
    expect(after.get("zz_keep")?.externalId).toBe("ext-twin");
    expect(after.get("aa_late")?.externalId).toBeNull();
    expect(after.get("ab_late")?.externalId).toBeNull();
    expect(after.get("tie_a")?.externalId).toBe("ext-tie");
    expect(after.get("tie_b")?.externalId).toBeNull();
    expect(after.get("other_provider")?.externalId).toBe("ext-twin");

    // Detached rows keep their provider (they were SSO accounts and still
    // read as such) and get a fresh updated_at; untouched rows keep theirs.
    for (const id of ["aa_late", "ab_late", "tie_b"]) {
      expect(after.get(id)?.provider, id).toBe(before.get(id)?.provider);
      expect(after.get(id)?.updatedAt.getTime(), id).toBeGreaterThan(NEW.getTime());
    }
    for (const id of ["zz_keep", "tie_a", "other_provider", "local_a", "local_b"]) {
      expect(after.get(id)?.updatedAt.getTime(), id).toBe(before.get(id)?.updatedAt.getTime());
    }
    expect(after.get("local_a")?.externalId).toBeNull();
    expect(after.get("local_b")?.externalId).toBeNull();

    const { rows: indexes } = await scratch.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE tablename = 'users' AND indexname = $1",
      [IDENTITY_INDEX],
    );
    expect(indexes).toHaveLength(1);
    expect(indexes[0].indexdef).toMatch(/UNIQUE INDEX/);
    expect(indexes[0].indexdef).toMatch(/WHERE \(external_id IS NOT NULL\)/);
  });

  it("refuses a second row for a linked identity but still allows any number of local accounts", async () => {
    const insert = (id: string, provider: string, externalId: string | null) =>
      scratch.query(
        `INSERT INTO users (id, username, auth_provider, external_id, created_at, updated_at)
         VALUES ($1, $1, $2, $3, now(), now())`,
        [id, provider, externalId],
      );

    await expect(insert("twin_again", "oidc", "ext-twin")).rejects.toMatchObject({ code: "23505" });
    await expect(insert("local_c", "local", null)).resolves.toBeDefined();
    await expect(insert("local_d", "local", null)).resolves.toBeDefined();
  });
});
