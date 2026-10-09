/**
 * Single-tool cancel (#808): requestCancel's alias resolution for plain
 * tool runs, the enqueue-time alias stamping, and the worker's dual
 * terminal write when an active run is canceled through its alias.
 *
 * Follows the batch-cancel.test.ts harness: no HTTP app is built. The test
 * tool is registered directly in the process registry, jobs are enqueued
 * through the real enqueueToolJob (the seam every single-tool route shares,
 * factory and custom AI routes alike), and the real workers drain them
 * against this fork's Postgres + Redis. Queue pauses stand in for "the job
 * is still waiting" so removal is deterministic instead of a race.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Injects a bounded fault into the worker's durable alias write so the
// liveness fallback (the ephemeral terminal frame must reach live SSE
// clients even when the DB write fails) is testable. Scoped by target id so
// every other test runs against the real implementation.
const guardedWriteFault = vi.hoisted(() => ({ target: null as string | null }));

// Runs once right after the real write of an output under `prefix`, standing in
// for a cancel that arrives while the worker is already past the handler.
const outputWriteHook = vi.hoisted(() => ({
  prefix: null as string | null,
  after: null as (() => Promise<void>) | null,
}));

// Fails the worker's output cleanup for one job (#2144), standing in for a
// storage outage that hits after the cancel landed.
const cleanupFault = vi.hoisted(() => ({ prefix: null as string | null }));

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    putObject: async (key: string, data: Buffer) => {
      await actual.putObject(key, data);
      if (outputWriteHook.prefix && key.startsWith(outputWriteHook.prefix)) {
        const run = outputWriteHook.after;
        outputWriteHook.prefix = null;
        outputWriteHook.after = null;
        await run?.();
      }
    },
    deletePrefix: async (prefix: string) => {
      if (prefix === cleanupFault.prefix) throw new Error("injected cleanup outage");
      return actual.deletePrefix(prefix);
    },
  };
});

// What the worker hands the Sentry path, per job, so a swallowed cleanup fault
// can be shown to have been reported.
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

// Fails the completion commit once for one job (#2144), so the first attempt's
// output stays in storage and the retry is what a cancel then reaches.
const completionFault = vi.hoisted(() => ({ jobId: null as string | null }));

vi.mock("../../../apps/api/src/routes/progress.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/routes/progress.js")>();
  return {
    ...actual,
    cancelSingleJobGuarded: async (args: { jobId: string }) => {
      if (args.jobId === guardedWriteFault.target) {
        throw new Error("injected alias-write outage");
      }
      return actual.cancelSingleJobGuarded(args);
    },
    updateSingleFileProgressAtomically: async (
      frame: Parameters<typeof actual.updateSingleFileProgressAtomically>[0],
      commit: Parameters<typeof actual.updateSingleFileProgressAtomically>[1],
    ) => {
      if (frame.jobId === completionFault.jobId) {
        completionFault.jobId = null;
        throw new Error("injected completion outage");
      }
      return actual.updateSingleFileProgressAtomically(frame, commit);
    },
  };
});

// Runs once right after the library auto-save's own blob write (#2143),
// standing in for a cancel that arrives while autoSaveToLibrary is still
// uploading. The hook gets the stored name so the test can check the blob.
// Setting `fail` makes that upload fail once the hook has run: the blob is
// removed and the save rejects, as a storage fault would.
const librarySaveHook = vi.hoisted(() => ({
  after: null as ((storedName: string) => Promise<void>) | null,
  fail: false,
}));

// Fails the removal of one stored library blob (#2143), standing in for a
// storage outage when a canceled save takes its blob back.
const libraryDeleteFault = vi.hoisted(() => ({ storedName: null as string | null }));

vi.mock("../../../apps/api/src/lib/file-storage.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/file-storage.js")>();
  return {
    ...actual,
    saveFile: async (buffer: Buffer, originalName: string) => {
      const storedName = await actual.saveFile(buffer, originalName);
      const run = librarySaveHook.after;
      if (run) {
        librarySaveHook.after = null;
        await run(storedName);
      }
      if (librarySaveHook.fail) {
        librarySaveHook.fail = false;
        await actual.deleteStoredFile(storedName);
        throw new Error("injected library save outage");
      }
      return storedName;
    },
    deleteStoredFile: async (storedName: string) => {
      if (storedName === libraryDeleteFault.storedName) {
        throw new Error("injected blob delete outage");
      }
      return actual.deleteStoredFile(storedName);
    },
  };
});

import type { LibrarySaveMode } from "@snapotter/shared";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { runMigrations } from "../../../apps/api/src/db/migrate.js";
import {
  requestCancel,
  startCancelListener,
  stopCancelListener,
  wasUserCanceled,
} from "../../../apps/api/src/jobs/cancel.js";
import {
  createRedisSubscriberConnection,
  sharedRedis,
} from "../../../apps/api/src/jobs/connection.js";
import {
  closeQueueEvents,
  enqueueToolJob,
  insertToolJobAlias,
  waitForJob,
  warmQueueEvents,
} from "../../../apps/api/src/jobs/enqueue.js";
import { closeQueues, getQueue } from "../../../apps/api/src/jobs/queues.js";
import { bullPrefix } from "../../../apps/api/src/jobs/types.js";
import { closeWorkers, startWorkers } from "../../../apps/api/src/jobs/worker.js";
import { readStoredFile } from "../../../apps/api/src/lib/file-storage.js";
import { logger } from "../../../apps/api/src/lib/logger.js";
import { listObjects, putObject } from "../../../apps/api/src/lib/object-storage.js";
import { cancelSingleJobGuarded } from "../../../apps/api/src/routes/progress.js";
import type { ToolProcessCtx } from "../../../apps/api/src/routes/tool-factory.js";
import { registerToolProcessFn } from "../../../apps/api/src/routes/tool-factory.js";

const passthroughSchema = { parse: (v: unknown) => v } as never;

interface RunSettings {
  mode: "fast" | "slow" | "ignore-abort" | "retry-slow";
  tag: string;
}

// Behavior keyed on settings: fast returns instantly, slow waits on the
// worker's abort signal, so a cancel has a real running target. ignore-abort
// stands in for a handler that never reads the signal (Erase Object, #2092):
// it notices the abort only to finish a beat later and return a result anyway.
// retry-slow is fast on its first run and slow from the second on, so a cancel
// can reach the retry of a job whose first attempt already wrote its output
// (#2144). Every invocation records its tag, so "this run never started" is a
// positive assertion instead of a timing guess.
const invoked: string[] = [];
registerToolProcessFn({
  toolId: "wt-single-cancel",
  settingsSchema: passthroughSchema,
  process: async (
    inputBuffer: Buffer,
    settings: unknown,
    filename: string,
    ctx?: ToolProcessCtx,
  ) => {
    const { mode, tag } = settings as RunSettings;
    invoked.push(tag);
    const isRetry = invoked.filter((t) => t === tag).length > 1;
    if (mode === "slow" || (mode === "retry-slow" && isRetry)) {
      await new Promise<void>((resolve, reject) => {
        const signal = ctx?.signal;
        if (!signal) {
          reject(new Error("wt-single-cancel requires an abort signal"));
          return;
        }
        if (signal.aborted) {
          reject(new Error("aborted before start"));
          return;
        }
        const timer = setTimeout(resolve, 20_000);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new Error("aborted by signal"));
          },
          { once: true },
        );
      });
    }
    if (mode === "ignore-abort") {
      const signal = ctx?.signal;
      if (!signal) throw new Error("wt-single-cancel requires an abort signal");
      if (!signal.aborted) {
        await new Promise<void>((resolve) => {
          // Bounded like the slow mode, so a lost cancel fails this test instead of
          // hanging the shard until the job timeout.
          const timer = setTimeout(resolve, 20_000);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });
      }
      await delay(200);
    }
    return { buffer: inputBuffer, filename, contentType: "image/png" };
  },
});

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

async function terminalRow(jobId: string, timeoutMs = 25_000): Promise<JobRow> {
  return waitFor(async () => {
    const row = await jobRow(jobId);
    return row && row.status !== "queued" && row.status !== "processing" ? row : undefined;
  }, timeoutMs);
}

async function terminalFrame(jobId: string): Promise<Record<string, unknown>> {
  const raw = await waitFor(async () => {
    const value = await sharedRedis().get(`${bullPrefix()}:terminal:${jobId}`);
    return value ?? undefined;
  }, 25_000);
  return JSON.parse(raw) as Record<string, unknown>;
}

/** Collect ids published on the cancel channel for the duration of `fn`. */
async function collectCancelPublishes(fn: () => Promise<void>): Promise<string[]> {
  const received: string[] = [];
  const sub = createRedisSubscriberConnection();
  await sub.subscribe(`${bullPrefix()}:cancel`);
  sub.on("message", (_ch: string, msg: string) => received.push(msg));
  try {
    await fn();
    // Publishes are awaited inside requestCancel, but delivery to this
    // subscriber is async; give the frames a beat to arrive.
    await delay(300);
    return received;
  } finally {
    await sub.quit();
  }
}

