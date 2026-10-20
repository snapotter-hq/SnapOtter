import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { canManageTargetRole, hasToolAccess } from "../../../apps/api/src/permissions.js";
import { raceRowLocks } from "../../helpers/pg-race.js";
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

  it("rejects updating a role widened beyond actor authority between pre-check and row lock (#1196)", async () => {
    const targetName = uniqueName("race-upd");
    const renamedName = uniqueName("race-upd-n");
    const targetId = await createRoleAsAdmin(targetName, ["security:manage"]);
    const memberUsername = uniqueName("race-upd-member");
    await createUserAndLogin(memberUsername, targetName);

    const response = await raceRowLocks(
      "roles",
      1,
      () =>
        testApp.app.inject({
          method: "PUT",
          url: `/api/v1/roles/${targetId}`,
          headers: { authorization: `Bearer ${scopeManagerToken}` },
          payload: { name: renamedName, description: "stale pre-check write" },
        }),
      (tx) =>
        tx
          .update(schema.roles)
          .set({ permissions: ["security:manage", "settings:write"] })
          .where(eq(schema.roles.id, targetId)),
    );

    expect(response.statusCode, response.body).toBe(403);
    expect(JSON.parse(response.body)).toEqual({
      error: "Cannot manage a role beyond your role authority",
      code: "ESCALATION_DENIED",
    });

    const [after] = await db.select().from(schema.roles).where(eq(schema.roles.id, targetId));
    expect(after?.name).toBe(targetName);
    expect(after?.description).toBe("");
    expect(after?.permissions).toEqual(["security:manage", "settings:write"]);
    const [memberAfter] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, memberUsername));
    expect(memberAfter?.role).toBe(targetName);

    const auditRows = await db
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.action} = 'ROLE_UPDATED'`);
    expect(
      auditRows.filter((r) => (r.details as { roleId?: string } | null)?.roleId === targetId),
    ).toHaveLength(0);
  });

  it("re-evaluates prospective grant authority against locked fallback fields on PUT (#1196)", async () => {
    const targetName = uniqueName("race-grant");
    const targetId = await createRoleAsAdmin(targetName, ["security:manage"], {
      mode: "category",
      allowed: ["image"],
    });

    // The role starts without tools:use, so clearing toolPermissions to null in
    // the race window leaves locked.permissions as ["security:manage"], which
    // still passes canManageRoleDefinition. Only re-computing the prospective
    // definition from the locked row catches that adding tools:use would combine
    // with the newly null toolPermissions to grant unrestricted tool access.
    const response = await raceRowLocks(
      "roles",
      1,
      () =>
        testApp.app.inject({
          method: "PUT",
          url: `/api/v1/roles/${targetId}`,
          headers: { authorization: `Bearer ${scopeManagerToken}` },
          payload: { permissions: ["security:manage", "tools:use"] },
        }),
      (tx) =>
        tx.update(schema.roles).set({ toolPermissions: null }).where(eq(schema.roles.id, targetId)),
    );

    expect(response.statusCode, response.body).toBe(403);
    expect(JSON.parse(response.body)).toEqual({
      error: "Cannot update a role beyond your role authority",
      code: "ESCALATION_DENIED",
    });

    const [after] = await db.select().from(schema.roles).where(eq(schema.roles.id, targetId));
    expect(after?.permissions).toEqual(["security:manage"]);
    expect(after?.toolPermissions).toBeNull();

    // Symmetric fallback: request sends toolPermissions: null with permissions
    // omitted while the race window adds tools:use (keeping the contained image
    // tool scope so canManageRoleDefinition still passes on the locked row).
    const symName = uniqueName("race-sym");
    const symId = await createRoleAsAdmin(symName, ["security:manage"], {
      mode: "category",
      allowed: ["image"],
    });

    const symResponse = await raceRowLocks(
      "roles",
      1,
      () =>
        testApp.app.inject({
          method: "PUT",
          url: `/api/v1/roles/${symId}`,
          headers: { authorization: `Bearer ${scopeManagerToken}` },
          payload: { toolPermissions: null },
        }),
      (tx) =>
        tx
          .update(schema.roles)
          .set({ permissions: ["security:manage", "tools:use"] })
          .where(eq(schema.roles.id, symId)),
    );

    expect(symResponse.statusCode, symResponse.body).toBe(403);
    expect(JSON.parse(symResponse.body)).toEqual({
      error: "Cannot update a role beyond your role authority",
      code: "ESCALATION_DENIED",
    });

    const [symAfter] = await db.select().from(schema.roles).where(eq(schema.roles.id, symId));
    expect(symAfter?.permissions).toEqual(["security:manage", "tools:use"]);
    expect(symAfter?.toolPermissions).toEqual({ mode: "category", allowed: ["image"] });

    const auditRows = await db
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.action} = 'ROLE_UPDATED'`);
    expect(
      auditRows.filter((r) =>
        [targetId, symId].includes((r.details as { roleId?: string } | null)?.roleId ?? ""),
      ),
    ).toHaveLength(0);
  });

  it("rejects deleting a role widened beyond actor authority between pre-check and row lock (#1196)", async () => {
    const keyResponse = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: uniqueName("scoped-del-key"),
        permissions: [
          "security:manage",
          "tools:use",
          "files:own",
          "apikeys:own",
          "pipelines:own",
          "settings:read",
        ],
      },
    });
    expect(keyResponse.statusCode, keyResponse.body).toBe(201);
    const scopedAdminKey = JSON.parse(keyResponse.body).key as string;

    const targetName = uniqueName("race-del");
    const targetId = await createRoleAsAdmin(targetName, ["security:manage"]);
    const memberUsername = uniqueName("race-del-member");
    await createUserAndLogin(memberUsername, targetName);

    const response = await raceRowLocks(
      "roles",
      1,
      () =>
        testApp.app.inject({
          method: "DELETE",
          url: `/api/v1/roles/${targetId}`,
          headers: { authorization: `Bearer ${scopedAdminKey}` },
        }),
      (tx) =>
        tx
          .update(schema.roles)
          .set({ permissions: ["security:manage", "settings:write"] })
          .where(eq(schema.roles.id, targetId)),
    );

    expect(response.statusCode, response.body).toBe(403);
    expect(JSON.parse(response.body)).toEqual({
      error: "Cannot manage a role beyond your role authority",
      code: "ESCALATION_DENIED",
    });

    const [persistedRole] = await db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.id, targetId));
    expect(persistedRole?.permissions).toEqual(["security:manage", "settings:write"]);
    const [memberAfter] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, memberUsername));
    expect(memberAfter?.role).toBe(targetName);

    const auditRows = await db
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.action} = 'ROLE_DELETED'`);
    expect(
      auditRows.filter((r) => (r.details as { roleId?: string } | null)?.roleId === targetId),
    ).toHaveLength(0);
  });

  it("rejects PUT and DELETE when an acting admin is demoted or deleted before the role row lock (#2888)", async () => {
    const admin2Username = uniqueName("race-actor-admin2");
    const admin2Token = await createUserAndLogin(admin2Username, "admin");
    const [admin2Row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, admin2Username));

    const targetName = uniqueName("race-dem");
    const renamedName = uniqueName("race-dem-n");
    const targetId = await createRoleAsAdmin(targetName, ["tools:use"]);
    const memberUsername = uniqueName("race-actor-member");
    await createUserAndLogin(memberUsername, targetName);

    const putRes = await raceRowLocks(
      "roles",
      1,
      () =>
        testApp.app.inject({
          method: "PUT",
          url: `/api/v1/roles/${targetId}`,
          headers: { authorization: `Bearer ${admin2Token}` },
          payload: { name: renamedName, description: "updated after demotion" },
        }),
      (tx) =>
        tx.update(schema.users).set({ role: "user" }).where(eq(schema.users.id, admin2Row.id)),
    );

    expect(putRes.statusCode, putRes.body).toBe(403);
    expect(JSON.parse(putRes.body)).toEqual({
      error: "Cannot manage a role beyond your role authority",
      code: "ESCALATION_DENIED",
    });

    const [roleAfterPut] = await db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.id, targetId));
    expect(roleAfterPut?.name).toBe(targetName);
    expect(roleAfterPut?.description).toBe("");
    const [memberAfterPut] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, memberUsername));
    expect(memberAfterPut?.role).toBe(targetName);

    const admin3Username = uniqueName("race-actor-admin3");
    const admin3Token = await createUserAndLogin(admin3Username, "admin");
    const [admin3Row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, admin3Username));

    const delRes = await raceRowLocks(
      "roles",
      1,
      () =>
        testApp.app.inject({
          method: "DELETE",
          url: `/api/v1/roles/${targetId}`,
          headers: { authorization: `Bearer ${admin3Token}` },
        }),
      (tx) => tx.delete(schema.users).where(eq(schema.users.id, admin3Row.id)),
    );

    expect(delRes.statusCode, delRes.body).toBe(403);
    expect(JSON.parse(delRes.body)).toEqual({
      error: "Cannot manage a role beyond your role authority",
      code: "ESCALATION_DENIED",
    });

    const [roleAfterDel] = await db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.id, targetId));
    expect(roleAfterDel?.name).toBe(targetName);
    const [memberAfterDel] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, memberUsername));
    expect(memberAfterDel?.role).toBe(targetName);

    // When the acting admin is disabled (disabled:admin) AND the target role is
    // deleted in the race window, 403 ESCALATION_DENIED wins over 404 NOT_FOUND.
    const vanishPutId = await createRoleAsAdmin(uniqueName("race-van-put"), ["tools:use"]);
    const disabledAdminPutRes = await raceRowLocks(
      "roles",
      1,
      () =>
        testApp.app.inject({
          method: "PUT",
          url: `/api/v1/roles/${vanishPutId}`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { description: "disabled before vanished check" },
        }),
      async (tx) => {
        await tx
          .update(schema.users)
          .set({ role: "disabled:admin" })
          .where(eq(schema.users.username, "admin"));
        await tx.delete(schema.roles).where(eq(schema.roles.id, vanishPutId));
      },
    );
    await db.update(schema.users).set({ role: "admin" }).where(eq(schema.users.username, "admin"));
    expect(disabledAdminPutRes.statusCode, disabledAdminPutRes.body).toBe(403);
    expect(JSON.parse(disabledAdminPutRes.body)).toEqual({
      error: "Cannot manage a role beyond your role authority",
      code: "ESCALATION_DENIED",
    });

    const vanishDelId = await createRoleAsAdmin(uniqueName("race-van-del"), ["tools:use"]);
    const disabledAdminDelRes = await raceRowLocks(
      "roles",
      1,
      () =>
        testApp.app.inject({
          method: "DELETE",
          url: `/api/v1/roles/${vanishDelId}`,
          headers: { authorization: `Bearer ${adminToken}` },
        }),
      async (tx) => {
        await tx
          .update(schema.users)
          .set({ role: "disabled:admin" })
          .where(eq(schema.users.username, "admin"));
        await tx.delete(schema.roles).where(eq(schema.roles.id, vanishDelId));
      },
    );
    await db.update(schema.users).set({ role: "admin" }).where(eq(schema.users.username, "admin"));
    expect(disabledAdminDelRes.statusCode, disabledAdminDelRes.body).toBe(403);
    expect(JSON.parse(disabledAdminDelRes.body)).toEqual({
      error: "Cannot manage a role beyond your role authority",
      code: "ESCALATION_DENIED",
    });

    const auditRows = await db
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.action} IN ('ROLE_UPDATED', 'ROLE_DELETED')`);
    expect(
      auditRows.filter((r) =>
        [targetId, vanishPutId, vanishDelId].includes(
          (r.details as { roleId?: string } | null)?.roleId ?? "",
        ),
      ),
    ).toHaveLength(0);
  });

  it("rejects PUT and DELETE when an acting custom role loses security:manage before the role row lock (#2888)", async () => {
    const managerRoleName = uniqueName("race-custom-mgr");
    const managerRoleId = await createRoleAsAdmin(managerRoleName, [
      "security:manage",
      "tools:use",
    ]);
    const managerToken = await createUserAndLogin(uniqueName("race-custom-mgr-u"), managerRoleName);

    const targetName = uniqueName("race-custom-tgt");
    const targetId = await createRoleAsAdmin(targetName, ["tools:use"]);

    // Narrow the actor's custom role to ["tools:use"] (losing security:manage while
    // still containing targetName's ["tools:use"]) right before the PUT lock completes.
    const putRes = await raceRowLocks(
      "roles",
      1,
      () =>
        testApp.app.inject({
          method: "PUT",
          url: `/api/v1/roles/${targetId}`,
          headers: { authorization: `Bearer ${managerToken}` },
          payload: { description: "updated without security:manage" },
        }),
      (tx) =>
        tx
          .update(schema.roles)
          .set({ permissions: ["tools:use"] })
          .where(eq(schema.roles.id, managerRoleId)),
    );

    expect(putRes.statusCode, putRes.body).toBe(403);
    expect(JSON.parse(putRes.body)).toEqual({
      error: "Cannot manage a role beyond your role authority",
      code: "ESCALATION_DENIED",
    });

    const [afterPut] = await db.select().from(schema.roles).where(eq(schema.roles.id, targetId));
    expect(afterPut?.description).toBe("");

    // For DELETE, start as an admin so the pre-lock canAssignRole(user, "user") check
    // passes, then move the actor onto the custom role without security:manage before
    // the DELETE transaction locks the target role row.
    const delActorUsername = uniqueName("race-del-no-sec");
    const delActorToken = await createUserAndLogin(delActorUsername, "admin");
    const [delActorRow] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, delActorUsername));

    const delRes = await raceRowLocks(
      "roles",
      1,
      () =>
        testApp.app.inject({
          method: "DELETE",
          url: `/api/v1/roles/${targetId}`,
          headers: { authorization: `Bearer ${delActorToken}` },
        }),
      (tx) =>
        tx
          .update(schema.users)
          .set({ role: managerRoleName })
          .where(eq(schema.users.id, delActorRow.id)),
    );

    expect(delRes.statusCode, delRes.body).toBe(403);
    expect(JSON.parse(delRes.body)).toEqual({
      error: "Cannot manage a role beyond your role authority",
      code: "ESCALATION_DENIED",
    });

    const [afterDel] = await db.select().from(schema.roles).where(eq(schema.roles.id, targetId));
    expect(afterDel?.name).toBe(targetName);

    const auditRows = await db
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.action} IN ('ROLE_UPDATED', 'ROLE_DELETED')`);
    expect(
      auditRows.filter((r) => (r.details as { roleId?: string } | null)?.roleId === targetId),
    ).toHaveLength(0);
  });

  it("re-evaluates PUT and DELETE manage, grant, and fallback reassignment authority against the actor's current role (#2888)", async () => {
    const broadManagerRole = uniqueName("race-broad-mgr");
    await createRoleAsAdmin(broadManagerRole, [
      "security:manage",
      "tools:use",
      "files:own",
      "apikeys:own",
      "pipelines:own",
      "settings:read",
    ]);
    const narrowManagerRole = uniqueName("race-narrow-mgr");
    await createRoleAsAdmin(narrowManagerRole, ["security:manage", "tools:use"]);

    const actorUsername = uniqueName("race-reassign-actor");
    const actorToken = await createUserAndLogin(actorUsername, broadManagerRole);
    const [actorRow] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, actorUsername));

    const targetName = uniqueName("race-reassign-tgt");
    const targetId = await createRoleAsAdmin(targetName, ["tools:use"]);
    const memberUsername = uniqueName("race-reassign-member");
    await createUserAndLogin(memberUsername, targetName);

    // Move the actor onto narrowManagerRole before the PUT row lock: the actor
    // still holds security:manage and can still manage locked ["tools:use"],
    // but canGrantRoleDefinition must reject granting ["tools:use", "files:own"].
    const putRes = await raceRowLocks(
      "roles",
      1,
      () =>
        testApp.app.inject({
          method: "PUT",
          url: `/api/v1/roles/${targetId}`,
          headers: { authorization: `Bearer ${actorToken}` },
          payload: { permissions: ["tools:use", "files:own"] },
        }),
      (tx) =>
        tx
          .update(schema.users)
          .set({ role: narrowManagerRole })
          .where(eq(schema.users.id, actorRow.id)),
    );

    expect(putRes.statusCode, putRes.body).toBe(403);
    expect(JSON.parse(putRes.body)).toEqual({
      error: "Cannot update a role beyond your role authority",
      code: "ESCALATION_DENIED",
    });
    const [afterPut] = await db.select().from(schema.roles).where(eq(schema.roles.id, targetId));
    expect(afterPut?.permissions).toEqual(["tools:use"]);

    // Promote the actor to admin so the pre-lock canAssignRole(user, "user") check
    // passes, then move the actor onto broadManagerRole before the DELETE row lock:
    // the actor still holds security:manage and can still manage locked ["tools:use"],
    // but canAssignRole(currentActor, "user") must reject inside the transaction.
    await db.update(schema.users).set({ role: "admin" }).where(eq(schema.users.id, actorRow.id));

    const delRes = await raceRowLocks(
      "roles",
      1,
      () =>
        testApp.app.inject({
          method: "DELETE",
          url: `/api/v1/roles/${targetId}`,
          headers: { authorization: `Bearer ${actorToken}` },
        }),
      (tx) =>
        tx
          .update(schema.users)
          .set({ role: broadManagerRole })
          .where(eq(schema.users.id, actorRow.id)),
    );

    expect(delRes.statusCode, delRes.body).toBe(403);
    expect(JSON.parse(delRes.body)).toEqual({
      error: "Cannot reassign role members beyond your role authority",
      code: "ESCALATION_DENIED",
    });

    const [afterDel] = await db.select().from(schema.roles).where(eq(schema.roles.id, targetId));
    expect(afterDel?.name).toBe(targetName);
    const [memberAfterDel] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, memberUsername));
    expect(memberAfterDel?.role).toBe(targetName);

    // Also verify canManageRoleDefinition(currentActor, ...) rejects on PUT and DELETE
    // when the actor retains security:manage (moved onto narrowManagerRole) while the
    // locked role has ["tools:use", "files:own"].
    const widerTargetName = uniqueName("race-wider-tgt");
    const widerTargetId = await createRoleAsAdmin(widerTargetName, ["tools:use", "files:own"]);
    await db
      .update(schema.users)
      .set({ role: broadManagerRole })
      .where(eq(schema.users.id, actorRow.id));

    const widerPutRes = await raceRowLocks(
      "roles",
      1,
      () =>
        testApp.app.inject({
          method: "PUT",
          url: `/api/v1/roles/${widerTargetId}`,
          headers: { authorization: `Bearer ${actorToken}` },
          payload: { description: "blocked by canManageRoleDefinition" },
        }),
      (tx) =>
        tx
          .update(schema.users)
          .set({ role: narrowManagerRole })
          .where(eq(schema.users.id, actorRow.id)),
    );
    expect(widerPutRes.statusCode, widerPutRes.body).toBe(403);
    expect(JSON.parse(widerPutRes.body)).toEqual({
      error: "Cannot manage a role beyond your role authority",
      code: "ESCALATION_DENIED",
    });

    await db.update(schema.users).set({ role: "admin" }).where(eq(schema.users.id, actorRow.id));
    const widerDelRes = await raceRowLocks(
      "roles",
      1,
      () =>
        testApp.app.inject({
          method: "DELETE",
          url: `/api/v1/roles/${widerTargetId}`,
          headers: { authorization: `Bearer ${actorToken}` },
        }),
      (tx) =>
        tx
          .update(schema.users)
          .set({ role: narrowManagerRole })
          .where(eq(schema.users.id, actorRow.id)),
    );
    expect(widerDelRes.statusCode, widerDelRes.body).toBe(403);
    expect(JSON.parse(widerDelRes.body)).toEqual({
      error: "Cannot manage a role beyond your role authority",
      code: "ESCALATION_DENIED",
    });

    const auditRows = await db
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.action} IN ('ROLE_UPDATED', 'ROLE_DELETED')`);
    expect(
      auditRows.filter((r) =>
        [targetId, widerTargetId].includes((r.details as { roleId?: string } | null)?.roleId ?? ""),
      ),
    ).toHaveLength(0);
  });

  it("rejects updating a user to an unknown role with 400 UNKNOWN_ROLE while preserving target authority and session invalidation (#2232)", async () => {
    const userManagerRole = uniqueName("user-mgr");
    const subordinateRole = uniqueName("sub-role");
    await createRoleAsAdmin(userManagerRole, ["users:manage", "tools:use"]);
    await createRoleAsAdmin(subordinateRole, ["tools:use"]);
    const userManagerToken = await createUserAndLogin(
      uniqueName("user-mgr-actor"),
      userManagerRole,
    );

    const subordinateUsername = uniqueName("sub-target");
    const subordinateToken = await createUserAndLogin(subordinateUsername, subordinateRole);
    const [subordinateBefore] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, subordinateUsername));

    const adminTargetUsername = uniqueName("admin-target");
    await createUserAndLogin(adminTargetUsername, "admin");
    const [adminTargetBefore] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, adminTargetUsername));

    // Unknown role on a subordinate target returns 400 UNKNOWN_ROLE and leaves the user untouched.
    const unknownRoleRes = await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${subordinateBefore.id}`,
      headers: { authorization: `Bearer ${userManagerToken}` },
      payload: { role: uniqueName("missing-role") },
    });
    expect(unknownRoleRes.statusCode).toBe(400);
    expect(JSON.parse(unknownRoleRes.body)).toEqual({
      error: "Role not found",
      code: "UNKNOWN_ROLE",
    });
    const [subordinateAfterUnknown] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, subordinateBefore.id));
    expect(subordinateAfterUnknown.role).toBe(subordinateRole);
    expect(subordinateAfterUnknown.updatedAt.getTime()).toBe(subordinateBefore.updatedAt.getTime());

    // Out-of-authority target still returns 403 ESCALATION_DENIED even when the requested role is unknown.
    const outOfScopePrecheckRes = await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${adminTargetBefore.id}`,
      headers: { authorization: `Bearer ${userManagerToken}` },
      payload: { role: uniqueName("missing-role") },
    });
    expect(outOfScopePrecheckRes.statusCode).toBe(403);
    expect(JSON.parse(outOfScopePrecheckRes.body).code).toBe("ESCALATION_DENIED");

    // In-transaction race: if the target user is promoted to admin AND the requested custom role
    // is deleted between the pre-check and the transaction, 403 ESCALATION_DENIED still wins over
    // 400 UNKNOWN_ROLE (matching pre-check priority).
    const transientRole = uniqueName("transient-role");
    await createRoleAsAdmin(transientRole, ["tools:use"]);

    const origTx = db.transaction.bind(db);
    const txSpy = vi
      .spyOn(db, "transaction")
      // biome-ignore lint/suspicious/noExplicitAny: passthrough wrapper around db.transaction
      .mockImplementationOnce(async (fn: any, ...rest: any[]) => {
        await db.delete(schema.roles).where(eq(schema.roles.name, transientRole));
        await db
          .update(schema.users)
          .set({ role: "admin" })
          .where(eq(schema.users.id, subordinateBefore.id));
        return origTx(fn, ...rest);
      });
    try {
      const raceRes = await testApp.app.inject({
        method: "PUT",
        url: `/api/auth/users/${subordinateBefore.id}`,
        headers: { authorization: `Bearer ${userManagerToken}` },
        payload: { role: transientRole },
      });
      expect(raceRes.statusCode).toBe(403);
      expect(JSON.parse(raceRes.body).code).toBe("ESCALATION_DENIED");
      expect(txSpy).toHaveBeenCalledTimes(1);
    } finally {
      txSpy.mockRestore();
      await db
        .update(schema.users)
        .set({ role: subordinateRole })
        .where(eq(schema.users.id, subordinateBefore.id));
    }

    // In-transaction race: if currentUser.role changed between the pre-check and the transaction
    // (so pre-check user.role === updates.role, but in-transaction currentUser.role !== updates.role),
    // updating back to updates.role must still invalidate the target user's sessions.
    const txSessionSpy = vi
      .spyOn(db, "transaction")
      // biome-ignore lint/suspicious/noExplicitAny: passthrough wrapper around db.transaction
      .mockImplementationOnce(async (fn: any, ...rest: any[]) => {
        await db
          .update(schema.users)
          .set({ role: "editor" })
          .where(eq(schema.users.id, subordinateBefore.id));
        return origTx(fn, ...rest);
      });
    try {
      const revertRes = await testApp.app.inject({
        method: "PUT",
        url: `/api/auth/users/${subordinateBefore.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { role: subordinateRole },
      });
      expect(revertRes.statusCode).toBe(200);
      expect(txSessionSpy).toHaveBeenCalledTimes(1);
    } finally {
      txSessionSpy.mockRestore();
    }

    const sessionRes = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${subordinateToken}` },
    });
    expect(sessionRes.statusCode).toBe(401);

    // Opposite in-transaction race: if pre-check user.role !== updates.role ("editor"),
    // and a concurrent update already moved currentUser.role to subordinateRole before the
    // transaction runs, a session created on subordinateRole is preserved.
    await db
      .update(schema.users)
      .set({ role: "editor" })
      .where(eq(schema.users.id, subordinateBefore.id));
    const reLoginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: subordinateUsername, password: "RoleAuthority1!" },
    });
    expect(reLoginRes.statusCode).toBe(200);
    const freshToken = JSON.parse(reLoginRes.body).token as string;
    const txNoopSessionSpy = vi
      .spyOn(db, "transaction")
      // biome-ignore lint/suspicious/noExplicitAny: passthrough wrapper around db.transaction
      .mockImplementationOnce(async (fn: any, ...rest: any[]) => {
        await db
          .update(schema.users)
          .set({ role: subordinateRole })
          .where(eq(schema.users.id, subordinateBefore.id));
        return origTx(fn, ...rest);
      });
    try {
      const noopRes = await testApp.app.inject({
        method: "PUT",
        url: `/api/auth/users/${subordinateBefore.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { role: subordinateRole },
      });
      expect(noopRes.statusCode).toBe(200);
      expect(txNoopSessionSpy).toHaveBeenCalledTimes(1);
    } finally {
      txNoopSessionSpy.mockRestore();
    }
    const preservedSessionRes = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${freshToken}` },
    });
    expect(preservedSessionRes.statusCode).toBe(200);

    // In-transaction race on register: if the actor loses users:manage AND the requested custom
    // role is deleted during scrypt hashing, 403 ESCALATION_DENIED still wins over 400 UNKNOWN_ROLE.
    const transientRegRole = uniqueName("transient-reg-role");
    await createRoleAsAdmin(transientRegRole, ["tools:use"]);
    const userManagerActorUsername = uniqueName("user-mgr-reg-actor");
    const userManagerRegToken = await createUserAndLogin(userManagerActorUsername, userManagerRole);
    const txRegSpy = vi
      .spyOn(db, "transaction")
      // biome-ignore lint/suspicious/noExplicitAny: passthrough wrapper around db.transaction
      .mockImplementationOnce(async (fn: any, ...rest: any[]) => {
        await db.delete(schema.roles).where(eq(schema.roles.name, transientRegRole));
        await db
          .update(schema.users)
          .set({ role: "user" })
          .where(eq(schema.users.username, userManagerActorUsername));
        return origTx(fn, ...rest);
      });
    try {
      const regRaceRes = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { authorization: `Bearer ${userManagerRegToken}` },
        payload: {
          username: uniqueName("never-created"),
          password: "RoleAuthority1!",
          role: transientRegRole,
        },
      });
      expect(regRaceRes.statusCode).toBe(403);
      expect(JSON.parse(regRaceRes.body).code).toBe("ESCALATION_DENIED");
      expect(txRegSpy).toHaveBeenCalledTimes(1);
    } finally {
      txRegSpy.mockRestore();
    }
  });

  it("allows a custom users:manage actor to update their own team when keeping their current role while still blocking self-demotion (#2724)", async () => {
    const teamLeadRole = uniqueName("team-lead");
    const subordinateRole = uniqueName("team-member");
    await createRoleAsAdmin(teamLeadRole, ["tools:use", "users:manage"]);
    await createRoleAsAdmin(subordinateRole, ["tools:use"]);

    const teamName = uniqueName("Design");
    const createTeamRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: teamName },
    });
    expect(createTeamRes.statusCode, createTeamRes.body).toBe(201);
    const teamId = JSON.parse(createTeamRes.body).id as string;

    const leadUsername = uniqueName("alice-lead");
    const leadToken = await createUserAndLogin(leadUsername, teamLeadRole);
    const [leadBefore] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, leadUsername));

    // Keeping the same custom role while changing team succeeds and preserves the active session.
    const selfTeamUpdateRes = await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${leadBefore.id}`,
      headers: { authorization: `Bearer ${leadToken}` },
      payload: { role: teamLeadRole, team: teamName },
    });
    expect(selfTeamUpdateRes.statusCode, selfTeamUpdateRes.body).toBe(200);
    expect(JSON.parse(selfTeamUpdateRes.body)).toEqual({ ok: true });

    const [leadAfterTeamUpdate] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, leadBefore.id));
    expect(leadAfterTeamUpdate.role).toBe(teamLeadRole);
    expect(leadAfterTeamUpdate.team).toBe(teamId);

    const sessionRes = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${leadToken}` },
    });
    expect(sessionRes.statusCode).toBe(200);

    // Changing own role to a subordinate role is still rejected with 400 SELF_DEMOTE.
    const selfDemoteRes = await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${leadBefore.id}`,
      headers: { authorization: `Bearer ${leadToken}` },
      payload: { role: subordinateRole, team: teamName },
    });
    expect(selfDemoteRes.statusCode).toBe(400);
    expect(JSON.parse(selfDemoteRes.body)).toEqual({
      error: "Cannot remove your own admin role",
      code: "SELF_DEMOTE",
    });

    // Changing own role beyond authority still fails with 403 ESCALATION_DENIED.
    const selfEscalateRes = await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${leadBefore.id}`,
      headers: { authorization: `Bearer ${leadToken}` },
      payload: { role: "admin" },
    });
    expect(selfEscalateRes.statusCode).toBe(403);
    expect(JSON.parse(selfEscalateRes.body).code).toBe("ESCALATION_DENIED");

    // In-transaction race: if the actor is promoted to admin between the pre-check
    // and the transaction, keeping the stale pre-check role in updates.role must not
    // self-demote the newly promoted admin back to teamLeadRole.
    const origTx = db.transaction.bind(db);
    const txRaceSpy = vi
      .spyOn(db, "transaction")
      // biome-ignore lint/suspicious/noExplicitAny: passthrough wrapper around db.transaction
      .mockImplementationOnce(async (fn: any, ...rest: any[]) => {
        await db
          .update(schema.users)
          .set({ role: "admin" })
          .where(eq(schema.users.id, leadBefore.id));
        return origTx(fn, ...rest);
      });
    try {
      const raceSelfDemoteRes = await testApp.app.inject({
        method: "PUT",
        url: `/api/auth/users/${leadBefore.id}`,
        headers: { authorization: `Bearer ${leadToken}` },
        payload: { role: teamLeadRole, team: "Default" },
      });
      expect(raceSelfDemoteRes.statusCode).toBe(400);
      expect(JSON.parse(raceSelfDemoteRes.body)).toEqual({
        error: "Cannot remove your own admin role",
        code: "SELF_DEMOTE",
      });
      expect(txRaceSpy).toHaveBeenCalledTimes(1);
    } finally {
      txRaceSpy.mockRestore();
    }

    const [leadAfterRace] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, leadBefore.id));
    expect(leadAfterRace.role).toBe("admin");
    expect(leadAfterRace.team).toBe(teamId);
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

  it("queries schema.roles via tx inside transactions and returns 500 instead of 403/empty-permissions on DB errors (#2672)", async () => {
    const managerRole = uniqueName("tx-mgr-role");
    await createRoleAsAdmin(managerRole, [
      "users:manage",
      "security:manage",
      "tools:use",
      "files:own",
      "apikeys:own",
      "pipelines:own",
      "settings:read",
    ]);
    const managerUsername = uniqueName("tx-mgr-user");
    const managerToken = await createUserAndLogin(managerUsername, managerRole);

    const subordinateRole = uniqueName("tx-sub-role");
    const subordinateRoleId = await createRoleAsAdmin(subordinateRole, ["tools:use"]);
    const targetUsername = uniqueName("tx-target-user");
    await createUserAndLogin(targetUsername, subordinateRole);
    const [targetBefore] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, targetUsername));

    function interceptTransactionRoleLookups(
      mode: "forbid-top-level-db" | "fault-tx-role-select",
      beforeTx?: () => Promise<void>,
    ) {
      let activeTx = 0;
      let txRoleLookups = 0;
      let pendingBeforeTx = beforeTx;
      // biome-ignore lint/suspicious/noExplicitAny: wrap Drizzle select builder on both db and tx
      const wrapRoleSelect = (origSelect: (...args: any[]) => any, isTx: boolean) => {
        return (...selectArgs: unknown[]) => {
          if (!isTx && activeTx > 0 && mode === "forbid-top-level-db") {
            throw new Error("top-level db.select called inside db.transaction");
          }
          const builder = origSelect(...selectArgs);
          const origFrom = builder.from.bind(builder);
          builder.from = (table: unknown, ...fromArgs: unknown[]) => {
            const fromBuilder = origFrom(table, ...fromArgs);
            if (table === schema.roles && (isTx || activeTx > 0)) {
              const origWhere = fromBuilder.where.bind(fromBuilder);
              fromBuilder.where = (...whereArgs: unknown[]) => {
                const whereBuilder = origWhere(...whereArgs);
                // Hook .limit() specifically so getRoleDefinition is intercepted while
                // skipping the route's own .for("share" | "update") lock queries on schema.roles.
                const origLimit = whereBuilder.limit?.bind(whereBuilder);
                if (origLimit) {
                  whereBuilder.limit = (...limitArgs: unknown[]) => {
                    if (isTx) {
                      txRoleLookups += 1;
                    }
                    if (mode === "fault-tx-role-select") {
                      return Promise.reject(
                        new Error("simulated in-transaction roles lookup failure"),
                      );
                    }
                    return origLimit(...limitArgs);
                  };
                }
                return whereBuilder;
              };
            }
            return fromBuilder;
          };
          return builder;
        };
      };

      const origDbSelect = db.select.bind(db);
      const selectSpy = vi
        .spyOn(db, "select")
        .mockImplementation(wrapRoleSelect(origDbSelect, false) as typeof db.select);

      const realTransaction = db.transaction.bind(db) as (
        cb: (tx: object) => Promise<unknown>,
        config?: unknown,
      ) => Promise<unknown>;
      const txSpy = vi.spyOn(db, "transaction").mockImplementation(((
        cb: (tx: object) => Promise<unknown>,
        config?: unknown,
      ) =>
        realTransaction(async (tx) => {
          if (pendingBeforeTx) {
            const hook = pendingBeforeTx;
            pendingBeforeTx = undefined;
            await hook();
          }
          // biome-ignore lint/suspicious/noExplicitAny: wrap tx.select to observe and fault custom-role lookups
          const origTxSelect = (tx as any).select.bind(tx);
          const wrappedTx = new Proxy(tx, {
            get(target, prop, receiver) {
              if (prop === "select") {
                return wrapRoleSelect(origTxSelect, true);
              }
              return Reflect.get(target, prop, receiver);
            },
          });
          activeTx += 1;
          try {
            return await cb(wrappedTx);
          } finally {
            activeTx -= 1;
          }
        }, config)) as unknown as typeof db.transaction);

      return {
        getTxRoleLookups: () => txRoleLookups,
        restore: () => {
          txSpy.mockRestore();
          selectSpy.mockRestore();
        },
      };
    }

    // 1. When getRoleDefinition fails inside db.transaction, routes abort with 500
    // (rolling back mutations) instead of returning 403 ESCALATION_DENIED or 200 with [].
    const [managerRow] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, managerUsername));
    const managerSessionsBefore = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, managerRow.id));
    const faultRegUsername = uniqueName("tx-fault-reg");
    const faultAdminRegUsername = uniqueName("tx-fault-admin-reg");
    const faultGuard = interceptTransactionRoleLookups("fault-tx-role-select");
    try {
      const regFault = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { authorization: `Bearer ${managerToken}` },
        payload: {
          username: faultRegUsername,
          password: "RoleAuthority1!",
          role: subordinateRole,
        },
      });
      expect(regFault.statusCode).toBe(500);

      // Also test built-in admin actor against custom subordinateRole so
      // hasEffectivePermission resolves in-memory and the fault hits canAssignRole
      // and canManageTargetRole directly inside db.transaction.
      const adminRegFault = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          username: faultAdminRegUsername,
          password: "RoleAuthority1!",
          role: subordinateRole,
        },
      });
      expect(adminRegFault.statusCode).toBe(500);

      const putUserFault = await testApp.app.inject({
        method: "PUT",
        url: `/api/auth/users/${targetBefore.id}`,
        headers: { authorization: `Bearer ${managerToken}` },
        payload: { role: subordinateRole },
      });
      expect(putUserFault.statusCode).toBe(500);

      const adminPutUserFault = await testApp.app.inject({
        method: "PUT",
        url: `/api/auth/users/${targetBefore.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { role: "editor" },
      });
      expect(adminPutUserFault.statusCode).toBe(500);

      const resetFault = await testApp.app.inject({
        method: "POST",
        url: `/api/auth/users/${targetBefore.id}/reset-password`,
        headers: { authorization: `Bearer ${managerToken}` },
        payload: { newPassword: "NewResetPassword1!" },
      });
      expect(resetFault.statusCode).toBe(500);

      const delUserFault = await testApp.app.inject({
        method: "DELETE",
        url: `/api/auth/users/${targetBefore.id}`,
        headers: { authorization: `Bearer ${managerToken}` },
      });
      expect(delUserFault.statusCode).toBe(500);

      const putRoleFault = await testApp.app.inject({
        method: "PUT",
        url: `/api/v1/roles/${subordinateRoleId}`,
        headers: { authorization: `Bearer ${managerToken}` },
        payload: { description: "should roll back on role lookup fault" },
      });
      expect(putRoleFault.statusCode).toBe(500);

      const loginFault = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: managerUsername, password: "RoleAuthority1!" },
      });
      expect(loginFault.statusCode).toBe(500);
    } finally {
      faultGuard.restore();
    }

    // For DELETE /api/v1/roles/:id, pass the pre-lock built-in "user" fallback check as
    // admin, then move the actor onto managerRole as the transaction starts so
    // resolveTransactionActor and canManageRoleDefinition query managerRole on tx.
    await db
      .update(schema.users)
      .set({ role: "admin" })
      .where(eq(schema.users.username, managerUsername));
    const delRoleFaultGuard = interceptTransactionRoleLookups("fault-tx-role-select", async () => {
      await db
        .update(schema.users)
        .set({ role: managerRole })
        .where(eq(schema.users.username, managerUsername));
    });
    try {
      const delRoleFault = await testApp.app.inject({
        method: "DELETE",
        url: `/api/v1/roles/${subordinateRoleId}`,
        headers: { authorization: `Bearer ${managerToken}` },
      });
      expect(delRoleFault.statusCode).toBe(500);
    } finally {
      delRoleFaultGuard.restore();
      await db
        .update(schema.users)
        .set({ role: managerRole })
        .where(eq(schema.users.username, managerUsername));
    }

    const [notCreated1] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, faultRegUsername));
    expect(notCreated1).toBeUndefined();
    const [notCreated2] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, faultAdminRegUsername));
    expect(notCreated2).toBeUndefined();
    const managerSessionsAfterFault = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, managerRow.id));
    expect(managerSessionsAfterFault).toHaveLength(managerSessionsBefore.length);
    const [targetAfterFaults] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, targetBefore.id));
    expect(targetAfterFaults?.role).toBe(subordinateRole);
    expect(targetAfterFaults?.passwordHash).toBe(targetBefore.passwordHash);
    const [subRoleAfterFaults] = await db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.id, subordinateRoleId));
    expect(subRoleAfterFaults?.description).toBe("");

    // 2. While inside db.transaction, all custom-role lookups use tx.select rather than
    // checking out a second connection via top-level db.select.
    const txOnlyGuard = interceptTransactionRoleLookups("forbid-top-level-db");
    try {
      const createdUsername = uniqueName("tx-created-user");
      const regOk = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { authorization: `Bearer ${managerToken}` },
        payload: {
          username: createdUsername,
          password: "RoleAuthority1!",
          role: subordinateRole,
        },
      });
      expect(regOk.statusCode, regOk.body).toBe(201);
      const createdUserId = JSON.parse(regOk.body).id as string;

      const putUserOk = await testApp.app.inject({
        method: "PUT",
        url: `/api/auth/users/${createdUserId}`,
        headers: { authorization: `Bearer ${managerToken}` },
        payload: { role: subordinateRole },
      });
      expect(putUserOk.statusCode, putUserOk.body).toBe(200);

      const resetOk = await testApp.app.inject({
        method: "POST",
        url: `/api/auth/users/${createdUserId}/reset-password`,
        headers: { authorization: `Bearer ${managerToken}` },
        payload: { newPassword: "UpdatedPassword1!" },
      });
      expect(resetOk.statusCode, resetOk.body).toBe(200);

      const putRoleOk = await testApp.app.inject({
        method: "PUT",
        url: `/api/v1/roles/${subordinateRoleId}`,
        headers: { authorization: `Bearer ${managerToken}` },
        payload: { description: "updated via tx runner" },
      });
      expect(putRoleOk.statusCode, putRoleOk.body).toBe(200);

      const delUserOk = await testApp.app.inject({
        method: "DELETE",
        url: `/api/auth/users/${createdUserId}`,
        headers: { authorization: `Bearer ${managerToken}` },
      });
      expect(delUserOk.statusCode, delUserOk.body).toBe(200);

      const loginOk = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: managerUsername, password: "RoleAuthority1!" },
      });
      expect(loginOk.statusCode, loginOk.body).toBe(200);
      expect(JSON.parse(loginOk.body).user.permissions).toContain("users:manage");

      expect(txOnlyGuard.getTxRoleLookups()).toBeGreaterThanOrEqual(10);
    } finally {
      txOnlyGuard.restore();
    }

    // Also verify DELETE /api/v1/roles/:id uses tx.select (not top-level db.select)
    // when currentActor has a custom role inside the transaction.
    await db
      .update(schema.users)
      .set({ role: "admin" })
      .where(eq(schema.users.username, managerUsername));
    const delRoleTxGuard = interceptTransactionRoleLookups("forbid-top-level-db", async () => {
      await db
        .update(schema.users)
        .set({ role: managerRole })
        .where(eq(schema.users.username, managerUsername));
    });
    try {
      const delRoleRes = await testApp.app.inject({
        method: "DELETE",
        url: `/api/v1/roles/${subordinateRoleId}`,
        headers: { authorization: `Bearer ${managerToken}` },
      });
      expect(delRoleRes.statusCode, delRoleRes.body).toBe(403);
      expect(JSON.parse(delRoleRes.body)).toEqual({
        error: "Cannot reassign role members beyond your role authority",
        code: "ESCALATION_DENIED",
      });
      expect(delRoleTxGuard.getTxRoleLookups()).toBeGreaterThanOrEqual(2);
    } finally {
      delRoleTxGuard.restore();
    }
  });
});
