import { afterEach, describe, expect, it, vi } from "vitest";

const objectStorageMocks = vi.hoisted(() => ({
  copyObjectToFile: vi.fn(),
  deletePrefix: vi.fn(),
  getObjectBuffer: vi.fn(),
  getObjectSize: vi.fn(),
  // Stands in for the real predicate (covered in object-storage-fault.test.ts):
  // local-backend semantics, where a missing object is a bare ENOENT.
  isMissingObjectError: vi.fn((err: unknown) => (err as { code?: string })?.code === "ENOENT"),
  putObject: vi.fn(),
}));

function enoent(path: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`ENOENT: no such file or directory, open '${path}'`), {
    code: "ENOENT",
    syscall: "open",
    errno: -2,
  });
}

/** The stat-probe rejection for a queued input that is no longer stored. */
function gone(name: string): NodeJS.ErrnoException {
  return Object.assign(enoent(`/data/workspace/uploads/job-1/${name}`), { syscall: "stat" });
}

async function loadWorker(basePath = "", extraMocks?: () => void) {
  vi.resetModules();

  vi.doMock("node:fs/promises", () => ({
    mkdir: vi.fn(),
    readFile: vi.fn(),
    rm: vi.fn(),
  }));

  const { SafeError, isSafeMessageError, isToolInputError, hasServerErrorStatus } =
    await vi.importActual<typeof import("../../../../packages/shared/src/tool-errors.js")>(
      "../../../../packages/shared/src/tool-errors.js",
    );
  vi.doMock("@snapotter/shared", () => ({
    SafeError,
    isSafeMessageError,
    isToolInputError,
    hasServerErrorStatus,
    ANALYTICS_EVENTS: {},
    TOOLS: [],
    // pdf-producer.ts builds its scrub set from COMPRESS_PRESETS at load.
    COMPRESS_PRESETS: [],
    getBundleForTool: vi.fn(() => null),
    getOptionalBundleForTool: vi.fn(() => null),
  }));

  vi.doMock("bullmq", () => ({
    UnrecoverableError: class UnrecoverableError extends Error {},
    Worker: vi.fn(() => ({
      on: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    })),
  }));

  vi.doMock("drizzle-orm", () => ({
    and: vi.fn((...conds: unknown[]) => ({ op: "and", conds })),
    eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
    notInArray: vi.fn((col: unknown, vals: unknown) => ({ op: "notInArray", col, vals })),
  }));

  vi.doMock("../../../../apps/api/src/config.js", () => ({
    env: {
      BASE_PATH: basePath,
      SCRATCH_PATH: "",
      JOB_TIMEOUT_LONG_S: 60,
      JOB_TIMEOUT_FAST_S: 15,
    },
  }));

  vi.doMock("../../../../apps/api/src/db/index.js", () => ({
    db: {},
    schema: { jobs: {} },
  }));

  vi.doMock("../../../../apps/api/src/lib/analytics.js", () => ({
    captureException: vi.fn(),
    trackEvent: vi.fn(),
  }));

  vi.doMock("../../../../apps/api/src/lib/analytics-gate.js", () => ({
    analyticsEnabled: vi.fn(() => false),
  }));

  vi.doMock("../../../../apps/api/src/lib/env.js", () => ({
    resolveConcurrency: vi.fn(() => 2),
  }));

  vi.doMock("../../../../apps/api/src/lib/errors.js", () => ({
    friendlyError: vi.fn((message: string) => message),
  }));

  vi.doMock("../../../../apps/api/src/lib/logger.js", () => ({
    logger: {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
  }));

  vi.doMock("../../../../apps/api/src/lib/metrics.js", () => ({
    jobDuration: { observe: vi.fn() },
    jobsTotal: { inc: vi.fn() },
  }));

  vi.doMock("../../../../apps/api/src/lib/object-storage.js", () => ({
    ...objectStorageMocks,
  }));

  vi.doMock("../../../../apps/api/src/routes/progress.js", () => ({
    publishEphemeral: vi.fn(),
    updateSingleFileProgress: vi.fn(),
    updateSingleFileProgressAtomically: vi.fn(),
  }));

  vi.doMock("../../../../apps/api/src/routes/tool-factory.js", () => ({
    getToolConfig: vi.fn(),
  }));

  vi.doMock("../../../../apps/api/src/jobs/ai-handlers.js", () => ({
    hasAiJobHandler: vi.fn(() => false),
    runAiToolJob: vi.fn(),
  }));

  vi.doMock("../../../../apps/api/src/jobs/batch-progress.js", () => ({
    recordChildOutcome: vi.fn(),
  }));

  vi.doMock("../../../../apps/api/src/jobs/cancel.js", () => ({
    claimFinalize: vi.fn(async () => true),
    registerCancelable: vi.fn(() => new AbortController()),
    releaseFinalize: vi.fn(async () => {}),
    unregisterCancelable: vi.fn(),
    userCancelSignal: vi.fn(() => new AbortController().signal),
    wasUserCanceled: vi.fn(() => false),
  }));

  vi.doMock("../../../../apps/api/src/jobs/connection.js", () => ({
    createBullMQConnection: vi.fn(() => ({})),
  }));

  vi.doMock("../../../../apps/api/src/jobs/postprocess.js", () => ({
    autoSaveToLibrary: vi.fn(),
    buildOutputName: vi.fn(),
    generatePreview: vi.fn(),
  }));

  vi.doMock("../../../../apps/api/src/jobs/system-jobs.js", () => ({
    runSystemJob: vi.fn(),
    SYSTEM_JOBS: {
      storageTtl: "system:storage-ttl",
      sessionPurge: "system:session-purge",
      retention: "system:retention",
      siemForward: "system:siem-forward",
      auditArchive: "system:audit-archive",
      storageReconciliation: "system:storage-reconciliation",
      jobReconciliation: "system:job-reconciliation",
      gdprExport: "system:gdpr-export",
      alertEvaluator: "system:alert-evaluator",
    },
  }));

  extraMocks?.();

  return import("../../../../apps/api/src/jobs/worker.js");
}

describe("worker result payload behavior", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("rejects an oversized OCR image object before buffering it", async () => {
    objectStorageMocks.getObjectSize.mockResolvedValueOnce(512 * 1024 * 1024 + 1);
    const { loadToolInputBuffer } = await loadWorker();

    await expect(loadToolInputBuffer("ocr", "uploads/job-1/input.bin")).rejects.toMatchObject({
      name: "InputValidationError",
      statusCode: 413,
      message: "OCR input exceeds the 512 MB safety limit",
    });
    expect(objectStorageMocks.getObjectBuffer).not.toHaveBeenCalled();
  });

  it("maps an oversized streamed OCR PDF object to the OCR input limit", async () => {
    objectStorageMocks.copyObjectToFile.mockRejectedValueOnce(
      Object.assign(new Error("too large"), { statusCode: 413 }),
    );
    const { loadToolInputs } = await loadWorker();

    await expect(
      loadToolInputs(
        "ocr-pdf",
        ["uploads/job-1/scan.pdf"],
        "scan.pdf",
        "/tmp/job-1",
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      name: "InputValidationError",
      statusCode: 413,
      message: "OCR input exceeds the 512 MB safety limit",
    });
    expect(objectStorageMocks.getObjectBuffer).not.toHaveBeenCalled();
  });

  it("loads OCR PDF input as a bounded scratch path without buffering it", async () => {
    objectStorageMocks.copyObjectToFile.mockResolvedValueOnce(42);
    const controller = new AbortController();
    const { loadToolInputs } = await loadWorker();

    await expect(
      loadToolInputs(
        "ocr-pdf",
        ["uploads/job-1/scan.pdf"],
        "scan.pdf",
        "/tmp/job-1",
        controller.signal,
      ),
    ).resolves.toEqual({
      inputs: [],
      pathInput: { path: "/tmp/job-1/input.pdf", size: 42 },
      originalSize: 42,
    });

    expect(objectStorageMocks.copyObjectToFile).toHaveBeenCalledWith(
      "uploads/job-1/scan.pdf",
      "/tmp/job-1/input.pdf",
      {
        maxBytes: 512 * 1024 * 1024,
        signal: controller.signal,
      },
    );
    expect(objectStorageMocks.getObjectBuffer).not.toHaveBeenCalled();
  });

  it("loads OCR objects at the encoded-size boundary and leaves other tools unchanged", async () => {
    objectStorageMocks.getObjectSize.mockResolvedValueOnce(512 * 1024 * 1024);
    objectStorageMocks.getObjectBuffer.mockResolvedValue(Buffer.from("ocr"));
    const { loadToolInputBuffer } = await loadWorker();

    await expect(loadToolInputBuffer("ocr", "uploads/job-1/scan.tiff")).resolves.toEqual(
      Buffer.from("ocr"),
    );
    await expect(loadToolInputBuffer("compress", "uploads/job-2/photo.png")).resolves.toEqual(
      Buffer.from("ocr"),
    );
    expect(objectStorageMocks.getObjectSize).toHaveBeenCalledTimes(1);
    expect(objectStorageMocks.getObjectBuffer).toHaveBeenCalledTimes(2);
  });

  // #901: an input that vanished between enqueue and run (TTL sweep behind a
  // backed-up queue, a team deleteAfter deadline, a GDPR erase) surfaced as a
  // raw, stackless "ENOENT open" that Sentry filed as a code bug.
  describe("missing queued input (#901)", () => {
    const missingInput = {
      name: "SafeError",
      isSafeMessage: true,
      kind: "operational",
      code: "INPUT_MISSING",
      statusCode: 410,
      message: "Input file is no longer available. Upload it again.",
    };

    it("turns a vanished buffered input into an operational input-missing error", async () => {
      const cause = enoent("/data/workspace/uploads/job-1/photo.jpg");
      objectStorageMocks.getObjectBuffer.mockRejectedValueOnce(cause);
      objectStorageMocks.getObjectSize.mockRejectedValueOnce(gone("photo.jpg"));
      const { loadToolInputs } = await loadWorker();

      const err = await loadToolInputs(
        "image-enhancement",
        ["uploads/job-1/photo.jpg"],
        "photo.jpg",
        "/tmp/job-1",
        new AbortController().signal,
      ).catch((e: unknown) => e);

      expect(err).toMatchObject(missingInput);
      expect((err as Error).cause).toBe(cause);
      // The client-facing message must not carry the server path.
      expect((err as Error).message).not.toContain("/data/");
    });

    it("fails the whole load when any one of several inputs is gone", async () => {
      objectStorageMocks.getObjectBuffer
        .mockResolvedValueOnce(Buffer.from("first"))
        .mockRejectedValueOnce(enoent("/data/workspace/uploads/job-1/second.png"));
      // The confirmation probe runs per ref, in order: first is still there.
      objectStorageMocks.getObjectSize
        .mockResolvedValueOnce(5)
        .mockRejectedValueOnce(gone("second.png"));
      const { loadToolInputs } = await loadWorker();

      await expect(
        loadToolInputs(
          "collage",
          ["uploads/job-1/first.png", "uploads/job-1/second.png"],
          "first.png",
          "/tmp/job-1",
          new AbortController().signal,
        ),
      ).rejects.toMatchObject(missingInput);
    });

    it("turns a vanished OCR PDF input into the same error on the path-backed loader", async () => {
      objectStorageMocks.copyObjectToFile.mockRejectedValueOnce(
        enoent("/data/workspace/uploads/job-1/scan.pdf"),
      );
      objectStorageMocks.getObjectSize.mockRejectedValueOnce(gone("scan.pdf"));
      const { loadToolInputs } = await loadWorker();

      await expect(
        loadToolInputs(
          "ocr-pdf",
          ["uploads/job-1/scan.pdf"],
          "scan.pdf",
          "/tmp/job-1",
          new AbortController().signal,
        ),
      ).rejects.toMatchObject(missingInput);
    });

    it("turns a vanished OCR image into the same error when the size probe finds nothing", async () => {
      // Once for the OCR size limit, once for the confirmation probe.
      objectStorageMocks.getObjectSize
        .mockRejectedValueOnce(gone("scan.tiff"))
        .mockRejectedValueOnce(gone("scan.tiff"));
      const { loadToolInputs } = await loadWorker();

      await expect(
        loadToolInputs(
          "ocr",
          ["uploads/job-1/scan.tiff"],
          "scan.tiff",
          "/tmp/job-1",
          new AbortController().signal,
        ),
      ).rejects.toMatchObject(missingInput);
    });

    it("leaves a storage fault that is not a missing object untouched", async () => {
      const denied = Object.assign(new Error("EACCES: permission denied"), {
        code: "EACCES",
        syscall: "open",
      });
      objectStorageMocks.getObjectBuffer.mockRejectedValueOnce(denied);
      const { loadToolInputs } = await loadWorker();

      await expect(
        loadToolInputs(
          "image-enhancement",
          ["uploads/job-1/photo.jpg"],
          "photo.jpg",
          "/tmp/job-1",
          new AbortController().signal,
        ),
      ).rejects.toBe(denied);
    });

    it("keeps an ENOENT from our own scratch write a raw error while the input is still stored", async () => {
      // The OCR PDF copy writes to scratch; a missing scratch path is our bug.
      const scratchMiss = enoent("/tmp/job-1/input.pdf.partial");
      objectStorageMocks.copyObjectToFile.mockRejectedValueOnce(scratchMiss);
      objectStorageMocks.getObjectSize.mockResolvedValueOnce(42);
      const { loadToolInputs } = await loadWorker();

      await expect(
        loadToolInputs(
          "ocr-pdf",
          ["uploads/job-1/scan.pdf"],
          "scan.pdf",
          "/tmp/job-1",
          new AbortController().signal,
        ),
      ).rejects.toBe(scratchMiss);
    });

    it("keeps the raw error when the confirmation probe itself faults", async () => {
      const cause = enoent("/data/workspace/uploads/job-1/photo.jpg");
      objectStorageMocks.getObjectBuffer.mockRejectedValueOnce(cause);
      objectStorageMocks.getObjectSize.mockRejectedValueOnce(
        Object.assign(new Error("EACCES: permission denied"), { code: "EACCES", syscall: "stat" }),
      );
      const { loadToolInputs } = await loadWorker();

      await expect(
        loadToolInputs(
          "image-enhancement",
          ["uploads/job-1/photo.jpg"],
          "photo.jpg",
          "/tmp/job-1",
          new AbortController().signal,
        ),
      ).rejects.toBe(cause);
    });

    it("keeps the OCR PDF size-limit mapping ahead of the missing-input check", async () => {
      objectStorageMocks.copyObjectToFile.mockRejectedValueOnce(
        Object.assign(new Error("too large"), { statusCode: 413 }),
      );
      const { loadToolInputs } = await loadWorker();

      await expect(
        loadToolInputs(
          "ocr-pdf",
          ["uploads/job-1/scan.pdf"],
          "scan.pdf",
          "/tmp/job-1",
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ name: "InputValidationError", statusCode: 413 });
    });
  });

  // Result URLs are persisted with the job, so they must not depend on the
  // deployment path (#1274): the web app resolves them against its own base.
  it.each(["", "/snapotter"])(
    "builds root-relative links under BASE_PATH '%s'",
    async (basePath) => {
      const { buildLegacyResultPayload } = await loadWorker(basePath);

      expect(
        buildLegacyResultPayload(
          {
            outputRefs: ["outputs/job-1/report final.pdf"],
            filename: "report final.pdf",
            contentType: "application/pdf",
            originalSize: 100,
            processedSize: 80,
            previewRef: "outputs/job-1/preview.png",
            savedFileId: "file-2",
            resultPayload: { pageCount: 3 },
          },
          "job-1",
        ),
      ).toEqual({
        jobId: "job-1",
        downloadUrl: "/api/v1/download/job-1/report%20final.pdf",
        previewUrl: "/api/v1/download/job-1/preview.png",
        originalSize: 100,
        processedSize: 80,
        savedFileId: "file-2",
        pageCount: 3,
      });
    },
  );

  it("omits optional legacy payload fields when the job result does not include them", async () => {
    const { buildLegacyResultPayload } = await loadWorker();

    expect(
      buildLegacyResultPayload(
        {
          outputRefs: ["outputs/job-2/out.png"],
          filename: "out.png",
          contentType: "image/png",
          originalSize: 10,
          processedSize: 8,
        },
        "job-2",
      ),
    ).toEqual({
      jobId: "job-2",
      downloadUrl: "/api/v1/download/job-2/out.png",
      originalSize: 10,
      processedSize: 8,
    });
  });

  it("writes outputs/<jobId>/.result-payload.json before the primary output only when resultPayload is non-empty (#1389)", async () => {
    const processV2Mock = vi.fn();
    const dbSetMock = vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    }));
    const generatePreviewMock = vi.fn().mockResolvedValue(undefined);
    const workerMod = await loadWorker("", () => {
      vi.doMock("node:fs/promises", () => ({
        mkdir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn(),
        rm: vi.fn().mockResolvedValue(undefined),
      }));
      vi.doMock("../../../../apps/api/src/db/index.js", () => ({
        db: {
          update: vi.fn(() => ({
            set: dbSetMock,
          })),
        },
        schema: { jobs: { id: "jobs.id" } },
      }));
      vi.doMock("../../../../apps/api/src/routes/tool-factory.js", () => ({
        getToolConfig: vi.fn(() => ({ processV2: processV2Mock })),
      }));
      vi.doMock("../../../../apps/api/src/jobs/ai-handlers.js", () => ({
        hasAiJobHandler: vi.fn(() => false),
        hasAiPathJobHandler: vi.fn(() => false),
        runAiToolJob: vi.fn(),
        runAiPathToolJob: vi.fn(),
      }));
      vi.doMock("../../../../apps/api/src/jobs/postprocess.js", () => ({
        autoSaveToLibrary: vi.fn().mockResolvedValue({}),
        buildOutputName: vi.fn((out: string) => out),
        generatePreview: generatePreviewMock,
      }));
      vi.doMock("@snapotter/media-engine", () => ({
        HW_ACCEL_FAMILIES: [],
        hwAccelStatus: vi.fn(() => ({ requested: undefined })),
        softwareEncoderStatus: vi.fn(() => ({ missing: [], probeError: undefined })),
      }));
      vi.doMock("../../../../apps/api/src/lib/binary-overrides.js", () => ({
        binaryOverrideWarning: vi.fn(),
        checkBinaryOverrides: vi.fn(() => []),
        probeFailureLevel: vi.fn(() => "warn"),
      }));
    });

    objectStorageMocks.getObjectBuffer.mockResolvedValue(Buffer.from("input-bytes"));
    objectStorageMocks.putObject.mockResolvedValue(undefined);

    const { Worker } = await import("bullmq");
    workerMod.startWorkers();
    const workerCalls = (Worker as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const imageCall = workerCalls.find(([queue]) => String(queue).endsWith("image"));
    if (!imageCall) throw new Error("image pool worker not registered");
    const processor = imageCall[1] as (job: unknown) => Promise<unknown>;

    const makeJob = (jobId: string) => ({
      id: jobId,
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: vi.fn(),
      data: {
        jobId,
        toolId: "compress",
        userId: null,
        pool: "image",
        inputRefs: [`uploads/${jobId}/in.jpg`],
        filename: "in.jpg",
        settings: {},
        kind: "tool",
      },
    });

    // 1. Non-empty resultPayload: writes sidecar first, then primary output
    processV2Mock.mockResolvedValueOnce({
      buffer: Buffer.from("out-bytes"),
      filename: "out.jpg",
      contentType: "image/jpeg",
      resultPayload: { targetKb: 5, resizedTo: { width: 100, height: 80 } },
    });
    await processor(makeJob("job-with-payload"));
    expect(objectStorageMocks.putObject.mock.calls.map(([key]) => key)).toEqual([
      "outputs/job-with-payload/.result-payload.json",
      "outputs/job-with-payload/out.jpg",
    ]);
    expect(
      JSON.parse((objectStorageMocks.putObject.mock.calls[0][1] as Buffer).toString("utf8")),
    ).toEqual({
      targetKb: 5,
      resizedTo: { width: 100, height: 80 },
    });

    // 2. Empty object resultPayload ({}): skips sidecar write
    objectStorageMocks.putObject.mockClear();
    processV2Mock.mockResolvedValueOnce({
      buffer: Buffer.from("out-bytes"),
      filename: "out.jpg",
      contentType: "image/jpeg",
      resultPayload: {},
    });
    await processor(makeJob("job-empty-payload"));
    expect(objectStorageMocks.putObject.mock.calls.map(([key]) => key)).toEqual([
      "outputs/job-empty-payload/out.jpg",
    ]);

    // 3. Undefined resultPayload: skips sidecar write
    objectStorageMocks.putObject.mockClear();
    processV2Mock.mockResolvedValueOnce({
      buffer: Buffer.from("out-bytes"),
      filename: "out.jpg",
      contentType: "image/jpeg",
    });
    await processor(makeJob("job-no-payload"));
    expect(objectStorageMocks.putObject.mock.calls.map(([key]) => key)).toEqual([
      "outputs/job-no-payload/out.jpg",
    ]);

    // 4. ENGINE_UNAVAILABLE (DecoderUnavailableError) on a multi-attempt pool is
    // unrecoverable on attempt 1 and writes the terminal row immediately (#1453).
    expect(generatePreviewMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      "image/jpeg",
      "job-with-payload",
      "compress",
    );
    dbSetMock.mockClear();
    const { DecoderUnavailableError } = await import(
      "../../../../apps/api/src/lib/format-decoders.js"
    );
    const { UnrecoverableError } = await import("bullmq");
    const missingDecoder = new DecoderUnavailableError("No ImageMagick found.");
    processV2Mock.mockRejectedValueOnce(missingDecoder);
    await expect(
      processor({
        ...makeJob("job-missing-decoder"),
        opts: { attempts: 2 },
      }),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(dbSetMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "failed",
        error: expect.objectContaining({
          code: "ENGINE_UNAVAILABLE",
          httpStatus: 503,
          message: "No ImageMagick found.",
        }),
      }),
    );

    // 5. Losing the finalize claim before the completion commit settles the job
    // canceled (without logging "tool job failed" or retrying) and skips the
    // completion write (#2349). When an attempt fails instead, releaseFinalize
    // clears the worker's claim so a retry stays cancelable.
    const cancelMod = await import("../../../../apps/api/src/jobs/cancel.js");
    const progressMod = await import("../../../../apps/api/src/routes/progress.js");
    const { logger } = await import("../../../../apps/api/src/lib/logger.js");
    const claimFinalizeMock = cancelMod.claimFinalize as ReturnType<typeof vi.fn>;
    const releaseFinalizeMock = cancelMod.releaseFinalize as ReturnType<typeof vi.fn>;
    const wasUserCanceledMock = cancelMod.wasUserCanceled as ReturnType<typeof vi.fn>;
    const atomicCommitMock = progressMod.updateSingleFileProgressAtomically as ReturnType<
      typeof vi.fn
    >;

    dbSetMock.mockClear();
    atomicCommitMock.mockClear();
    releaseFinalizeMock.mockClear();
    objectStorageMocks.deletePrefix.mockClear().mockResolvedValue(undefined);
    (logger.error as ReturnType<typeof vi.fn>).mockClear();
    claimFinalizeMock.mockImplementationOnce(async () => {
      wasUserCanceledMock.mockReturnValue(true);
      return false;
    });
    processV2Mock.mockResolvedValueOnce({
      buffer: Buffer.from("out-bytes"),
      filename: "out.jpg",
      contentType: "image/jpeg",
    });

    await expect(
      processor({
        ...makeJob("job-finalize-lost"),
        opts: { attempts: 2 },
      }),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(claimFinalizeMock).toHaveBeenCalledWith("job-finalize-lost");
    expect(atomicCommitMock).not.toHaveBeenCalled();
    expect(objectStorageMocks.deletePrefix).toHaveBeenCalledWith("outputs/job-finalize-lost/");
    expect(dbSetMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "canceled",
        error: { message: "Canceled" },
      }),
    );
    expect(logger.error).not.toHaveBeenCalledWith(expect.anything(), "tool job failed");
    expect(releaseFinalizeMock).not.toHaveBeenCalled();
    wasUserCanceledMock.mockReturnValue(false);

    // 6. A completion-commit fault releases the finalize claim on a retryable
    // attempt (logging a warning if releaseFinalize rejects), but keeps the
    // claim on a final attempt or once autoSaveToLibrary committed a version row (#2349).
    releaseFinalizeMock.mockClear();
    (logger.warn as ReturnType<typeof vi.fn>).mockClear();
    const releaseErr = new Error("redis blip");
    releaseFinalizeMock.mockRejectedValueOnce(releaseErr);
    atomicCommitMock.mockRejectedValueOnce(new Error("commit failed"));
    processV2Mock.mockResolvedValueOnce({
      buffer: Buffer.from("out-bytes"),
      filename: "out.jpg",
      contentType: "image/jpeg",
    });
    await expect(
      processor({
        ...makeJob("job-commit-fault"),
        opts: { attempts: 2 },
      }),
    ).rejects.toThrow("commit failed");
    expect(releaseFinalizeMock).toHaveBeenCalledWith("job-commit-fault");
    expect(logger.warn).toHaveBeenCalledWith(
      { err: releaseErr, jobId: "job-commit-fault", toolId: "compress" },
      "failed to release finalize claim after attempt error",
    );

    releaseFinalizeMock.mockClear();
    atomicCommitMock.mockRejectedValueOnce(new Error("final commit failed"));
    processV2Mock.mockResolvedValueOnce({
      buffer: Buffer.from("out-bytes"),
      filename: "out.jpg",
      contentType: "image/jpeg",
    });
    await expect(processor(makeJob("job-final-fault"))).rejects.toThrow("final commit failed");
    expect(releaseFinalizeMock).not.toHaveBeenCalled();

    const postprocessMod = await import("../../../../apps/api/src/jobs/postprocess.js");
    (postprocessMod.autoSaveToLibrary as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      fileId: "saved-v2",
    });
    claimFinalizeMock.mockClear();
    releaseFinalizeMock.mockClear();
    atomicCommitMock.mockRejectedValueOnce(new Error("commit after save failed"));
    processV2Mock.mockResolvedValueOnce({
      buffer: Buffer.from("out-bytes"),
      filename: "out.jpg",
      contentType: "image/jpeg",
    });
    await expect(
      processor({
        ...makeJob("job-saved-commit-fault"),
        opts: { attempts: 2 },
      }),
    ).rejects.toThrow("commit after save failed");
    expect(claimFinalizeMock).not.toHaveBeenCalled();
    expect(releaseFinalizeMock).not.toHaveBeenCalled();
  });
});