/** Insert a users row so jobs.userId's FK holds; returns the id. */
async function createOwner(): Promise<string> {
  const id = randomUUID();
  await db.insert(schema.users).values({
    id,
    username: `wt-single-cancel-${id.slice(0, 8)}`,
  });
  return id;
}

interface EnqueueOpts {
  mode: RunSettings["mode"];
  tag: string;
  clientJobId?: string;
  userId?: string | null;
  jobId?: string;
  /** A library file the run came from; the worker auto-saves the result against it. */
  fileId?: string;
  saveMode?: LibrarySaveMode;
}

/** Enqueue a single-tool run the way every tool route does. */
async function enqueueSingleRun(
  opts: EnqueueOpts,
): Promise<{ jobId: string; userId: string | null }> {
  const jobId = opts.jobId ?? randomUUID();
  const userId = opts.userId === undefined ? await createOwner() : opts.userId;
  const uploadKey = `uploads/${jobId}/input.png`;
  await putObject(uploadKey, Buffer.from("payload"));
  await enqueueToolJob({
    kind: "tool",
    jobId,
    toolId: "wt-single-cancel",
    userId,
    pool: "image",
    inputRefs: [uploadKey],
    filename: "input.png",
    settings: { mode: opts.mode, tag: opts.tag },
    clientJobId: opts.clientJobId,
    fileId: opts.fileId,
    saveMode: opts.saveMode,
  });
  return { jobId, userId };
}

/** Insert a library file owned by `userId`, the original a run would overwrite. */
async function createLibraryFile(userId: string): Promise<string> {
  const id = randomUUID();
  await db.insert(schema.userFiles).values({
    id,
    userId,
    originalName: "input.png",
    storedName: `${randomUUID()}.png`,
    mimeType: "image/png",
    size: 7,
    version: 1,
    toolChain: [],
  });
  return id;
}

beforeAll(async () => {
  await startCancelListener();
  startWorkers();
  // The sync-window test arms waitForJob and cancels concurrently; a
  // lazily created QueueEvents consumer can position at the stream tail
  // AFTER the failed event publishes on a loaded CI shard, hanging both
  // promises. Warm the consumers up front, the way the production spine
  // does for exactly this reason.
  await warmQueueEvents();
}, 30_000);

afterAll(async () => {
  await closeWorkers();
  await stopCancelListener();
  await closeQueueEvents();
  await closeQueues();
  await sharedRedis().quit();
}, 20_000);

// ── Tests ───────────────────────────────────────────────────────

