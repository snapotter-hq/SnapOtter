/**
 * Pipeline cancel over the real HTTP surface (#771).
 *
 * The worker-harness suite (pipeline-cancel.test.ts) hand-builds flows with
 * the cancel metadata the routes are supposed to stamp; this file pins the
 * stamping itself plus the HTTP cancel contract on route-created rows: the
 * alias row carries {pipelineFlowId} and the owner (so plain users can
 * cancel their own runs), the flow row carries {stepCount, clientJobId},
 * the batch parent carries stepCount, and the sync responses answer the
 * structural canceled shape the web client settles on.
 *
 * Mid-run timing is deliberately absent here (a tiny resize completes in
 * milliseconds; a reliably-slow tool needs binaries the CI shards lack), so
 * requestCancel's live behavior stays in the worker-harness suite. The one
 * synthetic trick: rows are reset to nonterminal before the cancel POST, so
 * resolution runs against genuinely route-stamped shapes without a race.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Canned sync-wait results, keyed by pool: lets the route's post-wait
// branches (the 422 canceled shapes) run deterministically. Null entries
// keep the real waitForJob; `timeoutOnce` forces one null return so the 202
// fallback payload is reachable without waiting 10 minutes.
const enqueueMock = vi.hoisted(() => ({
  cannedByPool: new Map<string, Record<string, unknown>>(),
  timeoutOnce: false,
  captureFlowOnce: false,
  capturedFlow: null as unknown,
}));

vi.mock("../../../apps/api/src/jobs/enqueue.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/jobs/enqueue.js")>();
  return {
    ...actual,
    getFlowProducer: () => {
      const producer = actual.getFlowProducer();
      if (!enqueueMock.captureFlowOnce) return producer;
      enqueueMock.captureFlowOnce = false;
      return {
        add: async (tree: unknown) => {
          enqueueMock.capturedFlow = tree;
          return {} as Awaited<ReturnType<typeof producer.add>>;
        },
      } as unknown as ReturnType<typeof actual.getFlowProducer>;
    },
    waitForJob: async (...args: Parameters<typeof actual.waitForJob>) => {
      if (enqueueMock.timeoutOnce) {
        enqueueMock.timeoutOnce = false;
        return null;
      }
      const canned = enqueueMock.cannedByPool.get(args[0]);
      if (canned) return canned;
      return actual.waitForJob(...args);
    },
  };
});

const { eq } = await import("drizzle-orm");
const { db, schema } = await import("../../../apps/api/src/db/index.js");
const { isBatchCanceled, markBatchCanceled } = await import(
  "../../../apps/api/src/jobs/batch-progress.js"
);
const { sharedRedis } = await import("../../../apps/api/src/jobs/connection.js");
const { getFlowProducer } = await import("../../../apps/api/src/jobs/enqueue.js");
const { runSystemJob, SYSTEM_JOBS } = await import("../../../apps/api/src/jobs/system-jobs.js");
const { bullPrefix } = await import("../../../apps/api/src/jobs/types.js");
const { completeBatchJob } = await import("../../../apps/api/src/routes/progress.js");
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

/** Run a one-step resize pipeline to completion under a fresh clientJobId. */
async function runPipeline(clientJobId: string): Promise<void> {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "photo.png", contentType: "image/png", content: PNG },
    {
      name: "pipeline",
      content: JSON.stringify({ steps: [{ toolId: "resize", settings: { width: 50 } }] }),
    },
    { name: "clientJobId", content: clientJobId },
  ]);
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/pipeline/execute",
    headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
    body,
  });
  expect([200, 202]).toContain(res.statusCode);
  await waitForTerminalFrame(clientJobId);
}

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
});

afterAll(async () => {
  await testApp.cleanup();
});

