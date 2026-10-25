/**
 * Integration tests for the Teams API routes.
 *
 * Uses the same test server infrastructure as api.test.ts — a real Fastify
 * app backed by an isolated temp SQLite DB, exercised via `app.inject()`.
 */

import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import {
  raceInserts,
  raceRowLocks,
  raceUpdates,
  waitForLockWaiters,
} from "../../helpers/pg-race.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
});

afterAll(async () => {
  await testApp.cleanup();
});

// Helper: seed a Default team if not present
async function ensureDefaultTeam(): Promise<string> {
  const [existing] = await db.select().from(schema.teams).where(eq(schema.teams.name, "Default"));
  if (existing) return existing.id;
  const id = randomUUID();
  await db.insert(schema.teams).values({ id, name: "Default" });
  return id;
}

// Helper: clean all teams except Default, and recreate Default if missing
async function resetTeams(): Promise<string> {
  // Delete non-Default teams
  await db.delete(schema.teams).where(sql`${schema.teams.name} != 'Default'`);
  return await ensureDefaultTeam();
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/v1/teams
// ═══════════════════════════════════════════════════════════════════════════
describe("GET /api/v1/teams", () => {
  beforeEach(() => resetTeams());

  it("returns teams with member counts", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/teams",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.teams).toBeDefined();
    expect(Array.isArray(body.teams)).toBe(true);
    // Default team should exist
    const defaultTeam = body.teams.find((t: { name: string }) => t.name === "Default");
    expect(defaultTeam).toBeDefined();
    expect(typeof defaultTeam.memberCount).toBe("number");
    expect(defaultTeam.memberCount).toBeGreaterThanOrEqual(1);
    expect(typeof defaultTeam.createdAt).toBe("string");
    expect(defaultTeam.id).toBeDefined();
  });

  it("requires authentication", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/teams",
    });
    expect(res.statusCode).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/v1/teams
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/v1/teams", () => {
  beforeEach(() => resetTeams());

  it("creates a team", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Engineering" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBeDefined();
    expect(body.name).toBe("Engineering");
  });

  it("requires admin", async () => {
    // Register a non-admin user
    const regRes = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: "teamuser1", password: "TestPass1", role: "user" },
    });
    expect(regRes.statusCode).toBe(201);

    // Login as non-admin
    // First clear mustChangePassword
    const userId = JSON.parse(regRes.body).id;
    await db
      .update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.id, userId));

    const loginRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "teamuser1", password: "TestPass1" },
    });
    const userToken = JSON.parse(loginRes.body).token;

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: "ShouldFail" },
    });
    expect(res.statusCode).toBe(403);

    // Cleanup
    await db.delete(schema.users).where(eq(schema.users.id, userId));
  });

  it("concurrent duplicate creates return one 201 and one 409, never 500", async () => {
    // Issue #927: requests that pass the duplicate pre-check before the
    // winner's insert commits used to surface the 23505 unique violation
    // as a 500. raceInserts holds both requests at the insert so each one
    // passes the pre-check. Mixed-case twins are the next test's job.
    const create = () =>
      app.inject({
        method: "POST",
        url: "/api/v1/teams",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: "Race Condition" },
      });

    const results = await raceInserts("teams", 2, () => Promise.all([create(), create()]));
    const statuses = results.map((r) => r.statusCode).sort();
    expect(statuses).toEqual([201, 409]);

    const conflict = results.find((r) => r.statusCode === 409);
    expect(JSON.parse(conflict?.body ?? "{}")).toEqual({
      error: "Team name already exists",
      code: "CONFLICT",
    });

    const rows = await db
      .select()
      .from(schema.teams)
      .where(eq(schema.teams.name, "Race Condition"));
    expect(rows).toHaveLength(1);
  });

  it("concurrent mixed-case twins get one 201 and one 409, never two teams", async () => {
    // Issue #970: the pre-check compares LOWER(name), but the exact-case
    // unique constraint can't see a mixed-case twin, so "CaseTwin" and
    // "casetwin" racing past the pre-check both landed. The lower(name)
    // unique index makes the loser's insert conflict instead.
    const create = (name: string) =>
      app.inject({
        method: "POST",
        url: "/api/v1/teams",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name },
      });

    const results = await raceInserts("teams", 2, () =>
      Promise.all([create("CaseTwin"), create("casetwin")]),
    );
    const statuses = results.map((r) => r.statusCode).sort();
    expect(statuses).toEqual([201, 409]);

    const conflict = results.find((r) => r.statusCode === 409);
    expect(JSON.parse(conflict?.body ?? "{}")).toEqual({
      error: "Team name already exists",
      code: "CONFLICT",
    });

    const rows = await db
      .select()
      .from(schema.teams)
      .where(sql`LOWER(${schema.teams.name}) = 'casetwin'`);
    expect(rows).toHaveLength(1);
  });

  it("teams carries exactly the unique constraints the create guard assumes", async () => {
    // The POST insert uses an unqualified onConflictDoNothing and maps every
    // conflict to "Team name already exists". That's only honest while the
    // unique surface is the primary key (a fresh UUID) plus the two name
    // constraints. If this test fails, a new unique constraint joined the
    // table: give the insert guard an explicit story for it before widening
    // this list.
    const res = await db.execute(
      sql`SELECT indexname FROM pg_indexes WHERE tablename = 'teams' AND indexdef ILIKE '%UNIQUE%' ORDER BY indexname`,
    );
    const names = res.rows.map((r) => (r as { indexname: string }).indexname);
    expect(names).toEqual(["teams_name_lower_unique", "teams_name_unique", "teams_pkey"]);
  });

  it("rejects duplicate names (case-insensitive)", async () => {
    // First create
    const res1 = await app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Marketing" },
    });
    expect(res1.statusCode).toBe(201);

    // Duplicate with different case
    const res2 = await app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "MARKETING" },
    });
    expect(res2.statusCode).toBe(409);
    expect(JSON.parse(res2.body).code).toBe("CONFLICT");
  });

  it("rejects empty name", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "" },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("VALIDATION_ERROR");
  });

  it("rejects whitespace-only name", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "   " },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects name longer than 50 characters", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "A".repeat(51) },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("VALIDATION_ERROR");
  });

  it("trims whitespace from name", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "  Sales  " },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).name).toBe("Sales");
  });

  it("rejects missing name field", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a misspelled field instead of creating the team with null quotas", async () => {
    // Without .strict() on createTeamSchema, Zod strips storagequota and
    // inserts the team with storageQuota: null and answers 201 (#2767).
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Ops", storagequota: 5_000_000 },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.error).toContain("storagequota");

    const [team] = await db.select().from(schema.teams).where(eq(schema.teams.name, "Ops"));
    expect(team).toBeUndefined();
  });

  it.each([
    { field: "retentionHours", value: 2_147_483_648 },
    { field: "storageQuota", value: Number.MAX_SAFE_INTEGER + 1 },
    { field: "storageQuota", value: 1e19 },
  ])("rejects out-of-range $field ($value) with 400", async ({ field, value }) => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "OutOfRangeTeam", [field]: value },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("VALIDATION_ERROR");

    const [team] = await db
      .select()
      .from(schema.teams)
      .where(eq(schema.teams.name, "OutOfRangeTeam"));
    expect(team).toBeUndefined();
  });

  it("accepts maximum valid storageQuota and retentionHours on create", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "MaxQuotaTeam",
        storageQuota: Number.MAX_SAFE_INTEGER,
        retentionHours: 2_147_483_647,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.storageQuota).toBe(Number.MAX_SAFE_INTEGER);
    expect(body.retentionHours).toBe(2_147_483_647);

    const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, body.id));
    expect(team?.storageQuota).toBe(Number.MAX_SAFE_INTEGER);
    expect(team?.retentionHours).toBe(2_147_483_647);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/v1/teams/:id
