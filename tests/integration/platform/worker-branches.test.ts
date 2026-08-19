/**
 * Integration tests for BullMQ worker branches that the tool-route suites
 * never reach: OTel span wrapping, tool_used / pipeline_executed analytics on
 * success and on every failure class, scratchPath + extraOutputs output
 * resolution, the generated-PDF producer scrub hook, cancel vs timeout
 * terminal classification, pipeline finalize (missing row, failed step,
 * success, last-step-without-output), batch-child outcome recording,
 * batch-finalize manifest assembly, and the system pool's unknown-job path.
 *
 * Follows the worker-timeout.test.ts harness: no HTTP app is built. Tools are
 * registered directly in the process registry, jobs are enqueued via
 * enqueueToolJob, and the real workers drain them against this fork's
 * Postgres + Redis.
 *
 * The analytics gate is forced ON (test seams + non-production baked
 * override) so the worker's analytics blocks execute; trackEvent itself is
 * mocked, so nothing leaves the process.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { truncate, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ANALYTICS_EVENTS, ONBOARDING_FIRST_PROCESSED_KEY, TOOLS } from "@snapotter/shared";
import AdmZip from "adm-zip";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Makes the finalize die before its own failure handling (readBatchCounters
// runs outside the packaging try/catch), so the worker failed-handler safety
// net is the only thing standing between a crash and a hung degraded client.
const batchProgressMock = vi.hoisted(() => ({ failCountersForParentId: null as string | null }));

vi.mock("../../../apps/api/src/jobs/batch-progress.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/jobs/batch-progress.js")>();
  return {
    ...actual,
    readBatchCounters: async (parentId: string) => {
      if (batchProgressMock.failCountersForParentId === parentId) {
        throw new Error("injected counters outage");
      }
      return actual.readBatchCounters(parentId);
    },
  };
});

import type { ToolJobData } from "../../../apps/api/src/jobs/types.js";
import type { ToolProcessCtx } from "../../../apps/api/src/routes/tool-factory.js";

// Capture the worker's analytics emissions without a PostHog client.
// importOriginal keeps the rest of the module real (captureException etc.).
vi.mock("../../../apps/api/src/lib/analytics.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/analytics.js")>();
  return { ...actual, trackEvent: vi.fn(async () => {}) };
});

const { eq } = await import("drizzle-orm");
const { env } = await import("../../../apps/api/src/config.js");
const { db, schema } = await import("../../../apps/api/src/db/index.js");
const { runMigrations } = await import("../../../apps/api/src/db/migrate.js");
const { markBatchCanceled } = await import("../../../apps/api/src/jobs/batch-progress.js");
const { requestCancel, startCancelListener, stopCancelListener } = await import(
  "../../../apps/api/src/jobs/cancel.js"
);
const { sharedRedis } = await import("../../../apps/api/src/jobs/connection.js");
const { enqueueToolJob } = await import("../../../apps/api/src/jobs/enqueue.js");
const { closeQueues, getQueue } = await import("../../../apps/api/src/jobs/queues.js");
const { bullPrefix } = await import("../../../apps/api/src/jobs/types.js");
const { closeWorkers, startWorkers } = await import("../../../apps/api/src/jobs/worker.js");
const { trackEvent } = await import("../../../apps/api/src/lib/analytics.js");
const { __resetGateForTests, __setReaderForTests, refreshAnalyticsGate } = await import(
  "../../../apps/api/src/lib/analytics-gate.js"
);
const { getObjectBuffer, getObjectSize, putObject } = await import(
  "../../../apps/api/src/lib/object-storage.js"
);
const { InputValidationError } = await import("../../../apps/api/src/modality/contract.js");
const { MAX_BUFFERED_OUTPUT_BYTES } = await import("../../../apps/api/src/jobs/output-resolve.js");
const { registerToolProcessFn } = await import("../../../apps/api/src/routes/tool-factory.js");

const trackEventMock = vi.mocked(trackEvent);

// ── Test-only tools ─────────────────────────────────────────────

const passthroughSchema = { parse: (v: unknown) => v } as never;

const unusedLegacyProcess = async (): Promise<{
  buffer: Buffer;
  filename: string;
  contentType: string;
}> => {
  throw new Error("legacy process must not run when processV2 is registered");
};

// Intentionally broken PDF: the %PDF header is enough for filename and scrub
// dispatch, but no renderer can produce a preview from it.
const PDF_JUNK = Buffer.from("%PDF-1.4\n% deliberately truncated: no body, no xref\n");

// "image-to-pdf" is a real catalog id and a member of SCRUB_PDF_PRODUCER_TOOLS.
// The registry is empty in this harness (no HTTP routes are loaded), so
// registering it here drives the producer-scrub branch for the primary output
// and the per-extra-output scrub ternary, plus scratchPath resolution for both
// the primary output and an extra output.
registerToolProcessFn({
  toolId: "image-to-pdf",
  settingsSchema: passthroughSchema,
  process: unusedLegacyProcess,
  processV2: async (ctx) => {
    const primaryPath = join(ctx.scratchDir, "out.pdf");
    await writeFile(primaryPath, PDF_JUNK);
    const notesPath = join(ctx.scratchDir, "notes.txt");
    await writeFile(notesPath, "hello notes");
    ctx.report(50, "halfway");
    return {
      scratchPath: primaryPath,
      filename: "out.pdf",
      contentType: "application/pdf",
      resultPayload: { pages: 1 },
      extraOutputs: [
        { name: "extra.pdf", buffer: PDF_JUNK, contentType: "application/pdf" },
        { name: "notes.txt", scratchPath: notesPath, contentType: "text/plain" },
      ],
    };
  },
});

// Emits a sparse scratch file just over the 1.5 GiB buffering cap. stat()
// reports the full size without the test writing real bytes, which drives the
// worker's streamed-output branch: putObjectStream instead of readFile, no
// poster preview, byte counts from the stream (issue #841, Sentry NODE-2Z).
registerToolProcessFn({
  toolId: "wt-huge",
  settingsSchema: passthroughSchema,
  process: unusedLegacyProcess,
  processV2: async (ctx) => {
    const hugePath = join(ctx.scratchDir, "huge.bin");
    await writeFile(hugePath, "");
    await truncate(hugePath, MAX_BUFFERED_OUTPUT_BYTES + 1);
    return {
      scratchPath: hugePath,
      filename: "huge.bin",
      contentType: "application/octet-stream",
    };
  },
});

registerToolProcessFn({
  toolId: "wt-no-output",
  settingsSchema: passthroughSchema,
  process: unusedLegacyProcess,
  processV2: async () => ({ filename: "x.bin", contentType: "application/octet-stream" }),
});

registerToolProcessFn({
  toolId: "wt-bad-extra",
  settingsSchema: passthroughSchema,
  process: unusedLegacyProcess,
  processV2: async () => ({
    buffer: Buffer.from("primary"),
    filename: "primary.bin",
    contentType: "application/octet-stream",
    extraOutputs: [{ name: "bad.bin", contentType: "application/octet-stream" }],
  }),
});

registerToolProcessFn({
  toolId: "wt-invalid",
  settingsSchema: passthroughSchema,
  process: unusedLegacyProcess,
  processV2: async () => {
    throw new InputValidationError("That file looks wrong", 422);
  },
});

registerToolProcessFn({
  toolId: "wt-echo",
  settingsSchema: passthroughSchema,
  process: async (inputBuffer: Buffer, _settings: unknown, filename: string) => ({
    buffer: inputBuffer,
    filename,
    contentType: "image/png",
  }),
});

registerToolProcessFn({
  toolId: "wt-boom",
  settingsSchema: passthroughSchema,
  process: async () => {
    throw new Error("boom");
  },
});

// Never resolves on its own; rejects when the worker's AbortSignal fires
// (either a user cancel or the timeout guard).
registerToolProcessFn({
  toolId: "wt-sleepy",
  settingsSchema: passthroughSchema,
  process: (_inputBuffer: Buffer, _settings: unknown, _filename: string, ctx?: ToolProcessCtx) =>
    new Promise<{ buffer: Buffer; filename: string; contentType: string }>((_resolve, reject) => {
      const signal = ctx?.signal;
      if (!signal) {
        reject(new Error("wt-sleepy requires an abort signal"));
        return;
      }
      if (signal.aborted) {
        reject(new Error("aborted before start"));
        return;
      }
      signal.addEventListener("abort", () => reject(new Error("aborted by signal")), {
        once: true,
      });
    }),
});

// Workspace dir + migrations (test-server.ts normally does this; this harness
// bypasses the app the same way worker-timeout.test.ts does).
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

async function terminalRow(jobId: string, timeoutMs = 20_000): Promise<JobRow> {
  return waitFor(async () => {
    const row = await jobRow(jobId);
    return row && row.status !== "queued" && row.status !== "processing" ? row : undefined;
  }, timeoutMs);
}

/** Redis terminal replay frame (set by the worker's terminal publications). */
async function terminalFrame(jobId: string): Promise<Record<string, unknown>> {
  const raw = await waitFor(async () => {
    const value = await sharedRedis().get(`${bullPrefix()}:terminal:${jobId}`);
    return value ?? undefined;
  }, 10_000);
  return JSON.parse(raw) as Record<string, unknown>;
}

