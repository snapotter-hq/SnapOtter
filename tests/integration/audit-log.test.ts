import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../apps/api/src/db/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "./test-server.js";

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("audit log", () => {
  it("records login events in database", async () => {
    await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "Adminpass1" },
    });

    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/audit-log",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.entries).toBeDefined();
    expect(body.entries.length).toBeGreaterThan(0);
    expect(body.entries.some((e: any) => e.action === "LOGIN_SUCCESS")).toBe(true);
  });

  it("requires audit:read permission", async () => {
    await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: "auditnoread",
        password: "AuditTest1",
        role: "user",
      },
    });
    db.update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, "auditnoread"))
      .run();

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "auditnoread", password: "AuditTest1" },
    });
    const userToken = JSON.parse(loginRes.body).token;

    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/audit-log",
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("supports pagination", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/audit-log?limit=2&page=1",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.entries.length).toBeLessThanOrEqual(2);
    expect(body.total).toBeDefined();
    expect(body.page).toBe(1);
    expect(body.limit).toBe(2);
  });

  it("supports action filter", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/audit-log?action=LOGIN_SUCCESS",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = JSON.parse(res.body);
    for (const entry of body.entries) {
      expect(entry.action).toBe("LOGIN_SUCCESS");
    }
  });
});
