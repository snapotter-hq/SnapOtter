/**
 * A storage fault partway through a multi-file pdf-to-image run (#1443).
 *
 * The inline batch route publishes `processing` frames to a progress row the
 * client watches over SSE, then rethrows any status-bearing error (today the
 * local workspace-cap and disk-free-floor SafeErrors) so it is answered with
 * its own status. That rethrow skipped the route's terminal frame, so the row
 * stayed `processing` and the SSE stream never ended; only the boot-time
 * placeholder cleanup ever settled it.
 */
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../../../../apps/api/src/config.js";
import { db, schema } from "../../../../apps/api/src/db/index.js";
import { sharedRedis } from "../../../../apps/api/src/jobs/connection.js";
import { bullPrefix } from "../../../../apps/api/src/jobs/types.js";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  preReadyHooks,
  type TestApp,
} from "../../test-server.js";

const faults = vi.hoisted(() => ({
  /** Object keys (or key prefixes) whose putObject fails with a 503. */
  poison: new Set<string>(),
  /** Optional custom error factory for poisoned putObject calls (#1552). */
  poisonError: null as (() => unknown) | null,
  /** Object keys (or key prefixes) whose getObjectStream fails on read. */
  streamPoison: new Set<string>(),
  /** Optional custom S3 mid-stream error factory for poisoned getObjectStream calls (#3651). */
  s3StreamPoisonError: null as (() => Error) | null,
  /** When set, the route's failBatchJob call rejects. */
  settleFails: false,
  /** Job id whose row is marked terminal right before a fault, so failBatchJob returns false. */
  retireRowBeforeFault: null as string | null,
  /** Object keys (or prefixes) where reply.raw emits an error mid-stream (#2764). */
  replyErrorOnStream: new Set<string>(),
  /** When set, reply.raw emits an error while failBatchJob is awaiting (#2764). */
  replyErrorDuringSettle: false,
  /** When set, reply.raw also emits an error while deletePrefix is awaiting (#2764). */
  replyErrorDuringCleanup: false,
}));

const warnLogs: Array<{ bindings: unknown; msg: string }> = [];
let currentReplyRaw: (NodeJS.EventEmitter & { destroy: (err?: Error) => void }) | null = null;

preReadyHooks.push((app) => {
  app.addHook(
    "onRequest",
    (
      request: { log: { warn: (...args: unknown[]) => unknown } },
      reply: { raw: NodeJS.EventEmitter & { destroy: (err?: Error) => void } },
      done: () => void,
    ) => {
      currentReplyRaw = reply.raw;
      const origWarn = request.log.warn.bind(request.log);
      request.log.warn = (objOrMsg: unknown, msg?: unknown) => {
        if (typeof objOrMsg === "string") {
          warnLogs.push({ bindings: {}, msg: objOrMsg });
        } else {
          warnLogs.push({ bindings: objOrMsg, msg: typeof msg === "string" ? msg : "" });
        }
        return origWarn(objOrMsg, msg);
      };
      done();
    },
  );
});

