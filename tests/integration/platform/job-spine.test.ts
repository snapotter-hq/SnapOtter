/**
 * Integration tests for the BullMQ job spine.
 *
 * Tests the full enqueue -> worker -> result cycle and cooperative
 * cancellation.
 */
import { randomUUID } from "node:crypto";
import { RedisConnection } from "bullmq";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { sharedRedis } from "../../../apps/api/src/jobs/connection.js";
import {
  closeFlowProducer,
  closeQueueEvents,
  enqueueToolJob,
  getFlowProducer,
  waitForJob,
  warmQueueEvents,
} from "../../../apps/api/src/jobs/enqueue.js";
import { closeQueues, getQueue } from "../../../apps/api/src/jobs/queues.js";
import {
  bullPrefix,
  POOLS,
  queueName,
  type ToolJobData,
} from "../../../apps/api/src/jobs/types.js";
import { closeWorkers, startWorkers } from "../../../apps/api/src/jobs/worker.js";
import { putObject } from "../../../apps/api/src/lib/object-storage.js";
import {
  registerToolProcessFn,
  type ToolProcessCtx,
} from "../../../apps/api/src/routes/tool-factory.js";
import {
  AcceptedJobTimeoutError,
  cancelAcceptedJobAndWait,
  waitForAcceptedJobOrCancel,
} from "../settle-job.js";
import { buildTestApp, type TestApp } from "../test-server.js";

// Register test-only tools for the spine tests
registerToolProcessFn({
  toolId: "spine-echo",
  settingsSchema: { parse: (v: unknown) => v } as never,
  process: async (inputBuffer: Buffer, _settings: unknown, filename: string) => {
    return {
      buffer: inputBuffer,
      filename,
      contentType: "image/png",
    };
  },
});

