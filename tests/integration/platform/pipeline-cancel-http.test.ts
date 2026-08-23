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
// keep the real waitForJob.
const enqueueMock = vi.hoisted(() => ({
  cannedByPool: new Map<string, Record<string, unknown>>(),
}));

vi.mock("../../../apps/api/src/jobs/enqueue.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/jobs/enqueue.js")>();
  return {
    ...actual,
    waitForJob: async (...args: Parameters<typeof actual.waitForJob>) => {
      const canned = enqueueMock.cannedByPool.get(args[0]);
      if (canned) return canned;
      return actual.waitForJob(...args);
    },
  };
});

const { eq } = await import("drizzle-orm");
const { db, schema } = await import("../../../apps/api/src/db/index.js");
const { isBatchCanceled } = await import("../../../apps/api/src/jobs/batch-progress.js");
const { sharedRedis } = await import("../../../apps/api/src/jobs/connection.js");
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
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

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

    // Clear run 1's terminal frame so runPipeline waits on run 2's own.
    await sharedRedis().del(`${bullPrefix()}:terminal:${clientJobId}`);
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

  it("does not clobber a same-owner batch parent row that collides with the alias id (#887)", async () => {
    // Batch parent ids ARE the client-supplied id, so this collision is
    // reachable by an API caller reusing an id across the two endpoints.
    // The alias upsert must not replace the parent's cancel metadata, or a
    // later cancel of that batch publishes zero child aborts.
    const owner = await createUserAndLogin(app, `pipe-alias-collide-${Date.now()}`);
    const clientJobId = randomUUID();
    await db.insert(schema.jobs).values({
      id: clientJobId,
      userId: owner.userId,
      type: "batch",
      status: "processing",
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
    await waitForTerminalFrame(clientJobId);

    const parent = await jobRow(clientJobId);
    expect(parent?.type).toBe("batch");
    expect(parent?.settings).toMatchObject({ flowChildCount: 2, stepCount: 1 });
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

  it("does not let a second user take over an alias row by reusing its id", async () => {
    const clientJobId = randomUUID();
    await runPipeline(clientJobId);
    const before = await jobRow(clientJobId);
    const ownerBefore = before?.userId;
    const pointerBefore = ((before?.settings ?? {}) as { pipelineFlowId?: string }).pipelineFlowId;
    expect(ownerBefore).not.toBeNull();

    // A second user submits their own pipeline under the first user's id.
    // The run may proceed (colliding channels were always latest-run-wins),
    // but the alias row's owner and pointer must survive: transferring them
    // would hand the second user the row and strip the first user's own
    // cancel authorization.
    const attacker = await createUserAndLogin(app, `alias-reuse-${Date.now()}`);
    await sharedRedis().del(`${bullPrefix()}:terminal:${clientJobId}`);
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
      headers: { "content-type": contentType, authorization: `Bearer ${attacker.token}` },
      body,
    });
    expect([200, 202]).toContain(res.statusCode);
    await waitForTerminalFrame(clientJobId);

    const after = await jobRow(clientJobId);
    expect(after?.userId).toBe(ownerBefore);
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