/** Poll the mocked trackEvent until minCount events for this distinctId exist. */
async function emittedEvents(
  event: string,
  distinctId: string,
  minCount = 1,
): Promise<Record<string, unknown>[]> {
  return waitFor(async () => {
    const calls = trackEventMock.mock.calls
      .filter((call) => call[0] === event && call[2] === distinctId)
      .map((call) => call[1]);
    return calls.length >= minCount ? calls : undefined;
  }, 10_000);
}

function toolJob(
  overrides: Partial<ToolJobData> & Pick<ToolJobData, "jobId" | "toolId">,
): ToolJobData {
  return {
    jobId: overrides.jobId,
    toolId: overrides.toolId,
    userId: overrides.userId ?? null,
    pool: overrides.pool ?? "image",
    inputRefs: overrides.inputRefs ?? [],
    filename: overrides.filename ?? "input.png",
    settings: overrides.settings ?? {},
    kind: overrides.kind ?? "tool",
    analyticsDistinctId: overrides.analyticsDistinctId ?? overrides.jobId,
    stepIndex: overrides.stepIndex,
    totalSteps: overrides.totalSteps,
    prevJobId: overrides.prevJobId,
    parentId: overrides.parentId,
    totalFiles: overrides.totalFiles,
    fileId: overrides.fileId,
    saveMode: overrides.saveMode,
    clientJobId: overrides.clientJobId,
    _otel: overrides._otel,
  };
}

