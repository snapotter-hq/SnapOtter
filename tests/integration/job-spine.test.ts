/**
 * Integration tests for the BullMQ job spine.
 *
 * Tests the full enqueue -> worker -> result cycle and cooperative
 * cancellation. Requires the worker runtime (jobs/worker.ts) which
 * lands in Task 6.
 *
 * TODO(P2-T6): unskip when worker lands
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../apps/api/src/db/index.js";
import { requestCancel } from "../../apps/api/src/jobs/cancel.js";
import { enqueueToolJob, waitForJob } from "../../apps/api/src/jobs/enqueue.js";
import type { ToolJobData, ToolJobResult } from "../../apps/api/src/jobs/types.js";
import { registerToolProcessFn } from "../../apps/api/src/routes/tool-factory.js";
import { buildTestApp, type TestApp } from "./test-server.js";

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
    ctx?: { signal?: AbortSignal },
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

beforeAll(async () => {
  testApp = await buildTestApp();
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

// TODO(P2-T6): unskip when worker lands
describe.skip("Job spine", () => {
  it("enqueue -> worker -> result round-trip (spine-echo)", async () => {
    const jobId = randomUUID();
    const inputBuffer = Buffer.from("test-image-data");

    const data: ToolJobData = {
      jobId,
      toolId: "spine-echo",
      userId: null,
      pool: "image",
      inputRefs: ["test-ref"],
      filename: "test.png",
      settings: {},
      kind: "tool",
    };

    await enqueueToolJob(data);

    const result = await waitForJob("image", jobId, 10_000);
    expect(result).not.toBeNull();
    expect(result!.filename).toBe("test.png");
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

    const data: ToolJobData = {
      jobId,
      toolId: "spine-slow",
      userId: null,
      pool: "image",
      inputRefs: ["test-ref"],
      filename: "slow.png",
      settings: {},
      kind: "tool",
    };

    await enqueueToolJob(data);

    // Wait a bit for the job to start processing
    await new Promise((r) => setTimeout(r, 300));

    // Request cancellation
    const canceled = await requestCancel(jobId);
    expect(canceled).toBe(true);

    // Wait for the worker to finish aborting
    await new Promise((r) => setTimeout(r, 1000));

    // Verify the job row is canceled
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    expect(job).toBeDefined();
    expect(job!.status).toBe("canceled");
  });
});
