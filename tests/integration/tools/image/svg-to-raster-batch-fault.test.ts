/**
 * ZIP streaming faults on `POST /api/v1/tools/image/svg-to-raster/batch` (#2751).
 *
 * The route previously marked its `jobs` row `completed` before calling
 * `reply.hijack()` and streaming the ZIP archive. When `archiver` emitted an
 * error, `archive.finalize()` rejected, or the response stream closed early,
 * `failStream` aborted the archive and destroyed `reply.raw`, leaving the
 * `jobs` row and Redis terminal replay key stuck on `completed` with no durable
 * result.
 */
import AdmZip from "adm-zip";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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
  /** Fault to inject when the batch route streams or finalizes its ZIP archive. */
  archiverMode: null as
    | "emit-error"
    | "reject-finalize"
    | "append-throw"
    | "close-reply-early"
    | "reply-error"
    | "pre-destroyed-reply"
    | null,
  /** Optional custom error to emit or throw instead of the generic poison Error. */
  customError: null as Error | null,
  /** When set, the route's failBatchJob call rejects. */
  settleFails: false,
  /** Job id whose row is marked terminal right before the fault, so failBatchJob returns false. */
  retireRowBeforeFault: null as string | null,
}));

const warnLogs: Array<{ bindings: unknown; msg: string }> = [];
const errorLogs: Array<{ bindings: unknown; msg: string }> = [];
let currentReplyRaw: { destroy: (err?: Error) => void } | null = null;

preReadyHooks.push((app) => {
  app.addHook(
    "onRequest",
    (
      request: {
        log: {
          warn: (...args: unknown[]) => unknown;
          error: (...args: unknown[]) => unknown;
        };
      },
      reply: { raw: { destroy: (err?: Error) => void } },
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
      const origError = request.log.error.bind(request.log);
      request.log.error = (objOrMsg: unknown, msg?: unknown) => {
        if (typeof objOrMsg === "string") {
          errorLogs.push({ bindings: {}, msg: objOrMsg });
        } else {
          errorLogs.push({ bindings: objOrMsg, msg: typeof msg === "string" ? msg : "" });
        }
        return origError(objOrMsg, msg);
      };
      done();
    },
  );
});

vi.mock("archiver", async (importOriginal) => {
  const actual = await importOriginal<typeof import("archiver")>();
  const wrapped = (...args: Parameters<typeof actual.default>) => {
    const archive = actual.default(...args);
    if (faults.archiverMode === "pre-destroyed-reply") {
      currentReplyRaw?.destroy(new Error("test poison: pre-destroyed-reply"));
    }
    let pipedDest: NodeJS.WritableStream | null = null;
    const origPipe = archive.pipe.bind(archive);
    archive.pipe = ((dest: NodeJS.WritableStream, opts?: { end?: boolean }) => {
      pipedDest = dest;
      return origPipe(dest, opts);
    }) as typeof archive.pipe;

    const origAppend = archive.append.bind(archive);
    archive.append = ((...appendArgs: Parameters<typeof archive.append>) => {
      if (faults.archiverMode === "append-throw") {
        throw faults.customError ?? new Error("test poison: append-throw");
      }
      return origAppend(...appendArgs);
    }) as typeof archive.append;

    const origFinalize = archive.finalize.bind(archive);
    archive.finalize = async () => {
      const mode = faults.archiverMode;
      if (!mode) return origFinalize();
      if (faults.retireRowBeforeFault) {
        await db
          .update(schema.jobs)
          .set({ status: "canceled", completedAt: new Date() })
          .where(eq(schema.jobs.id, faults.retireRowBeforeFault));
      }
      const err = faults.customError ?? new Error(`test poison: ${mode}`);
      if (mode === "emit-error") {
        queueMicrotask(() => archive.emit("error", err));
        return;
      }
      if (mode === "reject-finalize") {
        throw err;
      }
      if (mode === "close-reply-early") {
        queueMicrotask(() => pipedDest?.emit("close"));
        return;
      }
      if (mode === "reply-error") {
        queueMicrotask(() => pipedDest?.emit("error", err));
        return;
      }
      return origFinalize();
    };
    return archive;
  };
  return {
    ...actual,
    default: Object.assign(wrapped, actual.default),
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
      if (faults.settleFails) throw new Error("settle write failed");
      return actual.failBatchJob(...args);
    },
  };
});

const SVG = readFixture(fixtures.image.base.svg100);

let testApp: TestApp;
let token: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  token = await loginAsAdmin(testApp.app);
}, 30_000);

afterEach(() => {
  faults.archiverMode = null;
  faults.customError = null;
  faults.settleFails = false;
  faults.retireRowBeforeFault = null;
  warnLogs.length = 0;
  errorLogs.length = 0;
});

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