vi.mock("../../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../apps/api/src/lib/object-storage.js")>();
  const { Readable } = await import("node:stream");
  const { SafeError } = await import("@snapotter/shared");
  return {
    ...actual,
    putObject: async (key: string, data: Buffer) => {
      for (const prefix of faults.poison) {
        if (key.startsWith(prefix)) {
          if (faults.retireRowBeforeFault) {
            await db
              .update(schema.jobs)
              .set({ status: "canceled", completedAt: new Date() })
              .where(eq(schema.jobs.id, faults.retireRowBeforeFault));
          }
          if (faults.poisonError) {
            throw faults.poisonError();
          }
          throw new SafeError("Workspace storage limit reached", {
            kind: "operational",
            code: "workspace-cap",
            statusCode: 503,
          });
        }
      }
      return actual.putObject(key, data);
    },
    getObjectStream: async (key: string) => {
      for (const prefix of faults.replyErrorOnStream) {
        if (key.startsWith(prefix)) {
          return new Readable({
            read() {
              queueMicrotask(() => {
                currentReplyRaw?.emit("error", new Error(`test poison: reply error for ${key}`));
              });
            },
          });
        }
      }
      for (const prefix of faults.streamPoison) {
        if (key.startsWith(prefix)) {
          if (faults.retireRowBeforeFault) {
            await db
              .update(schema.jobs)
              .set({ status: "canceled", completedAt: new Date() })
              .where(eq(schema.jobs.id, faults.retireRowBeforeFault));
          }
          if (faults.s3StreamPoisonError) {
            const makeErr = faults.s3StreamPoisonError;
            return Readable.from(
              (async function* () {
                yield Buffer.from("partial-zip-bytes");
                (env as { STORAGE_MODE: string }).STORAGE_MODE = "s3";
                throw makeErr();
              })(),
            );
          }
          return new Readable({
            read() {
              this.destroy(new Error(`test poison: stream error for ${key}`));
            },
          });
        }
      }
      return actual.getObjectStream(key);
    },
    deletePrefix: async (prefix: string) => {
      (env as { STORAGE_MODE: string }).STORAGE_MODE = "local";
      if (faults.replyErrorDuringCleanup) {
        faults.replyErrorDuringCleanup = false;
        await new Promise<void>((resolve) => {
          queueMicrotask(() => {
            currentReplyRaw?.emit("error", new Error("test poison: reply error during cleanup"));
            resolve();
          });
        });
      }
      return actual.deletePrefix(prefix);
    },
  };
});

vi.mock("../../../../apps/api/src/routes/progress.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../apps/api/src/routes/progress.js")>();
  return {
    ...actual,
    updateJobProgress: async (progress: Parameters<typeof actual.updateJobProgress>[0]) => {
      if (progress.status === "failed" && faults.retireRowBeforeFault === progress.jobId) {
        await db
          .update(schema.jobs)
          .set({ status: "canceled", completedAt: new Date() })
          .where(eq(schema.jobs.id, faults.retireRowBeforeFault));
      }
      return actual.updateJobProgress(progress);
    },
    failBatchJob: async (...args: Parameters<typeof actual.failBatchJob>) => {
      if (faults.retireRowBeforeFault === args[0].jobId) {
        await db
          .update(schema.jobs)
          .set({ status: "canceled", completedAt: new Date() })
          .where(eq(schema.jobs.id, faults.retireRowBeforeFault));
      }
      if (faults.replyErrorDuringSettle) {
        faults.replyErrorDuringSettle = false;
        await new Promise<void>((resolve) => {
          queueMicrotask(() => {
            currentReplyRaw?.emit("error", new Error("test poison: reply error during settle"));
            resolve();
          });
        });
      }
      if (faults.settleFails) throw new Error("settle write failed");
      return actual.failBatchJob(...args);
    },
  };
});

const PDF_3PAGE = readFixture(fixtures.document.pdf3);
const PDF_2PAGE = readFixture(fixtures.document.pdf2);

let testApp: TestApp;
let token: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  token = await loginAsAdmin(testApp.app);
});

afterEach(() => {
  (env as { STORAGE_MODE: string }).STORAGE_MODE = "local";
  faults.poison.clear();
  faults.poisonError = null;
  faults.streamPoison.clear();
  faults.s3StreamPoisonError = null;
  faults.settleFails = false;
  faults.retireRowBeforeFault = null;
  faults.replyErrorOnStream.clear();
  faults.replyErrorDuringSettle = false;
  faults.replyErrorDuringCleanup = false;
  currentReplyRaw = null;
  warnLogs.length = 0;
});

afterAll(async () => {
  await testApp.cleanup();
});

function postBatch(clientJobId: string) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "a.pdf", contentType: "application/pdf", content: PDF_3PAGE },
    { name: "file", filename: "b.pdf", contentType: "application/pdf", content: PDF_2PAGE },
    { name: "settings", content: JSON.stringify({ dpi: 72 }) },
    { name: "clientJobId", content: clientJobId },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/pdf/pdf-to-jpg/batch",
    body,
    headers: { "content-type": contentType, authorization: `Bearer ${token}` },
  });
}

async function readRow(id: string) {
  const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  return row;
}

async function objectsUnder(prefix: string) {
  const { listObjects } = await import("../../../../apps/api/src/lib/object-storage.js");
  return listObjects(prefix);
}

