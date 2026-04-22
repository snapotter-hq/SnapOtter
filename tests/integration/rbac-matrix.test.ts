import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../apps/api/src/db/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "./test-server.js";

let testApp: TestApp;
let adminToken: string;
let editorToken: string;
let userToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);

  // Create editor
  await testApp.app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { username: "matrix_editor", password: "EditorPass1", role: "editor" },
  });
  db.update(schema.users)
    .set({ mustChangePassword: false })
    .where(eq(schema.users.username, "matrix_editor"))
    .run();
  const editorLogin = await testApp.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "matrix_editor", password: "EditorPass1" },
  });
  editorToken = JSON.parse(editorLogin.body).token;

  // Create user
  await testApp.app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { username: "matrix_user", password: "UserPass12", role: "user" },
  });
  db.update(schema.users)
    .set({ mustChangePassword: false })
    .where(eq(schema.users.username, "matrix_user"))
    .run();
  const userLogin = await testApp.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "matrix_user", password: "UserPass12" },
  });
  userToken = JSON.parse(userLogin.body).token;
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

interface RouteTest {
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: string;
  payload?: unknown;
  admin: number;
  editor: number;
  user: number;
  unauth: number;
}

const routes: RouteTest[] = [
  // Settings
  { method: "GET", url: "/api/v1/settings", admin: 200, editor: 200, user: 200, unauth: 401 },
  {
    method: "PUT",
    url: "/api/v1/settings",
    payload: { _test: "v" },
    admin: 200,
    editor: 403,
    user: 403,
    unauth: 401,
  },

  // Users management
  { method: "GET", url: "/api/auth/users", admin: 200, editor: 403, user: 403, unauth: 401 },

  // Teams
  { method: "GET", url: "/api/v1/teams", admin: 200, editor: 403, user: 403, unauth: 401 },

  // Audit log
  { method: "GET", url: "/api/v1/audit-log", admin: 200, editor: 403, user: 403, unauth: 401 },

  // Admin health
  { method: "GET", url: "/api/v1/admin/health", admin: 200, editor: 403, user: 403, unauth: 401 },

  // Files
  { method: "GET", url: "/api/v1/files", admin: 200, editor: 200, user: 200, unauth: 401 },

  // Pipelines
  { method: "GET", url: "/api/v1/pipeline/list", admin: 200, editor: 200, user: 200, unauth: 401 },

  // API keys
  { method: "GET", url: "/api/v1/api-keys", admin: 200, editor: 200, user: 200, unauth: 401 },

  // Health (public)
  { method: "GET", url: "/api/v1/health", admin: 200, editor: 200, user: 200, unauth: 200 },
];

describe("RBAC permission matrix", () => {
  for (const route of routes) {
    for (const [role, expectedStatus] of Object.entries({
      admin: route.admin,
      editor: route.editor,
      user: route.user,
      unauth: route.unauth,
    })) {
      it(`${route.method} ${route.url} → ${role} = ${expectedStatus}`, async () => {
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

        const res = await testApp.app.inject({
          method: route.method,
          url: route.url,
          headers,
          ...(route.payload ? { payload: route.payload } : {}),
        });
        expect(res.statusCode).toBe(expectedStatus);
      });
    }
  }
});