// ═══════════════════════════════════════════════════════════════════════════
describe("PUT /api/v1/teams/:id", () => {
  let teamId: string;

  beforeEach(async () => {
    await resetTeams();
    // Create a team to rename
    teamId = randomUUID();
    await db.insert(schema.teams).values({ id: teamId, name: "OldName" });
  });

  it("renames a team", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/teams/${teamId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "NewName" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);

    // Verify
    const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId));
    expect(team?.name).toBe("NewName");
  });

  it("requires admin", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/teams/${teamId}`,
      payload: { name: "Hacked" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects duplicate names", async () => {
    // Try to rename to "Default" which already exists
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/teams/${teamId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Default" },
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe("CONFLICT");
  });

  it("allows renaming to same name (case-exact)", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/teams/${teamId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "OldName" },
    });
    // Should succeed — same team, same name
    expect(res.statusCode).toBe(200);
  });

  it("returns 404 for non-existent team", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/teams/${randomUUID()}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Whatever" },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe("NOT_FOUND");
  });

  it.each([
    { label: "rename", payload: { name: "Renamed" } },
    { label: "quota and retention update", payload: { storageQuota: 1024, retentionHours: 24 } },
  ])(
    "returns 404 when a team is deleted between the pre-checks and UPDATE on $label (#3159)",
    async ({ payload }) => {
      const res = await raceRowLocks(
        "teams",
        1,
        () =>
          app.inject({
            method: "PUT",
            url: `/api/v1/teams/${teamId}`,
            headers: { authorization: `Bearer ${adminToken}` },
            payload,
          }),
        (tx) => tx.delete(schema.teams).where(eq(schema.teams.id, teamId)),
      );

      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body)).toEqual({
        error: "Team not found",
        code: "NOT_FOUND",
      });

      const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId));
      expect(team).toBeUndefined();
    },
  );

  it("concurrent renames onto one name return one 200 and one 409, never 500", async () => {
    // Issue #968: both renames pass the duplicate pre-check before either
    // UPDATE commits; the loser used to surface the 23505 as a 500.
    // raceUpdates parks both UPDATEs so each pre-check sees no conflict.
    const otherId = randomUUID();
    await db.insert(schema.teams).values({ id: otherId, name: "OtherName" });

    const rename = (id: string) =>
      app.inject({
        method: "PUT",
        url: `/api/v1/teams/${id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: "RenameTarget" },
      });

    const results = await raceUpdates("teams", 2, () =>
      Promise.all([rename(teamId), rename(otherId)]),
    );
    const statuses = results.map((r) => r.statusCode).sort();
    expect(statuses).toEqual([200, 409]);

    const conflict = results.find((r) => r.statusCode === 409);
    expect(JSON.parse(conflict?.body ?? "{}")).toEqual({
      error: "Team name already exists",
      code: "CONFLICT",
    });

    const rows = await db.select().from(schema.teams).where(eq(schema.teams.name, "RenameTarget"));
    expect(rows).toHaveLength(1);
  });

  it("rejects empty name", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/teams/${teamId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an empty body instead of reporting a no-op save", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/teams/${teamId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("VALIDATION_ERROR");
  });

  it("rejects a misspelled field and names it", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/teams/${teamId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { storagequota: 5_000_000 },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain("storagequota");
  });

  it("rejects a misspelled field even when a valid one is present", async () => {
    // Zod strips unknown keys before any refine runs, so without .strict() this
    // body would rename the team, drop the quota and answer 200 (#2005).
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/teams/${teamId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Renamed Anyway", storagequota: 5_000_000 },
    });
    expect(res.statusCode).toBe(400);

    const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId));
    expect(team?.name).toBe("OldName");
  });

  it("updates storage quota alone and reads the value back", async () => {
    const quotaBytes = 100 * 1024 * 1024; // 100 MB
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/teams/${teamId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { storageQuota: quotaBytes },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);

    // Verify via GET /api/v1/teams
    const listRes = await app.inject({
      method: "GET",
      url: "/api/v1/teams",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    const updatedTeam = JSON.parse(listRes.body).teams.find((t: { id: string }) => t.id === teamId);
    expect(updatedTeam).toBeDefined();
    expect(updatedTeam.name).toBe("OldName");
    expect(updatedTeam.storageQuota).toBe(quotaBytes);
    expect(updatedTeam.retentionHours).toBeNull();
  });

  it("updates retention hours alone and reads the value back", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/teams/${teamId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { retentionHours: 48 },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);

    const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId));
    expect(team?.name).toBe("OldName");
    expect(team?.retentionHours).toBe(48);
  });

  it("updates both storage quota and retention hours together without name", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/teams/${teamId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { storageQuota: 50 * 1024 * 1024, retentionHours: 72 },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);

    const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId));
    expect(team?.name).toBe("OldName");
    expect(team?.storageQuota).toBe(50 * 1024 * 1024);
    expect(team?.retentionHours).toBe(72);
  });

  it("clears storage quota and retention hours when set to null", async () => {
    // First set values
    await db
      .update(schema.teams)
      .set({ storageQuota: 1024, retentionHours: 24 })
      .where(eq(schema.teams.id, teamId));

    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/teams/${teamId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { storageQuota: null, retentionHours: null },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);

    const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId));
    expect(team?.storageQuota).toBeNull();
    expect(team?.retentionHours).toBeNull();
  });

  it.each([
    { field: "retentionHours", value: 2_147_483_648 },
    { field: "storageQuota", value: Number.MAX_SAFE_INTEGER + 1 },
    { field: "storageQuota", value: 1e19 },
  ])("rejects out-of-range $field ($value) with 400", async ({ field, value }) => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/teams/${teamId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { [field]: value },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("VALIDATION_ERROR");

    const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId));
    expect(team?.storageQuota).toBeNull();
    expect(team?.retentionHours).toBeNull();
  });

  it("accepts maximum valid storageQuota and retentionHours on update", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/teams/${teamId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        storageQuota: Number.MAX_SAFE_INTEGER,
        retentionHours: 2_147_483_647,
      },
    });
    expect(res.statusCode).toBe(200);

    const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId));
    expect(team?.storageQuota).toBe(Number.MAX_SAFE_INTEGER);
    expect(team?.retentionHours).toBe(2_147_483_647);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/v1/teams/:id
