/**
 * users.team holds a team id (#1474). Register, SSO, and SCIM all write the id,
 * and every lookup (the storage quota, MFA policy, job enqueue) matches on
 * teams.id. The column default used to be the team *name* "Default", so the
 * bootstrap admin and the anonymous user carried a value no teams.id matches,
 * and team settings silently skipped them. Migration 0009 itself is covered by
 * users-team-id-migration.test.ts.
 */
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { ensureAnonymousUser } from "../../../apps/api/src/plugins/auth.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);

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

async function teamOf(username: string) {
  const [user] = await db
    .select({ team: schema.users.team })
    .from(schema.users)
    .where(eq(schema.users.username, username));
  return user?.team;
}

describe("users.team holds a team id (#1474)", () => {
  it("gives the bootstrap admin the seeded Default team's id", async () => {
    expect(await teamOf("admin")).toBe(schema.DEFAULT_TEAM_ID);
    const [row] = await db
      .select()
      .from(schema.teams)
      .where(eq(schema.teams.id, schema.DEFAULT_TEAM_ID));
    expect(row?.name).toBe("Default");
  });

  it("applies the team storage quota to the bootstrap admin", async () => {
    const team = schema.DEFAULT_TEAM_ID;
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

describe("the bootstrap users join whichever team is the Default team (#1474)", () => {
  // ensureDefaultTeam() skips its seed when another team already holds the
  // name, so the column default alone could name a team that doesn't exist.
  const STAFF = "Staff1474";
  const OTHER_DEFAULT = "t1474-default";

  async function freshAnonymous() {
    await db.delete(schema.users).where(eq(schema.users.id, "anonymous"));
    await ensureAnonymousUser();
    return teamOf("anonymous");
  }

  // The seeded team, renamed.
  beforeAll(async () => {
    await db
      .update(schema.teams)
      .set({ name: STAFF })
      .where(eq(schema.teams.id, schema.DEFAULT_TEAM_ID));
  });

  afterAll(async () => {
    await db.delete(schema.users).where(eq(schema.users.id, "anonymous"));
    await db.delete(schema.teams).where(eq(schema.teams.id, OTHER_DEFAULT));
    await db
      .update(schema.teams)
      .set({ name: "Default" })
      .where(eq(schema.teams.id, schema.DEFAULT_TEAM_ID));
  });

  it("uses the team named Default when it isn't the seeded one", async () => {
    await db.insert(schema.teams).values({ id: OTHER_DEFAULT, name: "Default" });
    try {
      expect(await freshAnonymous()).toBe(OTHER_DEFAULT);
    } finally {
      await db.delete(schema.teams).where(eq(schema.teams.id, OTHER_DEFAULT));
    }
  });

  it("falls back to the seeded team when no team is named Default", async () => {
    expect(await freshAnonymous()).toBe(schema.DEFAULT_TEAM_ID);
  });
});
