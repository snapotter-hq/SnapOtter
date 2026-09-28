import { afterEach, describe, expect, it, vi } from "vitest";

const objectStorageMocks = vi.hoisted(() => ({
  copyObjectToFile: vi.fn(),
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

  const { SafeError } = await vi.importActual<
    typeof import("../../../../packages/shared/src/tool-errors.js")
  >("../../../../packages/shared/src/tool-errors.js");
  vi.doMock("@snapotter/shared", () => ({
    SafeError,
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
    eq: vi.fn(() => "eq"),
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
    registerCancelable: vi.fn(() => new AbortController()),
    unregisterCancelable: vi.fn(),
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
    ).rejects.toMatchObject({ name: "InputValidationError", statusCode: 413 });
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

// #1414: a failure event carried no queue age, so Sentry could not tell an
// input that aged out behind a backed-up queue from one missing seconds after
// upload.
describe("worker failure reports carry the queue wait (#1414)", () => {
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
      expect.objectContaining({ source: "worker", jobId: "job-1", queueWaitMs: 5_000 }),
    );
  });

  it("passes the queue wait from the system pool's failed handler too", async () => {
    const listeners = await failedListeners();
    const job = { id: "sys-1", data: { kind: "other" }, timestamp: 1_000, processedOn: 3_500 };

    listenerFor(listeners, "system")(job, new Error("boom"));

    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ jobId: "sys-1", queueWaitMs: 2_500 }),
    );
  });

  it("leaves the wait unset when the job never became active", async () => {
    const listeners = await failedListeners();
    const job = { id: "job-2", data: { toolId: "resize" }, timestamp: 1_000 };

    listenerFor(listeners, "image")(job, new Error("boom"));

    const ctx = reportErrorMock.mock.calls[0][1] as { queueWaitMs?: number };
    expect(ctx.queueWaitMs).toBeUndefined();
  });
});
