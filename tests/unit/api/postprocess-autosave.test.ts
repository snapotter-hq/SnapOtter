/**
 * autoSaveToLibrary's cancel seam (#2143). A user cancel that lands before the
 * version row has to stop the save, take back any blob it wrote, and reach the
 * worker's catch as a rejection. A cancel after the row is too late. Without a
 * cancel, a failure is logged and stays non-fatal to a job whose tool already
 * succeeded.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AutoSaveOpts } from "../../../apps/api/src/jobs/postprocess.js";

const stubs = vi.hoisted(() => ({
  parent: null as Record<string, unknown> | null,
  inserted: [] as Record<string, unknown>[],
  executedSql: [] as string[],
  saved: [] as string[],
  deleted: [] as string[],
  saveError: null as Error | null,
  deleteError: null as Error | null,
  insertError: null as Error | null,
  rollbackError: null as Error | null,
  txCommitError: null as Error | null,
  quotaError: null as string | null,
  // Each one aborts from inside a step of the save, so a test can place the
  // cancel on either side of the checks under test.
  abortDuringLookup: null as AbortController | null,
  abortDuringSave: null as AbortController | null,
  abortDuringProbe: null as AbortController | null,
  abortDuringQuota: null as AbortController | null,
  abortDuringInsert: null as AbortController | null,
  deleteParentDuringSave: false,
  claimFinalize: true,
}));

const claimFinalizeMock = vi.hoisted(() => vi.fn(async () => stubs.claimFinalize));
const releaseFinalizeMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../../apps/api/src/jobs/cancel.js", () => ({
  claimFinalize: claimFinalizeMock,
  releaseFinalize: releaseFinalizeMock,
}));

vi.mock("../../../apps/api/src/db/index.js", () => {
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => ({
            for: async () => (stubs.parent ? [stubs.parent] : []),
          }),
        }),
      }),
    }),
    execute: async (query: unknown) => {
      const text = String(query);
      stubs.executedSql.push(text);
      if (text.includes("ROLLBACK TO SAVEPOINT") && stubs.rollbackError) {
        throw stubs.rollbackError;
      }
    },
    insert: () => ({
      values: async (row: Record<string, unknown>) => {
        stubs.abortDuringInsert?.abort();
        if (stubs.insertError) throw stubs.insertError;
        stubs.inserted.push(row);
      },
    }),
    update: () => ({
      set: () => ({
        where: async () => {},
      }),
    }),
  };
  return {
    db: {
      select: () => ({
        from: () => ({
          where: async () => {
            stubs.abortDuringLookup?.abort();
            return stubs.parent ? [stubs.parent] : [];
          },
        }),
      }),
      transaction: async <T>(fn: (t: typeof tx) => Promise<T>) => {
        const res = await fn(tx);
        if (stubs.txCommitError) throw stubs.txCommitError;
        return res;
      },
    },
    schema: {
      jobs: {},
      userFiles: { id: "id" },
      users: { id: "id", storageUsed: "storageUsed" },
    },
  };
});

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => "eq"),
  sql: vi.fn((strings: TemplateStringsArray) => strings.join("?")),
}));

vi.mock("../../../apps/api/src/lib/quota.js", () => ({
  quotaRefusal: vi.fn(async () => {
    stubs.abortDuringQuota?.abort();
    return stubs.quotaError;
  }),
}));

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return { ...actual, putObject: vi.fn() };
});

vi.mock("sharp", () => ({
  default: vi.fn(() => ({
    metadata: async () => {
      stubs.abortDuringProbe?.abort();
      return { width: 640, height: 480 };
    },
  })),
}));

vi.mock("../../../apps/api/src/lib/file-storage.js", () => ({
  saveFile: async (_buffer: Buffer, originalName: string) => {
    if (stubs.saveError) throw stubs.saveError;
    const storedName = `stored-${originalName}`;
    stubs.saved.push(storedName);
    if (stubs.deleteParentDuringSave) stubs.parent = null;
    stubs.abortDuringSave?.abort();
    return storedName;
  },
  deleteStoredFile: async (storedName: string) => {
    if (stubs.deleteError) throw stubs.deleteError;
    stubs.deleted.push(storedName);
  },
}));

const loggerMock = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }));
vi.mock("../../../apps/api/src/lib/logger.js", () => ({ logger: loggerMock }));

const reportErrorMock = vi.hoisted(() => vi.fn());
vi.mock("../../../apps/api/src/lib/error-report.js", () => ({ reportError: reportErrorMock }));

const { autoSaveToLibrary, stageAutoSaveToLibrary } = await import(
  "../../../apps/api/src/jobs/postprocess.js"
);

const PARENT = {
  id: "file-1",
  userId: "user-1",
  version: 3,
  toolChain: ["resize"],
};

function opts(extra: Partial<AutoSaveOpts> = {}): AutoSaveOpts {
  return {
    fileId: "file-1",
    saveMode: "overwrite",
    userId: "user-1",
    buffer: Buffer.from("result"),
    outName: "out.pdf",
    // No pixel dimensions to probe, so neither sharp nor ffprobe runs.
    contentType: "application/pdf",
    toolId: "compress",
    jobId: "job-1",
    ...extra,
  };
}

beforeEach(() => {
  stubs.parent = PARENT;
  stubs.inserted.length = 0;
  stubs.executedSql.length = 0;
  stubs.saved.length = 0;
  stubs.deleted.length = 0;
  stubs.saveError = null;
  stubs.deleteError = null;
  stubs.insertError = null;
  stubs.rollbackError = null;
  stubs.txCommitError = null;
  stubs.quotaError = null;
  stubs.abortDuringLookup = null;
  stubs.abortDuringSave = null;
  stubs.abortDuringProbe = null;
  stubs.abortDuringQuota = null;
  stubs.abortDuringInsert = null;
  stubs.deleteParentDuringSave = false;
  stubs.claimFinalize = true;
  claimFinalizeMock.mockClear();
  releaseFinalizeMock.mockClear();
  loggerMock.error.mockReset();
  loggerMock.warn.mockReset();
  reportErrorMock.mockReset();
});

describe("autoSaveToLibrary under a user cancel (#2143)", () => {
  it("inserts the superseding version when no cancel landed", async () => {
    const res = await autoSaveToLibrary(opts({ userCancel: new AbortController().signal }));

    expect(res.fileId).toBeDefined();
    expect(res.error).toBeUndefined();
    expect(stubs.inserted).toHaveLength(1);
    expect(stubs.inserted[0]).toMatchObject({
      id: res.fileId,
      parentId: "file-1",
      version: 4,
      storedName: "stored-out.pdf",
      mimeType: "application/pdf",
      toolChain: ["resize", "compress"],
    });
    expect(stubs.deleted).toEqual([]);
    expect(claimFinalizeMock).toHaveBeenCalledWith("job-1");
    expect(releaseFinalizeMock).not.toHaveBeenCalled();
  });

  it.each([
    ["the file exists", PARENT],
    ["the file is gone", null],
  ])(
    "stops before writing anything when the cancel lands during the file lookup (%s)",
    async (_case, parent) => {
      stubs.parent = parent;
      const ac = new AbortController();
      stubs.abortDuringLookup = ac;

      await expect(autoSaveToLibrary(opts({ userCancel: ac.signal }))).rejects.toThrow("Canceled");

      expect(stubs.saved).toEqual([]);
      expect(stubs.inserted).toEqual([]);
      expect(stubs.deleted).toEqual([]);
      expect(loggerMock.warn).not.toHaveBeenCalled();
    },
  );

  it.each(["overwrite", "new"] as const)(
    "stops before the insert and takes the blob back when the cancel lands during the upload (saveMode %s)",
    async (saveMode) => {
      const ac = new AbortController();
      stubs.abortDuringSave = ac;

      await expect(autoSaveToLibrary(opts({ saveMode, userCancel: ac.signal }))).rejects.toThrow(
        "Canceled",
      );

      expect(stubs.saved).toEqual(["stored-out.pdf"]);
      expect(stubs.inserted).toEqual([]);
      expect(stubs.deleted).toEqual(["stored-out.pdf"]);
      // A cancel is not a failure: nothing logged, nothing reported.
      expect(loggerMock.warn).not.toHaveBeenCalled();
      expect(loggerMock.error).not.toHaveBeenCalled();
      expect(reportErrorMock).not.toHaveBeenCalled();
    },
  );

  it("checks after the dimension probe, so a cancel landing there stops the save too", async () => {
    const ac = new AbortController();
    stubs.abortDuringProbe = ac;

    await expect(
      autoSaveToLibrary(
        opts({ outName: "out.png", contentType: "image/png", userCancel: ac.signal }),
      ),
    ).rejects.toThrow("Canceled");

    expect(stubs.inserted).toEqual([]);
    expect(stubs.deleted).toEqual(["stored-out.png"]);
  });

  it("completes with the version when the cancel lands during the insert", async () => {
    // Past the check the version row is on its way, and the job completes
    // whatever lands after it: no rejection, no blob removal.
    const ac = new AbortController();
    stubs.abortDuringInsert = ac;

    const res = await autoSaveToLibrary(opts({ userCancel: ac.signal }));

    expect(ac.signal.aborted).toBe(true);
    expect(res.fileId).toBeDefined();
    expect(res.error).toBeUndefined();
    expect(stubs.inserted).toHaveLength(1);
    expect(stubs.inserted[0]).toMatchObject({ id: res.fileId, storedName: "stored-out.pdf" });
    expect(stubs.deleted).toEqual([]);
  });

  it("still refuses the insert, and says where the blob is, when the delete fails", async () => {
    const ac = new AbortController();
    stubs.abortDuringSave = ac;
    stubs.deleteError = new Error("injected storage outage");

    await expect(autoSaveToLibrary(opts({ userCancel: ac.signal }))).rejects.toThrow("Canceled");

    expect(stubs.inserted).toEqual([]);
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock.error).toHaveBeenCalledWith(
      {
        err: stubs.deleteError,
        jobId: "job-1",
        storedName: "stored-out.pdf",
        fileId: "file-1",
        toolId: "compress",
      },
      "canceled library auto-save could not remove its blob; it is an orphan",
    );
    // The orphan is logged once, as an orphan, not again as a failed save.
    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "SafeError",
        message: "Could not discard a staged upload",
        kind: "operational",
        code: "STAGED_DISCARD_FAILED",
        cause: stubs.deleteError,
      }),
      {
        source: "worker",
        toolId: "compress",
        jobId: "job-1",
        subsystem: "upload-storage",
      },
    );
  });

  it("discards the staged blob cleanly without reporting when quota rejects the save (#2583)", async () => {
    stubs.quotaError = "Storage quota exceeded. Please delete some files.";

    await expect(
      autoSaveToLibrary(opts({ userCancel: new AbortController().signal })),
    ).resolves.toEqual({
      error: "Storage quota exceeded. Please delete some files.",
    });

    expect(stubs.inserted).toEqual([]);
    expect(stubs.deleted).toEqual(["stored-out.pdf"]);
    expect(releaseFinalizeMock).toHaveBeenCalledWith("job-1");
    expect(loggerMock.error).not.toHaveBeenCalled();
    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("reports STAGED_DISCARD_FAILED when quota rejection cannot delete the staged blob (#2583)", async () => {
    stubs.quotaError = "Storage quota exceeded. Please delete some files.";
    stubs.deleteError = new Error("injected storage outage");

    await expect(autoSaveToLibrary(opts())).resolves.toEqual({
      error: "Storage quota exceeded. Please delete some files.",
    });

    expect(stubs.inserted).toEqual([]);
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock.error).toHaveBeenCalledWith(
      {
        err: stubs.deleteError,
        jobId: "job-1",
        storedName: "stored-out.pdf",
        fileId: "file-1",
        toolId: "compress",
      },
      "Failed to delete orphaned file during quota rejection",
    );
    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "SafeError",
        message: "Could not discard a staged upload",
        kind: "operational",
        code: "STAGED_DISCARD_FAILED",
        cause: stubs.deleteError,
      }),
      {
        source: "worker",
        toolId: "compress",
        jobId: "job-1",
        subsystem: "upload-storage",
      },
    );
  });

  it("reports STAGED_DISCARD_FAILED and throws Canceled when quota rejection and cancel coincide and blob delete fails (#2583)", async () => {
    const ac = new AbortController();
    stubs.abortDuringQuota = ac;
    stubs.quotaError = "Storage quota exceeded. Please delete some files.";
    stubs.deleteError = new Error("injected storage outage");

    await expect(autoSaveToLibrary(opts({ userCancel: ac.signal }))).rejects.toThrow("Canceled");

    expect(stubs.inserted).toEqual([]);
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock.error).toHaveBeenCalledWith(
      {
        err: stubs.deleteError,
        jobId: "job-1",
        storedName: "stored-out.pdf",
        fileId: "file-1",
        toolId: "compress",
      },
      "Failed to delete orphaned file during quota rejection",
    );
    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "SafeError",
        message: "Could not discard a staged upload",
        kind: "operational",
        code: "STAGED_DISCARD_FAILED",
        cause: stubs.deleteError,
      }),
      {
        source: "worker",
        toolId: "compress",
        jobId: "job-1",
        subsystem: "upload-storage",
      },
    );
  });

  it("reports both STAGED_DISCARD_FAILED and the save fault when transaction error cleanup fails (#2583)", async () => {
    stubs.insertError = new Error("injected insert outage");
    stubs.deleteError = new Error("injected storage outage");

    await expect(autoSaveToLibrary(opts())).resolves.toEqual({
      error: "An unexpected system error prevented saving to your library.",
    });

    expect(stubs.inserted).toEqual([]);
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock.error).toHaveBeenCalledWith(
      {
        err: stubs.deleteError,
        jobId: "job-1",
        storedName: "stored-out.pdf",
        fileId: "file-1",
        toolId: "compress",
      },
      "Failed to delete orphaned file after auto-save error",
    );
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(reportErrorMock).toHaveBeenCalledTimes(2);
    expect(reportErrorMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        name: "SafeError",
        message: "Could not discard a staged upload",
        kind: "operational",
        code: "STAGED_DISCARD_FAILED",
        cause: stubs.deleteError,
      }),
      {
        source: "worker",
        toolId: "compress",
        jobId: "job-1",
        subsystem: "upload-storage",
      },
    );
    expect(reportErrorMock).toHaveBeenNthCalledWith(2, stubs.insertError, {
      source: "worker",
      toolId: "compress",
      jobId: "job-1",
    });
  });

  it("keeps a failed save non-fatal and logs the blob it wrote when no cancel landed", async () => {
    stubs.insertError = new Error("injected insert outage");

    await expect(
      autoSaveToLibrary(opts({ userCancel: new AbortController().signal })),
    ).resolves.toEqual({
      error: "An unexpected system error prevented saving to your library.",
    });

    expect(stubs.deleted).toEqual(["stored-out.pdf"]);
    expect(releaseFinalizeMock).toHaveBeenCalledWith("job-1");
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        err: stubs.insertError,
        jobId: "job-1",
        storedName: "stored-out.pdf",
        fileId: "file-1",
      }),
      expect.stringContaining("auto-save failed"),
    );
  });

  it("treats a fault that merely says Canceled as a failed save, not a cancel", async () => {
    // Only the save's own cancel may escape; matching on the message would let
    // any error with that text skip the log and fail the job.
    stubs.insertError = new Error("Canceled");

    await expect(
      autoSaveToLibrary(opts({ userCancel: new AbortController().signal })),
    ).resolves.toEqual({
      error: "An unexpected system error prevented saving to your library.",
    });

    expect(stubs.deleted).toEqual(["stored-out.pdf"]);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: stubs.insertError, storedName: "stored-out.pdf" }),
      expect.stringContaining("auto-save failed"),
    );
  });

  it("logs a save failure that coincides with a cancel, then rejects so the job settles canceled", async () => {
    // The insert faults while a cancel lands. The fault must not be lost
    // behind the cancel, and the cancel must not be lost behind the fault.
    const ac = new AbortController();
    stubs.abortDuringInsert = ac;
    stubs.insertError = new Error("injected insert outage");

    await expect(autoSaveToLibrary(opts({ userCancel: ac.signal }))).rejects.toBe(
      stubs.insertError,
    );

    expect(stubs.inserted).toEqual([]);
    expect(stubs.deleted).toEqual(["stored-out.pdf"]);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        err: stubs.insertError,
        jobId: "job-1",
        storedName: "stored-out.pdf",
      }),
      expect.stringContaining("auto-save failed"),
    );
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock).toHaveBeenCalledWith(stubs.insertError, {
      source: "worker",
      toolId: "compress",
      jobId: "job-1",
    });
  });

  it("reports both STAGED_DISCARD_FAILED and the save fault, then rejects when transaction error, cancel, and blob delete failure all coincide (#2583)", async () => {
    const ac = new AbortController();
    stubs.abortDuringInsert = ac;
    stubs.insertError = new Error("injected insert outage");
    stubs.deleteError = new Error("injected storage outage");

    await expect(autoSaveToLibrary(opts({ userCancel: ac.signal }))).rejects.toBe(
      stubs.insertError,
    );

    expect(stubs.inserted).toEqual([]);
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(reportErrorMock).toHaveBeenCalledTimes(2);
    expect(reportErrorMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        name: "SafeError",
        message: "Could not discard a staged upload",
        kind: "operational",
        code: "STAGED_DISCARD_FAILED",
        cause: stubs.deleteError,
      }),
      {
        source: "worker",
        toolId: "compress",
        jobId: "job-1",
        subsystem: "upload-storage",
      },
    );
    expect(reportErrorMock).toHaveBeenNthCalledWith(2, stubs.insertError, {
      source: "worker",
      toolId: "compress",
      jobId: "job-1",
    });
  });

  it("stops before the insert and takes the blob back when claimFinalize loses to a cancel (#2349)", async () => {
    stubs.claimFinalize = false;
    const ac = new AbortController();

    await expect(autoSaveToLibrary(opts({ userCancel: ac.signal }))).rejects.toThrow("Canceled");

    expect(claimFinalizeMock).toHaveBeenCalledWith("job-1");
    expect(stubs.saved).toEqual(["stored-out.pdf"]);
    expect(stubs.inserted).toEqual([]);
    expect(stubs.deleted).toEqual(["stored-out.pdf"]);
    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(loggerMock.error).not.toHaveBeenCalled();
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("saves as before when no signal is given", async () => {
    // The inline remove-background route has no cancel to pass.
    const res = await autoSaveToLibrary(opts());

    expect(res.fileId).toBeDefined();
    expect(stubs.inserted).toHaveLength(1);
    expect(claimFinalizeMock).not.toHaveBeenCalled();
  });

  it("does nothing without a fileId", async () => {
    await expect(autoSaveToLibrary({ ...opts(), fileId: undefined })).resolves.toEqual({});

    expect(stubs.saved).toEqual([]);
    expect(stubs.inserted).toEqual([]);
  });

  it("discards the staged blob via onAbort when the outer completion transaction rolls back (#2350)", async () => {
    const { db } = await import("../../../apps/api/src/db/index.js");
    const staged = await stageAutoSaveToLibrary(opts({ userCancel: new AbortController().signal }));
    expect(staged.finalizeClaimed).toBe(true);
    expect(stubs.saved).toEqual(["stored-out.pdf"]);
    expect(stubs.inserted).toEqual([]);

    await expect(
      db.transaction(async (tx) => {
        const res = await staged.commit?.(tx);
        expect(res?.fileId).toBeDefined();
        throw new Error("outer completion commit failed");
      }),
    ).rejects.toThrow("outer completion commit failed");

    await staged.onAbort?.();
    // Calling onAbort a second time is a no-op rather than a duplicate delete.
    await staged.onAbort?.();

    expect(stubs.deleted).toEqual(["stored-out.pdf"]);
    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(loggerMock.error).not.toHaveBeenCalled();
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("reports STAGED_DISCARD_FAILED with the cancel message when onAbort cannot remove the blob after a canceled commit fault (#2350)", async () => {
    const { db } = await import("../../../apps/api/src/db/index.js");
    const ac = new AbortController();
    const staged = await stageAutoSaveToLibrary(opts({ userCancel: ac.signal }));
    stubs.deleteError = new Error("injected storage outage");

    await expect(
      db.transaction(async (tx) => {
        await staged.commit?.(tx);
        ac.abort();
        throw new Error("outer completion commit failed");
      }),
    ).rejects.toThrow("outer completion commit failed");

    await staged.onAbort?.();

    expect(loggerMock.error).toHaveBeenCalledWith(
      {
        err: stubs.deleteError,
        jobId: "job-1",
        storedName: "stored-out.pdf",
        fileId: "file-1",
        toolId: "compress",
      },
      "canceled library auto-save could not remove its blob; it is an orphan",
    );
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
  });

  it("wraps save queries in SAVEPOINT autosave_library and rethrows when ROLLBACK TO SAVEPOINT fails (#2350)", async () => {
    const { db } = await import("../../../apps/api/src/db/index.js");
    const stagedOk = await stageAutoSaveToLibrary(opts());
    await db.transaction(async (tx) => {
      await stagedOk.commit?.(tx);
    });
    expect(stubs.executedSql).toEqual([
      "SAVEPOINT autosave_library",
      "RELEASE SAVEPOINT autosave_library",
    ]);

    stubs.executedSql.length = 0;
    stubs.insertError = new Error("fk violation");
    const stagedRecover = await stageAutoSaveToLibrary(opts());
    await db.transaction(async (tx) => {
      const res = await stagedRecover.commit?.(tx);
      expect(res?.error).toBe("An unexpected system error prevented saving to your library.");
    });
    expect(stubs.executedSql).toEqual([
      "SAVEPOINT autosave_library",
      "ROLLBACK TO SAVEPOINT autosave_library",
      "RELEASE SAVEPOINT autosave_library",
    ]);

    // When ROLLBACK TO SAVEPOINT itself fails (connection lost / fatal tx error),
    // commit(tx) rethrows the original error instead of returning normally so the
    // outer transaction aborts with its root cause rather than a secondary 25P02.
    stubs.executedSql.length = 0;
    stubs.insertError = new Error("connection terminated");
    stubs.rollbackError = new Error("cannot rollback savepoint");
    const stagedFatal = await stageAutoSaveToLibrary(opts());
    await expect(
      db.transaction(async (tx) => {
        await stagedFatal.commit?.(tx);
      }),
    ).rejects.toThrow("connection terminated");
  });

  it("handles a staging saveFile error, outer transaction commit rejection, and releaseFinalize warning (#2350)", async () => {
    stubs.saveError = new Error("disk full during stage");
    await expect(autoSaveToLibrary(opts())).resolves.toEqual({
      error: "An unexpected system error prevented saving to your library.",
    });
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: stubs.saveError }),
      "library auto-save failed; no library copy was made",
    );
    expect(reportErrorMock).toHaveBeenCalledWith(stubs.saveError, {
      source: "worker",
      toolId: "compress",
      jobId: "job-1",
    });

    stubs.saveError = null;
    loggerMock.warn.mockReset();
    loggerMock.error.mockReset();
    reportErrorMock.mockReset();
    stubs.txCommitError = new Error("outer COMMIT failed");
    stubs.deleteError = new Error("unlink failed on commit error");
    const releaseErr = new Error("redis release failed");
    releaseFinalizeMock.mockRejectedValueOnce(releaseErr);

    await expect(
      autoSaveToLibrary(opts({ userCancel: new AbortController().signal })),
    ).resolves.toEqual({
      error: "An unexpected system error prevented saving to your library.",
    });
    expect(loggerMock.warn).toHaveBeenCalledWith(
      { err: releaseErr, jobId: "job-1", toolId: "compress" },
      "failed to release finalize claim after auto-save error",
    );
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: stubs.deleteError, storedName: "stored-out.pdf" }),
      "Failed to delete orphaned file after auto-save error",
    );
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: stubs.txCommitError, storedName: "stored-out.pdf" }),
      "library auto-save failed; no library copy was made",
    );
    expect(reportErrorMock).toHaveBeenCalledWith(stubs.txCommitError, {
      source: "worker",
      toolId: "compress",
      jobId: "job-1",
    });
  });

  it("skips the version insert and discards the staged blob when the parent file is deleted during an overwrite save (#2927)", async () => {
    stubs.deleteParentDuringSave = true;

    await expect(
      autoSaveToLibrary(opts({ userCancel: new AbortController().signal })),
    ).resolves.toEqual({});

    expect(stubs.saved).toEqual(["stored-out.pdf"]);
    expect(stubs.inserted).toEqual([]);
    expect(stubs.deleted).toEqual(["stored-out.pdf"]);
    expect(stubs.executedSql).toEqual([
      "SAVEPOINT autosave_library",
      "RELEASE SAVEPOINT autosave_library",
    ]);
    expect(releaseFinalizeMock).toHaveBeenCalledWith("job-1");
    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(loggerMock.error).not.toHaveBeenCalled();
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("still inserts an independent root copy when the source file is deleted during a save-as-new run (#2927)", async () => {
    stubs.deleteParentDuringSave = true;

    const res = await autoSaveToLibrary(opts({ saveMode: "new" }));

    expect(res.fileId).toBeDefined();
    expect(stubs.inserted).toHaveLength(1);
    expect(stubs.inserted[0]).toMatchObject({
      id: res.fileId,
      parentId: null,
      version: 1,
      storedName: "stored-out.pdf",
      toolChain: ["resize", "compress"],
    });
    expect(stubs.deleted).toEqual([]);
  });

  it("reports STAGED_DISCARD_FAILED and throws Canceled when parent deletion and cancel or outer abort coincide (#2927)", async () => {
    stubs.deleteParentDuringSave = true;
    stubs.deleteError = new Error("injected storage outage");

    await expect(autoSaveToLibrary(opts())).resolves.toEqual({});

    expect(stubs.inserted).toEqual([]);
    expect(loggerMock.error).toHaveBeenCalledWith(
      {
        err: stubs.deleteError,
        jobId: "job-1",
        storedName: "stored-out.pdf",
        fileId: "file-1",
        toolId: "compress",
      },
      "Failed to delete orphaned file after parent file was deleted",
    );
    expect(reportErrorMock).toHaveBeenCalledTimes(1);

    stubs.parent = PARENT;
    stubs.saved.length = 0;
    stubs.deleted.length = 0;
    loggerMock.error.mockReset();
    reportErrorMock.mockReset();
    const ac = new AbortController();
    stubs.abortDuringQuota = ac;

    await expect(autoSaveToLibrary(opts({ userCancel: ac.signal }))).rejects.toThrow("Canceled");

    expect(stubs.inserted).toEqual([]);
    expect(loggerMock.error).toHaveBeenCalledWith(
      {
        err: stubs.deleteError,
        jobId: "job-1",
        storedName: "stored-out.pdf",
        fileId: "file-1",
        toolId: "compress",
      },
      "canceled library auto-save could not remove its blob; it is an orphan",
    );
    expect(reportErrorMock).toHaveBeenCalledTimes(1);

    stubs.parent = PARENT;
    stubs.abortDuringQuota = null;
    stubs.deleteError = null;
    stubs.saved.length = 0;
    stubs.deleted.length = 0;
    loggerMock.error.mockReset();
    loggerMock.warn.mockReset();
    reportErrorMock.mockReset();

    const { db } = await import("../../../apps/api/src/db/index.js");
    const staged = await stageAutoSaveToLibrary(opts());
    await expect(
      db.transaction(async (tx) => {
        const res = await staged.commit?.(tx);
        expect(res).toEqual({});
        throw new Error("outer completion commit failed");
      }),
    ).rejects.toThrow("outer completion commit failed");

    await staged.onAbort?.(new Error("outer completion commit failed"));
    expect(stubs.deleted).toEqual(["stored-out.pdf"]);
    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("normalizes application/postscript to image/x-eps on user_files insert (#3223)", async () => {
    const res = await autoSaveToLibrary(
      opts({
        outName: "figure_convert.eps",
        contentType: "application/postscript",
        toolId: "convert",
      }),
    );

    expect(res.fileId).toBeDefined();
    expect(stubs.inserted).toHaveLength(1);
    expect(stubs.inserted[0]).toMatchObject({
      id: res.fileId,
      originalName: "figure_convert.eps",
      storedName: "stored-figure_convert.eps",
      mimeType: "image/x-eps",
    });
  });
});
