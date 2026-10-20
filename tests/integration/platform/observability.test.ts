/**
 * Integration tests for observability endpoints:
 *   - GET /api/v1/metrics (Prometheus scrape)
 *   - GET/POST /api/v1/admin/log-level (runtime log level)
 *   - GET/POST /api/v1/admin/backup-status (backup recency and corrupt JSON resilience)
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { logger } from "../../../apps/api/src/lib/logger.js";
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

// ── Backup status endpoint ────────────────────────────────────

describe("GET/POST /api/v1/admin/backup-status (#3039)", () => {
  it("rejects unauthenticated GET and POST requests", async () => {
    const getRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/backup-status",
    });
    expect([401, 403]).toContain(getRes.statusCode);

    const postRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/backup-status",
      headers: { "content-type": "application/json" },
      payload: { type: "full" },
    });
    expect([401, 403]).toContain(postRes.statusCode);
  });

  it("returns 400 when POST payload is missing a non-empty type", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/backup-status",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: { type: "" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_ERROR");
  });

  it("returns critical when no backup has been recorded and ok after POST insert and update", async () => {
    const warnSpy = vi.spyOn(logger, "warn");
    try {
      await db.delete(schema.settings).where(eq(schema.settings.key, "backup_last_completed"));

      const emptyRes = await app.inject({
        method: "GET",
        url: "/api/v1/admin/backup-status",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(emptyRes.statusCode).toBe(200);
      expect(emptyRes.json()).toEqual({
        lastBackup: null,
        status: "critical",
        ageHours: null,
      });

      const postRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/backup-status",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        payload: { type: "full", sizeBytes: 4096, notes: "nightly" },
      });
      expect(postRes.statusCode).toBe(200);
      const postBody = postRes.json();
      expect(postBody.success).toBe(true);

      const okRes = await app.inject({
        method: "GET",
        url: "/api/v1/admin/backup-status",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(okRes.statusCode).toBe(200);
      expect(okRes.json()).toEqual({
        lastBackup: {
          timestamp: postBody.timestamp,
          type: "full",
          sizeBytes: 4096,
          notes: "nightly",
        },
        status: "ok",
        ageHours: 0,
      });

      // Second POST exercises the existing-row update branch and default sizeBytes/notes
      const updatePostRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/backup-status",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        payload: { type: "incremental" },
      });
      expect(updatePostRes.statusCode).toBe(200);
      const updatePostBody = updatePostRes.json();

      const updatedGetRes = await app.inject({
        method: "GET",
        url: "/api/v1/admin/backup-status",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(updatedGetRes.statusCode).toBe(200);
      expect(updatedGetRes.json()).toEqual({
        lastBackup: {
          timestamp: updatePostBody.timestamp,
          type: "incremental",
          sizeBytes: null,
          notes: "",
        },
        status: "ok",
        ageHours: 0,
      });
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
      await db.delete(schema.settings).where(eq(schema.settings.key, "backup_last_completed"));
    }
  });

  it("logs a warning and returns critical fallback when backup_last_completed is malformed or non-object JSON (#3039)", async () => {
    const warnSpy = vi.spyOn(logger, "warn");
    try {
      await db
        .insert(schema.settings)
        .values({ key: "backup_last_completed", value: "{corrupt" })
        .onConflictDoUpdate({
          target: schema.settings.key,
          set: { value: "{corrupt", updatedAt: new Date() },
        });

      const malformedRes = await app.inject({
        method: "GET",
        url: "/api/v1/admin/backup-status",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(malformedRes.statusCode).toBe(200);
      expect(malformedRes.json()).toEqual({
        lastBackup: null,
        status: "critical",
        ageHours: null,
      });
      expect(warnSpy).toHaveBeenCalledWith(
        { err: expect.any(SyntaxError), key: "backup_last_completed" },
        "admin-ops: failed to parse stored backup_last_completed JSON",
      );

      for (const raw of ["null", "42", "[]", "{}", '{"timestamp":"not-a-date"}']) {
        warnSpy.mockClear();
        await db
          .update(schema.settings)
          .set({ value: raw, updatedAt: new Date() })
          .where(eq(schema.settings.key, "backup_last_completed"));

        const res = await app.inject({
          method: "GET",
          url: "/api/v1/admin/backup-status",
          headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({
          lastBackup: null,
          status: "critical",
          ageHours: null,
        });
        expect(warnSpy).toHaveBeenCalledWith(
          { key: "backup_last_completed" },
          "admin-ops: stored backup_last_completed is not a valid backup record",
        );
      }
    } finally {
      warnSpy.mockRestore();
      await db.delete(schema.settings).where(eq(schema.settings.key, "backup_last_completed"));
    }
  });
});
