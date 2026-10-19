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
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { db, schema } from "../../../apps/api/src/db/index.js";
import {
  reconcileStrandedJobs,
  UNRECOVERABLE_STRANDED_JOB_ERROR,
} from "../../../apps/api/src/jobs/job-reconciliation.js";
import { getQueue } from "../../../apps/api/src/jobs/queues.js";
import { SYSTEM_JOBS } from "../../../apps/api/src/jobs/system-jobs.js";
import { logger } from "../../../apps/api/src/lib/logger.js";
import * as objectStorage from "../../../apps/api/src/lib/object-storage.js";
import { deletePrefix, listObjects, putObject } from "../../../apps/api/src/lib/object-storage.js";
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

  describe("tool resultPayload preservation (#1389)", () => {
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
    async function withTerminalWriteOutage<T>(fn: () => Promise<T>): Promise<T> {
      const origUpdate = db.update.bind(db);
      const txSpy = vi
        .spyOn(db, "transaction")
        .mockRejectedValue(new Error("simulated Postgres outage on terminal transaction"));
      const updateSpy = vi.spyOn(db, "update").mockImplementation(((table: unknown) => {
        const builder = origUpdate(table as never);
        const origSet = builder.set.bind(builder);
        builder.set = ((values: Record<string, unknown>) => {
          if (values.status === "completed" || values.status === "failed") {
            return {
              where: () =>
                Promise.reject(new Error("simulated Postgres outage on terminal status update")),
            } as never;
          }
          return origSet(values as never);
        }) as typeof builder.set;
        return builder;
      }) as typeof db.update);
      try {
        return await fn();
      } finally {
        txSpy.mockRestore();
        updateSpy.mockRestore();
      }
    }

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

    it("propagates a storage read fault on the sidecar rather than completing the row without its payload", async () => {
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
      try {
        await expect(reconcileStrandedJobs({ graceMs: 0 })).rejects.toThrow("EIO: i/o error, read");
        expect(
          (await readJob(id)).status,
          "row must stay non-terminal so the next sweep retries",
        ).toBe("processing");
      } finally {
        readSpy.mockRestore();
      }

      const summary = await reconcileStrandedJobs({ graceMs: 0 });
      expect(summary.outcomes.find((o) => o.jobId === id)?.resolution).toBe("recovered");
      expect(resultOf(await readJob(id)).resizedTo).toEqual({ width: 100, height: 80 });
    });
  });
});
