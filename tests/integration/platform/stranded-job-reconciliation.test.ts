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
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { sharedRedis } from "../../../apps/api/src/jobs/connection.js";
import { upsertToolJobAlias } from "../../../apps/api/src/jobs/enqueue.js";
import {
  reconcileStrandedJobs,
  UNRECOVERABLE_STRANDED_JOB_ERROR,
} from "../../../apps/api/src/jobs/job-reconciliation.js";
import { getQueue } from "../../../apps/api/src/jobs/queues.js";
import { runSystemJob, SYSTEM_JOBS } from "../../../apps/api/src/jobs/system-jobs.js";
import { bullPrefix } from "../../../apps/api/src/jobs/types.js";
import { logger } from "../../../apps/api/src/lib/logger.js";
import * as objectStorage from "../../../apps/api/src/lib/object-storage.js";
import { deletePrefix, listObjects, putObject } from "../../../apps/api/src/lib/object-storage.js";
import {
  buildBatchReplayEvent,
  buildSingleFileReplayEvent,
  publishEphemeral,
} from "../../../apps/api/src/routes/progress.js";
import {
  buildTestApp,
  createMultipartPayload,
  createUserAndLogin,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

let testApp: TestApp;
let adminToken: string;
const seededPrefixes: string[] = [];

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
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
  userId?: string | null;
  ageMs?: number;
};

