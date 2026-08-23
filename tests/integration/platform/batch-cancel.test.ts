/**
 * Batch cancel (#767): the cooperative cancel flag, requestCancel's batch
 * branch, the batch-child skip, and the finalize's canceled terminal paths.
 *
 * Follows the worker-branches.test.ts harness: no HTTP app is built. The
 * test tool is registered directly in the process registry, flows are
 * enqueued the same way routes/batch.ts builds them, and the real workers
 * drain them against this fork's Postgres + Redis.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import AdmZip from "adm-zip";
import type { FlowJob } from "bullmq";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { ToolJobData } from "../../../apps/api/src/jobs/types.js";
import type { ToolProcessCtx } from "../../../apps/api/src/routes/tool-factory.js";

// Injects a fault into the skip path's outcome recording so the fall-through
// contract (a failing skip must not wedge the child) is testable.
const cancelSkipFault = vi.hoisted(() => ({ parentId: null as string | null }));

vi.mock("../../../apps/api/src/jobs/batch-progress.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/jobs/batch-progress.js")>();
  return {
    ...actual,
    recordChildOutcome: async (
      parentId: string,
      totalFiles: number,
      filename: string,
      error?: string,
    ) => {
      if (parentId === cancelSkipFault.parentId && error === "Canceled") {
        throw new Error("injected outcome-recording outage");
      }
      return actual.recordChildOutcome(parentId, totalFiles, filename, error);
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

// Behavior keyed on filename: fast*.png returns instantly, slow*.png waits on
// the worker's abort signal, so a cancel mid-batch has a real running target.
registerToolProcessFn({
  toolId: "wt-batch-cancel",
  settingsSchema: passthroughSchema,
  process: async (
    inputBuffer: Buffer,
    _settings: unknown,
    filename: string,
    ctx?: ToolProcessCtx,
  ) => {
    if (filename.startsWith("slow")) {
      await new Promise<void>((resolve, reject) => {
        const signal = ctx?.signal;
        if (!signal) {
          reject(new Error("wt-batch-cancel requires an abort signal"));
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

/** Insert the parent and child rows and enqueue the flow exactly the way
 * routes/batch.ts does (batch-finalize parent on the system queue, one
 * batch-child per file with attempts 1 + ignoreDependencyOnFailure).
 * beforeEnqueue runs between the row inserts and the FlowProducer add, the
 * window a pre-enqueue cancel lands in. */
async function enqueueBatchFlow(
  files: string[],
  opts: { beforeEnqueue?: (parentId: string) => Promise<void> } = {},
): Promise<{ parentId: string }> {
  const parentId = randomUUID();
  const fileIndexMap = files.map((_, i) => i);

  await db.insert(schema.jobs).values({
    id: parentId,
    type: "batch",
    toolId: "wt-batch-cancel",
    pool: "system",
    status: "queued",
    inputRefs: [],
    settings: { flowChildCount: files.length, fileIndexMap },
  });

  const children: FlowJob[] = [];
  for (let i = 0; i < files.length; i++) {
    const childId = `${parentId}-f${i}`;
    const key = `uploads/${childId}/${files[i]}`;
    await putObject(key, Buffer.from(`payload-${i}`));
    await db.insert(schema.jobs).values({
      id: childId,
      type: "batch-child",
      toolId: "wt-batch-cancel",
      pool: "image",
      status: "queued",
      inputRefs: [key],
    });
    children.push({
      name: "wt-batch-cancel",
      queueName: queueName("image"),
      data: {
        kind: "batch-child",
        jobId: childId,
        toolId: "wt-batch-cancel",
        userId: null,
        pool: "image",
        parentId,
        totalFiles: files.length,
        fileIndex: i,
        inputRefs: [key],
        filename: files[i],
        settings: {},
      } satisfies ToolJobData,
      opts: { jobId: childId, attempts: 1, ignoreDependencyOnFailure: true },
    });
  }

  const tree: FlowJob = {
    name: "batch-finalize",
    queueName: queueName("system"),
    data: {
      kind: "batch-finalize",
      jobId: parentId,
      toolId: "wt-batch-cancel",
      userId: null,
      pool: "system",
      totalFiles: files.length,
      inputRefs: [],
      filename: "",
      settings: { flowChildCount: files.length, fileIndexMap },
    } satisfies ToolJobData,
    opts: { jobId: parentId, attempts: 1 },
    children,
  };

  await opts.beforeEnqueue?.(parentId);
  await getFlowProducer().add(tree);
  return { parentId };
}

