import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

describe("upgrade management - without enterprise license", () => {
  it("GET /api/v1/admin/version returns 403 without enterprise license", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/admin/version",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("upgrade_management");
  });

  it("GET /api/v1/admin/migrations/pending returns 403 without enterprise license", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/admin/migrations/pending",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("upgrade_management");
  });

  it("GET /api/v1/admin/upgrade-check returns 403 without enterprise license", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/admin/upgrade-check",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("upgrade_management");
  });

  it("GET /api/v1/admin/version returns 401 without authentication", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/admin/version",
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v1/admin/migrations/pending returns 401 without authentication", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/admin/migrations/pending",
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v1/admin/upgrade-check returns 401 without authentication", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/admin/upgrade-check",
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("upgrade management - with enterprise license", () => {
  let entApp: TestApp;
  let entAdminToken: string;

  beforeAll(async () => {
    vi.resetModules();
    const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
    mockEnterpriseFeatures(["upgrade_management"]);
    const { buildTestApp, loginAsAdmin } = await import("../test-server.js");
    entApp = await buildTestApp();
    entAdminToken = await loginAsAdmin(entApp.app);
  }, 30_000);

  afterAll(async () => {
    await entApp.cleanup();
    vi.restoreAllMocks();
  }, 10_000);

  it("GET /api/v1/admin/version returns 200 with version info", async () => {
    const res = await entApp.app.inject({
      method: "GET",
      url: "/api/v1/admin/version",
      headers: { authorization: `Bearer ${entAdminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("nodeVersion");
    expect(typeof body.version).toBe("string");
    expect(typeof body.nodeVersion).toBe("string");
    expect(body.nodeVersion).toMatch(/^v\d+/);
  });

  it("GET /api/v1/admin/version includes build metadata fields", async () => {
    const res = await entApp.app.inject({
      method: "GET",
      url: "/api/v1/admin/version",
      headers: { authorization: `Bearer ${entAdminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("buildDate");
    expect(body).toHaveProperty("schemaVersion");
    expect(body).toHaveProperty("pendingMigrations");
    expect(typeof body.pendingMigrations).toBe("number");
  });

  it("GET /api/v1/admin/version returns 403 for non-admin users", async () => {
    await entApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: {
        username: "upgradeuser1",
        password: "TestPass1",
        role: "user",
      },
    });
    await db
      .update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, "upgradeuser1"));

    const loginRes = await entApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "upgradeuser1", password: "TestPass1" },
    });
    const userToken = JSON.parse(loginRes.body).token;

    const res = await entApp.app.inject({
      method: "GET",
      url: "/api/v1/admin/version",
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("GET /api/v1/admin/migrations/pending returns 500 when journal is not at expected path", async () => {
    const res = await entApp.app.inject({
      method: "GET",
      url: "/api/v1/admin/migrations/pending",
      headers: { authorization: `Bearer ${entAdminToken}` },
    });
    // readJournal() looks for drizzle/meta/_journal.json relative to cwd,
    // but in tests cwd is the repo root (journal is in apps/api/drizzle/)
    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("journal");
  });

  it("GET /api/v1/admin/migrations/pending returns 403 for non-admin users", async () => {
    await entApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: {
        username: "upgradeuser2",
        password: "TestPass1",
        role: "user",
      },
    });
    await db
      .update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, "upgradeuser2"));

    const loginRes = await entApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "upgradeuser2", password: "TestPass1" },
    });
    const userToken = JSON.parse(loginRes.body).token;

    const res = await entApp.app.inject({
      method: "GET",
      url: "/api/v1/admin/migrations/pending",
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("GET /api/v1/admin/upgrade-check returns 200 with readiness check", async () => {
    const res = await entApp.app.inject({
      method: "GET",
      url: "/api/v1/admin/upgrade-check",
      headers: { authorization: `Bearer ${entAdminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(typeof body.ready).toBe("boolean");
    expect(body).toHaveProperty("checks");
  });

  it("GET /api/v1/admin/upgrade-check includes database and redis connectivity", async () => {
    const res = await entApp.app.inject({
      method: "GET",
      url: "/api/v1/admin/upgrade-check",
      headers: { authorization: `Bearer ${entAdminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.checks).toHaveProperty("databaseConnected");
    expect(body.checks).toHaveProperty("redisConnected");
    expect(typeof body.checks.databaseConnected.ok).toBe("boolean");
    expect(typeof body.checks.redisConnected.ok).toBe("boolean");
    expect(body.checks).toHaveProperty("diskSpace");
    expect(body.checks).toHaveProperty("inFlightJobs");
  });

  it("GET /api/v1/admin/upgrade-check returns 403 for non-admin users", async () => {
    await entApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: {
        username: "upgradeuser3",
        password: "TestPass1",
        role: "user",
      },
    });
    await db
      .update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, "upgradeuser3"));

    const loginRes = await entApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "upgradeuser3", password: "TestPass1" },
    });
    const userToken = JSON.parse(loginRes.body).token;

    const res = await entApp.app.inject({
      method: "GET",
      url: "/api/v1/admin/upgrade-check",
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