async function seedInput(jobId: string, filename: string, bytes: Buffer): Promise<string> {
  const ref = `uploads/${jobId}/${filename}`;
  await putObject(ref, bytes);
  return ref;
}

const TRACEPARENT = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";

beforeAll(async () => {
  // Force the analytics gate ON so the worker's tool_used/pipeline_executed
  // blocks run. The baked override only applies outside production builds,
  // and both kill-switch env vars are pinned to their "on" values so a local
  // .env cannot flip the gate. trackEvent is mocked above: no egress.
  vi.stubEnv("SNAPOTTER_TELEMETRY", "1");
  vi.stubEnv("ANALYTICS_ENABLED", "true");
  vi.stubEnv("ANALYTICS_BAKED_OVERRIDE", "on");
  __setReaderForTests(async () => true);
  await refreshAnalyticsGate();

  await startCancelListener();
  startWorkers();
}, 30_000);

afterAll(async () => {
  await closeWorkers();
  await stopCancelListener();
  await closeQueues();
  __resetGateForTests();
  vi.unstubAllEnvs();
}, 20_000);

beforeEach(() => {
  trackEventMock.mockClear();
});

describe("tool job success path", () => {
  it("resolves scratchPath outputs, scrubs generated PDFs, stores extras, and emits tool_used", async () => {
    const jobId = randomUUID();
    const input = Buffer.from("fake-png-input");
    const inputRef = await seedInput(jobId, "photo.png", input);

    await enqueueToolJob(
      toolJob({
        jobId,
        toolId: "image-to-pdf",
        inputRefs: [inputRef],
        filename: "photo.png",
        // Exercises the traceparent extraction + span-wrapped run path.
        _otel: { traceparent: TRACEPARENT },
      }),
    );

    const row = await terminalRow(jobId, 25_000);
    expect(row.status).toBe("completed");
    expect(row.attempts).toBe(1);
    expect(row.outputRefs).toEqual([
      `outputs/${jobId}/out.pdf`,
      `outputs/${jobId}/extra.pdf`,
      `outputs/${jobId}/notes.txt`,
    ]);
    expect(row.bytesIn).toBe(input.length);
    expect(row.bytesOut).toBeGreaterThan(0);

    // Primary and extras really landed in object storage. The PDF bytes may
    // or may not have been producer-scrubbed depending on PyMuPDF
    // availability (the scrub is best-effort by design), but the output is
    // always a %PDF payload.
    const primary = await getObjectBuffer(`outputs/${jobId}/out.pdf`);
    expect(primary.subarray(0, 4).toString("utf8")).toBe("%PDF");
    const extraPdf = await getObjectBuffer(`outputs/${jobId}/extra.pdf`);
    expect(extraPdf.subarray(0, 4).toString("utf8")).toBe("%PDF");
    const notes = await getObjectBuffer(`outputs/${jobId}/notes.txt`);
    expect(notes.toString("utf8")).toBe("hello notes");

    const result = (row.progress?.result ?? {}) as Record<string, unknown>;
    expect(result.downloadUrl).toBe(`/api/v1/download/${jobId}/out.pdf`);
    expect(result.pages).toBe(1);
    // No fileId on the job, so no library auto-save happened.
    expect(result).not.toHaveProperty("savedFileId");

    const frame = await terminalFrame(jobId);
    expect(frame.phase).toBe("complete");
    expect(frame.percent).toBe(100);

    const catalog = TOOLS.find((tool) => tool.id === "image-to-pdf");
    expect(catalog).toBeDefined();
    const events = await emittedEvents(ANALYTICS_EVENTS.TOOL_USED, jobId);
    expect(events).toHaveLength(1);
    const props = events[0];
    expect(props.status).toBe("completed");
    expect(props.tool_id).toBe("image-to-pdf");
    expect(props.is_batch).toBe(false);
    expect(props.is_ai_tool).toBe(false);
    expect(props.input_format).toBe("png");
    expect(props.output_format).toBe("pdf");
    expect(props.bytes_in).toBe(input.length);
    expect(props.category).toBe(catalog?.category);
    expect(props.execution_hint).toBe(catalog?.executionHint);

    // First successful processing stamps the onboarding survey gate
    // (fire-and-forget write, so poll).
    await waitFor(async () => {
      const [setting] = await db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, ONBOARDING_FIRST_PROCESSED_KEY));
      return setting ?? undefined;
    }, 10_000);
  }, 30_000);
});