describe("enqueueToolJob alias stamping (#808)", () => {
  it("pre-inserts the alias row with owner, pool, and artifact pointer", async () => {
    const clientJobId = randomUUID();
    const queue = getQueue("image");
    await queue.pause();
    try {
      const { jobId, userId } = await enqueueSingleRun({
        mode: "fast",
        tag: "stamp-a",
        clientJobId,
      });

      const alias = await jobRow(clientJobId);
      expect(alias?.type).toBe("single");
      expect(alias?.userId).toBe(userId);
      expect(alias?.pool).toBe("image");
      expect((alias?.settings ?? {}) as { artifactJobId?: string }).toMatchObject({
        artifactJobId: jobId,
      });
    } finally {
      await queue.resume();
    }
  });

  it("claims the lazily created ownerless SSE row instead of leaving it pointerless", async () => {
    // A progress frame that beats the enqueue creates the alias row the way
    // persistSingleFileProgress does: type single, no owner, no settings.
    const clientJobId = randomUUID();
    await db.insert(schema.jobs).values({
      id: clientJobId,
      type: "single",
      status: "processing",
      inputRefs: [],
    });

    const { jobId, userId } = await enqueueSingleRun({
      mode: "fast",
      tag: "stamp-lazy",
      clientJobId,
    });
    await terminalRow(jobId);

    const alias = await jobRow(clientJobId);
    expect(alias?.userId).toBe(userId);
    expect(((alias?.settings ?? {}) as { artifactJobId?: string }).artifactJobId).toBe(jobId);
  });

  it("does not clobber a same-owner batch parent row that collides with the alias id", async () => {
    // Batch parent ids ARE the client-supplied id, so a collision with a
    // later single-tool run is reachable for the same user. The upsert must
    // not replace the parent's cancel metadata with an alias pointer.
    const owner = await createOwner();
    const clientJobId = randomUUID();
    await db.insert(schema.jobs).values({
      id: clientJobId,
      userId: owner,
      type: "batch",
      status: "processing",
      inputRefs: [],
      settings: { flowChildCount: 2, stepCount: 1 },
    });

    const { jobId } = await enqueueSingleRun({
      mode: "fast",
      tag: "batch-collide",
      clientJobId,
      userId: owner,
    });
    await terminalRow(jobId);

    const parent = await jobRow(clientJobId);
    expect(parent?.type).toBe("batch");
    expect(parent?.settings).toMatchObject({ flowChildCount: 2, stepCount: 1 });
  });

  it("leaves a foreign user's row untouched when its id is reused", async () => {
    const foreignOwner = await createOwner();
    const clientJobId = randomUUID();
    await db.insert(schema.jobs).values({
      id: clientJobId,
      userId: foreignOwner,
      type: "single",
      status: "queued",
      inputRefs: [],
      settings: { artifactJobId: "foreign-artifact" },
    });

    const { jobId } = await enqueueSingleRun({ mode: "fast", tag: "stamp-foreign", clientJobId });
    await terminalRow(jobId);

    const alias = await jobRow(clientJobId);
    expect(alias?.userId).toBe(foreignOwner);
    expect(((alias?.settings ?? {}) as { artifactJobId?: string }).artifactJobId).toBe(
      "foreign-artifact",
    );
  });
});

