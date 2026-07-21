import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("GDPR data export", () => {
  it("returns 403 for POST without enterprise license", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/users/some-id/export",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("enterprise");
  });

  it("returns 403 for GET without enterprise license", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/users/some-id/export/some-job-id",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("enterprise");
  });

  it("returns 401 for POST without auth", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/users/some-id/export",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 for GET without auth", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/users/some-id/export/some-job-id",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 for DELETE purge without auth", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/users/some-id/purge",
      payload: { confirm: true },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 for non-admin user", async () => {
    // Create a regular user
    await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: "gdprexportuser",
        password: "TestPass1",
        role: "user",
      },
    });
    await db
      .update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, "gdprexportuser"));

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "gdprexportuser", password: "TestPass1" },
    });
    const userToken = JSON.parse(loginRes.body).token;

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/users/some-id/export",
      headers: { authorization: `Bearer ${userToken}` },
    });
    // Regular users lack compliance:manage, so they get 403 before the enterprise check
    expect(res.statusCode).toBe(403);
  });
});

describe("GDPR data purge", () => {
  it("returns 403 without enterprise license for user purge", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/users/some-id/purge",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { confirm: true },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("enterprise");
  });

  it("returns 403 without enterprise license for team purge", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/teams/some-id/purge",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { confirm: true },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("enterprise");
  });

  it("requires confirmation body for purge", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/users/some-id/purge",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    // Should fail validation (400 or 403 depending on feature check order)
    expect([400, 403]).toContain(res.statusCode);
  });

  it("rejects purge with confirm: false", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/users/some-id/purge",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { confirm: false },
    });
    expect([400, 403]).toContain(res.statusCode);
  });

  it("returns 401 for user purge without auth", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/users/some-id/purge",
      payload: { confirm: true },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 for team purge without auth", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/teams/some-id/purge",
      payload: { confirm: true },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("GDPR export additional validation", () => {
  it("returns 401 for POST export with invalid token", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/users/some-id/export",
      headers: { authorization: "Bearer invalid-token-value" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 for GET export status with invalid token", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/users/some-id/export/some-job-id",
      headers: { authorization: "Bearer invalid-token-value" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("GDPR purge body validation", () => {
  it("rejects purge with confirm as string instead of boolean", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/users/some-id/purge",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { confirm: "true" },
    });
    expect([400, 403]).toContain(res.statusCode);
  });

  it("rejects purge with confirm: null", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/users/some-id/purge",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { confirm: null },
    });
    expect([400, 403]).toContain(res.statusCode);
  });

  it("rejects purge with no body at all", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/users/some-id/purge",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect([400, 403]).toContain(res.statusCode);
  });

  it("returns 403 for non-existent user ID without enterprise license", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/users/00000000-0000-0000-0000-000000000000/purge",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { confirm: true },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("enterprise");
  });
});