describe("route-stamped cancel metadata (#771)", () => {
  it("stamps the alias pointer, owner, and flow-row step count on /execute", async () => {
    const clientJobId = randomUUID();
    await runPipeline(clientJobId);

    const alias = await jobRow(clientJobId);
    expect(alias?.type).toBe("single");
    const aliasSettings = (alias?.settings ?? {}) as { pipelineFlowId?: string };
    expect(typeof aliasSettings.pipelineFlowId).toBe("string");
    // The owner lands on the alias so the cancel route's ownership check
    // passes for the user who started the run.
    expect(alias?.userId).not.toBeNull();

    const flow = await jobRow(aliasSettings.pipelineFlowId as string);
    expect(flow?.type).toBe("pipeline");
    expect(flow?.userId).toBe(alias?.userId);
    const flowSettings = (flow?.settings ?? {}) as { stepCount?: number; clientJobId?: string };
    expect(flowSettings.stepCount).toBe(1);
    expect(flowSettings.clientJobId).toBe(clientJobId);
  });

  it("re-stamps the alias pointer at the newest flow when a clientJobId is reused", async () => {
    const clientJobId = randomUUID();
    await runPipeline(clientJobId);
    const first = await jobRow(clientJobId);
    const firstFlow = ((first?.settings ?? {}) as { pipelineFlowId?: string }).pipelineFlowId;
    expect(typeof firstFlow).toBe("string");

    await runPipeline(clientJobId);

    // The reused id must not 500, and its pointer must follow the newest
    // flow so a cancel resolves the live run, not the finished one.
    const reused = await jobRow(clientJobId);
    const secondFlow = ((reused?.settings ?? {}) as { pipelineFlowId?: string }).pipelineFlowId;
    expect(typeof secondFlow).toBe("string");
    expect(secondFlow).not.toBe(firstFlow);
    const flow = await jobRow(secondFlow as string);
    expect(flow?.type).toBe("pipeline");
  });

  it("does not clobber a same-owner batch parent row that collides with the alias id (#887, #895)", async () => {
    // Batch parent ids ARE the client-supplied id, so this collision is
    // reachable by an API caller reusing an id across the two endpoints.
    // The alias upsert refuses to re-point the row (#887), and the run must
    // fall back to its own flow id so it never publishes or persists onto
    // the batch parent's channel (#895).
    const owner = await createUserAndLogin(app, `pipe-alias-collide-${Date.now()}`);
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

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.png", contentType: "image/png", content: PNG },
      {
        name: "pipeline",
        content: JSON.stringify({ steps: [{ toolId: "resize", settings: { width: 50 } }] }),
      },
      { name: "clientJobId", content: clientJobId },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/execute",
      headers: { "content-type": contentType, authorization: `Bearer ${owner.token}` },
      body,
    });
    expect([200, 202]).toContain(res.statusCode);
    const { jobId: flowId } = JSON.parse(res.body) as { jobId: string };
    expect(flowId).not.toBe(clientJobId);
    await waitForTerminalFrame(flowId);

    // Nothing from the pipeline landed on the refused batch channel.
    expect(await sharedRedis().get(`${bullPrefix()}:terminal:${clientJobId}`)).toBeNull();
    const parent = await jobRow(clientJobId);
    expect(parent?.type).toBe("batch");
    expect(parent?.status).toBe("processing");
    expect(parent?.progress).toEqual(initialProgress);
    expect(parent?.settings).toMatchObject({ flowChildCount: 2, stepCount: 1 });

    const flow = await jobRow(flowId);
    expect(flow?.type).toBe("pipeline");
    expect((flow?.settings ?? {}) as { clientJobId?: string }).toMatchObject({
      clientJobId: flowId,
    });

    // The batch parent's guarded completion transition still succeeds and
    // announces its own terminal frame on clientJobId.
    await completeBatchJob({
      jobId: clientJobId,
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 0,
      errors: [],
      outputRefs: [`outputs/${clientJobId}/batch.zip`],
      bytesOut: 128,
      result: { jobId: clientJobId, downloadUrl: `/api/v1/download/${clientJobId}/batch.zip` },
    });
    expect((await jobRow(clientJobId))?.status).toBe("completed");
    const batchFrame = await waitForTerminalFrame(clientJobId);
    expect(batchFrame.type).toBe("batch");
    expect(batchFrame.status).toBe("completed");
  });

  it("answers the server flow id on 202 when the alias claim was refused (#895)", async () => {
    const owner = await createUserAndLogin(app, `pipe-202-collide-${Date.now()}`);
    const clientJobId = randomUUID();
    await db.insert(schema.jobs).values({
      id: clientJobId,
      userId: owner.userId,
      type: "batch",
      status: "processing",
      inputRefs: [],
      settings: { flowChildCount: 1, stepCount: 1 },
    });

    enqueueMock.timeoutOnce = true;
    try {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "photo.png", contentType: "image/png", content: PNG },
        {
          name: "pipeline",
          content: JSON.stringify({ steps: [{ toolId: "resize", settings: { width: 50 } }] }),
        },
        { name: "clientJobId", content: clientJobId },
      ]);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/execute",
        headers: { "content-type": contentType, authorization: `Bearer ${owner.token}` },
        body,
      });
      expect(res.statusCode).toBe(202);
      const payload = JSON.parse(res.body) as { jobId: string; async: boolean };
      expect(payload.async).toBe(true);
      expect(payload.jobId).not.toBe(clientJobId);
      await waitForTerminalFrame(payload.jobId);
      expect((await jobRow(clientJobId))?.status).toBe("processing");
    } finally {
      enqueueMock.timeoutOnce = false;
    }
  });

  it("stamps stepCount on the pipeline-batch parent", async () => {
    const clientJobId = randomUUID();
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
      {
        name: "pipeline",
        content: JSON.stringify({ steps: [{ toolId: "resize", settings: { width: 50 } }] }),
      },
      { name: "clientJobId", content: clientJobId },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/batch",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });
    expect([200, 202]).toContain(res.statusCode);
    await waitForTerminalFrame(clientJobId);

    const parent = await jobRow(clientJobId);
    expect(parent?.type).toBe("batch");
    const settings = (parent?.settings ?? {}) as { flowChildCount?: number; stepCount?: number };
    expect(settings.flowChildCount).toBe(2);
    expect(settings.stepCount).toBe(1);
  });
});

