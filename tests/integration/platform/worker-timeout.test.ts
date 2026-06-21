/**
 * Integration test: timeout is classified as "failed" (not "canceled"),
 * retried per the queue's attempts policy, and emits the correct
 * terminal SSE replay key on the final attempt.
 *
 * JOB_TIMEOUT_FAST_S is set to 1 second BEFORE API modules load so
 * all dynamic imports capture the override.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Override timeout BEFORE any API module is loaded (static imports
// above are vitest-only and do not trigger config.ts).
process.env.JOB_TIMEOUT_FAST_S = "1";

// Dynamic imports so config.ts picks up the 1-second timeout.
const { eq } = await import("drizzle-orm");
const { db, schema } = await import("../../../apps/api/src/db/index.js");
const { startCancelListener, stopCancelListener } = await import(
  "../../../apps/api/src/jobs/cancel.js"
);
const { sharedRedis } = await import("../../../apps/api/src/jobs/connection.js");
const { enqueueToolJob } = await import("../../../apps/api/src/jobs/enqueue.js");
const { bullPrefix } = await import("../../../apps/api/src/jobs/types.js");
const { closeWorkers, startWorkers } = await import("../../../apps/api/src/jobs/worker.js");
const { putObject } = await import("../../../apps/api/src/lib/object-storage.js");
const { registerToolProcessFn } = await import("../../../apps/api/src/routes/tool-factory.js");
const { env } = await import("../../../apps/api/src/config.js");

// Sanity: the env override must have taken effect.
if (env.JOB_TIMEOUT_FAST_S !== 1) {
  throw new Error(
    `Expected JOB_TIMEOUT_FAST_S=1, got ${env.JOB_TIMEOUT_FAST_S}. Env override failed.`,
  );
}

// Register a test-only tool that loops and respects the abort signal.
registerToolProcessFn({
  toolId: "timeout-slow",
  settingsSchema: { parse: (v: unknown) => v } as never,
  process: async (
    inputBuffer: Buffer,
    _settings: unknown,
    filename: string,
    ctx?: import("../../../apps/api/src/routes/tool-factory.js").ToolProcessCtx,
  ) => {
    // Loop for up to 30s, checking signal every 100ms.
    for (let i = 0; i < 300; i++) {
      if (ctx?.signal?.aborted) {
        throw new Error("Aborted by signal");
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return { buffer: inputBuffer, filename, contentType: "image/png" };
  },
});

// Ensure workspace dir exists (test-server.ts normally does this, but
// we bypass it to avoid loading the full app).
const { mkdirSync } = await import("node:fs");
const wsPath = process.env.WORKSPACE_PATH ?? "";
mkdirSync(wsPath, { recursive: true });

// Run migrations so the jobs table exists in this fork's DB.
const { runMigrations } = await import("../../../apps/api/src/db/migrate.js");
await runMigrations();

beforeAll(async () => {
  await startCancelListener();
  startWorkers();
}, 30_000);

afterAll(async () => {
  await closeWorkers();
  await stopCancelListener();
}, 10_000);

describe("Worker timeout classification", () => {
  it("timed-out job is retried then fails with timeout message, not canceled", async () => {
    const jobId = randomUUID();
    const inputBuffer = Buffer.from("timeout-test-data");

    // Store input so the worker can retrieve it
    const inputRef = `uploads/${jobId}/test.png`;
    await putObject(inputRef, inputBuffer);

    await enqueueToolJob({
      jobId,
      toolId: "timeout-slow",
      userId: null,
      pool: "image", // image pool: default attempts = 2, backoff 1s
      inputRefs: [inputRef],
      filename: "test.png",
      settings: {},
      kind: "tool",
    });

    // Poll the DB until the job reaches a terminal state.
    // Budget: ~20s (attempt 1 times out at 1s, 1s backoff, attempt 2
    // times out at 1s, plus processing overhead).
    let finalRow: Record<string, unknown> | undefined;
    for (let i = 0; i < 100; i++) {
      const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
      if (row && row.status !== "processing" && row.status !== "queued") {
        finalRow = row as Record<string, unknown>;
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    expect(finalRow).toBeDefined();

    // Must be "failed", NOT "canceled"
    expect(finalRow?.status).toBe("failed");

    // Error message must mention timeout
    const error = finalRow?.error as { message: string };
    expect(error.message).toMatch(/timed out after 1s/i);

    // Both attempts ran (attempts column is set at the start of each attempt)
    expect(finalRow?.attempts).toBe(2);

    // Terminal SSE replay key must exist with the timeout message
    const terminalKeyName = `${bullPrefix()}:terminal:${jobId}`;
    const cached = await sharedRedis().get(terminalKeyName);
    expect(cached).not.toBeNull();
    const parsed = JSON.parse(cached ?? "{}");
    expect(parsed.phase).toBe("failed");
    expect(parsed.error).toMatch(/timed out after 1s/i);
    // Must NOT say "Canceled"
    expect(parsed.error).not.toBe("Canceled");
    expect(parsed.jobId).toBe(jobId);
  }, 25_000);
});
