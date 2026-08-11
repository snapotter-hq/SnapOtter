/**
 * A terminal job row must survive a late progress frame.
 *
 * Tool progress is published fire and forget (`void updateSingleFileProgress`
 * in the worker), so a nonterminal frame can still be in flight when the job
 * reaches a terminal state. persistSingleFileProgress wrote
 * `status: "processing", completedAt: null, error: null` unconditionally, so a
 * frame that landed late resurrected a finished row.
 *
 * Observed on the release container: cancelling a stabilize-video job just
 * after submit left the row permanently `status = processing`,
 * `completed_at = null`, `error = null`, `duration_ms = 59`, with
 * `progress = {"stage":"Analyzing","percent":5}` -- the tool's first frame,
 * written after the worker's cancel row. One in three attempts reproduced it,
 * and the row never recovered because nothing else revisits it.
 *
 * The completion path is already safe: it goes through
 * updateSingleFileProgressAtomically, whose per-job queue drains earlier
 * nonterminal writes first. The cancel and failure paths in the worker use a
 * plain db.update outside that queue, so the guard has to live in the write
 * itself.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { sharedRedis } from "../../../apps/api/src/jobs/connection.js";
import { bullPrefix } from "../../../apps/api/src/jobs/types.js";
import {
  failBatchJob,
  updateJobProgress,
  updateSingleFileProgress,
} from "../../../apps/api/src/routes/progress.js";
import { buildTestApp, type TestApp } from "../test-server.js";

let testApp: TestApp;

beforeAll(async () => {
  testApp = await buildTestApp();
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

async function seedJob(
  status: "canceled" | "failed" | "completed" | "processing",
): Promise<string> {
  const id = randomUUID();
  await db.insert(schema.jobs).values({
    id,
    type: "single",
    status,
    inputRefs: [],
    completedAt: status === "processing" ? null : new Date(),
    durationMs: 59,
    error: status === "failed" ? { message: "boom" } : null,
  });
  return id;
}

async function readJob(id: string) {
  const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  return row;
}

describe("late progress frames against a terminal job row", () => {
  for (const terminal of ["canceled", "failed", "completed"] as const) {
    it(`leaves a ${terminal} row terminal`, async () => {
      const id = await seedJob(terminal);

      // The frame the worker had already queued before the job ended.
      await updateSingleFileProgress({
        jobId: id,
        phase: "processing",
        percent: 5,
        stage: "Analyzing",
      });

      const row = await readJob(id);
      expect(row.status, `${terminal} row was rewritten to ${row.status}`).toBe(terminal);
      expect(row.completedAt, "completedAt was cleared by a late progress frame").not.toBeNull();
      if (terminal === "failed") {
        expect(row.error, "the failure reason was cleared by a late progress frame").not.toBeNull();
      }
    });
  }

  it("still advances a job that is genuinely still running", async () => {
    const id = await seedJob("processing");

    await updateSingleFileProgress({
      jobId: id,
      phase: "processing",
      percent: 42,
      stage: "Working",
    });

    const row = await readJob(id);
    expect(row.status).toBe("processing");
    expect((row.progress as { percent?: number } | null)?.percent).toBe(42);
  });

  it("still records a terminal frame on a running job", async () => {
    const id = await seedJob("processing");

    await updateSingleFileProgress({ jobId: id, phase: "complete", percent: 100 });

    const row = await readJob(id);
    expect(row.status).toBe("completed");
    expect(row.completedAt).not.toBeNull();
  });
});

/**
 * The batch twin (#750): child outcomes are fire-and-forget nonterminal
 * frames, and the finalize's terminal write can race them. A late child frame
 * must not resurrect a completed parent (it would wipe the durable result the
 * SSE replay depends on), and the crashed-finalize safety net (failBatchJob)
 * must never downgrade a committed completion nor announce a failed frame
 * over one.
 */
describe("late batch frames and the failBatchJob guard", () => {
  const BATCH_RESULT = {
    downloadUrl: "/api/v1/download/x/batch-resize-x.zip",
    fileResults: { "0": "a.png" },
  };

  async function seedBatchJob(status: "completed" | "processing"): Promise<string> {
    const id = randomUUID();
    await db.insert(schema.jobs).values({
      id,
      type: "batch",
      status,
      inputRefs: [],
      completedAt: status === "processing" ? null : new Date(),
      progress:
        status === "completed"
          ? { percent: 100, totalFiles: 1, completedFiles: 1, failedFiles: 0, result: BATCH_RESULT }
          : { percent: 0, totalFiles: 1, completedFiles: 0, failedFiles: 0 },
    });
    return id;
  }

  it("a late nonterminal child frame cannot resurrect a completed batch row", async () => {
    const id = await seedBatchJob("completed");

    updateJobProgress({
      jobId: id,
      status: "processing",
      totalFiles: 1,
      completedFiles: 0,
      failedFiles: 0,
      errors: [],
    });
    // updateJobProgress persists fire and forget; give its queue time to
    // drain before asserting nothing changed.
    await new Promise((r) => setTimeout(r, 500));

    const row = await readJob(id);
    expect(row.status, "completed batch row was resurrected").toBe("completed");
    expect(row.completedAt).not.toBeNull();
    expect((row.progress as { result?: unknown } | null)?.result, "durable result wiped").toEqual(
      BATCH_RESULT,
    );
  });

  it("failBatchJob refuses to downgrade a completed batch and announces nothing", async () => {
    const id = await seedBatchJob("completed");

    await failBatchJob({
      jobId: id,
      totalFiles: 1,
      completedFiles: 1,
      failedFiles: 1,
      errors: [],
      message: "Failed to package batch results",
    });

    const row = await readJob(id);
    expect(row.status).toBe("completed");
    expect((row.progress as { result?: unknown } | null)?.result).toEqual(BATCH_RESULT);
    // No terminal failed frame may be announced over the completion: a
    // reconnecting client would settle on whichever it reads.
    expect(await sharedRedis().get(`${bullPrefix()}:terminal:${id}`)).toBeNull();
  });

  it("failBatchJob owns the transition on a live batch and announces it", async () => {
    const id = await seedBatchJob("processing");

    await failBatchJob({
      jobId: id,
      totalFiles: 1,
      completedFiles: 1,
      failedFiles: 1,
      errors: [{ filename: "a.png", error: "boom" }],
      message: "Failed to package batch results",
    });

    const row = await readJob(id);
    expect(row.status).toBe("failed");
    expect(row.completedAt).not.toBeNull();

    const raw = await sharedRedis().get(`${bullPrefix()}:terminal:${id}`);
    expect(raw).not.toBeNull();
    const frame = JSON.parse(raw as string) as Record<string, unknown>;
    expect(frame.type).toBe("batch");
    expect(frame.status).toBe("failed");
  });
});