function postBatch(
  clientJobId: string,
  files: Array<{ filename: string; content: Buffer }> = [
    { filename: "a.svg", content: SVG },
    { filename: "b.svg", content: SVG },
  ],
  toolId = "svg-to-raster",
) {
  const { body, contentType } = createMultipartPayload([
    ...files.map((file) => ({
      name: "file",
      filename: file.filename,
      contentType: "image/svg+xml",
      content: file.content,
    })),
    { name: "settings", content: JSON.stringify({ outputFormat: "png" }) },
    { name: "clientJobId", content: clientJobId },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: `/api/v1/tools/image/${toolId}/batch`,
    body,
    headers: { "content-type": contentType, authorization: `Bearer ${token}` },
  });
}

async function readRow(id: string) {
  const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  return row;
}

async function readSettledRow(id: string) {
  for (let i = 0; i < 40; i++) {
    const row = await readRow(id);
    if (row?.status === "completed" || row?.status === "failed") return row;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return readRow(id);
}

function isCompleteZip(rawPayload: Buffer | undefined): boolean {
  if (!rawPayload || rawPayload.length === 0) return false;
  try {
    return new AdmZip(rawPayload).getEntries().length > 0;
  } catch {
    return false;
  }
}

describe("svg-to-raster batch ZIP stream faults (#2751)", () => {
  it("settles the progress row as failed and writes a failed terminal replay frame when archiver emits an error", async () => {
    const clientJobId = "svg-batch-2751-archiver-error";
    faults.archiverMode = "emit-error";

    const outcome = await postBatch(clientJobId).then(
      (res: { rawPayload?: Buffer }) => res,
      () => null,
    );
    expect(isCompleteZip(outcome?.rawPayload)).toBe(false);

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
  });

  it("settles the progress row as failed when archive.finalize() rejects", async () => {
    const clientJobId = "svg-batch-2751-finalize-reject";
    faults.archiverMode = "reject-finalize";

    const outcome = await postBatch(clientJobId).then(
      (res: { rawPayload?: Buffer }) => res,
      () => null,
    );
    expect(isCompleteZip(outcome?.rawPayload)).toBe(false);

    const row = await readRow(clientJobId);
    expect(row?.status, "progress row stayed completed after finalize rejection").toBe("failed");
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
  });

  it("settles the progress row as failed when archive.append() throws synchronously", async () => {
    const clientJobId = "svg-batch-2751-append-throw";
    faults.archiverMode = "append-throw";

    const outcome = await postBatch(clientJobId).then(
      (res: { rawPayload?: Buffer }) => res,
      () => null,
    );
    expect(isCompleteZip(outcome?.rawPayload)).toBe(false);

    const row = await readRow(clientJobId);
    expect(row?.status).toBe("failed");
    expect(row?.error).toMatchObject({
      message: "Failed to package batch results",
      details: [{ filename: "", error: "Failed to package batch results" }],
    });
  });

  it("preserves per-file errors on the failed row when the ZIP stream fails on a partial batch", async () => {
    const clientJobId = "svg-batch-2751-partial-zip-fault";
    faults.archiverMode = "emit-error";

    await postBatch(clientJobId, [
      { filename: "bad.svg", content: Buffer.from("not an svg") },
      { filename: "b.svg", content: SVG },
    ]).then(
      (res: unknown) => res,
      () => null,
    );

    const row = await readRow(clientJobId);
    expect(row?.status).toBe("failed");
    expect(row?.progress).toMatchObject({
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 1,
    });
    expect(row?.error).toMatchObject({
      message: "Failed to package batch results",
      details: [
        { filename: "bad.svg", error: "Not a valid SVG file" },
        { filename: "", error: "Failed to package batch results" },
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
      failedFiles: 1,
      errors: [
        { filename: "bad.svg", error: "Not a valid SVG file" },
        { filename: "", error: "Failed to package batch results" },
      ],
    });
  });

  it.each(["close-reply-early", "reply-error", "pre-destroyed-reply"] as const)(
    "settles the progress row as failed when the response stream fails mid-transfer (%s)",
    async (mode) => {
      const clientJobId = `svg-batch-2751-${mode}`;
      faults.archiverMode = mode;

      await postBatch(clientJobId).then(
        (res: unknown) => res,
        () => null,
      );

      const row = await readSettledRow(clientJobId);
      expect(row?.status).toBe("failed");
      expect(row?.error).toMatchObject({
        message: "Failed to package batch results",
        details: [{ filename: "", error: "Failed to package batch results" }],
      });
    },
  );

  it("propagates a SafeError message and code when the ZIP stream fails with a SafeError", async () => {
    const { SafeError } = await import("@snapotter/shared");
    const clientJobId = "svg-batch-2751-safe-error";
    faults.archiverMode = "emit-error";
    faults.customError = new SafeError("Workspace storage limit reached", {
      kind: "operational",
      code: "workspace-cap",
      statusCode: 503,
    });

    await postBatch(clientJobId).then(
      (res: unknown) => res,
      () => null,
    );

    const row = await readRow(clientJobId);
    expect(row?.status).toBe("failed");
    expect(row?.error).toMatchObject({
      message: "Workspace storage limit reached",
      code: "workspace-cap",
      details: [{ filename: "", error: "Workspace storage limit reached" }],
    });

    const cached = await sharedRedis().get(`${bullPrefix()}:terminal:${clientJobId}`);
    expect(cached).not.toBeNull();
    expect(JSON.parse(cached as string)).toMatchObject({
      jobId: clientJobId,
      type: "batch",
      status: "failed",
      code: "workspace-cap",
      errors: [{ filename: "", error: "Workspace storage limit reached" }],
    });
  });

  it("logs a warning when failBatchJob matches no live row on a ZIP stream fault", async () => {
    const clientJobId = "svg-batch-2751-unapplied-settle";
    faults.archiverMode = "emit-error";
    faults.retireRowBeforeFault = clientJobId;

    await postBatch(clientJobId).then(
      (res: unknown) => res,
      () => null,
    );

    expect((await readRow(clientJobId))?.status).toBe("canceled");
    expect(
      warnLogs.some(
        (entry) =>
          (entry.bindings as { jobId?: string })?.jobId === clientJobId &&
          entry.msg.includes("no terminal frame announced"),
      ),
      `expected warn log for ${clientJobId}, got ${JSON.stringify(warnLogs)}`,
    ).toBe(true);
  });

  it("logs the settle failure and terminates the stream without an unhandled rejection when failBatchJob rejects", async () => {
    const clientJobId = "svg-batch-2751-settle-fails";
    faults.archiverMode = "emit-error";
    faults.settleFails = true;
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    try {
      const outcome = await postBatch(clientJobId).then(
        (res: { rawPayload?: Buffer }) => res,
        () => null,
      );
      expect(isCompleteZip(outcome?.rawPayload)).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(unhandled).not.toHaveBeenCalled();
      expect((await readRow(clientJobId))?.status).toBe("processing");
      expect(
        errorLogs.some(
          (entry) =>
            (entry.bindings as { jobId?: string })?.jobId === clientJobId &&
            entry.msg.includes("failed to settle a faulted SVG batch"),
        ),
        `expected error log for ${clientJobId}, got ${JSON.stringify(errorLogs)}`,
      ).toBe(true);
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("settles the progress row as failed on a preset route too (svg-to-png)", async () => {
    const clientJobId = "svg-batch-2751-preset-fault";
    faults.archiverMode = "emit-error";

    const outcome = await postBatch(
      clientJobId,
      [
        { filename: "a.svg", content: SVG },
        { filename: "b.svg", content: SVG },
      ],
      "svg-to-png",
    ).then(
      (res: { rawPayload?: Buffer }) => res,
      () => null,
    );
    expect(isCompleteZip(outcome?.rawPayload)).toBe(false);

    const row = await readRow(clientJobId);
    expect(row?.status).toBe("failed");
    expect(row?.error).toMatchObject({
      message: "Failed to package batch results",
      details: [{ filename: "", error: "Failed to package batch results" }],
    });
  });

  it("settles an all-failed batch via failBatchJob with message 'All files failed processing' (#2765)", async () => {
    const clientJobId = "svg-batch-2765-all-failed";

    const res = await postBatch(clientJobId, [
      { filename: "bad1.svg", content: Buffer.from("not an svg") },
      { filename: "bad2.svg", content: Buffer.from("still not an svg") },
    ]);

    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({
      error: "All files failed processing",
      errors: [
        { filename: "bad1.svg", error: "Not a valid SVG file" },
        { filename: "bad2.svg", error: "Not a valid SVG file" },
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
        { filename: "bad1.svg", error: "Not a valid SVG file" },
        { filename: "bad2.svg", error: "Not a valid SVG file" },
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
        { filename: "bad1.svg", error: "Not a valid SVG file" },
        { filename: "bad2.svg", error: "Not a valid SVG file" },
      ],
    });
  });

  it("does not overwrite a canceled row or announce a terminal frame when all files fail (#2765)", async () => {
    const clientJobId = "svg-batch-2765-all-failed-canceled";
    faults.retireRowBeforeFault = clientJobId;

    const res = await postBatch(clientJobId, [
      { filename: "bad1.svg", content: Buffer.from("not an svg") },
      { filename: "bad2.svg", content: Buffer.from("still not an svg") },
    ]);

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