describe("pipelineExecutedProps", () => {
  it("reports the batch file count for a batch-finalize pipeline", async () => {
    const { pipelineExecutedProps } = await loadWorker();

    expect(
      pipelineExecutedProps(
        { kind: "batch-finalize", totalFiles: 5 },
        3,
        ["resize", "compress", "watermark"],
        1200,
        "completed",
      ),
    ).toEqual({
      step_count: 3,
      tool_ids: ["resize", "compress", "watermark"],
      is_batch: true,
      file_count: 5,
      duration_ms: 1200,
      status: "completed",
    });
  });

  it("defaults file_count to 1 for a single-file pipeline-finalize", async () => {
    const { pipelineExecutedProps } = await loadWorker();

    expect(
      pipelineExecutedProps(
        { kind: "pipeline-finalize" },
        2,
        ["grayscale", "resize"],
        800,
        "failed",
      ),
    ).toMatchObject({ is_batch: false, file_count: 1, status: "failed" });
  });
});

// #1414: a failure event carried no job age, so Sentry could not tell an
// input old enough for the storage sweep from one missing seconds after upload.
describe("worker failure reports carry the job age (#1414)", () => {
  const reportErrorMock = vi.fn();

  afterEach(() => {
    reportErrorMock.mockReset();
    vi.clearAllMocks();
  });

  type FailedListener = (job: unknown, err: Error) => void;

  /** Start the workers against mocks and return each queue's "failed" listener. */
  async function failedListeners(): Promise<Map<string, FailedListener>> {
    const worker = await loadWorker("", () => {
      vi.doMock("../../../../apps/api/src/lib/error-report.js", () => ({
        classifyError: vi.fn(() => "bug"),
        reportError: reportErrorMock,
        safeFormatTag: vi.fn(() => undefined),
      }));
      vi.doMock("@snapotter/media-engine", () => ({
        HW_ACCEL_FAMILIES: [],
        hwAccelStatus: vi.fn(() => ({ requested: undefined })),
        softwareEncoderStatus: vi.fn(() => ({ missing: [], probeError: undefined })),
      }));
      vi.doMock("../../../../apps/api/src/lib/binary-overrides.js", () => ({
        binaryOverrideWarning: vi.fn(),
        checkBinaryOverrides: vi.fn(() => []),
        probeFailureLevel: vi.fn(() => "warn"),
      }));
    });
    const { Worker } = await import("bullmq");
    worker.startWorkers();
    const workerMock = Worker as unknown as {
      mock: { calls: unknown[][]; results: { value: { on: { mock: { calls: unknown[][] } } } }[] };
    };
    const listeners = new Map<string, FailedListener>();
    workerMock.mock.calls.forEach((call, i) => {
      const failed = workerMock.mock.results[i].value.on.mock.calls.find((c) => c[0] === "failed");
      if (failed) listeners.set(call[0] as string, failed[1] as FailedListener);
    });
    return listeners;
  }

  function listenerFor(listeners: Map<string, FailedListener>, pool: string): FailedListener {
    const entry = [...listeners.entries()].find(([queue]) => queue.endsWith(pool));
    if (!entry) throw new Error(`no failed listener for the ${pool} pool`);
    return entry[1];
  }

  it("passes processedOn minus timestamp from a tool pool's failed handler", async () => {
    const listeners = await failedListeners();
    const job = {
      id: "job-1",
      data: { toolId: "image-enhancement", filename: "photo.jpg", settings: {} },
      timestamp: 1_000,
      processedOn: 6_000,
    };

    listenerFor(listeners, "image")(job, new Error("boom"));

    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ source: "worker", jobId: "job-1", jobAgeMs: 5_000 }),
    );
  });

  it("passes it from every tool pool, which share one handler", async () => {
    const listeners = await failedListeners();
    for (const pool of ["image", "media", "ai", "docs"]) {
      reportErrorMock.mockClear();
      const job = { id: `job-${pool}`, data: { toolId: "resize" }, timestamp: 0, processedOn: 42 };
      listenerFor(listeners, pool)(job, new Error("boom"));
      expect(reportErrorMock).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ jobAgeMs: 42 }),
      );
    }
  });

  it("does not pass an age from the system pool, where it is only the schedule interval", async () => {
    // A job scheduler enqueues each next run as a delayed job, so a weekly
    // sweep would always read as over a day old.
    const listeners = await failedListeners();
    const job = { id: "sys-1", data: { kind: "other" }, timestamp: 1_000, processedOn: 3_500 };

    listenerFor(listeners, "system")(job, new Error("boom"));

    const ctx = reportErrorMock.mock.calls[0][1] as { jobAgeMs?: number };
    expect(ctx.jobAgeMs).toBeUndefined();
  });

  it("leaves the wait unset when the job never became active", async () => {
    const listeners = await failedListeners();
    const job = { id: "job-2", data: { toolId: "resize" }, timestamp: 1_000 };

    listenerFor(listeners, "image")(job, new Error("boom"));

    const ctx = reportErrorMock.mock.calls[0][1] as { jobAgeMs?: number };
    expect(ctx.jobAgeMs).toBeUndefined();
  });

  it("unwraps an UnrecoverableError with a cause before handing the error to reportError (#1176)", async () => {
    const listeners = await failedListeners();
    const { logger } = await import("../../../../apps/api/src/lib/logger.js");
    const job = {
      id: "job-3",
      data: { toolId: "image-enhancement", filename: "photo.jpg", settings: {} },
      timestamp: 1_000,
      processedOn: 2_000,
    };
    const inner = Object.assign(new Error("Input file is no longer available. Upload it again."), {
      pythonFrames: [{ file: "doc_html_pdf.py", line: 30, func: "fetch" }],
    });
    const wrapped = Object.assign(new Error(inner.message), {
      name: "UnrecoverableError",
      cause: inner,
    });

    listenerFor(listeners, "image")(job, wrapped);

    expect(reportErrorMock).toHaveBeenCalledWith(
      inner,
      expect.objectContaining({ source: "worker", jobId: "job-3", jobAgeMs: 1_000 }),
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job-3", pythonFrames: inner.pythonFrames }),
      "sidecar failure",
    );

    // A bare BullMQ lock-loss UnrecoverableError (no cause) passes through unchanged.
    reportErrorMock.mockClear();
    const stalled = Object.assign(new Error("Missing lock for job 42. moveToFinished"), {
      name: "UnrecoverableError",
    });
    listenerFor(listeners, "image")(job, stalled);
    expect(reportErrorMock).toHaveBeenCalledWith(
      stalled,
      expect.objectContaining({ source: "worker", jobId: "job-3", jobAgeMs: 1_000 }),
    );
  });

  describe("GDPR export failure handling on the system pool (#1495)", () => {
    const dbWhereMock = vi.fn().mockResolvedValue(undefined);
    const dbSetMock = vi.fn(() => ({ where: dbWhereMock }));
    const dbUpdateMock = vi.fn(() => ({ set: dbSetMock }));

    async function systemFailedListener() {
      dbWhereMock.mockReset().mockResolvedValue(undefined);
      dbSetMock.mockClear();
      dbUpdateMock.mockClear();

      const actualErrors = await vi.importActual<
        typeof import("../../../../apps/api/src/lib/errors.js")
      >("../../../../apps/api/src/lib/errors.js");

      const worker = await loadWorker("", () => {
        vi.doMock("../../../../apps/api/src/db/index.js", () => ({
          db: { update: dbUpdateMock },
          schema: {
            jobs: {
              id: "jobs.id",
              status: "jobs.status",
            },
          },
        }));
        vi.doMock("../../../../apps/api/src/lib/errors.js", () => ({
          friendlyError: vi.fn(actualErrors.friendlyError),
        }));
        vi.doMock("../../../../apps/api/src/lib/error-report.js", () => ({
          classifyError: vi.fn(() => "operational"),
          reportError: reportErrorMock,
          safeFormatTag: vi.fn(() => undefined),
        }));
        vi.doMock("@snapotter/media-engine", () => ({
          HW_ACCEL_FAMILIES: [],
          hwAccelStatus: vi.fn(() => ({ requested: undefined })),
          softwareEncoderStatus: vi.fn(() => ({ missing: [], probeError: undefined })),
        }));
        vi.doMock("../../../../apps/api/src/lib/binary-overrides.js", () => ({
          binaryOverrideWarning: vi.fn(),
          checkBinaryOverrides: vi.fn(() => []),
          probeFailureLevel: vi.fn(() => "warn"),
        }));
      });
      const { Worker } = await import("bullmq");
      const { logger } = await import("../../../../apps/api/src/lib/logger.js");
      worker.startWorkers();
      const workerMock = Worker as unknown as {
        mock: {
          calls: unknown[][];
          results: { value: { on: { mock: { calls: unknown[][] } } } }[];
        };
      };
      const listeners = new Map<string, FailedListener>();
      workerMock.mock.calls.forEach((call, i) => {
        const failed = workerMock.mock.results[i].value.on.mock.calls.find(
          (c) => c[0] === "failed",
        );
        if (failed) listeners.set(call[0] as string, failed[1] as FailedListener);
      });
      return { listener: listenerFor(listeners, "system"), logger };
    }

    it("writes status failed with friendlyError and logs the full error when BullMQ has stopped retrying", async () => {
      const { listener, logger } = await systemFailedListener();
      const err = new Error(
        "ENOSPC: no space left on device, write '/data/workspace/outputs/export-1/gdpr-export.zip'",
      );
      const job = {
        id: "export-1",
        name: "system:gdpr-export",
        data: { userId: "user-1", jobId: "export-1" },
        attemptsMade: 2,
        opts: { attempts: 2 },
        finishedOn: 1_700_000_000_000,
      };

      listener(job, err);
      await vi.waitFor(() => expect(dbWhereMock).toHaveBeenCalledTimes(1));

      expect(dbSetMock).toHaveBeenCalledWith({
        status: "failed",
        completedAt: expect.any(Date),
        error: {
          message: "ENOSPC: no space left on device, write '[internal]'",
        },
      });
      expect(dbWhereMock).toHaveBeenCalledWith({
        op: "and",
        conds: [
          { op: "eq", col: "jobs.id", val: "export-1" },
          { op: "notInArray", col: "jobs.status", vals: ["completed", "failed", "canceled"] },
        ],
      });
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err,
          jobId: "export-1",
          userId: "user-1",
        }),
        expect.stringContaining("gdpr"),
      );
      expect(reportErrorMock).toHaveBeenCalledWith(
        err,
        expect.objectContaining({
          source: "worker",
          pool: "system",
          toolId: "gdpr-export",
          jobId: "export-1",
        }),
      );
    });

    it("does not write failed or log a terminal error while BullMQ still has retries left", async () => {
      const { listener, logger } = await systemFailedListener();
      const err = new Error("S3 503 SlowDown");
      const job = {
        id: "export-retry",
        name: "system:gdpr-export",
        data: { userId: "user-1", jobId: "export-retry" },
        attemptsMade: 1,
        opts: { attempts: 2 },
        finishedOn: undefined,
      };

      listener(job, err);

      expect(dbUpdateMock).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it("settles the row when attemptsMade reaches opts.attempts even if finishedOn is absent", async () => {
      const { listener, logger } = await systemFailedListener();
      const err = new Error(
        "EntityTooLarge: Your proposed upload exceeds the maximum allowed size",
      );
      const job = {
        id: "export-attempts-exhausted",
        name: "system:gdpr-export",
        data: { userId: "user-2", jobId: "export-attempts-exhausted" },
        attemptsMade: 2,
        opts: { attempts: 2 },
      };

      listener(job, err);
      await vi.waitFor(() => expect(dbWhereMock).toHaveBeenCalledTimes(1));

      expect(dbSetMock).toHaveBeenCalledWith({
        status: "failed",
        completedAt: expect.any(Date),
        error: {
          message: "EntityTooLarge: Your proposed upload exceeds the maximum allowed size",
        },
      });
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err,
          jobId: "export-attempts-exhausted",
          userId: "user-2",
        }),
        expect.stringContaining("gdpr"),
      );
    });

    it("settles the row when finishedOn is set before max attempts and falls back to job.id and 'Export failed'", async () => {
      const { listener, logger } = await systemFailedListener();
      const err = new Error("");
      const job = {
        id: "export-early-finish",
        name: "system:gdpr-export",
        data: {},
        attemptsMade: 1,
        opts: { attempts: 2 },
        finishedOn: 1_700_000_000_000,
      };

      listener(job, err);
      await vi.waitFor(() => expect(dbWhereMock).toHaveBeenCalledTimes(1));

      expect(dbSetMock).toHaveBeenCalledWith({
        status: "failed",
        completedAt: expect.any(Date),
        error: {
          message: "Export failed",
        },
      });
      expect(dbWhereMock).toHaveBeenCalledWith({
        op: "and",
        conds: [
          { op: "eq", col: "jobs.id", val: "export-early-finish" },
          { op: "notInArray", col: "jobs.status", vals: ["completed", "failed", "canceled"] },
        ],
      });
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err,
          jobId: "export-early-finish",
        }),
        expect.stringContaining("gdpr"),
      );
    });

    it("logs and reports a database fault when the guarded failure write rejects", async () => {
      const { listener, logger } = await systemFailedListener();
      const dbErr = new Error("connection terminated unexpectedly");
      dbWhereMock.mockRejectedValueOnce(dbErr);
      const err = new Error("The server's storage is full.");
      const job = {
        id: "export-db-fault",
        name: "system:gdpr-export",
        data: { userId: "user-3", jobId: "export-db-fault" },
        attemptsMade: 2,
        opts: { attempts: 2 },
        finishedOn: 1_700_000_000_000,
      };

      listener(job, err);

      await vi.waitFor(() =>
        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({ err: dbErr, jobId: "export-db-fault" }),
          expect.stringContaining("gdpr-export"),
        ),
      );
      expect(reportErrorMock).toHaveBeenCalledWith(
        dbErr,
        expect.objectContaining({
          source: "worker",
          pool: "system",
          toolId: "gdpr-export",
          jobId: "export-db-fault",
        }),
      );
    });
  });
});

