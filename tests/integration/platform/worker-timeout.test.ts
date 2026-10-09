/**
 * Integration test: timeout is classified as "failed" (not "canceled"),
 * retried per the queue's attempts policy, and emits the correct
 * terminal SSE replay key on the final attempt.
 *
 * JOB_TIMEOUT_FAST_S is set to 1 second BEFORE API modules load so
 * all dynamic imports capture the override.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Injects a storage fault into the worker's output write for one job, standing
// in for rotated S3 credentials or a full disk that hit after the deadline
// (#2144). Scoped by key prefix so every other write runs for real.
const outputWriteFault = vi.hoisted(() => ({ prefix: null as string | null }));

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    putObject: async (key: string, data: Buffer) => {
      if (outputWriteFault.prefix && key.startsWith(outputWriteFault.prefix)) {
        throw new Error("injected storage outage");
      }
      return actual.putObject(key, data);
    },
  };
});

// What the worker's failed listener hands the Sentry path, per job, so a test
// can tell a report of the real fault from a synthesized timeout error.
const reported = vi.hoisted(() => [] as Array<{ jobId?: string; message: string }>);

vi.mock("../../../apps/api/src/lib/error-report.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/error-report.js")>();
  return {
    ...actual,
    reportError: async (err: unknown, ctx: Parameters<typeof actual.reportError>[1]) => {
      reported.push({
        jobId: ctx.jobId,
        message: err instanceof Error ? err.message : String(err),
      });
      return actual.reportError(err, ctx);
    },
  };
});

// Override timeout BEFORE any API module is loaded (static imports
// above are vitest-only and do not trigger config.ts).
process.env.JOB_TIMEOUT_FAST_S = "1";

// Dynamic imports so config.ts picks up the 1-second timeout.
const { eq } = await import("drizzle-orm");
const { db, schema } = await import("../../../apps/api/src/db/index.js");
const { requestCancel, startCancelListener, stopCancelListener } = await import(
  "../../../apps/api/src/jobs/cancel.js"
);
const { sharedRedis } = await import("../../../apps/api/src/jobs/connection.js");
const { enqueueToolJob } = await import("../../../apps/api/src/jobs/enqueue.js");
const { bullPrefix } = await import("../../../apps/api/src/jobs/types.js");
const { closeWorkers, startWorkers } = await import("../../../apps/api/src/jobs/worker.js");
const { logger } = await import("../../../apps/api/src/lib/logger.js");
const { listObjects, putObject } = await import("../../../apps/api/src/lib/object-storage.js");
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

// A tool that never reads the signal and finishes after the timeout fired, like
// pdf-to-word's own longer budget inside the docs pool's 120s job timeout.
registerToolProcessFn({
  toolId: "timeout-ignores-signal",
  settingsSchema: { parse: (v: unknown) => v } as never,
  process: async (inputBuffer: Buffer, _settings: unknown, filename: string) => {
    await new Promise((r) => setTimeout(r, 2_500));
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
    // Fail-fast message must include actionable guidance (issue #494)
    expect(error.message).toMatch(
      /model may still be downloading|too large for CPU|worker may be busy/i,
    );

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

  it("keeps the result of a handler that ignores the signal and finishes after the timeout (#2092)", async () => {
    // The post-handler cancel guard is for user cancels. A timeout abort must
    // not make it discard a finished result and rerun the whole job.
    const jobId = randomUUID();
    const inputRef = `uploads/${jobId}/test.png`;
    await putObject(inputRef, Buffer.from("timeout-test-data"));

    await enqueueToolJob({
      jobId,
      toolId: "timeout-ignores-signal",
      userId: null,
      pool: "image",
      inputRefs: [inputRef],
      filename: "test.png",
      settings: {},
      kind: "tool",
    });

    let finalRow: Record<string, unknown> | undefined;
    for (let i = 0; i < 100; i++) {
      const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
      if (row && row.status !== "processing" && row.status !== "queued") {
        finalRow = row as Record<string, unknown>;
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    expect(finalRow?.status).toBe("completed");
    expect(finalRow?.attempts).toBe(1);
  }, 25_000);

  it("still settles canceled when the user cancel lands after the deadline fired (#2092)", async () => {
    // The deadline aborted the controller at 1s, so the cancel's own abort() is
    // a no-op and the signal reason stays "timeout". The user asked for a cancel
    // and was told true; the late result must not be saved or retried.
    const jobId = randomUUID();
    const inputRef = `uploads/${jobId}/test.png`;
    await putObject(inputRef, Buffer.from("timeout-test-data"));

    await enqueueToolJob({
      jobId,
      toolId: "timeout-ignores-signal",
      userId: null,
      pool: "image",
      inputRefs: [inputRef],
      filename: "test.png",
      settings: {},
      kind: "tool",
    });

    // Past the 1s deadline, before the handler's 2.5s are up.
    await new Promise((r) => setTimeout(r, 1_700));
    expect(await requestCancel(jobId)).toBe(true);

    let finalRow: Record<string, unknown> | undefined;
    for (let i = 0; i < 100; i++) {
      const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
      if (row && row.status !== "processing" && row.status !== "queued") {
        finalRow = row as Record<string, unknown>;
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    expect(finalRow?.status).toBe("canceled");
    expect(finalRow?.attempts).toBe(1);
    expect(await listObjects(`outputs/${jobId}/`)).toEqual([]);
  }, 25_000);

  it("keeps a storage fault after the deadline as its own error, not a timeout (#2144)", async () => {
    // The handler ignored the signal and returned after the 1s deadline, then
    // the output write hit a real storage fault. The signal still reads
    // "timeout", but the fault has to keep its own message, error log and
    // Sentry report: telling the user the job merely took too long hides an
    // outage, and a retry would not help.
    const jobId = randomUUID();
    const inputRef = `uploads/${jobId}/test.png`;
    await putObject(inputRef, Buffer.from("timeout-test-data"));
    outputWriteFault.prefix = `outputs/${jobId}/`;
    const errorLog = vi.spyOn(logger, "error");

    try {
      await enqueueToolJob({
        jobId,
        toolId: "timeout-ignores-signal",
        userId: null,
        pool: "image",
        inputRefs: [inputRef],
        filename: "test.png",
        settings: {},
        kind: "tool",
      });

      const finalRow = await terminalJobRow(jobId);
      expect(finalRow?.status).toBe("failed");
      // A real fault is retried like any other (image pool: 2 attempts).
      expect(finalRow?.attempts).toBe(2);
      const error = finalRow?.error as { message: string };
      expect(error.message).toBe("injected storage outage");

      const cached = await sharedRedis().get(`${bullPrefix()}:terminal:${jobId}`);
      expect(JSON.parse(cached ?? "{}").error).toBe("injected storage outage");

      // The fault reached the error log under its own message, once per attempt.
      const logged = errorLog.mock.calls
        .filter(
          ([ctx, msg]) => msg === "tool job failed" && (ctx as { jobId?: string }).jobId === jobId,
        )
        .map(([ctx]) => (ctx as { err: Error }).err.message);
      expect(new Set(logged)).toEqual(new Set(["injected storage outage"]));

      // And the Sentry path got the fault itself, not a synthesized timeout error.
      const reports = reported.filter((r) => r.jobId === jobId).map((r) => r.message);
      expect(reports).not.toHaveLength(0);
      expect(new Set(reports)).toEqual(new Set(["injected storage outage"]));
    } finally {
      outputWriteFault.prefix = null;
      errorLog.mockRestore();
    }
  }, 25_000);
});

/** Poll the job row until it leaves queued/processing; undefined after ~20s. */
async function terminalJobRow(jobId: string): Promise<Record<string, unknown> | undefined> {
  for (let i = 0; i < 100; i++) {
    const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    if (row && row.status !== "processing" && row.status !== "queued") {
      return row as Record<string, unknown>;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return undefined;
}
