import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { canManageTargetRole, hasToolAccess } from "../../../apps/api/src/permissions.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

let testApp: TestApp;
let adminToken: string;
let scopeManagerToken: string;
let scopeManagerRole: string;
let sequence = 0;

const testRun = Date.now().toString(36);

function uniqueName(prefix: string): string {
  sequence += 1;
  return `${prefix}-${testRun}-${sequence}`;
}

async function createRoleAsAdmin(
  name: string,
  permissions: string[],
  toolPermissions?: { mode: "category" | "tool"; allowed: string[] } | null,
): Promise<string> {
  const response = await testApp.app.inject({
    method: "POST",
    url: "/api/v1/roles",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { name, permissions, toolPermissions },
  });

  expect(response.statusCode, response.body).toBe(201);
  return JSON.parse(response.body).id as string;
}

async function createUserAndLogin(username: string, role: string): Promise<string> {
  const password = "RoleAuthority1!";
  const registerResponse = await testApp.app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { username, password, role },
  });
  expect(registerResponse.statusCode, registerResponse.body).toBe(201);

  await db
    .update(schema.users)
    .set({ mustChangePassword: false })
    .where(eq(schema.users.username, username));

  const loginResponse = await testApp.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password },
  });
  expect(loginResponse.statusCode, loginResponse.body).toBe(200);
  return JSON.parse(loginResponse.body).token as string;
}

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);

  scopeManagerRole = uniqueName("scope-manager");
  await createRoleAsAdmin(scopeManagerRole, ["security:manage", "tools:use"], {
    mode: "category",
    allowed: ["image"],
  });
  scopeManagerToken = await createUserAndLogin(uniqueName("scope-manager-user"), scopeManagerRole);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("role authority containment", () => {
  it.each(["disabled:", "disabled:disabled", "disabled:disabled:", "disabled:disabled:admin"])(
    "normalizes malformed disabled role %s to the conservative admin boundary",
    async (role) => {
      const admin = { id: "admin", username: "admin", role: "admin" };
      const customManager = {
        id: "scope-manager",
        username: "scope-manager",
        role: scopeManagerRole,
      };

      expect.soft(await canManageTargetRole(admin, role)).toBe(true);
      expect(await canManageTargetRole(customManager, role)).toBe(false);
    },
  );

  it("rejects updating a role whose existing permissions exceed the actor's authority", async () => {
    const targetName = uniqueName("broader-update");
    const targetId = await createRoleAsAdmin(targetName, ["settings:write"]);
    const [before] = await db.select().from(schema.roles).where(eq(schema.roles.id, targetId));

    const response = await testApp.app.inject({
      method: "PUT",
      url: `/api/v1/roles/${targetId}`,
      headers: { authorization: `Bearer ${scopeManagerToken}` },
      payload: { description: "unauthorized change" },
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).code).toBe("ESCALATION_DENIED");
    const [after] = await db.select().from(schema.roles).where(eq(schema.roles.id, targetId));
    expect(after).toMatchObject({
      description: before.description,
      permissions: before.permissions,
      toolPermissions: before.toolPermissions,
    });
  });

  it("rejects adding an ordinary permission the actor does not hold", async () => {
    const targetName = uniqueName("broader-permission");
    const targetId = await createRoleAsAdmin(targetName, ["security:manage"]);
    const [before] = await db.select().from(schema.roles).where(eq(schema.roles.id, targetId));

    const response = await testApp.app.inject({
      method: "PUT",
      url: `/api/v1/roles/${targetId}`,
      headers: { authorization: `Bearer ${scopeManagerToken}` },
      payload: { permissions: ["security:manage", "settings:write"] },
    });
    const [after] = await db.select().from(schema.roles).where(eq(schema.roles.id, targetId));

    expect.soft(response.statusCode).toBe(403);
    expect.soft(JSON.parse(response.body).code).toBe("ESCALATION_DENIED");
    expect(after.permissions).toEqual(before.permissions);
  });

  it("rejects deleting a role whose existing permissions exceed the actor's authority", async () => {
    const targetName = uniqueName("broader-delete");
    const targetId = await createRoleAsAdmin(targetName, ["settings:write"]);

    const response = await testApp.app.inject({
      method: "DELETE",
      url: `/api/v1/roles/${targetId}`,
      headers: { authorization: `Bearer ${scopeManagerToken}` },
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).code).toBe("ESCALATION_DENIED");
    const [persisted] = await db.select().from(schema.roles).where(eq(schema.roles.id, targetId));
    expect(persisted).toMatchObject({ id: targetId, name: targetName });
  });

  it("rejects creating a role with tool access outside the actor's tool scope", async () => {
    const targetName = uniqueName("broader-tool-create");

    const response = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${scopeManagerToken}` },
      payload: {
        name: targetName,
        permissions: ["tools:use"],
        toolPermissions: { mode: "category", allowed: ["video"] },
      },
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).code).toBe("ESCALATION_DENIED");
    const [persisted] = await db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, targetName));
    expect(persisted).toBeUndefined();
  });

  it("rejects widening an existing role beyond the actor's tool scope", async () => {
    const targetName = uniqueName("broader-tool-update");
    const targetId = await createRoleAsAdmin(targetName, ["tools:use"], {
      mode: "category",
      allowed: ["image"],
    });
    const [before] = await db.select().from(schema.roles).where(eq(schema.roles.id, targetId));

    const response = await testApp.app.inject({
      method: "PUT",
      url: `/api/v1/roles/${targetId}`,
      headers: { authorization: `Bearer ${scopeManagerToken}` },
      payload: { toolPermissions: { mode: "category", allowed: ["image", "video"] } },
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).code).toBe("ESCALATION_DENIED");
    const [after] = await db.select().from(schema.roles).where(eq(schema.roles.id, targetId));
    expect(after.toolPermissions).toEqual(before.toolPermissions);
  });

  it("fails closed for malformed persisted custom-role tool permissions", async () => {
    const targetName = uniqueName("malformed-tools");
    const targetId = await createRoleAsAdmin(targetName, ["tools:use"]);
    await db
      .update(schema.roles)
      .set({
        toolPermissions: sql`${JSON.stringify({ mode: "unexpected", allowed: [] })}::jsonb`,
      })
      .where(eq(schema.roles.id, targetId));

    const admin = { id: "admin", username: "admin", role: "admin" };
    expect.soft(await canManageTargetRole(admin, targetName)).toBe(false);
    expect(await hasToolAccess(targetName, "resize")).toBe(false);
  });

  it("rejects null unrestricted tool scopes on create and update", async () => {
    const createdName = uniqueName("null-tool-create");
    const createResponse = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${scopeManagerToken}` },
      payload: {
        name: createdName,
        permissions: ["tools:use"],
        toolPermissions: null,
      },
    });

    expect.soft(createResponse.statusCode).toBe(403);
    expect.soft(JSON.parse(createResponse.body).code).toBe("ESCALATION_DENIED");
    const [unexpectedCreate] = await db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, createdName));
    expect.soft(unexpectedCreate).toBeUndefined();

    const updatedName = uniqueName("null-tool-update");
    const updatedId = await createRoleAsAdmin(updatedName, ["tools:use"], {
      mode: "category",
      allowed: ["image"],
    });
    const [before] = await db.select().from(schema.roles).where(eq(schema.roles.id, updatedId));
    const updateResponse = await testApp.app.inject({
      method: "PUT",
      url: `/api/v1/roles/${updatedId}`,
      headers: { authorization: `Bearer ${scopeManagerToken}` },
      payload: { toolPermissions: null },
    });
    const [after] = await db.select().from(schema.roles).where(eq(schema.roles.id, updatedId));

    expect.soft(updateResponse.statusCode).toBe(403);
    expect.soft(JSON.parse(updateResponse.body).code).toBe("ESCALATION_DENIED");
    expect(after.toolPermissions).toEqual(before.toolPermissions);
  });

  it("matches tool-scope containment to graceful degradation without the enterprise feature", async () => {
    const actorRole = uniqueName("deg-manager");
    await createRoleAsAdmin(actorRole, ["security:manage", "tools:use"], {
      mode: "tool",
      allowed: ["resize"],
    });
    const actorToken = await createUserAndLogin(uniqueName("deg-user"), actorRole);
    const targetName = uniqueName("deg-target");

    const response = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${actorToken}` },
      payload: {
        name: targetName,
        permissions: ["tools:use"],
        toolPermissions: null,
      },
    });

    expect(response.statusCode, response.body).toBe(201);
  });

  it("allows creating and updating a contained role and lets a full admin delete it", async () => {
    const targetName = uniqueName("contained-role");
    const createResponse = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${scopeManagerToken}` },
      payload: {
        name: targetName,
        permissions: ["tools:use"],
        toolPermissions: { mode: "category", allowed: ["image"] },
      },
    });
    expect(createResponse.statusCode, createResponse.body).toBe(201);
    const targetId = JSON.parse(createResponse.body).id as string;

    const updateResponse = await testApp.app.inject({
      method: "PUT",
      url: `/api/v1/roles/${targetId}`,
      headers: { authorization: `Bearer ${scopeManagerToken}` },
      payload: { description: "contained update" },
    });
    expect(updateResponse.statusCode, updateResponse.body).toBe(200);

    const deleteResponse = await testApp.app.inject({
      method: "DELETE",
      url: `/api/v1/roles/${targetId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(deleteResponse.statusCode, deleteResponse.body).toBe(200);

    const [persisted] = await db.select().from(schema.roles).where(eq(schema.roles.id, targetId));
    expect(persisted).toBeUndefined();
  });

  it("renames active and disabled custom-role members atomically", async () => {
    const originalName = uniqueName("rename-role");
    const renamedName = uniqueName("renamed-role");
    const roleId = await createRoleAsAdmin(originalName, ["security:manage"]);
    const activeUsername = uniqueName("rename-active");
    const disabledUsername = uniqueName("rename-disabled");
    const nestedUsername = uniqueName("rename-nested");
    const lookalikeUsername = uniqueName("rename-lookalike");
    await createUserAndLogin(activeUsername, originalName);
    await createUserAndLogin(disabledUsername, originalName);
    await createUserAndLogin(nestedUsername, originalName);
    await createUserAndLogin(lookalikeUsername, originalName);
    await db
      .update(schema.users)
      .set({ role: `disabled:${originalName}` })
      .where(eq(schema.users.username, disabledUsername));
    await db
      .update(schema.users)
      .set({ role: `disabled:disabled:disabled:${originalName}` })
      .where(eq(schema.users.username, nestedUsername));
    const lookalikeRole = `disabled:disabled:${originalName}-suffix`;
    await db
      .update(schema.users)
      .set({ role: lookalikeRole })
      .where(eq(schema.users.username, lookalikeUsername));

    const response = await testApp.app.inject({
      method: "PUT",
      url: `/api/v1/roles/${roleId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: renamedName },
    });
    const [renamedRole] = await db.select().from(schema.roles).where(eq(schema.roles.id, roleId));
    const [activeMember] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, activeUsername));
    const [disabledMember] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, disabledUsername));
    const [nestedMember] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, nestedUsername));
    const [lookalikeMember] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, lookalikeUsername));

    expect.soft(response.statusCode, response.body).toBe(200);
    expect.soft(renamedRole?.name).toBe(renamedName);
    expect.soft(activeMember?.role).toBe(renamedName);
    expect.soft(disabledMember?.role).toBe(`disabled:${renamedName}`);
    expect.soft(nestedMember?.role).toBe(`disabled:${renamedName}`);
    expect(lookalikeMember?.role).toBe(lookalikeRole);
  });

  it("preserves member activation state when a full admin deletes a custom role", async () => {
    const targetName = uniqueName("delete-role");
    const targetId = await createRoleAsAdmin(targetName, ["security:manage"]);
    const activeUsername = uniqueName("delete-active");
    const disabledUsername = uniqueName("delete-disabled");
    const nestedUsername = uniqueName("delete-nested");
    const lookalikeUsername = uniqueName("delete-lookalike");
    await createUserAndLogin(activeUsername, targetName);
    await createUserAndLogin(disabledUsername, targetName);
    await createUserAndLogin(nestedUsername, targetName);
    await createUserAndLogin(lookalikeUsername, targetName);
    await db
      .update(schema.users)
      .set({ role: `disabled:${targetName}` })
      .where(eq(schema.users.username, disabledUsername));
    await db
      .update(schema.users)
      .set({ role: `disabled:disabled:disabled:${targetName}` })
      .where(eq(schema.users.username, nestedUsername));
    const lookalikeRole = `disabled:disabled:${targetName}-suffix`;
    await db
      .update(schema.users)
      .set({ role: lookalikeRole })
      .where(eq(schema.users.username, lookalikeUsername));
    const [disabledBefore] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, disabledUsername));

    const response = await testApp.app.inject({
      method: "DELETE",
      url: `/api/v1/roles/${targetId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const [deletedRole] = await db.select().from(schema.roles).where(eq(schema.roles.id, targetId));
    const [activeMember] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, activeUsername));
    const [disabledMember] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, disabledUsername));
    const [nestedMember] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, nestedUsername));
    const [lookalikeMember] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, lookalikeUsername));

    expect.soft(response.statusCode, response.body).toBe(200);
    expect.soft(deletedRole).toBeUndefined();
    expect.soft(activeMember?.role).toBe("user");
    expect.soft(disabledMember?.role).toBe("disabled:user");
    expect.soft(nestedMember?.role).toBe("disabled:user");
    expect.soft(lookalikeMember?.role).toBe(lookalikeRole);

    const manageResponse = await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${disabledBefore.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: "user" },
    });
    const [reactivatedMember] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, disabledBefore.id));

    expect.soft(manageResponse.statusCode, manageResponse.body).toBe(200);
    expect(reactivatedMember?.role).toBe("user");
  });

  it.each(["active", "disabled"])(
    "rejects deleting a contained role with an %s member when the user fallback exceeds actor authority",
    async (memberState) => {
      const deletionManagerRole = uniqueName("delete-manager");
      await createRoleAsAdmin(deletionManagerRole, ["security:manage", "users:manage"]);
      const deletionManagerToken = await createUserAndLogin(
        uniqueName("delete-mgr-user"),
        deletionManagerRole,
      );

      const targetName = uniqueName("occupied-role");
      const targetId = await createRoleAsAdmin(targetName, ["security:manage"]);
      const memberName = uniqueName("occupied-member");
      await createUserAndLogin(memberName, targetName);
      if (memberState === "disabled") {
        await db
          .update(schema.users)
          .set({ role: `disabled:${targetName}` })
          .where(eq(schema.users.username, memberName));
      }
      const [memberBefore] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.username, memberName));

      const response = await testApp.app.inject({
        method: "DELETE",
        url: `/api/v1/roles/${targetId}`,
        headers: { authorization: `Bearer ${deletionManagerToken}` },
      });
      const [persistedRole] = await db
        .select()
        .from(schema.roles)
        .where(eq(schema.roles.id, targetId));
      const [memberAfter] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, memberBefore.id));

      expect.soft(response.statusCode).toBe(403);
      expect.soft(JSON.parse(response.body).code).toBe("ESCALATION_DENIED");
      expect.soft(persistedRole).toMatchObject({ id: targetId, name: targetName });
      expect(memberAfter?.role).toBe(memberBefore.role);
    },
  );

  it("rejects deleting an empty contained role when the fallback exceeds actor authority", async () => {
    const targetName = uniqueName("empty-role");
    const targetId = await createRoleAsAdmin(targetName, ["security:manage"]);

    const response = await testApp.app.inject({
      method: "DELETE",
      url: `/api/v1/roles/${targetId}`,
      headers: { authorization: `Bearer ${scopeManagerToken}` },
    });
    const [persistedRole] = await db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.id, targetId));

    expect.soft(response.statusCode).toBe(403);
    expect.soft(JSON.parse(response.body).code).toBe("ESCALATION_DENIED");
    expect(persistedRole).toMatchObject({ id: targetId, name: targetName });
  });
});

describe("API-key-scoped role authority", () => {
  it("does not let a users:manage-only admin API key reset a peer administrator", async () => {
    const targetUsername = uniqueName("peer-admin");
    const targetPassword = "PeerAdmin1!";
    const registerResponse = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: targetUsername, password: targetPassword, role: "admin" },
    });
    expect(registerResponse.statusCode, registerResponse.body).toBe(201);
    const targetId = JSON.parse(registerResponse.body).id as string;
    await db
      .update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.id, targetId));
    const [before] = await db.select().from(schema.users).where(eq(schema.users.id, targetId));

    const keyResponse = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: uniqueName("users-manage-key"), permissions: ["users:manage"] },
    });
    expect(keyResponse.statusCode, keyResponse.body).toBe(201);
    const apiKey = JSON.parse(keyResponse.body).key as string;

    const resetResponse = await testApp.app.inject({
      method: "POST",
      url: `/api/auth/users/${targetId}/reset-password`,
      headers: { authorization: `Bearer ${apiKey}` },
      payload: { newPassword: "UnauthorizedReset1!" },
    });

    expect(resetResponse.statusCode).toBe(403);
    expect(JSON.parse(resetResponse.body).code).toBe("ESCALATION_DENIED");
    const [after] = await db.select().from(schema.users).where(eq(schema.users.id, targetId));
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.mustChangePassword).toBe(false);
  });
});
