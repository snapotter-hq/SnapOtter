/**
 * Pipeline cancel (#771): requestCancel's pipeline resolution (flow row,
 * SSE alias, pipeline-batch parent), the step-level cooperative skip, and
 * the finalize's canceled terminal paths.
 *
 * Follows the batch-cancel.test.ts harness: no HTTP app is built. The test
 * tool is registered directly in the process registry, flows are enqueued
 * the same way routes/pipeline.ts builds them (nested step chain under a
 * pipeline-finalize parent, plus the cancel metadata the route stamps), and
 * the real workers drain them against this fork's Postgres + Redis.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import AdmZip from "adm-zip";
import type { FlowJob } from "bullmq";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { ToolJobData } from "../../../apps/api/src/jobs/types.js";
import type { ToolProcessCtx } from "../../../apps/api/src/routes/tool-factory.js";

// Injects a fault into the step skip's flag read so the fall-through
// contract (a failing skip must not wedge the step) is testable.
const flagReadFault = vi.hoisted(() => ({ scope: null as string | null }));

vi.mock("../../../apps/api/src/jobs/batch-progress.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/jobs/batch-progress.js")>();
  return {
    ...actual,
    isBatchCanceled: async (parentId: string) => {
      if (parentId === flagReadFault.scope) {
        throw new Error("injected flag-read outage");
      }
      return actual.isBatchCanceled(parentId);
    },
  };
});

const { eq } = await import("drizzle-orm");
const { db, schema } = await import("../../../apps/api/src/db/index.js");
const { runMigrations } = await import("../../../apps/api/src/db/migrate.js");
const { isBatchCanceled, markBatchCanceled } = await import(
  "../../../apps/api/src/jobs/batch-progress.js"
);
const { requestCancel, startCancelListener, stopCancelListener } = await import(
  "../../../apps/api/src/jobs/cancel.js"
);
const { createRedisSubscriberConnection, sharedRedis } = await import(
  "../../../apps/api/src/jobs/connection.js"
);
const { getFlowProducer } = await import("../../../apps/api/src/jobs/enqueue.js");
const { closeQueues, getQueue } = await import("../../../apps/api/src/jobs/queues.js");
const { bullPrefix, queueName } = await import("../../../apps/api/src/jobs/types.js");
const { closeWorkers, startWorkers } = await import("../../../apps/api/src/jobs/worker.js");
const { getObjectBuffer, putObject } = await import("../../../apps/api/src/lib/object-storage.js");
const { registerToolProcessFn } = await import("../../../apps/api/src/routes/tool-factory.js");

const passthroughSchema = { parse: (v: unknown) => v } as never;

interface StepSettings {
  mode: "fast" | "slow";
  tag: string;
}

// Behavior keyed on per-step settings: fast returns instantly, slow waits on
// the worker's abort signal, so a cancel mid-pipeline has a real running
// target. Every invocation records its tag, so "this step never ran" is a
// positive assertion instead of a timing guess.
const invoked: string[] = [];
registerToolProcessFn({
  toolId: "wt-pipeline-cancel",
  settingsSchema: passthroughSchema,
  process: async (
    inputBuffer: Buffer,
    settings: unknown,
    filename: string,
    ctx?: ToolProcessCtx,
  ) => {
    const { mode, tag } = settings as StepSettings;
    invoked.push(tag);
    if (mode === "slow") {
      await new Promise<void>((resolve, reject) => {
        const signal = ctx?.signal;
        if (!signal) {
          reject(new Error("wt-pipeline-cancel requires an abort signal"));
          return;
        }
        if (signal.aborted) {
          reject(new Error("aborted before start"));
          return;
        }
        const timer = setTimeout(resolve, 20_000);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new Error("aborted by signal"));
          },
          { once: true },
        );
      });
    }
    return { buffer: inputBuffer, filename, contentType: "image/png" };
  },
});

mkdirSync(process.env.WORKSPACE_PATH ?? "", { recursive: true });
await runMigrations();

// ── Helpers ─────────────────────────────────────────────────────

type JobRow = typeof schema.jobs.$inferSelect;

async function waitFor<T>(probe: () => Promise<T | undefined>, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`condition not met within ${timeoutMs}ms`);
    await delay(150);
  }
}

async function jobRow(jobId: string): Promise<JobRow | undefined> {
  const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
  return row;
}

async function terminalRow(jobId: string, timeoutMs = 25_000): Promise<JobRow> {
  return waitFor(async () => {
    const row = await jobRow(jobId);
    return row && row.status !== "queued" && row.status !== "processing" ? row : undefined;
  }, timeoutMs);
}

async function terminalFrame(jobId: string): Promise<Record<string, unknown>> {
  const raw = await waitFor(async () => {
    const value = await sharedRedis().get(`${bullPrefix()}:terminal:${jobId}`);
    return value ?? undefined;
  }, 25_000);
  return JSON.parse(raw) as Record<string, unknown>;
}

/** Collect ids published on the cancel channel for the duration of `fn`. */
async function collectCancelPublishes(fn: () => Promise<void>): Promise<string[]> {
  const received: string[] = [];
  const sub = createRedisSubscriberConnection();
  await sub.subscribe(`${bullPrefix()}:cancel`);
  sub.on("message", (_ch: string, msg: string) => received.push(msg));
  try {
    await fn();
    // Publishes are awaited inside requestCancel, but delivery to this
    // subscriber is async; give the frames a beat to arrive.
    await delay(300);
    return received;
  } finally {
    await sub.quit();
  }
}

