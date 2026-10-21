import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { and, eq, inArray, ne } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { getStoredFilePath } from "../../../apps/api/src/lib/file-storage.js";
import { ensureAnonymousUser, hashPassword } from "../../../apps/api/src/plugins/auth.js";

const originalLastAdmin = await vi.importActual("../../../apps/api/src/lib/last-admin.js");

let interceptFn: ((tx: any, id: string) => Promise<void>) | null = null;

vi.doMock("../../../apps/api/src/lib/last-admin.js", () => {
  return {
    ...(originalLastAdmin as any),
    assertNotLastAdmin: async (tx: any, id: string) => {
      if (interceptFn) {
        await interceptFn(tx, id);
      }
      return (originalLastAdmin as any).assertNotLastAdmin(tx, id);
    },
  };
});

let testApp: any;
let beforeTransactionFn: (() => Promise<void>) | null = null;

beforeAll(async () => {
  vi.resetModules();
  const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
  mockEnterpriseFeatures(["scim"]);
  const dbMod = await import("../../../apps/api/src/db/index.js");
  const realTransaction = dbMod.db.transaction.bind(dbMod.db);
  vi.spyOn(dbMod.db, "transaction").mockImplementation((async (
    cb: Parameters<typeof dbMod.db.transaction>[0],
    config?: Parameters<typeof dbMod.db.transaction>[1],
  ) => {
    if (beforeTransactionFn) {
      const fn = beforeTransactionFn;
      beforeTransactionFn = null;
      await fn();
    }
    return realTransaction(cb, config);
  }) as unknown as typeof dbMod.db.transaction);
  const ts = await import("../test-server.js");
  testApp = await ts.buildTestApp();
});

afterAll(async () => {
  await testApp.cleanup();
});

afterEach(() => {
  interceptFn = null;
  beforeTransactionFn = null;
});

