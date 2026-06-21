/**
 * Integration tests for the BullMQ job spine.
 *
 * Tests the full enqueue -> worker -> result cycle and cooperative
 * cancellation.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { requestCancel } from "../../../apps/api/src/jobs/cancel.js";
import { sharedRedis } from "../../../apps/api/src/jobs/connection.js";
import {
  closeQueueEvents,
  enqueueToolJob,
  waitForJob,
  warmQueueEvents,
} from "../../../apps/api/src/jobs/enqueue.js";
import { bullPrefix, type ToolJobData } from "../../../apps/api/src/jobs/types.js";
import { putObject } from "../../../apps/api/src/lib/object-storage.js";
import {
  registerToolProcessFn,
  type ToolProcessCtx,
} from "../../../apps/api/src/routes/tool-factory.js";
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

    // Request cancellation
    const canceled = await requestCancel(jobId);
    expect(canceled).toBe(true);

    // Wait for the worker to finish aborting: poll until the status
    // moves to a terminal state.
    let finalStatus = "processing";
    for (let i = 0; i < 30; i++) {
      const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
      if (row && row.status !== "processing" && row.status !== "queued") {
        finalStatus = row.status;
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }

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
