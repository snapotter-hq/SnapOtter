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

describe("GDPR data export", () => {
  it("returns 403 for POST without enterprise license", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/users/some-id/export",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("enterprise");
  });

  it("returns 403 for GET without enterprise license", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/users/some-id/export/some-job-id",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("enterprise");
  });

  it("returns 401 for POST without auth", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/users/some-id/export",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 for GET without auth", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/users/some-id/export/some-job-id",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 for DELETE purge without auth", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/users/some-id/purge",
      payload: { confirm: true },
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
        username: "gdprexportuser",
        password: "TestPass1",
        role: "user",
      },
    });
    await db
      .update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, "gdprexportuser"));

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "gdprexportuser", password: "TestPass1" },
    });
    const userToken = JSON.parse(loginRes.body).token;

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/users/some-id/export",
      headers: { authorization: `Bearer ${userToken}` },
    });
    // Regular users lack compliance:manage, so they get 403 before the enterprise check
    expect(res.statusCode).toBe(403);
  });
});

describe("GDPR data purge", () => {
  it("returns 403 without enterprise license for user purge", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/users/some-id/purge",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { confirm: true },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("enterprise");
  });

  it("returns 403 without enterprise license for team purge", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/teams/some-id/purge",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { confirm: true },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("enterprise");
  });

  it("requires confirmation body for purge", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/users/some-id/purge",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    // Should fail validation (400 or 403 depending on feature check order)
    expect([400, 403]).toContain(res.statusCode);
  });

  it("rejects purge with confirm: false", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/users/some-id/purge",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { confirm: false },
    });
    expect([400, 403]).toContain(res.statusCode);
  });

  it("returns 401 for user purge without auth", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/users/some-id/purge",
      payload: { confirm: true },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 for team purge without auth", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/teams/some-id/purge",
      payload: { confirm: true },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("GDPR export additional validation", () => {
  it("returns 401 for POST export with invalid token", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/users/some-id/export",
      headers: { authorization: "Bearer invalid-token-value" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 for GET export status with invalid token", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/users/some-id/export/some-job-id",
      headers: { authorization: "Bearer invalid-token-value" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("GDPR purge body validation", () => {
  it("rejects purge with confirm as string instead of boolean", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/users/some-id/purge",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { confirm: "true" },
    });
    expect([400, 403]).toContain(res.statusCode);
  });

  it("rejects purge with confirm: null", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/users/some-id/purge",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { confirm: null },
    });
    expect([400, 403]).toContain(res.statusCode);
  });

  it("rejects purge with no body at all", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/users/some-id/purge",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect([400, 403]).toContain(res.statusCode);
  });

  it("returns 403 for non-existent user ID without enterprise license", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/users/00000000-0000-0000-0000-000000000000/purge",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { confirm: true },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("enterprise");
  });
});

describe("GDPR edge cases", () => {
  it("sequential purge requests for same user return consistent results", async () => {
    const first = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/users/some-id/purge",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { confirm: true },
    });
    const second = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/users/some-id/purge",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { confirm: true },
    });
    expect(first.statusCode).toBe(second.statusCode);
    expect(first.statusCode).toBe(403);
  });

  it("export initiation rejects GET method", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/users/some-id/export",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("purge endpoint rejects POST method", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/enterprise/users/some-id/purge",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { confirm: true },
    });
    expect(res.statusCode).toBe(404);
  });
});
