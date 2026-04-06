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
