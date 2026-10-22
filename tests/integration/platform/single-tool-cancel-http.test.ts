/**
 * Single-tool cancel over the real HTTP surface (#808).
 *
 * The worker-harness suite (single-tool-cancel.test.ts) drives requestCancel
 * against jobs it enqueues itself; this file pins what the routes stamp and
 * answer: the alias row carries the artifact pointer and the owner (so plain
 * users can cancel their own runs instead of hitting the 404 path that
 * mislabels a live run as locally canceled), reused ids keep their owner,
 * and a sync request whose worker was canceled answers the structural
 * canceled 422 the web client settles on.
 *
 * Mid-run timing is deliberately absent here, mirroring the #771 http suite:
 * a tiny resize completes in milliseconds, so requestCancel's live behavior
 * stays in the worker-harness suite.
 */

import { randomUUID } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Canned sync-wait failures, keyed by pool: lets the route's catch branch
// (the structural canceled 422) run deterministically. `markCanceled`
// mirrors the real worker sequence, which commits the canceled row before
// the failed event ever reaches waitUntilFinished; the negative test turns
// it off to model a tool that merely failed with that message. The chain
// this mock stands in for is pinned by the worker-harness suite
// ("surfaces an active cancel to the sync window as the Canceled
// rejection"). Absent entries keep the real waitForJob.
const enqueueMock = vi.hoisted(() => ({
  throwByPool: new Map<string, string>(),
  markCanceled: false,
  timeoutOnce: false,
  onAfterInsertAlias: null as
    | ((args: { jobId: string; clientJobId: string }) => Promise<void>)
    | null,
  onAfterEnqueueJob: null as ((jobId: string) => Promise<void>) | null,
}));

vi.mock("../../../apps/api/src/jobs/enqueue.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/jobs/enqueue.js")>();
  return {
    ...actual,
    insertToolJobAlias: async (...args: Parameters<typeof actual.insertToolJobAlias>) => {
      const result = await actual.insertToolJobAlias(...args);
      if (enqueueMock.onAfterInsertAlias) {
        await enqueueMock.onAfterInsertAlias({
          jobId: args[0].jobId,
          clientJobId: args[0].clientJobId,
        });
      }
      return result;
    },
    enqueueToolJob: async (...args: Parameters<typeof actual.enqueueToolJob>) => {
      const job = await actual.enqueueToolJob(...args);
      if (enqueueMock.onAfterEnqueueJob) {
        await enqueueMock.onAfterEnqueueJob(args[0].jobId);
      }
      return job;
    },
    waitForJob: async (...args: Parameters<typeof actual.waitForJob>) => {
      if (enqueueMock.timeoutOnce) {
        enqueueMock.timeoutOnce = false;
        return null;
      }
      const message = enqueueMock.throwByPool.get(args[0]);
      if (message) {
        if (enqueueMock.markCanceled) {
          const { db, schema } = await import("../../../apps/api/src/db/index.js");
          const { eq } = await import("drizzle-orm");
          await db
            .update(schema.jobs)
            .set({ status: "canceled", completedAt: new Date() })
            .where(eq(schema.jobs.id, args[1]));
        }
        throw new Error(message);
      }
      return actual.waitForJob(...args);
    },
  };
});

const { and, eq } = await import("drizzle-orm");
const { db, schema } = await import("../../../apps/api/src/db/index.js");
const { sharedRedis } = await import("../../../apps/api/src/jobs/connection.js");
const { getQueue } = await import("../../../apps/api/src/jobs/queues.js");
const { bullPrefix } = await import("../../../apps/api/src/jobs/types.js");
const { objectExists } = await import("../../../apps/api/src/lib/object-storage.js");
const { fixtures, readFixture } = await import("../../fixtures/index.js");
const { buildTestApp, createMultipartPayload, createUserAndLogin, loginAsAdmin } = await import(
  "../test-server.js"
);

const PNG = readFixture(fixtures.image.base.png200);

let testApp: Awaited<ReturnType<typeof buildTestApp>>;
let app: (typeof testApp)["app"];
let baseUrl: string;
let adminToken: string;

type JobRow = typeof schema.jobs.$inferSelect;

async function jobRow(jobId: string): Promise<JobRow | undefined> {
  const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
  return row;
}

