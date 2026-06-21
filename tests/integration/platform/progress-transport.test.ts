/**
 * Integration test for the Redis-based progress transport.
 *
 * Verifies:
 *   1. Terminal-key replay: updateSingleFileProgress publishes to Redis
 *      and stores a terminal key; SSE replay reads it back.
 *   2. Durable DB persistence: the jobs row is written with the correct
 *      status mapping.
 *
 * This test runs standalone against the dev Redis (redis://localhost:6379)
 * and the per-fork Postgres database. Per-fork Redis isolation arrives in
 * Task 7; until then, run this file ALONE.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { updateSingleFileProgress } from "../../../apps/api/src/routes/progress.js";
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

describe("Redis progress transport", () => {
  it("replays a terminal single-file event from the Redis terminal key", async () => {
    const jobId = `tp-${randomUUID()}`;

    // Publish a terminal event
    updateSingleFileProgress({
      jobId,
      phase: "complete",
      percent: 100,
      result: { downloadUrl: "/x" },
    });

    // Wait for pub/sub + setex round trip
    await new Promise((r) => setTimeout(r, 500));

    // Hit the SSE endpoint -- it should replay the cached terminal frame
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/jobs/${jobId}/progress`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.body;

    // Should contain an SSE data frame
    expect(body).toContain("data: ");

    // Parse the SSE data
    const dataMatch = body.match(/data: (.+)/);
    expect(dataMatch).not.toBeNull();
    const event = JSON.parse(dataMatch![1]);
    expect(event.type).toBe("single");
    expect(event.phase).toBe("complete");
    expect(event.result?.downloadUrl).toBe("/x");

    // Verify durable DB row was written
    // Poll briefly since persist is async
    let job: typeof schema.jobs.$inferSelect | undefined;
    const start = Date.now();
    while (Date.now() - start < 2000) {
      const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
      if (row && row.status === "completed") {
        job = row;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(job).toBeDefined();
    expect(job!.status).toBe("completed");
    expect(job!.type).toBe("single");

    // Clean up
    await db.delete(schema.jobs).where(eq(schema.jobs.id, jobId));
  });

  it("replays a terminal batch event from the Redis terminal key", async () => {
    const jobId = `tp-batch-${randomUUID()}`;

    // Use the updateJobProgress export (imported indirectly via the module)
    const { updateJobProgress } = await import("../../../apps/api/src/routes/progress.js");
    updateJobProgress({
      jobId,
      status: "completed",
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 0,
      errors: [],
    });

    await new Promise((r) => setTimeout(r, 500));

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/jobs/${jobId}/progress`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const dataMatch = res.body.match(/data: (.+)/);
    expect(dataMatch).not.toBeNull();
    const event = JSON.parse(dataMatch![1]);
    expect(event.type).toBe("batch");
    expect(event.status).toBe("completed");

    // Clean up
    await db.delete(schema.jobs).where(eq(schema.jobs.id, jobId));
  });

  it("synthesizes a legacy event from the DB when terminal key has expired", async () => {
    const jobId = `tp-db-${randomUUID()}`;

    // Insert a completed row directly (simulating expired terminal key)
    await db.insert(schema.jobs).values({
      id: jobId,
      type: "single",
      status: "completed",
      progress: { percent: 100 },
      inputRefs: [],
      completedAt: new Date(),
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/jobs/${jobId}/progress`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const dataMatch = res.body.match(/data: (.+)/);
    expect(dataMatch).not.toBeNull();
    const event = JSON.parse(dataMatch![1]);
    expect(event.type).toBe("single");
    expect(event.phase).toBe("complete");
    expect(event.percent).toBe(100);

    // Clean up
    await db.delete(schema.jobs).where(eq(schema.jobs.id, jobId));
  });
});

// ── Cancel route auth ──────────────────────────────────────────

describe("Cancel route auth", () => {
  it("rejects unauthenticated cancel with 401", async () => {
    const jobId = randomUUID();

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/jobs/${jobId}/cancel`,
      // No authorization header
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("Authentication required");
  });

  it("returns canceled:false for an unknown job when authenticated", async () => {
    const jobId = randomUUID();

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/jobs/${jobId}/cancel`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.canceled).toBe(false);
  });
});
