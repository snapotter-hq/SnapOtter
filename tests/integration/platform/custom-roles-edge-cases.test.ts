import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

let testApp: TestApp;
let adminToken: string;
let userSequence = 0;

const BASE_USER_PERMISSIONS = [
  "tools:use",
  "files:own",
  "apikeys:own",
  "pipelines:own",
  "settings:read",
];

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
  const registerRes = await testApp.app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { username, password, role },
  });
  if (registerRes.statusCode !== 201) {
    throw new Error(
      `createUserAndLogin registration failed (${registerRes.statusCode}): ${registerRes.body}`,
    );
  }
  await db
    .update(schema.users)
    .set({ mustChangePassword: false })
    .where(eq(schema.users.username, username));

  const loginRes = await testApp.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password },
  });
  return JSON.parse(loginRes.body).token as string;
}

async function createTargetUser(
  prefix: string,
  role: string,
  options: { mfaEnabled?: boolean } = {},
): Promise<{ id: string; password: string; username: string }> {
  userSequence += 1;
  const username = `${prefix}-${Date.now()}-${userSequence}`;
  const password = "TargetPass1";
  const registerRes = await testApp.app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { username, password, role },
  });
  if (registerRes.statusCode !== 201) {
    throw new Error(`createTargetUser failed (${registerRes.statusCode}): ${registerRes.body}`);
  }

  const id = JSON.parse(registerRes.body).id as string;
  await db
    .update(schema.users)
    .set({
      mustChangePassword: false,
      ...(options.mfaEnabled
        ? {
            totpEnabled: true,
            totpSecret: "target-authority-test-secret",
            recoveryCodesHash: "target-authority-test-recovery-codes",
          }
        : {}),
    })
    .where(eq(schema.users.id, id));

  return { id, password, username };
}

async function getUserById(id: string) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  return user;
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
      await db
        .update(schema.users)
        .set({ mustChangePassword: false })
        .where(eq(schema.users.username, `multi-u${i}-${suffix}`));
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