describe("streamed over-cap output", () => {
  it("streams an output past the buffering cap to storage with correct sizes and no preview", async () => {
    const size = MAX_BUFFERED_OUTPUT_BYTES + 1;
    const jobId = randomUUID();
    const inputRef = await seedInput(jobId, "in.bin", Buffer.from("x"));

    await enqueueToolJob(
      toolJob({ jobId, toolId: "wt-huge", inputRefs: [inputRef], filename: "in.bin" }),
    );

    // Streaming 1.5 GiB of sparse zeros through putObjectStream takes real
    // wall-clock; the fast-pool timeout (120s default) has ample headroom.
    const row = await terminalRow(jobId, 110_000);
    expect(row.status).toBe("completed");
    expect(row.outputRefs).toEqual([`outputs/${jobId}/huge.bin`]);
    // Byte accounting comes from the stream, not a buffer that never existed.
    expect(row.bytesOut).toBe(size);
    expect(await getObjectSize(`outputs/${jobId}/huge.bin`)).toBe(size);

    const result = (row.progress?.result ?? {}) as Record<string, unknown>;
    expect(result.processedSize).toBe(size);
    expect(result.downloadUrl).toBe(`/api/v1/download/${jobId}/huge.bin`);
    // Poster previews need the bytes in memory; a streamed result ships without.
    expect(result).not.toHaveProperty("previewUrl");
  }, 120_000);
});

describe("tool job failure paths", () => {
  it("fails a tool returning neither buffer nor scratchPath after exhausting retries", async () => {
    const jobId = randomUUID();
    const inputRef = await seedInput(jobId, "in.png", Buffer.from("x"));

    await enqueueToolJob(
      toolJob({
        jobId,
        toolId: "wt-no-output",
        inputRefs: [inputRef],
        filename: "in.png",
        // Failure with a span: exercises the span error-recording branch.
        _otel: { traceparent: TRACEPARENT },
      }),
    );

    const row = await terminalRow(jobId, 25_000);
    expect(row.status).toBe("failed");
    // Image pool defaults to 2 attempts; the terminal row reflects the final one.
    expect(row.attempts).toBe(2);
    expect(row.error?.message).toBe("Tool wt-no-output returned neither buffer nor scratchPath");

    const frame = await terminalFrame(jobId);
    expect(frame.phase).toBe("failed");
    expect(frame.error).toBe("Tool wt-no-output returned neither buffer nor scratchPath");

    // The failure analytics block runs on every attempt with the coarse
    // "bug" classification and the "processing" code for uncoded errors.
    const events = await emittedEvents(ANALYTICS_EVENTS.TOOL_USED, jobId, 2);
    expect(events).toHaveLength(2);
    const props = events[0];
    expect(props.status).toBe("failed");
    expect(props.error_code).toBe("processing");
    expect(props.error_kind).toBe("bug");
    // Not a catalog tool, so the base props fall back.
    expect(props.category).toBe("unknown");
    expect(props.execution_hint).toBe("fast");

    // The queue job is terminally failed (this is what fired the pool's
    // failed-handler on the final attempt). Poll for it: the durable row and
    // analytics flip inside the processor's failure handling, before the
    // rejection propagates into BullMQ's own active -> failed move.
    await waitFor(async () => {
      const queueJob = await getQueue("image").getJob(jobId);
      if (!queueJob) return undefined;
      return (await queueJob.getState()) === "failed" ? queueJob : undefined;
    }, 10_000);
  }, 30_000);

  it("fails when an extra output has neither buffer nor scratchPath", async () => {
    const jobId = randomUUID();
    const inputRef = await seedInput(jobId, "in.png", Buffer.from("x"));

    await enqueueToolJob(
      toolJob({
        jobId,
        toolId: "wt-bad-extra",
        pool: "ai",
        inputRefs: [inputRef],
        filename: "in.png",
      }),
    );

    const row = await terminalRow(jobId);
    expect(row.status).toBe("failed");
    // AI pool enqueues with a single attempt: no retry.
    expect(row.attempts).toBe(1);
    expect(row.error?.message).toBe('Extra output "bad.bin" has neither buffer nor scratchPath');
  });

  it("classifies a worker-side InputValidationError as user input, not a bug", async () => {
    const jobId = randomUUID();
    const inputRef = await seedInput(jobId, "in.png", Buffer.from("x"));

    await enqueueToolJob(
      toolJob({
        jobId,
        toolId: "wt-invalid",
        pool: "ai",
        inputRefs: [inputRef],
        filename: "in.png",
      }),
    );

    const row = await terminalRow(jobId);
    expect(row.status).toBe("failed");
    expect(row.error?.message).toBe("That file looks wrong");

    const events = await emittedEvents(ANALYTICS_EVENTS.TOOL_USED, jobId);
    const props = events[0];
    expect(props.status).toBe("failed");
    expect(props.error_kind).toBe("input");
    expect(props.error_code).toBe("processing");
  });

  it("cancels an active job: canceled row, ephemeral terminal frame, cancelled analytics", async () => {
    const jobId = randomUUID();
    const inputRef = await seedInput(jobId, "in.png", Buffer.from("x"));

    await enqueueToolJob(
      toolJob({ jobId, toolId: "wt-sleepy", inputRefs: [inputRef], filename: "in.png" }),
    );

    // The row flips to "processing" inside the processor, so the BullMQ job
    // is active by the time we request the cancel.
    await waitFor(async () => {
      const row = await jobRow(jobId);
      return row?.status === "processing" ? row : undefined;
    });
    expect(await requestCancel(jobId)).toBe(true);

    const row = await terminalRow(jobId);
    expect(row.status).toBe("canceled");
    expect(row.error?.message).toBe("Canceled");
    // UnrecoverableError: canceled jobs are never retried.
    expect(row.attempts).toBe(1);

    const frame = await terminalFrame(jobId);
    expect(frame.phase).toBe("failed");
    expect(frame.error).toBe("Canceled");

    const events = await emittedEvents(ANALYTICS_EVENTS.TOOL_USED, jobId);
    const props = events[0];
    expect(props.status).toBe("failed");
    expect(props.error_code).toBe("cancelled");
    expect(props.error_kind).toBe("cancelled");
  });

  it("times out a job on both attempts and emits timeout analytics", async () => {
    const jobId = randomUUID();
    const inputRef = await seedInput(jobId, "in.png", Buffer.from("x"));
    const mutableEnv = env as { JOB_TIMEOUT_FAST_S: number };
    const originalTimeout = mutableEnv.JOB_TIMEOUT_FAST_S;
    mutableEnv.JOB_TIMEOUT_FAST_S = 1;

    try {
      await enqueueToolJob(
        toolJob({ jobId, toolId: "wt-sleepy", inputRefs: [inputRef], filename: "in.png" }),
      );

      const row = await terminalRow(jobId, 25_000);
      expect(row.status).toBe("failed");
      expect(row.attempts).toBe(2);
      expect(row.error?.message).toMatch(/timed out after 1s/i);

      const events = await emittedEvents(ANALYTICS_EVENTS.TOOL_USED, jobId, 2);
      const props = events[0];
      expect(props.status).toBe("failed");
      expect(props.error_code).toBe("timeout");
      expect(props.error_kind).toBe("timeout");
    } finally {
      mutableEnv.JOB_TIMEOUT_FAST_S = originalTimeout;
    }
  }, 30_000);
});