async function seedJob(seed: Seed = {}): Promise<string> {
  const id = randomUUID();
  await db.insert(schema.jobs).values({
    id,
    userId: seed.userId ?? null,
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

    // The #1441 backstop path end to end: when the system worker's own
    // terminal status write is lost (or a job fails via stall eviction),
    // BullMQ keeps the job in its failed set (removeOnFail is by age) and the
    // reconciler settles the stranded row once Postgres answers again.
    it("fails a GDPR export that threw and sits in BullMQ's failed set", async () => {
      const id = await gdpr();
      const queue = getQueue("system");
      try {
        await withTerminalWriteOutage(async ({ terminalWriteFailures }) => {
          // No users row for this id, so gdprExportJob throws "User ... not found".
          const job = await queue.add(
            SYSTEM_JOBS.gdprExport,
            { userId: randomUUID(), jobId: id } as never,
            { jobId: id, attempts: 1 },
          );
          await vi.waitFor(
            async () => {
              expect(await job.getState()).toBe("failed");
              expect(terminalWriteFailures()).toBeGreaterThanOrEqual(1);
            },
            {
              timeout: 20_000,
              interval: 200,
            },
          );
        });
        expect((await readJob(id)).status, "precondition: terminal write was lost").toBe("queued");

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

  async function noiseJpeg(w: number, h: number): Promise<Buffer> {
    const raw = Buffer.alloc(w * h * 3);
    let seed = 7;
    for (let i = 0; i < raw.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      raw[i] = seed & 0xff;
    }
    return sharp(raw, { raw: { width: w, height: h, channels: 3 } })
      .jpeg({ quality: 90 })
      .toBuffer();
  }

  /**
   * Run `fn` while Postgres refuses terminal job writes (`db.transaction` and
   * `db.update` setting a terminal status), so a worker that finishes writing
   * `outputs/<jobId>/` leaves its row stranded in `processing`.
   */
  async function withTerminalWriteOutage<T>(
    fn: (outage: { terminalWriteFailures: () => number }) => Promise<T>,
  ): Promise<T> {
    let failures = 0;
    const origUpdate = db.update.bind(db);
    const txSpy = vi.spyOn(db, "transaction").mockImplementation(async () => {
      failures += 1;
      throw new Error("simulated Postgres outage on terminal transaction");
    });
    const updateSpy = vi.spyOn(db, "update").mockImplementation(((table: unknown) => {
      const builder = origUpdate(table as never);
      const origSet = builder.set.bind(builder);
      builder.set = ((values: Record<string, unknown>) => {
        if (
          values.status === "completed" ||
          values.status === "failed" ||
          values.status === "canceled"
        ) {
          return {
            where: () => {
              failures += 1;
              return Promise.reject(
                new Error("simulated Postgres outage on terminal status update"),
              );
            },
          } as never;
        }
        return origSet(values as never);
      }) as typeof builder.set;
      return builder;
    }) as typeof db.update);
    try {
      return await fn({ terminalWriteFailures: () => failures });
    } finally {
      txSpy.mockRestore();
      updateSpy.mockRestore();
    }
  }

  describe("tool resultPayload preservation (#1389)", () => {
    it("restores a target-size compress job's resize note when the terminal DB write fails", async () => {
      const id = await seedJob({ status: "queued", toolId: "compress", pool: "image" });
      const uploadPrefix = `uploads/${id}/`;
      seededPrefixes.push(uploadPrefix, `outputs/${id}/`);
      const inputRef = `${uploadPrefix}big.jpg`;
      await putObject(inputRef, await noiseJpeg(1200, 900));
      await db
        .update(schema.jobs)
        .set({ inputRefs: [inputRef] })
        .where(eq(schema.jobs.id, id));

      const queue = getQueue("image");
      await withTerminalWriteOutage(async () => {
        const job = await queue.add(
          "compress",
          {
            jobId: id,
            toolId: "compress",
            userId: null,
            pool: "image",
            inputRefs: [inputRef],
            filename: "big.jpg",
            settings: { mode: "targetSize", targetSizeKb: 2 },
            kind: "tool",
          } as never,
          { jobId: id, attempts: 1 },
        );
        await vi.waitFor(async () => expect(await job.getState()).toBe("failed"), {
          timeout: 30_000,
          interval: 200,
        });
      });

      try {
        expect((await readJob(id)).status, "precondition: row stranded in processing").toBe(
          "processing",
        );

        const summary = await reconcileStrandedJobs({ graceMs: 0 });
        expect(summary.outcomes.find((o) => o.jobId === id)?.resolution).toBe("recovered");

        const row = await readJob(id);
        expect(row.status).toBe("completed");
        expect(row.outputRefs).toEqual([`outputs/${id}/big_compress.jpg`]);
        expect((await listObjects(`outputs/${id}/`)).map((o) => o.key).sort()).toEqual([
          `outputs/${id}/.result-payload.json`,
          `outputs/${id}/big_compress.jpg`,
        ]);
        const result = resultOf(row);
        expect(result.reconciled).toBe(true);
        expect(result.targetKb).toBe(2);
        const resizedTo = result.resizedTo as { width?: number; height?: number } | undefined;
        expect(resizedTo?.width).toEqual(expect.any(Number));
        expect(resizedTo?.height).toEqual(expect.any(Number));
        expect(resizedTo?.width).toBeLessThan(1200);
      } finally {
        await queue.remove(id).catch(() => {});
      }
    });

    it("preserves a reconciled batch child's resize and missed-target notes through batch-finalize", async () => {
      const parentId = await seedJob({
        status: "processing",
        toolId: "compress",
        pool: "system",
        type: "batch",
        ageMs: 0,
      });
      const child0Id = `${parentId}-f0`;
      const child1Id = `${parentId}-f1`;
      seededPrefixes.push(
        `uploads/${child0Id}/`,
        `outputs/${child0Id}/`,
        `outputs/${child1Id}/`,
        `outputs/${parentId}/`,
      );

      await db.insert(schema.jobs).values([
        {
          id: child0Id,
          toolId: "compress",
          pool: "image",
          type: "batch-child",
          status: "queued",
          inputRefs: [`uploads/${child0Id}/big.jpg`],
          createdAt: new Date(Date.now() - 10 * 60_000),
        },
        {
          id: child1Id,
          toolId: "compress-pdf",
          pool: "docs",
          type: "batch-child",
          status: "processing",
          inputRefs: [`uploads/${child1Id}/scan.pdf`],
          createdAt: new Date(Date.now() - 10 * 60_000),
        },
      ]);
      await putObject(`uploads/${child0Id}/big.jpg`, await noiseJpeg(1200, 900));
      await seedOutput(child1Id, "scan_compressed.pdf", Buffer.from("%PDF-1.4-bytes"));
      await seedOutput(
        child1Id,
        ".result-payload.json",
        Buffer.from(JSON.stringify({ targetKb: 1, targetMet: false }), "utf8"),
      );

      const imageQueue = getQueue("image");
      const systemQueue = getQueue("system");
      await withTerminalWriteOutage(async () => {
        const job0 = await imageQueue.add(
          "compress",
          {
            jobId: child0Id,
            toolId: "compress",
            userId: null,
            pool: "image",
            inputRefs: [`uploads/${child0Id}/big.jpg`],
            filename: "big.jpg",
            settings: { mode: "targetSize", targetSizeKb: 2 },
            kind: "batch-child",
            parentId,
            totalFiles: 2,
          } as never,
          { jobId: child0Id, attempts: 1 },
        );
        // processBatchChild catches processToolJob's throw and returns a failure
        // marker so the BullMQ job itself completes while the DB row stays processing.
        await vi.waitFor(async () => expect(await job0.getState()).toBe("completed"), {
          timeout: 30_000,
          interval: 200,
        });
      });

      try {
        expect((await readJob(child0Id)).status).toBe("processing");
        expect((await readJob(child1Id)).status).toBe("processing");

        const summary = await reconcileStrandedJobs({ graceMs: 60_000 });
        expect(summary.outcomes.find((o) => o.jobId === child0Id)?.resolution).toBe("recovered");
        expect(summary.outcomes.find((o) => o.jobId === child1Id)?.resolution).toBe("recovered");

        const finalizeJob = await systemQueue.add(
          "batch-finalize",
          {
            jobId: parentId,
            toolId: "compress",
            userId: null,
            pool: "system",
            inputRefs: [],
            filename: "",
            settings: { flowChildCount: 2 },
            kind: "batch-finalize",
            totalFiles: 2,
          } as never,
          { jobId: `${parentId}-finalize`, attempts: 1 },
        );
        await vi.waitFor(async () => expect(await finalizeJob.getState()).toBe("completed"), {
          timeout: 30_000,
          interval: 200,
        });

        const parentRow = await readJob(parentId);
        expect(parentRow.status).toBe("completed");
        const fileNotes = resultOf(parentRow).fileNotes as
          | Record<string, Record<string, unknown>>
          | undefined;
        expect(fileNotes?.["0"]?.targetKb).toBe(2);
        expect((fileNotes?.["0"]?.resizedTo as { width?: number } | undefined)?.width).toBeLessThan(
          1200,
        );
        expect(fileNotes?.["1"]).toEqual({ targetKb: 1, targetMet: false });
      } finally {
        await imageQueue.remove(child0Id).catch(() => {});
        await systemQueue.remove(`${parentId}-finalize`).catch(() => {});
      }
    });

    it("does not mistake a lone result-payload sidecar for a recoverable output", async () => {
      const id = await seedJob({ status: "processing" });
      await seedOutput(
        id,
        ".result-payload.json",
        Buffer.from(
          JSON.stringify({ targetKb: 20, resizedTo: { width: 100, height: 80 } }),
          "utf8",
        ),
      );

      const summary = await reconcileStrandedJobs({ graceMs: 0 });
      expect(summary.outcomes.find((o) => o.jobId === id)?.resolution).toBe("failed");

      const row = await readJob(id);
      expect(row.status).toBe("failed");
      expect(row.outputRefs).toBeNull();
    });

    it("recovers the output and logs an error when the result-payload sidecar is malformed or clobbers core fields", async () => {
      const badJsonId = await seedJob({ status: "processing" });
      await seedOutput(badJsonId, "out.avif", Buffer.from("avif-bytes"));
      await seedOutput(badJsonId, ".result-payload.json", Buffer.from("{not-valid-json", "utf8"));

      const nonObjectId = await seedJob({ status: "processing" });
      await seedOutput(nonObjectId, "out.avif", Buffer.from("avif-bytes"));
      await seedOutput(nonObjectId, ".result-payload.json", Buffer.from("[1,2,3]", "utf8"));

      const nullJsonId = await seedJob({ status: "processing" });
      await seedOutput(nullJsonId, "out.avif", Buffer.from("avif-bytes"));
      await seedOutput(nullJsonId, ".result-payload.json", Buffer.from("null", "utf8"));

      const clobberId = await seedJob({ status: "processing" });
      await seedOutput(clobberId, "out.pdf", Buffer.from("%PDF-bytes"));
      await seedOutput(
        clobberId,
        ".result-payload.json",
        Buffer.from(
          JSON.stringify({
            targetKb: 10,
            targetMet: false,
            jobId: "forged-id",
            downloadUrl: "/evil",
            previewUrl: "/forged-preview",
            originalSize: 999_999,
            processedSize: 999_999,
            reconciled: false,
          }),
          "utf8",
        ),
      );

      const errorSpy = vi.spyOn(logger, "error");
      try {
        const summary = await reconcileStrandedJobs({ graceMs: 0 });
        expect(summary.outcomes.find((o) => o.jobId === badJsonId)?.resolution).toBe("recovered");
        expect(summary.outcomes.find((o) => o.jobId === nonObjectId)?.resolution).toBe("recovered");
        expect(summary.outcomes.find((o) => o.jobId === nullJsonId)?.resolution).toBe("recovered");
        expect(summary.outcomes.find((o) => o.jobId === clobberId)?.resolution).toBe("recovered");

        expect(
          errorSpy.mock.calls.some(
            ([ctx, msg]) =>
              (ctx as { jobId?: string } | undefined)?.jobId === badJsonId &&
              msg ===
                "Failed to parse result payload sidecar during job reconciliation; continuing without tool payload",
          ),
        ).toBe(true);
        expect(
          errorSpy.mock.calls.some(
            ([ctx, msg]) =>
              (ctx as { jobId?: string } | undefined)?.jobId === nonObjectId &&
              msg === "Result payload sidecar is not a JSON object; ignoring",
          ),
        ).toBe(true);
        expect(
          errorSpy.mock.calls.some(
            ([ctx, msg]) =>
              (ctx as { jobId?: string } | undefined)?.jobId === nullJsonId &&
              msg === "Result payload sidecar is not a JSON object; ignoring",
          ),
        ).toBe(true);

        const badJsonResult = resultOf(await readJob(badJsonId));
        expect(badJsonResult.downloadUrl).toBe(`/api/v1/download/${badJsonId}/out.avif`);
        expect(badJsonResult.reconciled).toBe(true);

        const nonObjectResult = resultOf(await readJob(nonObjectId));
        expect(nonObjectResult["0"]).toBeUndefined();
        expect(nonObjectResult.downloadUrl).toBe(`/api/v1/download/${nonObjectId}/out.avif`);
        expect(nonObjectResult.reconciled).toBe(true);

        const nullJsonResult = resultOf(await readJob(nullJsonId));
        expect(nullJsonResult.downloadUrl).toBe(`/api/v1/download/${nullJsonId}/out.avif`);
        expect(nullJsonResult.reconciled).toBe(true);

        const clobberRow = await readJob(clobberId);
        const result = resultOf(clobberRow);
        expect(result.targetKb).toBe(10);
        expect(result.targetMet).toBe(false);
        expect(result.jobId).toBe(clobberId);
        expect(result.downloadUrl).toBe(`/api/v1/download/${clobberId}/out.pdf`);
        expect(result.previewUrl).toBeUndefined();
        expect(result.originalSize).toBe(0);
        expect(result.processedSize).toBe(Buffer.from("%PDF-bytes").length);
        expect(result.reconciled).toBe(true);
      } finally {
        errorSpy.mockRestore();
      }
    });

    it("leaves the row non-terminal on a sidecar storage read fault rather than completing it without its payload", async () => {
      const id = await seedJob({ status: "processing" });
      await seedOutput(id, "out.jpg", Buffer.from("jpg-bytes"));
      await seedOutput(
        id,
        ".result-payload.json",
        Buffer.from(JSON.stringify({ targetKb: 5, resizedTo: { width: 100, height: 80 } }), "utf8"),
      );

      const origGetBuffer = objectStorage.getObjectBuffer;
      const readSpy = vi.spyOn(objectStorage, "getObjectBuffer").mockImplementation(async (key) => {
        if (key === `outputs/${id}/.result-payload.json`) {
          throw Object.assign(new Error("EIO: i/o error, read"), { code: "EIO", syscall: "read" });
        }
        return origGetBuffer(key);
      });
      const errorSpy = vi.spyOn(logger, "error");
      try {
        const firstSweep = await reconcileStrandedJobs({ graceMs: 0 });
        expect(firstSweep.outcomes.find((o) => o.jobId === id)).toBeUndefined();
        expect(
          (await readJob(id)).status,
          "row must stay non-terminal so the next sweep retries",
        ).toBe("processing");
        expect(
          errorSpy.mock.calls.some(
            ([ctx, msg]) =>
              (ctx as { jobId?: string } | undefined)?.jobId === id &&
              msg === "Failed to reconcile stranded job row; leaving non-terminal for next sweep",
          ),
        ).toBe(true);
      } finally {
        readSpy.mockRestore();
        errorSpy.mockRestore();
      }

      const summary = await reconcileStrandedJobs({ graceMs: 0 });
      expect(summary.outcomes.find((o) => o.jobId === id)?.resolution).toBe("recovered");
      expect(resultOf(await readJob(id)).resizedTo).toEqual({ width: 100, height: 80 });
    });
  });

  describe("clientJobId alias row settlement (#2682)", () => {
    it("settles the clientJobId alias row as completed with the recovered result when the terminal DB write fails", async () => {
      const id = await seedJob({ status: "queued", toolId: "compress", pool: "image" });
      const clientJobId = randomUUID();
      await upsertToolJobAlias({
        jobId: id,
        clientJobId,
        userId: null,
        pool: "image",
      });

      const uploadPrefix = `uploads/${id}/`;
      seededPrefixes.push(uploadPrefix, `outputs/${id}/`);
      const inputRef = `${uploadPrefix}big.jpg`;
      await putObject(inputRef, await noiseJpeg(1200, 900));
      await db
        .update(schema.jobs)
        .set({ inputRefs: [inputRef] })
        .where(eq(schema.jobs.id, id));

      const queue = getQueue("image");
      await withTerminalWriteOutage(async () => {
        const job = await queue.add(
          "compress",
          {
            jobId: id,
            clientJobId,
            toolId: "compress",
            userId: null,
            pool: "image",
            inputRefs: [inputRef],
            filename: "big.jpg",
            settings: { mode: "targetSize", targetSizeKb: 2 },
            kind: "tool",
          } as never,
          { jobId: id, attempts: 1 },
        );
        await vi.waitFor(async () => expect(await job.getState()).toBe("failed"), {
          timeout: 30_000,
          interval: 200,
        });
      });

      try {
        expect((await readJob(id)).status).toBe("processing");
        expect(["queued", "processing"]).toContain((await readJob(clientJobId)).status);

        const summary = await reconcileStrandedJobs({ graceMs: 0 });
        expect(summary.outcomes.find((o) => o.jobId === id)?.resolution).toBe("recovered");

        const artifactRow = await readJob(id);
        const aliasRow = await readJob(clientJobId);
        expect(aliasRow.status).toBe("completed");
        expect(aliasRow.completedAt).not.toBeNull();
        expect(aliasRow.error).toBeNull();
        expect(aliasRow.progress).toEqual(artifactRow.progress);

        const replay = buildSingleFileReplayEvent({
          jobId: clientJobId,
          status: aliasRow.status,
          progress: aliasRow.progress,
          error: aliasRow.error,
        });
        expect(replay).toMatchObject({
          jobId: clientJobId,
          type: "single",
          phase: "complete",
          percent: 100,
          stage: "complete",
          result: {
            jobId: id,
            downloadUrl: `/api/v1/download/${id}/big_compress.jpg`,
            reconciled: true,
            targetKb: 2,
          },
        });

        // #2699: Connecting to GET /api/v1/jobs/:clientJobId/progress must
        // replay the recovered completion rather than a stale Redis failed frame.
        expect(await sharedRedis().get(`${bullPrefix()}:terminal:${clientJobId}`)).toBeNull();
        const sseRes = await testApp.app.inject({
          method: "GET",
          url: `/api/v1/jobs/${clientJobId}/progress`,
          headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(sseRes.statusCode).toBe(200);
        const dataMatch = sseRes.body.match(/data: (.+)/);
        expect(dataMatch).not.toBeNull();
        expect(JSON.parse(dataMatch?.[1] ?? "{}")).toMatchObject({
          jobId: clientJobId,
          type: "single",
          phase: "complete",
          percent: 100,
          stage: "complete",
          result: {
            jobId: id,
            downloadUrl: `/api/v1/download/${id}/big_compress.jpg`,
            reconciled: true,
            targetKb: 2,
          },
        });
      } finally {
        await queue.remove(id).catch(() => {});
      }
    });

    it("clears stale Redis terminal replay keys when reconciling recovered or failed jobs and their aliases (#2699)", async () => {
      const recoveredId = await seedJob({ status: "processing" });
      await seedOutput(recoveredId, "out.avif", Buffer.from("avif-bytes"));
      const recoveredAlias = randomUUID();
      await upsertToolJobAlias({
        jobId: recoveredId,
        clientJobId: recoveredAlias,
        userId: null,
        pool: "image",
      });

      const failedId = await seedJob({ status: "queued" });
      const failedAlias = randomUUID();
      await upsertToolJobAlias({
        jobId: failedId,
        clientJobId: failedAlias,
        userId: null,
        pool: "image",
      });

      for (const targetId of [recoveredId, recoveredAlias, failedId, failedAlias]) {
        publishEphemeral({
          jobId: targetId,
          type: "single",
          phase: "failed",
          percent: 0,
          error: "Stale pre-reconciliation frame",
        });
      }
      await vi.waitFor(async () => {
        expect(
          await sharedRedis().get(`${bullPrefix()}:terminal:${recoveredAlias}`),
        ).not.toBeNull();
        expect(await sharedRedis().get(`${bullPrefix()}:terminal:${failedAlias}`)).not.toBeNull();
      });

      const summary = await reconcileStrandedJobs({ graceMs: 0 });
      expect(summary.outcomes.find((o) => o.jobId === recoveredId)?.resolution).toBe("recovered");
      expect(summary.outcomes.find((o) => o.jobId === failedId)?.resolution).toBe("failed");

      for (const targetId of [recoveredId, recoveredAlias, failedId, failedAlias]) {
        expect(await sharedRedis().get(`${bullPrefix()}:terminal:${targetId}`)).toBeNull();
      }

      const recoveredSse = await testApp.app.inject({
        method: "GET",
        url: `/api/v1/jobs/${recoveredAlias}/progress`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const recoveredFrame = JSON.parse(recoveredSse.body.match(/data: (.+)/)?.[1] ?? "{}");
      expect(recoveredFrame).toMatchObject({
        jobId: recoveredAlias,
        type: "single",
        phase: "complete",
        percent: 100,
        result: {
          jobId: recoveredId,
          downloadUrl: `/api/v1/download/${recoveredId}/out.avif`,
          reconciled: true,
        },
      });

      const failedSse = await testApp.app.inject({
        method: "GET",
        url: `/api/v1/jobs/${failedAlias}/progress`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const failedFrame = JSON.parse(failedSse.body.match(/data: (.+)/)?.[1] ?? "{}");
      expect(failedFrame).toEqual({
        jobId: failedAlias,
        type: "single",
        phase: "failed",
        percent: 0,
        error: UNRECOVERABLE_STRANDED_JOB_ERROR,
      });
    });

    it("settles the clientJobId alias row as failed when the stranded job produced no output", async () => {
      const id = await seedJob({ status: "queued", toolId: "convert", pool: "image" });
      const clientJobId = randomUUID();
      await upsertToolJobAlias({
        jobId: id,
        clientJobId,
        userId: null,
        pool: "image",
      });
      await db
        .update(schema.jobs)
        .set({
          status: "processing",
          progress: { percent: 40, stage: "Encoding..." },
        })
        .where(eq(schema.jobs.id, clientJobId));

      const summary = await reconcileStrandedJobs({ graceMs: 0 });
      expect(summary.outcomes.find((o) => o.jobId === id)?.resolution).toBe("failed");

      const aliasRow = await readJob(clientJobId);
      expect(aliasRow.status).toBe("failed");
      expect(aliasRow.completedAt).not.toBeNull();
      expect(aliasRow.progress).toEqual({ percent: 0 });
      expect(aliasRow.error?.message).toBe(UNRECOVERABLE_STRANDED_JOB_ERROR);

      const replay = buildSingleFileReplayEvent({
        jobId: clientJobId,
        status: aliasRow.status,
        progress: aliasRow.progress,
        error: aliasRow.error,
      });
      expect(replay).toEqual({
        jobId: clientJobId,
        type: "single",
        phase: "failed",
        percent: 0,
        error: UNRECOVERABLE_STRANDED_JOB_ERROR,
      });
    });

    it("leaves a re-pointed, non-single, or already-terminal row untouched while settling matching non-terminal aliases", async () => {
      const recoveredId = await seedJob({ status: "processing" });
      await seedOutput(recoveredId, "out.avif", Buffer.from("avif-bytes"));
      const failedId = await seedJob({ status: "queued" });

      const matchingAlias = randomUUID();
      await upsertToolJobAlias({
        jobId: recoveredId,
        clientJobId: matchingAlias,
        userId: null,
        pool: "image",
      });

      const repointedAlias = randomUUID();
      await upsertToolJobAlias({
        jobId: recoveredId,
        clientJobId: repointedAlias,
        userId: null,
        pool: "image",
      });
      const newerJobId = randomUUID();
      await upsertToolJobAlias({
        jobId: newerJobId,
        clientJobId: repointedAlias,
        userId: null,
        pool: "image",
      });

      const nonSingleCollision = randomUUID();
      await db.insert(schema.jobs).values({
        id: nonSingleCollision,
        type: "batch",
        status: "queued",
        inputRefs: [],
        settings: { artifactJobId: recoveredId },
      });

      const canceledAlias = randomUUID();
      await upsertToolJobAlias({
        jobId: failedId,
        clientJobId: canceledAlias,
        userId: null,
        pool: "image",
      });
      await db
        .update(schema.jobs)
        .set({
          status: "canceled",
          completedAt: new Date(),
          error: { message: "Canceled" },
        })
        .where(eq(schema.jobs.id, canceledAlias));

      const summary = await reconcileStrandedJobs({ graceMs: 0 });
      expect(summary.outcomes.find((o) => o.jobId === recoveredId)?.resolution).toBe("recovered");
      expect(summary.outcomes.find((o) => o.jobId === failedId)?.resolution).toBe("failed");

      const matchingRow = await readJob(matchingAlias);
      expect(matchingRow.status).toBe("completed");
      expect(resultOf(matchingRow).downloadUrl).toBe(`/api/v1/download/${recoveredId}/out.avif`);

      const repointedRow = await readJob(repointedAlias);
      expect(repointedRow.status).toBe("queued");
      expect(repointedRow.progress).toBeNull();
      expect(repointedRow.settings).toEqual({ artifactJobId: newerJobId });

      const nonSingleRow = await readJob(nonSingleCollision);
      expect(nonSingleRow.status).toBe("queued");
      expect(nonSingleRow.progress).toBeNull();

      const canceledRow = await readJob(canceledAlias);
      expect(canceledRow.status).toBe("canceled");
      expect(canceledRow.error?.message).toBe("Canceled");
    });
  });

  describe("pipeline and batch finalize resultPayload preservation (#2683)", () => {
    it("restores a pipeline parent row's stepsCompleted and per-step notes when pipeline-finalize's terminal DB write fails", async () => {
      const pipelineId = await seedJob({
        status: "processing",
        toolId: "pipeline",
        pool: "image",
        type: "pipeline",
      });
      const step0Id = `${pipelineId}-s0`;
      const step1Id = `${pipelineId}-s1`;
      const step1Bytes = await noiseJpeg(60, 40);
      seededPrefixes.push(`outputs/${step1Id}/`, `outputs/${pipelineId}/`);
      await seedOutput(step1Id, "photo_rotated.jpg", step1Bytes);

      await db.insert(schema.jobs).values([
        {
          id: step0Id,
          toolId: "compress",
          pool: "image",
          type: "pipeline-step",
          status: "completed",
          bytesIn: 24_000,
          bytesOut: 1_800,
          inputRefs: [`uploads/${pipelineId}/photo.jpg`],
          outputRefs: [`outputs/${step0Id}/photo_compress.jpg`],
          progress: {
            percent: 100,
            stage: "complete",
            result: {
              jobId: step0Id,
              targetKb: 2,
              resizedTo: { width: 600, height: 450 },
            },
          },
          completedAt: new Date(),
        },
        {
          id: step1Id,
          toolId: "rotate",
          pool: "image",
          type: "pipeline-step",
          status: "completed",
          bytesIn: 1_800,
          bytesOut: step1Bytes.length,
          inputRefs: [`outputs/${step0Id}/photo_compress.jpg`],
          outputRefs: [`outputs/${step1Id}/photo_rotated.jpg`],
          progress: {
            percent: 100,
            stage: "complete",
            result: { jobId: step1Id },
          },
          completedAt: new Date(),
        },
      ]);

      const imageQueue = getQueue("image");
      await withTerminalWriteOutage(async ({ terminalWriteFailures }) => {
        const finalizeJob = await imageQueue.add(
          "pipeline-finalize",
          {
            jobId: pipelineId,
            toolId: "pipeline",
            userId: null,
            pool: "image",
            inputRefs: [],
            filename: "photo.jpg",
            settings: {},
            kind: "pipeline-finalize",
            totalSteps: 2,
          } as never,
          { jobId: pipelineId, attempts: 1 },
        );
        await vi.waitFor(
          async () => {
            expect(await finalizeJob.getState()).toBe("failed");
            expect(terminalWriteFailures()).toBeGreaterThanOrEqual(2);
          },
          {
            timeout: 30_000,
            interval: 200,
          },
        );
      });

      try {
        expect((await readJob(pipelineId)).status).toBe("processing");

        const summary = await reconcileStrandedJobs({ graceMs: 0 });
        expect(summary.outcomes.find((o) => o.jobId === pipelineId)?.resolution).toBe("recovered");

        const row = await readJob(pipelineId);
        expect(row.status).toBe("completed");
        expect(row.outputRefs).toEqual([`outputs/${pipelineId}/photo_rotated.jpg`]);
        expect(
          (await listObjects(`outputs/${pipelineId}/`)).some(
            (o) => o.key === `outputs/${pipelineId}/.result-payload.json`,
          ),
        ).toBe(true);

        const result = resultOf(row);
        expect(result.reconciled).toBe(true);
        expect(result.downloadUrl).toBe(`/api/v1/download/${pipelineId}/photo_rotated.jpg`);
        expect(result.stepsCompleted).toBe(2);
        expect(result.steps).toEqual([
          {
            step: 1,
            toolId: "compress",
            size: 1_800,
            notes: { targetKb: 2, resizedTo: { width: 600, height: 450 } },
          },
          {
            step: 2,
            toolId: "rotate",
            size: step1Bytes.length,
          },
        ]);

        const replay = buildSingleFileReplayEvent({
          jobId: pipelineId,
          status: row.status,
          progress: row.progress,
          error: row.error,
        });
        expect(replay).toMatchObject({
          jobId: pipelineId,
          type: "single",
          phase: "complete",
          percent: 100,
          stage: "complete",
          result: {
            jobId: pipelineId,
            downloadUrl: `/api/v1/download/${pipelineId}/photo_rotated.jpg`,
            reconciled: true,
            stepsCompleted: 2,
            steps: result.steps,
          },
        });
      } finally {
        await imageQueue.remove(pipelineId).catch(() => {});
      }
    });

    it("restores a batch parent row's zipFilename, fileResults, fileNotes, and progress counters when batch-finalize's terminal DB write fails", async () => {
      const parentId = await seedJob({
        status: "processing",
        toolId: "compress",
        pool: "system",
        type: "batch",
      });
      // Stale non-terminal progress (as when a child was recovered by
      // reconciliation before batch-finalize ran, or the final child's
      // fire-and-forget persistJobProgress lost the race with the outage)
      // must be superseded by batch-finalize's authoritative terminal counts.
      await db
        .update(schema.jobs)
        .set({
          progress: {
            percent: 33,
            totalFiles: 3,
            completedFiles: 1,
            failedFiles: 1,
          } as never,
          error: {
            message: "1 file(s) failed",
            details: [{ filename: "empty.jpg", error: "File is empty" }],
          },
        })
        .where(eq(schema.jobs.id, parentId));

      const child0Id = `${parentId}-f0`;
      const child1Id = `${parentId}-f1`;
      seededPrefixes.push(`outputs/${child0Id}/`, `outputs/${child1Id}/`, `outputs/${parentId}/`);
      await seedOutput(child0Id, "scan_compressed.jpg", Buffer.from("jpg-bytes-0"));
      await seedOutput(child1Id, "scan_compressed.jpg", Buffer.from("jpg-bytes-1"));

      await db.insert(schema.jobs).values([
        {
          id: child0Id,
          toolId: "compress",
          pool: "image",
          type: "batch-child",
          status: "completed",
          inputRefs: [`uploads/${child0Id}/scan.jpg`],
          outputRefs: [`outputs/${child0Id}/scan_compressed.jpg`],
          progress: {
            percent: 100,
            stage: "complete",
            result: {
              jobId: child0Id,
              targetKb: 2,
              resizedTo: { width: 480, height: 360 },
            },
          },
          completedAt: new Date(),
        },
        {
          id: child1Id,
          toolId: "compress",
          pool: "image",
          type: "batch-child",
          status: "completed",
          inputRefs: [`uploads/${child1Id}/scan.jpg`],
          outputRefs: [`outputs/${child1Id}/scan_compressed.jpg`],
          progress: {
            percent: 100,
            stage: "complete",
            result: {
              jobId: child1Id,
              targetKb: 1,
              targetMet: false,
            },
          },
          completedAt: new Date(),
        },
      ]);

      const systemQueue = getQueue("system");
      await withTerminalWriteOutage(async ({ terminalWriteFailures }) => {
        const finalizeJob = await systemQueue.add(
          "batch-finalize",
          {
            jobId: parentId,
            toolId: "compress",
            userId: null,
            pool: "system",
            inputRefs: [],
            filename: "",
            settings: { flowChildCount: 2, fileIndexMap: [1, 2] },
            kind: "batch-finalize",
            totalFiles: 3,
          } as never,
          { jobId: parentId, attempts: 1 },
        );
        await vi.waitFor(
          async () => {
            expect(await finalizeJob.getState()).toBe("failed");
            expect(terminalWriteFailures()).toBeGreaterThanOrEqual(2);
          },
          {
            timeout: 30_000,
            interval: 200,
          },
        );
      });

      const expectedZipFilename = `batch-compress-${parentId.slice(0, 8)}.zip`;
      try {
        expect((await readJob(parentId)).status).toBe("processing");

        const summary = await reconcileStrandedJobs({ graceMs: 0 });
        expect(summary.outcomes.find((o) => o.jobId === parentId)?.resolution).toBe("recovered");

        const parentRow = await readJob(parentId);
        expect(parentRow.status).toBe("completed");
        expect(parentRow.outputRefs).toEqual([`outputs/${parentId}/${expectedZipFilename}`]);
        expect((await listObjects(`outputs/${parentId}/`)).map((o) => o.key).sort()).toEqual([
          `outputs/${parentId}/.result-payload.json`,
          `outputs/${parentId}/${expectedZipFilename}`,
        ]);

        const replay = buildBatchReplayEvent({
          jobId: parentId,
          status: parentRow.status,
          progress: parentRow.progress,
          error: parentRow.error,
        });
        expect(replay).toEqual({
          jobId: parentId,
          type: "batch",
          status: "completed",
          totalFiles: 3,
          completedFiles: 3,
          failedFiles: 1,
          errors: [{ filename: "empty.jpg", error: "File is empty" }],
          result: {
            jobId: parentId,
            downloadUrl: `/api/v1/download/${parentId}/${expectedZipFilename}`,
            zipFilename: expectedZipFilename,
            fileResults: {
              "1": "scan_compressed.jpg",
              "2": "scan_compressed_1.jpg",
            },
            fileNotes: {
              "1": { targetKb: 2, resizedTo: { width: 480, height: 360 } },
              "2": { targetKb: 1, targetMet: false },
            },
            originalSize: 0,
            processedSize: expect.any(Number),
            reconciled: true,
          },
        });
      } finally {
        await systemQueue.remove(parentId).catch(() => {});
      }
    });

    it("restores a partially canceled batch parent row when cancelBatchJob's terminal DB write fails", async () => {
      const parentId = await seedJob({
        status: "processing",
        toolId: "compress",
        pool: "system",
        type: "batch",
      });
      await db
        .update(schema.jobs)
        .set({
          progress: {
            percent: 100,
            totalFiles: 2,
            completedFiles: 2,
            failedFiles: 1,
          } as never,
          error: {
            message: "1 file(s) failed",
            details: [{ filename: "b.jpg", error: "Canceled" }],
          },
        })
        .where(eq(schema.jobs.id, parentId));

      const child0Id = `${parentId}-f0`;
      const child1Id = `${parentId}-f1`;
      seededPrefixes.push(`outputs/${child0Id}/`, `outputs/${parentId}/`);
      await seedOutput(child0Id, "a_compress.jpg", Buffer.from("jpg-bytes-0"));

      await db.insert(schema.jobs).values([
        {
          id: child0Id,
          toolId: "compress",
          pool: "image",
          type: "batch-child",
          status: "completed",
          inputRefs: [`uploads/${child0Id}/a.jpg`],
          outputRefs: [`outputs/${child0Id}/a_compress.jpg`],
          progress: {
            percent: 100,
            stage: "complete",
            result: { jobId: child0Id },
          },
          completedAt: new Date(),
        },
        {
          id: child1Id,
          toolId: "compress",
          pool: "image",
          type: "batch-child",
          status: "canceled",
          inputRefs: [`uploads/${child1Id}/b.jpg`],
          error: { message: "Canceled" },
          completedAt: new Date(),
        },
      ]);

      const systemQueue = getQueue("system");
      await withTerminalWriteOutage(async ({ terminalWriteFailures }) => {
        const finalizeJob = await systemQueue.add(
          "batch-finalize",
          {
            jobId: parentId,
            toolId: "compress",
            userId: null,
            pool: "system",
            inputRefs: [],
            filename: "",
            settings: { flowChildCount: 2 },
            kind: "batch-finalize",
            totalFiles: 2,
          } as never,
          { jobId: parentId, attempts: 1 },
        );
        await vi.waitFor(
          async () => {
            expect(await finalizeJob.getState()).toBe("failed");
            expect(terminalWriteFailures()).toBeGreaterThanOrEqual(2);
          },
          {
            timeout: 30_000,
            interval: 200,
          },
        );
      });

      const expectedZipFilename = `batch-compress-${parentId.slice(0, 8)}.zip`;
      try {
        expect((await readJob(parentId)).status).toBe("processing");

        const summary = await reconcileStrandedJobs({ graceMs: 0 });
        expect(summary.outcomes.find((o) => o.jobId === parentId)?.resolution).toBe("recovered");

        const parentRow = await readJob(parentId);
        const replay = buildBatchReplayEvent({
          jobId: parentId,
          status: parentRow.status,
          progress: parentRow.progress,
          error: parentRow.error,
        });
        expect(replay).toEqual({
          jobId: parentId,
          type: "batch",
          status: "completed",
          totalFiles: 2,
          completedFiles: 2,
          failedFiles: 1,
          errors: [{ filename: "b.jpg", error: "Canceled" }],
          result: {
            jobId: parentId,
            downloadUrl: `/api/v1/download/${parentId}/${expectedZipFilename}`,
            zipFilename: expectedZipFilename,
            fileResults: {
              "0": "a_compress.jpg",
            },
            fileNotes: {},
            originalSize: 0,
            processedSize: expect.any(Number),
            reconciled: true,
          },
        });
      } finally {
        await systemQueue.remove(parentId).catch(() => {});
      }
    });

    it("ignores missing or negative batch progress counters when recovering a batch parent row", async () => {
      const nullProgressId = await seedJob({
        status: "processing",
        toolId: "compress",
        pool: "system",
        type: "batch",
      });
      await seedOutput(nullProgressId, "batch-compress.zip", Buffer.from("PK-bytes"));
      await seedOutput(
        nullProgressId,
        ".result-payload.json",
        Buffer.from(
          JSON.stringify({
            zipFilename: "batch-compress.zip",
            fileResults: { "0": "a.jpg" },
            fileNotes: {},
          }),
          "utf8",
        ),
      );

      const badCountsId = await seedJob({
        status: "processing",
        toolId: "compress",
        pool: "system",
        type: "batch",
      });
      await db
        .update(schema.jobs)
        .set({
          progress: {
            percent: 50,
            totalFiles: -1,
            completedFiles: "two",
            failedFiles: 1,
          } as never,
        })
        .where(eq(schema.jobs.id, badCountsId));
      await seedOutput(badCountsId, "batch-compress.zip", Buffer.from("PK-bytes"));

      const summary = await reconcileStrandedJobs({ graceMs: 0 });
      expect(summary.outcomes.find((o) => o.jobId === nullProgressId)?.resolution).toBe(
        "recovered",
      );
      expect(summary.outcomes.find((o) => o.jobId === badCountsId)?.resolution).toBe("recovered");

      const nullProgressRow = await readJob(nullProgressId);
      expect(nullProgressRow.progress).toMatchObject({
        percent: 100,
        stage: "complete",
        result: {
          jobId: nullProgressId,
          zipFilename: "batch-compress.zip",
          fileResults: { "0": "a.jpg" },
          fileNotes: {},
          reconciled: true,
        },
      });
      expect(
        (nullProgressRow.progress as Record<string, unknown> | null)?.totalFiles,
      ).toBeUndefined();

      const badCountsRow = await readJob(badCountsId);
      const badCountsProgress = badCountsRow.progress as Record<string, unknown> | null;
      expect(badCountsProgress?.totalFiles).toBeUndefined();
      expect(badCountsProgress?.completedFiles).toBeUndefined();
      expect(badCountsProgress?.failedFiles).toBe(1);
    });
  });

  describe("storage fault resilience (#1498)", () => {
    const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

    it.skipIf(isRoot)(
      "leaves a stranded row with an unreadable output dir non-terminal while still reconciling sibling rows, then recovers it once permissions are restored",
      async () => {
        const lockedId = await seedJob({ status: "processing" });
        await seedOutput(lockedId, "finished.avif", Buffer.from("avif-bytes-on-disk"));
        const siblingRecoveredId = await seedJob({ status: "processing" });
        await seedOutput(siblingRecoveredId, "sibling.avif", Buffer.from("sibling-bytes"));
        const siblingFailedId = await seedJob({ status: "queued" });

        const lockedDir = join(env.WORKSPACE_PATH, "outputs", lockedId);
        await chmod(lockedDir, 0o000);
        const errorSpy = vi.spyOn(logger, "error");
        try {
          const first = await reconcileStrandedJobs({ graceMs: 0 });
          expect(first.outcomes.find((o) => o.jobId === lockedId)).toBeUndefined();
          expect(first.outcomes.find((o) => o.jobId === siblingRecoveredId)?.resolution).toBe(
            "recovered",
          );
          expect(first.outcomes.find((o) => o.jobId === siblingFailedId)?.resolution).toBe(
            "failed",
          );
          expect(
            (await readJob(lockedId)).status,
            "an unreadable output dir must not permanently fail a job whose output is on disk",
          ).toBe("processing");
          expect(
            errorSpy.mock.calls.some(
              ([ctx, msg]) =>
                (ctx as { jobId?: string } | undefined)?.jobId === lockedId &&
                msg === "Failed to reconcile stranded job row; leaving non-terminal for next sweep",
            ),
          ).toBe(true);
        } finally {
          errorSpy.mockRestore();
          await chmod(lockedDir, 0o755);
        }

        const second = await reconcileStrandedJobs({ graceMs: 0 });
        expect(second.outcomes.find((o) => o.jobId === lockedId)?.resolution).toBe("recovered");
        const recoveredRow = await readJob(lockedId);
        expect(recoveredRow.status).toBe("completed");
        expect(recoveredRow.outputRefs).toEqual([`outputs/${lockedId}/finished.avif`]);
      },
    );

    it("leaves a stranded row non-terminal on a simulated EIO from listObjects regardless of UID", async () => {
      const eioId = await seedJob({ status: "processing" });
      await seedOutput(eioId, "finished.avif", Buffer.from("avif-bytes-on-disk"));
      const siblingId = await seedJob({ status: "processing" });
      await seedOutput(siblingId, "sibling.avif", Buffer.from("sibling-bytes"));

      const origList = objectStorage.listObjects;
      const listSpy = vi.spyOn(objectStorage, "listObjects").mockImplementation(async (prefix) => {
        if (prefix === `outputs/${eioId}/`) {
          throw Object.assign(new Error("EIO: i/o error, scandir"), {
            code: "EIO",
            syscall: "scandir",
          });
        }
        return origList(prefix);
      });
      const errorSpy = vi.spyOn(logger, "error");
      try {
        const first = await reconcileStrandedJobs({ graceMs: 0 });
        expect(first.outcomes.find((o) => o.jobId === eioId)).toBeUndefined();
        expect(first.outcomes.find((o) => o.jobId === siblingId)?.resolution).toBe("recovered");
        expect((await readJob(eioId)).status).toBe("processing");
        expect(
          errorSpy.mock.calls.some(
            ([ctx, msg]) =>
              (ctx as { jobId?: string } | undefined)?.jobId === eioId &&
              msg === "Failed to reconcile stranded job row; leaving non-terminal for next sweep",
          ),
        ).toBe(true);
      } finally {
        listSpy.mockRestore();
        errorSpy.mockRestore();
      }

      const second = await reconcileStrandedJobs({ graceMs: 0 });
      expect(second.outcomes.find((o) => o.jobId === eioId)?.resolution).toBe("recovered");
      expect((await readJob(eioId)).status).toBe("completed");
    });
  });

  describe("periodic orphaned-job reconciliation (#1726)", () => {
    it("fails old tool_id-less processing/queued rows and leaves fresh, terminal, or tool_id-bearing rows untouched", async () => {
      const user = await createUserAndLogin(testApp.app, `orphan-reconcile-${Date.now()}`);
      const oldOwnedBatchId = await seedJob({
        userId: user.userId,
        toolId: null,
        pool: null,
        type: "batch",
        status: "processing",
        ageMs: 61 * 60_000,
      });
      const oldEmptyToolQueuedId = await seedJob({
        userId: null,
        toolId: "",
        pool: null,
        type: "batch",
        status: "queued",
        ageMs: 65 * 60_000,
      });
      const freshOwnedBatchId = await seedJob({
        userId: user.userId,
        toolId: null,
        pool: null,
        type: "batch",
        status: "processing",
        ageMs: 59 * 60_000,
      });
      const freshEmptyToolQueuedId = await seedJob({
        userId: null,
        toolId: "",
        pool: null,
        type: "batch",
        status: "queued",
        ageMs: 59 * 60_000,
      });
      const oldLiveToolId = await seedJob({
        userId: user.userId,
        toolId: "convert",
        pool: "image",
        type: "tool",
        status: "processing",
        ageMs: 65 * 60_000,
      });
      const oldCompletedId = await seedJob({
        userId: user.userId,
        toolId: null,
        pool: null,
        type: "batch",
        status: "completed",
        ageMs: 120 * 60_000,
      });
      const oldFailedId = await seedJob({
        userId: user.userId,
        toolId: null,
        pool: null,
        type: "batch",
        status: "failed",
        ageMs: 120 * 60_000,
      });
      await db
        .update(schema.jobs)
        .set({ error: { message: "1 file(s) failed" } })
        .where(eq(schema.jobs.id, oldFailedId));
      const oldFailedBefore = await readJob(oldFailedId);
      const oldCanceledId = await seedJob({
        userId: user.userId,
        toolId: null,
        pool: null,
        type: "batch",
        status: "canceled",
        ageMs: 120 * 60_000,
      });

      const queue = getQueue("image");
      await queue.add("convert", { jobId: oldLiveToolId } as never, {
        jobId: oldLiveToolId,
        delay: 10 * 60_000,
      });
      const infoSpy = vi.spyOn(logger, "info");
      try {
        const result = (await runSystemJob({
          name: SYSTEM_JOBS.jobReconciliation,
        } as unknown as Job)) as { orphaned?: number; live?: number };
        expect(result.orphaned).toBe(2);
        expect(result.live).toBeGreaterThanOrEqual(1);
        expect(infoSpy).toHaveBeenCalledWith({ count: 2 }, "Reconciled orphaned job rows");

        const oldBatchRow = await readJob(oldOwnedBatchId);
        expect(oldBatchRow.status).toBe("failed");
        expect(oldBatchRow.error).toEqual({ message: "Orphaned job reconciled" });
        expect(oldBatchRow.completedAt).not.toBeNull();

        const oldEmptyToolRow = await readJob(oldEmptyToolQueuedId);
        expect(oldEmptyToolRow.status).toBe("failed");
        expect(oldEmptyToolRow.error).toEqual({ message: "Orphaned job reconciled" });
        expect(oldEmptyToolRow.completedAt).not.toBeNull();

        const freshBatchRow = await readJob(freshOwnedBatchId);
        expect(freshBatchRow.status).toBe("processing");
        expect(freshBatchRow.error).toBeNull();
        expect(freshBatchRow.completedAt).toBeNull();

        const freshEmptyToolRow = await readJob(freshEmptyToolQueuedId);
        expect(freshEmptyToolRow.status).toBe("queued");
        expect(freshEmptyToolRow.error).toBeNull();
        expect(freshEmptyToolRow.completedAt).toBeNull();

        const oldLiveToolRow = await readJob(oldLiveToolId);
        expect(oldLiveToolRow.status).toBe("processing");
        expect(oldLiveToolRow.error).toBeNull();

        expect((await readJob(oldCompletedId)).status).toBe("completed");
        expect((await readJob(oldCanceledId)).status).toBe("canceled");
        const oldFailedAfter = await readJob(oldFailedId);
        expect(oldFailedAfter.status).toBe("failed");
        expect(oldFailedAfter.error).toEqual({ message: "1 file(s) failed" });
        expect(oldFailedAfter.completedAt?.getTime()).toBe(oldFailedBefore.completedAt?.getTime());

        infoSpy.mockClear();
        const secondResult = (await runSystemJob({
          name: SYSTEM_JOBS.jobReconciliation,
        } as unknown as Job)) as { orphaned?: number };
        expect(secondResult.orphaned).toBe(0);
        expect(infoSpy).not.toHaveBeenCalledWith(expect.anything(), "Reconciled orphaned job rows");
      } finally {
        infoSpy.mockRestore();
        await queue.remove(oldLiveToolId).catch(() => {});
      }
    });

    it("unblocks a user locked out by maxConcurrentJobsPerUser after an inline batch's terminal write was lost", async () => {
      const user = await createUserAndLogin(testApp.app, `orphan-slot-${Date.now()}`);
      const stuckBatchId = await seedJob({
        userId: user.userId,
        toolId: null,
        pool: null,
        type: "batch",
        status: "processing",
        ageMs: 61 * 60_000,
      });

      await db
        .insert(schema.settings)
        .values({ key: "maxConcurrentJobsPerUser", value: "1" })
        .onConflictDoUpdate({ target: schema.settings.key, set: { value: "1" } });

      try {
        const png = await noiseJpeg(32, 32);
        const makePayload = () =>
          createMultipartPayload([
            { name: "file", filename: "photo.jpg", contentType: "image/jpeg", content: png },
            { name: "settings", content: JSON.stringify({ width: 16 }) },
          ]);

        // Precondition: the stuck tool_id-less batch row blocks the user with 429.
        const blockedPayload = makePayload();
        const blocked = await testApp.app.inject({
          method: "POST",
          url: "/api/v1/tools/image/resize",
          headers: {
            "content-type": blockedPayload.contentType,
            authorization: `Bearer ${user.token}`,
          },
          body: blockedPayload.body,
        });
        expect(blocked.statusCode).toBe(429);

        await runSystemJob({ name: SYSTEM_JOBS.jobReconciliation } as unknown as Job);
        expect((await readJob(stuckBatchId)).status).toBe("failed");

        // Slot is now free: the user can run tools again without a server restart.
        const unblockedPayload = makePayload();
        const unblocked = await testApp.app.inject({
          method: "POST",
          url: "/api/v1/tools/image/resize",
          headers: {
            "content-type": unblockedPayload.contentType,
            authorization: `Bearer ${user.token}`,
          },
          body: unblockedPayload.body,
        });
        expect([200, 202]).toContain(unblocked.statusCode);
      } finally {
        await db
          .update(schema.settings)
          .set({ value: "0" })
          .where(eq(schema.settings.key, "maxConcurrentJobsPerUser"));
      }
    });

    it("resets created_at when re-pointing a clientJobId alias row and skips alias rows whose target job is still non-terminal (#2807)", async () => {
      const user = await createUserAndLogin(testApp.app, `orphan-alias-${Date.now()}`);
      const backdatedCreatedAt = new Date(Date.now() - 65 * 60_000);

      // 1. Re-pointed single-tool alias row: first run settled >1h ago, then re-pointed to a new live run.
      const firstRunJobId = await seedJob({
        userId: user.userId,
        toolId: "convert",
        pool: "image",
        type: "tool",
        status: "completed",
        ageMs: 65 * 60_000,
      });
      const repointedClientJobId = randomUUID();
      await upsertToolJobAlias({
        jobId: firstRunJobId,
        clientJobId: repointedClientJobId,
        userId: user.userId,
        pool: "image",
      });
      await db
        .update(schema.jobs)
        .set({
          status: "completed",
          createdAt: backdatedCreatedAt,
          completedAt: backdatedCreatedAt,
        })
        .where(eq(schema.jobs.id, repointedClientJobId));

      // Second stamp with the SAME jobId must NOT reset created_at.
      await upsertToolJobAlias({
        jobId: firstRunJobId,
        clientJobId: repointedClientJobId,
        userId: user.userId,
        pool: "image",
      });
      expect((await readJob(repointedClientJobId)).createdAt.getTime()).toBe(
        backdatedCreatedAt.getTime(),
      );

      // Re-pointing to a fresh jobId MUST reset created_at to now().
      const secondRunJobId = await seedJob({
        userId: user.userId,
        toolId: "convert",
        pool: "image",
        type: "tool",
        status: "queued",
        ageMs: 0,
      });
      const beforeRepointMs = Date.now() - 5_000;
      await upsertToolJobAlias({
        jobId: secondRunJobId,
        clientJobId: repointedClientJobId,
        userId: user.userId,
        pool: "image",
      });
      const repointedBeforeSweep = await readJob(repointedClientJobId);
      expect(repointedBeforeSweep.status).toBe("queued");
      expect(repointedBeforeSweep.createdAt.getTime()).toBeGreaterThanOrEqual(beforeRepointMs);

      // 2. Long-running (>1h) single-tool alias row whose target artifactJobId is still live in BullMQ.
      const longToolJobId = await seedJob({
        userId: user.userId,
        toolId: "convert",
        pool: "image",
        type: "tool",
        status: "processing",
        ageMs: 65 * 60_000,
      });
      const longToolAliasId = randomUUID();
      await upsertToolJobAlias({
        jobId: longToolJobId,
        clientJobId: longToolAliasId,
        userId: user.userId,
        pool: "image",
      });
      await db
        .update(schema.jobs)
        .set({ status: "processing", createdAt: backdatedCreatedAt })
        .where(eq(schema.jobs.id, longToolAliasId));

      // 3. Long-running (>1h) pipeline alias row whose target pipelineFlowId is still live in BullMQ.
      const longPipelineFlowId = await seedJob({
        userId: user.userId,
        toolId: "pipeline",
        pool: "image",
        type: "pipeline",
        status: "processing",
        ageMs: 65 * 60_000,
      });
      const longPipelineAliasId = randomUUID();
      await db.insert(schema.jobs).values({
        id: longPipelineAliasId,
        userId: user.userId,
        pool: "image",
        type: "single",
        status: "processing",
        inputRefs: [],
        settings: { pipelineFlowId: longPipelineFlowId },
        createdAt: backdatedCreatedAt,
      });

      // 4. Dangling (>1h) pre-enqueue alias row whose target artifactJobId was never inserted.
      const danglingAliasId = randomUUID();
      await upsertToolJobAlias({
        jobId: randomUUID(),
        clientJobId: danglingAliasId,
        userId: user.userId,
        pool: "image",
      });
      await db
        .update(schema.jobs)
        .set({ createdAt: backdatedCreatedAt })
        .where(eq(schema.jobs.id, danglingAliasId));

      // 5. Stuck (>1h) pipeline alias row whose target pipelineFlowId already settled.
      const settledPipelineFlowId = await seedJob({
        userId: user.userId,
        toolId: "pipeline",
        pool: "image",
        type: "pipeline",
        status: "completed",
        ageMs: 65 * 60_000,
      });
      const settledPipelineAliasId = randomUUID();
      await db.insert(schema.jobs).values({
        id: settledPipelineAliasId,
        userId: user.userId,
        pool: "image",
        type: "single",
        status: "processing",
        inputRefs: [],
        settings: { pipelineFlowId: settledPipelineFlowId },
        createdAt: backdatedCreatedAt,
      });

      // 6. Colliding (>1h) non-single batch row carrying artifactJobId in settings: must still be reconciled.
      const nonSingleBatchId = randomUUID();
      await db.insert(schema.jobs).values({
        id: nonSingleBatchId,
        userId: user.userId,
        type: "batch",
        status: "processing",
        inputRefs: [],
        settings: { artifactJobId: longToolJobId },
        createdAt: backdatedCreatedAt,
      });

      // 7. Self-referential (>1h) tool_id-less single row: target has no tool_id, so it must still be reconciled.
      const selfRefAliasId = randomUUID();
      await db.insert(schema.jobs).values({
        id: selfRefAliasId,
        userId: user.userId,
        type: "single",
        status: "processing",
        inputRefs: [],
        settings: { artifactJobId: selfRefAliasId },
        createdAt: backdatedCreatedAt,
      });

      // 8. Alias row (>1h) pointing at an empty-string tool_id row: target.tool_id <> '' must exclude it.
      const emptyToolTargetId = await seedJob({
        userId: user.userId,
        toolId: "",
        pool: null,
        type: "tool",
        status: "processing",
        ageMs: 65 * 60_000,
      });
      const emptyToolAliasId = randomUUID();
      await db.insert(schema.jobs).values({
        id: emptyToolAliasId,
        userId: user.userId,
        type: "single",
        status: "processing",
        inputRefs: [],
        settings: { artifactJobId: emptyToolTargetId },
        createdAt: backdatedCreatedAt,
      });

      // 9. Stranded (>1h) recoverable tool job and its (>1h) alias row: reconcileStrandedJobs() runs first
      // inside SYSTEM_JOBS.jobReconciliation and must recover both to completed rather than the orphan
      // UPDATE failing the alias row.
      const recoverableStrandedJobId = await seedJob({
        userId: user.userId,
        toolId: "convert",
        pool: "image",
        type: "tool",
        status: "processing",
        ageMs: 65 * 60_000,
      });
      await seedOutput(recoverableStrandedJobId, "recovered.avif", Buffer.from("avif-bytes"));
      const recoverableStrandedAliasId = randomUUID();
      await upsertToolJobAlias({
        jobId: recoverableStrandedJobId,
        clientJobId: recoverableStrandedAliasId,
        userId: user.userId,
        pool: "image",
      });
      await db
        .update(schema.jobs)
        .set({ status: "processing", createdAt: backdatedCreatedAt })
        .where(eq(schema.jobs.id, recoverableStrandedAliasId));

      const queue = getQueue("image");
      await queue.add("convert", { jobId: secondRunJobId } as never, {
        jobId: secondRunJobId,
        delay: 10 * 60_000,
      });
      await queue.add("convert", { jobId: longToolJobId } as never, {
        jobId: longToolJobId,
        delay: 10 * 60_000,
      });
      await queue.add("pipeline-finalize", { jobId: longPipelineFlowId } as never, {
        jobId: longPipelineFlowId,
        delay: 10 * 60_000,
      });

      try {
        await runSystemJob({ name: SYSTEM_JOBS.jobReconciliation } as unknown as Job);

        expect((await readJob(repointedClientJobId)).status).toBe("queued");
        expect((await readJob(longToolAliasId)).status).toBe("processing");
        expect((await readJob(longPipelineAliasId)).status).toBe("processing");

        const danglingAfter = await readJob(danglingAliasId);
        expect(danglingAfter.status).toBe("failed");
        expect(danglingAfter.error).toEqual({ message: "Orphaned job reconciled" });

        const settledPipelineAliasAfter = await readJob(settledPipelineAliasId);
        expect(settledPipelineAliasAfter.status).toBe("failed");
        expect(settledPipelineAliasAfter.error).toEqual({ message: "Orphaned job reconciled" });

        const nonSingleBatchAfter = await readJob(nonSingleBatchId);
        expect(nonSingleBatchAfter.status).toBe("failed");
        expect(nonSingleBatchAfter.error).toEqual({ message: "Orphaned job reconciled" });

        const selfRefAfter = await readJob(selfRefAliasId);
        expect(selfRefAfter.status).toBe("failed");
        expect(selfRefAfter.error).toEqual({ message: "Orphaned job reconciled" });

        const emptyToolAliasAfter = await readJob(emptyToolAliasId);
        expect(emptyToolAliasAfter.status).toBe("failed");
        expect(emptyToolAliasAfter.error).toEqual({ message: "Orphaned job reconciled" });

        const recoveredAliasAfter = await readJob(recoverableStrandedAliasId);
        expect(recoveredAliasAfter.status).toBe("completed");
        expect(recoveredAliasAfter.error).toBeNull();
        expect(resultOf(recoveredAliasAfter).downloadUrl).toBe(
          `/api/v1/download/${recoverableStrandedJobId}/recovered.avif`,
        );
      } finally {
        await queue.remove(secondRunJobId).catch(() => {});
        await queue.remove(longToolJobId).catch(() => {});
        await queue.remove(longPipelineFlowId).catch(() => {});
      }
    });
  });
});
