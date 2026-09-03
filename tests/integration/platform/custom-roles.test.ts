import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { raceInserts } from "../../helpers/pg-race.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("custom roles", () => {
  let customRoleId: string;

  it("lists built-in roles", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.roles.length).toBeGreaterThanOrEqual(3);
    expect(body.roles.some((r: any) => r.name === "admin" && r.isBuiltin)).toBe(true);
    expect(body.roles.some((r: any) => r.name === "editor" && r.isBuiltin)).toBe(true);
    expect(body.roles.some((r: any) => r.name === "user" && r.isBuiltin)).toBe(true);
  });

  it("creates a custom role", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "reviewer",
        description: "Can view all files and pipelines",
        permissions: ["files:all", "pipelines:all", "settings:read"],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.name).toBe("reviewer");
    expect(body.permissions).toEqual(["files:all", "pipelines:all", "settings:read"]);
    customRoleId = body.id;
  });

  it("cannot create duplicate role name", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "admin", permissions: ["tools:use"] },
    });
    expect(res.statusCode).toBe(409);
  });

  it("concurrent duplicate creates return one 201 and one 409, never 500", async () => {
    // Issue #927: requests that pass the duplicate pre-check before the
    // winner's insert commits used to surface the 23505 unique violation
    // as a 500. raceInserts holds both requests at the insert so each one
    // passes the pre-check.
    const name = `race-role-${Date.now().toString(36)}`;
    const create = () =>
      testApp.app.inject({
        method: "POST",
        url: "/api/v1/roles",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name, permissions: ["tools:use"] },
      });

    const results = await raceInserts("roles", 2, () => Promise.all([create(), create()]));
    const statuses = results.map((r) => r.statusCode).sort();
    expect(statuses).toEqual([201, 409]);

    const conflict = results.find((r) => r.statusCode === 409);
    expect(JSON.parse(conflict?.body ?? "{}")).toEqual({
      error: "Role name already exists",
      code: "CONFLICT",
    });

    const rows = await db.select().from(schema.roles).where(eq(schema.roles.name, name));
    expect(rows).toHaveLength(1);

    // The 409 loser must not leave a phantom audit row; ROLE_CREATED is
    // only written after the insert guard.
    const auditRows = await db
      .select()
      .from(schema.auditLog)
      .where(
        sql`${schema.auditLog.action} = 'ROLE_CREATED' AND ${schema.auditLog.details}->>'roleName' = ${name}`,
      );
    expect(auditRows).toHaveLength(1);

    await db.delete(schema.roles).where(eq(schema.roles.name, name));
  });

  it("can assign custom role to user", async () => {
    await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: "customroleuser", password: "CustomRole1", role: "reviewer" },
    });
    await db
      .update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, "customroleuser"));

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "customroleuser", password: "CustomRole1" },
    });
    const body = JSON.parse(loginRes.body);
    expect(body.user.role).toBe("reviewer");
    expect(body.user.permissions).toContain("files:all");
    expect(body.user.permissions).not.toContain("tools:use");
  });

  it("updates custom role permissions", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: `/api/v1/roles/${customRoleId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { permissions: ["files:all", "pipelines:all", "settings:read", "tools:use"] },
    });
    expect(res.statusCode).toBe(200);
  });

  it("cannot modify built-in roles", async () => {
    const listRes = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const builtinRole = JSON.parse(listRes.body).roles.find((r: any) => r.name === "admin");
    const res = await testApp.app.inject({
      method: "PUT",
      url: `/api/v1/roles/${builtinRole.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { permissions: ["tools:use"] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("cannot delete built-in roles", async () => {
    const listRes = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const builtinRole = JSON.parse(listRes.body).roles.find((r: any) => r.name === "admin");
    const res = await testApp.app.inject({
      method: "DELETE",
      url: `/api/v1/roles/${builtinRole.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("deleting custom role reassigns users to user", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: `/api/v1/roles/${customRoleId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "customroleuser", password: "CustomRole1" },
    });
    const body = JSON.parse(loginRes.body);
    expect(body.user.role).toBe("user");
  });

  it("requires users:manage to create roles", async () => {
    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "customroleuser", password: "CustomRole1" },
    });
    const userToken = JSON.parse(loginRes.body).token;

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: "hacker", permissions: ["users:manage"] },
    });
    expect(res.statusCode).toBe(403);
  });
});
