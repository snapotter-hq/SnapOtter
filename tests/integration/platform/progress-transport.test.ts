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
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { sharedRedis } from "../../../apps/api/src/jobs/connection.js";
import { getQueue } from "../../../apps/api/src/jobs/queues.js";
import {
  publishEphemeral,
  updateSingleFileProgress,
} from "../../../apps/api/src/routes/progress.js";
import { buildTestApp, createUserAndLogin, loginAsAdmin, type TestApp } from "../test-server.js";

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
  it("cannot miss a terminal publish while the connection is replaying prior state", async () => {
    const jobId = `tp-replay-race-${randomUUID()}`;
    const redis = sharedRedis();
    const originalGet = redis.get.bind(redis);
    let injected = false;
    const getSpy = vi.spyOn(redis, "get").mockImplementation(async (key) => {
      const cached = await originalGet(key);
      if (!injected && String(key).endsWith(`terminal:${jobId}`)) {
        injected = true;
        publishEphemeral({
          jobId,
          type: "single",
          phase: "complete",
          percent: 100,
          result: { text: "published during replay" },
        });
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return cached;
    });

    try {
      const responsePromise = app.inject({
        method: "GET",
        url: `/api/v1/jobs/${jobId}/progress`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const settledDuringReplay = await Promise.race([
        responsePromise.then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 500)),
      ]);

      // Let a broken implementation settle too, so this regression test never
      // leaks an open SSE request into suite teardown.
      if (!settledDuringReplay) {
        publishEphemeral({
          jobId,
          type: "single",
          phase: "failed",
          percent: 100,
          error: "cleanup terminal",
        });
      }
      const response = await responsePromise;
      expect(settledDuringReplay).toBe(true);
      expect(response.body).toContain("published during replay");
    } finally {
      getSpy.mockRestore();
    }
  });

  it("replays a terminal single-file event from the Redis terminal key", async () => {
    const jobId = `tp-${randomUUID()}`;

    // Publish a terminal event
    await updateSingleFileProgress({
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
    expect((job?.progress as { result?: { downloadUrl?: string } })?.result?.downloadUrl).toBe(
      "/x",
    );

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

  it("replays a durable completed result from the DB when the terminal key has expired", async () => {
    const jobId = `tp-db-${randomUUID()}`;

    // Insert a completed row directly (simulating expired terminal key)
    await db.insert(schema.jobs).values({
      id: jobId,
      type: "single",
      status: "completed",
      progress: { percent: 100, result: { downloadUrl: "/durable-result" } },
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
    if (!dataMatch) throw new Error("Expected an SSE data frame");
    const event = JSON.parse(dataMatch[1]);
    expect(event.type).toBe("single");
    expect(event.phase).toBe("complete");
    expect(event.percent).toBe(100);
    expect(event.result?.downloadUrl).toBe("/durable-result");

    // Clean up
    await db.delete(schema.jobs).where(eq(schema.jobs.id, jobId));
  });

  it("settles legacy completed rows whose result is no longer available", async () => {
    const jobId = `tp-db-legacy-${randomUUID()}`;

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
    if (!dataMatch) throw new Error("Expected an SSE data frame");
    const event = JSON.parse(dataMatch[1]);
    expect(event.type).toBe("single");
    expect(event.phase).toBe("failed");
    expect(event.error).toContain("result is no longer available");

    // Clean up
    await db.delete(schema.jobs).where(eq(schema.jobs.id, jobId));
  });
});

// ── Cancel route auth + ownership ──────────────────────────────
//
// Regression guard for the IDOR where any authenticated user could cancel any
// other user's job by ID. A caller may cancel a job only if they own it
// (jobs.user_id === their id) or hold `files:all` (admins/editors). Missing and
// non-owned jobs both return 404 so ownership can't be probed by job ID.

describe("Cancel route auth", () => {
  let ownerToken: string;
  let ownerId: string;
  let attackerToken: string;

  beforeAll(async () => {
    const owner = await createUserAndLogin(app, "cancel-owner");
    const attacker = await createUserAndLogin(app, "cancel-attacker");
    ownerToken = owner.token;
    ownerId = owner.userId;
    attackerToken = attacker.token;
  }, 30_000);

  /** Seed a durable job row owned by `ownerId`, plus a long-delayed BullMQ job
   *  (workers never promote a delayed job within the test window) so we can
   *  observe whether a cancel actually reached the queue. */
  async function seedOwnedJob(): Promise<string> {
    const jobId = `cancel-${randomUUID()}`;
    await db.insert(schema.jobs).values({
      id: jobId,
      userId: ownerId,
      type: "single",
      status: "queued",
    });
    await getQueue("image").add("noop", {} as never, { jobId, delay: 600_000 });
    return jobId;
  }

  async function cleanupJob(jobId: string): Promise<void> {
    const job = await getQueue("image").getJob(jobId);
    if (job) await job.remove().catch(() => {});
    await db.delete(schema.jobs).where(eq(schema.jobs.id, jobId));
  }

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

  it("returns 404 for an unknown job (existence is not probeable)", async () => {
    const jobId = randomUUID();

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/jobs/${jobId}/cancel`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it("blocks a non-owner from canceling another user's job (404, job untouched)", async () => {
    const jobId = await seedOwnedJob();
    try {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/jobs/${jobId}/cancel`,
        headers: { authorization: `Bearer ${attackerToken}` },
      });

      // The attacker gets the same 404 as a nonexistent job...
      expect(res.statusCode).toBe(404);

      // ...and the victim's job is entirely untouched: the DB row stays queued
      // and the queued BullMQ job survives.
      const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
      expect(row?.status).toBe("queued");
      expect(await getQueue("image").getJob(jobId)).toBeTruthy();
    } finally {
      await cleanupJob(jobId);
    }
  });

  it("lets the owner cancel their own job", async () => {
    const jobId = await seedOwnedJob();
    try {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/jobs/${jobId}/cancel`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).canceled).toBe(true);

      // The cancel actually took effect: row marked canceled, queue job removed.
      const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
      expect(row?.status).toBe("canceled");
      expect(await getQueue("image").getJob(jobId)).toBeFalsy();
    } finally {
      await cleanupJob(jobId);
    }
  });

  it("lets an admin (files:all) cancel another user's job", async () => {
    const jobId = await seedOwnedJob();
    try {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/jobs/${jobId}/cancel`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).canceled).toBe(true);
      const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
      expect(row?.status).toBe("canceled");
    } finally {
      await cleanupJob(jobId);
    }
  });
});
