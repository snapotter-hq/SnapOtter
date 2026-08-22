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
}));

vi.mock("../../../apps/api/src/jobs/enqueue.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/jobs/enqueue.js")>();
  return {
    ...actual,
    waitForJob: async (...args: Parameters<typeof actual.waitForJob>) => {
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

const { eq } = await import("drizzle-orm");
const { db, schema } = await import("../../../apps/api/src/db/index.js");
const { sharedRedis } = await import("../../../apps/api/src/jobs/connection.js");
const { getQueue } = await import("../../../apps/api/src/jobs/queues.js");
const { bullPrefix } = await import("../../../apps/api/src/jobs/types.js");
const { fixtures, readFixture } = await import("../../fixtures/index.js");
const { buildTestApp, createMultipartPayload, createUserAndLogin, loginAsAdmin } = await import(
  "../test-server.js"
);

const PNG = readFixture(fixtures.image.base.png200);

let testApp: Awaited<ReturnType<typeof buildTestApp>>;
let app: (typeof testApp)["app"];
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
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

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

  it("re-points the alias at the newest artifact when a clientJobId is reused", async () => {
    const clientJobId = randomUUID();
    await runResize(clientJobId, adminToken);
    const first = await jobRow(clientJobId);
    const firstArtifact = ((first?.settings ?? {}) as { artifactJobId?: string }).artifactJobId;
    expect(typeof firstArtifact).toBe("string");

    // Clear run 1's terminal frame so runResize waits on run 2's own.
    await sharedRedis().del(`${bullPrefix()}:terminal:${clientJobId}`);
    await runResize(clientJobId, adminToken);

    const reused = await jobRow(clientJobId);
    const secondArtifact = ((reused?.settings ?? {}) as { artifactJobId?: string }).artifactJobId;
    expect(typeof secondArtifact).toBe("string");
    expect(secondArtifact).not.toBe(firstArtifact);
  });

  it("does not let a second user take over an alias row by reusing its id", async () => {
    const owner = await createUserAndLogin(app, `single-cancel-owner-${Date.now()}`);
    const clientJobId = randomUUID();
    await runResize(clientJobId, owner.token);
    const before = await jobRow(clientJobId);
    const pointerBefore = ((before?.settings ?? {}) as { artifactJobId?: string }).artifactJobId;
    expect(before?.userId).toBe(owner.userId);

    // A second user submits their own run under the first user's id. The
    // run may proceed (colliding channels were always latest-run-wins), but
    // the alias row's owner and pointer must survive: transferring them
    // would strip the first user's cancel authorization.
    const attacker = await createUserAndLogin(app, `single-cancel-reuse-${Date.now()}`);
    await sharedRedis().del(`${bullPrefix()}:terminal:${clientJobId}`);
    await runResize(clientJobId, attacker.token);

    const after = await jobRow(clientJobId);
    expect(after?.userId).toBe(owner.userId);
    expect(((after?.settings ?? {}) as { artifactJobId?: string }).artifactJobId).toBe(
      pointerBefore,
    );
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