describe("GDPR edge cases", () => {
  it("sequential purge requests for same user return consistent results", async () => {
    const first = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/users/some-id/purge",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { confirm: true },
    });
    const second = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/users/some-id/purge",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { confirm: true },
    });
    expect(first.statusCode).toBe(second.statusCode);
    expect(first.statusCode).toBe(403);
  });

  it("export initiation rejects GET method", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/users/some-id/export",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("purge endpoint rejects POST method", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/users/some-id/purge",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { confirm: true },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("GDPR purge role hierarchy", () => {
  let licensedApp: TestApp;
  let licensedAdminToken: string;
  let complianceManagerToken: string;
  let complianceRoleId: string;
  let complianceManagerId: string;
  let targetSequence = 0;

  beforeAll(async () => {
    vi.resetModules();
    const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
    mockEnterpriseFeatures(["gdpr_lifecycle"]);
    const { buildTestApp, loginAsAdmin } = await import("../test-server.js");
    licensedApp = await buildTestApp();
    licensedAdminToken = await loginAsAdmin(licensedApp.app);

    const suffix = Date.now().toString(36);
    const roleName = `compliance-${suffix}`;
    const username = `compliance-manager-${suffix}`;
    const roleRes = await licensedApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${licensedAdminToken}` },
      payload: { name: roleName, permissions: ["compliance:manage"] },
    });
    if (roleRes.statusCode !== 201) {
      throw new Error(`Failed to create compliance manager role: ${roleRes.body}`);
    }
    complianceRoleId = JSON.parse(roleRes.body).id as string;

    const registerRes = await licensedApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${licensedAdminToken}` },
      payload: { username, password: "TestPass1", role: roleName },
    });
    if (registerRes.statusCode !== 201) {
      throw new Error(`Failed to create compliance manager user: ${registerRes.body}`);
    }
    complianceManagerId = JSON.parse(registerRes.body).id as string;
    await db
      .update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.id, complianceManagerId));

    const loginRes = await licensedApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password: "TestPass1" },
    });
    complianceManagerToken = JSON.parse(loginRes.body).token as string;
  }, 30_000);

  afterAll(async () => {
    if (complianceManagerId) {
      await db.delete(schema.users).where(eq(schema.users.id, complianceManagerId));
    }
    if (complianceRoleId) {
      await db.delete(schema.roles).where(eq(schema.roles.id, complianceRoleId));
    }
    await licensedApp.cleanup();
    vi.restoreAllMocks();
  }, 10_000);

  async function createTarget(role: string, teamId?: string): Promise<string> {
    targetSequence += 1;
    const username = `gdpr-target-${role}-${Date.now().toString(36)}-${targetSequence}`;
    const registerRes = await licensedApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${licensedAdminToken}` },
      payload: { username, password: "TargetPass1", role },
    });
    if (registerRes.statusCode !== 201) {
      throw new Error(`Failed to create GDPR target user: ${registerRes.body}`);
    }
    const id = JSON.parse(registerRes.body).id as string;
    await db
      .update(schema.users)
      .set({
        mustChangePassword: false,
        ...(teamId ? { team: teamId } : {}),
      })
      .where(eq(schema.users.id, id));
    return id;
  }

  it("denies direct purge of a disabled administrator and preserves the account", async () => {
    const targetId = await createTarget("admin");
    await db
      .update(schema.users)
      .set({ role: "disabled:admin" })
      .where(eq(schema.users.id, targetId));

    try {
      const res = await licensedApp.app.inject({
        method: "DELETE",
        url: `/api/v1/enterprise/users/${targetId}/purge`,
        headers: { authorization: `Bearer ${complianceManagerToken}` },
        payload: { confirm: true },
      });
      const body = JSON.parse(res.body);
      const [remainingTarget] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, targetId));

      expect.soft(res.statusCode).toBe(403);
      expect.soft(body.code).toBe("ESCALATION_DENIED");
      expect(remainingTarget?.role).toBe("disabled:admin");
    } finally {
      await db.delete(schema.users).where(eq(schema.users.id, targetId));
    }
  });

  it("preflights a mixed team and preserves subordinate members when a disabled admin is denied", async () => {
    const teamId = randomUUID();
    await db.insert(schema.teams).values({
      id: teamId,
      name: `GDPR hierarchy ${Date.now().toString(36)}`,
    });
    const subordinateId = await createTarget("user", teamId);
    const disabledAdminId = await createTarget("admin", teamId);
    await db
      .update(schema.users)
      .set({ role: "disabled:admin" })
      .where(eq(schema.users.id, disabledAdminId));

    try {
      const res = await licensedApp.app.inject({
        method: "DELETE",
        url: `/api/v1/enterprise/teams/${teamId}/purge`,
        headers: { authorization: `Bearer ${complianceManagerToken}` },
        payload: { confirm: true },
      });
      const body = JSON.parse(res.body);
      const [remainingSubordinate] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, subordinateId));
      const [remainingDisabledAdmin] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, disabledAdminId));
      const [remainingTeam] = await db
        .select()
        .from(schema.teams)
        .where(eq(schema.teams.id, teamId));

      expect.soft(res.statusCode).toBe(403);
      expect.soft(body.code).toBe("ESCALATION_DENIED");
      expect.soft(remainingSubordinate?.role).toBe("user");
      expect.soft(remainingDisabledAdmin?.role).toBe("disabled:admin");
      expect(remainingTeam?.id).toBe(teamId);
    } finally {
      await db.delete(schema.users).where(eq(schema.users.id, subordinateId));
      await db.delete(schema.users).where(eq(schema.users.id, disabledAdminId));
      await db.delete(schema.teams).where(eq(schema.teams.id, teamId));
    }
  });

  it("allows the full built-in admin to purge a subordinate team", async () => {
    const teamId = randomUUID();
    await db.insert(schema.teams).values({
      id: teamId,
      name: `GDPR subordinate ${Date.now().toString(36)}`,
    });
    const targetId = await createTarget("user", teamId);

    try {
      const res = await licensedApp.app.inject({
        method: "DELETE",
        url: `/api/v1/enterprise/teams/${teamId}/purge`,
        headers: { authorization: `Bearer ${licensedAdminToken}` },
        payload: { confirm: true },
      });
      const [remainingTarget] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, targetId));
      const [remainingTeam] = await db
        .select()
        .from(schema.teams)
        .where(eq(schema.teams.id, teamId));

      expect(res.statusCode).toBe(200);
      expect(remainingTarget).toBeUndefined();
      expect(remainingTeam).toBeUndefined();
    } finally {
      await db.delete(schema.users).where(eq(schema.users.id, targetId));
      await db.delete(schema.teams).where(eq(schema.teams.id, teamId));
    }
  });
});
