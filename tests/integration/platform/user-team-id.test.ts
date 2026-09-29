/**
 * users.team holds a team id (#1474). Register, SSO, and SCIM all write the id,
 * and every lookup (the storage quota, MFA policy, job enqueue) matches on
 * teams.id. The column default used to be the team *name* "Default", so the
 * bootstrap admin, the anonymous user, and 1.x imports carried a value no
 * teams.id matches, and team settings silently skipped them.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);
const MIGRATION = join(__dirname, "../../../apps/api/drizzle/0009_users_team_id.sql");

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

afterEach(async () => {
  await db.update(schema.teams).set({ storageQuota: null });
});

async function adminRow() {
  const [admin] = await db
    .select({ id: schema.users.id, team: schema.users.team })
    .from(schema.users)
    .where(eq(schema.users.username, "admin"));
  return admin;
}

describe("users.team holds a team id (#1474)", () => {
  it("gives the bootstrap admin a team that resolves by id", async () => {
    const { team } = await adminRow();
    const [row] = await db.select().from(schema.teams).where(eq(schema.teams.id, team));
    expect(row?.name).toBe("Default");
  });

  it("applies the team storage quota to the bootstrap admin", async () => {
    const { team } = await adminRow();
    const [{ total }] = await db
      .select({ total: sql<number>`coalesce(sum(${schema.users.storageUsed}), 0)` })
      .from(schema.users)
      .where(eq(schema.users.team, team));
    // One byte of headroom, so any upload is over the team quota.
    await db
      .update(schema.teams)
      .set({ storageQuota: Number(total) + 1 })
      .where(eq(schema.teams.id, team));

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      payload: body,
    });

    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body).error).toMatch(/Team storage quota exceeded/);
  });
});

describe("migration 0009 rewrites team names to team ids (#1474)", () => {
  // The data statements only: the ALTER COLUMN needs a privileged role, and
  // the per-fork database already has it applied.
  const dataStatements = readFileSync(MIGRATION, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter((s) => /^UPDATE\b/i.test(s));

  const ids = {
    byName: "u1474-by-name",
    defaultName: "u1474-default-name",
    alreadyId: "u1474-already-id",
    unknown: "u1474-unknown",
  };

  beforeAll(async () => {
    await db
      .insert(schema.teams)
      .values({ id: "t1474-eng", name: "Engineering1474" })
      .onConflictDoNothing();
    const base = { passwordHash: null, role: "user", mustChangePassword: false };
    await db
      .insert(schema.users)
      .values([
        { ...base, id: ids.byName, username: ids.byName, team: "Engineering1474" },
        { ...base, id: ids.defaultName, username: ids.defaultName, team: "Default" },
        { ...base, id: ids.alreadyId, username: ids.alreadyId, team: "t1474-eng" },
        { ...base, id: ids.unknown, username: ids.unknown, team: "NoSuchTeam1474" },
      ])
      .onConflictDoNothing();
    for (const statement of dataStatements) await db.execute(sql.raw(statement));
  });

  afterAll(async () => {
    await db.delete(schema.users).where(sql`${schema.users.id} LIKE 'u1474-%'`);
    await db.delete(schema.teams).where(eq(schema.teams.id, "t1474-eng"));
  });

  async function teamOf(id: string) {
    const [row] = await db
      .select({ team: schema.users.team })
      .from(schema.users)
      .where(eq(schema.users.id, id));
    return row.team;
  }

  it("has data statements to run", () => {
    expect(dataStatements.length).toBeGreaterThan(0);
  });

  it("maps a team name to that team's id", async () => {
    expect(await teamOf(ids.byName)).toBe("t1474-eng");
  });

  it("maps the old 'Default' column default to the Default team's id", async () => {
    // Whatever id this database gave the team named Default: it's the seeded
    // one on a normal install, but another test file may have created it first.
    const [defaultTeam] = await db
      .select({ id: schema.teams.id })
      .from(schema.teams)
      .where(eq(schema.teams.name, "Default"));
    expect(await teamOf(ids.defaultName)).toBe(defaultTeam.id);
  });

  it("leaves a value that's already an id alone", async () => {
    expect(await teamOf(ids.alreadyId)).toBe("t1474-eng");
  });

  it("leaves a value that matches no team alone", async () => {
    expect(await teamOf(ids.unknown)).toBe("NoSuchTeam1474");
  });
});