/** Poll the Redis terminal replay key until the terminal frame appears. */
async function waitForTerminalFrame(
  jobId: string,
  timeoutMs = 30_000,
): Promise<Record<string, unknown>> {
  const key = `${bullPrefix()}:terminal:${jobId}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const raw = await sharedRedis().get(key);
    if (raw) return JSON.parse(raw) as Record<string, unknown>;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`No terminal frame for ${jobId} within ${timeoutMs}ms`);
}

/** Run a resize to completion under a fresh clientJobId. */
async function runResize(clientJobId: string, token: string): Promise<void> {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "photo.png", contentType: "image/png", content: PNG },
    { name: "settings", content: JSON.stringify({ width: 50 }) },
    { name: "clientJobId", content: clientJobId },
  ]);
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/tools/image/resize",
    headers: { "content-type": contentType, authorization: `Bearer ${token}` },
    body,
  });
  expect([200, 202]).toContain(res.statusCode);
  await waitForTerminalFrame(clientJobId);
}

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
  await app.listen({ port: 0, host: "127.0.0.1" });
  const addr = app.server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
});

describe("route-stamped alias metadata (#808)", () => {
  it("stamps the alias pointer and owner on a factory tool route", async () => {
    const clientJobId = randomUUID();
    await runResize(clientJobId, adminToken);

    const alias = await jobRow(clientJobId);
    expect(alias?.type).toBe("single");
    // The owner lands on the alias so the cancel route's ownership check
    // passes for the user who started the run.
    expect(alias?.userId).not.toBeNull();
    const aliasSettings = (alias?.settings ?? {}) as { artifactJobId?: string };
    expect(typeof aliasSettings.artifactJobId).toBe("string");

    const artifact = await jobRow(aliasSettings.artifactJobId as string);
    expect(artifact?.type).toBe("tool");
    expect(artifact?.toolId).toBe("resize");
    expect(artifact?.userId).toBe(alias?.userId);
  });

  it("stamps the alias before validation, not just at enqueue (#886)", async () => {
    // A run that dies in input validation never reaches enqueueToolJob.
    // The factory must have stamped the pointer and owner by then, or a
    // cancel clicked during a slow decode has nothing to resolve.
    const clientJobId = randomUUID();
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "photo.png",
        contentType: "image/png",
        content: Buffer.from("not a png at all"),
      },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
      { name: "clientJobId", content: clientJobId },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/resize",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);

    const frame = await waitForTerminalFrame(clientJobId, 10_000);
    expect(frame.error).toBe("Canceled");

    const alias = await jobRow(clientJobId);
    expect(alias?.type).toBe("single");
    expect(alias?.status).toBe("canceled");
    expect(alias?.completedAt).not.toBeNull();
    expect(alias?.error).toEqual({ message: "Canceled" });
    expect(alias?.userId).not.toBeNull();
    expect(typeof ((alias?.settings ?? {}) as { artifactJobId?: string }).artifactJobId).toBe(
      "string",
    );
  });

  it("stamps the alias on an AI custom route before its own validation (#892)", async () => {
    // The custom AI routes bypass createToolRoute, so #886's factory stamp
    // never runs for them. A run that dies in the route's own pre-enqueue
    // work (here: the ocr settings parse) must still leave an owned,
    // pointered alias row, or a cancel clicked in that window has nothing
    // to resolve. Invalid settings JSON is used instead of the 501 bundle
    // path because it dies before enqueueToolJob in every environment;
    // with a bundle installed the 501 path would enqueue and stamp the
    // row anyway, pinning nothing.
    const clientJobId = randomUUID();
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "scan.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "not json" },
      { name: "clientJobId", content: clientJobId },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/ocr",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });
    expect(res.statusCode).toBe(400);

    const frame = await waitForTerminalFrame(clientJobId, 10_000);
    expect(frame.error).toBe("Canceled");

    const alias = await jobRow(clientJobId);
    expect(alias?.type).toBe("single");
    expect(alias?.status).toBe("canceled");
    expect(alias?.completedAt).not.toBeNull();
    expect(alias?.error).toEqual({ message: "Canceled" });
    expect(alias?.userId).not.toBeNull();
    expect(typeof ((alias?.settings ?? {}) as { artifactJobId?: string }).artifactJobId).toBe(
      "string",
    );
  });

  it("preserves a reused clientJobId's earlier state when a later request rejects before enqueue (#2617)", async () => {
    const clientJobId = randomUUID();
    await runResize(clientJobId, adminToken);
    const before = await jobRow(clientJobId);
    const firstArtifact = ((before?.settings ?? {}) as { artifactJobId?: string }).artifactJobId;
    expect(before?.status).toBe("completed");
    expect(typeof firstArtifact).toBe("string");

    // 1. Factory route rejects after insertToolJobAlias (invalid settings)
    const { body: badResizeBody, contentType: badResizeCt } = createMultipartPayload([
      { name: "file", filename: "photo.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "not json" },
      { name: "clientJobId", content: clientJobId },
    ]);
    const resizeRes = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/resize",
      headers: { "content-type": badResizeCt, authorization: `Bearer ${adminToken}` },
      body: badResizeBody,
    });
    expect(resizeRes.statusCode).toBe(400);

    // 2. Custom route rejects after insertToolJobAlias (invalid saveMode)
    const { body: badOcrBody, contentType: badOcrCt } = createMultipartPayload([
      { name: "file", filename: "scan.png", contentType: "image/png", content: PNG },
      { name: "saveMode", content: "invalid" },
      { name: "clientJobId", content: clientJobId },
    ]);
    const ocrRes = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/ocr",
      headers: { "content-type": badOcrCt, authorization: `Bearer ${adminToken}` },
      body: badOcrBody,
    });
    expect(ocrRes.statusCode).toBe(400);

    const after = await jobRow(clientJobId);
    expect(after?.status).toBe("completed");
    expect(((after?.settings ?? {}) as { artifactJobId?: string }).artifactJobId).toBe(
      firstArtifact,
    );
    expect(await sharedRedis().get(`${bullPrefix()}:terminal:${clientJobId}`)).not.toBeNull();
  });

  it("re-points the alias at the newest artifact and clears the terminal replay key when a clientJobId is reused (#2740)", async () => {
    const clientJobId = randomUUID();
    await runResize(clientJobId, adminToken);
    const first = await jobRow(clientJobId);
    const firstArtifact = ((first?.settings ?? {}) as { artifactJobId?: string }).artifactJobId;
    expect(typeof firstArtifact).toBe("string");
    expect(await sharedRedis().get(`${bullPrefix()}:terminal:${clientJobId}`)).not.toBeNull();

    const queue = getQueue("image");
    await queue.pause();
    enqueueMock.timeoutOnce = true;
    let ssePromise: ReturnType<typeof app.inject> | undefined;
    try {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "photo.png", contentType: "image/png", content: PNG },
        { name: "settings", content: JSON.stringify({ width: 50 }) },
        { name: "clientJobId", content: clientJobId },
      ]);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/resize",
        headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
        body,
      });
      expect(res.statusCode).toBe(202);

      // Re-pointing the alias cleared run 1's cached terminal frame in Redis (#2740).
      expect(await sharedRedis().get(`${bullPrefix()}:terminal:${clientJobId}`)).toBeNull();

      // Opening the SSE stream while run 2 is queued must replay run 2's
      // nonterminal progress and stay open for run 2's completion (#2740).
      ssePromise = app.inject({
        method: "GET",
        url: `/api/v1/jobs/${clientJobId}/progress`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      await new Promise((r) => setTimeout(r, 50));
    } finally {
      enqueueMock.timeoutOnce = false;
      await queue.resume();
    }

    await waitForTerminalFrame(clientJobId);
    const sseRes = await ssePromise;
    const sseFrames = (sseRes?.body ?? "")
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>)
      .filter((frame) => frame.type !== "heartbeat");
    expect(sseFrames[0]).toMatchObject({
      jobId: clientJobId,
      type: "single",
      phase: "processing",
    });
    expect(sseFrames.at(-1)).toMatchObject({
      jobId: clientJobId,
      type: "single",
      phase: "complete",
    });

    const reused = await jobRow(clientJobId);
    const secondArtifact = ((reused?.settings ?? {}) as { artifactJobId?: string }).artifactJobId;
    expect(typeof secondArtifact).toBe("string");
    expect(secondArtifact).not.toBe(firstArtifact);
  });

  it("does not let a second user take over or write to an alias row by reusing its id (#895)", async () => {
    const owner = await createUserAndLogin(app, `single-cancel-owner-${Date.now()}`);
    const clientJobId = randomUUID();
    await runResize(clientJobId, owner.token);
    const before = await jobRow(clientJobId);
    const progressBefore = before?.progress;
    const pointerBefore = ((before?.settings ?? {}) as { artifactJobId?: string }).artifactJobId;
    expect(before?.userId).toBe(owner.userId);

    // A second user submits their own run under the first user's id. The
    // alias claim is refused, so the run falls back to its own server jobId
    // and leaves the first user's channel and Redis terminal key untouched (#895, #2740).
    const terminalBefore = await sharedRedis().get(`${bullPrefix()}:terminal:${clientJobId}`);
    expect(terminalBefore).not.toBeNull();
    const attacker = await createUserAndLogin(app, `single-cancel-reuse-${Date.now()}`);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ width: 25 }) },
      { name: "clientJobId", content: clientJobId },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/resize",
      headers: { "content-type": contentType, authorization: `Bearer ${attacker.token}` },
      body,
    });
    expect([200, 202]).toContain(res.statusCode);
    const { jobId: attackerJobId } = JSON.parse(res.body) as { jobId: string };
    expect(attackerJobId).not.toBe(clientJobId);
    await waitForTerminalFrame(attackerJobId);
    expect(await sharedRedis().get(`${bullPrefix()}:terminal:${clientJobId}`)).toBe(terminalBefore);

    const after = await jobRow(clientJobId);
    expect(after?.userId).toBe(owner.userId);
    expect(after?.status).toBe("completed");
    expect(after?.progress).toEqual(progressBefore);
    expect(((after?.settings ?? {}) as { artifactJobId?: string }).artifactJobId).toBe(
      pointerBefore,
    );
  });

  it("does not clobber a same-owner batch parent row or return its id on 202 when a factory route collides (#895)", async () => {
    const owner = await createUserAndLogin(app, `single-batch-collide-${Date.now()}`);
    const clientJobId = randomUUID();
    const initialProgress = {
      percent: 50,
      totalFiles: 2,
      completedFiles: 1,
      failedFiles: 0,
    };
    await db.insert(schema.jobs).values({
      id: clientJobId,
      userId: owner.userId,
      type: "batch",
      status: "processing",
      progress: initialProgress,
      inputRefs: [],
      settings: { flowChildCount: 2, stepCount: 1 },
    });

    enqueueMock.timeoutOnce = true;
    try {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "photo.png", contentType: "image/png", content: PNG },
        { name: "settings", content: JSON.stringify({ width: 50 }) },
        { name: "clientJobId", content: clientJobId },
      ]);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/resize",
        headers: { "content-type": contentType, authorization: `Bearer ${owner.token}` },
        body,
      });
      expect(res.statusCode).toBe(202);
      const payload = JSON.parse(res.body) as {
        jobId: string;
        progressJobId?: string;
        artifactJobId?: string;
        async: boolean;
      };
      expect(payload).toEqual({ jobId: expect.any(String), async: true });
      expect(payload.jobId).not.toBe(clientJobId);

      await waitForTerminalFrame(payload.jobId);
      expect(await sharedRedis().get(`${bullPrefix()}:terminal:${clientJobId}`)).toBeNull();

      const parent = await jobRow(clientJobId);
      expect(parent?.type).toBe("batch");
      expect(parent?.status).toBe("processing");
      expect(parent?.progress).toEqual(initialProgress);
      expect(parent?.settings).toMatchObject({ flowChildCount: 2, stepCount: 1 });
    } finally {
      enqueueMock.timeoutOnce = false;
    }
  });

  it("does not clobber a same-owner batch parent row or return its id on 202 when a custom route collides (#2651)", async () => {
    const owner = await createUserAndLogin(app, `single-custom-collide-${Date.now()}`);
    const clientJobId = randomUUID();
    const initialProgress = {
      percent: 50,
      totalFiles: 2,
      completedFiles: 1,
      failedFiles: 0,
    };
    await db.insert(schema.jobs).values({
      id: clientJobId,
      userId: owner.userId,
      type: "batch",
      status: "processing",
      progress: initialProgress,
      inputRefs: [],
      settings: { flowChildCount: 2, stepCount: 1 },
    });

    const queue = getQueue("ai");
    await queue.pause();
    let enqueuedJobId: string | undefined;
    try {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "scan.png", contentType: "image/png", content: PNG },
        { name: "settings", content: JSON.stringify({ quality: "fast", language: "en" }) },
        { name: "clientJobId", content: clientJobId },
      ]);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/ocr",
        headers: { "content-type": contentType, authorization: `Bearer ${owner.token}` },
        body,
      });
      expect(res.statusCode).toBe(202);
      const payload = JSON.parse(res.body) as {
        jobId: string;
        progressJobId?: string;
        artifactJobId?: string;
        async: boolean;
      };
      enqueuedJobId = payload.artifactJobId ?? payload.jobId;
      expect(payload).toEqual({ jobId: expect.any(String), async: true });
      expect(payload.jobId).not.toBe(clientJobId);

      const parent = await jobRow(clientJobId);
      expect(parent?.type).toBe("batch");
      expect(parent?.status).toBe("processing");
      expect(parent?.progress).toEqual(initialProgress);
      expect(parent?.settings).toMatchObject({ flowChildCount: 2, stepCount: 1 });
    } finally {
      if (enqueuedJobId) {
        const queuedJob = await queue.getJob(enqueuedJobId);
        await queuedJob?.remove().catch(() => {});
      }
      await queue.resume();
    }
  });
});

describe("HTTP cancel on route-created single-tool rows", () => {
  it("answers 200 for the run's own plain user instead of the 404 mislabel path", async () => {
    const owner = await createUserAndLogin(app, `single-cancel-plain-${Date.now()}`);
    const clientJobId = randomUUID();
    await runResize(clientJobId, owner.token);

    // Pre-#808 the alias row had no owner, so this answered 404 and the
    // client settled a live run locally as "Canceled". A finished run
    // refuses the cancel, but through a 200.
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/jobs/${clientJobId}/cancel`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ canceled: false });
  });

  it("blocks a non-owner from canceling through the alias (404)", async () => {
    const owner = await createUserAndLogin(app, `single-cancel-victim-${Date.now()}`);
    const clientJobId = randomUUID();
    await runResize(clientJobId, owner.token);
    const attacker = await createUserAndLogin(app, `single-cancel-attacker-${Date.now()}`);

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/jobs/${clientJobId}/cancel`,
      headers: { authorization: `Bearer ${attacker.token}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("concurrent-job limit with alias rows (#808)", () => {
  it("does not count alias rows against maxConcurrentJobsPerUser", async () => {
    const user = await createUserAndLogin(app, `single-cancel-limit-${Date.now()}`);
    // One real in-flight job plus one SSE alias row for it. Only the real
    // job may count: alias rows are bookkeeping, and counting them would
    // silently halve the effective limit for every tool-route run.
    await db.insert(schema.jobs).values([
      {
        id: randomUUID(),
        userId: user.userId,
        type: "tool",
        status: "processing",
        inputRefs: [],
      },
      {
        id: randomUUID(),
        userId: user.userId,
        type: "single",
        status: "processing",
        inputRefs: [],
        settings: { artifactJobId: randomUUID() },
      },
    ]);
    await db
      .insert(schema.settings)
      .values({ key: "maxConcurrentJobsPerUser", value: "2" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "2" } });

    try {
      const clientJobId = randomUUID();
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "photo.png", contentType: "image/png", content: PNG },
        { name: "settings", content: JSON.stringify({ width: 50 }) },
        { name: "clientJobId", content: clientJobId },
      ]);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/resize",
        headers: { "content-type": contentType, authorization: `Bearer ${user.token}` },
        body,
      });
      expect([200, 202]).toContain(res.statusCode);
      await waitForTerminalFrame(clientJobId);
    } finally {
      await db
        .update(schema.settings)
        .set({ value: "0" })
        .where(eq(schema.settings.key, "maxConcurrentJobsPerUser"));
    }
  });

  it("still rejects real over-limit runs with 429", async () => {
    // The counter-direction pin: without it, a broader type filter could
    // turn the per-user limit into a no-op with every test green.
    const user = await createUserAndLogin(app, `single-cancel-429-${Date.now()}`);
    await db.insert(schema.jobs).values({
      id: randomUUID(),
      userId: user.userId,
      type: "tool",
      status: "queued",
      inputRefs: [],
    });
    await db
      .insert(schema.settings)
      .values({ key: "maxConcurrentJobsPerUser", value: "1" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "1" } });

    try {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "photo.png", contentType: "image/png", content: PNG },
        { name: "settings", content: JSON.stringify({ width: 50 }) },
        { name: "clientJobId", content: randomUUID() },
      ]);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/resize",
        headers: { "content-type": contentType, authorization: `Bearer ${user.token}` },
        body,
      });
      expect(res.statusCode).toBe(429);
      const parsed = JSON.parse(res.body) as { activeJobs?: number; limit?: number };
      expect(parsed.activeJobs).toBe(1);
      expect(parsed.limit).toBe(1);
    } finally {
      await db
        .update(schema.settings)
        .set({ value: "0" })
        .where(eq(schema.settings.key, "maxConcurrentJobsPerUser"));
    }
  });

  it("fails closed with 500 instead of skipping the cap when reading maxConcurrentJobsPerUser or rateLimitPerUser throws (#2545)", async () => {
    function breakSettingRead(targetKey: string) {
      const originalSelect = db.select.bind(db);
      return vi.spyOn(db, "select").mockImplementation((...args: unknown[]) => {
        const selection = args[0] as Record<string, unknown> | undefined;
        // biome-ignore lint/suspicious/noExplicitAny: passthrough to the real overloaded implementation
        const builder = (originalSelect as any)(...args);
        if (selection && "value" in selection) {
          const origFrom = builder.from.bind(builder);
          builder.from = (...fromArgs: unknown[]) => {
            const query = origFrom(...fromArgs);
            const origWhere = query.where.bind(query);
            query.where = (...whereArgs: unknown[]) => {
              const filtered = origWhere(...whereArgs);
              if (filtered.toSQL().params.includes(targetKey)) {
                throw new Error(`simulated settings store failure for ${targetKey}`);
              }
              return filtered;
            };
            return query;
          };
        }
        return builder;
      });
    }

    const user = await createUserAndLogin(app, `single-cancel-strict-${Date.now()}`);
    const seededJobId = randomUUID();
    await db.insert(schema.jobs).values({
      id: seededJobId,
      userId: user.userId,
      type: "tool",
      status: "queued",
      inputRefs: [],
    });
    await db
      .insert(schema.settings)
      .values({ key: "maxConcurrentJobsPerUser", value: "1" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "1" } });

    try {
      const maxConcurrentSpy = breakSettingRead("maxConcurrentJobsPerUser");
      try {
        const { body, contentType } = createMultipartPayload([
          { name: "file", filename: "photo.png", contentType: "image/png", content: PNG },
          { name: "settings", content: JSON.stringify({ width: 50 }) },
          { name: "clientJobId", content: randomUUID() },
        ]);
        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/resize",
          headers: { "content-type": contentType, authorization: `Bearer ${user.token}` },
          body,
        });
        expect(res.statusCode).toBe(500);
      } finally {
        maxConcurrentSpy.mockRestore();
      }

      const toolJobs = await db
        .select({ id: schema.jobs.id })
        .from(schema.jobs)
        .where(and(eq(schema.jobs.userId, user.userId), eq(schema.jobs.type, "tool")));
      expect(toolJobs.map((r) => r.id)).toEqual([seededJobId]);

      await db
        .update(schema.settings)
        .set({ value: "0" })
        .where(eq(schema.settings.key, "maxConcurrentJobsPerUser"));
      await db
        .insert(schema.settings)
        .values({ key: "rateLimitPerUser", value: "1" })
        .onConflictDoUpdate({ target: schema.settings.key, set: { value: "1" } });

      const rateLimitSpy = breakSettingRead("rateLimitPerUser");
      try {
        const { body, contentType } = createMultipartPayload([
          { name: "file", filename: "photo.png", contentType: "image/png", content: PNG },
          { name: "settings", content: JSON.stringify({ width: 50 }) },
        ]);
        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tools/image/resize",
          headers: { "content-type": contentType, authorization: `Bearer ${user.token}` },
          body,
        });
        expect(res.statusCode).toBe(500);
      } finally {
        rateLimitSpy.mockRestore();
      }

      const toolJobsAfterRateLimitFault = await db
        .select({ id: schema.jobs.id })
        .from(schema.jobs)
        .where(and(eq(schema.jobs.userId, user.userId), eq(schema.jobs.type, "tool")));
      expect(toolJobsAfterRateLimitFault.map((r) => r.id)).toEqual([seededJobId]);
    } finally {
      await db
        .update(schema.settings)
        .set({ value: "0" })
        .where(eq(schema.settings.key, "maxConcurrentJobsPerUser"));
      await db.delete(schema.settings).where(eq(schema.settings.key, "rateLimitPerUser"));
    }
  });
});

