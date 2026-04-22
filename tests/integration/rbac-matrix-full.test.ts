/**
 * Comprehensive RBAC route permission matrix.
 *
 * Tests every route × every role (admin, editor, user, unauthenticated)
 * to verify the correct HTTP status code is returned. Also validates
 * cross-role session isolation and token edge cases.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../apps/api/src/db/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "./test-server.js";

let testApp: TestApp;
let adminToken: string;
let editorToken: string;
let userToken: string;

const runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);

  // Create editor
  const editorUsername = `full_editor_${runId}`;
  await testApp.app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { username: editorUsername, password: "EditorPass1", role: "editor" },
  });
  db.update(schema.users)
    .set({ mustChangePassword: false })
    .where(eq(schema.users.username, editorUsername))
    .run();
  const editorLogin = await testApp.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: editorUsername, password: "EditorPass1" },
  });
  editorToken = JSON.parse(editorLogin.body).token;

  // Create user
  const userUsername = `full_user_${runId}`;
  await testApp.app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { username: userUsername, password: "UserPass12", role: "user" },
  });
  db.update(schema.users)
    .set({ mustChangePassword: false })
    .where(eq(schema.users.username, userUsername))
    .run();
  const userLogin = await testApp.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: userUsername, password: "UserPass12" },
  });
  userToken = JSON.parse(userLogin.body).token;
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

// ---------------------------------------------------------------------------
// Route permission matrix
// ---------------------------------------------------------------------------

interface RouteTest {
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: string;
  payload?: unknown | (() => unknown);
  admin: number;
  editor: number;
  user: number;
  unauth: number;
  label?: string;
}

const routes: RouteTest[] = [
  // --- Public routes (no auth required) ---
  {
    method: "GET",
    url: "/api/v1/health",
    admin: 200,
    editor: 200,
    user: 200,
    unauth: 200,
    label: "public health check",
  },
  {
    method: "GET",
    url: "/api/v1/config/auth",
    admin: 200,
    editor: 200,
    user: 200,
    unauth: 200,
    label: "public auth config",
  },

  // --- Auth-only routes (any authenticated user) ---
  {
    method: "GET",
    url: "/api/v1/settings",
    admin: 200,
    editor: 200,
    user: 200,
    unauth: 401,
    label: "settings:read",
  },
  {
    method: "GET",
    url: "/api/v1/files",
    admin: 200,
    editor: 200,
    user: 200,
    unauth: 401,
    label: "requireAuth",
  },
  {
    method: "GET",
    url: "/api/v1/pipeline/list",
    admin: 200,
    editor: 200,
    user: 200,
    unauth: 401,
    label: "requireAuth",
  },
  {
    method: "GET",
    url: "/api/v1/api-keys",
    admin: 200,
    editor: 200,
    user: 200,
    unauth: 401,
    label: "requireAuth",
  },
  {
    method: "POST",
    url: "/api/v1/api-keys",
    payload: { name: `test-key-${runId}` },
    admin: 201,
    editor: 201,
    user: 201,
    unauth: 401,
    label: "requireAuth (create api key)",
  },

  // --- Admin-only routes ---
  {
    method: "PUT",
    url: "/api/v1/settings",
    payload: { _test: "v" },
    admin: 200,
    editor: 403,
    user: 403,
    unauth: 401,
    label: "settings:write",
  },
  {
    method: "GET",
    url: "/api/auth/users",
    admin: 200,
    editor: 403,
    user: 403,
    unauth: 401,
    label: "users:manage",
  },
  {
    method: "POST",
    url: "/api/auth/register",
    payload: () => ({
      username: `reg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      password: "TempPass1",
      role: "user",
    }),
    admin: 201,
    editor: 403,
    user: 403,
    unauth: 401,
    label: "users:manage (register)",
  },
  {
    method: "GET",
    url: "/api/v1/teams",
    admin: 200,
    editor: 403,
    user: 403,
    unauth: 401,
    label: "teams:manage",
  },
  {
    method: "POST",
    url: "/api/v1/teams",
    payload: () => ({
      name: `team_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    }),
    admin: 201,
    editor: 403,
    user: 403,
    unauth: 401,
    label: "teams:manage (create)",
  },
  {
    method: "GET",
    url: "/api/v1/roles",
    admin: 200,
    editor: 403,
    user: 403,
    unauth: 401,
    label: "audit:read (roles list)",
  },
  {
    method: "POST",
    url: "/api/v1/roles",
    payload: () => ({
      name: `role_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      permissions: ["tools:use", "files:own"],
    }),
    admin: 201,
    editor: 403,
    user: 403,
    unauth: 401,
    label: "users:manage (create role)",
  },
  {
    method: "GET",
    url: "/api/v1/audit-log",
    admin: 200,
    editor: 403,
    user: 403,
    unauth: 401,
    label: "audit:read",
  },
  {
    method: "GET",
    url: "/api/v1/admin/health",
    admin: 200,
    editor: 403,
    user: 403,
    unauth: 401,
    label: "system:health",
  },
  {
    method: "DELETE",
    url: "/api/v1/settings/logo",
    admin: 200,
    editor: 403,
    user: 403,
    unauth: 401,
    label: "branding:manage (delete logo)",
  },
];

describe("RBAC route permission matrix (full)", () => {
  for (const route of routes) {
    for (const [role, expectedStatus] of Object.entries({
      admin: route.admin,
      editor: route.editor,
      user: route.user,
      unauth: route.unauth,
    })) {
      const suffix = route.label ? ` [${route.label}]` : "";
      it(`${route.method} ${route.url} -> ${role} = ${expectedStatus}${suffix}`, async () => {
        const headers: Record<string, string> = {};
        const token =
          role === "admin"
            ? adminToken
            : role === "editor"
              ? editorToken
              : role === "user"
                ? userToken
                : undefined;
        if (token) {
          headers.authorization = `Bearer ${token}`;
        }

        const payload = typeof route.payload === "function" ? route.payload() : route.payload;

        const res = await testApp.app.inject({
          method: route.method,
          url: route.url,
          headers,
          ...(payload ? { payload } : {}),
        });
        expect(res.statusCode).toBe(expectedStatus);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Cross-role isolation
// ---------------------------------------------------------------------------

describe("Cross-role isolation", () => {
  it("editor session returns correct role and permissions", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${editorToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.role).toBe("editor");
    expect(body.user.permissions).toEqual(
      expect.arrayContaining([
        "tools:use",
        "files:own",
        "files:all",
        "apikeys:own",
        "pipelines:own",
        "pipelines:all",
        "settings:read",
      ]),
    );
    // Must NOT have admin-only permissions
    expect(body.user.permissions).not.toContain("settings:write");
    expect(body.user.permissions).not.toContain("users:manage");
    expect(body.user.permissions).not.toContain("teams:manage");
    expect(body.user.permissions).not.toContain("branding:manage");
    expect(body.user.permissions).not.toContain("features:manage");
    expect(body.user.permissions).not.toContain("system:health");
    expect(body.user.permissions).not.toContain("audit:read");
  });

  it("user session returns correct role and permissions", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.role).toBe("user");
    expect(body.user.permissions).toEqual(
      expect.arrayContaining([
        "tools:use",
        "files:own",
        "apikeys:own",
        "pipelines:own",
        "settings:read",
      ]),
    );
    // Must NOT have editor or admin permissions
    expect(body.user.permissions).not.toContain("files:all");
    expect(body.user.permissions).not.toContain("pipelines:all");
    expect(body.user.permissions).not.toContain("settings:write");
    expect(body.user.permissions).not.toContain("users:manage");
    expect(body.user.permissions).not.toContain("teams:manage");
  });

  it("invalid token returns 401", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: "Bearer totally-bogus-token-value" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("expired session returns 401", async () => {
    // Create a session, then manually expire it in the DB
    const expiredUsername = `expired_${runId}`;
    await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: expiredUsername, password: "ExpiredPass1", role: "user" },
    });
    db.update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, expiredUsername))
      .run();

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: expiredUsername, password: "ExpiredPass1" },
    });
    const expiredToken = JSON.parse(loginRes.body).token;

    // Manually expire the session
    db.update(schema.sessions)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.sessions.id, expiredToken))
      .run();

    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${expiredToken}` },
    });
    expect(res.statusCode).toBe(401);
  });
});