describe("isTimeoutAbortError (#2294)", () => {
  it.each([
    ["raw timeout abort reason", "timeout"],
    ["non-timeout string abort", "Canceled"],
    ["AbortError instance", Object.assign(new Error("unmatched message"), { name: "AbortError" })],
    [
      "AnimatedRemovalCanceledError instance",
      Object.assign(new Error("unmatched message"), { name: "AnimatedRemovalCanceledError" }),
    ],
    ["ABORT_ERR code", Object.assign(new Error("anything"), { code: "ABORT_ERR" })],
    ["canceled code", Object.assign(new Error("anything"), { code: "canceled" })],
    ["Canceled message", new Error("Canceled")],
    ["Cancelled message", new Error("Cancelled")],
    ["Aborted message", new Error("Aborted")],
    ["Aborted by signal message", new Error("Aborted by signal")],
    ["aborted before start message", new Error("aborted before start")],
    ["The operation was aborted message", new Error("The operation was aborted")],
    ["Job was canceled message", new Error("Job was canceled")],
    ["Python script canceled message", new Error("Python script canceled")],
    ["ffprobe canceled message", new Error("ffprobe canceled")],
    ["Tesseract OCR was canceled message", new Error("Tesseract OCR was canceled")],
    [
      "Tesseract language-pack preflight was canceled message",
      new Error("Tesseract language-pack preflight was canceled"),
    ],
    ["PDF OCR was canceled message", new Error("PDF OCR was canceled")],
    ["Accurate OCR abort message", new Error("Accurate OCR runtime request was aborted")],
    ["timeout Error message", new Error("timeout")],
  ])("recognizes %s as a cooperative abort shape", async (_label, err) => {
    const { isTimeoutAbortError } = await loadWorker();
    expect(isTimeoutAbortError(err)).toBe(true);
  });

  it.each([
    ["ffmpeg exit failure", new Error("ffmpeg exited 1: bad frame")],
    ["ffmpeg own timeout", new Error("ffmpeg timed out")],
    ["OOM sidecar failure", new Error("Process killed (out of memory) -- try a lighter model")],
    ["storage fault", new Error("The server's storage is full.")],
    ["redis MULTI aborted", new Error("login throttle: redis MULTI transaction aborted")],
    ["upstream request canceled", new Error("upstream request canceled by peer")],
    ["empty error", new Error("")],
    ["null", null],
  ])("does not treat %s as an abort shape", async (_label, err) => {
    const { isTimeoutAbortError } = await loadWorker();
    expect(isTimeoutAbortError(err)).toBe(false);
  });
});
