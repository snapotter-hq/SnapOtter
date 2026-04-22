import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../apps/api/src/db/index.js";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("permissions in auth responses", () => {
  it("login response includes permissions array for admin", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "Adminpass1" },
    });
    const body = JSON.parse(res.body);
    expect(body.user.permissions).toBeDefined();
    expect(body.user.permissions).toContain("users:manage");
    expect(body.user.permissions).toContain("tools:use");
    expect(body.user.permissions).toContain("files:all");
  });

  it("login response includes permissions array for user role", async () => {
    // Create a non-admin user
    await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: "permtest", password: "TestPass1", role: "user" },
    });
    db.update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, "permtest"))
      .run();

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "permtest", password: "TestPass1" },
    });
    const body = JSON.parse(res.body);
    expect(body.user.permissions).toContain("tools:use");
    expect(body.user.permissions).toContain("files:own");
    expect(body.user.permissions).not.toContain("users:manage");
    expect(body.user.permissions).not.toContain("files:all");
  });

  it("session response includes permissions array", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.user.permissions).toBeDefined();
    expect(body.user.permissions).toContain("users:manage");
  });

  it("login response includes teamName", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "Adminpass1" },
    });
    const body = JSON.parse(res.body);
    expect(body.user.teamName).toBeDefined();
    expect(typeof body.user.teamName).toBe("string");
  });
});