describe("sync response for a canceled run", () => {
  async function postResizeSync(): Promise<{ statusCode: number; body: string }> {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
      { name: "clientJobId", content: randomUUID() },
    ]);
    return app.inject({
      method: "POST",
      url: "/api/v1/tools/image/resize",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });
  }

  it("answers the structural canceled 422 when the worker was canceled", async () => {
    // A cancel that lands while the route blocks in the sync window
    // surfaces as the worker's UnrecoverableError("Canceled") after the
    // worker committed the canceled row; the route must answer the shape
    // the web client maps to its localized canceled state. The queue is
    // paused so the real worker cannot race the canned row state.
    const queue = getQueue("image");
    await queue.pause();
    enqueueMock.throwByPool.set("image", "Canceled");
    enqueueMock.markCanceled = true;
    try {
      const res = await postResizeSync();
      expect(res.statusCode).toBe(422);
      const parsed = JSON.parse(res.body) as { error: string; canceled?: boolean };
      expect(parsed.error).toBe("Canceled");
      expect(parsed.canceled).toBe(true);
    } finally {
      enqueueMock.throwByPool.delete("image");
      enqueueMock.markCanceled = false;
      await queue.resume();
    }
  });

  it("does not mislabel a genuine failure whose message is Canceled", async () => {
    // A tool process function can fail with exactly this string without
    // any cancel happening. The row is authoritative: no canceled status,
    // no canceled response, and the failure keeps its generic logged path.
    const queue = getQueue("image");
    await queue.pause();
    enqueueMock.throwByPool.set("image", "Canceled");
    try {
      const res = await postResizeSync();
      expect(res.statusCode).toBe(422);
      const parsed = JSON.parse(res.body) as { error: string; canceled?: boolean };
      expect(parsed.error).toBe("Processing failed");
      expect(parsed.canceled).toBeUndefined();
    } finally {
      enqueueMock.throwByPool.delete("image");
      await queue.resume();
    }
  });
});