interface PipelineFlowOpts {
  /** Per-step tool settings; length defines the step count. */
  steps: StepSettings[];
  /** Client-facing id; when set an alias row is inserted route-style. */
  clientJobId?: string;
  /** Pipeline-batch wiring: parent id + total files for the per-file tree. */
  parentId?: string;
  totalFiles?: number;
  filename?: string;
  beforeEnqueue?: (flowId: string) => Promise<void>;
  /** Skip the FlowProducer add (for pure requestCancel resolution tests). */
  skipEnqueue?: boolean;
}

/**
 * Insert the rows and build the nested flow exactly the way
 * routes/pipeline.ts does after #771: step rows + flow row with the cancel
 * metadata ({stepCount, clientJobId}), an alias row carrying the
 * {pipelineFlowId} pointer when a clientJobId is used, steps nested under a
 * pipeline-finalize parent with step 0 deepest.
 */
async function enqueuePipelineFlow(
  opts: PipelineFlowOpts,
): Promise<{ flowId: string; stepIds: string[] }> {
  const flowId = opts.parentId ? `${opts.parentId}-f0` : randomUUID();
  return enqueuePipelineFlowAt(flowId, opts);
}

async function enqueuePipelineFlowAt(
  flowId: string,
  opts: PipelineFlowOpts,
): Promise<{ flowId: string; stepIds: string[] }> {
  const filename = opts.filename ?? "input.png";
  const totalSteps = opts.steps.length;
  const stepIds = opts.steps.map((_, i) => `${flowId}-s${i}`);
  const progressId = opts.clientJobId ?? flowId;
  const uploadKey = `uploads/${flowId}-s0/${filename}`;
  await putObject(uploadKey, Buffer.from("payload"));

  if (opts.clientJobId) {
    await db.insert(schema.jobs).values({
      id: opts.clientJobId,
      type: "single",
      status: "queued",
      inputRefs: [],
      settings: { pipelineFlowId: flowId },
    });
  }

  for (let i = 0; i < totalSteps; i++) {
    await db.insert(schema.jobs).values({
      id: stepIds[i],
      type: "pipeline-step",
      toolId: "wt-pipeline-cancel",
      pool: "image",
      status: "queued",
      inputRefs: i === 0 ? [uploadKey] : [],
      settings: opts.steps[i] as unknown as Record<string, unknown>,
    });
  }

  await db.insert(schema.jobs).values({
    id: flowId,
    type: opts.parentId ? "pipeline-finalize" : "pipeline",
    toolId: "pipeline",
    pool: "image",
    status: "queued",
    inputRefs: [],
    settings: { stepCount: totalSteps, clientJobId: progressId },
  });

  let node: FlowJob = {
    name: "wt-pipeline-cancel",
    queueName: queueName("image"),
    data: {
      kind: "pipeline-step",
      jobId: stepIds[0],
      toolId: "wt-pipeline-cancel",
      userId: null,
      pool: "image",
      stepIndex: 0,
      totalSteps,
      prevJobId: undefined,
      clientJobId: progressId,
      parentId: opts.parentId,
      inputRefs: [uploadKey],
      filename,
      settings: opts.steps[0],
    } satisfies ToolJobData,
    opts: { jobId: stepIds[0], attempts: 1, ignoreDependencyOnFailure: true },
  };
  for (let i = 1; i < totalSteps; i++) {
    node = {
      name: "wt-pipeline-cancel",
      queueName: queueName("image"),
      data: {
        kind: "pipeline-step",
        jobId: stepIds[i],
        toolId: "wt-pipeline-cancel",
        userId: null,
        pool: "image",
        stepIndex: i,
        totalSteps,
        prevJobId: stepIds[i - 1],
        clientJobId: progressId,
        parentId: opts.parentId,
        inputRefs: [],
        filename,
        settings: opts.steps[i],
      } satisfies ToolJobData,
      opts: { jobId: stepIds[i], attempts: 1, ignoreDependencyOnFailure: true },
      children: [node],
    };
  }

  const tree: FlowJob = {
    name: "pipeline-finalize",
    queueName: queueName("image"),
    data: {
      kind: "pipeline-finalize",
      jobId: flowId,
      toolId: "pipeline",
      userId: null,
      pool: "image",
      totalSteps,
      clientJobId: progressId,
      parentId: opts.parentId,
      totalFiles: opts.totalFiles,
      inputRefs: [],
      filename,
      settings: {},
    } satisfies ToolJobData,
    opts: {
      jobId: flowId,
      attempts: 1,
      ...(opts.parentId ? { ignoreDependencyOnFailure: true } : {}),
    },
    children: [node],
  };

  await opts.beforeEnqueue?.(flowId);
  if (!opts.skipEnqueue) await getFlowProducer().add(tree);
  return { flowId, stepIds };
}

