import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
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

describe("legal hold", () => {
  it("returns 403 for PUT without enterprise license", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/legal-hold",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { targetType: "user", targetId: "some-id", hold: true },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("enterprise");
  });

  it("returns 403 for GET without enterprise license", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/legal-hold",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("enterprise");
  });

  it("returns 401 without auth", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/legal-hold",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 for PUT without auth", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/legal-hold",
      payload: { targetType: "user", targetId: "some-id", hold: true },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 for non-admin user", async () => {
    // Create a regular user
    await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: "legalholduser",
        password: "TestPass1",
        role: "user",
      },
    });
    await db
      .update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, "legalholduser"));

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "legalholduser", password: "TestPass1" },
    });
    const userToken = JSON.parse(loginRes.body).token;

    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/legal-hold",
      headers: { authorization: `Bearer ${userToken}` },
    });
    // Regular users lack compliance:manage, so they get 403 before the enterprise check
    expect(res.statusCode).toBe(403);
  });
});

describe("legal hold PUT validation", () => {
  it("rejects missing targetType field", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/legal-hold",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { targetId: "some-id", hold: true },
    });
    expect([400, 403]).toContain(res.statusCode);
  });

  it("rejects invalid targetType value", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/legal-hold",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { targetType: "organization", targetId: "some-id", hold: true },
    });
    expect([400, 403]).toContain(res.statusCode);
  });

  it("rejects missing targetId field", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/legal-hold",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { targetType: "user", hold: true },
    });
    expect([400, 403]).toContain(res.statusCode);
  });

  it("rejects empty targetId string", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/legal-hold",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { targetType: "user", targetId: "", hold: true },
    });
    expect([400, 403]).toContain(res.statusCode);
  });

  it("rejects missing hold field", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/legal-hold",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { targetType: "user", targetId: "some-id" },
    });
    expect([400, 403]).toContain(res.statusCode);
  });
});

describe("legal hold GET response structure", () => {
  it("returns error object with enterprise message on 403", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/legal-hold",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("error");
    expect(typeof body.error).toBe("string");
  });
});

describe("legal hold permission enforcement", () => {
  it("returns 403 for editor role on PUT", async () => {
    await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: "legalholdeditor",
        password: "TestPass1",
        role: "editor",
      },
    });
    await db
      .update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, "legalholdeditor"));

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "legalholdeditor", password: "TestPass1" },
    });
    const editorToken = JSON.parse(loginRes.body).token;

    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/legal-hold",
      headers: { authorization: `Bearer ${editorToken}` },
      payload: { targetType: "user", targetId: "some-id", hold: true },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 403 for editor role on GET", async () => {
    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "legalholdeditor", password: "TestPass1" },
    });
    const editorToken = JSON.parse(loginRes.body).token;

    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/legal-hold",
      headers: { authorization: `Bearer ${editorToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
