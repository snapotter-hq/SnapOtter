import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { hashPassword, verifyPassword } from "../../../apps/api/src/plugins/auth.js";
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
      expect.soft(JSON.parse(res.body)).toMatchObject({
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
      expect(row?.externalId).toBe("ext-create-full");
      expect(row?.role).toBe("user");
      expect(row?.team).toBe(DEFAULT_TEAM_ID);
      expect(row?.authProvider).toBe("scim");
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

    it("rejects a duplicate userName with the SCIM 409 envelope", async () => {
      const { userName } = await createScimUser({ userName: uniqueName("scim-create-dup") });
      const res = await crudApp.app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Users",
        headers: authHeaders(),
        payload: { userName },
      });

      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body)).toMatchObject({
        schemas: [SCIM_ERROR_SCHEMA],
        status: 409,
        detail: "User already exists",
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
      expect(JSON.parse(res.body)).toMatchObject({
        schemas: [SCIM_ERROR_SCHEMA],
        status: 409,
        detail: "userName already taken",
      });
      const row = await userRow(victim.id);
      expect(row?.username).toBe(victim.userName);
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
      expect(row?.externalId).toBe("put-ext-1");
      expect(row?.email).toBe("put-primary@example.com");
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
      expect(row?.externalId).toBe("patched-ext");
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

    it("treats name.formatted as a no-op and ignores unknown op types", async () => {
      const { id, userName } = await createScimUser({ userName: uniqueName("scim-patch-noop") });

      const res = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Users/${id}`,
        headers: authHeaders(),
        payload: {
          Operations: [
            { op: "replace", path: "name.formatted", value: "Display Name" },
            { op: "bogus", path: "userName", value: "should-not-apply" },
          ],
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
      expect(row?.externalId).toBe("bulk-ext");
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
      expect(row?.externalId).toBeNull();
      expect(row?.email).toBeNull();
    });

    it("accepts a PATCH without Operations and changes nothing", async () => {
      const { id, userName } = await createScimUser({ userName: uniqueName("scim-patch-empty") });

      const res = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Users/${id}`,
        headers: authHeaders(),
        payload: {},
      });

      expect(res.statusCode, res.body).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.userName).toBe(userName);
      expect(body.active).toBe(true);
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
      expect(JSON.parse(res.body)).toMatchObject({
        schemas: [SCIM_ERROR_SCHEMA],
        status: 409,
        detail: "Group already exists",
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
      expect(JSON.parse(conflict.body)).toMatchObject({
        status: 409,
        detail: "Group name already taken",
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

    it("PATCH removes a member by value filter and ignores unparsable remove paths", async () => {
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

      const noMatch = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Groups/${group.id}`,
        headers: authHeaders(),
        payload: { Operations: [{ op: "remove", path: "members" }] },
      });
      expect(noMatch.statusCode).toBe(200);
      expect(JSON.parse(noMatch.body).members).toHaveLength(1);
    });

    it("PATCH replaces displayName and skips empty replacement names", async () => {
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
      expect(emptyRename.statusCode).toBe(200);
      expect(JSON.parse(emptyRename.body).displayName).toBe(renamed);
      const [teamRowDb] = await db.select().from(schema.teams).where(eq(schema.teams.id, group.id));
      expect(teamRowDb?.name).toBe(renamed);
    });

    it("PATCH replace members swaps membership and empties it for non-array values", async () => {
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

      const emptied = await crudApp.app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Groups/${group.id}`,
        headers: authHeaders(),
        payload: { Operations: [{ op: "replace", path: "members", value: "not-an-array" }] },
      });
      expect(emptied.statusCode).toBe(200);
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
