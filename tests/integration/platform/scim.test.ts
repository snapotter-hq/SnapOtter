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