describe("permission enforcement on routes", () => {
  let userToken: string;

  beforeAll(async () => {
    // Create a regular "user" role account
    const regRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: "regularuser", password: "UserPass1", role: "user" },
    });
    // If user already exists from a prior run, that's fine
    if (regRes.statusCode !== 201 && regRes.statusCode !== 409) {
      throw new Error(`Failed to create test user: ${regRes.body}`);
    }

    // Clear mustChangePassword so the user can access routes
    db.update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, "regularuser"))
      .run();

    // Login as the regular user
    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "regularuser", password: "UserPass1" },
    });
    const loginBody = JSON.parse(loginRes.body);
    if (!loginBody.token) {
      throw new Error(`User login failed: ${loginRes.body}`);
    }
    userToken = loginBody.token;
  }, 15_000);

  // -- User cannot access admin-only routes (403) --

  it("user cannot list users (GET /api/auth/users)", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/users",
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("user cannot register new users (POST /api/auth/register)", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${userToken}` },
      payload: { username: "sneaky", password: "SneakyPass1", role: "user" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("user cannot update settings (PUT /api/v1/settings)", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${userToken}` },
      payload: { appTitle: "Hacked" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("user cannot create teams (POST /api/v1/teams)", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: "Evil Team" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("user cannot list teams (GET /api/v1/teams)", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/teams",
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  // -- User CAN access allowed routes (200) --

  it("user can read settings (GET /api/v1/settings)", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("user can change own password (POST /api/auth/change-password)", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/change-password",
      headers: { authorization: `Bearer ${userToken}` },
      payload: { currentPassword: "UserPass1", newPassword: "UserPass2" },
    });
    expect(res.statusCode).toBe(200);

    // Login with new password to get a fresh token for remaining tests
    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "regularuser", password: "UserPass2" },
    });
    const loginBody = JSON.parse(loginRes.body);
    if (loginBody.token) {
      userToken = loginBody.token;
    }
  });

  // -- Admin CAN access admin routes (200) --

  it("admin can list users (GET /api/auth/users)", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/users",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.users).toBeDefined();
    expect(Array.isArray(body.users)).toBe(true);
  });

  it("admin can update settings (PUT /api/v1/settings)", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { appTitle: "Test Title" },
    });
    expect(res.statusCode).toBe(200);
  });

  // -- Unauthenticated gets 401 --

  it("unauthenticated request gets 401 on GET /api/auth/users", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/users",
    });
    expect(res.statusCode).toBe(401);
  });

  it("unauthenticated request gets 401 on PUT /api/v1/settings", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      payload: { appTitle: "Hacked" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("unauthenticated request gets 401 on GET /api/v1/settings", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/settings",
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("tool and pipeline permission enforcement", () => {
  const fixturePath = join(import.meta.dirname, "..", "fixtures", "test-200x150.png");
  const fixtureBuffer = readFileSync(fixturePath);

  it("unauthenticated user cannot use tools", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.png",
        contentType: "image/png",
        content: fixtureBuffer,
      },
      {
        name: "settings",
        content: JSON.stringify({ angle: 90 }),
      },
    ]);

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/rotate",
      headers: { "content-type": contentType },
      body,
    });
    expect(res.statusCode).toBe(401);
  });

  it("authenticated user can use tools", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.png",
        contentType: "image/png",
        content: fixtureBuffer,
      },
      {
        name: "settings",
        content: JSON.stringify({ angle: 90 }),
      },
    ]);

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/rotate",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("API key ownership scoping", () => {
  let userAToken: string;
  let userBToken: string;

  beforeAll(async () => {
    // Create user A
    await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: "keyuserA", password: "TestPass1", role: "user" },
    });
    db.update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, "keyuserA"))
      .run();
    const loginA = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "keyuserA", password: "TestPass1" },
    });
    userAToken = JSON.parse(loginA.body).token;

    // Create user B
    await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: "keyuserB", password: "TestPass1", role: "user" },
    });
    db.update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, "keyuserB"))
      .run();
    const loginB = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "keyuserB", password: "TestPass1" },
    });
    userBToken = JSON.parse(loginB.body).token;
  });

  it("user A cannot see user B's API keys", async () => {
    // User A creates a key
    await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${userAToken}` },
      payload: { name: "A-key" },
    });

    // User B creates a key
    await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${userBToken}` },
      payload: { name: "B-key" },
    });

    // User A lists keys - should only see their own
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${userAToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.apiKeys.every((k: any) => k.name === "A-key")).toBe(true);
    expect(body.apiKeys.some((k: any) => k.name === "B-key")).toBe(false);
  });

  it("admin can see all API keys", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = JSON.parse(res.body);
    // Admin should see keys from both users
    expect(body.apiKeys.some((k: any) => k.name === "A-key")).toBe(true);
    expect(body.apiKeys.some((k: any) => k.name === "B-key")).toBe(true);
  });

  it("user A cannot delete user B's API key", async () => {
    // Get user B's keys
    const listRes = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${userBToken}` },
    });
    const bKeys = JSON.parse(listRes.body).apiKeys;
    if (bKeys.length === 0) throw new Error("Expected user B to have keys");

    // User A tries to delete user B's key
    const res = await testApp.app.inject({
      method: "DELETE",
      url: `/api/v1/api-keys/${bKeys[0].id}`,
      headers: { authorization: `Bearer ${userAToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("file ownership scoping", () => {
  let userAToken: string;
  let userBToken: string;

  beforeAll(async () => {
    // Create two users (fileuserA and fileuserB)
    for (const name of ["fileuserA", "fileuserB"]) {
      await testApp.app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { username: name, password: "TestPass1", role: "user" },
      });
      db.update(schema.users)
        .set({ mustChangePassword: false })
        .where(eq(schema.users.username, name))
        .run();
    }
    const loginA = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "fileuserA", password: "TestPass1" },
    });
    userAToken = JSON.parse(loginA.body).token;
    const loginB = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "fileuserB", password: "TestPass1" },
    });
    userBToken = JSON.parse(loginB.body).token;
  });

  it("unauthenticated request to files returns 401", async () => {
    const res = await testApp.app.inject({ method: "GET", url: "/api/v1/files" });
    expect(res.statusCode).toBe(401);
  });

  it("user A cannot access user B's file by ID", async () => {
    // Upload as user A
    const testImage = readFileSync(join(import.meta.dirname, "..", "fixtures", "test-200x150.png"));
    const { body: uploadBody, contentType } = createMultipartPayload([
      { name: "file", filename: "test.png", contentType: "image/png", content: testImage },
    ]);
    const uploadRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": contentType, authorization: `Bearer ${userAToken}` },
      body: uploadBody,
    });
    const fileId = JSON.parse(uploadRes.body).files[0].id;

    // User B tries to access it - should get 404
    const res = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/files/${fileId}`,
      headers: { authorization: `Bearer ${userBToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("user B cannot download user A's file", async () => {
    // List user A's files
    const listRes = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/files",
      headers: { authorization: `Bearer ${userAToken}` },
    });
    const files = JSON.parse(listRes.body).files;
    expect(files.length).toBeGreaterThan(0);

    // User B tries to download
    const res = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/files/${files[0].id}/download`,
      headers: { authorization: `Bearer ${userBToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("admin can access any user's file", async () => {
    const listRes = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/files",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    // Admin should see files from user A
    const files = JSON.parse(listRes.body).files;
    expect(files.length).toBeGreaterThan(0);
  });

  it("user B cannot delete user A's file", async () => {
    const listRes = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/files",
      headers: { authorization: `Bearer ${userAToken}` },
    });
    const files = JSON.parse(listRes.body).files;
    expect(files.length).toBeGreaterThan(0);

    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/files",
      headers: { authorization: `Bearer ${userBToken}` },
      payload: { ids: [files[0].id] },
    });
    const body = JSON.parse(res.body);
    expect(body.deleted).toBe(0);
  });
});