describe("pipeline finalize", () => {
  it("fails the pipeline when a step row is missing", async () => {
    const jobId = `pf-${randomUUID()}`;

    await enqueueToolJob(
      toolJob({
        jobId,
        toolId: "pipeline",
        kind: "pipeline-finalize",
        totalSteps: 1,
        filename: "chain.png",
      }),
    );

    const row = await terminalRow(jobId);
    expect(row.status).toBe("failed");
    expect(row.error?.message).toBe("Step 1: Step 1 row not found");

    const frame = await terminalFrame(jobId);
    expect(frame.phase).toBe("failed");
    expect(frame.error).toBe("Step 1: Step 1 row not found");

    const events = await emittedEvents(ANALYTICS_EVENTS.PIPELINE_EXECUTED, jobId);
    const props = events[0];
    expect(props.status).toBe("failed");
    expect(props.step_count).toBe(1);
    expect(props.tool_ids).toEqual([]);
    expect(props.is_batch).toBe(false);
    expect(props.file_count).toBe(1);
  });

  it("commits a canceled run and emits canceled analytics when a flagged step was canceled", async () => {
    const jobId = `pf-${randomUUID()}`;
    await db.insert(schema.jobs).values({
      id: `${jobId}-s0`,
      type: "pipeline-step",
      status: "canceled",
      toolId: "resize",
      pool: "image",
      inputRefs: [],
      error: { message: "Canceled" },
    });
    // Both halves of #770's too-late rule: the flag plus the canceled step.
    await markBatchCanceled(jobId);

    await enqueueToolJob(
      toolJob({
        jobId,
        toolId: "pipeline",
        kind: "pipeline-finalize",
        totalSteps: 1,
        filename: "chain.png",
      }),
    );

    const row = await terminalRow(jobId);
    expect(row.status).toBe("canceled");
    expect(row.error?.message).toBe("Canceled");

    const frame = await terminalFrame(jobId);
    expect(frame.phase).toBe("failed");
    expect(frame.error).toBe("Canceled");

    const events = await emittedEvents(ANALYTICS_EVENTS.PIPELINE_EXECUTED, jobId);
    const props = events[0];
    expect(props.status).toBe("canceled");
    expect(props.is_batch).toBe(false);
    expect(props.file_count).toBe(1);
  });

  it("propagates a failed step, records the batch outcome, and emits failed analytics", async () => {
    const jobId = `pf-${randomUUID()}`;
    const batchParent = `bp-${randomUUID()}`;
    await db.insert(schema.jobs).values({
      id: `${jobId}-s0`,
      type: "pipeline-step",
      status: "completed",
      toolId: "resize",
      pool: "image",
      inputRefs: [],
      outputRefs: ["outputs/seed/mid.png"],
      bytesIn: 10,
      bytesOut: 8,
    });
    await db.insert(schema.jobs).values({
      id: `${jobId}-s1`,
      type: "pipeline-step",
      status: "failed",
      toolId: "compress",
      pool: "image",
      inputRefs: [],
      error: { message: "kaboom" },
    });

    await enqueueToolJob(
      toolJob({
        jobId,
        toolId: "pipeline",
        kind: "pipeline-finalize",
        totalSteps: 2,
        filename: "b.png",
        parentId: batchParent,
        totalFiles: 1,
      }),
    );

    const row = await terminalRow(jobId);
    expect(row.status).toBe("failed");
    expect(row.error?.message).toBe("Step 2: kaboom");

    // Child outcome recorded against the pipeline-batch parent. Outcomes are
    // nonterminal since #750 (only batch-finalize publishes the terminal
    // frame, after the durable ZIP exists), so the record shows up in the
    // Redis counters and the parent row's persisted counts.
    expect(await sharedRedis().get(`${bullPrefix()}:batch:${batchParent}:failed`)).toBe("1");
    const errorsRaw = await sharedRedis().lrange(
      `${bullPrefix()}:batch:${batchParent}:errors`,
      0,
      -1,
    );
    expect(errorsRaw.map((e) => JSON.parse(e))).toEqual([
      { filename: "b.png", error: "Step 2: kaboom" },
    ]);
    const parentRow = await waitFor(async () => {
      const candidate = await jobRow(batchParent);
      return candidate?.status === "processing" ? candidate : undefined;
    });
    expect(parentRow.progress).toMatchObject({
      totalFiles: 1,
      completedFiles: 1,
      failedFiles: 1,
    });

    const events = await emittedEvents(ANALYTICS_EVENTS.PIPELINE_EXECUTED, jobId);
    const props = events[0];
    expect(props.status).toBe("failed");
    expect(props.step_count).toBe(2);
    // Only steps that completed are counted in the tool list.
    expect(props.tool_ids).toEqual(["resize"]);
  });

  it("assembles the pipeline result, copies the last output, and emits completed analytics", async () => {
    const jobId = `pf-${randomUUID()}`;
    const batchParent = `bp-${randomUUID()}`;
    const finalBytes = Buffer.from("final-bytes");
    await putObject("outputs/seed-success/final.png", finalBytes);
    await db.insert(schema.jobs).values({
      id: `${jobId}-s0`,
      type: "pipeline-step",
      status: "completed",
      toolId: "resize",
      pool: "image",
      inputRefs: [],
      outputRefs: ["outputs/seed-success/mid.png"],
      bytesIn: 10,
      bytesOut: 8,
    });
    await db.insert(schema.jobs).values({
      id: `${jobId}-s1`,
      type: "pipeline-step",
      status: "completed",
      toolId: "compress",
      pool: "image",
      inputRefs: [],
      outputRefs: ["outputs/seed-success/final.png"],
      bytesIn: 8,
      bytesOut: 5,
    });

    await enqueueToolJob(
      toolJob({
        jobId,
        toolId: "pipeline",
        kind: "pipeline-finalize",
        totalSteps: 2,
        filename: "chain.png",
        parentId: batchParent,
        totalFiles: 1,
      }),
    );

    const row = await terminalRow(jobId);
    expect(row.status).toBe("completed");
    expect(row.outputRefs).toEqual([`outputs/${jobId}/final.png`]);
    expect(row.bytesIn).toBe(10);
    expect(row.bytesOut).toBe(5);

    // The last step's output was copied under the pipeline job id so the
    // legacy download URL resolves.
    const copied = await getObjectBuffer(`outputs/${jobId}/final.png`);
    expect(copied.toString("utf8")).toBe("final-bytes");

    const result = (row.progress?.result ?? {}) as Record<string, unknown>;
    expect(result.downloadUrl).toBe(`/api/v1/download/${jobId}/final.png`);
    expect(result.stepsCompleted).toBe(2);
    // PNG is browser-previewable, so no preview is generated for the result.
    expect(result).not.toHaveProperty("previewUrl");
    const steps = (result.steps ?? []) as Array<{ step: number; toolId: string; size: number }>;
    expect(steps).toEqual([
      { step: 1, toolId: "resize", size: 8 },
      { step: 2, toolId: "compress", size: 5 },
    ]);

    // Success recorded against the pipeline-batch parent; the record stays
    // nonterminal since #750 (the batch-finalize owns the terminal frame).
    expect(await sharedRedis().get(`${bullPrefix()}:batch:${batchParent}:done`)).toBe("1");
    const parentRow = await waitFor(async () => {
      const candidate = await jobRow(batchParent);
      return candidate?.status === "processing" ? candidate : undefined;
    });
    expect(parentRow.progress).toMatchObject({
      totalFiles: 1,
      completedFiles: 1,
      failedFiles: 0,
    });

    const events = await emittedEvents(ANALYTICS_EVENTS.PIPELINE_EXECUTED, jobId);
    const props = events[0];
    expect(props.status).toBe("completed");
    expect(props.tool_ids).toEqual(["resize", "compress"]);
    expect(props.is_batch).toBe(false);
    expect(props.file_count).toBe(1);
  });

  it("hard-fails the finalize job when the last step has no output ref", async () => {
    const jobId = `pf-${randomUUID()}`;
    const clientJobId = `pfc-${randomUUID()}`;
    await db.insert(schema.jobs).values({
      id: `${jobId}-s0`,
      type: "pipeline-step",
      status: "completed",
      toolId: "noop",
      pool: "image",
      inputRefs: [],
      outputRefs: [],
    });
    // The client-facing row the SSE replays, as the route's first progress
    // publish would have created it.
    await db.insert(schema.jobs).values({
      id: clientJobId,
      type: "single",
      status: "processing",
      inputRefs: [],
      progress: { percent: 0, stage: "Preparing pipeline..." },
    });

    await enqueueToolJob(
      toolJob({
        jobId,
        toolId: "pipeline",
        kind: "pipeline-finalize",
        totalSteps: 1,
        filename: "chain.png",
        clientJobId,
      }),
    );

    // This branch throws instead of writing a failure row, so the BullMQ job
    // itself fails after the pool's retry budget.
    const failedJob = await waitFor(async () => {
      const job = await getQueue("image").getJob(jobId);
      if (!job) return undefined;
      return (await job.getState()) === "failed" ? job : undefined;
    }, 25_000);
    expect(failedJob.failedReason).toContain("Last step has no output");

    // A degraded or 202 client is riding the SSE under clientJobId; without
    // a terminal frame it spins forever (#766 safety net, the pipeline twin
    // of the batch-finalize net from #750).
    const frame = await terminalFrame(clientJobId);
    expect(frame.type).toBe("single");
    expect(frame.phase).toBe("failed");
    expect(String(frame.error).length).toBeGreaterThan(0);

    // The client row goes terminal too, so replay after the Redis key
    // expires stays failed instead of resurrecting a processing spinner.
    const clientRow = await waitFor(async () => {
      const row = await jobRow(clientJobId);
      return row?.status === "failed" ? row : undefined;
    });
    expect(clientRow.completedAt).not.toBeNull();
  }, 30_000);
});