// ═══════════════════════════════════════════════════════════════════════════
describe("DELETE /api/v1/teams/:id", () => {
  let defaultTeamId: string;

  beforeEach(async () => {
    defaultTeamId = await resetTeams();
  });

  it("deletes an empty team", async () => {
    const teamId = randomUUID();
    await db.insert(schema.teams).values({ id: teamId, name: "ToDelete" });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/teams/${teamId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);

    // Verify it's gone
    const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId));
    expect(team).toBeUndefined();
  });

  it("rejects deleting a team with members", async () => {
    const teamId = randomUUID();
    await db.insert(schema.teams).values({ id: teamId, name: "HasMembers" });

    // Assign a user to this team
    const userId = randomUUID();
    await db.insert(schema.users).values({
      id: userId,
      username: "memberuser",
      passwordHash: "dummy:hash",
      role: "user",
      team: teamId,
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/teams/${teamId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/members/i);

    // Cleanup
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await db.delete(schema.teams).where(eq(schema.teams.id, teamId));
  });

  it("rejects deleting the Default team", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/teams/${defaultTeamId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/default/i);
  });

  it("requires admin", async () => {
    const teamId = randomUUID();
    await db.insert(schema.teams).values({ id: teamId, name: "NoAuth" });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/teams/${teamId}`,
    });
    expect(res.statusCode).toBe(401);

    // Cleanup
    await db.delete(schema.teams).where(eq(schema.teams.id, teamId));
  });

  it("returns 404 for non-existent team", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/teams/${randomUUID()}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe("NOT_FOUND");
  });

  it("serializes DELETE /api/v1/teams/:id with PUT /api/auth/users/:id so a member assignment is never orphaned (#2662)", async () => {
    const putTeamId = randomUUID();
    await db.insert(schema.teams).values({ id: putTeamId, name: "DesignPut" });

    const userId = randomUUID();
    await db.insert(schema.users).values({
      id: userId,
      username: `design-member-${Date.now()}`,
      passwordHash: "dummy:hash",
      role: "user",
      team: defaultTeamId,
    });

    try {
      const [assignRes, deletePutRes] = await raceRowLocks("users", 2, async () => {
        const assigning = app.inject({
          method: "PUT",
          url: `/api/auth/users/${userId}`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { team: putTeamId },
        });
        await waitForLockWaiters(1);
        const deleting = app.inject({
          method: "DELETE",
          url: `/api/v1/teams/${putTeamId}`,
          headers: { authorization: `Bearer ${adminToken}` },
        });
        return Promise.all([assigning, deleting]);
      });

      expect(assignRes.statusCode).toBe(200);
      expect(deletePutRes.statusCode).toBe(400);
      expect(JSON.parse(deletePutRes.body)).toEqual({
        error: "Cannot delete a team that has members",
        code: "VALIDATION_ERROR",
      });

      const [putTeam] = await db.select().from(schema.teams).where(eq(schema.teams.id, putTeamId));
      expect(putTeam).toBeDefined();
      const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
      expect(user?.team).toBe(putTeamId);
    } finally {
      await db.delete(schema.users).where(eq(schema.users.id, userId));
      await db.delete(schema.teams).where(eq(schema.teams.id, putTeamId));
    }
  });

  it("serializes DELETE /api/v1/teams/:id with POST /api/auth/register so a newly registered member is never orphaned (#2662)", async () => {
    const regTeamId = randomUUID();
    await db.insert(schema.teams).values({ id: regTeamId, name: "DesignReg" });
    const regUsername = `design-reg-${Date.now()}`;

    try {
      const [registerRes, deleteRegRes] = await raceRowLocks("users", 2, async () => {
        const registering = app.inject({
          method: "POST",
          url: "/api/auth/register",
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            username: regUsername,
            password: "ValidPass1",
            role: "user",
            team: "DesignReg",
          },
        });
        await waitForLockWaiters(1);
        const deleting = app.inject({
          method: "DELETE",
          url: `/api/v1/teams/${regTeamId}`,
          headers: { authorization: `Bearer ${adminToken}` },
        });
        return Promise.all([registering, deleting]);
      });

      expect(registerRes.statusCode).toBe(201);
      expect(deleteRegRes.statusCode).toBe(400);
      expect(JSON.parse(deleteRegRes.body)).toEqual({
        error: "Cannot delete a team that has members",
        code: "VALIDATION_ERROR",
      });

      const [regTeam] = await db.select().from(schema.teams).where(eq(schema.teams.id, regTeamId));
      expect(regTeam).toBeDefined();
      const [regUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.username, regUsername));
      expect(regUser?.team).toBe(regTeamId);
    } finally {
      await db.delete(schema.users).where(eq(schema.users.username, regUsername));
      await db.delete(schema.teams).where(eq(schema.teams.id, regTeamId));
    }
  });

  it("rejects deleting a team renamed to Default before the row lock is acquired (#2662)", async () => {
    const teamId = randomUUID();
    await db.insert(schema.teams).values({ id: teamId, name: "Design" });
    await db
      .update(schema.teams)
      .set({ name: "OriginalDefault" })
      .where(eq(schema.teams.id, defaultTeamId));

    try {
      const res = await raceRowLocks(
        "teams",
        1,
        () =>
          app.inject({
            method: "DELETE",
            url: `/api/v1/teams/${teamId}`,
            headers: { authorization: `Bearer ${adminToken}` },
          }),
        (tx) => tx.update(schema.teams).set({ name: "Default" }).where(eq(schema.teams.id, teamId)),
      );

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toEqual({
        error: "Cannot delete the Default team",
        code: "VALIDATION_ERROR",
      });

      const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId));
      expect(team?.name).toBe("Default");
    } finally {
      await db.delete(schema.teams).where(eq(schema.teams.id, teamId));
      await db
        .update(schema.teams)
        .set({ name: "Default" })
        .where(eq(schema.teams.id, defaultTeamId));
    }
  });

  it("returns 404 when a team is deleted before the row lock is acquired (#2662)", async () => {
    const teamId = randomUUID();
    await db.insert(schema.teams).values({ id: teamId, name: "ConcurrentDelete" });

    const results = await raceRowLocks("teams", 2, () =>
      Promise.all([
        app.inject({
          method: "DELETE",
          url: `/api/v1/teams/${teamId}`,
          headers: { authorization: `Bearer ${adminToken}` },
        }),
        app.inject({
          method: "DELETE",
          url: `/api/v1/teams/${teamId}`,
          headers: { authorization: `Bearer ${adminToken}` },
        }),
      ]),
    );

    const statuses = results.map((r) => r.statusCode).sort();
    expect(statuses).toEqual([200, 404]);
    const notFound = results.find((r) => r.statusCode === 404);
    expect(JSON.parse(notFound?.body ?? "{}")).toEqual({
      error: "Team not found",
      code: "NOT_FOUND",
    });
  });
});