describe("escalation prevention", () => {
  it("editor cannot create admin users", async () => {
    // First create an editor
    await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: "esceditor", password: "EscEditor1", role: "editor" },
    });
    db.update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, "esceditor"))
      .run();

    const editorLogin = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "esceditor", password: "EscEditor1" },
    });
    const editorToken = JSON.parse(editorLogin.body).token;

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${editorToken}` },
      payload: { username: "escalated", password: "Escalated1", role: "admin" },
    });
    // Editor doesn't have users:manage, so gets 403
    expect(res.statusCode).toBe(403);
  });

  it("cannot demote the last admin", async () => {
    const listRes = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/users",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const users = JSON.parse(listRes.body).users;
    const adminUser = users.find((u: any) => u.username === "admin");

    const res = await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${adminUser.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: "user" },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toMatch(/SELF_DEMOTE|LAST_ADMIN/);
  });

  it("admin can demote another admin when multiple admins exist", async () => {
    // Create a second admin
    await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: "admin2esc", password: "Admin2Esc1", role: "admin" },
    });
    db.update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, "admin2esc"))
      .run();

    const listRes = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/users",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const users = JSON.parse(listRes.body).users;
    const secondAdmin = users.find((u: any) => u.username === "admin2esc");

    const res = await testApp.app.inject({
      method: "PUT",
      url: `/api/auth/users/${secondAdmin.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: "editor" },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("pipeline ownership scoping", () => {
  let userToken: string;

  beforeAll(async () => {
    await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: "pipeuser", password: "TestPass1", role: "user" },
    });
    db.update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, "pipeuser"))
      .run();
    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "pipeuser", password: "TestPass1" },
    });
    userToken = JSON.parse(loginRes.body).token;
  });

  it("user can save and list their own pipelines", async () => {
    const saveRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/pipeline/save",
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        name: "My Pipeline",
        steps: [{ toolId: "rotate", settings: { angle: 90 } }],
      },
    });
    expect(saveRes.statusCode).toBe(201);

    const listRes = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/pipeline/list",
      headers: { authorization: `Bearer ${userToken}` },
    });
    const body = JSON.parse(listRes.body);
    expect(body.pipelines.some((p: any) => p.name === "My Pipeline")).toBe(true);
  });

  it("admin can see all users' pipelines", async () => {
    const listRes = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/pipeline/list",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = JSON.parse(listRes.body);
    expect(body.pipelines.some((p: any) => p.name === "My Pipeline")).toBe(true);
  });
});