async function waitForReplyDestroy() {
  for (let i = 0; i < 100 && !(currentReplyRaw as { destroyed?: boolean } | null)?.destroyed; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe("pdf-to-image batch storage fault (#1443)", () => {
  it("settles the progress row as failed before answering with the fault's status", async () => {
    const clientJobId = "batch-1443-storage-fault";
    // The second document's first write fails; the first document succeeds.
    faults.poison.add(`outputs/${clientJobId}-f1/`);

    const res = await postBatch(clientJobId);

    // Still answered with the fault's own status and code.
    expect(res.statusCode, res.body.slice(0, 300)).toBe(503);
    expect(res.json()).toMatchObject({ code: "workspace-cap" });

    // The settle is awaited before the rethrow, so the row a client replays
    // over SSE is already terminal when the response arrives.
    const row = await readRow(clientJobId);
    expect(row?.status, "the progress row was left non-terminal").toBe("failed");
    expect(row?.completedAt).not.toBeNull();
    expect(row?.error).toMatchObject({
      message: "Workspace storage limit reached",
      code: "workspace-cap",
    });

    // Nothing is sent on a fault, so the first document's rendered output is
    // only stranded storage; it's removed before the rethrow.
    expect(await objectsUnder(`outputs/${clientJobId}-f0/`)).toEqual([]);
  });

  it("also removes the faulting document's own pages when the fault hits after they were written", async () => {
    const clientJobId = "batch-1443-first-doc-fault";
    // Pages 1-3 of the first document are written; only its ZIP write fails.
    faults.poison.add(`outputs/${clientJobId}-f0/a-pages.zip`);

    const res = await postBatch(clientJobId);

    expect(res.statusCode).toBe(503);
    expect((await readRow(clientJobId))?.status).toBe("failed");
    expect(await objectsUnder(`outputs/${clientJobId}-f0/`)).toEqual([]);
  });

  it("keeps the fault's status and still cleans up when settling the row itself fails", async () => {
    const clientJobId = "batch-1443-settle-fails";
    faults.poison.add(`outputs/${clientJobId}-f1/`);
    faults.settleFails = true;

    const res = await postBatch(clientJobId);

    // The settle error is logged, never answered in place of the real fault.
    expect(res.statusCode, res.body.slice(0, 300)).toBe(503);
    expect(res.json()).toMatchObject({ code: "workspace-cap" });
    expect(await objectsUnder(`outputs/${clientJobId}-f0/`)).toEqual([]);
  });

  it("settles the progress row as failed and cleans up temporary outputs when the ZIP stream fails (#1555)", async () => {
    const clientJobId = "batch-1555-zip-stream-fault";
    faults.streamPoison.add(`outputs/${clientJobId}-f1/`);

    const outcome = await postBatch(clientJobId).then(
      (res: { statusCode: number }) => res,
      () => null,
    );
    // Destroyed chunked response either rejects inject() or leaves a truncated payload.
    expect(outcome === null || outcome.statusCode === 200).toBe(true);

    const row = await readRow(clientJobId);
    expect(row?.status, "progress row stayed completed after ZIP stream failure").toBe("failed");
    expect(row?.completedAt).not.toBeNull();
    expect(row?.error).toMatchObject({
      message: "Failed to package batch results",
      details: [{ filename: "", error: "Failed to package batch results" }],
    });

    const cached = await sharedRedis().get(`${bullPrefix()}:terminal:${clientJobId}`);
    expect(cached).not.toBeNull();
    expect(JSON.parse(cached as string)).toMatchObject({
      jobId: clientJobId,
      type: "batch",
      status: "failed",
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 0,
      errors: [{ filename: "", error: "Failed to package batch results" }],
    });

    expect(await objectsUnder(`outputs/${clientJobId}-f0/`)).toEqual([]);
    expect(await objectsUnder(`outputs/${clientJobId}-f1/`)).toEqual([]);
  });

  it("normalizes S3 mid-stream ERR_STREAM_PREMATURE_CLOSE and EIO during ZIP streaming into storage-unavailable (#3651)", async () => {
    const cases = [
      {
        clientJobId: "batch-3651-s3-premature-close",
        makeErr: () =>
          Object.assign(new Error("Premature close"), {
            code: "ERR_STREAM_PREMATURE_CLOSE",
          }),
      },
      {
        clientJobId: "batch-3651-s3-midstream-eio",
        makeErr: () =>
          Object.assign(new Error("S3 stream reset"), {
            code: "EIO",
            syscall: "read",
          }),
      },
    ];

    for (const { clientJobId, makeErr } of cases) {
      faults.streamPoison.clear();
      faults.streamPoison.add(`outputs/${clientJobId}-f1/`);
      faults.s3StreamPoisonError = makeErr;

      const outcome = await postBatch(clientJobId).then(
        (res: { statusCode: number }) => res,
        () => null,
      );
      expect(outcome === null || outcome.statusCode === 200).toBe(true);

      const row = await readRow(clientJobId);
      expect(row?.status).toBe("failed");
      expect(row?.completedAt).not.toBeNull();
      expect(row?.error).toEqual({
        message: "The server's storage service is unavailable.",
        code: "storage-unavailable",
        details: [{ filename: "", error: "The server's storage service is unavailable." }],
      });

      const cached = await sharedRedis().get(`${bullPrefix()}:terminal:${clientJobId}`);
      expect(cached).not.toBeNull();
      expect(JSON.parse(cached as string)).toMatchObject({
        jobId: clientJobId,
        type: "batch",
        status: "failed",
        totalFiles: 2,
        completedFiles: 2,
        failedFiles: 0,
        code: "storage-unavailable",
        errors: [{ filename: "", error: "The server's storage service is unavailable." }],
      });

      expect(await objectsUnder(`outputs/${clientJobId}-f0/`)).toEqual([]);
      expect(await objectsUnder(`outputs/${clientJobId}-f1/`)).toEqual([]);
    }
  });

  it("preserves per-file errors on the failed row when the ZIP stream fails on a partial batch (#1555)", async () => {
    const clientJobId = "batch-1555-partial-zip-stream-fault";
    faults.streamPoison.add(`outputs/${clientJobId}-f1/`);

    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "bad.pdf",
        contentType: "application/pdf",
        content: Buffer.from("not a pdf"),
      },
      { name: "file", filename: "b.pdf", contentType: "application/pdf", content: PDF_2PAGE },
      { name: "settings", content: JSON.stringify({ dpi: 72 }) },
      { name: "clientJobId", content: clientJobId },
    ]);
    await testApp.app
      .inject({
        method: "POST",
        url: "/api/v1/tools/pdf/pdf-to-jpg/batch",
        body,
        headers: { "content-type": contentType, authorization: `Bearer ${token}` },
      })
      .then(
        (res: unknown) => res,
        () => null,
      );

    const row = await readRow(clientJobId);
    expect(row?.status).toBe("failed");
    expect(row?.error).toMatchObject({
      message: "Failed to package batch results",
      details: [
        { filename: "bad.pdf", error: "Invalid or corrupt PDF file" },
        { filename: "", error: "Failed to package batch results" },
      ],
    });
    expect(await objectsUnder(`outputs/${clientJobId}-f1/`)).toEqual([]);
  });

  it("preserves earlier per-file errors on the failed row and terminal frame when a mid-batch storage fault hits (#2815)", async () => {
    const clientJobId = "batch-2815-partial-storage-fault";
    faults.poison.add(`outputs/${clientJobId}-f1/`);

    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "bad.pdf",
        contentType: "application/pdf",
        content: Buffer.from("not a pdf"),
      },
      { name: "file", filename: "b.pdf", contentType: "application/pdf", content: PDF_2PAGE },
      { name: "settings", content: JSON.stringify({ dpi: 72 }) },
      { name: "clientJobId", content: clientJobId },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/pdf-to-jpg/batch",
      body,
      headers: { "content-type": contentType, authorization: `Bearer ${token}` },
    });

    expect(res.statusCode, res.body.slice(0, 300)).toBe(503);
    expect(res.json()).toMatchObject({ code: "workspace-cap" });

    const row = await readRow(clientJobId);
    expect(row?.status).toBe("failed");
    expect(row?.completedAt).not.toBeNull();
    expect(row?.error).toEqual({
      message: "Workspace storage limit reached",
      code: "workspace-cap",
      details: [
        { filename: "bad.pdf", error: "Invalid or corrupt PDF file" },
        { filename: "", error: "Workspace storage limit reached" },
      ],
    });

    const cached = await sharedRedis().get(`${bullPrefix()}:terminal:${clientJobId}`);
    expect(cached).not.toBeNull();
    expect(JSON.parse(cached as string)).toMatchObject({
      jobId: clientJobId,
      type: "batch",
      status: "failed",
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 2,
      code: "workspace-cap",
      errors: [
        { filename: "bad.pdf", error: "Invalid or corrupt PDF file" },
        { filename: "", error: "Workspace storage limit reached" },
      ],
    });
    expect(await objectsUnder(`outputs/${clientJobId}-f1/`)).toEqual([]);
  });

  it("logs a warning when failBatchJob matches no live row on a storage fault (#1555)", async () => {
    const clientJobId = "batch-1555-unapplied-storage-settle";
    faults.poison.add(`outputs/${clientJobId}-f1/`);
    faults.retireRowBeforeFault = clientJobId;

    const res = await postBatch(clientJobId);

    expect(res.statusCode).toBe(503);
    expect((await readRow(clientJobId))?.status).toBe("canceled");
    expect(await objectsUnder(`outputs/${clientJobId}-f0/`)).toEqual([]);
    expect(
      warnLogs.some(
        (entry) =>
          (entry.bindings as { jobId?: string })?.jobId === clientJobId &&
          entry.msg.includes("no terminal frame announced"),
      ),
      `expected warn log for ${clientJobId}, got ${JSON.stringify(warnLogs)}`,
    ).toBe(true);
  });

  it("logs a warning when failBatchJob matches no live row on a ZIP stream fault (#1555)", async () => {
    const clientJobId = "batch-1555-unapplied-stream-settle";
    faults.streamPoison.add(`outputs/${clientJobId}-f1/`);
    faults.retireRowBeforeFault = clientJobId;

    await postBatch(clientJobId).then(
      (res: unknown) => res,
      () => null,
    );

    expect((await readRow(clientJobId))?.status).toBe("canceled");
    expect(await objectsUnder(`outputs/${clientJobId}-f0/`)).toEqual([]);
    expect(await objectsUnder(`outputs/${clientJobId}-f1/`)).toEqual([]);
    expect(
      warnLogs.some(
        (entry) =>
          (entry.bindings as { jobId?: string })?.jobId === clientJobId &&
          entry.msg.includes("no terminal frame announced"),
      ),
      `expected warn log for ${clientJobId}, got ${JSON.stringify(warnLogs)}`,
    ).toBe(true);
  });

  it("still cleans up temporary outputs and terminates the stream when settling fails after a ZIP stream fault (#1555)", async () => {
    const clientJobId = "batch-1555-stream-settle-fails";
    faults.streamPoison.add(`outputs/${clientJobId}-f1/`);
    faults.settleFails = true;

    const outcome = await postBatch(clientJobId).then(
      (res: { statusCode: number }) => res,
      () => null,
    );
    expect(outcome === null || outcome.statusCode === 200).toBe(true);
    expect(await objectsUnder(`outputs/${clientJobId}-f0/`)).toEqual([]);
    expect(await objectsUnder(`outputs/${clientJobId}-f1/`)).toEqual([]);
  });

  it("settles the progress row as failed and answers 503 on an S3 service fault mid-batch (#1552)", async () => {
    const clientJobId = "batch-1552-s3-outage";
    faults.poison.add(`outputs/${clientJobId}-f1/`);
    faults.poisonError = () => ({
      name: "ServiceUnavailable",
      $metadata: { httpStatusCode: 503 },
    });

    const res = await postBatch(clientJobId);

    expect(res.statusCode, res.body.slice(0, 300)).toBe(503);
    expect(res.json()).toMatchObject({ code: "storage-unavailable" });

    const row = await readRow(clientJobId);
    expect(row?.status).toBe("failed");
    expect(row?.completedAt).not.toBeNull();
    expect(row?.error).toMatchObject({
      message: "The server's storage service is unavailable.",
      code: "storage-unavailable",
    });
    expect(await objectsUnder(`outputs/${clientJobId}-f0/`)).toEqual([]);
  });

  it("settles the progress row as failed and answers 503 on a bare ENOSPC mid-batch (#1552)", async () => {
    const clientJobId = "batch-1552-enospc";
    faults.poison.add(`outputs/${clientJobId}-f1/`);
    faults.poisonError = () =>
      Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" });

    const res = await postBatch(clientJobId);

    expect(res.statusCode, res.body.slice(0, 300)).toBe(503);
    expect(res.json()).toMatchObject({ code: "storage-full" });

    const row = await readRow(clientJobId);
    expect(row?.status).toBe("failed");
    expect(row?.completedAt).not.toBeNull();
    expect(row?.error).toMatchObject({
      message: "The server's storage is full.",
      code: "storage-full",
    });
    expect(await objectsUnder(`outputs/${clientJobId}-f0/`)).toEqual([]);
  });

  it("masks non-SafeError 500 messages in the progress row and cached terminal frame (#2786)", async () => {
    const clientJobId = "batch-2786-unmasked-500";
    faults.poison.add(`outputs/${clientJobId}-f1/`);
    faults.poisonError = () =>
      Object.assign(new TypeError("Cannot read properties of undefined (reading 'byteLength')"), {
        statusCode: 500,
      });

    const res = await postBatch(clientJobId);

    expect(res.statusCode).toBe(500);
    const row = await readRow(clientJobId);
    expect(row?.status).toBe("failed");
    expect(row?.completedAt).not.toBeNull();
    expect(row?.error).toEqual({
      message: "Internal server error",
      details: [{ filename: "", error: "Internal server error" }],
    });

    const cached = await sharedRedis().get(`${bullPrefix()}:terminal:${clientJobId}`);
    expect(cached).not.toBeNull();
    expect(JSON.parse(cached as string)).toMatchObject({
      jobId: clientJobId,
      type: "batch",
      status: "failed",
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 2,
      errors: [{ filename: "", error: "Internal server error" }],
    });
    expect(await objectsUnder(`outputs/${clientJobId}-f0/`)).toEqual([]);
  });

  it("absorbs reply.raw errors during mid-stream failure and socket destroy without an uncaught error (#2764)", async () => {
    const clientJobId = "batch-2764-reply-error-destroy";
    faults.replyErrorOnStream.add(`outputs/${clientJobId}-f0/`);
    const uncaught = vi.fn();
    process.on("uncaughtException", uncaught);

    try {
      await postBatch(clientJobId).then(
        (res: unknown) => res,
        () => null,
      );
      await waitForReplyDestroy();

      expect(uncaught).not.toHaveBeenCalled();
      const row = await readRow(clientJobId);
      expect(row?.status).toBe("failed");
      expect(row?.completedAt).not.toBeNull();
      expect(row?.error).toMatchObject({
        message: "Failed to package batch results",
        details: [{ filename: "", error: "Failed to package batch results" }],
      });
      expect(await objectsUnder(`outputs/${clientJobId}-f0/`)).toEqual([]);
      expect(await objectsUnder(`outputs/${clientJobId}-f1/`)).toEqual([]);
    } finally {
      process.off("uncaughtException", uncaught);
    }
  });

  it("keeps reply.raw error listener attached while settlement and prefix cleanup await (#2764)", async () => {
    const clientJobId = "batch-2764-reply-error-during-cleanup";
    faults.replyErrorOnStream.add(`outputs/${clientJobId}-f0/`);
    faults.replyErrorDuringSettle = true;
    faults.replyErrorDuringCleanup = true;
    const uncaught = vi.fn();
    process.on("uncaughtException", uncaught);

    try {
      await postBatch(clientJobId).then(
        (res: unknown) => res,
        () => null,
      );
      await waitForReplyDestroy();

      expect(uncaught).not.toHaveBeenCalled();
      expect(faults.replyErrorDuringSettle).toBe(false);
      expect(faults.replyErrorDuringCleanup).toBe(false);
      const row = await readRow(clientJobId);
      expect(row?.status).toBe("failed");
      expect(await objectsUnder(`outputs/${clientJobId}-f0/`)).toEqual([]);
      expect(await objectsUnder(`outputs/${clientJobId}-f1/`)).toEqual([]);
    } finally {
      process.off("uncaughtException", uncaught);
    }
  });

  it("settles the batch as failed when reply.raw emits an error during prefix cleanup after the archive finishes (#2764)", async () => {
    const clientJobId = "batch-2764-reply-error-post-archive-cleanup";
    faults.replyErrorDuringCleanup = true;
    const uncaught = vi.fn();
    process.on("uncaughtException", uncaught);

    try {
      await postBatch(clientJobId).then(
        (res: unknown) => res,
        () => null,
      );
      await waitForReplyDestroy();

      expect(uncaught).not.toHaveBeenCalled();
      expect(faults.replyErrorDuringCleanup).toBe(false);
      const row = await readRow(clientJobId);
      expect(row?.status).toBe("failed");
      expect(row?.error).toMatchObject({
        message: "Failed to package batch results",
        details: [{ filename: "", error: "Failed to package batch results" }],
      });
      expect(await objectsUnder(`outputs/${clientJobId}-f0/`)).toEqual([]);
      expect(await objectsUnder(`outputs/${clientJobId}-f1/`)).toEqual([]);
    } finally {
      process.off("uncaughtException", uncaught);
    }
  });

  it("settles an all-failed batch via failBatchJob with message 'All files failed processing' (#2765)", async () => {
    const clientJobId = "batch-2765-all-failed";
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "bad1.pdf",
        contentType: "application/pdf",
        content: Buffer.from("not a pdf"),
      },
      {
        name: "file",
        filename: "bad2.pdf",
        contentType: "application/pdf",
        content: Buffer.from("still not a pdf"),
      },
      { name: "settings", content: JSON.stringify({ dpi: 72 }) },
      { name: "clientJobId", content: clientJobId },
    ]);

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/pdf-to-jpg/batch",
      body,
      headers: { "content-type": contentType, authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({
      error: "All files failed processing",
      details: ["bad1.pdf: Invalid or corrupt PDF file", "bad2.pdf: Invalid or corrupt PDF file"],
      errors: [
        { filename: "bad1.pdf", error: "Invalid or corrupt PDF file" },
        { filename: "bad2.pdf", error: "Invalid or corrupt PDF file" },
      ],
    });

    const row = await readRow(clientJobId);
    expect(row?.status).toBe("failed");
    expect(row?.completedAt).not.toBeNull();
    expect(row?.progress).toEqual({
      percent: 100,
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 2,
    });
    expect(row?.error).toEqual({
      message: "All files failed processing",
      details: [
        { filename: "bad1.pdf", error: "Invalid or corrupt PDF file" },
        { filename: "bad2.pdf", error: "Invalid or corrupt PDF file" },
      ],
    });

    const cached = await sharedRedis().get(`${bullPrefix()}:terminal:${clientJobId}`);
    expect(cached).not.toBeNull();
    expect(JSON.parse(cached as string)).toMatchObject({
      jobId: clientJobId,
      type: "batch",
      status: "failed",
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 2,
      errors: [
        { filename: "bad1.pdf", error: "Invalid or corrupt PDF file" },
        { filename: "bad2.pdf", error: "Invalid or corrupt PDF file" },
      ],
    });
  });

  it("does not overwrite a canceled row or announce a terminal frame when all files fail (#2765)", async () => {
    const clientJobId = "batch-2765-all-failed-canceled";
    faults.retireRowBeforeFault = clientJobId;
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "bad1.pdf",
        contentType: "application/pdf",
        content: Buffer.from("not a pdf"),
      },
      { name: "settings", content: JSON.stringify({ dpi: 72 }) },
      { name: "clientJobId", content: clientJobId },
    ]);

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/pdf-to-jpg/batch",
      body,
      headers: { "content-type": contentType, authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(422);
    expect((await readRow(clientJobId))?.status).toBe("canceled");
    expect(await sharedRedis().get(`${bullPrefix()}:terminal:${clientJobId}`)).toBeNull();
    expect(
      warnLogs.some(
        (entry) =>
          (entry.bindings as { jobId?: string })?.jobId === clientJobId &&
          entry.msg.includes("no terminal frame announced"),
      ),
      `expected warn log for ${clientJobId}, got ${JSON.stringify(warnLogs)}`,
    ).toBe(true);
  });
});