describe("HTTP cancel on route-created pipeline rows", () => {
  it("resolves the alias to the flow and flags the run", async () => {
    const clientJobId = randomUUID();
    await runPipeline(clientJobId);

    // Terminal cancels are refused through the whole stack.
    const refused = await app.inject({
      method: "POST",
      url: `/api/v1/jobs/${clientJobId}/cancel`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(refused.statusCode).toBe(200);
    expect(JSON.parse(refused.body)).toEqual({ canceled: false });

    // Reset the run's rows to nonterminal so resolution runs against the
    // exact shapes the route stamped, without racing a live flow.
    const alias = await jobRow(clientJobId);
    const flowId = ((alias?.settings ?? {}) as { pipelineFlowId?: string }).pipelineFlowId;
    for (const id of [clientJobId, flowId as string, `${flowId}-s0`]) {
      await db
        .update(schema.jobs)
        .set({ status: "queued", completedAt: null })
        .where(eq(schema.jobs.id, id));
    }

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/jobs/${clientJobId}/cancel`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ canceled: true });
    expect(await isBatchCanceled(clientJobId)).toBe(true);
  });

  it("resets terminal status on a reused alias row so in-flight progress, cancel, and finalize work (#2650)", async () => {
    const clientJobId = randomUUID();
    await runPipeline(clientJobId);

    // Seed a stale error and a >1h createdAt on the completed alias row from
    // run 1 so the re-point must clear status, completedAt, error, and progress
    // while refreshing createdAt (#2650, #2807).
    const staleCreatedAt = new Date(Date.now() - 65 * 60_000);
    await db
      .update(schema.jobs)
      .set({ error: { message: "prior error" }, createdAt: staleCreatedAt })
      .where(eq(schema.jobs.id, clientJobId));
    const first = await jobRow(clientJobId);
    const firstFlow = ((first?.settings ?? {}) as { pipelineFlowId?: string }).pipelineFlowId;
    expect(first?.status).toBe("completed");
    expect(first?.completedAt).not.toBeNull();
    expect(first?.error).toEqual({ message: "prior error" });
    expect(first?.createdAt.getTime()).toBe(staleCreatedAt.getTime());
    expect(await sharedRedis().get(`${bullPrefix()}:terminal:${clientJobId}`)).not.toBeNull();

    enqueueMock.captureFlowOnce = true;
    enqueueMock.timeoutOnce = true;
    enqueueMock.capturedFlow = null;
    try {
      const beforeSecondRunMs = Date.now() - 5_000;
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "photo.png", contentType: "image/png", content: PNG },
        {
          name: "pipeline",
          content: JSON.stringify({ steps: [{ toolId: "resize", settings: { width: 50 } }] }),
        },
        { name: "clientJobId", content: clientJobId },
      ]);
      const execRes = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/execute",
        headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
        body,
      });
      expect(execRes.statusCode).toBe(202);

      // Re-pointing the alias cleared run 1's cached terminal frame in Redis (#2740).
      expect(await sharedRedis().get(`${bullPrefix()}:terminal:${clientJobId}`)).toBeNull();

      // Opening the SSE stream while run 2 is in flight must replay run 2's
      // nonterminal progress and stay open, not replay run 1's terminal frame (#2740).
      const ssePromise = app.inject({
        method: "GET",
        url: `/api/v1/jobs/${clientJobId}/progress`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      await new Promise((r) => setTimeout(r, 50));

      // The alias row was reset on re-point and accepted run 2's initial
      // nonterminal progress write instead of staying terminal from run 1.
      const inFlightAlias = await jobRow(clientJobId);
      const secondFlow = ((inFlightAlias?.settings ?? {}) as { pipelineFlowId?: string })
        .pipelineFlowId;
      expect(secondFlow).toBeDefined();
      expect(secondFlow).not.toBe(firstFlow);
      expect(inFlightAlias?.status).toBe("processing");
      expect(inFlightAlias?.completedAt).toBeNull();
      expect(inFlightAlias?.error).toBeNull();
      expect(inFlightAlias?.createdAt.getTime()).toBeGreaterThanOrEqual(beforeSecondRunMs);
      expect(inFlightAlias?.progress).toEqual({
        percent: 0,
        stage: "Preparing pipeline...",
      });

      // Periodic jobReconciliation must not fail the re-pointed alias row (#2807).
      await runSystemJob({ name: SYSTEM_JOBS.jobReconciliation } as never);
      expect((await jobRow(clientJobId))?.status).toBe("processing");

      // Canceling via clientJobId during run 2 now succeeds instead of being
      // refused by run 1's terminal status.
      const cancelRes = await app.inject({
        method: "POST",
        url: `/api/v1/jobs/${clientJobId}/cancel`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(cancelRes.statusCode).toBe(200);
      expect(JSON.parse(cancelRes.body)).toEqual({ canceled: true });
      expect(await isBatchCanceled(clientJobId)).toBe(true);

      // Enqueue run 2's captured flow so processPipelineFinalize settles both
      // the flow row and the re-pointed alias row as canceled.
      expect(enqueueMock.capturedFlow).not.toBeNull();
      await getFlowProducer().add(
        enqueueMock.capturedFlow as Parameters<ReturnType<typeof getFlowProducer>["add"]>[0],
      );
      const terminalFrame = await waitForTerminalFrame(clientJobId);
      expect(terminalFrame).toMatchObject({
        jobId: clientJobId,
        type: "single",
        phase: "failed",
        error: "Canceled",
      });
      const sseRes = await ssePromise;
      const sseFrames = sseRes.body
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data: "))
        .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>)
        .filter((frame) => frame.type !== "heartbeat");
      expect(sseFrames[0]).toMatchObject({
        jobId: clientJobId,
        type: "single",
        phase: "processing",
        percent: 0,
        stage: "Preparing pipeline...",
      });
      expect(sseFrames.at(-1)).toMatchObject({
        jobId: clientJobId,
        type: "single",
        phase: "failed",
        error: "Canceled",
      });
      expect((await jobRow(secondFlow as string))?.status).toBe("canceled");
      expect((await jobRow(clientJobId))?.status).toBe("canceled");
    } finally {
      enqueueMock.captureFlowOnce = false;
      enqueueMock.timeoutOnce = false;
      enqueueMock.capturedFlow = null;
    }

    // Run 3 reuses the canceled clientJobId within the 1h Redis cancel-flag
    // TTL (#2739): re-pointing the alias must clear the stale
    // batch:<clientJobId>:canceled key so run 3 completes instead of being
    // skipped by processPipelineStep as canceled.
    expect(await isBatchCanceled(clientJobId)).toBe(true);
    const { body: body3, contentType: contentType3 } = createMultipartPayload([
      { name: "file", filename: "photo.png", contentType: "image/png", content: PNG },
      {
        name: "pipeline",
        content: JSON.stringify({ steps: [{ toolId: "resize", settings: { width: 50 } }] }),
      },
      { name: "clientJobId", content: clientJobId },
    ]);
    const execRes3 = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/execute",
      headers: { "content-type": contentType3, authorization: `Bearer ${adminToken}` },
      body: body3,
    });
    expect(execRes3.statusCode).toBe(200);
    expect(await isBatchCanceled(clientJobId)).toBe(false);
    const thirdAlias = await jobRow(clientJobId);
    const thirdFlow = ((thirdAlias?.settings ?? {}) as { pipelineFlowId?: string }).pipelineFlowId;
    expect(thirdFlow).toBeDefined();
    expect(thirdFlow).not.toBe(firstFlow);
    expect((await jobRow(thirdFlow as string))?.status).toBe("completed");
    expect(thirdAlias?.status).toBe("completed");
  });

  it("blocks a non-owner from canceling a pipeline via its alias (404)", async () => {
    const clientJobId = randomUUID();
    await runPipeline(clientJobId);
    const attacker = await createUserAndLogin(app, `pipe-cancel-attacker-${Date.now()}`);

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/jobs/${clientJobId}/cancel`,
      headers: { authorization: `Bearer ${attacker.token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("does not let a second user take over or write to an alias row by reusing its id (#895)", async () => {
    const clientJobId = randomUUID();
    await runPipeline(clientJobId);
    const before = await jobRow(clientJobId);
    const ownerBefore = before?.userId;
    const progressBefore = before?.progress;
    const pointerBefore = ((before?.settings ?? {}) as { pipelineFlowId?: string }).pipelineFlowId;
    expect(ownerBefore).not.toBeNull();

    // A second user submits their own pipeline under the first user's id.
    // The claim is refused, so the second run falls back to its own flow id
    // and never publishes, persists, or clears the terminal key or cancel
    // flag on the first user's channel (#895, #2739, #2740).
    const terminalBefore = await sharedRedis().get(`${bullPrefix()}:terminal:${clientJobId}`);
    expect(terminalBefore).not.toBeNull();
    await markBatchCanceled(clientJobId);
    expect(await isBatchCanceled(clientJobId)).toBe(true);
    const attacker = await createUserAndLogin(app, `alias-reuse-${Date.now()}`);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.png", contentType: "image/png", content: PNG },
      {
        name: "pipeline",
        content: JSON.stringify({ steps: [{ toolId: "resize", settings: { width: 25 } }] }),
      },
      { name: "clientJobId", content: clientJobId },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/execute",
      headers: { "content-type": contentType, authorization: `Bearer ${attacker.token}` },
      body,
    });
    expect([200, 202]).toContain(res.statusCode);
    const { jobId: attackerFlowId } = JSON.parse(res.body) as { jobId: string };
    expect(attackerFlowId).not.toBe(clientJobId);
    await waitForTerminalFrame(attackerFlowId);
    expect(await sharedRedis().get(`${bullPrefix()}:terminal:${clientJobId}`)).toBe(terminalBefore);
    expect(await isBatchCanceled(clientJobId)).toBe(true);

    const after = await jobRow(clientJobId);
    expect(after?.userId).toBe(ownerBefore);
    expect(after?.status).toBe("completed");
    expect(after?.progress).toEqual(progressBefore);
    expect(((after?.settings ?? {}) as { pipelineFlowId?: string }).pipelineFlowId).toBe(
      pointerBefore,
    );
  });
});

describe("sync responses for canceled runs", () => {
  it("execute answers the structural canceled 422", async () => {
    enqueueMock.cannedByPool.set("image", {
      outputRefs: [],
      filename: "input.png",
      contentType: "",
      originalSize: 0,
      processedSize: 0,
      resultPayload: { error: "Canceled", canceled: true, stepsCompleted: 0, steps: [] },
    });
    try {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "photo.png", contentType: "image/png", content: PNG },
        {
          name: "pipeline",
          content: JSON.stringify({ steps: [{ toolId: "resize", settings: { width: 50 } }] }),
        },
        { name: "clientJobId", content: randomUUID() },
      ]);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/execute",
        headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
        body,
      });
      expect(res.statusCode).toBe(422);
      const parsed = JSON.parse(res.body) as { error: string; canceled?: boolean };
      expect(parsed.error).toBe("Canceled");
      expect(parsed.canceled).toBe(true);
    } finally {
      enqueueMock.cannedByPool.delete("image");
    }
  });

  it("batch answers the structural Batch canceled 422 on a full cancel", async () => {
    enqueueMock.cannedByPool.set("system", {
      outputRefs: [],
      filename: "",
      contentType: "application/json",
      originalSize: 0,
      processedSize: 0,
      resultPayload: {
        manifest: [
          { index: 0, filename: "a.png", error: "Canceled" },
          { index: 1, filename: "b.png", error: "Canceled" },
        ],
        canceled: true,
        allFailed: true,
      },
    });
    try {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
        { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
        {
          name: "pipeline",
          content: JSON.stringify({ steps: [{ toolId: "resize", settings: { width: 50 } }] }),
        },
        { name: "clientJobId", content: randomUUID() },
      ]);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/batch",
        headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
        body,
      });
      expect(res.statusCode).toBe(422);
      const parsed = JSON.parse(res.body) as { error: string; canceled?: boolean };
      expect(parsed.error).toBe("Batch canceled");
      expect(parsed.canceled).toBe(true);
    } finally {
      enqueueMock.cannedByPool.delete("system");
    }
  });
});
