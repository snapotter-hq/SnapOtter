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
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

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

  it("rejects empty name", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/teams/${teamId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "" },
    });
    expect(res.statusCode).toBe(400);
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
});
