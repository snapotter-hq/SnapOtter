/**
 * A job row must never stay non-terminal once nothing will run it again, and
 * output bytes already on disk must never become unreachable because the row
 * was not updated.
 *
 * Measured on the release container (finding PERF-20260726-006): stopping
 * Postgres for 20 s with six jobs in flight left four rows stranded forever,
 * three `queued` and one `processing`, with attempts 0 or 1, error null and
 * output_refs null, while every BullMQ pool was drained. The worker marks a job
 * `processing` before doing the work; with the database refusing connections
 * that UPDATE fails outright, BullMQ exhausts its attempts, and the failure
 * path then cannot persist `failed` through the same dead database either. The
 * worst row was `processing` with its finished AVIF sitting in
 * outputs/<jobId>/ and output_refs null, so the bytes were unreachable through
 * the API and would have been swept by the 72-hour TTL.
 *
 * These cases pin the reconciler's contract: recover where the artifact
 * exists, fail only where nothing was produced, and never touch a row that a
 * live queue entry or a terminal status already accounts for.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { db, schema } from "../../../apps/api/src/db/index.js";
import {
  reconcileStrandedJobs,
  UNRECOVERABLE_STRANDED_JOB_ERROR,
} from "../../../apps/api/src/jobs/job-reconciliation.js";
import { getQueue } from "../../../apps/api/src/jobs/queues.js";
import { SYSTEM_JOBS } from "../../../apps/api/src/jobs/system-jobs.js";
import { deletePrefix, putObject } from "../../../apps/api/src/lib/object-storage.js";
import { buildTestApp, type TestApp } from "../test-server.js";

let testApp: TestApp;
const seededPrefixes: string[] = [];

beforeAll(async () => {
  testApp = await buildTestApp();
}, 30_000);

afterAll(async () => {
  for (const prefix of seededPrefixes) await deletePrefix(prefix).catch(() => {});
  await testApp.cleanup();
}, 15_000);

type Seed = {
  status?: "queued" | "processing" | "completed" | "failed" | "canceled";
  toolId?: string | null;
  type?: string;
  pool?: string | null;
  ageMs?: number;
};

async function seedJob(seed: Seed = {}): Promise<string> {
  const id = randomUUID();
  await db.insert(schema.jobs).values({
    id,
    toolId: seed.toolId === undefined ? "convert" : seed.toolId,
    pool: seed.pool === undefined ? "image" : seed.pool,
    type: seed.type ?? "tool",
    status: seed.status ?? "processing",
    inputRefs: [],
    createdAt: new Date(Date.now() - (seed.ageMs ?? 10 * 60_000)),
    completedAt: ["completed", "failed", "canceled"].includes(seed.status ?? "")
      ? new Date()
      : null,
  });
  return id;
}

async function seedOutput(jobId: string, name: string, body: Buffer): Promise<void> {
  const prefix = `outputs/${jobId}/`;
  if (!seededPrefixes.includes(prefix)) seededPrefixes.push(prefix);
  await putObject(`${prefix}${name}`, body);
}

async function readJob(id: string) {
  const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  return row;
}

function resultOf(row: Awaited<ReturnType<typeof readJob>>): Record<string, unknown> {
  return (row.progress?.result ?? {}) as Record<string, unknown>;
}

describe("stranded-job reconciliation", () => {
  it("completes a processing row whose output is already on disk", async () => {
    const id = await seedJob({ status: "processing" });
    const bytes = Buffer.from("avif-bytes-that-were-really-produced");
    await seedOutput(id, "stress-large.avif", bytes);
    await seedOutput(id, "preview.webp", Buffer.from("preview"));

    const summary = await reconcileStrandedJobs({ graceMs: 0 });
    expect(summary.outcomes.find((o) => o.jobId === id)?.resolution).toBe("recovered");

    const row = await readJob(id);
    expect(row.status, "a finished job was not restored to completed").toBe("completed");
    expect(row.outputRefs, "the artifact on disk was not adopted").toEqual([
      `outputs/${id}/stress-large.avif`,
    ]);
    expect(row.bytesOut).toBe(bytes.length);
    expect(row.completedAt).not.toBeNull();
    expect(resultOf(row).downloadUrl).toBe(`/api/v1/download/${id}/stress-large.avif`);
    expect(resultOf(row).previewUrl).toBe(`/api/v1/download/${id}/preview.webp`);
  });

  it("serves the recovered artifact through the API", async () => {
    const id = await seedJob({ status: "processing" });
    await seedOutput(id, "recovered.bin", Buffer.from("0123456789"));

    await reconcileStrandedJobs({ graceMs: 0 });

    const row = await readJob(id);
    const res = await testApp.app.inject({
      method: "GET",
      url: String(resultOf(row).downloadUrl),
    });
    expect(res.statusCode, "the recovered bytes are still unreachable").toBe(200);
    expect(res.body).toBe("0123456789");
  });

  // The reconciler builds its payload while the sweep runs, so only a sweep
  // under a nonempty BASE_PATH can catch a prefix baked into it (#1297). The
  // payload is persisted, so it stays root-relative (#1274) and the client
  // joins it onto the deployment path.
  it("keeps a recovered row's URLs root-relative under a deployment prefix", async () => {
    const basePath = "/snapotter";
    const id = await seedJob({ status: "processing" });
    await seedOutput(id, "recovered.bin", Buffer.from("0123456789"));
    await seedOutput(id, "preview.png", Buffer.from("preview"));

    const originalBasePath = env.BASE_PATH;
    env.BASE_PATH = basePath;
    try {
      const summary = await reconcileStrandedJobs({ graceMs: 0 });
      expect(summary.outcomes.find((o) => o.jobId === id)?.resolution).toBe("recovered");

      const row = await readJob(id);
      expect(row.status).toBe("completed");
      expect(resultOf(row).downloadUrl).toBe(`/api/v1/download/${id}/recovered.bin`);
      expect(resultOf(row).previewUrl).toBe(`/api/v1/download/${id}/preview.png`);

      const res = await testApp.app.inject({
        method: "GET",
        url: `${basePath}${resultOf(row).downloadUrl}`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe("0123456789");
    } finally {
      env.BASE_PATH = originalBasePath;
    }
  });

  it("fails a queued row that produced nothing", async () => {
    const id = await seedJob({ status: "queued" });

    const summary = await reconcileStrandedJobs({ graceMs: 0 });
    expect(summary.outcomes.find((o) => o.jobId === id)?.resolution).toBe("failed");

    const row = await readJob(id);
    expect(row.status).toBe("failed");
    expect(row.error?.message).toBe(UNRECOVERABLE_STRANDED_JOB_ERROR);
    expect(row.completedAt).not.toBeNull();
    expect(row.outputRefs).toBeNull();
  });

  it("leaves a job alone while it still has a live queue entry", async () => {
    const id = await seedJob({ status: "processing" });
    // A long delay parks the job in "delayed": a live state no worker will
    // pick up during the test, which is exactly what an in-flight job looks
    // like to the reconciler.
    const queue = getQueue("image");
    await queue.add("convert", { jobId: id } as never, { jobId: id, delay: 10 * 60_000 });
    try {
      const summary = await reconcileStrandedJobs({ graceMs: 0 });
      expect(summary.outcomes.find((o) => o.jobId === id)?.resolution).toBe("live");
      expect((await readJob(id)).status, "a live job was reconciled out from under BullMQ").toBe(
        "processing",
      );
    } finally {
      await queue.remove(id).catch(() => {});
    }
  });

  it("never resurrects a terminal row", async () => {
    const canceled = await seedJob({ status: "canceled" });
    const failed = await seedJob({ status: "failed" });
    const completed = await seedJob({ status: "completed" });
    // Output on disk must not tempt the reconciler into rewriting a cancel.
    await seedOutput(canceled, "partial.avif", Buffer.from("bytes"));

    const summary = await reconcileStrandedJobs({ graceMs: 0 });
    for (const id of [canceled, failed, completed]) {
      expect(summary.outcomes.some((o) => o.jobId === id)).toBe(false);
    }
    expect((await readJob(canceled)).status).toBe("canceled");
    expect((await readJob(failed)).status).toBe("failed");
    expect((await readJob(completed)).status).toBe("completed");
  });

  it("is idempotent across repeated sweeps", async () => {
    const recovered = await seedJob({ status: "processing" });
    const lost = await seedJob({ status: "queued" });
    await seedOutput(recovered, "out.avif", Buffer.from("bytes"));

    await reconcileStrandedJobs({ graceMs: 0 });
    const afterFirst = await readJob(recovered);

    const second = await reconcileStrandedJobs({ graceMs: 0 });
    expect(second.outcomes.some((o) => o.jobId === recovered || o.jobId === lost)).toBe(false);

    const afterSecond = await readJob(recovered);
    expect(afterSecond.outputRefs, "a second sweep duplicated the output set").toEqual(
      afterFirst.outputRefs,
    );
    expect(afterSecond.completedAt?.getTime()).toBe(afterFirst.completedAt?.getTime());
    expect((await readJob(lost)).status).toBe("failed");
  });

  it("ignores rows younger than the grace window", async () => {
    const id = await seedJob({ status: "queued", ageMs: 0 });

    const summary = await reconcileStrandedJobs({ graceMs: 60_000 });
    expect(summary.outcomes.some((o) => o.jobId === id)).toBe(false);
    expect((await readJob(id)).status).toBe("queued");
  });

  it("ignores a progress placeholder, which was never enqueued", async () => {
    // An SSE-progress placeholder has no BullMQ job at all; the narrow startup
    // sweep in apps/api/src/index.ts owns those rows.
    const placeholder = await seedJob({ status: "processing", toolId: null, pool: null });

    const summary = await reconcileStrandedJobs({ graceMs: 0 });
    expect(summary.outcomes.some((o) => o.jobId === placeholder)).toBe(false);
    expect((await readJob(placeholder)).status).toBe("processing");
  });

  // #1441: gdpr-export rows (type "system") were skipped on the claim that
  // they enqueue without a jobId. They never did (the route passes the row id
  // as the BullMQ jobId), and nothing else settles one whose export throws, so
  // a failed export said "queued" forever.
  describe("GDPR export rows (#1441)", () => {
    const gdpr = () =>
      seedJob({ status: "queued", type: "system", toolId: "gdpr-export", pool: "system" });

    it("fails a GDPR export whose job is gone and produced nothing", async () => {
      const id = await gdpr();

      const summary = await reconcileStrandedJobs({ graceMs: 0 });
      expect(summary.outcomes.find((o) => o.jobId === id)?.resolution).toBe("failed");

      const row = await readJob(id);
      expect(row.status, "a dead GDPR export stayed non-terminal").toBe("failed");
      expect(row.error?.message).toBe(UNRECOVERABLE_STRANDED_JOB_ERROR);
    });

    it("completes a GDPR export whose archive was written before the status write was lost", async () => {
      const id = await gdpr();
      await seedOutput(id, "gdpr-export.zip", Buffer.from("PK-archive-bytes"));

      const summary = await reconcileStrandedJobs({ graceMs: 0 });
      expect(summary.outcomes.find((o) => o.jobId === id)?.resolution).toBe("recovered");

      const row = await readJob(id);
      expect(row.status).toBe("completed");
      // The same ref the export's own completion records, so the status route
      // hands out the same download link either way.
      expect(row.outputRefs).toEqual([`outputs/${id}/gdpr-export.zip`]);
    });

    // The #1441 path end to end: the export really throws on the system worker
    // the test app runs, BullMQ keeps the job in its failed set (removeOnFail is
    // by age), and nothing but the reconciler ever makes the row terminal.
    it("fails a GDPR export that threw and sits in BullMQ's failed set", async () => {
      const id = await gdpr();
      const queue = getQueue("system");
      // No users row for this id, so gdprExportJob throws "User ... not found".
      const job = await queue.add(
        SYSTEM_JOBS.gdprExport,
        { userId: randomUUID(), jobId: id } as never,
        { jobId: id, attempts: 1 },
      );
      try {
        await vi.waitFor(async () => expect(await job.getState()).toBe("failed"), {
          timeout: 20_000,
          interval: 200,
        });
        expect((await readJob(id)).status, "precondition: nothing else settles it").toBe("queued");

        const summary = await reconcileStrandedJobs({ graceMs: 0 });
        expect(summary.outcomes.find((o) => o.jobId === id)?.resolution).toBe("failed");
        expect((await readJob(id)).status).toBe("failed");
      } finally {
        await queue.remove(id).catch(() => {});
      }
    });

    it("leaves a GDPR export alone while its job is still queued on the system pool", async () => {
      const id = await gdpr();
      const queue = getQueue("system");
      await queue.add(SYSTEM_JOBS.gdprExport, { jobId: id } as never, {
        jobId: id,
        delay: 10 * 60_000,
      });
      try {
        const summary = await reconcileStrandedJobs({ graceMs: 0 });
        expect(summary.outcomes.find((o) => o.jobId === id)?.resolution).toBe("live");
        expect((await readJob(id)).status).toBe("queued");
      } finally {
        await queue.remove(id).catch(() => {});
      }
    });
  });

  it("skips a zero-byte output rather than calling it a result", async () => {
    const id = await seedJob({ status: "processing" });
    await seedOutput(id, "truncated.avif", Buffer.alloc(0));

    await reconcileStrandedJobs({ graceMs: 0 });

    const row = await readJob(id);
    expect(row.status).toBe("failed");
    expect(row.outputRefs).toBeNull();
  });
});