describe("client disconnect before 202 on OCR (#2238)", () => {
  function postOcrRaw(clientJobId: string): http.ClientRequest {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "scan.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ quality: "fast", language: "en" }) },
      { name: "clientJobId", content: clientJobId },
    ]);
    const req = http.request(`${baseUrl}/api/v1/tools/image/ocr`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
        "content-length": body.length,
      },
    });
    req.on("error", () => {});
    req.end(body);
    return req;
  }

  it("discards the upload, settles the alias row, and skips enqueueing when the socket dies pre-enqueue", async () => {
    const clientJobId = randomUUID();
    let capturedJobId = "";
    let req: http.ClientRequest | undefined;

    enqueueMock.onAfterInsertAlias = async ({ jobId, clientJobId: cid }) => {
      if (cid !== clientJobId) return;
      capturedJobId = jobId;
      req?.destroy();
      await new Promise((r) => setTimeout(r, 100));
    };

    try {
      req = postOcrRaw(clientJobId);
      const frame = await waitForTerminalFrame(clientJobId, 10_000);
      expect(frame.error).toBe("Canceled");

      const alias = await jobRow(clientJobId);
      expect(alias?.status).toBe("canceled");
      expect(capturedJobId).not.toBe("");
      expect(await jobRow(capturedJobId)).toBeUndefined();
      expect(await objectExists(`uploads/${capturedJobId}/scan.png`)).toBe(false);
    } finally {
      enqueueMock.onAfterInsertAlias = null;
    }
  });

  it("cancels the enqueued job when the socket dies during enqueue", async () => {
    const clientJobId = randomUUID();
    let capturedJobId = "";
    let req: http.ClientRequest | undefined;
    const queue = getQueue("ai");
    await queue.pause();

    enqueueMock.onAfterEnqueueJob = async (jobId) => {
      capturedJobId = jobId;
      req?.destroy();
      await new Promise((r) => setTimeout(r, 100));
    };

    try {
      req = postOcrRaw(clientJobId);
      const frame = await waitForTerminalFrame(clientJobId, 10_000);
      expect(frame.error).toBe("Canceled");

      expect(capturedJobId).not.toBe("");
      const artifact = await jobRow(capturedJobId);
      expect(artifact?.status).toBe("canceled");
      const alias = await jobRow(clientJobId);
      expect(alias?.status).toBe("canceled");
    } finally {
      enqueueMock.onAfterEnqueueJob = null;
      await queue.resume();
    }
  });
});
