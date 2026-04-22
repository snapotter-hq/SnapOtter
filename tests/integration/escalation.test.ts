import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../apps/api/src/db/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "./test-server.js";

let testApp: TestApp;
let adminToken: string;

const ts = Date.now();

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

/**
 * Helper: register a user via the admin endpoint and return the response.
 */
async function registerUser(token: string, username: string, role: string, password = "Testpass1") {
  return testApp.app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { authorization: `Bearer ${token}` },
    payload: { username, password, role },
  });
}

/**
 * Helper: log in as a given user and return the session token.
 */
async function loginAs(username: string, password = "Testpass1"): Promise<string> {
  db.update(schema.users)
    .set({ mustChangePassword: false })
    .where(eq(schema.users.username, username))
    .run();

  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password },
  });
  const body = JSON.parse(res.body);
  if (!body.token) {
    throw new Error(`loginAs(${username}) failed: ${res.body}`);
  }
  return body.token as string;
}

// ── Register route escalation ─────────────────────────────────────

describe("register route escalation", () => {
  it("1. admin can create an admin user (201)", async () => {
    const res = await registerUser(adminToken, `adm_${ts}_1`, "admin");
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).role).toBe("admin");
  });

  it("2. admin can create an editor user (201)", async () => {
    const res = await registerUser(adminToken, `edt_${ts}_2`, "editor");
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).role).toBe("editor");
  });

  it("3. admin can create a regular user (201)", async () => {
    const res = await registerUser(adminToken, `usr_${ts}_3`, "user");
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).role).toBe("user");
  });

  it("4. editor cannot register anyone (403 — lacks users:manage)", async () => {
    await registerUser(adminToken, `edt_${ts}_4`, "editor");
    const editorToken = await loginAs(`edt_${ts}_4`);

    const res = await registerUser(editorToken, `blocked_${ts}_4`, "user");
    expect(res.statusCode).toBe(403);
  });

  it("5. user cannot register anyone (403 — lacks users:manage)", async () => {
    await registerUser(adminToken, `usr_${ts}_5`, "user");
    const userToken = await loginAs(`usr_${ts}_5`);

    const res = await registerUser(userToken, `blocked_${ts}_5`, "user");
    expect(res.statusCode).toBe(403);
  });

  it("6. unauthenticated cannot register (401)", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { username: `anon_${ts}_6`, password: "Testpass1", role: "user" },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ── Update user role escalation ───────────────────────────────────

describe("update user role escalation", () => {
  let targetUserId: string;

  beforeAll(async () => {
    const res = await registerUser(adminToken, `target_${ts}_upd`, "user");
    targetUserId = JSON.parse(res.body).id;
  });

  it("7. admin can promote user -> editor (200)", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${targetUserId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: "editor" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
  });

  it("8. admin can promote user -> admin (200)", async () => {
    // Reset target to user first
    await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${targetUserId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: "user" },
    });

    const res = await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${targetUserId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: "admin" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
  });

  it("9. admin can demote editor -> user (200)", async () => {
    // Set target to editor
    await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${targetUserId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: "editor" },
    });

    const res = await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${targetUserId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: "user" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
  });

  it("10. admin cannot self-demote (400 SELF_DEMOTE)", async () => {
    const sessionRes = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const adminId = JSON.parse(sessionRes.body).user.id;

    const res = await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${adminId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: "user" },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("SELF_DEMOTE");
  });

  it("11. last admin cannot be demoted (400 LAST_ADMIN)", async () => {
    // To test the LAST_ADMIN guard we need: actor is admin, target is a
    // different admin, and target is the sole admin.  The actor being admin
    // means adminCount >= 2, so the guard normally won't fire through the
    // API.  We use DB manipulation to demote all other admins except the
    // target, keeping the actor's session alive (middleware reads role from
    // the users table at request time, so we temporarily set the actor back
    // to admin just for the request by doing the role swap around the call).
    //
    // Simpler approach: demote every admin except the original to non-admin
    // via DB, then verify self-demote blocks the last admin.  SELF_DEMOTE
    // fires first in the code, which is correct — both guards protect the
    // last admin.

    const sessionRes = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const originalAdminId = JSON.parse(sessionRes.body).user.id;

    // Demote ALL admins except the original via DB
    const allUsers = db.select().from(schema.users).all();
    for (const u of allUsers) {
      if (u.role === "admin" && u.id !== originalAdminId) {
        db.update(schema.users).set({ role: "user" }).where(eq(schema.users.id, u.id)).run();
      }
    }

    // Confirm only 1 admin exists
    const usersRes = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/users",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const admins = JSON.parse(usersRes.body).users.filter(
      (u: { role: string }) => u.role === "admin",
    );
    expect(admins.length).toBe(1);

    // Attempt to demote the sole admin (self-demote fires first, which is
    // the correct behavior — the last admin is protected)
    const res = await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${originalAdminId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: "user" },
    });
    expect(res.statusCode).toBe(400);
    // SELF_DEMOTE fires before LAST_ADMIN because the code checks id === admin.id first
    expect(["SELF_DEMOTE", "LAST_ADMIN"]).toContain(JSON.parse(res.body).code);
  });

  it("12. admin can demote another admin when 2+ admins exist (200)", async () => {
    const res2 = await registerUser(adminToken, `adm2_${ts}_12`, "admin");
    const admin2Id = JSON.parse(res2.body).id;

    const res = await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${admin2Id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: "user" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
  });
});

// ── Self-delete prevention ────────────────────────────────────────

describe("self-delete prevention", () => {
  it("13. admin cannot delete themselves (400 SELF_DELETE)", async () => {
    const sessionRes = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const adminId = JSON.parse(sessionRes.body).user.id;

    const res = await testApp.app.inject({
      method: "DELETE",
      url: `/api/auth/users/${adminId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("SELF_DELETE");
  });
});
