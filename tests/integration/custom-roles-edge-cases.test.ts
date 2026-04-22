import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../apps/api/src/db/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "./test-server.js";

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a custom role and return its id. */
async function createRole(
  name: string,
  permissions: string[],
  description?: string,
): Promise<string> {
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/v1/roles",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { name, permissions, description },
  });
  const body = JSON.parse(res.body);
  if (res.statusCode !== 201) {
    throw new Error(`createRole failed (${res.statusCode}): ${res.body}`);
  }
  return body.id as string;
}

/** Register a user, clear mustChangePassword, return a session token. */
async function createUserAndLogin(
  username: string,
  password: string,
  role: string,
): Promise<string> {
  await testApp.app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { username, password, role },
  });
  db.update(schema.users)
    .set({ mustChangePassword: false })
    .where(eq(schema.users.username, username))
    .run();

  const loginRes = await testApp.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password },
  });
  return JSON.parse(loginRes.body).token as string;
}

// ---------------------------------------------------------------------------
// Name validation (5 tests)
// ---------------------------------------------------------------------------
describe("name validation", () => {
  it("rejects name shorter than 2 chars", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "x", permissions: ["tools:use"] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects name longer than 30 chars", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "a".repeat(31), permissions: ["tools:use"] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects name with spaces", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "bad role", permissions: ["tools:use"] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("normalizes uppercase to lowercase", async () => {
    const suffix = Date.now();
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: `UpperCase${suffix}`, permissions: ["tools:use"] },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.name).toBe(`uppercase${suffix}`);
  });

  it("accepts hyphen and underscore", async () => {
    const suffix = Date.now();
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: `ok-role_${suffix}`, permissions: ["tools:use"] },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.name).toBe(`ok-role_${suffix}`);
  });
});

// ---------------------------------------------------------------------------
// Permission validation (3 tests)
// ---------------------------------------------------------------------------
describe("permission validation", () => {
  it("rejects invalid permission names", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: `inv-${Date.now()}`, permissions: ["fly:to-moon"] },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain("Invalid permissions");
  });

  it("rejects missing permissions field", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: `noperms-${Date.now()}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects missing name field", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { permissions: ["tools:use"] },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// CRUD edge cases (5 tests)
// ---------------------------------------------------------------------------
describe("CRUD edge cases", () => {
  it("PUT non-existent role returns 404", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/roles/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { permissions: ["tools:use"] },
    });
    expect(res.statusCode).toBe(404);
  });

  it("DELETE non-existent role returns 404", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/roles/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("updates role description", async () => {
    const id = await createRole(`desc-${Date.now()}`, ["tools:use"], "original");
    const res = await testApp.app.inject({
      method: "PUT",
      url: `/api/v1/roles/${id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { description: "updated description" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("rejects invalid permissions on update", async () => {
    const id = await createRole(`upd-${Date.now()}`, ["tools:use"]);
    const res = await testApp.app.inject({
      method: "PUT",
      url: `/api/v1/roles/${id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { permissions: ["nonexistent:perm"] },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain("Invalid permissions");
  });

  it("multiple users on deleted role all get reassigned to user", async () => {
    const suffix = Date.now();
    const roleName = `multi-${suffix}`;
    const roleId = await createRole(roleName, ["tools:use", "files:own"]);

    // Register three users on this role
    for (let i = 1; i <= 3; i++) {
      await testApp.app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          username: `multi-u${i}-${suffix}`,
          password: "TestPass1",
          role: roleName,
        },
      });
      db.update(schema.users)
        .set({ mustChangePassword: false })
        .where(eq(schema.users.username, `multi-u${i}-${suffix}`))
        .run();
    }

    // Delete the role
    const delRes = await testApp.app.inject({
      method: "DELETE",
      url: `/api/v1/roles/${roleId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(delRes.statusCode).toBe(200);

    // Verify all three users were reassigned to "user"
    for (let i = 1; i <= 3; i++) {
      const loginRes = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: `multi-u${i}-${suffix}`, password: "TestPass1" },
      });
      const body = JSON.parse(loginRes.body);
      expect(body.user.role).toBe("user");
    }
  });
});

// ---------------------------------------------------------------------------
// Functional permissions (1 test)
// ---------------------------------------------------------------------------
describe("functional permissions", () => {
  it("custom role with only settings:read can read settings but not audit log", async () => {
    const suffix = Date.now();
    const roleName = `readonly-${suffix}`;
    await createRole(roleName, ["settings:read"]);

    const token = await createUserAndLogin(`ro-user-${suffix}`, "ReadOnly1", roleName);

    // Can read settings (GET /api/v1/settings requires only authentication)
    const settingsRes = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(settingsRes.statusCode).toBe(200);

    // Cannot access audit log (requires audit:read permission)
    const auditRes = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/audit-log",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(auditRes.statusCode).toBe(403);
  });
});