describe("requestCancel through a single-tool alias (#808)", () => {
  it("resolves a waiting job: removes it and settles both rows terminally", async () => {
    const clientJobId = randomUUID();
    const queue = getQueue("image");
    await queue.pause();
    let jobId: string;
    try {
      ({ jobId } = await enqueueSingleRun({ mode: "fast", tag: "wait-cancel", clientJobId }));
      expect(await requestCancel(clientJobId)).toBe(true);
    } finally {
      await queue.resume();
    }

    // The queue job is gone, both rows are canceled, and the client-facing
    // channel got its terminal frame (a reconnecting client must not replay
    // a live run that will never finish, the #766 lesson).
    expect(await getQueue("image").getJob(jobId)).toBeUndefined();
    expect((await jobRow(jobId))?.status).toBe("canceled");
    expect((await jobRow(clientJobId))?.status).toBe("canceled");
    const frame = await terminalFrame(clientJobId);
    expect(frame.phase).toBe("failed");
    expect(frame.error).toBe("Canceled");
    expect(invoked).not.toContain("wait-cancel");
  });

  it("resolves an active job: publishes the server id and the worker settles both rows", async () => {
    const clientJobId = randomUUID();
    const { jobId } = await enqueueSingleRun({ mode: "slow", tag: "active-cancel", clientJobId });
    await waitFor(async () => (invoked.includes("active-cancel") ? true : undefined));

    const received = await collectCancelPublishes(async () => {
      expect(await requestCancel(clientJobId)).toBe(true);
    });
    expect(received).toContain(jobId);

    expect((await terminalRow(jobId)).status).toBe("canceled");
    expect((await terminalRow(clientJobId)).status).toBe("canceled");
    const frame = await terminalFrame(clientJobId);
    expect(frame.phase).toBe("failed");
    expect(frame.error).toBe("Canceled");
  });

  it("does not save a result that finished after the cancel landed (#2092)", async () => {
    const clientJobId = randomUUID();
    const { jobId } = await enqueueSingleRun({
      mode: "ignore-abort",
      tag: "ignore-abort",
      clientJobId,
    });
    await waitFor(async () => (invoked.includes("ignore-abort") ? true : undefined));

    expect(await requestCancel(clientJobId)).toBe(true);

    // The handler returned a result after the abort. The worker must settle
    // canceled and write nothing, instead of completing and saving it.
    expect((await terminalRow(jobId)).status).toBe("canceled");
    expect((await terminalRow(clientJobId)).status).toBe("canceled");
    const frame = await terminalFrame(clientJobId);
    expect(frame.phase).toBe("failed");
    expect(frame.error).toBe("Canceled");
    expect(await listObjects(`outputs/${jobId}/`)).toEqual([]);
  });

  it("settles canceled when the cancel lands while the output is being written (#2092)", async () => {
    // Past the first guard, so only the re-check before the library auto-save
    // can stop this one.
    const clientJobId = randomUUID();
    const jobId = randomUUID();
    outputWriteHook.prefix = `outputs/${jobId}/`;
    outputWriteHook.after = async () => {
      // The write landed, so the cleanup below has something to take back.
      expect(await listObjects(`outputs/${jobId}/`)).toHaveLength(1);
      expect(await requestCancel(clientJobId)).toBe(true);
      await waitFor(async () => (wasUserCanceled(jobId) ? true : undefined));
    };
    await enqueueSingleRun({ mode: "fast", tag: "cancel-mid-write", clientJobId, jobId });

    expect((await terminalRow(jobId)).status).toBe("canceled");
    expect((await terminalRow(clientJobId)).status).toBe("canceled");
    // The output the hook let through must not stay downloadable or get adopted
    // by job reconciliation: the row settles with no outputRefs, so nothing
    // else would ever remove it (#2144).
    expect(await listObjects(`outputs/${jobId}/`)).toEqual([]);
  });

  it("still settles canceled, and reports, when the output cleanup fails (#2144)", async () => {
    // A storage outage during the cleanup must not turn a user cancel into a
    // retried failure: the terminal write lands, the client gets its frame,
    // and the fault is logged and reported. The leftover output is the known
    // cost, swept by storage retention.
    const clientJobId = randomUUID();
    const jobId = randomUUID();
    cleanupFault.prefix = `outputs/${jobId}/`;
    outputWriteHook.prefix = `outputs/${jobId}/`;
    outputWriteHook.after = async () => {
      expect(await requestCancel(clientJobId)).toBe(true);
      await waitFor(async () => (wasUserCanceled(jobId) ? true : undefined));
    };
    const errorLog = vi.spyOn(logger, "error");
    try {
      await enqueueSingleRun({ mode: "fast", tag: "cleanup-fault", clientJobId, jobId });

      const row = await terminalRow(jobId);
      expect(row.status).toBe("canceled");
      expect(row.attempts).toBe(1);
      expect((await terminalRow(clientJobId)).status).toBe("canceled");
      expect((await terminalFrame(clientJobId)).error).toBe("Canceled");

      const cleanupLogs = errorLog.mock.calls.filter(
        ([ctx, msg]) =>
          msg ===
            "canceled job output cleanup failed; outputs stay downloadable until the storage sweep" &&
          (ctx as { jobId?: string }).jobId === jobId,
      );
      expect(cleanupLogs).toHaveLength(1);
      expect(reported.filter((r) => r.jobId === jobId).map((r) => r.message)).toContain(
        "injected cleanup outage",
      );
      // The fault was real: the output is still there.
      expect(await listObjects(`outputs/${jobId}/`)).toHaveLength(1);
    } finally {
      cleanupFault.prefix = null;
      errorLog.mockRestore();
    }
  });

  it("removes an earlier attempt's output when the retry is the one canceled (#2144)", async () => {
    // Output keys are per job, not per attempt. Attempt 1 wrote its output and
    // then lost the completion commit; the retry is canceled mid-handler,
    // having written nothing. The cleanup must still take attempt 1's file.
    const jobId = randomUUID();
    completionFault.jobId = jobId;
    await enqueueSingleRun({ mode: "retry-slow", tag: "retry-hole", jobId });
    await waitFor(async () =>
      invoked.filter((t) => t === "retry-hole").length === 2 ? true : undefined,
    );
    expect(await listObjects(`outputs/${jobId}/`)).toHaveLength(1);

    expect(await requestCancel(jobId)).toBe(true);

    const row = await terminalRow(jobId);
    expect(row.status).toBe("canceled");
    expect(row.attempts).toBe(2);
    expect(await listObjects(`outputs/${jobId}/`)).toEqual([]);
  });

  it("does not replace the library original when the cancel lands during the auto-save (#2143)", async () => {
    // Past every guard in the worker: the cancel arrives while
    // autoSaveToLibrary has written its blob and is about to insert the
    // version row. Nothing may be saved, and the blob has to go with the
    // job's own outputs.
    const owner = await createOwner();
    const fileId = await createLibraryFile(owner);
    const clientJobId = randomUUID();
    const jobId = randomUUID();
    // The hook runs inside the worker's save, where a throw would turn into a
    // failed save instead of failing here; record it and assert it below.
    const hook = { storedName: null as string | null, error: null as unknown };
    librarySaveHook.after = async (storedName) => {
      hook.storedName = storedName;
      try {
        expect(await requestCancel(clientJobId)).toBe(true);
        await waitFor(async () => (wasUserCanceled(jobId) ? true : undefined));
      } catch (err) {
        hook.error = err;
      }
    };
    try {
      await enqueueSingleRun({
        mode: "fast",
        tag: "cancel-mid-save",
        clientJobId,
        jobId,
        userId: owner,
        fileId,
        saveMode: "overwrite",
      });

      const row = await terminalRow(jobId);
      expect(hook.error).toBeNull();
      expect(row.status).toBe("canceled");
      expect((await terminalRow(clientJobId)).status).toBe("canceled");
      // The original alone: no superseding version and no independent copy.
      const files = await db
        .select()
        .from(schema.userFiles)
        .where(eq(schema.userFiles.userId, owner));
      expect(files.map((f) => f.id)).toEqual([fileId]);
      if (!hook.storedName) throw new Error("the library save never wrote its blob");
      await expect(readStoredFile(hook.storedName)).rejects.toMatchObject({ code: "ENOENT" });
      expect(await listObjects(`outputs/${jobId}/`)).toEqual([]);
    } finally {
      librarySaveHook.after = null;
    }
  });

  it("still settles canceled, and reports the orphan, when the canceled save cannot remove its blob (#2143)", async () => {
    // A storage outage while the canceled save takes its blob back must not
    // turn the cancel into a retried failure or let the version row in. The
    // blob stays behind, and the log line is the only thing that names it.
    const owner = await createOwner();
    const fileId = await createLibraryFile(owner);
    const clientJobId = randomUUID();
    const jobId = randomUUID();
    const hook = { storedName: null as string | null, error: null as unknown };
    librarySaveHook.after = async (storedName) => {
      hook.storedName = storedName;
      libraryDeleteFault.storedName = storedName;
      try {
        expect(await requestCancel(clientJobId)).toBe(true);
        await waitFor(async () => (wasUserCanceled(jobId) ? true : undefined));
      } catch (err) {
        hook.error = err;
      }
    };
    const errorLog = vi.spyOn(logger, "error");
    try {
      await enqueueSingleRun({
        mode: "fast",
        tag: "cancel-save-delete-fault",
        clientJobId,
        jobId,
        userId: owner,
        fileId,
        saveMode: "overwrite",
      });

      const row = await terminalRow(jobId);
      expect(hook.error).toBeNull();
      expect(row.status).toBe("canceled");
      expect(row.attempts).toBe(1);
      expect((await terminalRow(clientJobId)).status).toBe("canceled");
      const files = await db
        .select()
        .from(schema.userFiles)
        .where(eq(schema.userFiles.userId, owner));
      expect(files.map((f) => f.id)).toEqual([fileId]);

      const orphanLogs = errorLog.mock.calls.filter(
        ([ctx, msg]) =>
          msg === "canceled library auto-save could not remove its blob; it is an orphan" &&
          (ctx as { jobId?: string }).jobId === jobId,
      );
      expect(orphanLogs).toHaveLength(1);
      expect(orphanLogs[0]?.[0]).toMatchObject({ storedName: hook.storedName, fileId });
      expect(reported.filter((r) => r.jobId === jobId).map((r) => r.message)).toContain(
        "injected blob delete outage",
      );
      // The fault was real: the blob is still there under the logged name.
      if (!hook.storedName) throw new Error("the library save never wrote its blob");
      await expect(readStoredFile(hook.storedName)).resolves.toBeInstanceOf(Buffer);
      expect(await listObjects(`outputs/${jobId}/`)).toEqual([]);
    } finally {
      librarySaveHook.after = null;
      libraryDeleteFault.storedName = null;
      errorLog.mockRestore();
    }
  });

  it("settles canceled, and logs the fault, when the save fails as the cancel lands (#2143)", async () => {
    // A storage fault that coincides with a cancel must not hide behind it (the
    // warning carries it) or replace it (the job still settles canceled, with
    // no retry and no "tool job failed").
    const owner = await createOwner();
    const fileId = await createLibraryFile(owner);
    const clientJobId = randomUUID();
    const jobId = randomUUID();
    const hook = { ran: false, error: null as unknown };
    librarySaveHook.after = async () => {
      hook.ran = true;
      librarySaveHook.fail = true;
      try {
        expect(await requestCancel(clientJobId)).toBe(true);
        await waitFor(async () => (wasUserCanceled(jobId) ? true : undefined));
      } catch (err) {
        hook.error = err;
      }
    };
    const warnLog = vi.spyOn(logger, "warn");
    const errorLog = vi.spyOn(logger, "error");
    try {
      await enqueueSingleRun({
        mode: "fast",
        tag: "cancel-save-fault",
        clientJobId,
        jobId,
        userId: owner,
        fileId,
        saveMode: "overwrite",
      });

      const row = await terminalRow(jobId);
      expect(hook.ran).toBe(true);
      expect(hook.error).toBeNull();
      expect(row.status).toBe("canceled");
      expect(row.attempts).toBe(1);
      expect((await terminalRow(clientJobId)).status).toBe("canceled");

      const faultLogs = warnLog.mock.calls.filter(
        ([ctx, msg]) =>
          msg === "library auto-save failed; no library copy was made" &&
          (ctx as { jobId?: string }).jobId === jobId,
      );
      expect(faultLogs).toHaveLength(1);
      expect(faultLogs[0]?.[0]).toMatchObject({
        err: expect.objectContaining({ message: "injected library save outage" }),
      });
      const failureLogs = errorLog.mock.calls.filter(
        ([ctx, msg]) => msg === "tool job failed" && (ctx as { jobId?: string }).jobId === jobId,
      );
      expect(failureLogs).toEqual([]);

      const files = await db
        .select()
        .from(schema.userFiles)
        .where(eq(schema.userFiles.userId, owner));
      expect(files.map((f) => f.id)).toEqual([fileId]);
      expect(await listObjects(`outputs/${jobId}/`)).toEqual([]);
    } finally {
      librarySaveHook.after = null;
      librarySaveHook.fail = false;
      warnLog.mockRestore();
      errorLog.mockRestore();
    }
  });

  it("completes with the version when the cancel lands right after the version row (#2143)", async () => {
    // The earliest point where a cancel is too late: the row is in, and the
    // save has not returned to the worker yet. The job completes and keeps the
    // version and its blob, so no check after the save may undo it.
    const owner = await createOwner();
    const fileId = await createLibraryFile(owner);
    const clientJobId = randomUUID();
    const jobId = randomUUID();
    const hook = { ran: false, error: null as unknown };
    const afterVersionRow = async () => {
      hook.ran = true;
      try {
        await requestCancel(clientJobId);
        await waitFor(async () => (wasUserCanceled(jobId) ? true : undefined));
      } catch (err) {
        hook.error = err;
      }
    };
    // Every insert runs for real; only the version row under this test's file
    // also runs the cancel once it has landed.
    const realInsert = db.insert.bind(db);
    const insertSpy = vi.spyOn(db, "insert").mockImplementation(((
      table: Parameters<typeof db.insert>[0],
    ) => {
      const builder = realInsert(table);
      if (table !== schema.userFiles) return builder;
      const realValues = builder.values.bind(builder);
      builder.values = ((row: { parentId?: string | null }) => {
        const query = realValues(row as never);
        if (row.parentId !== fileId) return query;
        return query.then(async (result: unknown) => {
          await afterVersionRow();
          return result;
        });
      }) as typeof builder.values;
      return builder;
    }) as typeof db.insert);
    try {
      await enqueueSingleRun({
        mode: "fast",
        tag: "cancel-after-save",
        clientJobId,
        jobId,
        userId: owner,
        fileId,
        saveMode: "overwrite",
      });

      const row = await terminalRow(jobId);
      expect(hook.ran).toBe(true);
      expect(hook.error).toBeNull();
      expect(row.status).toBe("completed");
      expect((await terminalRow(clientJobId)).status).toBe("completed");
      const versions = await db
        .select()
        .from(schema.userFiles)
        .where(eq(schema.userFiles.parentId, fileId));
      expect(versions).toHaveLength(1);
      expect(versions[0]).toMatchObject({ userId: owner, version: 2 });
      await expect(readStoredFile(versions[0]?.storedName ?? "")).resolves.toBeInstanceOf(Buffer);
      expect(await listObjects(`outputs/${jobId}/`)).toHaveLength(1);
    } finally {
      insertSpy.mockRestore();
    }
  });

  it("surfaces an active cancel to the sync window as the Canceled rejection", async () => {
    // The route's structural 422 keys on this exact chain: worker
    // UnrecoverableError("Canceled") -> BullMQ failedReason ->
    // waitUntilFinished rejection. Pin it here so the HTTP suite's canned
    // waitForJob stays an honest stand-in.
    const clientJobId = randomUUID();
    const { jobId } = await enqueueSingleRun({ mode: "slow", tag: "sync-window", clientJobId });
    await waitFor(async () => (invoked.includes("sync-window") ? true : undefined));

    const settled = waitForJob("image", jobId).then(
      () => "resolved",
      (err) => (err instanceof Error ? err.message : String(err)),
    );
    expect(await requestCancel(clientJobId)).toBe(true);
    expect(await settled).toBe("Canceled");
    expect((await terminalRow(jobId)).status).toBe("canceled");
  });

  it("cancels a live run whose reused alias id is terminal from an earlier run", async () => {
    const owner = await createOwner();
    const clientJobId = randomUUID();
    const first = await enqueueSingleRun({
      mode: "fast",
      tag: "reuse-1",
      clientJobId,
      userId: owner,
    });
    await terminalRow(first.jobId);
    await terminalRow(clientJobId);

    const second = await enqueueSingleRun({
      mode: "slow",
      tag: "reuse-2",
      clientJobId,
      userId: owner,
    });
    await waitFor(async () => (invoked.includes("reuse-2") ? true : undefined));
    await sharedRedis().del(`${bullPrefix()}:terminal:${clientJobId}`);

    // Run 2's enqueue re-pointed the alias and reset its stale terminal
    // state (#886), so the cancel resolves the live job and this run's
    // outcome lands on the row instead of run 1's leftover "completed".
    expect(await requestCancel(clientJobId)).toBe(true);
    expect((await terminalRow(second.jobId)).status).toBe("canceled");

    const frame = await terminalFrame(clientJobId);
    expect(frame.phase).toBe("failed");
    expect(frame.error).toBe("Canceled");
    expect((await terminalRow(clientJobId)).status).toBe("canceled");
  });

  it("heals a half-canceled run instead of answering false forever", async () => {
    // A prior cancel removed the queue job and marked the artifact row,
    // but died before the alias settled (a crash or 500 between the
    // writes). The retry must converge: settle the alias, answer true.
    const owner = await createOwner();
    const clientJobId = randomUUID();
    const artifactId = randomUUID();
    await db.insert(schema.jobs).values([
      {
        id: artifactId,
        userId: owner,
        type: "tool",
        status: "canceled",
        completedAt: new Date(),
        inputRefs: [],
      },
      {
        id: clientJobId,
        userId: owner,
        type: "single",
        status: "processing",
        inputRefs: [],
        settings: { artifactJobId: artifactId },
      },
    ]);

    expect(await requestCancel(clientJobId)).toBe(true);
    expect((await jobRow(clientJobId))?.status).toBe("canceled");
    const frame = await terminalFrame(clientJobId);
    expect(frame.error).toBe("Canceled");
  });

  it("still delivers the terminal frame when the durable alias write fails", async () => {
    // Liveness must not depend on DB health: the pre-#808 worker always
    // published the ephemeral frame, and the dual write keeps that
    // guarantee. The row stays unsettled (the write failed), which the
    // repair path above covers on the next cancel.
    const clientJobId = randomUUID();
    const { jobId } = await enqueueSingleRun({ mode: "slow", tag: "fault-cancel", clientJobId });
    await waitFor(async () => (invoked.includes("fault-cancel") ? true : undefined));

    guardedWriteFault.target = clientJobId;
    try {
      expect(await requestCancel(clientJobId)).toBe(true);
      expect((await terminalRow(jobId)).status).toBe("canceled");
      const frame = await terminalFrame(clientJobId);
      expect(frame.phase).toBe("failed");
      expect(frame.error).toBe("Canceled");
    } finally {
      guardedWriteFault.target = null;
    }
    expect((await jobRow(clientJobId))?.status).not.toBe("canceled");
  });

  it("returns false for a terminal alias row and does not flag anything", async () => {
    const clientJobId = randomUUID();
    const { jobId } = await enqueueSingleRun({ mode: "fast", tag: "done-cancel", clientJobId });
    await terminalRow(jobId);
    await terminalRow(clientJobId);

    expect(await requestCancel(clientJobId)).toBe(false);
    expect((await jobRow(jobId))?.status).toBe("completed");
  });

  it("settles a cancel whose run has not reached the queue yet (#886)", async () => {
    // The validation window: the factory stamped the pointer, but neither
    // the artifact row nor the queue job exists yet. Pre-#886 this
    // answered an honest false and the button stayed armed; now the alias
    // settles durably and the worker gate refuses the run if it ever
    // materializes.
    const owner = await createOwner();
    const clientJobId = randomUUID();
    const artifactId = randomUUID();
    await db.insert(schema.jobs).values({
      id: clientJobId,
      userId: owner,
      type: "single",
      status: "queued",
      inputRefs: [],
      settings: { artifactJobId: artifactId },
    });

    const received = await collectCancelPublishes(async () => {
      expect(await requestCancel(clientJobId)).toBe(true);
    });
    // Belt for the sliver where a worker picked the job up between the
    // queue scan and the artifact read.
    expect(received).toContain(artifactId);
    expect((await jobRow(clientJobId))?.status).toBe("canceled");
    const frame = await terminalFrame(clientJobId);
    expect(frame.phase).toBe("failed");
    expect(frame.error).toBe("Canceled");

    // A second click is a refusal, not a loop: the alias is terminal now.
    expect(await requestCancel(clientJobId)).toBe(false);
  });

  it("cancels the pre-add sliver: artifact row inserted, queue add not yet run (#886)", async () => {
    const owner = await createOwner();
    const clientJobId = randomUUID();
    const artifactId = randomUUID();
    await db.insert(schema.jobs).values([
      {
        id: artifactId,
        userId: owner,
        toolId: "wt-single-cancel",
        pool: "image",
        type: "tool",
        status: "queued",
        inputRefs: [],
      },
      {
        id: clientJobId,
        userId: owner,
        type: "single",
        status: "queued",
        inputRefs: [],
        settings: { artifactJobId: artifactId },
      },
    ]);

    expect(await requestCancel(clientJobId)).toBe(true);
    expect((await jobRow(artifactId))?.status).toBe("canceled");
    expect((await jobRow(clientJobId))?.status).toBe("canceled");
    const frame = await terminalFrame(clientJobId);
    expect(frame.error).toBe("Canceled");
  });

  it("refuses a window-canceled run when it materializes (#886 round trip)", async () => {
    // The full sequence the factory produces: early stamp, cancel during
    // validation, then validation finishes and the run enqueues anyway.
    // The worker gate must refuse it without running the tool.
    const owner = await createOwner();
    const clientJobId = randomUUID();
    const jobId = randomUUID();
    await insertToolJobAlias({ jobId, clientJobId, userId: owner, pool: "image" });

    expect(await requestCancel(clientJobId)).toBe(true);
    expect((await jobRow(clientJobId))?.status).toBe("canceled");

    await enqueueSingleRun({
      jobId,
      mode: "fast",
      tag: "window-cancel",
      clientJobId,
      userId: owner,
    });
    expect((await terminalRow(jobId)).status).toBe("canceled");
    expect(invoked).not.toContain("window-cancel");
  });

  it("skips the guarded settle when the alias was re-pointed mid-cancel (#886)", async () => {
    // A cancel resolves the pointer, then a new run re-points the channel
    // before the settle lands. The settle carries the pointer it resolved;
    // a mismatch means the row now belongs to a run the user never
    // canceled, and it must be left alone.
    const owner = await createOwner();
    const clientJobId = randomUUID();
    const livePointer = randomUUID();
    await db.insert(schema.jobs).values({
      id: clientJobId,
      userId: owner,
      type: "single",
      status: "queued",
      inputRefs: [],
      settings: { artifactJobId: livePointer },
    });

    await cancelSingleJobGuarded({ jobId: clientJobId, expectedArtifactJobId: randomUUID() });
    expect((await jobRow(clientJobId))?.status).toBe("queued");

    await cancelSingleJobGuarded({ jobId: clientJobId, expectedArtifactJobId: livePointer });
    expect((await jobRow(clientJobId))?.status).toBe("canceled");
  });

  it("keeps a reused id's terminal state when the new run dies before enqueue (#886)", async () => {
    // The early stamp is insert-only: a conflict can only be a reused id,
    // and the previous run's terminal state (including the replayable
    // result) must survive until the new run proves viable at enqueue.
    // Resetting here would leave the channel replaying a live run forever
    // if the new run then dies in validation.
    const owner = await createOwner();
    const clientJobId = randomUUID();
    const first = await enqueueSingleRun({
      mode: "fast",
      tag: "reuse-dead-2",
      clientJobId,
      userId: owner,
    });
    await terminalRow(first.jobId);
    await terminalRow(clientJobId);

    // Run 2 stamps early, then dies in validation: nothing else happens.
    await insertToolJobAlias({
      jobId: randomUUID(),
      clientJobId,
      userId: owner,
      pool: "image",
    });

    const alias = await jobRow(clientJobId);
    expect(alias?.status).toBe("completed");
    expect(((alias?.settings ?? {}) as { artifactJobId?: string }).artifactJobId).toBe(first.jobId);
  });

  it("refuses a window-style cancel when the artifact is actively finishing (#886)", async () => {
    // The window arm's boundary: only absent-or-queued artifacts settle. A
    // processing artifact with no queue job is a run mid-write (or a
    // zombie); claiming canceled: true for it would be a lie, and the
    // publish would abort a worker the user never asked to stop.
    const owner = await createOwner();
    const clientJobId = randomUUID();
    const artifactId = randomUUID();
    await db.insert(schema.jobs).values([
      {
        id: artifactId,
        userId: owner,
        type: "tool",
        status: "processing",
        inputRefs: [],
      },
      {
        id: clientJobId,
        userId: owner,
        type: "single",
        status: "queued",
        inputRefs: [],
        settings: { artifactJobId: artifactId },
      },
    ]);

    const received = await collectCancelPublishes(async () => {
      expect(await requestCancel(clientJobId)).toBe(false);
    });
    expect(received).not.toContain(artifactId);
    expect((await jobRow(clientJobId))?.status).toBe("queued");
    expect((await jobRow(artifactId))?.status).toBe("processing");
  });

  it("refuses a window-style cancel over a completed artifact", async () => {
    // A crash between the worker's dual writes can leave the alias live
    // over a completed artifact; a cancel then must not repaint the
    // finished run as canceled.
    const owner = await createOwner();
    const clientJobId = randomUUID();
    const artifactId = randomUUID();
    await db.insert(schema.jobs).values([
      {
        id: artifactId,
        userId: owner,
        type: "tool",
        status: "completed",
        completedAt: new Date(),
        inputRefs: [],
      },
      {
        id: clientJobId,
        userId: owner,
        type: "single",
        status: "processing",
        inputRefs: [],
        settings: { artifactJobId: artifactId },
      },
    ]);

    expect(await requestCancel(clientJobId)).toBe(false);
    expect((await jobRow(artifactId))?.status).toBe("completed");
  });

  it("does not let a foreign stale cancel kill another user's run (#886 gate)", async () => {
    // Attacker-shaped reuse: user A's window-canceled alias still points at
    // A's never-run artifact. User B starts a run under the same id; the
    // upsert claim is skipped (foreign owner), so the alias stays A's,
    // canceled. The gate's pointer match must spare B's run.
    const ownerA = await createOwner();
    const clientJobId = randomUUID();
    await insertToolJobAlias({
      jobId: randomUUID(),
      clientJobId,
      userId: ownerA,
      pool: "image",
    });
    expect(await requestCancel(clientJobId)).toBe(true);

    const ownerB = await createOwner();
    const second = await enqueueSingleRun({
      mode: "fast",
      tag: "foreign-gate",
      clientJobId,
      userId: ownerB,
    });
    expect((await terminalRow(second.jobId)).status).toBe("completed");
    expect(invoked).toContain("foreign-gate");
  });

  it("does not let a stale window cancel kill a rerun under the same id (#886)", async () => {
    // Run 1 was canceled in its window; its alias row is canceled with
    // run 1's pointer. A rerun reusing the channel re-points and resets
    // the row, so the worker gate must let run 2 execute normally.
    const owner = await createOwner();
    const clientJobId = randomUUID();
    const firstJobId = randomUUID();
    await insertToolJobAlias({ jobId: firstJobId, clientJobId, userId: owner, pool: "image" });
    expect(await requestCancel(clientJobId)).toBe(true);

    const second = await enqueueSingleRun({
      mode: "fast",
      tag: "window-rerun",
      clientJobId,
      userId: owner,
    });
    expect((await terminalRow(second.jobId)).status).toBe("completed");
    expect(invoked).toContain("window-rerun");

    // The reset scrubbed run 1's stale error along with its status, so a
    // reconnecting client cannot replay the old cancel over run 2.
    expect((await jobRow(clientJobId))?.error).toBeNull();
  });

  it("keeps the direct server-id cancel path working with no clientJobId", async () => {
    const queue = getQueue("image");
    await queue.pause();
    let jobId: string;
    try {
      ({ jobId } = await enqueueSingleRun({ mode: "fast", tag: "direct-cancel" }));
      expect(await requestCancel(jobId)).toBe(true);
    } finally {
      await queue.resume();
    }
    expect((await jobRow(jobId))?.status).toBe("canceled");
    expect(invoked).not.toContain("direct-cancel");
  });

  it("settles the alias when a queued run is canceled by its server id (#885)", async () => {
    // The reverse direction of the alias resolution: an API caller who
    // cancels with the server id from the 200/202 payload must not strand
    // the SSE channel replaying a live run forever. Only the queued
    // removal needs this; active cancels dual-write through the worker.
    const clientJobId = randomUUID();
    const unrelatedAlias = randomUUID();
    const owner = await createOwner();
    await db.insert(schema.jobs).values({
      id: unrelatedAlias,
      userId: owner,
      type: "single",
      status: "queued",
      inputRefs: [],
      settings: { artifactJobId: randomUUID() },
    });

    const queue = getQueue("image");
    await queue.pause();
    let jobId: string;
    try {
      ({ jobId } = await enqueueSingleRun({
        mode: "fast",
        tag: "direct-alias",
        clientJobId,
        userId: owner,
      }));
      expect(await requestCancel(jobId)).toBe(true);
    } finally {
      await queue.resume();
    }

    expect((await jobRow(jobId))?.status).toBe("canceled");
    const alias = await jobRow(clientJobId);
    expect(alias?.status).toBe("canceled");
    // The settle stayed inside the route's authorization: the alias owner
    // is the artifact owner by construction.
    expect(alias?.userId).toBe(owner);
    const frame = await terminalFrame(clientJobId);
    expect(frame.phase).toBe("failed");
    expect(frame.error).toBe("Canceled");

    // Resolution is by pointer: a channel pointing at some other run is
    // not touched.
    expect((await jobRow(unrelatedAlias))?.status).toBe("queued");
  });

  it("keeps a committed direct-id cancel when the reverse settle faults (#885)", async () => {
    // The job removal and the server-row write already committed; a
    // faulted settle must not turn that into a 500. The alias stays
    // stranded until an alias-side cancel heals it off the canceled
    // artifact, which is the convergence this test walks end to end.
    const clientJobId = randomUUID();
    const queue = getQueue("image");
    await queue.pause();
    let jobId: string;
    guardedWriteFault.target = clientJobId;
    try {
      ({ jobId } = await enqueueSingleRun({ mode: "fast", tag: "reverse-fault", clientJobId }));
      expect(await requestCancel(jobId)).toBe(true);
      expect((await jobRow(jobId))?.status).toBe("canceled");
      expect((await jobRow(clientJobId))?.status).toBe("queued");
    } finally {
      guardedWriteFault.target = null;
      await queue.resume();
    }

    expect(await requestCancel(clientJobId)).toBe(true);
    expect((await jobRow(clientJobId))?.status).toBe("canceled");
  });

  it("keeps the ephemeral terminal frame on a direct-id active cancel", async () => {
    // API callers with no clientJobId ride the worker's publishEphemeral
    // branch; the alias dual write must not have stripped it.
    const { jobId } = await enqueueSingleRun({ mode: "slow", tag: "direct-active" });
    await waitFor(async () => (invoked.includes("direct-active") ? true : undefined));

    expect(await requestCancel(jobId)).toBe(true);
    expect((await terminalRow(jobId)).status).toBe("canceled");
    const frame = await terminalFrame(jobId);
    expect(frame.phase).toBe("failed");
    expect(frame.error).toBe("Canceled");
  });
});
