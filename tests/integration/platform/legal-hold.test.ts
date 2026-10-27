import { eq, ne } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { ensureAnonymousUser } from "../../../apps/api/src/plugins/auth.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
});

afterAll(async () => {
  await testApp.cleanup();
});

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

describe("legal hold on the synthetic anonymous row (#4047)", () => {
  let licensedApp: TestApp;
  let licensedAdminToken: string;

  beforeAll(async () => {
    vi.resetModules();
    const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
    mockEnterpriseFeatures(["legal_hold"]);
    const { buildTestApp: buildLicensedApp, loginAsAdmin: loginLicensedAdmin } = await import(
      "../test-server.js"
    );
    licensedApp = await buildLicensedApp();
    licensedAdminToken = await loginLicensedAdmin(licensedApp.app);
    await ensureAnonymousUser();
  });

  afterAll(async () => {
    await db.update(schema.users).set({ legalHold: false }).where(eq(schema.users.id, "anonymous"));
    await licensedApp.cleanup();
    vi.restoreAllMocks();
  });

  it("refuses to place the synthetic anonymous row on legal hold", async () => {
    const res = await licensedApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/legal-hold",
      headers: { authorization: `Bearer ${licensedAdminToken}` },
      payload: { targetType: "user", targetId: "anonymous", hold: true },
    });

    expect(res.statusCode).toBe(404);
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, "anonymous"));
    expect(row?.legalHold).toBe(false);
  });

  it("releases a legacy hold on the synthetic anonymous row", async () => {
    // A hold written before the guard existed must still be releasable, or the
    // row's leftover storage is exempt from retention forever.
    await db.update(schema.users).set({ legalHold: true }).where(eq(schema.users.id, "anonymous"));

    try {
      const res = await licensedApp.app.inject({
        method: "PUT",
        url: "/api/v1/enterprise/legal-hold",
        headers: { authorization: `Bearer ${licensedAdminToken}` },
        payload: { targetType: "user", targetId: "anonymous", hold: false },
      });

      expect(res.statusCode, res.body).toBe(200);
      const [row] = await db.select().from(schema.users).where(eq(schema.users.id, "anonymous"));
      expect(row?.legalHold).toBe(false);
    } finally {
      await db
        .update(schema.users)
        .set({ legalHold: false })
        .where(eq(schema.users.id, "anonymous"));
    }
  });

  it("lists real held users and omits the synthetic anonymous row", async () => {
    // A hold written before this guard existed must not leak into the list.
    await db.update(schema.users).set({ legalHold: true }).where(eq(schema.users.id, "anonymous"));
    const [real] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(ne(schema.users.id, "anonymous"))
      .limit(1);
    expect(real).toBeDefined();
    await db.update(schema.users).set({ legalHold: true }).where(eq(schema.users.id, real.id));

    try {
      const res = await licensedApp.app.inject({
        method: "GET",
        url: "/api/v1/enterprise/legal-hold",
        headers: { authorization: `Bearer ${licensedAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { users: Array<{ id: string }> };
      expect(body.users.some((u) => u.id === "anonymous")).toBe(false);
      expect(body.users.some((u) => u.id === real.id)).toBe(true);
    } finally {
      await db
        .update(schema.users)
        .set({ legalHold: false })
        .where(eq(schema.users.id, "anonymous"));
      await db.update(schema.users).set({ legalHold: false }).where(eq(schema.users.id, real.id));
    }
  });
});