/** The finalize's BullMQ return value, what routes/pipeline.ts branches on. */
async function finalizeReturnValue(flowId: string): Promise<Record<string, unknown>> {
  const job = await waitFor(async () => {
    const j = await getQueue("image").getJob(flowId);
    return j?.returnvalue ? j : undefined;
  });
  return job.returnvalue as Record<string, unknown>;
}

beforeAll(async () => {
  await startCancelListener();
  startWorkers();
}, 30_000);

afterAll(async () => {
  await closeWorkers();
  await stopCancelListener();
  await closeQueues();
  await sharedRedis().quit();
}, 20_000);

// ── requestCancel resolution ────────────────────────────────────

describe("requestCancel on a pipeline flow row", () => {
  it("flags the scope key from settings and publishes every step id", async () => {
    const clientJobId = randomUUID();
    const { flowId, stepIds } = await enqueuePipelineFlow({
      steps: [
        { mode: "fast", tag: "r0" },
        { mode: "fast", tag: "r1" },
      ],
      clientJobId,
      skipEnqueue: true,
    });

    const received = await collectCancelPublishes(async () => {
      expect(await requestCancel(flowId)).toBe(true);
    });

    // The flag is keyed by the id steps carry in data.clientJobId, not the
    // flow row id, so queued steps can actually see it.
    expect(await isBatchCanceled(clientJobId)).toBe(true);
    expect(await isBatchCanceled(flowId)).toBe(false);
    expect(received).toEqual(stepIds);
  });

  it("flags the flow id itself when the run has no alias", async () => {
    const { flowId, stepIds } = await enqueuePipelineFlow({
      steps: [{ mode: "fast", tag: "n0" }],
      skipEnqueue: true,
    });

    const received = await collectCancelPublishes(async () => {
      expect(await requestCancel(flowId)).toBe(true);
    });

    expect(await isBatchCanceled(flowId)).toBe(true);
    expect(received).toEqual(stepIds);
  });

  it("leaves the flow row alone: the finalize owns terminal state", async () => {
    const { flowId } = await enqueuePipelineFlow({
      steps: [{ mode: "fast", tag: "row0" }],
      skipEnqueue: true,
    });
    expect(await requestCancel(flowId)).toBe(true);
    const row = await jobRow(flowId);
    expect(row?.status).toBe("queued");
    expect(row?.completedAt).toBeNull();
  });

  it("returns false for a terminal flow row and does not flag it", async () => {
    const clientJobId = randomUUID();
    const { flowId } = await enqueuePipelineFlow({
      steps: [{ mode: "fast", tag: "t0" }],
      clientJobId,
      skipEnqueue: true,
    });
    await db
      .update(schema.jobs)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(schema.jobs.id, flowId));

    expect(await requestCancel(flowId)).toBe(false);
    expect(await isBatchCanceled(clientJobId)).toBe(false);
  });
});