/** The finalize's BullMQ return value, what routes/batch.ts branches on. */
async function finalizeReturnValue(parentId: string): Promise<Record<string, unknown>> {
  const job = await waitFor(async () => {
    const j = await getQueue("system").getJob(parentId);
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

// ── Tests ───────────────────────────────────────────────────────

describe("batch cancel flag", () => {
  it("marks and reads the canceled flag with a TTL", async () => {
    const parentId = randomUUID();
    expect(await isBatchCanceled(parentId)).toBe(false);
    await markBatchCanceled(parentId);
    expect(await isBatchCanceled(parentId)).toBe(true);
    const ttl = await sharedRedis().ttl(`${bullPrefix()}:batch:${parentId}:canceled`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(3600);
  });
});

describe("requestCancel on a batch parent", () => {
  async function seedParent(
    overrides: Partial<typeof schema.jobs.$inferInsert> = {},
  ): Promise<string> {
    const id = randomUUID();
    await db.insert(schema.jobs).values({
      id,
      type: "batch",
      toolId: "resize",
      status: "processing",
      inputRefs: [],
      settings: { flowChildCount: 3 },
      ...overrides,
    });
    return id;
  }

  it("flags the batch and publishes a cancel for every flow child id", async () => {
    const id = await seedParent();
    const received: string[] = [];
    const sub = createRedisSubscriberConnection();
    await sub.subscribe(`${bullPrefix()}:cancel`);
    sub.on("message", (_ch: string, msg: string) => received.push(msg));

    try {
      expect(await requestCancel(id)).toBe(true);
      expect(await isBatchCanceled(id)).toBe(true);
      await vi.waitFor(() => {
        expect(received).toEqual([`${id}-f0`, `${id}-f1`, `${id}-f2`]);
      });
    } finally {
      await sub.quit();
    }
  });

  it("leaves the parent row alone: the finalize owns terminal state", async () => {
    const id = await seedParent();
    await requestCancel(id);
    const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    expect(row.status).toBe("processing");
    expect(row.completedAt).toBeNull();
  });

  it("returns false for a terminal batch and does not flag it", async () => {
    const id = await seedParent({ status: "completed" });
    expect(await requestCancel(id)).toBe(false);
    expect(await isBatchCanceled(id)).toBe(false);
  });

  it("cancels a pipeline-batch parent cooperatively, publishing per-file step ids", async () => {
    // #770 refused these (a flag would have claimed canceled while every
    // step kept running); #771 gave steps the cooperative check, so the
    // refusal flipped. The abortable jobs are the per-file pipeline steps,
    // not the per-file finalizes.
    const id = await seedParent({
      toolId: "pipeline-batch",
      settings: { flowChildCount: 2, stepCount: 2 },
    });
    const received: string[] = [];
    const sub = createRedisSubscriberConnection();
    await sub.subscribe(`${bullPrefix()}:cancel`);
    sub.on("message", (_ch: string, msg: string) => received.push(msg));

    try {
      expect(await requestCancel(id)).toBe(true);
      expect(await isBatchCanceled(id)).toBe(true);
      await vi.waitFor(() => {
        expect(received).toEqual([`${id}-f0-s0`, `${id}-f0-s1`, `${id}-f1-s0`, `${id}-f1-s1`]);
      });
    } finally {
      await sub.quit();
    }
  });

  it("returns false for an implicit batch row with no cooperative machinery", async () => {
    // Custom batch sub-routes (pdf-to-image, svg-to-raster) get their rows
    // from the progress persist layer: type batch, no settings, nothing
    // reading the flag. Claiming canceled: true for them would be a lie.
    const id = await seedParent({ toolId: null, settings: null });
    expect(await requestCancel(id)).toBe(false);
    expect(await isBatchCanceled(id)).toBe(false);
  });
});

describe("cooperative child skip and canceled finalize", () => {
  it("skips a pending child when the batch is canceled", async () => {
    const parentId = randomUUID();
    const childId = `${parentId}-f0`;
    const key = `uploads/${childId}/skipme.png`;
    await putObject(key, Buffer.from("payload"));
    await db.insert(schema.jobs).values({
      id: childId,
      type: "batch-child",
      toolId: "wt-batch-cancel",
      pool: "image",
      status: "queued",
      inputRefs: [key],
    });
    await markBatchCanceled(parentId);

    await getQueue("image").add(
      "wt-batch-cancel",
      {
        kind: "batch-child",
        jobId: childId,
        toolId: "wt-batch-cancel",
        userId: null,
        pool: "image",
        parentId,
        totalFiles: 1,
        fileIndex: 0,
        inputRefs: [key],
        filename: "skipme.png",
        settings: {},
      } satisfies ToolJobData,
      { jobId: childId, attempts: 1 },
    );

    const row = await terminalRow(childId);
    expect(row.status).toBe("canceled");
    expect((row.error as { message?: string } | null)?.message).toBe("Canceled");

    const base = `${bullPrefix()}:batch:${parentId}`;
    expect(await sharedRedis().get(`${base}:done`)).toBeNull();
    expect(await sharedRedis().get(`${base}:failed`)).toBe("1");
    const errors = (await sharedRedis().lrange(`${base}:errors`, 0, -1)).map(
      (e) => JSON.parse(e) as { filename: string; error: string },
    );
    expect(errors).toEqual([{ filename: "skipme.png", error: "Canceled" }]);
  });

  it("a failing skip falls through to normal processing instead of wedging the child", async () => {
    const parentId = randomUUID();
    const childId = `${parentId}-f0`;
    const key = `uploads/${childId}/fallthrough.png`;
    await putObject(key, Buffer.from("payload"));
    await db.insert(schema.jobs).values({
      id: childId,
      type: "batch-child",
      toolId: "wt-batch-cancel",
      pool: "image",
      status: "queued",
      inputRefs: [key],
    });
    await markBatchCanceled(parentId);
    cancelSkipFault.parentId = parentId;

    try {
      await getQueue("image").add(
        "wt-batch-cancel",
        {
          kind: "batch-child",
          jobId: childId,
          toolId: "wt-batch-cancel",
          userId: null,
          pool: "image",
          parentId,
          totalFiles: 1,
          fileIndex: 0,
          inputRefs: [key],
          filename: "fallthrough.png",
          settings: {},
        } satisfies ToolJobData,
        { jobId: childId, attempts: 1 },
      );

      // The injected fault hits the skip's outcome recording; the child must
      // end terminal through normal processing (a too-late cancel), never
      // stuck queued with a hard-failed job behind it.
      const row = await terminalRow(childId);
      expect(row.status).toBe("completed");
      const base = `${bullPrefix()}:batch:${parentId}`;
      expect(await sharedRedis().get(`${base}:done`)).toBe("1");
      expect(await sharedRedis().get(`${base}:failed`)).toBeNull();
    } finally {
      cancelSkipFault.parentId = null;
    }
  });

  it("cancel mid-batch commits a canceled row with a partial ZIP", async () => {
    const { parentId } = await enqueueBatchFlow(["fast.png", "slow-1.png", "slow-2.png"]);

    // The fast child must be done before the cancel so the batch has real
    // finished work to keep, and a slow child must be actively running so
    // the abort-over-the-channel path is exercised deterministically (a
    // queued slow child would take the flag-skip path, which has its own
    // test above).
    await waitFor(async () => {
      const fast = await jobRow(`${parentId}-f0`);
      const slow = await jobRow(`${parentId}-f1`);
      return fast?.status === "completed" && slow?.status === "processing" ? true : undefined;
    });

    expect(await requestCancel(parentId)).toBe(true);

    const parent = await terminalRow(parentId);
    expect(parent.status).toBe("canceled");
    expect(parent.outputRefs?.length).toBe(1);
    const zipKey = parent.outputRefs?.[0] as string;

    const frame = await terminalFrame(parentId);
    expect(frame.status).toBe("completed");
    const result = frame.result as { downloadUrl?: string; fileResults?: Record<string, string> };
    expect(result.downloadUrl).toContain(`/api/v1/download/${parentId}/`);
    expect(Object.keys(result.fileResults ?? {})).toEqual(["0"]);

    const zip = new AdmZip(await getObjectBuffer(zipKey));
    const names = zip.getEntries().map((e) => e.entryName);
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^fast/);

    for (const slow of [`${parentId}-f1`, `${parentId}-f2`]) {
      const row = await terminalRow(slow);
      expect(row.status).toBe("canceled");
    }

    // routes/batch.ts branches its sync response on this payload.
    const returned = await finalizeReturnValue(parentId);
    expect((returned.resultPayload as { canceled?: boolean }).canceled).toBe(true);
  });

  it("a direct cancel of one queued child settles the run canceled and the flow still finalizes (#809)", async () => {
    // The child-scoped shape #809's behavior change is about: no run-level
    // flag, just requestCancel on a single child id. slow f0 holds the
    // pool's one slot, so fast f1 is deterministically waiting when the
    // cancel removes it from the queue. BullMQ drops the parent's
    // dependency on a removed child, so the finalize must still run once
    // f0 completes, and the canceled f1 row alone labels the run.
    const { parentId } = await enqueueBatchFlow(["slow-1.png", "fast.png"]);

    await waitFor(async () => {
      const active = await jobRow(`${parentId}-f0`);
      return active?.status === "processing" ? true : undefined;
    });

    expect(await requestCancel(`${parentId}-f1`)).toBe(true);
    const canceledChild = await terminalRow(`${parentId}-f1`);
    expect(canceledChild.status).toBe("canceled");

    // No wedge: the finalize runs after f0's 20s hold resolves.
    const parent = await terminalRow(parentId, 35_000);
    expect(parent.status).toBe("canceled");
    expect(parent.outputRefs?.length).toBe(1);

    const zip = new AdmZip(await getObjectBuffer((parent.outputRefs ?? [])[0]));
    const names = zip.getEntries().map((e) => e.entryName);
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^slow-1/);

    const returned = await finalizeReturnValue(parentId);
    expect((returned.resultPayload as { canceled?: boolean }).canceled).toBe(true);

    const completedChild = await jobRow(`${parentId}-f0`);
    expect(completedChild?.status).toBe("completed");
  }, 45_000);

  it("a cancel that lands after every child finished completes normally", async () => {
    const { parentId } = await enqueueBatchFlow(["fast-a.png", "fast-b.png"]);

    await waitFor(async () => {
      const a = await jobRow(`${parentId}-f0`);
      const b = await jobRow(`${parentId}-f1`);
      return a?.status === "completed" && b?.status === "completed" ? true : undefined;
    });
    await markBatchCanceled(parentId);

    const parent = await terminalRow(parentId);
    expect(parent.status).toBe("completed");
    const frame = await terminalFrame(parentId);
    expect(frame.status).toBe("completed");
    const result = frame.result as { fileResults?: Record<string, string> };
    expect(Object.keys(result.fileResults ?? {})).toEqual(["0", "1"]);
  });

  it("a full cancel before any child ran fails with the Canceled synthetic", async () => {
    // Flag inside the insert-to-enqueue window so both children skip
    // regardless of worker timing: the pre-enqueue cancel race the DB-row
    // branch of requestCancel exists for.
    const { parentId } = await enqueueBatchFlow(["slow-x.png", "slow-y.png"], {
      beforeEnqueue: (id) => markBatchCanceled(id),
    });

    const parent = await terminalRow(parentId);
    expect(parent.status).toBe("canceled");
    expect(parent.outputRefs ?? []).toEqual([]);

    const frame = await terminalFrame(parentId);
    expect(frame.status).toBe("failed");
    const errors = frame.errors as Array<{ filename: string; error: string }>;
    expect(errors[0]).toEqual({ filename: "", error: "Canceled" });

    for (const childId of [`${parentId}-f0`, `${parentId}-f1`]) {
      const row = await jobRow(childId);
      expect(row?.status).toBe("canceled");
    }

    // routes/batch.ts turns this payload into the "Batch canceled" 422.
    const returned = await finalizeReturnValue(parentId);
    const resultPayload = returned.resultPayload as { canceled?: boolean; allFailed?: boolean };
    expect(resultPayload.canceled).toBe(true);
    expect(resultPayload.allFailed).toBe(true);
  });
});