describe("Stale role reads during concurrent operations", () => {
  it("SCIM deactivation preserves the concurrent role change", async () => {
    const userId = randomUUID();
    const [team] = await db.select().from(schema.teams).limit(1);
    await db.insert(schema.users).values({
      id: userId,
      username: `scim-race-admin-${userId}`,
      passwordHash: await hashPassword("password"),
      role: "admin",
      team: team.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const SCIM_TOKEN = `so_scim_v2_${"b".repeat(64)}`;
    const tokenHash = await hashPassword(SCIM_TOKEN);
    await db
      .insert(schema.settings)
      .values({ key: "scim_token_hash", value: tokenHash })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: tokenHash } });

    let resolveBlocked: () => void;
    const blocked = new Promise<void>((r) => {
      resolveBlocked = r;
    });
    let fired = false;

    interceptFn = async (_tx, id) => {
      if (id === userId && !fired) {
        fired = true;
        await db.update(schema.users).set({ role: "editor" }).where(eq(schema.users.id, userId));
        resolveBlocked();
      }
    };

    const scimPromise = testApp.app.inject({
      method: "PUT",
      url: `/api/v1/scim/v2/Users/${userId}`,
      headers: { authorization: `Bearer ${SCIM_TOKEN}` },
      payload: {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
        userName: `scim-race-admin-${userId}`,
        active: false,
      },
    });

    await blocked;
    const response = await scimPromise;
    expect(response.statusCode).toBe(200);

    const [userAfter] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    expect(userAfter.role).toBe("disabled:editor");

    interceptFn = null;
  });

  it("admin demoted during request loses authority for the action", async () => {
    const admin2Id = randomUUID();
    const [team] = await db.select().from(schema.teams).limit(1);
    await db.insert(schema.users).values({
      id: admin2Id,
      username: `admin2-${admin2Id}`,
      passwordHash: await hashPassword("password"),
      role: "admin",
      team: team.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      mustChangePassword: false,
    });

    const targetUserId = randomUUID();
    await db.insert(schema.users).values({
      id: targetUserId,
      username: `target-${targetUserId}`,
      passwordHash: await hashPassword("password"),
      role: "user",
      team: team.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: `admin2-${admin2Id}`, password: "password" },
    });
    const admin2Token = loginRes.cookies?.find(
      (c: { name: string; value: string }) => c.name === "snapotter-session",
    )?.value;

    let resolveBlocked: () => void;
    const blocked = new Promise<void>((r) => {
      resolveBlocked = r;
    });
    let fired = false;

    interceptFn = async (_tx, id) => {
      if (id === targetUserId && !fired) {
        fired = true;
        await db.update(schema.users).set({ role: "user" }).where(eq(schema.users.id, admin2Id));
        resolveBlocked();
      }
    };

    const adminPromise = testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${targetUserId}`,
      headers: { cookie: `snapotter-session=${admin2Token}` },
      payload: { role: "editor" },
    });

    await blocked;
    const response = await adminPromise;

    expect(response.statusCode).toBe(403);

    const [targetAfter] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, targetUserId));
    expect(targetAfter.role).toBe("user");

    interceptFn = null;
  });

  it("SCIM DELETE preserves the concurrent role change", async () => {
    const userId = randomUUID();
    const [team] = await db.select().from(schema.teams).limit(1);
    await db.insert(schema.users).values({
      id: userId,
      username: `scim-del-admin-${userId}`,
      passwordHash: await hashPassword("password"),
      role: "admin",
      team: team.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const SCIM_TOKEN = `so_scim_v2_${"b".repeat(64)}`;
    const tokenHash = await hashPassword(SCIM_TOKEN);
    await db
      .insert(schema.settings)
      .values({ key: "scim_token_hash", value: tokenHash })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: tokenHash } });

    let resolveBlocked: () => void;
    const blocked = new Promise<void>((r) => {
      resolveBlocked = r;
    });
    let fired = false;

    interceptFn = async (_tx, id) => {
      if (id === userId && !fired) {
        fired = true;
        await db.update(schema.users).set({ role: "editor" }).where(eq(schema.users.id, userId));
        resolveBlocked();
      }
    };

    const scimPromise = testApp.app.inject({
      method: "DELETE",
      url: `/api/v1/scim/v2/Users/${userId}`,
      headers: { authorization: `Bearer ${SCIM_TOKEN}` },
    });

    await blocked;
    const response = await scimPromise;
    expect(response.statusCode).toBe(204);

    const [userAfter] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    expect(userAfter.role).toBe("disabled:editor");

    interceptFn = null;
  });

  it("admin demoted during DELETE request loses authority for the action", async () => {
    const admin2Id = randomUUID();
    const [team] = await db.select().from(schema.teams).limit(1);
    await db.insert(schema.users).values({
      id: admin2Id,
      username: `admin2-del-${admin2Id}`,
      passwordHash: await hashPassword("password"),
      role: "admin",
      team: team.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      mustChangePassword: false,
    });

    const targetUserId = randomUUID();
    await db.insert(schema.users).values({
      id: targetUserId,
      username: `target-del-${targetUserId}`,
      passwordHash: await hashPassword("password"),
      role: "user",
      team: team.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: `admin2-del-${admin2Id}`, password: "password" },
    });
    const admin2Token = loginRes.cookies?.find(
      (c: { name: string; value: string }) => c.name === "snapotter-session",
    )?.value;

    let resolveBlocked: () => void;
    const blocked = new Promise<void>((r) => {
      resolveBlocked = r;
    });
    let fired = false;

    interceptFn = async (_tx, id) => {
      if (id === targetUserId && !fired) {
        fired = true;
        await db.update(schema.users).set({ role: "user" }).where(eq(schema.users.id, admin2Id));
        resolveBlocked();
      }
    };

    const adminPromise = testApp.app.inject({
      method: "DELETE",
      url: `/api/auth/users/${targetUserId}`,
      headers: { cookie: `snapotter-session=${admin2Token}` },
    });

    await blocked;
    const response = await adminPromise;

    expect(response.statusCode).toBe(403);

    const [targetAfter] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, targetUserId));
    expect(targetAfter.role).toBe("user"); // Still exists and not deleted

    interceptFn = null;
  });

  it("admin demoted during POST /api/auth/register loses authority for user creation (#2649)", async () => {
    const admin2Id = randomUUID();
    const [team] = await db.select().from(schema.teams).limit(1);
    await db.insert(schema.users).values({
      id: admin2Id,
      username: `admin2-reg-${admin2Id.slice(0, 8)}`,
      passwordHash: await hashPassword("Password123!"),
      role: "admin",
      team: team.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      mustChangePassword: false,
    });

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: `admin2-reg-${admin2Id.slice(0, 8)}`, password: "Password123!" },
    });
    const admin2Token = loginRes.cookies?.find(
      (c: { name: string; value: string }) => c.name === "snapotter-session",
    )?.value;

    const newUsername = `created-after-demote-${randomUUID().slice(0, 8)}`;
    beforeTransactionFn = async () => {
      await db.update(schema.users).set({ role: "user" }).where(eq(schema.users.id, admin2Id));
    };

    const response = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { cookie: `snapotter-session=${admin2Token}` },
      payload: {
        username: newUsername,
        password: "NewUserPass123!",
        role: "editor",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).code).toBe("ESCALATION_DENIED");

    const [created] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, newUsername));
    expect(created).toBeUndefined();
  });

  it("custom user-manager loses authority on POST /api/auth/register when target custom role is widened during hashing (#2649)", async () => {
    const suffix = randomUUID().slice(0, 8);
    const managerRoleName = `mgr-reg-${suffix}`;
    const targetRoleName = `sub-reg-${suffix}`;
    const [team] = await db.select().from(schema.teams).limit(1);

    await db.insert(schema.roles).values([
      {
        id: randomUUID(),
        name: managerRoleName,
        description: "User manager",
        permissions: ["tools:use", "users:manage"],
        isBuiltin: false,
      },
      {
        id: randomUUID(),
        name: targetRoleName,
        description: "Subordinate role",
        permissions: ["tools:use"],
        isBuiltin: false,
      },
    ]);

    const managerId = randomUUID();
    await db.insert(schema.users).values({
      id: managerId,
      username: `mgr-user-${suffix}`,
      passwordHash: await hashPassword("Password123!"),
      role: managerRoleName,
      team: team.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      mustChangePassword: false,
    });

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: `mgr-user-${suffix}`, password: "Password123!" },
    });
    const managerToken = loginRes.cookies?.find(
      (c: { name: string; value: string }) => c.name === "snapotter-session",
    )?.value;

    const newUsername = `widened-role-user-${suffix}`;
    beforeTransactionFn = async () => {
      await db
        .update(schema.roles)
        .set({ permissions: ["tools:use", "settings:write"] })
        .where(eq(schema.roles.name, targetRoleName));
    };

    const response = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { cookie: `snapotter-session=${managerToken}` },
      payload: {
        username: newUsername,
        password: "NewUserPass123!",
        role: targetRoleName,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).code).toBe("ESCALATION_DENIED");

    const [created] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, newUsername));
    expect(created).toBeUndefined();
  });

  it("admin demoted during POST /api/auth/users/:id/reset-password loses authority and preserves credentials (#2649)", async () => {
    const suffix = randomUUID().slice(0, 8);
    const admin2Id = randomUUID();
    const [team] = await db.select().from(schema.teams).limit(1);
    await db.insert(schema.users).values({
      id: admin2Id,
      username: `admin2-rst-${suffix}`,
      passwordHash: await hashPassword("Password123!"),
      role: "admin",
      team: team.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      mustChangePassword: false,
    });

    const targetUserId = randomUUID();
    const originalHash = await hashPassword("OriginalPass123!");
    await db.insert(schema.users).values({
      id: targetUserId,
      username: `target-rst-${suffix}`,
      passwordHash: originalHash,
      role: "user",
      team: team.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      mustChangePassword: false,
    });

    const sessionId = randomUUID();
    await db.insert(schema.sessions).values({
      id: sessionId,
      userId: targetUserId,
      expiresAt: new Date(Date.now() + 3600_000),
    });

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: `admin2-rst-${suffix}`, password: "Password123!" },
    });
    const admin2Token = loginRes.cookies?.find(
      (c: { name: string; value: string }) => c.name === "snapotter-session",
    )?.value;

    beforeTransactionFn = async () => {
      await db.update(schema.users).set({ role: "user" }).where(eq(schema.users.id, admin2Id));
    };

    const response = await testApp.app.inject({
      method: "POST",
      url: `/api/auth/users/${targetUserId}/reset-password`,
      headers: { cookie: `snapotter-session=${admin2Token}` },
      payload: { newPassword: "ResetPassword123!" },
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).code).toBe("ESCALATION_DENIED");

    const [targetAfter] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, targetUserId));
    expect(targetAfter.passwordHash).toBe(originalHash);
    expect(targetAfter.mustChangePassword).toBe(false);

    const remainingSessions = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, targetUserId));
    expect(remainingSessions).toHaveLength(1);
  });

  it("custom user-manager loses authority on reset-password when target user is promoted to admin during hashing (#2649)", async () => {
    const suffix = randomUUID().slice(0, 8);
    const managerRoleName = `mgr-rst-${suffix}`;
    const subordinateRoleName = `sub-rst-${suffix}`;
    const [team] = await db.select().from(schema.teams).limit(1);

    await db.insert(schema.roles).values([
      {
        id: randomUUID(),
        name: managerRoleName,
        description: "User manager",
        permissions: ["tools:use", "users:manage"],
        isBuiltin: false,
      },
      {
        id: randomUUID(),
        name: subordinateRoleName,
        description: "Subordinate user",
        permissions: ["tools:use"],
        isBuiltin: false,
      },
    ]);

    const managerId = randomUUID();
    await db.insert(schema.users).values({
      id: managerId,
      username: `mgr-rst-user-${suffix}`,
      passwordHash: await hashPassword("Password123!"),
      role: managerRoleName,
      team: team.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      mustChangePassword: false,
    });

    const targetUserId = randomUUID();
    const originalHash = await hashPassword("OriginalPass123!");
    await db.insert(schema.users).values({
      id: targetUserId,
      username: `target-promoted-${suffix}`,
      passwordHash: originalHash,
      role: subordinateRoleName,
      team: team.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      mustChangePassword: false,
    });

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: `mgr-rst-user-${suffix}`, password: "Password123!" },
    });
    const managerToken = loginRes.cookies?.find(
      (c: { name: string; value: string }) => c.name === "snapotter-session",
    )?.value;

    beforeTransactionFn = async () => {
      await db.update(schema.users).set({ role: "admin" }).where(eq(schema.users.id, targetUserId));
    };

    const response = await testApp.app.inject({
      method: "POST",
      url: `/api/auth/users/${targetUserId}/reset-password`,
      headers: { cookie: `snapotter-session=${managerToken}` },
      payload: { newPassword: "ResetPassword123!" },
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).code).toBe("ESCALATION_DENIED");

    const [targetAfter] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, targetUserId));
    expect(targetAfter.passwordHash).toBe(originalHash);
    expect(targetAfter.mustChangePassword).toBe(false);
  });

  it("reset-password returns 404 NOT_FOUND when target user is deleted during hashing (#2649)", async () => {
    const suffix = randomUUID().slice(0, 8);
    const admin2Id = randomUUID();
    const [team] = await db.select().from(schema.teams).limit(1);
    await db.insert(schema.users).values({
      id: admin2Id,
      username: `admin2-delrst-${suffix}`,
      passwordHash: await hashPassword("Password123!"),
      role: "admin",
      team: team.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      mustChangePassword: false,
    });

    const targetUserId = randomUUID();
    await db.insert(schema.users).values({
      id: targetUserId,
      username: `target-delrst-${suffix}`,
      passwordHash: await hashPassword("OriginalPass123!"),
      role: "user",
      team: team.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      mustChangePassword: false,
    });

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: `admin2-delrst-${suffix}`, password: "Password123!" },
    });
    const admin2Token = loginRes.cookies?.find(
      (c: { name: string; value: string }) => c.name === "snapotter-session",
    )?.value;

    beforeTransactionFn = async () => {
      await db.delete(schema.users).where(eq(schema.users.id, targetUserId));
    };

    const response = await testApp.app.inject({
      method: "POST",
      url: `/api/auth/users/${targetUserId}/reset-password`,
      headers: { cookie: `snapotter-session=${admin2Token}` },
      payload: { newPassword: "ResetPassword123!" },
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).code).toBe("NOT_FOUND");
  });

  it("reset-password returns 400 OIDC_NO_PASSWORD when target loses its local password during hashing (#2649)", async () => {
    const suffix = randomUUID().slice(0, 8);
    const admin2Id = randomUUID();
    const [team] = await db.select().from(schema.teams).limit(1);
    await db.insert(schema.users).values({
      id: admin2Id,
      username: `admin2-oidcrst-${suffix}`,
      passwordHash: await hashPassword("Password123!"),
      role: "admin",
      team: team.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      mustChangePassword: false,
    });

    const targetUserId = randomUUID();
    await db.insert(schema.users).values({
      id: targetUserId,
      username: `target-oidcrst-${suffix}`,
      passwordHash: await hashPassword("OriginalPass123!"),
      role: "user",
      team: team.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      mustChangePassword: false,
    });

    const sessionId = randomUUID();
    await db.insert(schema.sessions).values({
      id: sessionId,
      userId: targetUserId,
      expiresAt: new Date(Date.now() + 3600_000),
    });

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: `admin2-oidcrst-${suffix}`, password: "Password123!" },
    });
    const admin2Token = loginRes.cookies?.find(
      (c: { name: string; value: string }) => c.name === "snapotter-session",
    )?.value;

    beforeTransactionFn = async () => {
      await db
        .update(schema.users)
        .set({ passwordHash: null, authProvider: "oidc" })
        .where(eq(schema.users.id, targetUserId));
    };

    const response = await testApp.app.inject({
      method: "POST",
      url: `/api/auth/users/${targetUserId}/reset-password`,
      headers: { cookie: `snapotter-session=${admin2Token}` },
      payload: { newPassword: "ResetPassword123!" },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).code).toBe("OIDC_NO_PASSWORD");

    const [targetAfter] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, targetUserId));
    expect(targetAfter.passwordHash).toBeNull();

    const remainingSessions = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, targetUserId));
    expect(remainingSessions).toHaveLength(1);
  });

  it("actor deleted during POST /api/auth/register and reset-password loses authority with 403 ESCALATION_DENIED (#2649)", async () => {
    const suffix = randomUUID().slice(0, 8);
    const [team] = await db.select().from(schema.teams).limit(1);

    const regAdminId = randomUUID();
    await db.insert(schema.users).values({
      id: regAdminId,
      username: `admin-delreg-${suffix}`,
      passwordHash: await hashPassword("Password123!"),
      role: "admin",
      team: team.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      mustChangePassword: false,
    });

    const regLogin = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: `admin-delreg-${suffix}`, password: "Password123!" },
    });
    const regAdminToken = regLogin.cookies?.find(
      (c: { name: string; value: string }) => c.name === "snapotter-session",
    )?.value;

    const newUsername = `created-after-actor-del-${suffix}`;
    beforeTransactionFn = async () => {
      await db.delete(schema.users).where(eq(schema.users.id, regAdminId));
    };

    const regRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { cookie: `snapotter-session=${regAdminToken}` },
      payload: {
        username: newUsername,
        password: "NewUserPass123!",
        role: "user",
      },
    });
    expect(regRes.statusCode).toBe(403);
    expect(JSON.parse(regRes.body).code).toBe("ESCALATION_DENIED");
    const [notCreated] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, newUsername));
    expect(notCreated).toBeUndefined();

    const rstAdminId = randomUUID();
    const targetUserId = randomUUID();
    const originalHash = await hashPassword("OriginalPass123!");
    await db.insert(schema.users).values([
      {
        id: rstAdminId,
        username: `admin-delrst2-${suffix}`,
        passwordHash: await hashPassword("Password123!"),
        role: "admin",
        team: team.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        mustChangePassword: false,
      },
      {
        id: targetUserId,
        username: `target-delrst2-${suffix}`,
        passwordHash: originalHash,
        role: "user",
        team: team.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        mustChangePassword: false,
      },
    ]);

    const rstLogin = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: `admin-delrst2-${suffix}`, password: "Password123!" },
    });
    const rstAdminToken = rstLogin.cookies?.find(
      (c: { name: string; value: string }) => c.name === "snapotter-session",
    )?.value;

    beforeTransactionFn = async () => {
      await db.delete(schema.users).where(eq(schema.users.id, rstAdminId));
    };

    const rstRes = await testApp.app.inject({
      method: "POST",
      url: `/api/auth/users/${targetUserId}/reset-password`,
      headers: { cookie: `snapotter-session=${rstAdminToken}` },
      payload: { newPassword: "ResetPassword123!" },
    });
    expect(rstRes.statusCode).toBe(403);
    expect(JSON.parse(rstRes.body).code).toBe("ESCALATION_DENIED");
    const [targetAfter] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, targetUserId));
    expect(targetAfter.passwordHash).toBe(originalHash);
    expect(targetAfter.mustChangePassword).toBe(false);
  });

  it("actor deleted or demoted during DELETE /api/auth/users/:id loses authority with 403 ESCALATION_DENIED (#2723)", async () => {
    const suffix = randomUUID().slice(0, 8);
    const [team] = await db.select().from(schema.teams).limit(1);

    const delAdminId = randomUUID();
    const targetUserId = randomUUID();
    await db.insert(schema.users).values([
      {
        id: delAdminId,
        username: `admin-delactor-${suffix}`,
        passwordHash: await hashPassword("Password123!"),
        role: "admin",
        team: team.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        mustChangePassword: false,
      },
      {
        id: targetUserId,
        username: `target-delactor-${suffix}`,
        passwordHash: await hashPassword("OriginalPass123!"),
        role: "user",
        team: team.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        mustChangePassword: false,
      },
    ]);

    const targetSessionId = randomUUID();
    await db.insert(schema.sessions).values({
      id: targetSessionId,
      userId: targetUserId,
      expiresAt: new Date(Date.now() + 3600_000),
    });

    const delLogin = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: `admin-delactor-${suffix}`, password: "Password123!" },
    });
    const delAdminToken = delLogin.cookies?.find(
      (c: { name: string; value: string }) => c.name === "snapotter-session",
    )?.value;

    let txCount = 0;
    interceptFn = async (_tx, id) => {
      if (id === targetUserId) {
        txCount += 1;
        // DELETE /api/auth/users/:id runs assertNotLastAdmin in two transactions:
        // a pre-check before deleteLibraryFileStorage and the final delete transaction.
        // Delete the acting admin right as the final transaction starts.
        if (txCount === 2) {
          await db.delete(schema.users).where(eq(schema.users.id, delAdminId));
        }
      }
    };

    const delRes = await testApp.app.inject({
      method: "DELETE",
      url: `/api/auth/users/${targetUserId}`,
      headers: { cookie: `snapotter-session=${delAdminToken}` },
    });
    expect(delRes.statusCode).toBe(403);
    expect(JSON.parse(delRes.body)).toEqual({
      error: "Cannot manage a user beyond your role authority",
      code: "ESCALATION_DENIED",
    });

    const [targetAfter] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, targetUserId));
    expect(targetAfter).toBeDefined();
    expect(targetAfter.role).toBe("user");
    const remainingTargetSessions = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, targetUserId));
    expect(remainingTargetSessions).toHaveLength(1);

    // Also verify that when the acting admin loses users:manage AND the target user
    // is deleted before the final transaction, 403 ESCALATION_DENIED wins over 404 NOT_FOUND.
    const demotedAdminId = randomUUID();
    const secondTargetId = randomUUID();
    await db.insert(schema.users).values([
      {
        id: demotedAdminId,
        username: `admin-demoted-del-${suffix}`,
        passwordHash: await hashPassword("Password123!"),
        role: "admin",
        team: team.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        mustChangePassword: false,
      },
      {
        id: secondTargetId,
        username: `target-demoted-del-${suffix}`,
        passwordHash: await hashPassword("OriginalPass123!"),
        role: "user",
        team: team.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        mustChangePassword: false,
      },
    ]);

    const demotedLogin = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: `admin-demoted-del-${suffix}`, password: "Password123!" },
    });
    const demotedAdminToken = demotedLogin.cookies?.find(
      (c: { name: string; value: string }) => c.name === "snapotter-session",
    )?.value;

    let secondTxCount = 0;
    interceptFn = async (_tx, id) => {
      if (id === secondTargetId) {
        secondTxCount += 1;
        if (secondTxCount === 2) {
          await db
            .update(schema.users)
            .set({ role: "user" })
            .where(eq(schema.users.id, demotedAdminId));
          await db.delete(schema.users).where(eq(schema.users.id, secondTargetId));
        }
      }
    };

    const demotedRes = await testApp.app.inject({
      method: "DELETE",
      url: `/api/auth/users/${secondTargetId}`,
      headers: { cookie: `snapotter-session=${demotedAdminToken}` },
    });
    expect(demotedRes.statusCode).toBe(403);
    expect(JSON.parse(demotedRes.body)).toEqual({
      error: "Cannot manage a user beyond your role authority",
      code: "ESCALATION_DENIED",
    });

    // When a custom user-manager retains users:manage, the target still exists,
    // and the target is promoted to admin before the final transaction,
    // canManageTargetRole rejects with 403 ESCALATION_DENIED and preserves the target.
    const managerRoleName = `mgr-del-${suffix}`;
    const subordinateRoleName = `sub-del-${suffix}`;
    await db.insert(schema.roles).values([
      {
        id: randomUUID(),
        name: managerRoleName,
        description: "User manager for delete race",
        permissions: ["tools:use", "users:manage"],
        isBuiltin: false,
      },
      {
        id: randomUUID(),
        name: subordinateRoleName,
        description: "Subordinate user for delete race",
        permissions: ["tools:use"],
        isBuiltin: false,
      },
    ]);
    const managerActorId = randomUUID();
    const promotedTargetId = randomUUID();
    await db.insert(schema.users).values([
      {
        id: managerActorId,
        username: `mgr-del-actor-${suffix}`,
        passwordHash: await hashPassword("Password123!"),
        role: managerRoleName,
        team: team.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        mustChangePassword: false,
      },
      {
        id: promotedTargetId,
        username: `target-promoted-del-${suffix}`,
        passwordHash: await hashPassword("OriginalPass123!"),
        role: subordinateRoleName,
        team: team.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        mustChangePassword: false,
      },
    ]);

    const managerLogin = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: `mgr-del-actor-${suffix}`, password: "Password123!" },
    });
    const managerToken = managerLogin.cookies?.find(
      (c: { name: string; value: string }) => c.name === "snapotter-session",
    )?.value;

    let promotedTxCount = 0;
    interceptFn = async (_tx, id) => {
      if (id === promotedTargetId) {
        promotedTxCount += 1;
        if (promotedTxCount === 2) {
          await db
            .update(schema.users)
            .set({ role: "admin" })
            .where(eq(schema.users.id, promotedTargetId));
        }
      }
    };

    const promotedRes = await testApp.app.inject({
      method: "DELETE",
      url: `/api/auth/users/${promotedTargetId}`,
      headers: { cookie: `snapotter-session=${managerToken}` },
    });
    expect(promotedRes.statusCode).toBe(403);
    expect(JSON.parse(promotedRes.body)).toEqual({
      error: "Cannot manage a user beyond your role authority",
      code: "ESCALATION_DENIED",
    });
    expect(promotedTxCount).toBe(2);
    const [promotedTargetAfter] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, promotedTargetId));
    expect(promotedTargetAfter).toBeDefined();
    expect(promotedTargetAfter.role).toBe("admin");

    // When the acting admin still has authority and only the target user was
    // deleted before the final transaction, 404 NOT_FOUND is returned.
    const validAdminId = randomUUID();
    const doomedTargetId = randomUUID();
    await db.insert(schema.users).values([
      {
        id: validAdminId,
        username: `admin-validdel-${suffix}`,
        passwordHash: await hashPassword("Password123!"),
        role: "admin",
        team: team.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        mustChangePassword: false,
      },
      {
        id: doomedTargetId,
        username: `target-doomed-${suffix}`,
        passwordHash: await hashPassword("OriginalPass123!"),
        role: "user",
        team: team.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        mustChangePassword: false,
      },
    ]);

    const validAdminLogin = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: `admin-validdel-${suffix}`, password: "Password123!" },
    });
    const validAdminToken = validAdminLogin.cookies?.find(
      (c: { name: string; value: string }) => c.name === "snapotter-session",
    )?.value;

    let thirdTxCount = 0;
    interceptFn = async (_tx, id) => {
      if (id === doomedTargetId) {
        thirdTxCount += 1;
        if (thirdTxCount === 2) {
          await db.delete(schema.users).where(eq(schema.users.id, doomedTargetId));
        }
      }
    };

    const missingTargetRes = await testApp.app.inject({
      method: "DELETE",
      url: `/api/auth/users/${doomedTargetId}`,
      headers: { cookie: `snapotter-session=${validAdminToken}` },
    });
    expect(missingTargetRes.statusCode).toBe(404);
    expect(JSON.parse(missingTargetRes.body)).toEqual({
      error: "User not found",
      code: "NOT_FOUND",
    });
  });

  it("PUT /api/auth/users/:id checks in-transaction authority before returning 400 LAST_ADMIN (#2743)", async () => {
    const suffix = randomUUID().slice(0, 8);
    const [team] = await db.select().from(schema.teams).limit(1);

    const priorAdmins = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.role, "admin"), ne(schema.users.id, "anonymous")));
    const priorAdminIds = priorAdmins.map((u) => u.id);

    if (priorAdminIds.length > 0) {
      await db
        .update(schema.users)
        .set({ role: "user" })
        .where(inArray(schema.users.id, priorAdminIds));
    }

    const createdUserIds: string[] = [];
    try {
      // 1. Acting admin2 is demoted to user (or deleted) right before assertNotLastAdmin
      // runs, leaving admin1 as the sole admin while admin2 has lost authority.
      const admin1Id = randomUUID();
      const admin2Id = randomUUID();
      const admin3Id = randomUUID();
      createdUserIds.push(admin1Id, admin2Id, admin3Id);
      await db.insert(schema.users).values([
        {
          id: admin1Id,
          username: `sole-put-admin1-${suffix}`,
          passwordHash: await hashPassword("Password123!"),
          role: "admin",
          team: team.id,
          createdAt: new Date(),
          updatedAt: new Date(),
          mustChangePassword: false,
        },
        {
          id: admin2Id,
          username: `acting-put-admin2-${suffix}`,
          passwordHash: await hashPassword("Password123!"),
          role: "admin",
          team: team.id,
          createdAt: new Date(),
          updatedAt: new Date(),
          mustChangePassword: false,
        },
        {
          id: admin3Id,
          username: `deleted-put-admin3-${suffix}`,
          passwordHash: await hashPassword("Password123!"),
          role: "admin",
          team: team.id,
          createdAt: new Date(),
          updatedAt: new Date(),
          mustChangePassword: false,
        },
      ]);

      const admin2Login = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: `acting-put-admin2-${suffix}`, password: "Password123!" },
      });
      const admin2Token = admin2Login.cookies?.find(
        (c: { name: string; value: string }) => c.name === "snapotter-session",
      )?.value;

      const admin3Login = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: `deleted-put-admin3-${suffix}`, password: "Password123!" },
      });
      const admin3Token = admin3Login.cookies?.find(
        (c: { name: string; value: string }) => c.name === "snapotter-session",
      )?.value;

      interceptFn = async (_tx, id) => {
        if (id === admin1Id) {
          await db
            .update(schema.users)
            .set({ role: "user" })
            .where(inArray(schema.users.id, [admin2Id, admin3Id]));
        }
      };

      const demotedActorRes = await testApp.app.inject({
        method: "PUT",
        url: `/api/auth/users/${admin1Id}`,
        headers: { cookie: `snapotter-session=${admin2Token}` },
        payload: { role: "user" },
      });
      expect(demotedActorRes.statusCode).toBe(403);
      expect(JSON.parse(demotedActorRes.body)).toEqual({
        error: "Cannot manage a user beyond your role authority",
        code: "ESCALATION_DENIED",
      });

      await db.update(schema.users).set({ role: "admin" }).where(eq(schema.users.id, admin3Id));
      interceptFn = async (_tx, id) => {
        if (id === admin1Id) {
          await db.delete(schema.users).where(eq(schema.users.id, admin3Id));
        }
      };

      const deletedActorRes = await testApp.app.inject({
        method: "PUT",
        url: `/api/auth/users/${admin1Id}`,
        headers: { cookie: `snapotter-session=${admin3Token}` },
        payload: { role: "user" },
      });
      expect(deletedActorRes.statusCode).toBe(403);
      expect(JSON.parse(deletedActorRes.body)).toEqual({
        error: "Cannot manage a user beyond your role authority",
        code: "ESCALATION_DENIED",
      });

      const [admin1After] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, admin1Id));
      expect(admin1After.role).toBe("admin");

      // 2. Custom user-manager updates subordinate bob, who is promoted to the sole
      // remaining admin right before assertNotLastAdmin runs.
      const leadRoleName = `lead-put-last-${suffix}`;
      const subRoleName = `sub-put-last-${suffix}`;
      const nextSubRoleName = `next-sub-put-last-${suffix}`;
      await db.insert(schema.roles).values([
        {
          id: randomUUID(),
          name: leadRoleName,
          description: "Scoped user manager",
          permissions: ["tools:use", "users:manage"],
          isBuiltin: false,
        },
        {
          id: randomUUID(),
          name: subRoleName,
          description: "Subordinate role",
          permissions: ["tools:use"],
          isBuiltin: false,
        },
        {
          id: randomUUID(),
          name: nextSubRoleName,
          description: "Second subordinate role",
          permissions: ["tools:use"],
          isBuiltin: false,
        },
      ]);

      const leadId = randomUUID();
      const bobId = randomUUID();
      createdUserIds.push(leadId, bobId);
      await db.insert(schema.users).values([
        {
          id: leadId,
          username: `lead-put-${suffix}`,
          passwordHash: await hashPassword("Password123!"),
          role: leadRoleName,
          team: team.id,
          createdAt: new Date(),
          updatedAt: new Date(),
          mustChangePassword: false,
        },
        {
          id: bobId,
          username: `bob-put-${suffix}`,
          passwordHash: await hashPassword("Password123!"),
          role: subRoleName,
          team: team.id,
          createdAt: new Date(),
          updatedAt: new Date(),
          mustChangePassword: false,
        },
      ]);

      const leadLogin = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: `lead-put-${suffix}`, password: "Password123!" },
      });
      const leadToken = leadLogin.cookies?.find(
        (c: { name: string; value: string }) => c.name === "snapotter-session",
      )?.value;

      interceptFn = async (_tx, id) => {
        if (id === bobId) {
          await db.update(schema.users).set({ role: "user" }).where(eq(schema.users.id, admin1Id));
          await db.update(schema.users).set({ role: "admin" }).where(eq(schema.users.id, bobId));
        }
      };

      const promotedTargetRes = await testApp.app.inject({
        method: "PUT",
        url: `/api/auth/users/${bobId}`,
        headers: { cookie: `snapotter-session=${leadToken}` },
        payload: { role: nextSubRoleName },
      });
      expect(promotedTargetRes.statusCode).toBe(403);
      expect(JSON.parse(promotedTargetRes.body)).toEqual({
        error: "Cannot manage a user beyond your role authority",
        code: "ESCALATION_DENIED",
      });

      const [bobAfter] = await db.select().from(schema.users).where(eq(schema.users.id, bobId));
      expect(bobAfter.role).toBe("admin");

      // 3. When the actor retains admin authority (e.g. the synthetic anonymous admin)
      // and the target is the sole real admin, UNKNOWN_ROLE and UNKNOWN_TEAM still
      // precede 400 LAST_ADMIN, and 400 LAST_ADMIN is returned when role/team are valid.
      interceptFn = null;
      await ensureAnonymousUser();
      const anonSessionId = randomUUID();
      await db.insert(schema.sessions).values({
        id: anonSessionId,
        userId: "anonymous",
        expiresAt: new Date(Date.now() + 3600_000),
      });

      beforeTransactionFn = async () => {
        await db.delete(schema.roles).where(eq(schema.roles.name, nextSubRoleName));
      };
      const unknownRoleRes = await testApp.app.inject({
        method: "PUT",
        url: `/api/auth/users/${bobId}`,
        headers: { cookie: `snapotter-session=${anonSessionId}` },
        payload: { role: nextSubRoleName },
      });
      expect(unknownRoleRes.statusCode).toBe(400);
      expect(JSON.parse(unknownRoleRes.body)).toEqual({
        error: "Role not found",
        code: "UNKNOWN_ROLE",
      });

      const ephemeralTeamId = randomUUID();
      await db.insert(schema.teams).values({
        id: ephemeralTeamId,
        name: `ephemeral-team-${suffix}`,
        createdAt: new Date(),
      });
      beforeTransactionFn = async () => {
        await db.delete(schema.teams).where(eq(schema.teams.id, ephemeralTeamId));
      };
      const unknownTeamRes = await testApp.app.inject({
        method: "PUT",
        url: `/api/auth/users/${bobId}`,
        headers: { cookie: `snapotter-session=${anonSessionId}` },
        payload: { role: "user", team: ephemeralTeamId },
      });
      expect(unknownTeamRes.statusCode).toBe(400);
      expect(JSON.parse(unknownTeamRes.body)).toEqual({
        error: "Team not found",
        code: "UNKNOWN_TEAM",
      });

      const lastAdminRes = await testApp.app.inject({
        method: "PUT",
        url: `/api/auth/users/${bobId}`,
        headers: { cookie: `snapotter-session=${anonSessionId}` },
        payload: { role: "user" },
      });
      expect(lastAdminRes.statusCode).toBe(400);
      expect(JSON.parse(lastAdminRes.body)).toEqual({
        error: "Cannot demote the last admin",
        code: "LAST_ADMIN",
      });
    } finally {
      interceptFn = null;
      beforeTransactionFn = null;
      await db.delete(schema.users).where(eq(schema.users.id, "anonymous"));
      if (createdUserIds.length > 0) {
        await db.delete(schema.users).where(inArray(schema.users.id, createdUserIds));
      }
      if (priorAdminIds.length > 0) {
        await db
          .update(schema.users)
          .set({ role: "admin" })
          .where(inArray(schema.users.id, priorAdminIds));
      }
    }
  });

  it("DELETE /api/auth/users/:id checks in-transaction authority before returning 400 LAST_ADMIN in both transactions (#2743)", async () => {
    const suffix = randomUUID().slice(0, 8);
    const [team] = await db.select().from(schema.teams).limit(1);

    const priorAdmins = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.role, "admin"), ne(schema.users.id, "anonymous")));
    const priorAdminIds = priorAdmins.map((u) => u.id);

    if (priorAdminIds.length > 0) {
      await db
        .update(schema.users)
        .set({ role: "user" })
        .where(inArray(schema.users.id, priorAdminIds));
    }

    const createdUserIds: string[] = [];
    let storedPathToClean: string | null = null;
    try {
      const leadRoleName = `lead-del-last-${suffix}`;
      const subRoleName = `sub-del-last-${suffix}`;
      await db.insert(schema.roles).values([
        {
          id: randomUUID(),
          name: leadRoleName,
          description: "Scoped user manager for delete",
          permissions: ["tools:use", "users:manage"],
          isBuiltin: false,
        },
        {
          id: randomUUID(),
          name: subRoleName,
          description: "Subordinate role for delete",
          permissions: ["tools:use"],
          isBuiltin: false,
        },
      ]);

      // 1. Pre-storage transaction (txCount === 1): acting admin2 is demoted to user
      // (or admin3 is deleted) leaving admin1 as the sole admin, and admin1's stored
      // library file on disk is preserved because tx 1 aborts before deleteLibraryFileStorage.
      const admin1Id = randomUUID();
      const admin2Id = randomUUID();
      const admin3Id = randomUUID();
      createdUserIds.push(admin1Id, admin2Id, admin3Id);
      await db.insert(schema.users).values([
        {
          id: admin1Id,
          username: `sole-del-admin1-${suffix}`,
          passwordHash: await hashPassword("Password123!"),
          role: "admin",
          team: team.id,
          createdAt: new Date(),
          updatedAt: new Date(),
          mustChangePassword: false,
        },
        {
          id: admin2Id,
          username: `acting-del-admin2-${suffix}`,
          passwordHash: await hashPassword("Password123!"),
          role: "admin",
          team: team.id,
          createdAt: new Date(),
          updatedAt: new Date(),
          mustChangePassword: false,
        },
        {
          id: admin3Id,
          username: `deleted-del-admin3-${suffix}`,
          passwordHash: await hashPassword("Password123!"),
          role: "admin",
          team: team.id,
          createdAt: new Date(),
          updatedAt: new Date(),
          mustChangePassword: false,
        },
      ]);

      const storedName = `keep-on-pretx-abort-${suffix}.png`;
      storedPathToClean = getStoredFilePath(storedName);
      await mkdir(env.FILES_STORAGE_PATH, { recursive: true });
      await writeFile(storedPathToClean, "library-file-bytes");
      await db.insert(schema.userFiles).values({
        id: randomUUID(),
        userId: admin1Id,
        originalName: "keep.png",
        storedName,
        mimeType: "image/png",
        size: 18,
        createdAt: new Date(),
      });

      const admin2Login = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: `acting-del-admin2-${suffix}`, password: "Password123!" },
      });
      const admin2Token = admin2Login.cookies?.find(
        (c: { name: string; value: string }) => c.name === "snapotter-session",
      )?.value;

      const admin3Login = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: `deleted-del-admin3-${suffix}`, password: "Password123!" },
      });
      const admin3Token = admin3Login.cookies?.find(
        (c: { name: string; value: string }) => c.name === "snapotter-session",
      )?.value;

      let txCount1 = 0;
      interceptFn = async (_tx, id) => {
        if (id === admin1Id) {
          txCount1 += 1;
          if (txCount1 === 1) {
            await db
              .update(schema.users)
              .set({ role: "user" })
              .where(inArray(schema.users.id, [admin2Id, admin3Id]));
          }
        }
      };

      const preTxActorDemotedRes = await testApp.app.inject({
        method: "DELETE",
        url: `/api/auth/users/${admin1Id}`,
        headers: { cookie: `snapotter-session=${admin2Token}` },
      });
      expect(preTxActorDemotedRes.statusCode).toBe(403);
      expect(JSON.parse(preTxActorDemotedRes.body)).toEqual({
        error: "Cannot manage a user beyond your role authority",
        code: "ESCALATION_DENIED",
      });
      expect(txCount1).toBe(1);
      expect(existsSync(storedPathToClean)).toBe(true);

      await db.update(schema.users).set({ role: "admin" }).where(eq(schema.users.id, admin3Id));
      let txCount1b = 0;
      interceptFn = async (_tx, id) => {
        if (id === admin1Id) {
          txCount1b += 1;
          if (txCount1b === 1) {
            await db.delete(schema.users).where(eq(schema.users.id, admin3Id));
          }
        }
      };

      const preTxActorDeletedRes = await testApp.app.inject({
        method: "DELETE",
        url: `/api/auth/users/${admin1Id}`,
        headers: { cookie: `snapotter-session=${admin3Token}` },
      });
      expect(preTxActorDeletedRes.statusCode).toBe(403);
      expect(JSON.parse(preTxActorDeletedRes.body)).toEqual({
        error: "Cannot manage a user beyond your role authority",
        code: "ESCALATION_DENIED",
      });
      expect(txCount1b).toBe(1);
      expect(existsSync(storedPathToClean)).toBe(true);

      // 2. Pre-storage transaction (txCount === 1): custom manager deletes subordinate bob,
      // who is promoted to the sole admin before the first transaction runs.
      const leadId = randomUUID();
      const bobId = randomUUID();
      createdUserIds.push(leadId, bobId);
      await db.insert(schema.users).values([
        {
          id: leadId,
          username: `lead-del-${suffix}`,
          passwordHash: await hashPassword("Password123!"),
          role: leadRoleName,
          team: team.id,
          createdAt: new Date(),
          updatedAt: new Date(),
          mustChangePassword: false,
        },
        {
          id: bobId,
          username: `bob-del-${suffix}`,
          passwordHash: await hashPassword("Password123!"),
          role: subRoleName,
          team: team.id,
          createdAt: new Date(),
          updatedAt: new Date(),
          mustChangePassword: false,
        },
      ]);

      const leadLogin = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: `lead-del-${suffix}`, password: "Password123!" },
      });
      const leadToken = leadLogin.cookies?.find(
        (c: { name: string; value: string }) => c.name === "snapotter-session",
      )?.value;

      let txCount2 = 0;
      interceptFn = async (_tx, id) => {
        if (id === bobId) {
          txCount2 += 1;
          if (txCount2 === 1) {
            await db
              .update(schema.users)
              .set({ role: "user" })
              .where(eq(schema.users.id, admin1Id));
            await db.update(schema.users).set({ role: "admin" }).where(eq(schema.users.id, bobId));
          }
        }
      };

      const preTxTargetPromotedRes = await testApp.app.inject({
        method: "DELETE",
        url: `/api/auth/users/${bobId}`,
        headers: { cookie: `snapotter-session=${leadToken}` },
      });
      expect(preTxTargetPromotedRes.statusCode).toBe(403);
      expect(JSON.parse(preTxTargetPromotedRes.body)).toEqual({
        error: "Cannot manage a user beyond your role authority",
        code: "ESCALATION_DENIED",
      });
      expect(txCount2).toBe(1);

      // 3. Final transaction (txCount === 2): restore admin1 and admin2 as admins (plus bob
      // is currently admin, so 3 admins exist during txCount === 1). On txCount === 2,
      // demote admin2 and bob to user so admin1 is the sole admin and admin2 lost authority.
      await db
        .update(schema.users)
        .set({ role: "admin" })
        .where(inArray(schema.users.id, [admin1Id, admin2Id, bobId]));

      let txCount3 = 0;
      interceptFn = async (_tx, id) => {
        if (id === admin1Id) {
          txCount3 += 1;
          if (txCount3 === 2) {
            await db
              .update(schema.users)
              .set({ role: "user" })
              .where(inArray(schema.users.id, [admin2Id, bobId]));
          }
        }
      };

      const finalTxActorDemotedRes = await testApp.app.inject({
        method: "DELETE",
        url: `/api/auth/users/${admin1Id}`,
        headers: { cookie: `snapotter-session=${admin2Token}` },
      });
      expect(finalTxActorDemotedRes.statusCode).toBe(403);
      expect(JSON.parse(finalTxActorDemotedRes.body)).toEqual({
        error: "Cannot manage a user beyond your role authority",
        code: "ESCALATION_DENIED",
      });
      expect(txCount3).toBe(2);

      // 4. Final transaction (txCount === 2): bob is subRoleName during txCount === 1 while
      // admin1 is admin. On txCount === 2, promote bob to admin and demote admin1 to user so
      // bob becomes the sole admin and beyond lead's authority.
      await db.update(schema.users).set({ role: subRoleName }).where(eq(schema.users.id, bobId));
      let txCount4 = 0;
      interceptFn = async (_tx, id) => {
        if (id === bobId) {
          txCount4 += 1;
          if (txCount4 === 2) {
            await db
              .update(schema.users)
              .set({ role: "user" })
              .where(eq(schema.users.id, admin1Id));
            await db.update(schema.users).set({ role: "admin" }).where(eq(schema.users.id, bobId));
          }
        }
      };

      const finalTxTargetPromotedRes = await testApp.app.inject({
        method: "DELETE",
        url: `/api/auth/users/${bobId}`,
        headers: { cookie: `snapotter-session=${leadToken}` },
      });
      expect(finalTxTargetPromotedRes.statusCode).toBe(403);
      expect(JSON.parse(finalTxTargetPromotedRes.body)).toEqual({
        error: "Cannot manage a user beyond your role authority",
        code: "ESCALATION_DENIED",
      });
      expect(txCount4).toBe(2);

      const [bobAfter] = await db.select().from(schema.users).where(eq(schema.users.id, bobId));
      expect(bobAfter).toBeDefined();
      expect(bobAfter.role).toBe("admin");

      // 5. When the actor retains admin authority (e.g. the synthetic anonymous admin)
      // and the target is the sole real admin (both in tx 1 and when becoming the sole
      // admin in tx 2), 400 LAST_ADMIN is returned.
      interceptFn = null;
      await ensureAnonymousUser();
      const anonSessionId = randomUUID();
      await db.insert(schema.sessions).values({
        id: anonSessionId,
        userId: "anonymous",
        expiresAt: new Date(Date.now() + 3600_000),
      });

      const preTxLastAdminRes = await testApp.app.inject({
        method: "DELETE",
        url: `/api/auth/users/${bobId}`,
        headers: { cookie: `snapotter-session=${anonSessionId}` },
      });
      expect(preTxLastAdminRes.statusCode).toBe(400);
      expect(JSON.parse(preTxLastAdminRes.body)).toEqual({
        error: "Cannot delete the last admin",
        code: "LAST_ADMIN",
      });

      await db.update(schema.users).set({ role: "admin" }).where(eq(schema.users.id, admin1Id));
      let txCount5 = 0;
      interceptFn = async (_tx, id) => {
        if (id === bobId) {
          txCount5 += 1;
          if (txCount5 === 2) {
            await db
              .update(schema.users)
              .set({ role: "user" })
              .where(eq(schema.users.id, admin1Id));
          }
        }
      };

      const finalTxLastAdminRes = await testApp.app.inject({
        method: "DELETE",
        url: `/api/auth/users/${bobId}`,
        headers: { cookie: `snapotter-session=${anonSessionId}` },
      });
      expect(finalTxLastAdminRes.statusCode).toBe(400);
      expect(JSON.parse(finalTxLastAdminRes.body)).toEqual({
        error: "Cannot delete the last admin",
        code: "LAST_ADMIN",
      });
      expect(txCount5).toBe(2);

      // 6. When the target user is deleted before the pre-storage transaction (txCount === 1)
      // while the actor retains authority, 404 NOT_FOUND is returned from tx 1.
      const doomedId = randomUUID();
      await db.insert(schema.users).values({
        id: doomedId,
        username: `doomed-pretx-${suffix}`,
        passwordHash: await hashPassword("Password123!"),
        role: "user",
        team: team.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        mustChangePassword: false,
      });

      let txCount6 = 0;
      interceptFn = async (_tx, id) => {
        if (id === doomedId) {
          txCount6 += 1;
          if (txCount6 === 1) {
            await db.delete(schema.users).where(eq(schema.users.id, doomedId));
          }
        }
      };

      const preTxNotFoundRes = await testApp.app.inject({
        method: "DELETE",
        url: `/api/auth/users/${doomedId}`,
        headers: { cookie: `snapotter-session=${anonSessionId}` },
      });
      expect(preTxNotFoundRes.statusCode).toBe(404);
      expect(JSON.parse(preTxNotFoundRes.body)).toEqual({
        error: "User not found",
        code: "NOT_FOUND",
      });
      expect(txCount6).toBe(1);
    } finally {
      interceptFn = null;
      if (storedPathToClean) {
        await rm(storedPathToClean, { force: true });
      }
      await db.delete(schema.users).where(eq(schema.users.id, "anonymous"));
      if (createdUserIds.length > 0) {
        await db.delete(schema.users).where(inArray(schema.users.id, createdUserIds));
      }
      if (priorAdminIds.length > 0) {
        await db
          .update(schema.users)
          .set({ role: "admin" })
          .where(inArray(schema.users.id, priorAdminIds));
      }
    }
  });
});