describe("requestCancel on a pipeline SSE alias row", () => {
  it("resolves the pointer, flags the alias id, and publishes the flow's step ids", async () => {
    const clientJobId = randomUUID();
    const { flowId, stepIds } = await enqueuePipelineFlow({
      steps: [
        { mode: "fast", tag: "a0" },
        { mode: "fast", tag: "a1" },
        { mode: "fast", tag: "a2" },
      ],
      clientJobId,
      skipEnqueue: true,
    });

    const received = await collectCancelPublishes(async () => {
      expect(await requestCancel(clientJobId)).toBe(true);
    });

    expect(await isBatchCanceled(clientJobId)).toBe(true);
    expect(received).toEqual(stepIds.map((id) => id));
    expect(received.every((id) => id.startsWith(flowId))).toBe(true);
  });

  it("still flags when the flow rows are not inserted yet (pre-enqueue window)", async () => {
    // The route inserts the alias (with its pointer) before the flow rows;
    // a cancel landing in that window must still commit the flag.
    const clientJobId = randomUUID();
    const flowId = randomUUID();
    await db.insert(schema.jobs).values({
      id: clientJobId,
      type: "single",
      status: "queued",
      inputRefs: [],
      settings: { pipelineFlowId: flowId },
    });

    expect(await requestCancel(clientJobId)).toBe(true);
    expect(await isBatchCanceled(clientJobId)).toBe(true);
  });

  it("returns false for a terminal alias row and does not flag it", async () => {
    const clientJobId = randomUUID();
    await enqueuePipelineFlow({
      steps: [{ mode: "fast", tag: "ta0" }],
      clientJobId,
      skipEnqueue: true,
    });
    await db
      .update(schema.jobs)
      .set({ status: "canceled", completedAt: new Date() })
      .where(eq(schema.jobs.id, clientJobId));

    expect(await requestCancel(clientJobId)).toBe(false);
    expect(await isBatchCanceled(clientJobId)).toBe(false);
  });

  it("does not treat a plain single row as a pipeline", async () => {
    // No pipelineFlowId pointer: falls through to the queue scan and, with
    // no queue job under this id, reports false (pre-#771 behavior).
    const id = randomUUID();
    await db.insert(schema.jobs).values({
      id,
      type: "single",
      status: "processing",
      inputRefs: [],
    });
    expect(await requestCancel(id)).toBe(false);
    expect(await isBatchCanceled(id)).toBe(false);
  });
});

describe("requestCancel on a pipeline-batch parent", () => {
  async function seedParent(
    overrides: Partial<typeof schema.jobs.$inferInsert> = {},
  ): Promise<string> {
    const id = randomUUID();
    await db.insert(schema.jobs).values({
      id,
      type: "batch",
      toolId: "pipeline-batch",
      status: "processing",
      inputRefs: [],
      settings: { flowChildCount: 2, stepCount: 2 },
      ...overrides,
    });
    return id;
  }

  it("flags the batch and publishes a cancel for every per-file step id", async () => {
    const id = await seedParent();

    const received = await collectCancelPublishes(async () => {
      expect(await requestCancel(id)).toBe(true);
    });

    expect(await isBatchCanceled(id)).toBe(true);
    expect(received).toEqual([`${id}-f0-s0`, `${id}-f0-s1`, `${id}-f1-s0`, `${id}-f1-s1`]);
  });

  it("returns false for a terminal pipeline-batch parent", async () => {
    const id = await seedParent({ status: "completed" });
    expect(await requestCancel(id)).toBe(false);
    expect(await isBatchCanceled(id)).toBe(false);
  });
});
