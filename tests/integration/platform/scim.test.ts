import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { hashPassword, verifyPassword } from "../../../apps/api/src/plugins/auth.js";
import { raceInserts, raceUpdates } from "../../helpers/pg-race.js";
import { buildTestApp, type TestApp } from "../test-server.js";

let testApp: TestApp;
const SCIM_TOKEN = `so_scim_v2_${"a".repeat(64)}`;
const ADMIN_PERMISSIONS = [
  "tools:use",
  "files:own",
  "files:all",
  "apikeys:own",
  "apikeys:all",
  "pipelines:own",
  "pipelines:all",
  "settings:read",
  "settings:write",
  "users:manage",
  "teams:manage",
  "features:manage",
  "system:health",
  "audit:read",
  "compliance:manage",
  "webhooks:manage",
  "security:manage",
];

beforeAll(async () => {
  testApp = await buildTestApp();

  // Set up a SCIM token hash in the settings table
  const tokenHash = await hashPassword(SCIM_TOKEN);
  await db
    .insert(schema.settings)
    .values({ key: "scim_token_hash", value: tokenHash })
    .onConflictDoNothing();
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("SCIM 2.0 provisioning", () => {
  // ── Discovery (no auth required) ───────────────────────────────

  describe("discovery endpoints", () => {
    it("returns ServiceProviderConfig", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/ServiceProviderConfig",
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.schemas).toContain("urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig");
      expect(body.patch.supported).toBe(true);
      expect(body.filter.supported).toBe(true);
    });

    it("returns Schemas", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Schemas",
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.totalResults).toBe(2);
      expect(body.Resources).toHaveLength(2);
      const schemaIds = body.Resources.map((r: { id: string }) => r.id);
      expect(schemaIds).toContain("urn:ietf:params:scim:schemas:core:2.0:User");
      expect(schemaIds).toContain("urn:ietf:params:scim:schemas:core:2.0:Group");
    });

    it("returns ResourceTypes", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/ResourceTypes",
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.totalResults).toBe(2);
      const names = body.Resources.map((r: { name: string }) => r.name);
      expect(names).toContain("User");
      expect(names).toContain("Group");
    });

    it("ServiceProviderConfig includes correct maxResults", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/ServiceProviderConfig",
      });
      const body = JSON.parse(res.body);
      expect(body.filter.maxResults).toBe(200);
    });

    it("Schemas response has correct User schema attributes", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Schemas",
      });
      const body = JSON.parse(res.body);
      const userSchema = body.Resources.find(
        (r: { id: string }) => r.id === "urn:ietf:params:scim:schemas:core:2.0:User",
      );
      expect(userSchema).toBeDefined();
      const attrNames = userSchema.attributes.map((a: { name: string }) => a.name);
      expect(attrNames).toContain("userName");
      expect(attrNames).toContain("name");
      expect(attrNames).toContain("emails");
      expect(attrNames).toContain("active");
      expect(attrNames).toContain("externalId");
    });

    it("Schemas response has correct Group schema attributes", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Schemas",
      });
      const body = JSON.parse(res.body);
      const groupSchema = body.Resources.find(
        (r: { id: string }) => r.id === "urn:ietf:params:scim:schemas:core:2.0:Group",
      );
      expect(groupSchema).toBeDefined();
      const attrNames = groupSchema.attributes.map((a: { name: string }) => a.name);
      expect(attrNames).toContain("displayName");
      expect(attrNames).toContain("members");
    });

    it("ResourceTypes have correct endpoints", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/ResourceTypes",
      });
      const body = JSON.parse(res.body);
      const userType = body.Resources.find((r: { name: string }) => r.name === "User");
      const groupType = body.Resources.find((r: { name: string }) => r.name === "Group");
      expect(userType.endpoint).toBe("/api/v1/scim/v2/Users");
      expect(groupType.endpoint).toBe("/api/v1/scim/v2/Groups");
    });
  });

  // ── Auth ───────────────────────────────────────────────────────

  describe("SCIM auth", () => {
    it("returns 401 for user operations without token", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
      });
      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.schemas).toContain("urn:ietf:params:scim:api:messages:2.0:Error");
    });

    it("returns 401 with invalid token", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
        headers: { authorization: "Bearer wrong-token" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 401 for group operations without token", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Groups",
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects Bearer token with extra whitespace", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
        headers: { authorization: `Bearer  ${SCIM_TOKEN}` },
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects lowercase bearer prefix", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
        headers: { authorization: `bearer ${SCIM_TOKEN}` },
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects empty Bearer token value", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
        headers: { authorization: "Bearer " },
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects a correctly hashed legacy unversioned token", async () => {
      const legacyToken = "b".repeat(64);
      const legacyHash = await hashPassword(legacyToken);
      await db
        .insert(schema.settings)
        .values({ key: "scim_token_hash", value: legacyHash })
        .onConflictDoUpdate({
          target: schema.settings.key,
          set: { value: legacyHash },
        });

      try {
        const res = await testApp.app.inject({
          method: "GET",
          url: "/api/v1/scim/v2/Users",
          headers: { authorization: `Bearer ${legacyToken}` },
        });

        expect(res.statusCode).toBe(401);
        expect(JSON.parse(res.body)).toMatchObject({
          status: 401,
          detail: "Invalid token",
        });
      } finally {
        const currentHash = await hashPassword(SCIM_TOKEN);
        await db
          .update(schema.settings)
          .set({ value: currentHash })
          .where(eq(schema.settings.key, "scim_token_hash"));
      }
    });
  });

  // ── Enterprise gate ────────────────────────────────────────────
  // Without a valid enterprise license, SCIM operations return 403.

  describe("enterprise feature gate", () => {
    it("returns 403 for Users list without enterprise license", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
        headers: { authorization: `Bearer ${SCIM_TOKEN}` },
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.detail).toContain("enterprise");
    });

    it("returns 403 for Groups list without enterprise license", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Groups",
        headers: { authorization: `Bearer ${SCIM_TOKEN}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 403 for POST Users without enterprise license", async () => {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Users",
        headers: { authorization: `Bearer ${SCIM_TOKEN}` },
        payload: { userName: "scim-test-user", active: true },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 403 for POST Groups without enterprise license", async () => {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Groups",
        headers: { authorization: `Bearer ${SCIM_TOKEN}` },
        payload: { displayName: "scim-test-group" },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ── SCIM error format ──────────────────────────────────────────

  describe("SCIM error format", () => {
    it("returns proper SCIM error schema on 401", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
        headers: { authorization: "Bearer bad" },
      });
      const body = JSON.parse(res.body);
      expect(body.schemas).toEqual(["urn:ietf:params:scim:api:messages:2.0:Error"]);
      expect(body.status).toBe(401);
      expect(typeof body.detail).toBe("string");
    });

    it("403 enterprise error includes SCIM error schema", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
        headers: { authorization: `Bearer ${SCIM_TOKEN}` },
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.schemas).toEqual(["urn:ietf:params:scim:api:messages:2.0:Error"]);
      expect(body.status).toBe(403);
      expect(typeof body.detail).toBe("string");
    });

    it("SCIM error responses include schemas, status, and detail fields", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
      });
      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("schemas");
      expect(body).toHaveProperty("status");
      expect(body).toHaveProperty("detail");
      expect(Array.isArray(body.schemas)).toBe(true);
      expect(typeof body.status).toBe("number");
      expect(typeof body.detail).toBe("string");
    });

    it("POST Users with missing userName returns 403 from enterprise gate", async () => {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Users",
        headers: { authorization: `Bearer ${SCIM_TOKEN}` },
        payload: { active: true },
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.schemas).toContain("urn:ietf:params:scim:api:messages:2.0:Error");
    });
  });

  describe("POST Users validation (enterprise gate)", () => {
    it("POST with empty body returns 403", async () => {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Users",
        headers: { authorization: `Bearer ${SCIM_TOKEN}` },
        payload: {},
      });
      expect(res.statusCode).toBe(403);
    });

    it("POST with numeric userName returns 403", async () => {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Users",
        headers: { authorization: `Bearer ${SCIM_TOKEN}` },
        payload: { userName: 12345 },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("POST Groups validation (enterprise gate)", () => {
    it("POST with empty displayName returns 403", async () => {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Groups",
        headers: { authorization: `Bearer ${SCIM_TOKEN}` },
        payload: { displayName: "" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("POST with very long displayName returns 403", async () => {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Groups",
        headers: { authorization: `Bearer ${SCIM_TOKEN}` },
        payload: { displayName: "x".repeat(10000) },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});

describe("SCIM global token administration", () => {
  let licensedApp: TestApp;
  let licensedAdminToken: string;
  let managerToken: string;
  let managerRoleId: string;
  let managerUserId: string;
  let scopedAdminKey: string;

  beforeAll(async () => {
    vi.resetModules();
    const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
    mockEnterpriseFeatures(["scim"]);
    const { buildTestApp, loginAsAdmin } = await import("../test-server.js");
    licensedApp = await buildTestApp();
    licensedAdminToken = await loginAsAdmin(licensedApp.app);

    const suffix = Date.now().toString(36);
    const roleName = `scim-manager-${suffix}`;
    const username = `scim-manager-user-${suffix}`;
    const roleRes = await licensedApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${licensedAdminToken}` },
      payload: { name: roleName, permissions: ADMIN_PERMISSIONS },
    });
    if (roleRes.statusCode !== 201) {
      throw new Error(`Failed to create SCIM manager role: ${roleRes.body}`);
    }
    managerRoleId = JSON.parse(roleRes.body).id as string;

    const registerRes = await licensedApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${licensedAdminToken}` },
      payload: { username, password: "TestPass1", role: roleName },
    });
    if (registerRes.statusCode !== 201) {
      throw new Error(`Failed to create SCIM manager user: ${registerRes.body}`);
    }
    managerUserId = JSON.parse(registerRes.body).id as string;
    await db
      .update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.id, managerUserId));

    const loginRes = await licensedApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password: "TestPass1" },
    });
    managerToken = JSON.parse(loginRes.body).token as string;

    const apiKeyRes = await licensedApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${licensedAdminToken}` },
      payload: {
        name: `scim-scoped-admin-${suffix}`,
        permissions: ["users:manage", "apikeys:own"],
      },
    });
    if (apiKeyRes.statusCode !== 201) {
      throw new Error(`Failed to create scoped admin API key: ${apiKeyRes.body}`);
    }
    scopedAdminKey = JSON.parse(apiKeyRes.body).key as string;
  }, 30_000);

  afterAll(async () => {
    await db.delete(schema.settings).where(eq(schema.settings.key, "scim_token_hash"));
    if (managerUserId) {
      await db.delete(schema.users).where(eq(schema.users.id, managerUserId));
    }
    if (managerRoleId) {
      await db.delete(schema.roles).where(eq(schema.roles.id, managerRoleId));
    }
    await licensedApp.cleanup();
    vi.restoreAllMocks();
  }, 10_000);

  it("denies token issuance to a custom role even when it has every admin permission", async () => {
    const originalHash = "scim-issuance-authorization-sentinel";
    await db
      .insert(schema.settings)
      .values({ key: "scim_token_hash", value: originalHash })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: originalHash },
      });

    const res = await licensedApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/scim/token",
      headers: { authorization: `Bearer ${managerToken}` },
    });
    const body = JSON.parse(res.body);
    const [storedToken] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "scim_token_hash"));

    expect.soft(res.statusCode).toBe(403);
    expect.soft(body.code).toBe("ESCALATION_DENIED");
    expect(storedToken?.value).toBe(originalHash);
  });

  it("denies token revocation to a custom role even when it has every admin permission", async () => {
    const originalHash = "scim-revocation-authorization-sentinel";
    await db
      .insert(schema.settings)
      .values({ key: "scim_token_hash", value: originalHash })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: originalHash },
      });

    const res = await licensedApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/scim/token",
      headers: { authorization: `Bearer ${managerToken}` },
    });
    const body = res.body ? JSON.parse(res.body) : {};
    const [storedToken] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "scim_token_hash"));

    expect.soft(res.statusCode).toBe(403);
    expect.soft(body.code).toBe("ESCALATION_DENIED");
    expect(storedToken?.value).toBe(originalHash);
  });

  it("prevents a settings manager from replacing the global SCIM credential", async () => {
    const attackerToken = `so_scim_v2_${"b".repeat(64)}`;
    const originalHash = await hashPassword(SCIM_TOKEN);
    const attackerHash = await hashPassword(attackerToken);
    await db
      .insert(schema.settings)
      .values({ key: "scim_token_hash", value: originalHash })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: originalHash },
      });

    try {
      const settingsRes = await licensedApp.app.inject({
        method: "PUT",
        url: "/api/v1/settings",
        headers: { authorization: `Bearer ${managerToken}` },
        payload: { scim_token_hash: attackerHash },
      });
      const [storedToken] = await db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, "scim_token_hash"));
      const scimRes = await licensedApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
        headers: { authorization: `Bearer ${attackerToken}` },
      });

      expect.soft(settingsRes.statusCode).toBe(400);
      expect.soft(JSON.parse(settingsRes.body).code).toBe("READONLY_SETTING");
      expect.soft(storedToken?.value).toBe(originalHash);
      expect(scimRes.statusCode).toBe(401);
    } finally {
      await db
        .update(schema.settings)
        .set({ value: originalHash })
        .where(eq(schema.settings.key, "scim_token_hash"));
    }
  });

  it.each([
    { method: "POST" as const, operation: "issuance" },
    { method: "DELETE" as const, operation: "revocation" },
  ])("denies token $operation through a scoped built-in admin API key", async ({ method }) => {
    const originalHash = `scim-scoped-key-${method.toLowerCase()}-sentinel`;
    await db
      .insert(schema.settings)
      .values({ key: "scim_token_hash", value: originalHash })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: originalHash },
      });

    const res = await licensedApp.app.inject({
      method,
      url: "/api/v1/enterprise/scim/token",
      headers: { authorization: `Bearer ${scopedAdminKey}` },
    });
    const [storedToken] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "scim_token_hash"));

    expect.soft(res.statusCode).toBe(403);
    expect.soft(JSON.parse(res.body).code).toBe("ESCALATION_DENIED");
    expect(storedToken?.value).toBe(originalHash);
  });

  it("issues a versioned token that authenticates an end-to-end SCIM request", async () => {
    await db.delete(schema.settings).where(eq(schema.settings.key, "scim_token_hash"));

    const res = await licensedApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/scim/token",
      headers: { authorization: `Bearer ${licensedAdminToken}` },
    });
    const body = JSON.parse(res.body) as { token: string };
    const [storedToken] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "scim_token_hash"));

    expect(res.statusCode).toBe(201);
    expect(body.token).toMatch(/^so_scim_v2_[0-9a-f]{64}$/);
    if (!storedToken) throw new Error("SCIM token hash was not persisted");
    expect(await verifyPassword(body.token, storedToken.value)).toBe(true);

    const listRes = await licensedApp.app.inject({
      method: "GET",
      url: "/api/v1/scim/v2/Users",
      headers: { authorization: `Bearer ${body.token}` },
    });
    expect(listRes.statusCode, listRes.body).toBe(200);
    expect(JSON.parse(listRes.body).Resources).toBeInstanceOf(Array);
  });

  it("allows the full built-in admin to revoke a token", async () => {
    const tokenHash = await hashPassword(SCIM_TOKEN);
    await db
      .insert(schema.settings)
      .values({ key: "scim_token_hash", value: tokenHash })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: tokenHash },
      });

    const res = await licensedApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/scim/token",
      headers: { authorization: `Bearer ${licensedAdminToken}` },
    });
    const [storedToken] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "scim_token_hash"));

    expect(res.statusCode).toBe(204);
    expect(storedToken).toBeUndefined();
  });

  it("keeps repeated user deprovisioning idempotent and recoverable", async () => {
    const tokenHash = await hashPassword(SCIM_TOKEN);
    await db
      .insert(schema.settings)
      .values({ key: "scim_token_hash", value: tokenHash })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: tokenHash },
      });

    const username = `scim-repeat-delete-${Date.now().toString(36)}`;
    const createResponse = await licensedApp.app.inject({
      method: "POST",
      url: "/api/v1/scim/v2/Users",
      headers: { authorization: `Bearer ${SCIM_TOKEN}` },
      payload: { userName: username, active: true },
    });
    expect(createResponse.statusCode, createResponse.body).toBe(201);
    const userId = JSON.parse(createResponse.body).id as string;

    const firstDelete = await licensedApp.app.inject({
      method: "DELETE",
      url: `/api/v1/scim/v2/Users/${userId}`,
      headers: { authorization: `Bearer ${SCIM_TOKEN}` },
    });
    const [afterFirstDelete] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId));

    const secondDelete = await licensedApp.app.inject({
      method: "DELETE",
      url: `/api/v1/scim/v2/Users/${userId}`,
      headers: { authorization: `Bearer ${SCIM_TOKEN}` },
    });
    const [afterSecondDelete] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId));

    expect.soft(firstDelete.statusCode).toBe(204);
    expect.soft(secondDelete.statusCode).toBe(204);
    expect.soft(afterFirstDelete?.role).toBe("disabled:user");
    expect.soft(afterSecondDelete?.role).toBe("disabled:user");

    const reactivateResponse = await licensedApp.app.inject({
      method: "PUT",
      url: `/api/v1/scim/v2/Users/${userId}`,
      headers: { authorization: `Bearer ${SCIM_TOKEN}` },
      payload: { userName: username, active: true },
    });
    const [reactivated] = await db.select().from(schema.users).where(eq(schema.users.id, userId));

    expect.soft(reactivateResponse.statusCode, reactivateResponse.body).toBe(200);
    expect.soft(JSON.parse(reactivateResponse.body).active).toBe(true);
    expect(reactivated?.role).toBe("user");
  });

  it("canonicalizes persisted nested disabled markers during deactivation and activation", async () => {
    const tokenHash = await hashPassword(SCIM_TOKEN);
    await db
      .insert(schema.settings)
      .values({ key: "scim_token_hash", value: tokenHash })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: tokenHash },
      });

    const username = `scim-nested-disabled-${Date.now().toString(36)}`;
    const createResponse = await licensedApp.app.inject({
      method: "POST",
      url: "/api/v1/scim/v2/Users",
      headers: { authorization: `Bearer ${SCIM_TOKEN}` },
      payload: { userName: username, active: true },
    });
    expect(createResponse.statusCode, createResponse.body).toBe(201);
    const userId = JSON.parse(createResponse.body).id as string;

    await db
      .update(schema.users)
      .set({ role: "disabled:disabled:disabled:user" })
      .where(eq(schema.users.id, userId));
    const deleteResponse = await licensedApp.app.inject({
      method: "DELETE",
      url: `/api/v1/scim/v2/Users/${userId}`,
      headers: { authorization: `Bearer ${SCIM_TOKEN}` },
    });
    const [afterDelete] = await db.select().from(schema.users).where(eq(schema.users.id, userId));

    expect.soft(deleteResponse.statusCode).toBe(204);
    expect.soft(afterDelete?.role).toBe("disabled:user");

    await db
      .update(schema.users)
      .set({ role: "disabled:disabled:disabled:user" })
      .where(eq(schema.users.id, userId));
    const reactivateResponse = await licensedApp.app.inject({
      method: "PUT",
      url: `/api/v1/scim/v2/Users/${userId}`,
      headers: { authorization: `Bearer ${SCIM_TOKEN}` },
      payload: { userName: username, active: true },
    });
    const [afterReactivation] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId));

    expect.soft(reactivateResponse.statusCode, reactivateResponse.body).toBe(200);
    expect.soft(JSON.parse(reactivateResponse.body).active).toBe(true);
    expect(afterReactivation?.role).toBe("user");
  });

  it.each([
    {
      method: "PUT" as const,
      payload: { userName: "admin", active: false },
    },
    {
      method: "PATCH" as const,
      payload: {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        Operations: [{ op: "Replace", path: "active", value: false }],
      },
    },
    {
      method: "PATCH" as const,
      payload: {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        Operations: [{ op: "Replace", value: { active: false } }],
      },
    },
    // A cased path or key deactivates now (#1731), so it has to meet the
    // last-admin check too, not slip past it.
    {
      method: "PATCH" as const,
      payload: {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        Operations: [{ op: "Replace", path: "Active", value: "False" }],
      },
    },
    {
      method: "PATCH" as const,
      payload: {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        Operations: [{ op: "Replace", value: { Active: false } }],
      },
    },
    {
      method: "DELETE" as const,
      payload: undefined,
    },
  ])("$method refuses to deactivate the last active administrator", async ({ method, payload }) => {
    const [adminBefore] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, "admin"));
    if (!adminBefore) throw new Error("Default administrator is missing");

    const activeAdmins = (await db.select().from(schema.users)).filter(
      (candidate) => candidate.role === "admin",
    );
    expect(activeAdmins).toHaveLength(1);

    const tokenHash = await hashPassword(SCIM_TOKEN);
    await db
      .insert(schema.settings)
      .values({ key: "scim_token_hash", value: tokenHash })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: tokenHash },
      });

    try {
      const res = await licensedApp.app.inject({
        method,
        url: `/api/v1/scim/v2/Users/${adminBefore.id}`,
        headers: { authorization: `Bearer ${SCIM_TOKEN}` },
        ...(payload === undefined ? {} : { payload }),
      });
      const [adminAfter] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, adminBefore.id));

      expect.soft(res.statusCode).toBe(409);
      // Not a uniqueness conflict, so no scimType (issue #1509).
      expect.soft(JSON.parse(res.body)).toEqual({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        status: 409,
        detail: "Cannot deactivate the last active administrator",
      });
      expect.soft(adminAfter?.role).toBe("admin");
      expect(adminAfter?.passwordHash).toBe(adminBefore.passwordHash);
    } finally {
      await db
        .update(schema.users)
        .set({ role: "admin", passwordHash: adminBefore.passwordHash })
        .where(eq(schema.users.id, adminBefore.id));
    }
  });
});

