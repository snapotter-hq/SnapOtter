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

describe("IP allowlist without enterprise license", () => {
  it("GET returns 403 without enterprise license", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/ip-allowlist",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("enterprise");
  });

  it("PUT returns 403 without enterprise license", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/ip-allowlist",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { cidrs: ["10.0.0.0/8"] },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("enterprise");
  });

  it("GET returns 401 without authentication", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/ip-allowlist",
    });
    expect(res.statusCode).toBe(401);
  });

  it("PUT returns 401 without authentication", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/ip-allowlist",
      payload: { cidrs: ["10.0.0.0/8"] },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("IP allowlist with enterprise license", () => {
  let enterpriseApp: TestApp;
  let entAdminToken: string;
  let userToken: string;

  beforeAll(async () => {
    vi.resetModules();
    const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
    mockEnterpriseFeatures(["ip_allowlist"]);
    const { buildTestApp, loginAsAdmin } = await import("../test-server.js");

    enterpriseApp = await buildTestApp();
    entAdminToken = await loginAsAdmin(enterpriseApp.app);

    await enterpriseApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: {
        username: "ipallowlistuser",
        password: "TestPass1",
        role: "user",
      },
    });
    await db
      .update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, "ipallowlistuser"));

    const loginRes = await enterpriseApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "ipallowlistuser", password: "TestPass1" },
    });
    userToken = JSON.parse(loginRes.body).token;
  }, 30_000);

  afterAll(async () => {
    await enterpriseApp.cleanup();
    vi.resetModules();
  }, 10_000);

  it("GET returns 200 with empty cidrs initially", async () => {
    const res = await enterpriseApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/ip-allowlist",
      headers: { authorization: `Bearer ${entAdminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.cidrs).toEqual([]);
  });

  it("GET returns 403 for non-admin users", async () => {
    const res = await enterpriseApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/ip-allowlist",
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("PUT returns 403 for non-admin users", async () => {
    const res = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/ip-allowlist",
      headers: { authorization: `Bearer ${userToken}` },
      payload: { cidrs: ["10.0.0.0/8"] },
    });
    expect(res.statusCode).toBe(403);
  });

  it("PUT accepts empty cidrs array (clears allowlist)", async () => {
    const res = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/ip-allowlist",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: { cidrs: [] },
    });
    expect(res.statusCode).toBe(200);
  });

  it("PUT rejects invalid CIDR values", async () => {
    const res = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/ip-allowlist",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: { cidrs: ["not-a-cidr"] },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("INVALID_CIDR");
  });

  it("PUT rejects entries longer than 45 characters", async () => {
    const longEntry = "a".repeat(46);
    const res = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/ip-allowlist",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: { cidrs: [longEntry] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("PUT rejects more than 1000 entries", async () => {
    const cidrs = Array.from(
      { length: 1001 },
      (_, i) => `10.0.${Math.floor(i / 256)}.${i % 256}/32`,
    );
    const res = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/ip-allowlist",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: { cidrs },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET returns saved CIDRs after PUT", async () => {
    const cidrs = ["10.0.0.0/8", "172.16.0.0/12", "127.0.0.0/8"];
    const putRes = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/ip-allowlist",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: { cidrs },
    });
    expect(putRes.statusCode).toBe(200);

    const getRes = await enterpriseApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/ip-allowlist",
      headers: { authorization: `Bearer ${entAdminToken}` },
    });
    expect(getRes.statusCode).toBe(200);
    const body = JSON.parse(getRes.body);
    expect(body.cidrs).toEqual(cidrs);
  });

  it("PUT returns SELF_LOCKOUT when CIDRs would block the admin IP", async () => {
    const res = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/ip-allowlist",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: { cidrs: ["192.168.0.0/16"] },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("SELF_LOCKOUT");
  });

  it("PUT allows CIDRs that include the admin IP", async () => {
    const res = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/ip-allowlist",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: { cidrs: ["127.0.0.0/8"] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
  });
});
