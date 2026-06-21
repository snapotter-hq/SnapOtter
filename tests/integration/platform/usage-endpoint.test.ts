/**
 * Integration tests for GET /api/v1/admin/usage.
 *
 * Verifies auth gating, response shape, and data correctness
 * after seeding a few job rows.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;
let adminUserId: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);

  // Look up admin user id
  const [adminUser] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.username, "admin"))
    .limit(1);
  adminUserId = adminUser.id;

  // Seed 3 jobs: 2 completed with distinct tool_ids, 1 failed
  await db.insert(schema.jobs).values([
    {
      id: randomUUID(),
      userId: adminUserId,
      type: "tool",
      toolId: "resize",
      pool: "image",
      status: "completed",
      bytesIn: 5000,
      durationMs: 200,
    },
    {
      id: randomUUID(),
      userId: adminUserId,
      type: "tool",
      toolId: "compress",
      pool: "image",
      status: "completed",
      bytesIn: 3000,
      durationMs: 400,
    },
    {
      id: randomUUID(),
      userId: adminUserId,
      type: "tool",
      toolId: "resize",
      pool: "image",
      status: "failed",
      bytesIn: 1000,
      durationMs: 50,
    },
  ]);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("GET /api/v1/admin/usage", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/usage",
    });
    expect([401, 403]).toContain(res.statusCode);
  });

  it("rejects non-admin users with 403", async () => {
    // Register a non-admin user
    const regRes = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: "usage_viewer", password: "TestPass1", role: "user" },
    });
    expect(regRes.statusCode).toBe(201);

    // Clear mustChangePassword
    const userId = JSON.parse(regRes.body).id;
    await db
      .update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.id, userId));

    // Login as non-admin
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "usage_viewer", password: "TestPass1" },
    });
    const userToken = JSON.parse(loginRes.body).token;

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/usage",
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns usage data for admin", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/usage?days=30",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    // Top-level shape
    expect(body.days).toBe(30);
    expect(Array.isArray(body.jobsPerDay)).toBe(true);
    expect(Array.isArray(body.topTools)).toBe(true);
    expect(Array.isArray(body.perUser)).toBe(true);
    expect(Array.isArray(body.durations)).toBe(true);
    expect(body.storage).toBeDefined();

    // jobsPerDay: today should appear with our 3 seeded jobs
    expect(body.jobsPerDay.length).toBeGreaterThan(0);
    const today = new Date().toISOString().slice(0, 10);
    const todayRow = body.jobsPerDay.find((r: { day: string }) => r.day === today);
    expect(todayRow).toBeDefined();
    // We seeded 3 jobs; other tests in the fork may add more, so use >=
    expect(todayRow.total).toBeGreaterThanOrEqual(3);
    expect(todayRow.completed).toBeGreaterThanOrEqual(2);
    expect(todayRow.failed).toBeGreaterThanOrEqual(1);

    // topTools: ordered desc by runs; resize should be first (2 runs vs 1)
    expect(body.topTools.length).toBeGreaterThanOrEqual(2);
    const resizeIdx = body.topTools.findIndex((r: { toolId: string }) => r.toolId === "resize");
    const compressIdx = body.topTools.findIndex((r: { toolId: string }) => r.toolId === "compress");
    expect(resizeIdx).toBeGreaterThanOrEqual(0);
    expect(compressIdx).toBeGreaterThanOrEqual(0);
    // resize has more runs so should come before compress
    expect(resizeIdx).toBeLessThan(compressIdx);

    // perUser: admin username should appear with bytesIn as string
    const adminRow = body.perUser.find((r: { username: string | null }) => r.username === "admin");
    expect(adminRow).toBeDefined();
    expect(typeof adminRow.bytesIn).toBe("string");
    expect(Number(adminRow.bytesIn)).toBeGreaterThanOrEqual(9000);
    expect(adminRow.runs).toBeGreaterThanOrEqual(3);

    // durations: each entry should have pool string + p50Ms/p95Ms number or null
    for (const d of body.durations) {
      expect(typeof d.pool).toBe("string");
      expect(d.p50Ms === null || typeof d.p50Ms === "number").toBe(true);
      expect(d.p95Ms === null || typeof d.p95Ms === "number").toBe(true);
    }

    // storage: fields present
    expect(typeof body.storage.libraryBytes).toBe("string");
    expect(typeof body.storage.libraryFiles).toBe("number");
  });

  it("defaults days to 30 when omitted", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/usage",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.days).toBe(30);
  });

  it("clamps days to valid range", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/usage?days=9999",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.days).toBe(365);
  });
});