// ── Licensed Users + Groups CRUD ─────────────────────────────────────
// Same enterprise-mock pattern as the block above: reset the module
// registry, mock @snapotter/enterprise with the scim feature, and build a
// fresh app so the route-level dynamic import sees the licensed package.

describe("SCIM licensed Users and Groups CRUD", () => {
  const DEFAULT_TEAM_ID = "default-team-00000000";
  const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";
  let crudApp: TestApp;
  // The vi.resetModules() in beforeAll gives crudApp a fresh config module,
  // so MAX_USERS tests must mutate THAT env instance, not a top-level import.
  let crudEnv: typeof import("../../../apps/api/src/config.js").env;
  let crudSeq = 0;

  function uniqueName(prefix: string): string {
    crudSeq += 1;
    return `${prefix}-${Date.now().toString(36)}-${crudSeq}`;
  }

  function authHeaders(): Record<string, string> {
    return { authorization: `Bearer ${SCIM_TOKEN}` };
  }

  async function createScimUser(
    payload: Record<string, unknown>,
  ): Promise<{ id: string; userName: string }> {
    const res = await crudApp.app.inject({
      method: "POST",
      url: "/api/v1/scim/v2/Users",
      headers: authHeaders(),
      payload,
    });
    if (res.statusCode !== 201) {
      throw new Error(`SCIM user create failed (${res.statusCode}): ${res.body}`);
    }
    const body = JSON.parse(res.body) as { id: string; userName: string };
    return { id: body.id, userName: body.userName };
  }

  async function createScimGroup(
    payload: Record<string, unknown>,
  ): Promise<{ id: string; displayName: string }> {
    const res = await crudApp.app.inject({
      method: "POST",
      url: "/api/v1/scim/v2/Groups",
      headers: authHeaders(),
      payload,
    });
    if (res.statusCode !== 201) {
      throw new Error(`SCIM group create failed (${res.statusCode}): ${res.body}`);
    }
    const body = JSON.parse(res.body) as { id: string; displayName: string };
    return { id: body.id, displayName: body.displayName };
  }

  async function userRow(id: string) {
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return row;
  }

  beforeAll(async () => {
    vi.resetModules();
    const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
    mockEnterpriseFeatures(["scim"]);
    const { buildTestApp: buildLicensedApp } = await import("../test-server.js");
    crudApp = await buildLicensedApp();
    crudEnv = (await import("../../../apps/api/src/config.js")).env;

    const tokenHash = await hashPassword(SCIM_TOKEN);
    await db
      .insert(schema.settings)
      .values({ key: "scim_token_hash", value: tokenHash })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: tokenHash },
      });
  }, 30_000);

  afterAll(async () => {
    await db.delete(schema.settings).where(eq(schema.settings.key, "scim_token_hash"));
    await crudApp.cleanup();
    vi.restoreAllMocks();
  }, 10_000);

  describe("Users create and read", () => {
    it("creates a user with primary email, externalId, and the Default team", async () => {
      const username = uniqueName("scim-create-full");
      const res = await crudApp.app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Users",
        headers: authHeaders(),
        payload: {
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
          userName: username,
          externalId: "ext-create-full",
          emails: [
            { value: "secondary@example.com" },
            { value: "primary@example.com", primary: true },
          ],
        },
      });

      expect(res.statusCode, res.body).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.schemas).toEqual(["urn:ietf:params:scim:schemas:core:2.0:User"]);
      expect(body.userName).toBe(username);
      expect(body.externalId).toBe("ext-create-full");
      expect(body.active).toBe(true);
      expect(body.emails).toEqual([{ value: "primary@example.com", primary: true }]);
      expect(body.groups).toEqual([{ value: DEFAULT_TEAM_ID, display: "Default" }]);
      expect(body.meta.resourceType).toBe("User");
      expect(typeof body.meta.created).toBe("string");

      const row = await userRow(body.id);
      expect(row?.username).toBe(username);
      expect(row?.email).toBe("primary@example.com");
      expect(row?.scimExternalId).toBe("ext-create-full");
      expect(row?.role).toBe("user");
      expect(row?.team).toBe(DEFAULT_TEAM_ID);
      expect(row?.authProvider).toBe("scim");
    });

    it("refuses a second create carrying an already-provisioned externalId with the SCIM 409 envelope", async () => {
      // Issues #969 and #1510: only the SCIM externalId index stops an IdP
      // retry under a fresh userName from minting a second account for one
      // identity. The insert guard is unqualified so that refusal lands as
      // the pre-check's 409 rather than a 500.
      const externalId = uniqueName("scim-dup-ext");
      const first = await createScimUser({ userName: uniqueName("scim-dup-a"), externalId });

      const res = await crudApp.app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Users",
        headers: authHeaders(),
        payload: { userName: uniqueName("scim-dup-b"), externalId },
      });

      expect(res.statusCode, res.body).toBe(409);
      expect(JSON.parse(res.body)).toEqual({
        schemas: [SCIM_ERROR_SCHEMA],
        status: 409,
        detail: "User already exists",
        scimType: "uniqueness",
      });
      const rows = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.scimExternalId, externalId));
      expect(rows.map((r) => r.id)).toEqual([first.id]);
    });

    it("stores a blank externalId as NULL so blank creates don't collide on the identity index", async () => {
      // Issue #1008: "" is not NULL, so the externalId unique index treated
      // every blank externalId as one shared identity and refused the second
      // create with a 409.
      const ids: string[] = [];
      for (const externalId of ["", "   "]) {
        const res = await crudApp.app.inject({
          method: "POST",
          url: "/api/v1/scim/v2/Users",
          headers: authHeaders(),
          payload: { userName: uniqueName("scim-blank-ext"), externalId },
        });
        expect(res.statusCode, res.body).toBe(201);
        const body = JSON.parse(res.body);
        expect(body).not.toHaveProperty("externalId");
        ids.push(body.id);
      }
      // A third blank create after the whitespace one still has to succeed.
      ids.push(
        (await createScimUser({ userName: uniqueName("scim-blank-ext"), externalId: "" })).id,
      );

      for (const id of ids) {
        expect((await userRow(id))?.scimExternalId).toBeNull();
      }
    });

    it("stores a padded non-blank externalId verbatim so the eq filter still finds it", async () => {
      const externalId = ` ${uniqueName("scim-pad-ext")} `;
      const { id } = await createScimUser({ userName: uniqueName("scim-pad"), externalId });

      expect((await userRow(id))?.scimExternalId).toBe(externalId);
      const res = await crudApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
        headers: authHeaders(),
        query: { filter: `externalId eq "${externalId}"` },
      });
      expect(res.statusCode, res.body).toBe(200);
      expect(JSON.parse(res.body).Resources.map((r: { id: string }) => r.id)).toEqual([id]);
    });

    it("creates a disabled user when active is false and falls back to the first email", async () => {
      const username = uniqueName("scim-create-inactive");
      const res = await crudApp.app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Users",
        headers: authHeaders(),
        payload: {
          userName: username,
          active: false,
          emails: [{ value: "first@example.com" }, { value: "second@example.com" }],
        },
      });

      expect(res.statusCode, res.body).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.active).toBe(false);
      expect(body.emails).toEqual([{ value: "first@example.com", primary: true }]);
      expect(body).not.toHaveProperty("externalId");

      const row = await userRow(body.id);
      expect(row?.role).toBe("disabled");
      expect(row?.email).toBe("first@example.com");
      expect(row?.passwordHash).toBeNull();
    });

    it("rejects creation without a userName using the SCIM 400 envelope", async () => {
      const res = await crudApp.app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Users",
        headers: authHeaders(),
        payload: { emails: [{ value: "nobody@example.com" }] },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toMatchObject({
        schemas: [SCIM_ERROR_SCHEMA],
        status: 400,
        detail: "userName is required",
      });
    });

    it("concurrent duplicate creates return one 201 and one SCIM 409, never 500", async () => {
      // Issue #927: IdP provisioning retries can race. Requests that pass
      // the duplicate pre-check before the winner's insert commits used to
      // surface the 23505 unique violation as a 500. raceInserts holds both
      // requests at the insert so each one passes the pre-check.
      const userName = uniqueName("scim-create-race");
      const create = () =>
        crudApp.app.inject({
          method: "POST",
          url: "/api/v1/scim/v2/Users",
          headers: authHeaders(),
          payload: { userName },
        });

      const results = await raceInserts("users", 2, () => Promise.all([create(), create()]));
      const statuses = results.map((r) => r.statusCode).sort();
      expect(statuses).toEqual([201, 409]);

      const conflict = results.find((r) => r.statusCode === 409);
      expect(JSON.parse(conflict?.body ?? "{}")).toEqual({
        schemas: [SCIM_ERROR_SCHEMA],
        status: 409,
        detail: "User already exists",
        scimType: "uniqueness",
      });

      const rows = await db.select().from(schema.users).where(eq(schema.users.username, userName));
      expect(rows).toHaveLength(1);
    });

    it("rejects a duplicate userName with the SCIM 409 envelope", async () => {
      const { userName } = await createScimUser({ userName: uniqueName("scim-create-dup") });
      const res = await crudApp.app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Users",
        headers: authHeaders(),
        payload: { userName },
      });

      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body)).toEqual({
        schemas: [SCIM_ERROR_SCHEMA],
        status: 409,
        detail: "User already exists",
        scimType: "uniqueness",
      });
    });

    it("returns a single user by id", async () => {
      const { id, userName } = await createScimUser({
        userName: uniqueName("scim-get-one"),
        emails: [{ value: "get-one@example.com", primary: true }],
      });

      const res = await crudApp.app.inject({
        method: "GET",
        url: `/api/v1/scim/v2/Users/${id}`,
        headers: authHeaders(),
      });

      expect(res.statusCode, res.body).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(id);
      expect(body.userName).toBe(userName);
      expect(body.active).toBe(true);
      expect(body.emails).toEqual([{ value: "get-one@example.com", primary: true }]);
      expect(body.groups).toEqual([{ value: DEFAULT_TEAM_ID, display: "Default" }]);
      expect(body.meta.resourceType).toBe("User");
    });

    it("returns the SCIM 404 envelope for unknown user ids on every method", async () => {
      const missing = "scim-user-does-not-exist";

      const getRes = await crudApp.app.inject({
        method: "GET",
        url: `/api/v1/scim/v2/Users/${missing}`,
        headers: authHeaders(),
      });
      expect(getRes.statusCode).toBe(404);
      expect(JSON.parse(getRes.body)).toMatchObject({
        schemas: [SCIM_ERROR_SCHEMA],
        status: 404,
        detail: "User not found",
      });

      const putRes = await crudApp.app.inject({
        method: "PUT",
        url: `/api/v1/scim/v2/Users/${missing}`,
        headers: authHeaders(),
        payload: { userName: "ghost" },
      });
      expect(putRes.statusCode).toBe(404);

      const patchRes = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Users/${missing}`,
        headers: authHeaders(),
        payload: { Operations: [{ op: "replace", path: "active", value: false }] },
      });
      expect(patchRes.statusCode).toBe(404);

      const deleteRes = await crudApp.app.inject({
        method: "DELETE",
        url: `/api/v1/scim/v2/Users/${missing}`,
        headers: authHeaders(),
      });
      expect(deleteRes.statusCode).toBe(404);
      expect(JSON.parse(deleteRes.body).detail).toBe("User not found");
    });
  });

  describe("Users list filtering and pagination", () => {
    it("filters by userName eq", async () => {
      const { id, userName } = await createScimUser({ userName: uniqueName("scim-filter-un") });

      const res = await crudApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
        headers: authHeaders(),
        query: { filter: `userName eq "${userName}"` },
      });

      expect(res.statusCode, res.body).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.schemas).toEqual(["urn:ietf:params:scim:api:messages:2.0:ListResponse"]);
      expect(body.totalResults).toBe(1);
      expect(body.itemsPerPage).toBe(1);
      expect(body.Resources).toHaveLength(1);
      expect(body.Resources[0].id).toBe(id);
      expect(body.Resources[0].userName).toBe(userName);
    });

    it("filters by externalId eq", async () => {
      const externalId = uniqueName("scim-filter-ext");
      const { id } = await createScimUser({
        userName: uniqueName("scim-filter-ext-user"),
        externalId,
      });

      const res = await crudApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
        headers: authHeaders(),
        query: { filter: `externalId eq "${externalId}"` },
      });

      expect(res.statusCode, res.body).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.totalResults).toBe(1);
      expect(body.Resources[0].id).toBe(id);
      expect(body.Resources[0].externalId).toBe(externalId);
    });

    it("rejects unsupported filter attributes and malformed filter syntax", async () => {
      const badAttribute = await crudApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
        headers: authHeaders(),
        query: { filter: 'emails eq "someone@example.com"' },
      });
      expect(badAttribute.statusCode).toBe(400);
      expect(JSON.parse(badAttribute.body)).toMatchObject({
        schemas: [SCIM_ERROR_SCHEMA],
        status: 400,
        detail: "Unsupported filter attribute: emails",
      });

      const badSyntax = await crudApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
        headers: authHeaders(),
        query: { filter: 'userName co "partial"' },
      });
      expect(badSyntax.statusCode).toBe(400);
      expect(JSON.parse(badSyntax.body).detail).toBe("Unsupported filter syntax");
    });

    it("pages results with startIndex and count", async () => {
      await createScimUser({ userName: uniqueName("scim-page-a") });
      await createScimUser({ userName: uniqueName("scim-page-b") });
      await createScimUser({ userName: uniqueName("scim-page-c") });

      const firstPage = await crudApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
        headers: authHeaders(),
        query: { startIndex: "1", count: "2" },
      });
      expect(firstPage.statusCode, firstPage.body).toBe(200);
      const firstBody = JSON.parse(firstPage.body);
      expect(firstBody.startIndex).toBe(1);
      expect(firstBody.itemsPerPage).toBe(2);
      expect(firstBody.Resources).toHaveLength(2);
      expect(firstBody.totalResults).toBeGreaterThanOrEqual(3);

      const beyondEnd = await crudApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
        headers: authHeaders(),
        query: { startIndex: "999999", count: "5" },
      });
      expect(beyondEnd.statusCode).toBe(200);
      const beyondBody = JSON.parse(beyondEnd.body);
      expect(beyondBody.startIndex).toBe(999999);
      expect(beyondBody.itemsPerPage).toBe(0);
      expect(beyondBody.Resources).toEqual([]);

      const clamped = await crudApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
        headers: authHeaders(),
        query: { count: "0" },
      });
      expect(clamped.statusCode).toBe(200);
      expect(JSON.parse(clamped.body).itemsPerPage).toBe(1);
    });
  });

  describe("Users PUT", () => {
    it("rejects a rename onto an existing userName with 409 and leaves the row unchanged", async () => {
      const target = await createScimUser({ userName: uniqueName("scim-put-taken") });
      const victim = await createScimUser({ userName: uniqueName("scim-put-victim") });

      const res = await crudApp.app.inject({
        method: "PUT",
        url: `/api/v1/scim/v2/Users/${victim.id}`,
        headers: authHeaders(),
        payload: { userName: target.userName, active: true },
      });

      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body)).toEqual({
        schemas: [SCIM_ERROR_SCHEMA],
        status: 409,
        detail: "userName already taken",
        scimType: "uniqueness",
      });
      const row = await userRow(victim.id);
      expect(row?.username).toBe(victim.userName);
    });

    it("concurrent renames onto one userName return one 200 and one SCIM 409, never 500", async () => {
      // Issue #968: both renames pass the conflict pre-check before either
      // UPDATE commits; the loser used to surface the 23505 as a 500.
      const a = await createScimUser({ userName: uniqueName("scim-put-race-a") });
      const b = await createScimUser({ userName: uniqueName("scim-put-race-b") });
      const target = uniqueName("scim-put-race-target");

      const rename = (id: string) =>
        crudApp.app.inject({
          method: "PUT",
          url: `/api/v1/scim/v2/Users/${id}`,
          headers: authHeaders(),
          payload: { userName: target, active: true },
        });

      const results = await raceUpdates("users", 2, () =>
        Promise.all([rename(a.id), rename(b.id)]),
      );
      const statuses = results.map((r) => r.statusCode).sort();
      expect(statuses).toEqual([200, 409]);

      const conflict = results.find((r) => r.statusCode === 409);
      expect(JSON.parse(conflict?.body ?? "{}")).toEqual({
        schemas: [SCIM_ERROR_SCHEMA],
        status: 409,
        detail: "userName already taken",
        scimType: "uniqueness",
      });

      const rows = await db.select().from(schema.users).where(eq(schema.users.username, target));
      expect(rows).toHaveLength(1);
    });

    it("rejects an externalId another user holds with a uniqueness 409 naming externalId", async () => {
      // Issue #1006: the externalId unique index turns this into a 23505,
      // which used to come back as "userName already taken".
      const externalId = uniqueName("scim-put-ext-taken");
      await createScimUser({ userName: uniqueName("scim-put-ext-holder"), externalId });
      const victim = await createScimUser({ userName: uniqueName("scim-put-ext-victim") });

      const res = await crudApp.app.inject({
        method: "PUT",
        url: `/api/v1/scim/v2/Users/${victim.id}`,
        headers: authHeaders(),
        payload: { userName: victim.userName, externalId, active: true },
      });

      expect(res.statusCode, res.body).toBe(409);
      expect(JSON.parse(res.body)).toEqual({
        schemas: [SCIM_ERROR_SCHEMA],
        status: 409,
        scimType: "uniqueness",
        detail: "externalId already assigned to another user",
      });
      const row = await userRow(victim.id);
      expect(row?.scimExternalId).toBeNull();
    });

    it("a deactivation that 409s keeps the user's sessions and role", async () => {
      // Issue #1508: sessions were deleted before the UPDATE, so a 409 left
      // the user logged out but still active.
      const externalId = uniqueName("scim-put-deact-ext");
      await createScimUser({ userName: uniqueName("scim-put-deact-holder"), externalId });
      const victim = await createScimUser({ userName: uniqueName("scim-put-deact-victim") });
      await db.insert(schema.sessions).values({
        id: randomUUID(),
        userId: victim.id,
        expiresAt: new Date(Date.now() + 3_600_000),
      });

      const res = await crudApp.app.inject({
        method: "PUT",
        url: `/api/v1/scim/v2/Users/${victim.id}`,
        headers: authHeaders(),
        payload: { userName: victim.userName, externalId, active: false },
      });

      // The detail proves the 409 came from the identity index at the UPDATE,
      // not the last-admin guard or the userName pre-check.
      expect(res.statusCode, res.body).toBe(409);
      expect(JSON.parse(res.body).detail).toBe("externalId already assigned to another user");
      const row = await userRow(victim.id);
      expect(row?.role).toBe("user");
      const sessions = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, victim.id));
      expect(sessions).toHaveLength(1);
    });

    it("replaces userName, externalId, and primary email", async () => {
      const { id } = await createScimUser({ userName: uniqueName("scim-put-src") });
      const renamed = uniqueName("scim-put-renamed");

      const res = await crudApp.app.inject({
        method: "PUT",
        url: `/api/v1/scim/v2/Users/${id}`,
        headers: authHeaders(),
        payload: {
          userName: renamed,
          externalId: "put-ext-1",
          active: true,
          emails: [
            { value: "put-secondary@example.com" },
            { value: "put-primary@example.com", primary: true },
          ],
        },
      });

      expect(res.statusCode, res.body).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.userName).toBe(renamed);
      expect(body.externalId).toBe("put-ext-1");
      expect(body.emails).toEqual([{ value: "put-primary@example.com", primary: true }]);

      const row = await userRow(id);
      expect(row?.username).toBe(renamed);
      expect(row?.scimExternalId).toBe("put-ext-1");
      expect(row?.email).toBe("put-primary@example.com");
    });

    it("clears externalId to NULL when PUT sends a blank one, for more than one user", async () => {
      // Issue #1008: a stored "" held the identity index, so the second user
      // to receive a blank externalId collided with the first.
      const a = await createScimUser({
        userName: uniqueName("scim-put-blank-a"),
        externalId: uniqueName("ext"),
      });
      const b = await createScimUser({
        userName: uniqueName("scim-put-blank-b"),
        externalId: uniqueName("ext"),
      });

      for (const [user, externalId] of [
        [a, ""],
        [b, ""],
      ] as const) {
        const res = await crudApp.app.inject({
          method: "PUT",
          url: `/api/v1/scim/v2/Users/${user.id}`,
          headers: authHeaders(),
          payload: { userName: user.userName, externalId, active: true },
        });
        expect(res.statusCode, res.body).toBe(200);
        expect(JSON.parse(res.body)).not.toHaveProperty("externalId");
        expect((await userRow(user.id))?.scimExternalId).toBeNull();
      }
    });

    it("leaves the stored externalId alone when PUT omits it", async () => {
      const externalId = uniqueName("scim-put-keep-ext");
      const { id, userName } = await createScimUser({
        userName: uniqueName("scim-put-keep"),
        externalId,
      });

      const res = await crudApp.app.inject({
        method: "PUT",
        url: `/api/v1/scim/v2/Users/${id}`,
        headers: authHeaders(),
        payload: { userName, active: true },
      });

      expect(res.statusCode, res.body).toBe(200);
      expect(JSON.parse(res.body).externalId).toBe(externalId);
      expect((await userRow(id))?.scimExternalId).toBe(externalId);
    });

    it("deactivation revokes sessions, stores a restorable role, and stays canonical", async () => {
      const { id, userName } = await createScimUser({
        userName: uniqueName("scim-put-deactivate"),
      });
      await db.insert(schema.sessions).values({
        id: randomUUID(),
        userId: id,
        expiresAt: new Date(Date.now() + 3_600_000),
      });

      const res = await crudApp.app.inject({
        method: "PUT",
        url: `/api/v1/scim/v2/Users/${id}`,
        headers: authHeaders(),
        payload: {
          userName,
          active: false,
          emails: [{ value: "no-primary-flag@example.com" }],
        },
      });
      const row = await userRow(id);
      const sessions = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, id));

      expect.soft(res.statusCode, res.body).toBe(200);
      expect.soft(JSON.parse(res.body).active).toBe(false);
      expect.soft(row?.role).toBe("disabled:user");
      expect.soft(row?.email).toBe("no-primary-flag@example.com");
      expect(sessions).toHaveLength(0);

      // A second deactivation of an already-disabled user must not nest markers.
      const again = await crudApp.app.inject({
        method: "PUT",
        url: `/api/v1/scim/v2/Users/${id}`,
        headers: authHeaders(),
        payload: { userName, active: false },
      });
      const rowAgain = await userRow(id);
      expect.soft(again.statusCode, again.body).toBe(200);
      expect(rowAgain?.role).toBe("disabled:user");
    });
  });

  describe("Users PATCH", () => {
    it("replaces userName via an explicit path", async () => {
      const { id } = await createScimUser({ userName: uniqueName("scim-patch-rename") });
      const renamed = uniqueName("scim-patch-renamed");

      const res = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Users/${id}`,
        headers: authHeaders(),
        payload: {
          schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
          Operations: [{ op: "replace", path: "userName", value: renamed }],
        },
      });

      expect(res.statusCode, res.body).toBe(200);
      expect(JSON.parse(res.body).userName).toBe(renamed);
      const row = await userRow(id);
      expect(row?.username).toBe(renamed);
    });

    it("rejects a PATCH rename onto an existing userName with the SCIM 409 envelope", async () => {
      // Issue #968: PATCH has no conflict pre-check at all, so even a
      // sequential rename onto a taken userName surfaced the 23505 as a 500.
      const target = await createScimUser({ userName: uniqueName("scim-patch-taken") });
      const victim = await createScimUser({ userName: uniqueName("scim-patch-victim") });

      const res = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Users/${victim.id}`,
        headers: authHeaders(),
        payload: {
          schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
          Operations: [{ op: "replace", path: "userName", value: target.userName }],
        },
      });

      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body)).toEqual({
        schemas: [SCIM_ERROR_SCHEMA],
        status: 409,
        detail: "userName already taken",
        scimType: "uniqueness",
      });
      const row = await userRow(victim.id);
      expect(row?.username).toBe(victim.userName);
    });

    it("concurrent PATCH renames onto one userName return one 200 and one SCIM 409", async () => {
      const a = await createScimUser({ userName: uniqueName("scim-patch-race-a") });
      const b = await createScimUser({ userName: uniqueName("scim-patch-race-b") });
      const target = uniqueName("scim-patch-race-target");

      const rename = (id: string) =>
        crudApp.app.inject({
          method: "PATCH",
          url: `/api/v1/scim/v2/Users/${id}`,
          headers: authHeaders(),
          payload: {
            schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
            Operations: [{ op: "replace", path: "userName", value: target }],
          },
        });

      const results = await raceUpdates("users", 2, () =>
        Promise.all([rename(a.id), rename(b.id)]),
      );
      const statuses = results.map((r) => r.statusCode).sort();
      expect(statuses).toEqual([200, 409]);
      const conflict = results.find((r) => r.statusCode === 409);
      expect(JSON.parse(conflict?.body ?? "{}")).toEqual({
        schemas: [SCIM_ERROR_SCHEMA],
        status: 409,
        detail: "userName already taken",
        scimType: "uniqueness",
      });

      const rows = await db.select().from(schema.users).where(eq(schema.users.username, target));
      expect(rows).toHaveLength(1);
    });

    it.each([
      ["a path replace", (value: string) => ({ op: "replace", path: "externalId", value })],
      ["a valueless replace", (value: string) => ({ op: "replace", value: { externalId: value } })],
    ])(
      "rejects an externalId another user holds via %s with a uniqueness 409",
      async (_label, op) => {
        // Issue #1006: same identity-index 23505 as the PUT case.
        const externalId = uniqueName("scim-patch-ext-taken");
        await createScimUser({ userName: uniqueName("scim-patch-ext-holder"), externalId });
        const victim = await createScimUser({ userName: uniqueName("scim-patch-ext-victim") });

        const res = await crudApp.app.inject({
          method: "PATCH",
          url: `/api/v1/scim/v2/Users/${victim.id}`,
          headers: authHeaders(),
          payload: {
            schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
            Operations: [op(externalId)],
          },
        });

        expect(res.statusCode, res.body).toBe(409);
        expect(JSON.parse(res.body)).toEqual({
          schemas: [SCIM_ERROR_SCHEMA],
          status: 409,
          scimType: "uniqueness",
          detail: "externalId already assigned to another user",
        });
        const row = await userRow(victim.id);
        expect(row?.scimExternalId).toBeNull();
      },
    );

    it.each([
      ["externalId", "externalId already assigned to another user"],
      ["userName", "userName already taken"],
    ] as const)(
      "a deactivating PATCH that 409s on %s keeps the user's sessions and role",
      async (path, detail) => {
        // Issue #1508: the session delete ran inside the operations loop,
        // before the UPDATE that then hit the unique index.
        const externalId = uniqueName("scim-patch-deact-ext");
        const holder = await createScimUser({
          userName: uniqueName("scim-patch-deact-holder"),
          externalId,
        });
        const victim = await createScimUser({ userName: uniqueName("scim-patch-deact-victim") });
        await db.insert(schema.sessions).values({
          id: randomUUID(),
          userId: victim.id,
          expiresAt: new Date(Date.now() + 3_600_000),
        });

        const res = await crudApp.app.inject({
          method: "PATCH",
          url: `/api/v1/scim/v2/Users/${victim.id}`,
          headers: authHeaders(),
          payload: {
            schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
            Operations: [
              { op: "replace", path: "active", value: false },
              { op: "replace", path, value: path === "userName" ? holder.userName : externalId },
            ],
          },
        });

        // The detail proves the 409 came from the unique index at the UPDATE,
        // not the last-admin guard or a pre-check that runs before any write.
        expect(res.statusCode, res.body).toBe(409);
        expect(JSON.parse(res.body).detail).toBe(detail);
        const row = await userRow(victim.id);
        expect(row?.role).toBe("user");
        const sessions = await db
          .select()
          .from(schema.sessions)
          .where(eq(schema.sessions.userId, victim.id));
        expect(sessions).toHaveLength(1);
      },
    );

    it("adds an externalId with a mixed-case op name", async () => {
      const { id } = await createScimUser({ userName: uniqueName("scim-patch-ext") });

      const res = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Users/${id}`,
        headers: authHeaders(),
        payload: { Operations: [{ op: "Add", path: "externalId", value: "patched-ext" }] },
      });

      expect(res.statusCode, res.body).toBe(200);
      expect(JSON.parse(res.body).externalId).toBe("patched-ext");
      const row = await userRow(id);
      expect(row?.scimExternalId).toBe("patched-ext");
    });

    it("clears externalId to NULL when a PATCH replace sends a blank one, by path or value object", async () => {
      // Issue #1008: both replace shapes wrote a blank externalId verbatim,
      // where it held a slot on the identity index like a real value.
      const a = await createScimUser({
        userName: uniqueName("scim-patch-blank-a"),
        externalId: uniqueName("ext"),
      });
      const b = await createScimUser({
        userName: uniqueName("scim-patch-blank-b"),
        externalId: uniqueName("ext"),
      });

      const byPath = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Users/${a.id}`,
        headers: authHeaders(),
        payload: { Operations: [{ op: "replace", path: "externalId", value: "" }] },
      });
      expect(byPath.statusCode, byPath.body).toBe(200);
      expect(JSON.parse(byPath.body)).not.toHaveProperty("externalId");
      expect((await userRow(a.id))?.scimExternalId).toBeNull();

      const byValue = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Users/${b.id}`,
        headers: authHeaders(),
        payload: { Operations: [{ op: "replace", value: { externalId: " " } }] },
      });
      expect(byValue.statusCode, byValue.body).toBe(200);
      expect(JSON.parse(byValue.body)).not.toHaveProperty("externalId");
      expect((await userRow(b.id))?.scimExternalId).toBeNull();
    });

    it("updates email via the emails array and the work-email value path", async () => {
      const { id } = await createScimUser({ userName: uniqueName("scim-patch-email") });

      const arrayRes = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Users/${id}`,
        headers: authHeaders(),
        payload: {
          Operations: [
            {
              op: "replace",
              path: "emails",
              value: [
                { value: "plain@example.com" },
                { value: "chosen@example.com", primary: true },
              ],
            },
          ],
        },
      });
      expect(arrayRes.statusCode, arrayRes.body).toBe(200);
      let row = await userRow(id);
      expect(row?.email).toBe("chosen@example.com");

      const workRes = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Users/${id}`,
        headers: authHeaders(),
        payload: {
          Operations: [
            { op: "replace", path: 'emails[type eq "work"].value', value: "work@example.com" },
          ],
        },
      });
      expect(workRes.statusCode, workRes.body).toBe(200);
      row = await userRow(id);
      expect(row?.email).toBe("work@example.com");
      expect(JSON.parse(workRes.body).emails).toEqual([
        { value: "work@example.com", primary: true },
      ]);
    });

    it("treats name.formatted as a no-op", async () => {
      // An unknown op used to be skipped here too. It's refused now, applying
      // nothing (#1731); see "refuses an op that isn't add, remove or replace".
      const { id, userName } = await createScimUser({ userName: uniqueName("scim-patch-noop") });

      const res = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Users/${id}`,
        headers: authHeaders(),
        payload: {
          Operations: [{ op: "replace", path: "name.formatted", value: "Display Name" }],
        },
      });

      expect(res.statusCode, res.body).toBe(200);
      expect(JSON.parse(res.body).userName).toBe(userName);
      const row = await userRow(id);
      expect(row?.username).toBe(userName);
    });

    it("applies a valueless replace with a bulk value object", async () => {
      const { id } = await createScimUser({ userName: uniqueName("scim-patch-bulk") });
      const renamed = uniqueName("scim-patch-bulk-renamed");

      const res = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Users/${id}`,
        headers: authHeaders(),
        payload: {
          Operations: [
            {
              op: "replace",
              value: {
                userName: renamed,
                externalId: "bulk-ext",
                emails: [{ value: "bulk@example.com" }],
              },
            },
          ],
        },
      });

      expect(res.statusCode, res.body).toBe(200);
      const row = await userRow(id);
      expect(row?.username).toBe(renamed);
      expect(row?.scimExternalId).toBe("bulk-ext");
      expect(row?.email).toBe("bulk@example.com");
    });

    it("deactivates via path active and reactivates via a bulk string True", async () => {
      const { id } = await createScimUser({ userName: uniqueName("scim-patch-active") });
      await db.insert(schema.sessions).values({
        id: randomUUID(),
        userId: id,
        expiresAt: new Date(Date.now() + 3_600_000),
      });

      const deactivate = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Users/${id}`,
        headers: authHeaders(),
        payload: {
          schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
          Operations: [{ op: "replace", path: "active", value: false }],
        },
      });
      const disabledRow = await userRow(id);
      const sessions = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, id));

      expect.soft(deactivate.statusCode, deactivate.body).toBe(200);
      expect.soft(JSON.parse(deactivate.body).active).toBe(false);
      expect.soft(disabledRow?.role).toBe("disabled:user");
      expect(sessions).toHaveLength(0);

      const reactivate = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Users/${id}`,
        headers: authHeaders(),
        payload: { Operations: [{ op: "replace", value: { active: "True" } }] },
      });
      const restoredRow = await userRow(id);

      expect.soft(reactivate.statusCode, reactivate.body).toBe(200);
      expect.soft(JSON.parse(reactivate.body).active).toBe(true);
      expect(restoredRow?.role).toBe("user");
    });

    it("removes externalId and emails", async () => {
      const { id } = await createScimUser({
        userName: uniqueName("scim-patch-remove"),
        externalId: "remove-me",
        emails: [{ value: "remove-me@example.com", primary: true }],
      });

      const res = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Users/${id}`,
        headers: authHeaders(),
        payload: {
          Operations: [
            { op: "remove", path: "externalId" },
            { op: "remove", path: "emails" },
          ],
        },
      });

      expect(res.statusCode, res.body).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).not.toHaveProperty("externalId");
      expect(body.emails).toEqual([]);

      const row = await userRow(id);
      expect(row?.scimExternalId).toBeNull();
      expect(row?.email).toBeNull();
    });

    it("refuses a PATCH without Operations and changes nothing", async () => {
      // RFC 7644 3.5.2 requires at least one operation. This used to answer
      // 200 having done nothing, which hid a misnamed key (#1511).
      const { id, userName } = await createScimUser({ userName: uniqueName("scim-patch-empty") });

      const res = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Users/${id}`,
        headers: authHeaders(),
        payload: {},
      });

      expect(res.statusCode, res.body).toBe(400);
      expect(JSON.parse(res.body)).toMatchObject({
        detail: "Operations is required",
        scimType: "invalidSyntax",
      });
      const row = await userRow(id);
      expect(row?.username).toBe(userName);
      expect(row?.role).toBe("user");
    });
  });

  describe("Users create user limit (issue #966)", () => {
    async function countUsers(): Promise<number> {
      const rows = await db.select().from(schema.users);
      return rows.length;
    }

    it("refuses to provision past MAX_USERS with the SCIM 403 envelope", async () => {
      const origMaxUsers = crudEnv.MAX_USERS;
      // Relies on the users table being non-empty (test-server seeds the
      // default admin); a count of 0 would mean unlimited, not a full cap.
      (crudEnv as Record<string, unknown>).MAX_USERS = await countUsers();
      try {
        const userName = uniqueName("scim-cap-full");
        const res = await crudApp.app.inject({
          method: "POST",
          url: "/api/v1/scim/v2/Users",
          headers: authHeaders(),
          payload: { userName },
        });

        expect(res.statusCode).toBe(403);
        expect(JSON.parse(res.body)).toMatchObject({
          schemas: [SCIM_ERROR_SCHEMA],
          status: 403,
          detail: `User limit reached (${crudEnv.MAX_USERS} max)`,
        });

        const rows = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.username, userName));
        expect(rows).toHaveLength(0);
      } finally {
        (crudEnv as Record<string, unknown>).MAX_USERS = origMaxUsers;
      }
    });

    it("still provisions while below the cap", async () => {
      const origMaxUsers = crudEnv.MAX_USERS;
      (crudEnv as Record<string, unknown>).MAX_USERS = (await countUsers()) + 1;
      try {
        const { id } = await createScimUser({ userName: uniqueName("scim-cap-below") });
        expect(id).toBeTruthy();
      } finally {
        (crudEnv as Record<string, unknown>).MAX_USERS = origMaxUsers;
      }
    });

    it("concurrent provisioning stops at the cap with one 201 and one 403", async () => {
      // Cap enforcement rides the shared advisory lock from issue #928, so
      // two concurrent creates with different names can't both pass the
      // count. Without the lock (or with no check at all, the #966 bug)
      // both come back 201 and the cap is exceeded.
      const origMaxUsers = crudEnv.MAX_USERS;
      const cap = (await countUsers()) + 1;
      (crudEnv as Record<string, unknown>).MAX_USERS = cap;
      try {
        const create = (userName: string) =>
          crudApp.app.inject({
            method: "POST",
            url: "/api/v1/scim/v2/Users",
            headers: authHeaders(),
            payload: { userName },
          });

        const [first, second] = await Promise.all([
          create(uniqueName("scim-cap-race-a")),
          create(uniqueName("scim-cap-race-b")),
        ]);

        const statuses = [first.statusCode, second.statusCode].sort();
        expect(statuses).toEqual([201, 403]);
        expect(await countUsers()).toBe(cap);
      } finally {
        (crudEnv as Record<string, unknown>).MAX_USERS = origMaxUsers;
      }
    });
  });

  // Issue #1510: SCIM's externalId used to share users.external_id with the
  // OIDC subject and SAML NameID, so the two identities overwrote and shadowed
  // each other. SCIM now keeps its own column.
  describe("Users externalId alongside OIDC identities (issue #1510)", () => {
    async function insertOidcUser(sub: string): Promise<{ id: string; userName: string }> {
      const id = randomUUID();
      const userName = uniqueName("scim-oidc-user");
      const now = new Date();
      await db.insert(schema.users).values({
        id,
        username: userName,
        authProvider: "oidc",
        externalId: sub,
        mustChangePassword: false,
        createdAt: now,
        updatedAt: now,
      });
      return { id, userName };
    }

    async function filterByExternalId(externalId: string) {
      const res = await crudApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
        headers: authHeaders(),
        query: { filter: `externalId eq "${externalId}"` },
      });
      expect(res.statusCode, res.body).toBe(200);
      return JSON.parse(res.body) as { totalResults: number; Resources: Array<{ id: string }> };
    }

    it("a SCIM user sharing an OIDC user's subject is the only externalId match", async () => {
      const shared = uniqueName("idp-user-id");
      await insertOidcUser(shared);
      const scimUser = await createScimUser({
        userName: uniqueName("scim-shared"),
        externalId: shared,
      });

      const body = await filterByExternalId(shared);

      expect(body.totalResults).toBe(1);
      expect(body.Resources.map((r) => r.id)).toEqual([scimUser.id]);
    });

    it("a SCIM PUT with an externalId leaves an OIDC user's sign-in subject alone", async () => {
      const sub = uniqueName("oidc-sub");
      const oidcUser = await insertOidcUser(sub);
      const scimId = uniqueName("scim-assigned");

      const res = await crudApp.app.inject({
        method: "PUT",
        url: `/api/v1/scim/v2/Users/${oidcUser.id}`,
        headers: authHeaders(),
        payload: { userName: oidcUser.userName, externalId: scimId, active: true },
      });

      expect(res.statusCode, res.body).toBe(200);
      expect(JSON.parse(res.body).externalId).toBe(scimId);
      const row = await userRow(oidcUser.id);
      expect(row?.externalId).toBe(sub);
      expect(row?.authProvider).toBe("oidc");
      expect(row?.scimExternalId).toBe(scimId);
    });

    it("a SCIM user linked by an OIDC sign-in still answers to its externalId and can be deactivated", async () => {
      const scimId = uniqueName("scim-linked");
      const email = `${uniqueName("linked")}@example.com`;
      const scimUser = await createScimUser({
        userName: uniqueName("scim-linked-user"),
        externalId: scimId,
        emails: [{ value: email, primary: true }],
      });

      // The real OIDC auto-link path: it rewrites auth_provider and
      // external_id on the row it links.
      const { resolveExternalUser } = await import(
        "../../../apps/api/src/lib/external-auth-resolver.js"
      );
      const linked = await resolveExternalUser({
        provider: "oidc",
        externalId: uniqueName("oidc-sub"),
        email,
        emailVerified: true,
        username: uniqueName("oidc-name"),
        autoCreate: false,
        autoLink: true,
        defaultRole: "user",
        logger: crudApp.app.log,
        ip: "127.0.0.1",
        requestId: "test-1510",
      });
      expect(linked.action).toBe("linked");
      expect(linked.user?.id).toBe(scimUser.id);

      const found = await filterByExternalId(scimId);
      expect(found.Resources.map((r) => r.id)).toEqual([scimUser.id]);

      const get = await crudApp.app.inject({
        method: "GET",
        url: `/api/v1/scim/v2/Users/${scimUser.id}`,
        headers: authHeaders(),
      });
      expect(JSON.parse(get.body).externalId).toBe(scimId);

      const deactivate = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Users/${scimUser.id}`,
        headers: authHeaders(),
        payload: {
          schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
          Operations: [{ op: "replace", path: "active", value: false }],
        },
      });
      expect(deactivate.statusCode, deactivate.body).toBe(200);
      expect((await userRow(scimUser.id))?.role).toBe("disabled:user");

      // The link used to free the id, so an IdP retrying the create under a
      // fresh userName minted a second account for the same person.
      const again = await crudApp.app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Users",
        headers: authHeaders(),
        payload: { userName: uniqueName("scim-linked-again"), externalId: scimId },
      });
      expect(again.statusCode, again.body).toBe(409);
      const holders = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.scimExternalId, scimId));
      expect(holders.map((u) => u.id)).toEqual([scimUser.id]);
    });

    it("a SCIM PATCH removing externalId leaves an OIDC user's sign-in subject alone", async () => {
      const sub = uniqueName("oidc-sub-remove");
      const oidcUser = await insertOidcUser(sub);

      const res = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Users/${oidcUser.id}`,
        headers: authHeaders(),
        payload: {
          schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
          Operations: [{ op: "remove", path: "externalId" }],
        },
      });

      expect(res.statusCode, res.body).toBe(200);
      const row = await userRow(oidcUser.id);
      expect(row?.externalId).toBe(sub);
      expect(row?.scimExternalId).toBeNull();
    });
  });

  describe("wrong-typed request bodies (#1511)", () => {
    // Every route cast request.body field by field, so a wrong-typed value
    // reached Postgres as JSON text, or threw a 500 partway through.
    async function send(method: "POST" | "PUT" | "PATCH", url: string, payload: unknown) {
      return crudApp.app.inject({
        method,
        url: `/api/v1/scim/v2/${url}`,
        headers: authHeaders(),
        payload: payload as Record<string, unknown>,
      });
    }

    function expectRefused(
      res: { statusCode: number; body: string },
      detail: string,
      scimType: "invalidValue" | "invalidSyntax" | "invalidPath" = "invalidValue",
    ) {
      expect(res.statusCode, res.body).toBe(400);
      expect(JSON.parse(res.body)).toEqual({
        schemas: [SCIM_ERROR_SCHEMA],
        status: 400,
        detail,
        scimType,
      });
    }

    it("Users POST refuses an object externalId and creates nobody", async () => {
      const userName = uniqueName("scim-typed-post-obj");
      const res = await send("POST", "Users", { userName, externalId: { id: 1 } });

      expectRefused(res, "externalId must be a string, got object");
      const rows = await db.select().from(schema.users).where(eq(schema.users.username, userName));
      expect(rows).toHaveLength(0);
    });

    it("Users POST stores a numeric externalId as its string", async () => {
      const res = await send("POST", "Users", {
        userName: uniqueName("scim-typed-post-num"),
        externalId: 12345,
      });

      expect(res.statusCode, res.body).toBe(201);
      expect(JSON.parse(res.body).externalId).toBe("12345");
      expect((await userRow(JSON.parse(res.body).id))?.scimExternalId).toBe("12345");
    });

    it('Users POST reads active "false" as inactive, not as a truthy string', async () => {
      const res = await send("POST", "Users", {
        userName: uniqueName("scim-typed-post-inactive"),
        active: "false",
      });

      expect(res.statusCode, res.body).toBe(201);
      expect(JSON.parse(res.body).active).toBe(false);
      expect((await userRow(JSON.parse(res.body).id))?.role).toBe("disabled");
    });

    it('Users PUT reads Entra\'s active "False" as a deactivation', async () => {
      const { id, userName } = await createScimUser({ userName: uniqueName("scim-typed-put-off") });
      const res = await send("PUT", `Users/${id}`, { userName, active: "False" });

      expect(res.statusCode, res.body).toBe(200);
      expect(JSON.parse(res.body).active).toBe(false);
      expect((await userRow(id))?.role).toBe("disabled:user");
    });

    it("Users PUT refuses emails that aren't a list and changes nothing", async () => {
      const { id, userName } = await createScimUser({ userName: uniqueName("scim-typed-put") });
      const res = await send("PUT", `Users/${id}`, {
        userName: uniqueName("scim-typed-put-renamed"),
        emails: { value: "x@example.com" },
      });

      expectRefused(res, "emails must be an array, got object");
      expect((await userRow(id))?.username).toBe(userName);
    });

    it("Users PATCH refuses an operation without an op", async () => {
      const { id } = await createScimUser({ userName: uniqueName("scim-typed-patch-op") });
      const res = await send("PATCH", `Users/${id}`, {
        Operations: [{ path: "userName", value: "x" }],
      });

      expectRefused(res, "Operations.0.op is required", "invalidSyntax");
    });

    it("Users PATCH refuses a patch with no operations instead of answering 200", async () => {
      const { id } = await createScimUser({ userName: uniqueName("scim-typed-patch-none") });
      const res = await send("PATCH", `Users/${id}`, { Operations: [] });

      expectRefused(res, "Operations must not be empty", "invalidSyntax");
    });

    it("Users PATCH applies operations sent under a lowercase key", async () => {
      const { id } = await createScimUser({ userName: uniqueName("scim-typed-patch-lower") });
      const res = await send("PATCH", `Users/${id}`, {
        operations: [{ op: "replace", path: "active", value: false }],
      });

      // Attribute names are case-insensitive (RFC 7643 2.1). This used to
      // answer 200 having dropped the deactivation.
      expect(res.statusCode, res.body).toBe(200);
      expect((await userRow(id))?.role).toBe("disabled:user");
    });

    it("Users PATCH matches a cased path, so a deactivation isn't skipped (#1731)", async () => {
      const { id } = await createScimUser({ userName: uniqueName("scim-typed-patch-cased") });
      const res = await send("PATCH", `Users/${id}`, {
        Operations: [{ op: "Replace", path: "Active", value: "False" }],
      });

      // Attribute names are case-insensitive (RFC 7643 2.1). This used to
      // answer 200 and leave the user active.
      expect(res.statusCode, res.body).toBe(200);
      expect((await userRow(id))?.role).toBe("disabled:user");
    });

    it("Users PATCH refuses an op that isn't add, remove or replace, applying nothing", async () => {
      const { id } = await createScimUser({ userName: uniqueName("scim-typed-patch-badop") });
      const res = await send("PATCH", `Users/${id}`, {
        Operations: [
          { op: "replace", path: "active", value: false },
          { op: "delete", path: "title" },
        ],
      });

      expectRefused(res, "Operations.1.op must be add, remove or replace", "invalidSyntax");
      expect((await userRow(id))?.role).toBe("user");
    });

    it("Users PATCH deactivates through a cased key in a path-less value object", async () => {
      const { id } = await createScimUser({ userName: uniqueName("scim-typed-patch-bulkcase") });
      const res = await send("PATCH", `Users/${id}`, {
        Operations: [{ op: "Replace", value: { Active: false } }],
      });

      expect(res.statusCode, res.body).toBe(200);
      expect((await userRow(id))?.role).toBe("disabled:user");
    });

    it("Users PATCH removes through cased paths, including the work-email filter", async () => {
      const { id } = await createScimUser({
        userName: uniqueName("scim-typed-patch-rm"),
        externalId: uniqueName("ext"),
        emails: [{ value: "rm@example.com", primary: true }],
      });
      const res = await send("PATCH", `Users/${id}`, {
        Operations: [
          { op: "Remove", path: "ExternalId" },
          { op: "remove", path: 'Emails[type eq "work"].value' },
        ],
      });

      expect(res.statusCode, res.body).toBe(200);
      const row = await userRow(id);
      expect(row?.scimExternalId).toBeNull();
      expect(row?.email).toBeNull();
    });

    it("Users PATCH refuses to remove userName or active, and a remove with no path", async () => {
      const { id, userName } = await createScimUser({
        userName: uniqueName("scim-typed-patch-rmbad"),
      });

      const userNameRes = await send("PATCH", `Users/${id}`, {
        Operations: [{ op: "remove", path: "userName" }],
      });
      expectRefused(userNameRes, "Operations.0: userName can't be removed");

      const noTarget = await send("PATCH", `Users/${id}`, { Operations: [{ op: "remove" }] });
      expectRefused(noTarget, "Operations.0.path is required for remove", "noTarget");

      const row = await userRow(id);
      expect(row?.username).toBe(userName);
      expect(row?.role).toBe("user");
    });

    it("Users PATCH still ignores attributes it doesn't store", async () => {
      // IdPs send attributes SnapOtter keeps no column for (title,
      // name.givenName, phoneNumbers). Refusing them would break every sync.
      const { id, userName } = await createScimUser({
        userName: uniqueName("scim-typed-patch-title"),
      });
      const res = await send("PATCH", `Users/${id}`, {
        Operations: [{ op: "replace", path: "title", value: "Engineer" }],
      });

      expect(res.statusCode, res.body).toBe(200);
      expect((await userRow(id))?.username).toBe(userName);
    });

    it("Users PATCH refuses a path-less value object with a wrong-typed field", async () => {
      const { id } = await createScimUser({ userName: uniqueName("scim-typed-patch-bulk") });
      const res = await send("PATCH", `Users/${id}`, {
        Operations: [
          { op: "replace", path: "emails", value: "bulk@example.com" },
          { op: "replace", value: { externalId: ["x"] } },
        ],
      });

      expectRefused(res, "Operations.1.value.externalId must be a string, got array");
      expect((await userRow(id))?.email).toBeNull();
    });

    it("Users PATCH refuses an object userName and applies none of the operations", async () => {
      const { id, userName } = await createScimUser({ userName: uniqueName("scim-typed-patch") });
      const res = await send("PATCH", `Users/${id}`, {
        Operations: [
          { op: "replace", path: "emails", value: "patched@example.com" },
          { op: "replace", path: "userName", value: { first: "u" } },
        ],
      });

      expectRefused(res, "Operations.1.value must be a string, got object");
      const row = await userRow(id);
      expect(row?.username).toBe(userName);
      expect(row?.email).toBeNull();
    });

    it("Groups POST refuses members that aren't a list and creates no group", async () => {
      const displayName = uniqueName("scim-typed-grp-post");
      const res = await send("POST", "Groups", { displayName, members: { value: "u1" } });

      expectRefused(res, "members must be an array, got object");
      const rows = await db.select().from(schema.teams).where(eq(schema.teams.name, displayName));
      expect(rows).toHaveLength(0);
    });

    describe("Groups PATCH operations it used to skip (#1683)", () => {
      async function members(groupId: string): Promise<string[]> {
        const rows = await db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.team, groupId));
        return rows.map((r) => r.id).sort();
      }

      it("applies a path-less replace, the way Okta renames a group, and keeps its members", async () => {
        const member = await createScimUser({ userName: uniqueName("scim-1683-okta-m") });
        const group = await createScimGroup({
          displayName: uniqueName("scim-1683-okta"),
          members: [{ value: member.id }],
        });
        const renamed = uniqueName("scim-1683-okta-renamed");
        const res = await send("PATCH", `Groups/${group.id}`, {
          Operations: [{ op: "replace", value: { id: group.id, displayName: renamed } }],
        });

        expect(res.statusCode, res.body).toBe(200);
        const [row] = await db.select().from(schema.teams).where(eq(schema.teams.id, group.id));
        expect(row?.name).toBe(renamed);
        expect(await members(group.id)).toEqual([member.id]);
      });

      it("renames on an add with path displayName", async () => {
        const group = await createScimGroup({ displayName: uniqueName("scim-1683-add-name") });
        const renamed = uniqueName("scim-1683-add-name-renamed");
        const res = await send("PATCH", `Groups/${group.id}`, {
          Operations: [{ op: "add", path: "displayName", value: renamed }],
        });

        expect(res.statusCode, res.body).toBe(200);
        const [row] = await db.select().from(schema.teams).where(eq(schema.teams.id, group.id));
        expect(row?.name).toBe(renamed);
      });

      it("refuses a remove filter it can't parse and removes nobody", async () => {
        const member = await createScimUser({ userName: uniqueName("scim-1683-filter") });
        const group = await createScimGroup({
          displayName: uniqueName("scim-1683-filter"),
          members: [{ value: member.id }],
        });
        const path = `members[display eq "${member.userName}"]`;
        const res = await send("PATCH", `Groups/${group.id}`, {
          Operations: [{ op: "remove", path }],
        });

        expectRefused(
          res,
          `Operations.0.path ${JSON.stringify(path)} isn't one SnapOtter can apply`,
          "invalidPath",
        );
        expect(await members(group.id)).toEqual([member.id]);
      });

      it("removes members sent as a list on path members, the way Entra ID does", async () => {
        const stay = await createScimUser({ userName: uniqueName("scim-1683-stay") });
        const leave = await createScimUser({ userName: uniqueName("scim-1683-leave") });
        const group = await createScimGroup({
          displayName: uniqueName("scim-1683-entra"),
          members: [{ value: stay.id }, { value: leave.id }],
        });
        const res = await send("PATCH", `Groups/${group.id}`, {
          Operations: [{ op: "Remove", path: "members", value: [{ value: leave.id }] }],
        });

        expect(res.statusCode, res.body).toBe(200);
        expect(await members(group.id)).toEqual([stay.id]);
        expect((await userRow(leave.id))?.team).toBe(DEFAULT_TEAM_ID);
      });

      it("empties the group on a remove of members with no value", async () => {
        const a = await createScimUser({ userName: uniqueName("scim-1683-all-a") });
        const group = await createScimGroup({
          displayName: uniqueName("scim-1683-all"),
          members: [{ value: a.id }],
        });
        const res = await send("PATCH", `Groups/${group.id}`, {
          Operations: [{ op: "remove", path: "members" }],
        });

        expect(res.statusCode, res.body).toBe(200);
        expect(await members(group.id)).toEqual([]);
        expect((await userRow(a.id))?.team).toBe(DEFAULT_TEAM_ID);
      });

      it("adds members through a cased path", async () => {
        const user = await createScimUser({ userName: uniqueName("scim-1683-cased") });
        const group = await createScimGroup({ displayName: uniqueName("scim-1683-cased") });
        const res = await send("PATCH", `Groups/${group.id}`, {
          Operations: [{ op: "Add", path: "Members", value: [{ value: user.id }] }],
        });

        expect(res.statusCode, res.body).toBe(200);
        expect(await members(group.id)).toEqual([user.id]);
      });

      it("refuses an unknown op and applies nothing before it", async () => {
        const user = await createScimUser({ userName: uniqueName("scim-1683-badop") });
        const group = await createScimGroup({ displayName: uniqueName("scim-1683-badop") });
        const res = await send("PATCH", `Groups/${group.id}`, {
          Operations: [
            { op: "add", path: "members", value: [{ value: user.id }] },
            { op: "merge", path: "members", value: [] },
          ],
        });

        expectRefused(res, "Operations.1.op must be add, remove or replace", "invalidSyntax");
        expect(await members(group.id)).toEqual([]);
      });

      it("reports only real members when an added id matches no user", async () => {
        const user = await createScimUser({ userName: uniqueName("scim-1683-known") });
        const group = await createScimGroup({ displayName: uniqueName("scim-1683-unknown") });
        const res = await send("PATCH", `Groups/${group.id}`, {
          Operations: [
            { op: "add", path: "members", value: [{ value: user.id }, { value: "no-such-user" }] },
          ],
        });

        // Skipped and logged rather than refused: a member deleted here but
        // still in the IdP's group would otherwise fail every sync for good.
        expect(res.statusCode, res.body).toBe(200);
        expect(JSON.parse(res.body).members.map((m: { value: string }) => m.value)).toEqual([
          user.id,
        ]);
      });
    });

    // Skips and moves used to be invisible: the audit row only had memberCount,
    // and a user in two IdP groups was moved out of the first with no trace.
    describe("Groups sync audit: skipped and moved members (#1747, #1748)", () => {
      async function lastSync(teamId: string): Promise<Record<string, unknown>> {
        const [row] = await db
          .select({ details: schema.auditLog.details })
          .from(schema.auditLog)
          .where(
            and(
              eq(schema.auditLog.action, "SCIM_GROUP_SYNCED"),
              sql`${schema.auditLog.details}->>'teamId' = ${teamId}`,
            ),
          )
          .orderBy(desc(schema.auditLog.createdAt))
          .limit(1);
        return (row?.details ?? {}) as Record<string, unknown>;
      }

      it("records member ids a PATCH skipped because they match no user", async () => {
        const user = await createScimUser({ userName: uniqueName("scim-1748-known") });
        const group = await createScimGroup({ displayName: uniqueName("scim-1748-patch") });
        const res = await send("PATCH", `Groups/${group.id}`, {
          Operations: [
            { op: "add", path: "members", value: [{ value: user.id }, { value: "no-such-user" }] },
          ],
        });

        expect(res.statusCode, res.body).toBe(200);
        const details = await lastSync(group.id);
        expect(details.action).toBe("patched");
        expect(details.skippedMembers).toEqual(["no-such-user"]);
        expect(details.skippedCount).toBe(1);
      });

      it("records skipped ids on a create and a replace too", async () => {
        const created = await send("POST", "Groups", {
          displayName: uniqueName("scim-1748-post"),
          members: [{ value: "gone-1" }],
        });
        expect(created.statusCode, created.body).toBe(201);
        const groupId = JSON.parse(created.body).id;
        expect((await lastSync(groupId)).skippedMembers).toEqual(["gone-1"]);

        const replaced = await send("PUT", `Groups/${groupId}`, {
          displayName: uniqueName("scim-1748-put"),
          members: [{ value: "gone-2" }],
        });
        expect(replaced.statusCode, replaced.body).toBe(200);
        const details = await lastSync(groupId);
        expect(details.action).toBe("replaced");
        expect(details.skippedMembers).toEqual(["gone-2"]);
      });

      it("caps the skipped list but keeps the full count", async () => {
        const group = await createScimGroup({ displayName: uniqueName("scim-1748-cap") });
        const ids = Array.from({ length: 60 }, (_, i) => ({ value: `missing-${i}` }));
        const res = await send("PATCH", `Groups/${group.id}`, {
          Operations: [{ op: "add", path: "members", value: ids }],
        });

        expect(res.statusCode, res.body).toBe(200);
        const details = await lastSync(group.id);
        expect(details.skippedMembers).toHaveLength(50);
        expect(details.skippedCount).toBe(60);
      });

      it("records a user moved out of another group, and still moves them", async () => {
        const user = await createScimUser({ userName: uniqueName("scim-1747-both") });
        const first = await createScimGroup({
          displayName: uniqueName("scim-1747-first"),
          members: [{ value: user.id }],
        });
        const second = await send("POST", "Groups", {
          displayName: uniqueName("scim-1747-second"),
          members: [{ value: user.id }],
        });

        expect(second.statusCode, second.body).toBe(201);
        const secondId = JSON.parse(second.body).id;
        // Users have one team, so the last sync still wins (the owner's call
        // on #1747); what changed is that the move is on record.
        expect((await userRow(user.id))?.team).toBe(secondId);
        const details = await lastSync(secondId);
        expect(details.movedMembers).toEqual([{ userId: user.id, fromTeam: first.id }]);
        expect(details.movedCount).toBe(1);
      });

      it("doesn't count a PATCH add of a user already in the group as a move", async () => {
        const user = await createScimUser({ userName: uniqueName("scim-1747-again") });
        const group = await createScimGroup({
          displayName: uniqueName("scim-1747-again"),
          members: [{ value: user.id }],
        });
        const res = await send("PATCH", `Groups/${group.id}`, {
          Operations: [{ op: "add", path: "members", value: [{ value: user.id }] }],
        });

        expect(res.statusCode, res.body).toBe(200);
        expect(await lastSync(group.id)).not.toHaveProperty("movedMembers");
      });

      it("doesn't record a move into a group the user was removed from in the same PATCH", async () => {
        const user = await createScimUser({ userName: uniqueName("scim-1747-addrm") });
        await createScimGroup({
          displayName: uniqueName("scim-1747-addrm-from"),
          members: [{ value: user.id }],
        });
        const group = await createScimGroup({ displayName: uniqueName("scim-1747-addrm-to") });
        const res = await send("PATCH", `Groups/${group.id}`, {
          Operations: [
            { op: "add", path: "members", value: [{ value: user.id }] },
            { op: "remove", path: `members[value eq "${user.id}"]` },
          ],
        });

        expect(res.statusCode, res.body).toBe(200);
        expect(await lastSync(group.id)).not.toHaveProperty("movedMembers");
      });

      it("records nothing for a PATCH that rolled back", async () => {
        const user = await createScimUser({ userName: uniqueName("scim-1747-rollback") });
        const first = await createScimGroup({
          displayName: uniqueName("scim-1747-rb-first"),
          members: [{ value: user.id }],
        });
        const taken = await createScimGroup({ displayName: uniqueName("scim-1747-rb-taken") });
        const group = await createScimGroup({ displayName: uniqueName("scim-1747-rb-group") });
        const before = await lastSync(group.id);
        const res = await send("PATCH", `Groups/${group.id}`, {
          Operations: [
            { op: "add", path: "members", value: [{ value: user.id }] },
            { op: "replace", path: "displayName", value: taken.displayName },
          ],
        });

        expect(res.statusCode, res.body).toBe(409);
        expect((await userRow(user.id))?.team).toBe(first.id);
        expect(await lastSync(group.id)).toEqual(before);
      });

      it("records moves on a PATCH add and a member replace", async () => {
        const user = await createScimUser({ userName: uniqueName("scim-1747-patch") });
        const first = await createScimGroup({
          displayName: uniqueName("scim-1747-p-first"),
          members: [{ value: user.id }],
        });
        const second = await createScimGroup({ displayName: uniqueName("scim-1747-p-second") });
        const added = await send("PATCH", `Groups/${second.id}`, {
          Operations: [{ op: "add", path: "members", value: [{ value: user.id }] }],
        });
        expect(added.statusCode, added.body).toBe(200);
        expect((await lastSync(second.id)).movedMembers).toEqual([
          { userId: user.id, fromTeam: first.id },
        ]);

        const replaced = await send("PATCH", `Groups/${first.id}`, {
          Operations: [{ op: "replace", path: "members", value: [{ value: user.id }] }],
        });
        expect(replaced.statusCode, replaced.body).toBe(200);
        expect((await lastSync(first.id)).movedMembers).toEqual([
          { userId: user.id, fromTeam: second.id },
        ]);
      });

      it("leaves both fields off a clean sync, including a user coming from Default", async () => {
        const user = await createScimUser({ userName: uniqueName("scim-1747-clean") });
        expect((await userRow(user.id))?.team).toBe(DEFAULT_TEAM_ID);
        const group = await createScimGroup({
          displayName: uniqueName("scim-1747-clean"),
          members: [{ value: user.id }],
        });

        const details = await lastSync(group.id);
        expect(details).not.toHaveProperty("skippedMembers");
        expect(details).not.toHaveProperty("movedMembers");
      });

      it("finds Default by name, so a resync isn't read as moves when its id isn't the seed's", async () => {
        // The seed is skipped when another team already holds the name, so the
        // team named "Default" can have any id (#1474). PUT parks members there
        // before re-adding them, and that must not read as a move.
        const seededName = uniqueName("scim-1747-seed");
        const otherDefault = `team-${randomUUID()}`;
        await db
          .update(schema.teams)
          .set({ name: seededName })
          .where(eq(schema.teams.id, DEFAULT_TEAM_ID));
        try {
          await db.insert(schema.teams).values({ id: otherDefault, name: "Default" });
          const user = await createScimUser({ userName: uniqueName("scim-1747-named") });
          const group = await createScimGroup({
            displayName: uniqueName("scim-1747-named"),
            members: [{ value: user.id }],
          });
          const res = await send("PUT", `Groups/${group.id}`, {
            displayName: group.displayName,
            members: [{ value: user.id }],
          });

          expect(res.statusCode, res.body).toBe(200);
          expect(await lastSync(group.id)).not.toHaveProperty("movedMembers");
        } finally {
          await db
            .update(schema.users)
            .set({ team: DEFAULT_TEAM_ID })
            .where(eq(schema.users.team, otherDefault));
          await db.delete(schema.teams).where(eq(schema.teams.id, otherDefault));
          await db
            .update(schema.teams)
            .set({ name: "Default" })
            .where(eq(schema.teams.id, DEFAULT_TEAM_ID));
        }
      });

      it("doesn't count re-adding a group's own member as a move", async () => {
        const user = await createScimUser({ userName: uniqueName("scim-1747-own") });
        const group = await createScimGroup({
          displayName: uniqueName("scim-1747-own"),
          members: [{ value: user.id }],
        });
        const res = await send("PUT", `Groups/${group.id}`, {
          displayName: group.displayName,
          members: [{ value: user.id }],
        });

        expect(res.statusCode, res.body).toBe(200);
        expect(await lastSync(group.id)).not.toHaveProperty("movedMembers");
      });
    });

    it("Groups PATCH refuses an object displayName", async () => {
      const group = await createScimGroup({ displayName: uniqueName("scim-typed-grp-patch") });
      const res = await send("PATCH", `Groups/${group.id}`, {
        Operations: [{ op: "replace", path: "displayName", value: { name: "g" } }],
      });

      expectRefused(res, "Operations.0.value must be a string, got object");
      const [row] = await db.select().from(schema.teams).where(eq(schema.teams.id, group.id));
      expect(row?.name).toBe(group.displayName);
    });

    it("Groups PUT refuses an object displayName and changes nothing", async () => {
      const member = await createScimUser({ userName: uniqueName("scim-typed-grp-put-m") });
      const group = await createScimGroup({
        displayName: uniqueName("scim-typed-grp-put"),
        members: [{ value: member.id }],
      });
      const res = await send("PUT", `Groups/${group.id}`, { displayName: { a: 1 }, members: [] });

      expectRefused(res, "displayName must be a string, got object");
      const [row] = await db.select().from(schema.teams).where(eq(schema.teams.id, group.id));
      expect(row?.name).toBe(group.displayName);
      expect((await userRow(member.id))?.team).toBe(group.id);
    });

    it("Groups PATCH replaces members with one sent as a single object", async () => {
      // This used to empty the group: a non-list replace was read as no members.
      const user = await createScimUser({ userName: uniqueName("scim-typed-grp-one") });
      const group = await createScimGroup({ displayName: uniqueName("scim-typed-grp-one") });
      const res = await send("PATCH", `Groups/${group.id}`, {
        Operations: [{ op: "replace", path: "members", value: { value: user.id } }],
      });

      expect(res.statusCode, res.body).toBe(200);
      expect((await userRow(user.id))?.team).toBe(group.id);
    });
  });

  describe("Groups CRUD", () => {
    it("rejects group creation without displayName", async () => {
      const res = await crudApp.app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Groups",
        headers: authHeaders(),
        payload: { members: [] },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toMatchObject({
        schemas: [SCIM_ERROR_SCHEMA],
        status: 400,
        detail: "displayName is required",
      });
    });

    it("concurrent duplicate group creates return one 201 and one SCIM 409, never 500", async () => {
      // Issue #927: same race as Users create, one insert lower. Groups
      // are teams rows, so the loser used to hit the teams.name unique
      // constraint and 500.
      const displayName = uniqueName("scim-group-race");
      const create = () =>
        crudApp.app.inject({
          method: "POST",
          url: "/api/v1/scim/v2/Groups",
          headers: authHeaders(),
          payload: { displayName },
        });

      const results = await raceInserts("teams", 2, () => Promise.all([create(), create()]));
      const statuses = results.map((r) => r.statusCode).sort();
      expect(statuses).toEqual([201, 409]);

      const conflict = results.find((r) => r.statusCode === 409);
      expect(JSON.parse(conflict?.body ?? "{}")).toEqual({
        schemas: [SCIM_ERROR_SCHEMA],
        status: 409,
        detail: "Group already exists",
        scimType: "uniqueness",
      });

      const rows = await db.select().from(schema.teams).where(eq(schema.teams.name, displayName));
      expect(rows).toHaveLength(1);
    });

    it("rejects a group whose name differs from an existing team only by case", async () => {
      // Issue #970: groups are teams rows, and the SCIM pre-check is
      // exact-case. Before the lower(name) unique index, a mixed-case twin
      // sailed through and split membership across two teams the rest of
      // the API treats as the same name.
      const base = uniqueName("scim-grp-case");
      await createScimGroup({ displayName: base });

      const res = await crudApp.app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Groups",
        headers: authHeaders(),
        payload: { displayName: base.toUpperCase() },
      });

      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body)).toEqual({
        schemas: [SCIM_ERROR_SCHEMA],
        status: 409,
        detail: "Group already exists",
        scimType: "uniqueness",
      });
    });

    it("trims the SCIM group displayName so a whitespace twin is a duplicate, not a new team (#988)", async () => {
      // The teams API trims names at the Zod boundary; SCIM must too, or an IdP
      // sending "Engineering " creates a second team the rest of the API cannot
      // tell from "Engineering". lower(name) does not catch it either, since
      // lower("foo ") != lower("foo").
      const base = uniqueName("scim-grp-ws");
      await createScimGroup({ displayName: base });

      const res = await crudApp.app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Groups",
        headers: authHeaders(),
        payload: { displayName: `  ${base}  ` },
      });

      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body)).toEqual({
        schemas: [SCIM_ERROR_SCHEMA],
        status: 409,
        detail: "Group already exists",
        scimType: "uniqueness",
      });
    });

    it("rejects a PATCH that renames a group to only whitespace instead of silently skipping (#988)", async () => {
      // A silent no-op would leave the IdP believing the rename applied while
      // the team kept its old name.
      const group = await createScimGroup({ displayName: uniqueName("scim-grp-patch") });

      const res = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Groups/${group.id}`,
        headers: authHeaders(),
        payload: { Operations: [{ op: "replace", path: "displayName", value: "   " }] },
      });

      expect(res.statusCode).toBe(400);
    });

    it("creates a group, assigns members, and reflects it on the user resource", async () => {
      const memberA = await createScimUser({ userName: uniqueName("scim-grp-m1") });
      const memberB = await createScimUser({ userName: uniqueName("scim-grp-m2") });
      const groupName = uniqueName("scim-group-full");

      const res = await crudApp.app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Groups",
        headers: authHeaders(),
        payload: {
          displayName: groupName,
          members: [{ value: memberA.id }, { value: memberB.id }],
        },
      });

      expect(res.statusCode, res.body).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.schemas).toEqual(["urn:ietf:params:scim:schemas:core:2.0:Group"]);
      expect(body.displayName).toBe(groupName);
      expect(body.meta.resourceType).toBe("Group");
      expect(typeof body.meta.created).toBe("string");
      const memberValues = (body.members as Array<{ value: string }>).map((m) => m.value).sort();
      expect(memberValues).toEqual([memberA.id, memberB.id].sort());

      const [teamRowDb] = await db.select().from(schema.teams).where(eq(schema.teams.id, body.id));
      expect(teamRowDb?.name).toBe(groupName);
      const rowA = await userRow(memberA.id);
      const rowB = await userRow(memberB.id);
      expect(rowA?.team).toBe(body.id);
      expect(rowB?.team).toBe(body.id);

      const userRes = await crudApp.app.inject({
        method: "GET",
        url: `/api/v1/scim/v2/Users/${memberA.id}`,
        headers: authHeaders(),
      });
      expect(JSON.parse(userRes.body).groups).toEqual([{ value: body.id, display: groupName }]);
    });

    it("rejects a duplicate displayName with the SCIM 409 envelope", async () => {
      const { displayName } = await createScimGroup({
        displayName: uniqueName("scim-group-dup"),
      });

      const res = await crudApp.app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Groups",
        headers: authHeaders(),
        payload: { displayName },
      });

      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body)).toEqual({
        schemas: [SCIM_ERROR_SCHEMA],
        status: 409,
        detail: "Group already exists",
        scimType: "uniqueness",
      });
    });

    it("concurrent PUT renames onto one displayName return one 200 and one SCIM 409, never 500", async () => {
      // Issue #968: both renames pass the conflict pre-check before either
      // UPDATE commits; the loser used to surface the 23505 as a 500.
      const a = await createScimGroup({ displayName: uniqueName("scim-grp-race-a") });
      const b = await createScimGroup({ displayName: uniqueName("scim-grp-race-b") });
      const target = uniqueName("scim-grp-race-target");

      const rename = (id: string) =>
        crudApp.app.inject({
          method: "PUT",
          url: `/api/v1/scim/v2/Groups/${id}`,
          headers: authHeaders(),
          payload: { displayName: target },
        });

      const results = await raceUpdates("teams", 2, () =>
        Promise.all([rename(a.id), rename(b.id)]),
      );
      const statuses = results.map((r) => r.statusCode).sort();
      expect(statuses).toEqual([200, 409]);

      const conflict = results.find((r) => r.statusCode === 409);
      expect(JSON.parse(conflict?.body ?? "{}")).toEqual({
        schemas: [SCIM_ERROR_SCHEMA],
        status: 409,
        detail: "Group name already taken",
        scimType: "uniqueness",
      });

      const rows = await db.select().from(schema.teams).where(eq(schema.teams.name, target));
      expect(rows).toHaveLength(1);
    });

    it("rejects a PATCH displayName replace onto an existing group with the SCIM 409 envelope", async () => {
      // Issue #968: the PATCH displayName path has no conflict pre-check, so
      // even a sequential rename onto a taken name surfaced the 23505 as a 500.
      const target = await createScimGroup({ displayName: uniqueName("scim-grp-patch-taken") });
      const victim = await createScimGroup({ displayName: uniqueName("scim-grp-patch-victim") });

      const res = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Groups/${victim.id}`,
        headers: authHeaders(),
        payload: {
          schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
          Operations: [{ op: "replace", path: "displayName", value: target.displayName }],
        },
      });

      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body)).toEqual({
        schemas: [SCIM_ERROR_SCHEMA],
        status: 409,
        detail: "Group name already taken",
        scimType: "uniqueness",
      });

      const [row] = await db.select().from(schema.teams).where(eq(schema.teams.id, victim.id));
      expect(row?.name).toBe(victim.displayName);
    });

    describe("a PATCH that fails partway applies none of its operations (#1543)", () => {
      // Each operation used to write straight to the database, so an earlier
      // member change stayed committed when a later operation answered 400 or
      // 409, while the IdP read the error as the whole request rejected.
      async function patchGroup(id: string, operations: unknown[]) {
        return crudApp.app.inject({
          method: "PATCH",
          url: `/api/v1/scim/v2/Groups/${id}`,
          headers: authHeaders(),
          payload: {
            schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
            Operations: operations,
          },
        });
      }

      it("keeps an added member out when a later rename collides", async () => {
        const taken = await createScimGroup({ displayName: uniqueName("scim-grp-atomic-taken") });
        const user = await createScimUser({ userName: uniqueName("scim-grp-atomic-add-u") });
        // Start the user somewhere other than Default, so staying put can't be
        // confused with being moved back there.
        const home = await createScimGroup({
          displayName: uniqueName("scim-grp-atomic-home"),
          members: [{ value: user.id }],
        });
        const group = await createScimGroup({ displayName: uniqueName("scim-grp-atomic-add") });

        const res = await patchGroup(group.id, [
          { op: "add", path: "members", value: [{ value: user.id }] },
          { op: "replace", path: "displayName", value: taken.displayName },
        ]);

        expect(res.statusCode, res.body).toBe(409);
        expect(JSON.parse(res.body)).toEqual({
          schemas: [SCIM_ERROR_SCHEMA],
          status: 409,
          detail: "Group name already taken",
          scimType: "uniqueness",
        });
        expect((await userRow(user.id))?.team).toBe(home.id);
        const [row] = await db.select().from(schema.teams).where(eq(schema.teams.id, group.id));
        expect(row?.name).toBe(group.displayName);
      });

      it("keeps a removed member in when a later rename is empty", async () => {
        const user = await createScimUser({ userName: uniqueName("scim-grp-atomic-rm-u") });
        const group = await createScimGroup({
          displayName: uniqueName("scim-grp-atomic-rm"),
          members: [{ value: user.id }],
        });

        const res = await patchGroup(group.id, [
          { op: "remove", path: `members[value eq "${user.id}"]` },
          // Mixed-case op name: the check before any write has to match the
          // same ops the loop treats as a rename.
          { op: "Replace", path: "displayName", value: "   " },
        ]);

        expect(res.statusCode, res.body).toBe(400);
        expect(JSON.parse(res.body).detail).toBe("displayName cannot be empty");
        expect((await userRow(user.id))?.team).toBe(group.id);
      });

      it("keeps the old membership when a member replace is followed by a colliding rename", async () => {
        const taken = await createScimGroup({
          displayName: uniqueName("scim-grp-atomic-rep-taken"),
        });
        const kept = await createScimUser({ userName: uniqueName("scim-grp-atomic-rep-kept") });
        const incoming = await createScimUser({ userName: uniqueName("scim-grp-atomic-rep-in") });
        const group = await createScimGroup({
          displayName: uniqueName("scim-grp-atomic-rep"),
          members: [{ value: kept.id }],
        });

        const res = await patchGroup(group.id, [
          { op: "replace", path: "members", value: [{ value: incoming.id }] },
          { op: "replace", path: "displayName", value: taken.displayName },
        ]);

        expect(res.statusCode, res.body).toBe(409);
        expect((await userRow(kept.id))?.team).toBe(group.id);
        expect((await userRow(incoming.id))?.team).toBe(DEFAULT_TEAM_ID);
      });

      it("commits every operation of a successful multi-op PATCH, in order", async () => {
        const previous = await createScimUser({ userName: uniqueName("scim-grp-multi-prev") });
        const first = await createScimUser({ userName: uniqueName("scim-grp-multi-a") });
        const second = await createScimUser({ userName: uniqueName("scim-grp-multi-b") });
        const group = await createScimGroup({
          displayName: uniqueName("scim-grp-multi"),
          members: [{ value: previous.id }],
        });
        const renamed = uniqueName("scim-grp-multi-renamed");

        // The add only survives if it runs after the replace, and the rename
        // lands alongside both.
        const res = await patchGroup(group.id, [
          { op: "replace", path: "members", value: [{ value: first.id }] },
          { op: "add", path: "members", value: [{ value: second.id }] },
          { op: "replace", path: "displayName", value: renamed },
        ]);

        expect(res.statusCode, res.body).toBe(200);
        const [row] = await db.select().from(schema.teams).where(eq(schema.teams.id, group.id));
        expect(row?.name).toBe(renamed);
        expect((await userRow(first.id))?.team).toBe(group.id);
        expect((await userRow(second.id))?.team).toBe(group.id);
        expect((await userRow(previous.id))?.team).toBe(DEFAULT_TEAM_ID);
      });
    });

    it("returns a group by id with its members and 404 for unknown ids", async () => {
      const member = await createScimUser({ userName: uniqueName("scim-grp-get-m") });
      const group = await createScimGroup({
        displayName: uniqueName("scim-group-get"),
        members: [{ value: member.id }],
      });

      const res = await crudApp.app.inject({
        method: "GET",
        url: `/api/v1/scim/v2/Groups/${group.id}`,
        headers: authHeaders(),
      });
      expect(res.statusCode, res.body).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.displayName).toBe(group.displayName);
      expect(body.members).toEqual([{ value: member.id, display: member.userName }]);

      const missing = await crudApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Groups/scim-group-does-not-exist",
        headers: authHeaders(),
      });
      expect(missing.statusCode).toBe(404);
      expect(JSON.parse(missing.body)).toMatchObject({
        schemas: [SCIM_ERROR_SCHEMA],
        status: 404,
        detail: "Group not found",
      });
    });

    it("lists groups with displayName filtering, rejects bad filters, and paginates", async () => {
      const group = await createScimGroup({ displayName: uniqueName("scim-group-list") });

      const unfiltered = await crudApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Groups",
        headers: authHeaders(),
      });
      expect(unfiltered.statusCode, unfiltered.body).toBe(200);
      const unfilteredBody = JSON.parse(unfiltered.body);
      expect(unfilteredBody.totalResults).toBeGreaterThanOrEqual(2);
      const listedIds = (unfilteredBody.Resources as Array<{ id: string }>).map((g) => g.id);
      expect(listedIds).toContain(group.id);

      const filtered = await crudApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Groups",
        headers: authHeaders(),
        query: { filter: `displayName eq "${group.displayName}"` },
      });
      expect(filtered.statusCode).toBe(200);
      const filteredBody = JSON.parse(filtered.body);
      expect(filteredBody.totalResults).toBe(1);
      expect(filteredBody.Resources[0].id).toBe(group.id);

      const badAttribute = await crudApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Groups",
        headers: authHeaders(),
        query: { filter: 'userName eq "whoever"' },
      });
      expect(badAttribute.statusCode).toBe(400);
      expect(JSON.parse(badAttribute.body).detail).toBe("Unsupported filter attribute: userName");

      const badSyntax = await crudApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Groups",
        headers: authHeaders(),
        query: { filter: 'displayName sw "scim"' },
      });
      expect(badSyntax.statusCode).toBe(400);
      expect(JSON.parse(badSyntax.body).detail).toBe("Unsupported filter syntax");

      const paged = await crudApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Groups",
        headers: authHeaders(),
        query: { count: "1" },
      });
      expect(paged.statusCode).toBe(200);
      const pagedBody = JSON.parse(paged.body);
      expect(pagedBody.itemsPerPage).toBe(1);
      expect(pagedBody.Resources).toHaveLength(1);
      expect(pagedBody.totalResults).toBeGreaterThanOrEqual(2);
    });

    it("PUT renames a group and fully replaces its membership", async () => {
      const oldMember = await createScimUser({ userName: uniqueName("scim-grp-put-old") });
      const newMember = await createScimUser({ userName: uniqueName("scim-grp-put-new") });
      const group = await createScimGroup({
        displayName: uniqueName("scim-group-put"),
        members: [{ value: oldMember.id }],
      });
      const renamed = uniqueName("scim-group-put-renamed");

      const res = await crudApp.app.inject({
        method: "PUT",
        url: `/api/v1/scim/v2/Groups/${group.id}`,
        headers: authHeaders(),
        payload: { displayName: renamed, members: [{ value: newMember.id }] },
      });

      expect(res.statusCode, res.body).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.displayName).toBe(renamed);
      expect(body.members).toEqual([{ value: newMember.id, display: newMember.userName }]);

      const [teamRowDb] = await db.select().from(schema.teams).where(eq(schema.teams.id, group.id));
      expect(teamRowDb?.name).toBe(renamed);
      const oldRow = await userRow(oldMember.id);
      const newRow = await userRow(newMember.id);
      expect(oldRow?.team).toBe(DEFAULT_TEAM_ID);
      expect(newRow?.team).toBe(group.id);
    });

    it("PUT rejects renaming onto an existing group name and 404s on unknown ids", async () => {
      const first = await createScimGroup({ displayName: uniqueName("scim-group-put-a") });
      const second = await createScimGroup({ displayName: uniqueName("scim-group-put-b") });

      const conflict = await crudApp.app.inject({
        method: "PUT",
        url: `/api/v1/scim/v2/Groups/${second.id}`,
        headers: authHeaders(),
        payload: { displayName: first.displayName },
      });
      expect(conflict.statusCode).toBe(409);
      expect(JSON.parse(conflict.body)).toEqual({
        schemas: [SCIM_ERROR_SCHEMA],
        status: 409,
        detail: "Group name already taken",
        scimType: "uniqueness",
      });
      const [secondRow] = await db
        .select()
        .from(schema.teams)
        .where(eq(schema.teams.id, second.id));
      expect(secondRow?.name).toBe(second.displayName);

      const missing = await crudApp.app.inject({
        method: "PUT",
        url: "/api/v1/scim/v2/Groups/scim-group-does-not-exist",
        headers: authHeaders(),
        payload: { displayName: "ghost" },
      });
      expect(missing.statusCode).toBe(404);
    });

    it("PUT rejects renaming onto a case twin of an existing group name", async () => {
      // The PUT pre-check is exact-case, so a case twin gets past it and trips
      // the lower(name) index on the UPDATE (#970). That makes this the one
      // sequential request that reaches the catch, not the pre-check.
      const first = await createScimGroup({ displayName: uniqueName("scim-group-put-case-a") });
      const second = await createScimGroup({ displayName: uniqueName("scim-group-put-case-b") });

      const res = await crudApp.app.inject({
        method: "PUT",
        url: `/api/v1/scim/v2/Groups/${second.id}`,
        headers: authHeaders(),
        payload: { displayName: first.displayName.toUpperCase() },
      });

      expect(res.statusCode, res.body).toBe(409);
      expect(JSON.parse(res.body)).toEqual({
        schemas: [SCIM_ERROR_SCHEMA],
        status: 409,
        detail: "Group name already taken",
        scimType: "uniqueness",
      });
      const [secondRow] = await db
        .select()
        .from(schema.teams)
        .where(eq(schema.teams.id, second.id));
      expect(secondRow?.name).toBe(second.displayName);
    });

    it("PUT with an empty body leaves name and membership untouched", async () => {
      const member = await createScimUser({ userName: uniqueName("scim-grp-put-keep") });
      const group = await createScimGroup({
        displayName: uniqueName("scim-group-put-noop"),
        members: [{ value: member.id }],
      });

      const res = await crudApp.app.inject({
        method: "PUT",
        url: `/api/v1/scim/v2/Groups/${group.id}`,
        headers: authHeaders(),
        payload: {},
      });

      expect(res.statusCode, res.body).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.displayName).toBe(group.displayName);
      expect(body.members).toEqual([{ value: member.id, display: member.userName }]);
    });

    describe("a PUT that fails after its rename changes nothing (#1682)", () => {
      // PUT renamed the group, moved every member to Default, then added the
      // new ones, each straight to the database. A failure after the rename
      // left the group renamed and emptied behind a 500.
      async function putGroup(id: string, payload: Record<string, unknown>) {
        return crudApp.app.inject({
          method: "PUT",
          url: `/api/v1/scim/v2/Groups/${id}`,
          headers: authHeaders(),
          payload,
        });
      }

      async function groupState(id: string, memberIds: string[]) {
        const [row] = await db.select().from(schema.teams).where(eq(schema.teams.id, id));
        const teams = await Promise.all(memberIds.map(async (m) => (await userRow(m))?.team));
        return { name: row?.name, teams };
      }

      it("rejects a members value that isn't an array before writing anything", async () => {
        const member = await createScimUser({ userName: uniqueName("scim-grp-put-atomic-obj") });
        const group = await createScimGroup({
          displayName: uniqueName("scim-grp-put-atomic-obj"),
          members: [{ value: member.id }],
        });

        const res = await putGroup(group.id, {
          displayName: uniqueName("scim-grp-put-atomic-obj-renamed"),
          members: { value: member.id },
        });

        expect(res.statusCode, res.body).toBe(400);
        expect(JSON.parse(res.body)).toMatchObject({
          schemas: [SCIM_ERROR_SCHEMA],
          status: 400,
          detail: "members must be an array, got object",
        });
        expect(await groupState(group.id, [member.id])).toEqual({
          name: group.displayName,
          teams: [group.id],
        });
      });

      it("treats members: null as an empty list and clears the group", async () => {
        const member = await createScimUser({ userName: uniqueName("scim-grp-put-null-m") });
        const group = await createScimGroup({
          displayName: uniqueName("scim-grp-put-null"),
          members: [{ value: member.id }],
        });

        const res = await putGroup(group.id, { members: null });

        expect(res.statusCode, res.body).toBe(200);
        expect(JSON.parse(res.body).members).toEqual([]);
        expect(await groupState(group.id, [member.id])).toEqual({
          name: group.displayName,
          teams: [DEFAULT_TEAM_ID],
        });
      });

      it("rolls back the rename and member changes when a later member write fails", async () => {
        const kept = await createScimUser({ userName: uniqueName("scim-grp-put-atomic-kept") });
        const incoming = await createScimUser({ userName: uniqueName("scim-grp-put-atomic-in") });
        const group = await createScimGroup({
          displayName: uniqueName("scim-grp-put-atomic-db"),
          members: [{ value: kept.id }],
        });

        // Postgres rejects a NUL byte in a text parameter, so the second
        // member's UPDATE fails after the rename, the move-out, and the first
        // add have all run. This relies on member ids not being checked up
        // front; if they ever are, fail inside the transaction another way.
        const res = await putGroup(group.id, {
          displayName: uniqueName("scim-grp-put-atomic-db-renamed"),
          members: [{ value: incoming.id }, { value: "no\u0000such-user" }],
        });

        expect(res.statusCode, res.body).toBe(500);
        expect(await groupState(group.id, [kept.id, incoming.id])).toEqual({
          name: group.displayName,
          teams: [group.id, DEFAULT_TEAM_ID],
        });
      });
    });

    it("PATCH adds members from an array value and from a single object value", async () => {
      const group = await createScimGroup({ displayName: uniqueName("scim-group-addm") });
      const memberA = await createScimUser({ userName: uniqueName("scim-grp-add-a") });
      const memberB = await createScimUser({ userName: uniqueName("scim-grp-add-b") });
      const memberC = await createScimUser({ userName: uniqueName("scim-grp-add-c") });

      const arrayAdd = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Groups/${group.id}`,
        headers: authHeaders(),
        payload: {
          Operations: [
            {
              op: "add",
              path: "members",
              value: [{ value: memberA.id }, { value: memberB.id }],
            },
          ],
        },
      });
      expect(arrayAdd.statusCode, arrayAdd.body).toBe(200);
      expect(JSON.parse(arrayAdd.body).members).toHaveLength(2);

      const singleAdd = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Groups/${group.id}`,
        headers: authHeaders(),
        payload: {
          Operations: [{ op: "add", path: "members", value: { value: memberC.id } }],
        },
      });
      expect(singleAdd.statusCode, singleAdd.body).toBe(200);
      expect(JSON.parse(singleAdd.body).members).toHaveLength(3);
      const rowC = await userRow(memberC.id);
      expect(rowC?.team).toBe(group.id);
    });

    it("PATCH removes a member by value filter, then every member with a bare remove", async () => {
      const memberA = await createScimUser({ userName: uniqueName("scim-grp-rm-a") });
      const memberB = await createScimUser({ userName: uniqueName("scim-grp-rm-b") });
      const group = await createScimGroup({
        displayName: uniqueName("scim-group-remove"),
        members: [{ value: memberA.id }, { value: memberB.id }],
      });

      const res = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Groups/${group.id}`,
        headers: authHeaders(),
        payload: {
          Operations: [{ op: "remove", path: `members[value eq "${memberA.id}"]` }],
        },
      });
      expect(res.statusCode, res.body).toBe(200);
      expect(JSON.parse(res.body).members).toEqual([
        { value: memberB.id, display: memberB.userName },
      ]);
      const rowA = await userRow(memberA.id);
      expect(rowA?.team).toBe(DEFAULT_TEAM_ID);

      // A remove on members with no value removes them all (RFC 7644
      // 3.5.2.2); it used to be skipped as unparsable (#1683).
      const removeAll = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Groups/${group.id}`,
        headers: authHeaders(),
        payload: { Operations: [{ op: "remove", path: "members" }] },
      });
      expect(removeAll.statusCode, removeAll.body).toBe(200);
      expect(JSON.parse(removeAll.body).members).toEqual([]);
    });

    it("PATCH replaces displayName and rejects an empty replacement name", async () => {
      const group = await createScimGroup({ displayName: uniqueName("scim-group-rename") });
      const renamed = uniqueName("scim-group-renamed");

      const res = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Groups/${group.id}`,
        headers: authHeaders(),
        payload: { Operations: [{ op: "replace", path: "displayName", value: renamed }] },
      });
      expect(res.statusCode, res.body).toBe(200);
      expect(JSON.parse(res.body).displayName).toBe(renamed);

      const emptyRename = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Groups/${group.id}`,
        headers: authHeaders(),
        payload: { Operations: [{ op: "replace", path: "displayName", value: "" }] },
      });
      // #988 flipped this from a silent skip: a 200 carrying the old name told
      // the IdP the rename had applied. The name is still left alone.
      expect(emptyRename.statusCode).toBe(400);
      const [teamRowDb] = await db.select().from(schema.teams).where(eq(schema.teams.id, group.id));
      expect(teamRowDb?.name).toBe(renamed);
    });

    it("PATCH replace members swaps membership, refuses a non-list value, and empties it for null", async () => {
      const before = await createScimUser({ userName: uniqueName("scim-grp-swap-old") });
      const after = await createScimUser({ userName: uniqueName("scim-grp-swap-new") });
      const group = await createScimGroup({
        displayName: uniqueName("scim-group-swap"),
        members: [{ value: before.id }],
      });

      const swap = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Groups/${group.id}`,
        headers: authHeaders(),
        payload: {
          Operations: [{ op: "replace", path: "members", value: [{ value: after.id }] }],
        },
      });
      expect(swap.statusCode, swap.body).toBe(200);
      expect(JSON.parse(swap.body).members).toEqual([{ value: after.id, display: after.userName }]);
      const beforeRow = await userRow(before.id);
      expect(beforeRow?.team).toBe(DEFAULT_TEAM_ID);

      // A malformed value used to wipe the group and answer 200 (#1511).
      const malformed = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Groups/${group.id}`,
        headers: authHeaders(),
        payload: { Operations: [{ op: "replace", path: "members", value: "not-an-array" }] },
      });
      expect(malformed.statusCode, malformed.body).toBe(400);
      expect(JSON.parse(malformed.body).scimType).toBe("invalidValue");
      expect((await userRow(after.id))?.team).toBe(group.id);

      // RFC 7643 2.5: null is the same state as an empty list.
      const emptied = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Groups/${group.id}`,
        headers: authHeaders(),
        payload: { Operations: [{ op: "replace", path: "members", value: null }] },
      });
      expect(emptied.statusCode, emptied.body).toBe(200);
      expect(JSON.parse(emptied.body).members).toEqual([]);
      const afterRow = await userRow(after.id);
      expect(afterRow?.team).toBe(DEFAULT_TEAM_ID);
    });

    it("PATCH returns 404 for unknown group ids", async () => {
      const res = await crudApp.app.inject({
        method: "PATCH",
        url: "/api/v1/scim/v2/Groups/scim-group-does-not-exist",
        headers: authHeaders(),
        payload: { Operations: [] },
      });
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).detail).toBe("Group not found");
    });

    it("DELETE removes the group, moves members to the Default team, and 404s afterwards", async () => {
      const member = await createScimUser({ userName: uniqueName("scim-grp-del-m") });
      const group = await createScimGroup({
        displayName: uniqueName("scim-group-delete"),
        members: [{ value: member.id }],
      });

      const res = await crudApp.app.inject({
        method: "DELETE",
        url: `/api/v1/scim/v2/Groups/${group.id}`,
        headers: authHeaders(),
      });
      expect(res.statusCode).toBe(204);

      const [teamRowDb] = await db.select().from(schema.teams).where(eq(schema.teams.id, group.id));
      expect(teamRowDb).toBeUndefined();
      const memberRow = await userRow(member.id);
      expect(memberRow?.team).toBe(DEFAULT_TEAM_ID);

      const repeat = await crudApp.app.inject({
        method: "DELETE",
        url: `/api/v1/scim/v2/Groups/${group.id}`,
        headers: authHeaders(),
      });
      expect(repeat.statusCode).toBe(404);
      expect(JSON.parse(repeat.body)).toMatchObject({
        schemas: [SCIM_ERROR_SCHEMA],
        status: 404,
        detail: "Group not found",
      });
    });
  });
});