registerToolProcessFn({
  toolId: "spine-slow",
  settingsSchema: { parse: (v: unknown) => v } as never,
  process: async (
    inputBuffer: Buffer,
    _settings: unknown,
    filename: string,
    ctx?: ToolProcessCtx,
  ) => {
    // Simulate slow work that respects cancellation
    for (let i = 0; i < 50; i++) {
      if (ctx?.signal?.aborted) {
        throw new Error("Job was canceled");
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return {
      buffer: inputBuffer,
      filename,
      contentType: "image/png",
    };
  },
});

let testApp: TestApp;

// Workers + cancel listener are started by test-server.ts (ensureSpine).
beforeAll(async () => {
  testApp = await buildTestApp();
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("Job spine", () => {
  it("enqueue -> worker -> result round-trip (spine-echo)", async () => {
    const jobId = randomUUID();
    const inputBuffer = Buffer.from("test-image-data");

    // Store input in object storage so the worker can retrieve it
    const inputRef = `uploads/${jobId}/test.png`;
    await putObject(inputRef, inputBuffer);

    const data: ToolJobData = {
      jobId,
      toolId: "spine-echo",
      userId: null,
      pool: "image",
      inputRefs: [inputRef],
      filename: "test.png",
      settings: {},
      kind: "tool",
    };

    await enqueueToolJob(data);

    const result = await waitForJob("image", jobId, 10_000);
    expect(result).not.toBeNull();
    // buildOutputName adds _spine-echo suffix since filename is unchanged
    expect(result!.filename).toBe("test_spine-echo.png");
    expect(result!.outputRefs.length).toBeGreaterThan(0);

    // Verify durable DB row
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    expect(job).toBeDefined();
    expect(job!.status).toBe("completed");
    expect(job!.bytesIn).toBeGreaterThan(0);
    expect(job!.bytesOut).toBeGreaterThan(0);
    expect(job!.durationMs).toBeGreaterThanOrEqual(0);
    expect(job!.startedAt).not.toBeNull();
    expect(job!.completedAt).not.toBeNull();
    expect(job!.outputRefs).toBeDefined();
    expect((job!.outputRefs as string[]).length).toBeGreaterThan(0);
    expect(result!.outputRefs).toEqual(job!.outputRefs);
  });

  it("cancel-active aborts a running job (spine-slow)", async () => {
    const jobId = randomUUID();
    const inputBuffer = Buffer.from("test-image-data");

    // Store input in object storage
    const inputRef = `uploads/${jobId}/slow.png`;
    await putObject(inputRef, inputBuffer);

    const data: ToolJobData = {
      jobId,
      toolId: "spine-slow",
      userId: null,
      pool: "image",
      inputRefs: [inputRef],
      filename: "slow.png",
      settings: {},
      kind: "tool",
    };

    await enqueueToolJob(data);

    // Wait for the worker to pick up the job and start processing.
    // Poll until the DB row shows "processing" (the worker sets this
    // before entering the process function).
    let started = false;
    for (let i = 0; i < 30; i++) {
      const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
      if (row?.status === "processing") {
        started = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(started).toBe(true);

    // A cancel request is only an acknowledgement that the signal was sent.
    // Wait for both the durable row and BullMQ to confirm worker termination.
    const finalStatus = await cancelAcceptedJobAndWait(jobId, "image");
    expect(finalStatus).toBe("canceled");

    // Verify that a terminal SSE frame is retrievable after cancel.
    // publishEphemeral should have written the terminal replay key
    // so reconnecting SSE clients get the frame immediately.
    const terminalKeyName = `${bullPrefix()}:terminal:${jobId}`;
    const cached = await sharedRedis().get(terminalKeyName);
    expect(cached).not.toBeNull();
    const parsed = JSON.parse(cached!);
    expect(parsed.phase).toBe("failed");
    expect(parsed.error).toBe("Canceled");
    expect(parsed.jobId).toBe(jobId);
  });

  it("wait-or-cancel drains an accepted job when its observation window expires", async () => {
    const jobId = randomUUID();
    const inputRef = `uploads/${jobId}/timeout.png`;
    await putObject(inputRef, Buffer.from("timeout-test"));

    await enqueueToolJob({
      jobId,
      toolId: "spine-slow",
      userId: null,
      pool: "image",
      inputRefs: [inputRef],
      filename: "timeout.png",
      settings: {},
      kind: "tool",
    });

    // Ensure this covers cooperative active-job cancellation rather than only
    // removal from the waiting queue.
    let started = false;
    for (let i = 0; i < 30; i++) {
      const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
      if (row?.status === "processing") {
        started = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(started).toBe(true);

    await expect(waitForAcceptedJobOrCancel(jobId, "image", 10)).rejects.toBeInstanceOf(
      AcceptedJobTimeoutError,
    );

    const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    expect(row?.status).toBe("canceled");
    const queueJob = await getQueue("image").getJob(jobId);
    const queueState = queueJob ? await queueJob.getState() : "missing";
    expect(["failed", "missing"]).toContain(queueState);
  });
});

describe("QueueEvents warm-up (sync-wait flake guard)", () => {
  it("warmQueueEvents() resolves for all pools and is idempotent", async () => {
    // First call connects every pool's consumer; the second reuses the cached,
    // already-ready consumers and must still resolve.
    await expect(warmQueueEvents()).resolves.toBeUndefined();
    await expect(warmQueueEvents()).resolves.toBeUndefined();
  });

  it("a warmed consumer captures a fast job's completion on the first sync-wait", async () => {
    // Drop the cached consumers to mimic a cold fork, then warm *before*
    // enqueueing so every consumer is positioned at the events-stream tail up
    // front. This is the exact invariant that prevents the csv-json 30s flake:
    // without the warm, a consumer created lazily inside the first waitForJob()
    // can miss a fast job's `completed` event and block for the whole window.
    await closeQueueEvents();
    await warmQueueEvents();

    const jobId = randomUUID();
    const inputRef = `uploads/${jobId}/warm.png`;
    await putObject(inputRef, Buffer.from("warm-test"));

    await enqueueToolJob({
      jobId,
      toolId: "spine-echo",
      userId: null,
      pool: "image",
      inputRefs: [inputRef],
      filename: "warm.png",
      settings: {},
      kind: "tool",
    });

    // A warmed consumer observes the completion promptly; a regression (cold or
    // missed event) would null out only when this window expires.
    const result = await waitForJob("image", jobId, 10_000);
    expect(result).not.toBeNull();
    expect(result!.outputRefs.length).toBeGreaterThan(0);
  }, 20_000);
});

describe("BullMQ connection teardown (#3284)", () => {
  it("closes underlying ioredis sockets across closeQueues, closeFlowProducer, closeQueueEvents, and closeWorkers", async () => {
    const forkClientPrefixes = POOLS.map(
      (pool) => `name=bull:${Buffer.from(queueName(pool)).toString("base64")}`,
    );
    const countForkNamedRedisClients = async (): Promise<number> => {
      const list = (await sharedRedis().client("LIST")) as string;
      return list
        .trim()
        .split("\n")
        .filter((line) => forkClientPrefixes.some((prefix) => line.includes(prefix))).length;
    };

    const initSpy = vi.spyOn(RedisConnection.prototype, "init");
    let cleanupResults: PromiseSettledResult<void>[] = [];

    try {
      await closeWorkers();
      await closeQueueEvents();
      await closeQueues();
      await closeFlowProducer();

      await vi.waitFor(
        async () => {
          expect(await countForkNamedRedisClients()).toBe(0);
        },
        { timeout: 2_000, interval: 25 },
      );

      initSpy.mockClear();

      startWorkers();
      await warmQueueEvents();
      const qClients = await Promise.all(POOLS.map((pool) => getQueue(pool).client));
      const fpClient = await getFlowProducer().client;

      await vi.waitFor(
        async () => {
          for (const pool of POOLS) {
            expect(await getQueue(pool).getWorkersCount()).toBe(1);
          }
          expect(await countForkNamedRedisClients()).toBe(POOLS.length * 2);
        },
        { timeout: 2_000, interval: 25 },
      );

      // 5 Queues + 1 FlowProducer + 5 QueueEvents + 10 Worker connections (5 main + 5 blocking) = 21
      expect(initSpy.mock.results).toHaveLength(POOLS.length * 4 + 1);
      const allClients = (await Promise.all(
        initSpy.mock.results.map((r: { value: unknown }) => r.value),
      )) as Array<{
        status: string;
      }>;
      for (const client of allClients) {
        expect(client.status).toBe("ready");
      }

      await closeQueues();
      for (const qClient of qClients) {
        expect(qClient.status).toBe("end");
      }

      await closeFlowProducer();
      expect(fpClient.status).toBe("end");

      await closeQueueEvents();
      await closeWorkers();

      for (const client of allClients) {
        expect(client.status).toBe("end");
      }

      await vi.waitFor(
        async () => {
          expect(await countForkNamedRedisClients()).toBe(0);
        },
        { timeout: 2_000, interval: 25 },
      );
    } finally {
      initSpy.mockRestore();
      cleanupResults = await Promise.allSettled([
        closeWorkers(),
        closeQueueEvents(),
        closeQueues(),
        closeFlowProducer(),
      ]);
      startWorkers();
      await warmQueueEvents();
      await vi.waitFor(
        async () => {
          for (const pool of POOLS) {
            expect(await getQueue(pool).getWorkersCount()).toBe(1);
          }
        },
        { timeout: 2_000, interval: 25 },
      );
    }
    expect(cleanupResults.filter((r) => r.status === "rejected")).toEqual([]);
  });
});
