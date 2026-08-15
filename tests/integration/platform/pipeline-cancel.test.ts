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

// Injects a bounded fault into the step skip's flag read so the fall-through
// contract (a failing skip must not wedge the step) is testable. Bounded by
// `remaining` so the finalize's own flag read behind the same scope runs
// against the real implementation.
const flagReadFault = vi.hoisted(() => ({ scope: null as string | null, remaining: 0 }));

vi.mock("../../../apps/api/src/jobs/batch-progress.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/jobs/batch-progress.js")>();
  return {
    ...actual,
    isBatchCanceled: async (parentId: string) => {
      if (parentId === flagReadFault.scope && flagReadFault.remaining > 0) {
        flagReadFault.remaining--;
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
  const flowId = randomUUID();
  const built = await buildPipelineFlow(flowId, opts);
  await opts.beforeEnqueue?.(flowId);
  if (!opts.skipEnqueue) await getFlowProducer().add(built.tree);
  return { flowId, stepIds: built.stepIds };
}

async function buildPipelineFlow(
  flowId: string,
  opts: PipelineFlowOpts,
): Promise<{ tree: FlowJob; stepIds: string[] }> {
  const filename = opts.filename ?? "input.png";
  const totalSteps = opts.steps.length;
  const stepIds = opts.steps.map((_, i) => `${flowId}-s${i}`);
  // Batch per-file trees carry no clientJobId (the batch channel is the
  // parent id); single runs always carry the client-facing id.
  const progressId = opts.parentId ? undefined : (opts.clientJobId ?? flowId);
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
    // Cancel metadata is stamped on single-run flow rows only; per-file
    // rows of a batch resolve through the parent instead.
    settings: opts.parentId ? {} : { stepCount: totalSteps, clientJobId: progressId },
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

  return { tree, stepIds };
}

/**
 * Insert the parent row and per-file pipeline chains and enqueue the batch
 * flow exactly the way routes/pipeline.ts builds it: per-file trees as
 * children of one batch-finalize parent on the system queue, the parent row
 * carrying {flowChildCount, fileIndexMap, stepCount}.
 */
async function enqueuePipelineBatch(opts: {
  files: Array<{ steps: StepSettings[]; filename: string }>;
  beforeEnqueue?: (parentId: string) => Promise<void>;
}): Promise<{ parentId: string; fileFlowIds: string[] }> {
  const parentId = randomUUID();
  const stepCount = opts.files[0]?.steps.length ?? 0;
  const fileIndexMap = opts.files.map((_, i) => i);

  await db.insert(schema.jobs).values({
    id: parentId,
    type: "batch",
    toolId: "pipeline-batch",
    pool: "system",
    status: "queued",
    inputRefs: [],
    settings: { flowChildCount: opts.files.length, fileIndexMap, stepCount },
  });

  const children: FlowJob[] = [];
  const fileFlowIds: string[] = [];
  for (let i = 0; i < opts.files.length; i++) {
    const flowId = `${parentId}-f${i}`;
    const built = await buildPipelineFlow(flowId, {
      steps: opts.files[i].steps,
      parentId,
      totalFiles: opts.files.length,
      filename: opts.files[i].filename,
    });
    children.push(built.tree);
    fileFlowIds.push(flowId);
  }

  const batchTree: FlowJob = {
    name: "batch-finalize",
    queueName: queueName("system"),
    data: {
      kind: "batch-finalize",
      jobId: parentId,
      toolId: "pipeline-batch",
      userId: null,
      pool: "system",
      totalFiles: opts.files.length,
      inputRefs: [],
      filename: "",
      settings: { flowChildCount: opts.files.length, fileIndexMap, stepCount },
    } satisfies ToolJobData,
    opts: { jobId: parentId, attempts: 1 },
    children,
  };

  await opts.beforeEnqueue?.(parentId);
  await getFlowProducer().add(batchTree);
  return { parentId, fileFlowIds };
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

// ── Cooperative step skip and canceled finalize ─────────────────

describe("cooperative step skip and canceled finalize", () => {
  it("cancel mid-run aborts the active step, skips the queued step, and settles every surface", async () => {
    const clientJobId = randomUUID();
    const tag = `mid-${clientJobId.slice(0, 8)}`;
    const { flowId, stepIds } = await enqueuePipelineFlow({
      steps: [
        { mode: "slow", tag: `${tag}-s0` },
        { mode: "fast", tag: `${tag}-s1` },
      ],
      clientJobId,
    });

    // The slow step must be actively running so the abort-over-the-channel
    // path is exercised deterministically (a queued step would take the
    // flag-skip path, which has its own test below).
    await waitFor(async () => {
      const row = await jobRow(stepIds[0]);
      return row?.status === "processing" ? true : undefined;
    });

    expect(await requestCancel(clientJobId)).toBe(true);

    // Active step aborted, queued step skipped without ever running.
    const s0 = await terminalRow(stepIds[0]);
    expect(s0.status).toBe("canceled");
    const s1 = await terminalRow(stepIds[1]);
    expect(s1.status).toBe("canceled");
    expect(invoked).not.toContain(`${tag}-s1`);

    // Both the authoritative flow row and the client-facing alias settle
    // canceled (#766's dual-write lesson).
    const flow = await terminalRow(flowId);
    expect(flow.status).toBe("canceled");
    const alias = await terminalRow(clientJobId);
    expect(alias.status).toBe("canceled");
    expect((alias.error as { message?: string } | null)?.message).toBe("Canceled");

    // Live SSE clients settle from the terminal frame on the alias channel;
    // a reconnecting client replays the same canceled outcome.
    const frame = await terminalFrame(clientJobId);
    expect(frame.type).toBe("single");
    expect(frame.phase).toBe("failed");
    expect(frame.error).toBe("Canceled");

    // routes/pipeline.ts branches its sync 422 on this payload.
    const returned = await finalizeReturnValue(flowId);
    const payload = returned.resultPayload as { canceled?: boolean; error?: string };
    expect(payload.canceled).toBe(true);
    expect(payload.error).toBe("Canceled");
  });

  it("a cancel that lands after every step finished completes normally", async () => {
    const clientJobId = randomUUID();
    const tag = `late-${clientJobId.slice(0, 8)}`;
    const { flowId, stepIds } = await enqueuePipelineFlow({
      steps: [
        { mode: "fast", tag: `${tag}-s0` },
        { mode: "fast", tag: `${tag}-s1` },
      ],
      clientJobId,
    });

    await waitFor(async () => {
      const s0 = await jobRow(stepIds[0]);
      const s1 = await jobRow(stepIds[1]);
      return s0?.status === "completed" && s1?.status === "completed" ? true : undefined;
    });
    await markBatchCanceled(clientJobId);

    const flow = await terminalRow(flowId);
    expect(flow.status).toBe("completed");
    const frame = await terminalFrame(clientJobId);
    expect(frame.phase).toBe("complete");
    expect((frame.result as Record<string, unknown>).downloadUrl).toContain(
      `/api/v1/download/${flowId}/`,
    );
  });

  it("a cancel flagged before enqueue skips every step", async () => {
    const clientJobId = randomUUID();
    const tag = `pre-${clientJobId.slice(0, 8)}`;
    const { flowId, stepIds } = await enqueuePipelineFlow({
      steps: [
        { mode: "slow", tag: `${tag}-s0` },
        { mode: "slow", tag: `${tag}-s1` },
      ],
      clientJobId,
      beforeEnqueue: async () => {
        await markBatchCanceled(clientJobId);
      },
    });

    const flow = await terminalRow(flowId);
    expect(flow.status).toBe("canceled");
    for (const stepId of stepIds) {
      const row = await jobRow(stepId);
      expect(row?.status).toBe("canceled");
    }
    expect(invoked).not.toContain(`${tag}-s0`);
    expect(invoked).not.toContain(`${tag}-s1`);

    const alias = await terminalRow(clientJobId);
    expect(alias.status).toBe("canceled");
    const frame = await terminalFrame(clientJobId);
    expect(frame.phase).toBe("failed");
    expect(frame.error).toBe("Canceled");
  });

  it("a failing flag read falls through to normal processing instead of wedging the step", async () => {
    const clientJobId = randomUUID();
    const tag = `fault-${clientJobId.slice(0, 8)}`;
    flagReadFault.scope = clientJobId;
    flagReadFault.remaining = 2;

    try {
      const { flowId, stepIds } = await enqueuePipelineFlow({
        steps: [
          { mode: "fast", tag: `${tag}-s0` },
          { mode: "fast", tag: `${tag}-s1` },
        ],
        clientJobId,
        beforeEnqueue: async () => {
          await markBatchCanceled(clientJobId);
        },
      });

      // Both step-level flag reads hit the injected outage and must fall
      // through to normal processing (a too-late cancel), never leave the
      // step row wedged behind a hard-failed job. The finalize's own flag
      // read then runs for real, sees no canceled step, and completes.
      const flow = await terminalRow(flowId);
      expect(flow.status).toBe("completed");
      expect(invoked).toContain(`${tag}-s0`);
      expect(invoked).toContain(`${tag}-s1`);
      for (const stepId of stepIds) {
        const row = await jobRow(stepId);
        expect(row?.status).toBe("completed");
      }
    } finally {
      flagReadFault.scope = null;
      flagReadFault.remaining = 0;
    }
  });
});

// ── Pipeline-batch composition ──────────────────────────────────

describe("pipeline-batch cancel", () => {
  it("cancel mid-batch keeps finished files in a partial ZIP and cancels the rest", async () => {
    const { parentId, fileFlowIds } = await enqueuePipelineBatch({
      files: [
        { steps: [{ mode: "fast", tag: "pb-fast" }], filename: "fast.png" },
        { steps: [{ mode: "slow", tag: "pb-slow" }], filename: "slow.png" },
      ],
    });

    // The fast file's step must be done before the cancel so the batch has
    // real finished work to keep, and the slow file's step must be actively
    // running so the abort path is exercised. Only jobs scheduled ahead of
    // the slow step gate the condition (the pools run at concurrency 1).
    await waitFor(async () => {
      const fast = await jobRow(`${fileFlowIds[0]}-s0`);
      const slow = await jobRow(`${fileFlowIds[1]}-s0`);
      return fast?.status === "completed" && slow?.status === "processing" ? true : undefined;
    });

    expect(await requestCancel(parentId)).toBe(true);

    const parent = await terminalRow(parentId);
    expect(parent.status).toBe("canceled");
    expect(parent.outputRefs?.length).toBe(1);
    const zipKey = parent.outputRefs?.[0] as string;

    // The finished file's whole pipeline completed, so it lands in the ZIP
    // (#767's file-level partial semantics); the canceled file reads
    // "Canceled".
    const frame = await terminalFrame(parentId);
    expect(frame.status).toBe("completed");
    const result = frame.result as { downloadUrl?: string; fileResults?: Record<string, string> };
    expect(result.downloadUrl).toContain(`/api/v1/download/${parentId}/`);
    expect(Object.keys(result.fileResults ?? {})).toEqual(["0"]);

    const zip = new AdmZip(await getObjectBuffer(zipKey));
    const names = zip.getEntries().map((e) => e.entryName);
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^fast/);

    const finishedFile = await terminalRow(fileFlowIds[0]);
    expect(finishedFile.status).toBe("completed");
    const canceledFile = await terminalRow(fileFlowIds[1]);
    expect(canceledFile.status).toBe("canceled");
    const canceledStep = await terminalRow(`${fileFlowIds[1]}-s0`);
    expect(canceledStep.status).toBe("canceled");

    const returned = await waitFor(async () => {
      const j = await getQueue("system").getJob(parentId);
      return j?.returnvalue ? (j.returnvalue as Record<string, unknown>) : undefined;
    });
    expect((returned.resultPayload as { canceled?: boolean }).canceled).toBe(true);
  });

  it("a full cancel before any step ran settles the batch with the Canceled synthetic", async () => {
    const { parentId, fileFlowIds } = await enqueuePipelineBatch({
      files: [
        { steps: [{ mode: "slow", tag: "pbx-a" }], filename: "a.png" },
        { steps: [{ mode: "slow", tag: "pbx-b" }], filename: "b.png" },
      ],
      beforeEnqueue: (id) => markBatchCanceled(id),
    });

    const parent = await terminalRow(parentId);
    expect(parent.status).toBe("canceled");
    expect(parent.outputRefs ?? []).toEqual([]);

    const frame = await terminalFrame(parentId);
    expect(frame.status).toBe("failed");
    const errors = frame.errors as Array<{ filename: string; error: string }>;
    expect(errors[0]).toEqual({ filename: "", error: "Canceled" });

    for (const flowId of fileFlowIds) {
      const row = await jobRow(flowId);
      expect(row?.status).toBe("canceled");
      const step = await jobRow(`${flowId}-s0`);
      expect(step?.status).toBe("canceled");
    }
    expect(invoked).not.toContain("pbx-a");
    expect(invoked).not.toContain("pbx-b");
  });
});
