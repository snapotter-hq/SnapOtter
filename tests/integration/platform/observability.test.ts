/**
 * Integration tests for observability endpoints:
 *   - GET /api/v1/metrics (Prometheus scrape)
 *   - GET/POST /api/v1/admin/log-level (runtime log level)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

// ── Metrics endpoint ──────────────────────────────────────────

describe("GET /api/v1/metrics", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/metrics",
    });
    expect([401, 403]).toContain(res.statusCode);
  });

  it("returns 200 with Prometheus text for admin", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/metrics",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");

    const body = res.body;

    // Must contain queue gauge lines for all five pools
    const pools = ["image", "media", "ai", "docs", "system"];
    for (const pool of pools) {
      expect(body).toContain(`snapotter_queue_jobs{pool="${pool}",state="active"}`);
      expect(body).toContain(`snapotter_queue_jobs{pool="${pool}",state="waiting"}`);
    }

    // Must contain at least one default process metric
    expect(body).toMatch(/process_/);
  });
});

// ── Log level endpoint ────────────────────────────────────────

describe("GET/POST /api/v1/admin/log-level", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/log-level",
    });
    expect([401, 403]).toContain(res.statusCode);
  });

  it("POST changes level and GET reflects it", async () => {
    try {
      // POST a new level
      const postRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/log-level",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        payload: { level: "debug" },
      });
      expect(postRes.statusCode).toBe(200);
      const postBody = JSON.parse(postRes.body);
      expect(postBody.level).toBe("debug");

      // GET should reflect the new level
      const getRes = await app.inject({
        method: "GET",
        url: "/api/v1/admin/log-level",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(getRes.statusCode).toBe(200);
      const getBody = JSON.parse(getRes.body);
      expect(getBody.level).toBe("debug");
    } finally {
      // Always restore "info" so other tests are not affected
      await app.inject({
        method: "POST",
        url: "/api/v1/admin/log-level",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        payload: { level: "info" },
      });
    }
  });

  it("returns 400 for invalid level", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/log-level",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: { level: "banana" },
    });
    expect(res.statusCode).toBe(400);
  });
});
