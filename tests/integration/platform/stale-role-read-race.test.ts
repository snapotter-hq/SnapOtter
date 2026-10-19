import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { hashPassword } from "../../../apps/api/src/plugins/auth.js";

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
});