describe("batch children and finalize", () => {
  it("records one success and one failure, then the finalize emits the terminal batch frame", async () => {
    const parentId = `bparent-${randomUUID()}`;
    const okId = `${parentId}-f0`;
    const boomId = `${parentId}-f1`;
    const okRef = await seedInput(okId, "a.png", Buffer.from("aaa"));
    const boomRef = await seedInput(boomId, "b.png", Buffer.from("bbb"));

    await enqueueToolJob(
      toolJob({
        jobId: okId,
        toolId: "wt-echo",
        kind: "batch-child",
        parentId,
        totalFiles: 2,
        inputRefs: [okRef],
        filename: "a.png",
      }),
    );
    await enqueueToolJob(
      toolJob({
        jobId: boomId,
        toolId: "wt-boom",
        kind: "batch-child",
        parentId,
        totalFiles: 2,
        inputRefs: [boomRef],
        filename: "b.png",
      }),
    );

    // The successful child completed normally with its own output.
    const okRow = await terminalRow(okId);
    expect(okRow.status).toBe("completed");
    expect(okRow.outputRefs).toEqual([`outputs/${okId}/a_wt-echo.png`]);
    expect((await getObjectBuffer(`outputs/${okId}/a_wt-echo.png`)).toString("utf8")).toBe("aaa");
    const okEvents = await emittedEvents(ANALYTICS_EVENTS.TOOL_USED, okId);
    expect(okEvents[0].is_batch).toBe(true);
    expect(okEvents[0].status).toBe("completed");

    // The failed child resolves with a failure marker instead of throwing so
    // the parent flow still advances.
    const boomResult = await waitFor(async () => {
      const job = await getQueue("image").getJob(boomId);
      return job?.returnvalue ?? undefined;
    });
    expect(boomResult.resultPayload).toEqual({ failed: true, error: "boom" });

    // Child outcomes alone stay nonterminal since #750; only the finalize
    // publishes the terminal frame, once the durable ZIP exists.
    expect(await sharedRedis().get(`${bullPrefix()}:batch:${parentId}:done`)).toBe("1");
    expect(await sharedRedis().get(`${bullPrefix()}:batch:${parentId}:failed`)).toBe("1");
    expect(await sharedRedis().get(`${bullPrefix()}:terminal:${parentId}`)).toBeNull();

    // The parent row already exists (the nonterminal persist created it), so
    // enqueue the finalize the way the flow producer does: queue-only.
    await getQueue("system").add(
      "batch-finalize",
      toolJob({
        jobId: parentId,
        toolId: "wt-echo",
        kind: "batch-finalize",
        pool: "system",
        totalFiles: 2,
        settings: { flowChildCount: 2, fileIndexMap: [0, 1] },
        filename: "",
      }),
      { jobId: parentId, attempts: 1 },
    );

    const parentFrame = await terminalFrame(parentId);
    expect(parentFrame.status).toBe("completed"); // one success => batch completed
    expect(parentFrame.totalFiles).toBe(2);
    expect(parentFrame.completedFiles).toBe(2);
    expect(parentFrame.failedFiles).toBe(1);
    const errors = (parentFrame.errors ?? []) as Array<{ filename: string; error: string }>;
    expect(errors).toEqual([{ filename: "b.png", error: "boom" }]);

    // The terminal frame carries the durable result a degraded client needs.
    const frameResult = (parentFrame.result ?? {}) as Record<string, unknown>;
    expect(String(frameResult.downloadUrl)).toContain(`/api/v1/download/${parentId}/`);
    expect(frameResult.fileResults).toEqual({ "0": "a_wt-echo.png" });

    // The durable batch parent row carries the failure summary and the ZIP.
    const parentRow = await waitFor(async () => {
      const row = await jobRow(parentId);
      return row?.status === "completed" ? row : undefined;
    });
    expect(parentRow.error?.message).toBe("1 file(s) failed");
    const zipKey = (parentRow.outputRefs ?? [])[0];
    expect(zipKey).toContain(`outputs/${parentId}/`);
    const zipBytes = await getObjectBuffer(zipKey);
    const entries = new AdmZip(zipBytes).getEntries();
    expect(entries.map((e) => e.entryName)).toEqual(["a_wt-echo.png"]);
    expect(entries[0].getData().toString("utf8")).toBe("aaa");
  }, 30_000);

  it("the failed-handler safety net publishes a terminal failed frame when the finalize crashes", async () => {
    const parentId = `bnet-${randomUUID()}`;
    // The parent row a real batch route inserts before enqueueing the flow.
    await db.insert(schema.jobs).values({
      id: parentId,
      type: "batch",
      status: "processing",
      pool: "system",
      inputRefs: [],
      progress: { percent: 50, totalFiles: 1, completedFiles: 1, failedFiles: 0 },
    });
    await putObject("outputs/seed-net/ok.png", Buffer.from("net-bytes"));
    await db.insert(schema.jobs).values({
      id: `${parentId}-f0`,
      type: "batch-child",
      status: "completed",
      toolId: "wt-echo",
      pool: "image",
      inputRefs: ["uploads/seed-net/in0.png"],
      outputRefs: ["outputs/seed-net/ok.png"],
    });

    batchProgressMock.failCountersForParentId = parentId;
    try {
      await getQueue("system").add(
        "batch-finalize",
        toolJob({
          jobId: parentId,
          toolId: "wt-echo",
          kind: "batch-finalize",
          pool: "system",
          totalFiles: 1,
          settings: { flowChildCount: 1 },
          filename: "",
        }),
        { jobId: parentId, attempts: 1 },
      );

      // Without the net nobody publishes a terminal frame: the crash happens
      // before the finalize's own failure handling.
      const frame = await terminalFrame(parentId);
      expect(frame.type).toBe("batch");
      expect(frame.status).toBe("failed");
      // The blank-name synthetic entry is what the client displays; without
      // it this frame would read as "all files failed".
      expect(frame.errors).toEqual([{ filename: "", error: "Failed to package batch results" }]);

      const row = await waitFor(async () => {
        const candidate = await jobRow(parentId);
        return candidate?.status === "failed" ? candidate : undefined;
      });
      expect(row.error?.message).toBe("Failed to package batch results");
    } finally {
      batchProgressMock.failCountersForParentId = null;
    }
  }, 30_000);

  it("assembles the ordered manifest across completed, failed, and missing children", async () => {
    const jobId = `bf-${randomUUID()}`;
    // The finalize streams every successful output into the durable ZIP
    // (#750), so the fabricated ref must exist as a real object.
    await putObject("outputs/seed/ok.png", Buffer.from("ok-bytes"));
    await db.insert(schema.jobs).values({
      id: `${jobId}-f0`,
      type: "batch-child",
      status: "completed",
      toolId: "wt-echo",
      pool: "image",
      inputRefs: ["uploads/seed/in0.png"],
      outputRefs: ["outputs/seed/ok.png"],
    });
    await db.insert(schema.jobs).values({
      id: `${jobId}-f1`,
      type: "batch-child",
      status: "failed",
      toolId: "wt-boom",
      pool: "image",
      inputRefs: ["uploads/seed/orig.png"],
      error: { message: "child died" },
    });
    // No -f2 row: reported as "Child job row not found".

    await enqueueToolJob(
      toolJob({
        jobId,
        toolId: "batch",
        kind: "batch-finalize",
        pool: "system",
        settings: { flowChildCount: 3 },
        filename: "batch.zip",
      }),
    );

    const row = await terminalRow(jobId);
    expect(row.status).toBe("completed");

    const result = await waitFor(async () => {
      const job = await getQueue("system").getJob(jobId);
      return job?.returnvalue ?? undefined;
    });
    const manifest =
      (
        (result.resultPayload ?? {}) as {
          manifest?: Array<{ index: number; filename: string; outputRef?: string; error?: string }>;
        }
      ).manifest ?? [];
    expect(manifest).toEqual([
      { index: 0, filename: "ok.png", outputRef: "outputs/seed/ok.png" },
      { index: 1, filename: "orig.png", error: "child died" },
      { index: 2, filename: "file-2", error: "Child job row not found" },
    ]);
  });

  it("rejects unknown jobs on the system pool and terminally fails them", async () => {
    const jobId = randomUUID();

    await enqueueToolJob(
      toolJob({ jobId, toolId: "wt-not-a-system-job", pool: "system", filename: "none" }),
    );

    const failedJob = await waitFor(async () => {
      const job = await getQueue("system").getJob(jobId);
      if (!job) return undefined;
      return (await job.getState()) === "failed" ? job : undefined;
    }, 25_000);
    expect(failedJob.failedReason).toContain("Unknown system job: wt-not-a-system-job");
  }, 30_000);
});