// ---------------------------------------------------------------------------
// Target role authority
// ---------------------------------------------------------------------------
describe("target role authority", () => {
  let managerRole: string;
  let subordinateRole: string;
  let alternateSubordinateRole: string;
  let managerToken: string;
  let fullPermissionManagerToken: string;

  beforeAll(async () => {
    const suffix = Date.now();
    managerRole = `mgr-${suffix}`;
    subordinateRole = `sub-${suffix}`;
    alternateSubordinateRole = `alt-${suffix}`;

    await createRole(managerRole, [...BASE_USER_PERMISSIONS, "users:manage"]);
    await createRole(subordinateRole, BASE_USER_PERMISSIONS);
    await createRole(alternateSubordinateRole, BASE_USER_PERMISSIONS);
    managerToken = await createUserAndLogin(`manager-${suffix}`, "ManagerPass1", managerRole);

    const fullPermissionManagerRole = `full-mgr-${suffix}`;
    await createRole(fullPermissionManagerRole, ADMIN_PERMISSIONS);
    fullPermissionManagerToken = await createUserAndLogin(
      `full-manager-${suffix}`,
      "FullManagerPass1",
      fullPermissionManagerRole,
    );
  });

  it("denies a custom role with all 17 admin permissions from managing built-in admins", async () => {
    expect(ADMIN_PERMISSIONS).toHaveLength(17);

    const demotionTarget = await createTargetUser("full-deny-demote-admin", "admin");
    const passwordTarget = await createTargetUser("full-deny-reset-admin", "admin");
    const deleteTarget = await createTargetUser("full-deny-delete-admin", "admin");
    const mfaTarget = await createTargetUser("full-deny-mfa-admin", "admin", {
      mfaEnabled: true,
    });
    const passwordBefore = await getUserById(passwordTarget.id);

    const demotionResponse = await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${demotionTarget.id}`,
      headers: { authorization: `Bearer ${fullPermissionManagerToken}` },
      payload: { role: subordinateRole },
    });
    const passwordResponse = await testApp.app.inject({
      method: "POST",
      url: `/api/auth/users/${passwordTarget.id}/reset-password`,
      headers: { authorization: `Bearer ${fullPermissionManagerToken}` },
      payload: { newPassword: "UnauthorizedReset1" },
    });
    const deleteResponse = await testApp.app.inject({
      method: "DELETE",
      url: `/api/auth/users/${deleteTarget.id}`,
      headers: { authorization: `Bearer ${fullPermissionManagerToken}` },
    });
    const mfaResponse = await testApp.app.inject({
      method: "POST",
      url: `/api/auth/users/${mfaTarget.id}/mfa/reset`,
      headers: { authorization: `Bearer ${fullPermissionManagerToken}` },
    });

    for (const response of [demotionResponse, passwordResponse, deleteResponse, mfaResponse]) {
      expect.soft(response.statusCode).toBe(403);
      expect.soft(JSON.parse(response.body).code).toBe("ESCALATION_DENIED");
    }

    const [demotionAfter, passwordAfter, deleteAfter, mfaAfter] = await Promise.all([
      getUserById(demotionTarget.id),
      getUserById(passwordTarget.id),
      getUserById(deleteTarget.id),
      getUserById(mfaTarget.id),
    ]);
    expect.soft(demotionAfter?.role).toBe("admin");
    expect.soft(passwordAfter?.passwordHash).toBe(passwordBefore?.passwordHash);
    expect.soft(passwordAfter?.mustChangePassword).toBe(false);
    expect.soft(deleteAfter?.role).toBe("admin");
    expect(mfaAfter).toMatchObject({
      role: "admin",
      totpEnabled: true,
      totpSecret: "target-authority-test-secret",
      recoveryCodesHash: "target-authority-test-recovery-codes",
    });
  });

  it("denies a custom manager demoting an admin and preserves the admin role", async () => {
    const target = await createTargetUser("deny-demote-admin", "admin");

    const response = await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${target.id}`,
      headers: { authorization: `Bearer ${managerToken}` },
      payload: { role: subordinateRole },
    });
    const targetAfter = await getUserById(target.id);

    expect.soft(response.statusCode).toBe(403);
    expect.soft(JSON.parse(response.body).code).toBe("ESCALATION_DENIED");
    expect(targetAfter?.role).toBe("admin");
  });

  it("denies a custom manager resetting an admin password and preserves credentials", async () => {
    const target = await createTargetUser("deny-reset-admin", "admin");
    const targetBefore = await getUserById(target.id);

    const response = await testApp.app.inject({
      method: "POST",
      url: `/api/auth/users/${target.id}/reset-password`,
      headers: { authorization: `Bearer ${managerToken}` },
      payload: { newPassword: "ReplacementPass1" },
    });
    const targetAfter = await getUserById(target.id);

    expect.soft(response.statusCode).toBe(403);
    expect.soft(JSON.parse(response.body).code).toBe("ESCALATION_DENIED");
    expect(targetAfter?.passwordHash).toBe(targetBefore?.passwordHash);
    expect(targetAfter?.mustChangePassword).toBe(false);
  });

  it("denies a custom manager deleting an admin and preserves the account", async () => {
    const target = await createTargetUser("deny-delete-admin", "admin");

    const response = await testApp.app.inject({
      method: "DELETE",
      url: `/api/auth/users/${target.id}`,
      headers: { authorization: `Bearer ${managerToken}` },
    });
    const targetAfter = await getUserById(target.id);

    expect.soft(response.statusCode).toBe(403);
    expect.soft(JSON.parse(response.body).code).toBe("ESCALATION_DENIED");
    expect(targetAfter).toBeDefined();
    expect(targetAfter?.role).toBe("admin");
  });

  it("denies a custom manager resetting admin MFA and preserves MFA state", async () => {
    const target = await createTargetUser("deny-mfa-admin", "admin", { mfaEnabled: true });

    const response = await testApp.app.inject({
      method: "POST",
      url: `/api/auth/users/${target.id}/mfa/reset`,
      headers: { authorization: `Bearer ${managerToken}` },
    });
    const targetAfter = await getUserById(target.id);

    expect.soft(response.statusCode).toBe(403);
    expect.soft(JSON.parse(response.body).code).toBe("ESCALATION_DENIED");
    expect(targetAfter).toMatchObject({
      role: "admin",
      totpEnabled: true,
      totpSecret: "target-authority-test-secret",
      recoveryCodesHash: "target-authority-test-recovery-codes",
    });
  });

  it("protects a disabled admin from a custom manager while allowing built-in admin recovery", async () => {
    const target = await createTargetUser("disabled-admin-recovery", "admin");
    await db
      .update(schema.users)
      .set({ role: "disabled:admin" })
      .where(eq(schema.users.id, target.id));
    const targetBefore = await getUserById(target.id);

    const deniedResponse = await testApp.app.inject({
      method: "POST",
      url: `/api/auth/users/${target.id}/reset-password`,
      headers: { authorization: `Bearer ${managerToken}` },
      payload: { newPassword: "UnauthorizedReset1" },
    });
    const targetAfterDenial = await getUserById(target.id);

    expect.soft(deniedResponse.statusCode).toBe(403);
    expect.soft(JSON.parse(deniedResponse.body).code).toBe("ESCALATION_DENIED");
    expect.soft(targetAfterDenial?.role).toBe("disabled:admin");
    expect.soft(targetAfterDenial?.passwordHash).toBe(targetBefore?.passwordHash);
    expect.soft(targetAfterDenial?.mustChangePassword).toBe(false);

    const recoveryResponse = await testApp.app.inject({
      method: "POST",
      url: `/api/auth/users/${target.id}/reset-password`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { newPassword: "AdminRecovery1" },
    });
    const targetAfterRecovery = await getUserById(target.id);

    expect(recoveryResponse.statusCode).toBe(200);
    expect(targetAfterRecovery?.role).toBe("disabled:admin");
    expect(targetAfterRecovery?.passwordHash).not.toBe(targetBefore?.passwordHash);
    expect(targetAfterRecovery?.mustChangePassword).toBe(true);
  });

  it("allows a custom manager to change a subordinate custom-role user", async () => {
    const target = await createTargetUser("allow-demote-sub", subordinateRole);

    const response = await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${target.id}`,
      headers: { authorization: `Bearer ${managerToken}` },
      payload: { role: alternateSubordinateRole },
    });
    const targetAfter = await getUserById(target.id);

    expect(response.statusCode).toBe(200);
    expect(targetAfter?.role).toBe(alternateSubordinateRole);
  });

  it("allows a custom manager to reset a subordinate custom-role user password", async () => {
    const target = await createTargetUser("allow-reset-sub", subordinateRole);
    const targetBefore = await getUserById(target.id);

    const response = await testApp.app.inject({
      method: "POST",
      url: `/api/auth/users/${target.id}/reset-password`,
      headers: { authorization: `Bearer ${managerToken}` },
      payload: { newPassword: "ReplacementPass1" },
    });
    const targetAfter = await getUserById(target.id);

    expect(response.statusCode).toBe(200);
    expect(targetAfter?.passwordHash).not.toBe(targetBefore?.passwordHash);
    expect(targetAfter?.mustChangePassword).toBe(true);
  });

  it("allows a custom manager to delete a subordinate custom-role user", async () => {
    const target = await createTargetUser("allow-delete-sub", subordinateRole);

    const response = await testApp.app.inject({
      method: "DELETE",
      url: `/api/auth/users/${target.id}`,
      headers: { authorization: `Bearer ${managerToken}` },
    });
    const targetAfter = await getUserById(target.id);

    expect(response.statusCode).toBe(200);
    expect(targetAfter).toBeUndefined();
  });

  it("allows a custom manager to reset subordinate custom-role user MFA", async () => {
    const target = await createTargetUser("allow-mfa-sub", subordinateRole, { mfaEnabled: true });

    const response = await testApp.app.inject({
      method: "POST",
      url: `/api/auth/users/${target.id}/mfa/reset`,
      headers: { authorization: `Bearer ${managerToken}` },
    });
    const targetAfter = await getUserById(target.id);

    expect(response.statusCode).toBe(200);
    expect(targetAfter).toMatchObject({
      totpEnabled: false,
      totpSecret: null,
      recoveryCodesHash: null,
    });
  });

  it("allows an admin to demote an equal admin", async () => {
    const target = await createTargetUser("allow-demote-peer", "admin");

    const response = await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${target.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: subordinateRole },
    });
    const targetAfter = await getUserById(target.id);

    expect(response.statusCode).toBe(200);
    expect(targetAfter?.role).toBe(subordinateRole);
  });

  it("allows an admin to reset an equal admin password", async () => {
    const target = await createTargetUser("allow-reset-peer", "admin");
    const targetBefore = await getUserById(target.id);

    const response = await testApp.app.inject({
      method: "POST",
      url: `/api/auth/users/${target.id}/reset-password`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { newPassword: "ReplacementPass1" },
    });
    const targetAfter = await getUserById(target.id);

    expect(response.statusCode).toBe(200);
    expect(targetAfter?.passwordHash).not.toBe(targetBefore?.passwordHash);
    expect(targetAfter?.mustChangePassword).toBe(true);
  });

  it("allows an admin to delete an equal admin", async () => {
    const target = await createTargetUser("allow-delete-peer", "admin");

    const response = await testApp.app.inject({
      method: "DELETE",
      url: `/api/auth/users/${target.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const targetAfter = await getUserById(target.id);

    expect(response.statusCode).toBe(200);
    expect(targetAfter).toBeUndefined();
  });

  it("allows an admin to reset equal admin MFA", async () => {
    const target = await createTargetUser("allow-mfa-peer", "admin", { mfaEnabled: true });

    const response = await testApp.app.inject({
      method: "POST",
      url: `/api/auth/users/${target.id}/mfa/reset`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const targetAfter = await getUserById(target.id);

    expect(response.statusCode).toBe(200);
    expect(targetAfter).toMatchObject({
      totpEnabled: false,
      totpSecret: null,
      recoveryCodesHash: null,
    });
  });
});
