import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

/* ------------------------------------------------------------------ */
/*  Helper                                                             */
/* ------------------------------------------------------------------ */

async function fetchAuditLog(
  qs = "",
): Promise<{ entries: any[]; total: number; page: number; limit: number }> {
  const res = await testApp.app.inject({
    method: "GET",
    url: `/api/v1/audit-log${qs ? `?${qs}` : ""}`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body);
}

/* ------------------------------------------------------------------ */
/*  Event recording                                                    */
/* ------------------------------------------------------------------ */

describe("audit log event recording", () => {
  it("LOGIN_SUCCESS recorded after login", async () => {
    const body = await fetchAuditLog("action=LOGIN_SUCCESS");
    expect(body.entries.length).toBeGreaterThan(0);
    expect(body.entries[0].action).toBe("LOGIN_SUCCESS");
  });

  it("USER_CREATED recorded after register", async () => {
    await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: "audit_edge_user",
        password: "AuditEdge1",
        role: "user",
      },
    });

    const body = await fetchAuditLog("action=USER_CREATED");
    expect(body.entries.length).toBeGreaterThan(0);
    expect(body.entries.some((e: any) => e.action === "USER_CREATED")).toBe(true);
  });

  it("API_KEY_CREATED recorded after key creation", async () => {
    await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "audit-edge-key" },
    });

    const body = await fetchAuditLog("action=API_KEY_CREATED");
    expect(body.entries.length).toBeGreaterThan(0);
    expect(body.entries.some((e: any) => e.action === "API_KEY_CREATED")).toBe(true);
  });

  it("ROLE_CREATED recorded after role creation", async () => {
    await testApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "audit-edge-role",
        description: "role for audit edge test",
        permissions: ["tools:use"],
      },
    });

    const body = await fetchAuditLog("action=ROLE_CREATED");
    expect(body.entries.length).toBeGreaterThan(0);
    expect(body.entries.some((e: any) => e.action === "ROLE_CREATED")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Pagination edge cases                                              */
/* ------------------------------------------------------------------ */

describe("audit log pagination edge cases", () => {
  it("page=0 clamped to 1", async () => {
    const body = await fetchAuditLog("page=0");
    expect(body.page).toBe(1);
  });

  it("negative page clamped to 1", async () => {
    const body = await fetchAuditLog("page=-5");
    expect(body.page).toBe(1);
  });

  it("limit=500 clamped to 100", async () => {
    const body = await fetchAuditLog("limit=500");
    expect(body.limit).toBe(100);
  });

  it("limit=0 falls back to default (50)", async () => {
    const body = await fetchAuditLog("limit=0");
    expect(body.limit).toBe(50);
  });

  it("non-numeric values use defaults", async () => {
    const body = await fetchAuditLog("page=abc&limit=xyz");
    expect(body.page).toBe(1);
    expect(body.limit).toBe(50);
  });

  it("high page number returns empty entries", async () => {
    const body = await fetchAuditLog("page=99999");
    expect(body.entries).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  Entry structure                                                    */
/* ------------------------------------------------------------------ */

describe("audit log entry structure", () => {
  it("each entry has id, actorUsername, action, createdAt (valid ISO date)", async () => {
    const body = await fetchAuditLog("limit=10");
    expect(body.entries.length).toBeGreaterThan(0);

    for (const entry of body.entries) {
      expect(entry).toHaveProperty("id");
      expect(typeof entry.id).toBe("string");

      expect(entry).toHaveProperty("actorUsername");
      expect(typeof entry.actorUsername).toBe("string");

      expect(entry).toHaveProperty("action");
      expect(typeof entry.action).toBe("string");

      expect(entry).toHaveProperty("createdAt");
      expect(typeof entry.createdAt).toBe("string");
      const parsed = new Date(entry.createdAt);
      expect(Number.isNaN(parsed.getTime())).toBe(false);
    }
  });
});
