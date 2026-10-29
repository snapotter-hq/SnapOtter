import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { isBinarySpawnFailure } from "../../../../apps/api/src/lib/binary-overrides.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const initialSharpConcurrency = sharp.concurrency();

afterEach(() => {
  sharp.concurrency(initialSharpConcurrency);
});

const objectStorageMocks = vi.hoisted(() => ({
  copyObjectToFile: vi.fn(),
  deletePrefix: vi.fn(),
  getObjectBuffer: vi.fn(),
  getObjectSize: vi.fn(),
  getObjectStream: vi.fn(),
  // Stands in for the real predicate (covered in object-storage-fault.test.ts):
  // local-backend semantics, where a missing object is a bare ENOENT.
  isMissingObjectError: vi.fn((err: unknown) => (err as { code?: string })?.code === "ENOENT"),
  isStorageServiceFault: vi.fn<(_err: unknown) => boolean>(() => false),
  normalizeS3ReadFault: vi.fn((err: unknown) => err),
  putObject: vi.fn(),
  putObjectStream: vi.fn(),
  verifyS3Bucket: vi.fn(),
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

  const toolErrors = await vi.importActual<
    typeof import("../../../../packages/shared/src/tool-errors.js")
  >("../../../../packages/shared/src/tool-errors.js");
  const { IMAGE_EXT_TO_MIME } = await vi.importActual<
    typeof import("../../../../packages/shared/src/image-mime.js")
  >("../../../../packages/shared/src/image-mime.js");
  vi.doMock("@snapotter/shared", () => ({
    ...toolErrors,
    IMAGE_EXT_TO_MIME,
    ANALYTICS_EVENTS: {},
    TOOLS: [],
    // pdf-producer.ts builds its scrub set from COMPRESS_PRESETS at load, and
    // file-validation.ts builds RAW_EXTENSIONS from CAMERA_RAW_INPUTS at load.
    COMPRESS_PRESETS: [],
    CAMERA_RAW_INPUTS: [],
    getBundleForTool: vi.fn(() => null),
    getOptionalBundleForTool: vi.fn(() => null),
  }));

  vi.doMock("bullmq", () => ({
    UnrecoverableError: class UnrecoverableError extends Error {
      name = "UnrecoverableError";
    },
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
    resolveWorkerThreads: vi.fn(() => 2),
  }));

  vi.doMock("../../../../apps/api/src/lib/errors.js", () => ({
    friendlyError: vi.fn((message: string) => message),
    sharedFailureReason: vi.fn(() => null),
    stripInternalPaths: vi.fn((message: string) => message),
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

  vi.doMock("../../../../apps/api/src/lib/tool-audit.js", () => ({
    emitWorkerBatchAudit: vi.fn().mockResolvedValue(undefined),
    emitWorkerPipelineAudit: vi.fn().mockResolvedValue(undefined),
    emitWorkerToolAudit: vi.fn().mockResolvedValue(true),
  }));

  vi.doMock("../../../../apps/api/src/routes/progress.js", () => ({
    publishEphemeral: vi.fn(),
    updateSingleFileProgress: vi.fn(),
    updateSingleFileProgressAtomically: vi.fn(
      async (_progress: unknown, mutate?: (tx: unknown) => Promise<void>) => {
        const { db } = await import("../../../../apps/api/src/db/index.js");
        if (mutate && "update" in db) {
          await mutate(db);
        }
      },
    ),
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
    stageAutoSaveToLibrary: vi.fn().mockResolvedValue({}),
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
      expect(objectStorageMocks.verifyS3Bucket).toHaveBeenCalledTimes(1);
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
      expect(objectStorageMocks.verifyS3Bucket).not.toHaveBeenCalled();
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
      expect(objectStorageMocks.verifyS3Bucket).not.toHaveBeenCalled();
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

    it("propagates verifyS3Bucket's 503 storage-unavailable rejection instead of relabeling as 410 INPUT_MISSING (#2923)", async () => {
      const { SafeError } = await vi.importActual<
        typeof import("../../../../packages/shared/src/tool-errors.js")
      >("../../../../packages/shared/src/tool-errors.js");
      const bucketFault = new SafeError("The server's storage service is unavailable.", {
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
      });
      objectStorageMocks.getObjectBuffer.mockRejectedValueOnce(
        enoent("/data/workspace/uploads/job-1/photo.jpg"),
      );
      objectStorageMocks.getObjectSize.mockRejectedValueOnce(gone("photo.jpg"));
      objectStorageMocks.verifyS3Bucket.mockRejectedValueOnce(bucketFault);
      const { loadToolInputs } = await loadWorker();

      await expect(
        loadToolInputs(
          "image-enhancement",
          ["uploads/job-1/photo.jpg"],
          "photo.jpg",
          "/tmp/job-1",
          new AbortController().signal,
        ),
      ).rejects.toBe(bucketFault);
      expect(objectStorageMocks.verifyS3Bucket).toHaveBeenCalledTimes(1);
    });

    it("propagates a 503 storage-unavailable SafeError instead of 410 INPUT_MISSING when the S3 bucket vanishes on HeadObject probes (#2923)", async () => {
      const notFound = Object.assign(new Error("NotFound"), {
        name: "NotFound",
        $metadata: { httpStatusCode: 404 },
      });
      const noSuchBucket = Object.assign(new Error("NoSuchBucket"), {
        name: "NoSuchBucket",
        $metadata: { httpStatusCode: 404 },
      });
      const getGenericObjectSize = vi.fn().mockRejectedValue(notFound);
      const checkConnection = vi.fn().mockRejectedValue(noSuchBucket);
      const { isMissingObjectError: s3IsMissingObjectError } = await vi.importActual<
        typeof import("../../../../packages/enterprise/src/storage-s3.js")
      >("../../../../packages/enterprise/src/storage-s3.js");
      const { connectivityClass, isClientAbort, SafeError } = await vi.importActual<
        typeof import("../../../../packages/shared/src/index.js")
      >("../../../../packages/shared/src/index.js");

      const { loadToolInputBuffer, loadToolInputs } = await loadWorker("", () => {
        vi.doMock("@snapotter/shared", () => ({
          SafeError,
          connectivityClass,
          isClientAbort,
          isSafeMessageError: () => false,
          isToolInputError: () => false,
          hasServerErrorStatus: () => false,
          ANALYTICS_EVENTS: {},
          TOOLS: [],
          COMPRESS_PRESETS: [],
          CAMERA_RAW_INPUTS: [],
          getBundleForTool: vi.fn(() => null),
          getOptionalBundleForTool: vi.fn(() => null),
        }));
        vi.doMock("../../../../apps/api/src/config.js", () => ({
          env: {
            BASE_PATH: "",
            SCRATCH_PATH: "",
            STORAGE_MODE: "s3",
            WORKSPACE_PATH: "/unused",
            S3_BUCKET: "snap-bucket",
            S3_REGION: "us-east-1",
            S3_ENDPOINT: "https://s3.example.test",
            S3_ACCESS_KEY_ID: "AKIA-TEST",
            S3_SECRET_ACCESS_KEY: "secret",
            S3_FORCE_PATH_STYLE: true,
            S3_PREFIX: "",
            JOB_TIMEOUT_LONG_S: 60,
            JOB_TIMEOUT_FAST_S: 15,
          },
        }));
        vi.doMock("@snapotter/enterprise", () => ({
          loadS3Storage: vi.fn(async () => ({
            isMissingObjectError: s3IsMissingObjectError,
            configureS3: vi.fn(),
            checkConnection,
            getGenericObjectSize,
          })),
        }));
        vi.doUnmock("../../../../apps/api/src/lib/object-storage.js");
      });

      await expect(loadToolInputBuffer("ocr", "uploads/job-1/scan.png")).rejects.toMatchObject({
        name: "SafeError",
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        cause: noSuchBucket,
      });
      expect(getGenericObjectSize).toHaveBeenCalledTimes(1);
      expect(checkConnection).toHaveBeenCalledTimes(1);
      getGenericObjectSize.mockClear();
      checkConnection.mockClear();

      await expect(
        loadToolInputs(
          "ocr",
          ["uploads/job-1/scan.png"],
          "scan.png",
          "/tmp/job-1",
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({
        name: "SafeError",
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        cause: noSuchBucket,
      });
      expect(getGenericObjectSize).toHaveBeenCalledTimes(1);
      expect(checkConnection).toHaveBeenCalledTimes(1);
      getGenericObjectSize.mockClear();
      checkConnection.mockClear();

      await expect(
        loadToolInputs(
          "ocr-pdf",
          ["uploads/job-1/scan.pdf"],
          "scan.pdf",
          "/tmp/job-1",
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({
        name: "SafeError",
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        cause: noSuchBucket,
      });
      expect(getGenericObjectSize).toHaveBeenCalledTimes(1);
      expect(checkConnection).toHaveBeenCalledTimes(1);
    });

    it("normalizes non-missing S3 GetObject and HeadObject faults in loadToolInputBuffer and loadToolInputs into a 503 storage-unavailable SafeError (#2953)", async () => {
      const { Readable } = await import("node:stream");
      const getGenericObjectSize = vi.fn();
      const getGenericObjectStream = vi.fn();
      const checkConnection = vi.fn();
      const dbSetMock = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
      const dbUpdateMock = vi.fn(() => ({ set: dbSetMock }));
      const { isMissingObjectError: s3IsMissingObjectError } = await vi.importActual<
        typeof import("../../../../packages/enterprise/src/storage-s3.js")
      >("../../../../packages/enterprise/src/storage-s3.js");
      const actualShared = await vi.importActual<
        typeof import("../../../../packages/shared/src/index.js")
      >("../../../../packages/shared/src/index.js");

      const workerMod = await loadWorker("", () => {
        vi.doMock("@snapotter/shared", () => ({
          ...actualShared,
          ANALYTICS_EVENTS: {},
          TOOLS: [],
          COMPRESS_PRESETS: [],
          CAMERA_RAW_INPUTS: [],
          getBundleForTool: vi.fn(() => null),
          getOptionalBundleForTool: vi.fn(() => null),
        }));
        vi.doMock("../../../../apps/api/src/config.js", () => ({
          env: {
            BASE_PATH: "",
            SCRATCH_PATH: "",
            STORAGE_MODE: "s3",
            WORKSPACE_PATH: "/unused",
            S3_BUCKET: "snap-bucket",
            S3_REGION: "us-east-1",
            S3_ENDPOINT: "https://s3.example.test",
            S3_ACCESS_KEY_ID: "AKIA-TEST",
            S3_SECRET_ACCESS_KEY: "secret",
            S3_FORCE_PATH_STYLE: true,
            S3_PREFIX: "",
            JOB_TIMEOUT_LONG_S: 60,
            JOB_TIMEOUT_FAST_S: 15,
          },
        }));
        vi.doMock("../../../../apps/api/src/db/index.js", () => ({
          db: { update: dbUpdateMock },
          schema: { jobs: { id: "jobs.id" } },
        }));
        vi.doMock("@snapotter/media-engine", () => ({
          HW_ACCEL_FAMILIES: [],
          hwAccelStatus: vi.fn(() => ({ requested: undefined })),
          softwareEncoderStatus: vi.fn(() => ({ missing: [], probeError: undefined })),
        }));
        vi.doMock("../../../../apps/api/src/lib/binary-overrides.js", () => ({
          binaryOverrideWarning: vi.fn(),
          checkBinaryOverrides: vi.fn(() => []),
          isBinarySpawnFailure,
          probeFailureLevel: vi.fn(() => "warn"),
        }));
        vi.doMock("node:fs/promises", () => ({
          mkdir: vi.fn().mockResolvedValue(undefined),
          readFile: vi.fn(),
          rm: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock("@snapotter/enterprise", () => ({
          loadS3Storage: vi.fn(async () => ({
            isMissingObjectError: s3IsMissingObjectError,
            configureS3: vi.fn(),
            checkConnection,
            deleteGenericPrefix: vi.fn().mockResolvedValue(undefined),
            getGenericObjectSize,
            getGenericObjectStream,
          })),
        }));
        vi.doUnmock("../../../../apps/api/src/lib/object-storage.js");
      });
      const { classifyError } = await vi.importActual<
        typeof import("../../../../apps/api/src/lib/error-report.js")
      >("../../../../apps/api/src/lib/error-report.js");
      const { loadToolInputBuffer, loadToolInputs } = workerMod;

      const s3Faults = [
        Object.assign(new Error("Please reduce your request rate."), {
          name: "SlowDown",
          $metadata: { httpStatusCode: 503 },
        }),
        Object.assign(new Error("Access Denied"), {
          name: "AccessDenied",
          $metadata: { httpStatusCode: 403 },
        }),
        Object.assign(new Error("The specified bucket does not exist"), {
          name: "NoSuchBucket",
          $metadata: { httpStatusCode: 404 },
        }),
        Object.assign(new Error("Premature close"), { code: "ERR_STREAM_PREMATURE_CLOSE" }),
        Object.assign(new Error("S3 stream reset"), { code: "EIO", syscall: "read" }),
      ];

      for (const fault of s3Faults) {
        // 1. loadToolInputs (GetObject via getObjectBuffer)
        getGenericObjectStream.mockRejectedValueOnce(fault);
        const caughtLoad = await loadToolInputs(
          "image-enhancement",
          ["uploads/job-1/photo.jpg"],
          "photo.jpg",
          "/tmp/job-1",
          new AbortController().signal,
        ).catch((err: unknown) => err);
        expect(caughtLoad).toMatchObject({
          name: "SafeError",
          isSafeMessage: true,
          kind: "operational",
          code: "storage-unavailable",
          statusCode: 503,
          message: "The server's storage service is unavailable.",
          cause: fault,
        });
        expect(classifyError(caughtLoad, "worker")).toBe("operational");

        // 2. loadToolInputBuffer directly (GetObject)
        getGenericObjectStream.mockRejectedValueOnce(fault);
        const caughtBuf = await loadToolInputBuffer(
          "image-enhancement",
          "uploads/job-1/photo.jpg",
        ).catch((err: unknown) => err);
        expect(caughtBuf).toMatchObject({
          name: "SafeError",
          isSafeMessage: true,
          kind: "operational",
          code: "storage-unavailable",
          statusCode: 503,
          message: "The server's storage service is unavailable.",
          cause: fault,
        });

        // 3. loadToolInputBuffer and loadToolInputs OCR size probe (HeadObject via getObjectSize)
        getGenericObjectSize.mockRejectedValueOnce(fault);
        const caughtOcrSize = await loadToolInputBuffer("ocr", "uploads/job-1/scan.png").catch(
          (err: unknown) => err,
        );
        expect(caughtOcrSize).toMatchObject({
          name: "SafeError",
          isSafeMessage: true,
          kind: "operational",
          code: "storage-unavailable",
          statusCode: 503,
          message: "The server's storage service is unavailable.",
          cause: fault,
        });

        getGenericObjectSize.mockRejectedValueOnce(fault);
        const caughtOcrInputs = await loadToolInputs(
          "ocr",
          ["uploads/job-1/scan.png"],
          "scan.png",
          "/tmp/job-1",
          new AbortController().signal,
        ).catch((err: unknown) => err);
        expect(caughtOcrInputs).toMatchObject({
          name: "SafeError",
          isSafeMessage: true,
          kind: "operational",
          code: "storage-unavailable",
          statusCode: 503,
          message: "The server's storage service is unavailable.",
          cause: fault,
        });
      }

      // Mid-stream S3 error emitted while reading chunks in getObjectBuffer
      const midStreamFault = Object.assign(new Error("Premature close"), {
        code: "ERR_STREAM_PREMATURE_CLOSE",
      });
      getGenericObjectStream.mockResolvedValueOnce(
        Readable.from(
          (async function* () {
            yield Buffer.from("partial");
            throw midStreamFault;
          })(),
        ),
      );
      const caughtMid = await loadToolInputs(
        "image-enhancement",
        ["uploads/job-1/photo.jpg"],
        "photo.jpg",
        "/tmp/job-1",
        new AbortController().signal,
      ).catch((err: unknown) => err);
      expect(caughtMid).toMatchObject({
        name: "SafeError",
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        cause: midStreamFault,
      });
      expect(classifyError(caughtMid, "worker")).toBe("operational");

      // Unexpected non-S3 defect passes through unwrapped as "bug"
      const unexpectedBug = new TypeError("unexpected S3 client defect");
      getGenericObjectStream.mockRejectedValueOnce(unexpectedBug);
      const caughtBug = await loadToolInputs(
        "image-enhancement",
        ["uploads/job-1/photo.jpg"],
        "photo.jpg",
        "/tmp/job-1",
        new AbortController().signal,
      ).catch((err: unknown) => err);
      expect(caughtBug).toBe(unexpectedBug);
      expect(classifyError(caughtBug, "worker")).toBe("bug");
      expect(checkConnection).not.toHaveBeenCalled();

      // processToolJob persists code: "storage-unavailable" and httpStatus: 503 on the failed job row
      const { Worker } = await import("bullmq");
      workerMod.startWorkers();
      const workerCalls = (Worker as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const imageCall = workerCalls.find(([queue]) => String(queue).endsWith("image"));
      if (!imageCall) throw new Error("image pool worker not registered");
      const processor = imageCall[1] as (job: unknown) => Promise<unknown>;

      const slowDown = s3Faults[0];
      getGenericObjectStream.mockRejectedValueOnce(slowDown);
      dbSetMock.mockClear();
      const jobErr = await processor({
        id: "job-s3-slowdown",
        attemptsMade: 0,
        opts: { attempts: 1 },
        updateProgress: vi.fn(),
        data: {
          jobId: "job-s3-slowdown",
          toolId: "compress",
          userId: null,
          pool: "image",
          inputRefs: ["uploads/job-s3-slowdown/in.jpg"],
          filename: "in.jpg",
          settings: {},
          kind: "tool",
        },
      }).catch((err: unknown) => err);
      expect(jobErr).toMatchObject({
        name: "SafeError",
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        cause: slowDown,
      });
      expect(dbSetMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: "failed",
          error: {
            code: "storage-unavailable",
            httpStatus: 503,
            message: "The server's storage service is unavailable.",
          },
        }),
      );
    });

    it("normalizes non-missing S3 GetObject faults in processPipelineFinalize and secondary AI handler reads into a 503 storage-unavailable SafeError (#3467)", async () => {
      const { Readable } = await import("node:stream");
      const getGenericObjectSize = vi.fn();
      const getGenericObjectStream = vi.fn();
      const checkConnection = vi.fn();
      const dbSetMock = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
      const dbUpdateMock = vi.fn(() => ({ set: dbSetMock }));
      const stepRow = {
        id: "pf-s3-1-s0",
        status: "completed",
        toolId: "compress",
        bytesIn: 512,
        bytesOut: 256,
        outputRefs: ["outputs/pf-s3-1-s0/out.jpg"],
        progress: { percent: 100, stage: "complete" },
      };
      const dbSelectMock = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(async () => [stepRow]),
        })),
      }));
      const { isMissingObjectError: s3IsMissingObjectError } = await vi.importActual<
        typeof import("../../../../packages/enterprise/src/storage-s3.js")
      >("../../../../packages/enterprise/src/storage-s3.js");
      const actualShared = await vi.importActual<
        typeof import("../../../../packages/shared/src/index.js")
      >("../../../../packages/shared/src/index.js");

      const workerMod = await loadWorker("", () => {
        vi.doMock("@snapotter/shared", () => ({
          ...actualShared,
          ANALYTICS_EVENTS: {},
          TOOLS: [],
          COMPRESS_PRESETS: [],
          CAMERA_RAW_INPUTS: [],
          getBundleForTool: vi.fn(() => null),
          getOptionalBundleForTool: vi.fn(() => null),
        }));
        vi.doMock("../../../../apps/api/src/config.js", () => ({
          env: {
            BASE_PATH: "",
            SCRATCH_PATH: "",
            STORAGE_MODE: "s3",
            WORKSPACE_PATH: "/unused",
            S3_BUCKET: "snap-bucket",
            S3_REGION: "us-east-1",
            S3_ENDPOINT: "https://s3.example.test",
            S3_ACCESS_KEY_ID: "AKIA-TEST",
            S3_SECRET_ACCESS_KEY: "secret",
            S3_FORCE_PATH_STYLE: true,
            S3_PREFIX: "",
            JOB_TIMEOUT_LONG_S: 60,
            JOB_TIMEOUT_FAST_S: 15,
          },
        }));
        vi.doMock("../../../../apps/api/src/db/index.js", () => ({
          db: { select: dbSelectMock, update: dbUpdateMock },
          schema: { jobs: { id: "jobs.id" } },
        }));
        vi.doMock("@snapotter/media-engine", () => ({
          HW_ACCEL_FAMILIES: [],
          hwAccelStatus: vi.fn(() => ({ requested: undefined })),
          softwareEncoderStatus: vi.fn(() => ({ missing: [], probeError: undefined })),
        }));
        vi.doMock("../../../../apps/api/src/lib/binary-overrides.js", () => ({
          binaryOverrideWarning: vi.fn(),
          checkBinaryOverrides: vi.fn(() => []),
          isBinarySpawnFailure,
          probeFailureLevel: vi.fn(() => "warn"),
        }));
        vi.doMock("node:fs/promises", () => ({
          mkdir: vi.fn().mockResolvedValue(undefined),
          mkdtemp: vi.fn().mockResolvedValue("/tmp/sign-test"),
          readFile: vi.fn(),
          rm: vi.fn().mockResolvedValue(undefined),
          writeFile: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock("@snapotter/enterprise", () => ({
          loadS3Storage: vi.fn(async () => ({
            isMissingObjectError: s3IsMissingObjectError,
            configureS3: vi.fn(),
            checkConnection,
            deleteGenericPrefix: vi.fn().mockResolvedValue(undefined),
            getGenericObjectSize,
            getGenericObjectStream,
          })),
        }));
        vi.doUnmock("../../../../apps/api/src/jobs/ai-handlers.js");
        vi.doUnmock("../../../../apps/api/src/lib/object-storage.js");
      });
      const { classifyError } = await vi.importActual<
        typeof import("../../../../apps/api/src/lib/error-report.js")
      >("../../../../apps/api/src/lib/error-report.js");
      await import("../../../../apps/api/src/routes/tools/erase-object.js");
      await import("../../../../apps/api/src/routes/tools/remove-gif-background.js");
      await import("../../../../apps/api/src/routes/tools/sign-pdf.js");

      const { Worker, UnrecoverableError } = await import("bullmq");
      workerMod.startWorkers();
      const workerCalls = (Worker as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const imageCall = workerCalls.find(([queue]) => String(queue).endsWith("image"));
      if (!imageCall) throw new Error("image pool worker not registered");
      const processor = imageCall[1] as (job: unknown) => Promise<unknown>;

      const s3Faults = [
        Object.assign(new Error("Please reduce your request rate."), {
          name: "SlowDown",
          $metadata: { httpStatusCode: 503 },
        }),
        Object.assign(new Error("Access Denied"), {
          name: "AccessDenied",
          $metadata: { httpStatusCode: 403 },
        }),
        Object.assign(new Error("The specified bucket does not exist"), {
          name: "NoSuchBucket",
          $metadata: { httpStatusCode: 404 },
        }),
        Object.assign(new Error("Premature close"), { code: "ERR_STREAM_PREMATURE_CLOSE" }),
        Object.assign(new Error("S3 stream reset"), { code: "EIO", syscall: "read" }),
      ];

      const finalizeJob = {
        id: "pf-s3-1",
        name: "pipeline-finalize",
        attemptsMade: 0,
        opts: { attempts: 1 },
        updateProgress: vi.fn(),
        data: {
          kind: "pipeline-finalize",
          jobId: "pf-s3-1",
          toolId: "pipeline",
          userId: null,
          pool: "image",
          totalSteps: 1,
          inputRefs: [],
          filename: "out.jpg",
          settings: {},
        },
      };

      for (const fault of s3Faults) {
        getGenericObjectStream.mockRejectedValueOnce(fault);
        dbSetMock.mockClear();
        const caughtFinalize = await processor(finalizeJob).catch((err: unknown) => err);
        expect(caughtFinalize).toMatchObject({
          name: "SafeError",
          isSafeMessage: true,
          kind: "operational",
          code: "storage-unavailable",
          statusCode: 503,
          message: "The server's storage service is unavailable.",
          cause: fault,
        });
        expect(classifyError(caughtFinalize, "worker")).toBe("operational");
        expect(dbSetMock).toHaveBeenLastCalledWith(
          expect.objectContaining({
            status: "failed",
            error: {
              code: "storage-unavailable",
              httpStatus: 503,
              message: "The server's storage service is unavailable.",
            },
          }),
        );
      }

      // Mid-stream S3 error in processPipelineFinalize
      const midStreamFault = Object.assign(new Error("Premature close"), {
        code: "ERR_STREAM_PREMATURE_CLOSE",
      });
      getGenericObjectStream.mockResolvedValueOnce(
        Readable.from(
          (async function* () {
            yield Buffer.from("partial");
            throw midStreamFault;
          })(),
        ),
      );
      dbSetMock.mockClear();
      const caughtMid = await processor(finalizeJob).catch((err: unknown) => err);
      expect(caughtMid).toMatchObject({
        name: "SafeError",
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        cause: midStreamFault,
      });
      expect(classifyError(caughtMid, "worker")).toBe("operational");
      expect(dbSetMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: "failed",
          error: {
            code: "storage-unavailable",
            httpStatus: 503,
            message: "The server's storage service is unavailable.",
          },
        }),
      );

      // Unexpected non-S3 defect in processPipelineFinalize still classifies as "bug"
      const unexpectedBug = new TypeError("unexpected S3 client defect");
      getGenericObjectStream.mockRejectedValueOnce(unexpectedBug);
      dbSetMock.mockClear();
      const caughtBug = await processor(finalizeJob).catch((err: unknown) => err);
      expect(caughtBug).toBe(unexpectedBug);
      expect(classifyError(caughtBug, "worker")).toBe("bug");
      expect(dbSetMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: "failed",
          error: {
            message: "Pipeline processing failed",
          },
        }),
      );

      // Missing-object rejection (isStorageServiceFault === false) rethrows untouched
      const noSuchKey = Object.assign(new Error("The specified key does not exist."), {
        name: "NoSuchKey",
        $metadata: { httpStatusCode: 404 },
      });
      getGenericObjectStream.mockRejectedValueOnce(noSuchKey);
      dbSetMock.mockClear();
      const caughtMissing = await processor(finalizeJob).catch((err: unknown) => err);
      expect(caughtMissing).toBe(noSuchKey);
      expect(dbSetMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: "failed",
          error: {
            message: "Pipeline processing failed",
          },
        }),
      );

      // Secondary getObjectBuffer(data.inputRefs[1]) in erase-object AI job handler
      const slowDown = s3Faults[0];
      getGenericObjectStream
        .mockResolvedValueOnce(Readable.from([Buffer.from("image-bytes")]))
        .mockResolvedValueOnce(Readable.from([Buffer.from("mask-bytes")]))
        .mockRejectedValueOnce(slowDown);
      dbSetMock.mockClear();
      const eraseErr = await processor({
        id: "job-erase-s3",
        attemptsMade: 0,
        opts: { attempts: 1 },
        updateProgress: vi.fn(),
        data: {
          jobId: "job-erase-s3",
          toolId: "erase-object",
          userId: null,
          pool: "ai",
          inputRefs: ["uploads/job-erase-s3/in.png", "uploads/job-erase-s3/mask.png"],
          filename: "in.png",
          settings: { format: "png", qualityMode: "fast" },
          kind: "ai-tool",
        },
      }).catch((err: unknown) => err);
      expect(eraseErr).toMatchObject({
        name: "SafeError",
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        message: "The server's storage service is unavailable.",
        cause: slowDown,
      });
      expect(classifyError(eraseErr, "worker")).toBe("operational");
      expect(dbSetMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: "failed",
          error: {
            code: "storage-unavailable",
            httpStatus: 503,
            message: "The server's storage service is unavailable.",
          },
        }),
      );

      // Secondary getObjectBuffer(data.inputRefs[1]) in sign-pdf AI job handler
      getGenericObjectStream
        .mockResolvedValueOnce(Readable.from([Buffer.from("pdf-bytes")]))
        .mockResolvedValueOnce(Readable.from([Buffer.from("sig-bytes")]))
        .mockRejectedValueOnce(slowDown);
      dbSetMock.mockClear();
      const signErr = await processor({
        id: "job-sign-s3",
        attemptsMade: 0,
        opts: { attempts: 1 },
        updateProgress: vi.fn(),
        data: {
          jobId: "job-sign-s3",
          toolId: "sign-pdf",
          userId: null,
          pool: "docs",
          inputRefs: ["uploads/job-sign-s3/in.pdf", "uploads/job-sign-s3/sig0.png"],
          filename: "in.pdf",
          settings: {
            placements: [{ sig: 0, page: 0, x: 0.1, y: 0.2, w: 0.3, h: 0.1 }],
          },
          kind: "ai-tool",
        },
      }).catch((err: unknown) => err);
      expect(signErr).toMatchObject({
        name: "SafeError",
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        message: "The server's storage service is unavailable.",
        cause: slowDown,
      });
      expect(classifyError(signErr, "worker")).toBe("operational");
      expect(dbSetMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: "failed",
          error: {
            code: "storage-unavailable",
            httpStatus: 503,
            message: "The server's storage service is unavailable.",
          },
        }),
      );

      // Secondary getObjectBuffer(settings.bgImageKey) in remove-gif-background AI job handler (#3478)
      for (const fault of s3Faults) {
        getGenericObjectStream
          .mockResolvedValueOnce(Readable.from([Buffer.from("gif-bytes")]))
          .mockRejectedValueOnce(fault);
        dbSetMock.mockClear();
        const gifErr = await processor({
          id: "job-gif-s3",
          attemptsMade: 0,
          opts: { attempts: 1 },
          updateProgress: vi.fn(),
          data: {
            jobId: "job-gif-s3",
            toolId: "remove-gif-background",
            userId: null,
            pool: "ai",
            inputRefs: ["uploads/job-gif-s3/in.gif"],
            filename: "in.gif",
            settings: {
              backgroundType: "image",
              bgImageKey: "uploads/job-gif-s3/bg-scene.png",
            },
            kind: "ai-tool",
          },
        }).catch((err: unknown) => err);
        expect(gifErr).toMatchObject({
          name: "SafeError",
          isSafeMessage: true,
          kind: "operational",
          code: "storage-unavailable",
          statusCode: 503,
          message: "The server's storage service is unavailable.",
          cause: fault,
        });
        expect(classifyError(gifErr, "worker")).toBe("operational");
        expect(dbSetMock).toHaveBeenLastCalledWith(
          expect.objectContaining({
            status: "failed",
            error: {
              code: "storage-unavailable",
              httpStatus: 503,
              message: "The server's storage service is unavailable.",
            },
          }),
        );
      }

      // Missing bgImageKey in remove-gif-background AI job handler: verifyS3Bucket resolves -> 410 INPUT_MISSING (unrecoverable)
      checkConnection.mockResolvedValueOnce(undefined);
      getGenericObjectStream
        .mockResolvedValueOnce(Readable.from([Buffer.from("gif-bytes")]))
        .mockRejectedValueOnce(noSuchKey);
      dbSetMock.mockClear();
      const gifMissingErr = await processor({
        id: "job-gif-missing-s3",
        attemptsMade: 0,
        opts: { attempts: 2 },
        updateProgress: vi.fn(),
        data: {
          jobId: "job-gif-missing-s3",
          toolId: "remove-gif-background",
          userId: null,
          pool: "ai",
          inputRefs: ["uploads/job-gif-missing-s3/in.gif"],
          filename: "in.gif",
          settings: {
            backgroundType: "image",
            bgImageKey: "uploads/job-gif-missing-s3/bg-scene.png",
          },
          kind: "ai-tool",
        },
      }).catch((err: unknown) => err);
      expect(checkConnection).toHaveBeenCalledTimes(1);
      expect(gifMissingErr).toBeInstanceOf(UnrecoverableError);
      expect((gifMissingErr as { cause?: unknown }).cause).toMatchObject({
        name: "SafeError",
        isSafeMessage: true,
        kind: "operational",
        code: "INPUT_MISSING",
        statusCode: 410,
        message: "Input file is no longer available. Upload it again.",
        cause: noSuchKey,
      });
      expect(classifyError(gifMissingErr, "worker")).toBe("operational");
      expect(dbSetMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: "failed",
          error: {
            message: "Input file is no longer available. Upload it again.",
          },
        }),
      );

      // Missing bgImageKey where verifyS3Bucket rejects -> 503 storage-unavailable
      const bucketGone = s3Faults[2];
      checkConnection.mockRejectedValueOnce(bucketGone);
      getGenericObjectStream
        .mockResolvedValueOnce(Readable.from([Buffer.from("gif-bytes")]))
        .mockRejectedValueOnce(noSuchKey);
      dbSetMock.mockClear();
      const gifBucketErr = await processor({
        id: "job-gif-bucket-s3",
        attemptsMade: 0,
        opts: { attempts: 1 },
        updateProgress: vi.fn(),
        data: {
          jobId: "job-gif-bucket-s3",
          toolId: "remove-gif-background",
          userId: null,
          pool: "ai",
          inputRefs: ["uploads/job-gif-bucket-s3/in.gif"],
          filename: "in.gif",
          settings: {
            backgroundType: "image",
            bgImageKey: "uploads/job-gif-bucket-s3/bg-scene.png",
          },
          kind: "ai-tool",
        },
      }).catch((err: unknown) => err);
      expect(gifBucketErr).toMatchObject({
        name: "SafeError",
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        message: "The server's storage service is unavailable.",
        cause: bucketGone,
      });
      expect(classifyError(gifBucketErr, "worker")).toBe("operational");
      expect(dbSetMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: "failed",
          error: {
            code: "storage-unavailable",
            httpStatus: 503,
            message: "The server's storage service is unavailable.",
          },
        }),
      );

      // Unexpected non-S3 defect on bgImageKey in remove-gif-background still wraps as a bug SafeError
      getGenericObjectStream
        .mockResolvedValueOnce(Readable.from([Buffer.from("gif-bytes")]))
        .mockRejectedValueOnce(unexpectedBug);
      const gifBugErr = await processor({
        id: "job-gif-bug-s3",
        attemptsMade: 0,
        opts: { attempts: 1 },
        updateProgress: vi.fn(),
        data: {
          jobId: "job-gif-bug-s3",
          toolId: "remove-gif-background",
          userId: null,
          pool: "ai",
          inputRefs: ["uploads/job-gif-bug-s3/in.gif"],
          filename: "in.gif",
          settings: {
            backgroundType: "image",
            bgImageKey: "uploads/job-gif-bug-s3/bg-scene.png",
          },
          kind: "ai-tool",
        },
      }).catch((err: unknown) => err);
      expect(gifBugErr).toMatchObject({
        name: "SafeError",
        isSafeMessage: true,
        kind: "bug",
        code: "webp",
        message: "Animated background removal failed",
        cause: unexpectedBug,
      });
      expect(classifyError(gifBugErr, "worker")).toBe("bug");
    });

    it("normalizes S3 getObjectStream rejections and mid-stream read faults in buildBatchZip before putObjectStream routes them through localWriteFault (#3480)", async () => {
      const { Readable } = await import("node:stream");
      const getGenericObjectStream = vi.fn();
      const putGenericObject = vi.fn().mockResolvedValue(undefined);
      const putGenericObjectStream = vi.fn(async (_key: string, source: AsyncIterable<Buffer>) => {
        for await (const _chunk of source) {
          // drain passthrough so sourceError surfaces in putObjectStream
        }
      });
      const deleteGenericObject = vi.fn().mockResolvedValue(undefined);
      const failBatchJobMock = vi.fn().mockResolvedValue(true);
      const completeBatchJobMock = vi.fn().mockResolvedValue(undefined);
      const childRow = {
        id: "batch-s3-1-f0",
        status: "completed",
        inputRefs: ["uploads/batch-s3-1-f0/in.png"],
        outputRefs: ["outputs/batch-s3-1-f0/out.png"],
      };
      const dbSelectMock = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(async () => [childRow]),
        })),
      }));
      const { isMissingObjectError: s3IsMissingObjectError } = await vi.importActual<
        typeof import("../../../../packages/enterprise/src/storage-s3.js")
      >("../../../../packages/enterprise/src/storage-s3.js");
      const actualShared = await vi.importActual<
        typeof import("../../../../packages/shared/src/index.js")
      >("../../../../packages/shared/src/index.js");

      const workerMod = await loadWorker("", () => {
        vi.doMock("@snapotter/shared", () => ({
          ...actualShared,
          ANALYTICS_EVENTS: {},
          TOOLS: [],
          COMPRESS_PRESETS: [],
          CAMERA_RAW_INPUTS: [],
          getBundleForTool: vi.fn(() => null),
          getOptionalBundleForTool: vi.fn(() => null),
        }));
        vi.doMock("../../../../apps/api/src/config.js", () => ({
          env: {
            BASE_PATH: "",
            SCRATCH_PATH: "",
            STORAGE_MODE: "s3",
            WORKSPACE_PATH: "/unused",
            S3_BUCKET: "snap-bucket",
            S3_REGION: "us-east-1",
            S3_ENDPOINT: "https://s3.example.test",
            S3_ACCESS_KEY_ID: "AKIA-TEST",
            S3_SECRET_ACCESS_KEY: "secret",
            S3_FORCE_PATH_STYLE: true,
            S3_PREFIX: "",
            JOB_TIMEOUT_LONG_S: 60,
            JOB_TIMEOUT_FAST_S: 15,
          },
        }));
        vi.doMock("../../../../apps/api/src/db/index.js", () => ({
          db: { select: dbSelectMock },
          schema: { jobs: { id: "jobs.id" } },
        }));
        vi.doMock("../../../../apps/api/src/jobs/batch-progress.js", () => ({
          isBatchCanceled: vi.fn(async () => false),
          readBatchCounters: vi.fn(async () => ({ done: 1, failed: 0, errors: [] })),
          recordChildOutcome: vi.fn(),
        }));
        vi.doMock("../../../../apps/api/src/routes/progress.js", () => ({
          cancelBatchJob: vi.fn(),
          cancelSingleJobGuarded: vi.fn(),
          completeBatchJob: completeBatchJobMock,
          failBatchJob: failBatchJobMock,
          failSingleJobGuarded: vi.fn(),
          publishEphemeral: vi.fn(),
          updateSingleFileProgress: vi.fn(),
          updateSingleFileProgressAtomically: vi.fn(),
        }));
        vi.doMock("@snapotter/media-engine", () => ({
          HW_ACCEL_FAMILIES: [],
          hwAccelStatus: vi.fn(() => ({ requested: undefined })),
          softwareEncoderStatus: vi.fn(() => ({ missing: [], probeError: undefined })),
        }));
        vi.doMock("../../../../apps/api/src/lib/binary-overrides.js", () => ({
          binaryOverrideWarning: vi.fn(),
          checkBinaryOverrides: vi.fn(() => []),
          isBinarySpawnFailure,
          probeFailureLevel: vi.fn(() => "warn"),
        }));
        vi.doMock("@snapotter/enterprise", () => ({
          loadS3Storage: vi.fn(async () => ({
            isMissingObjectError: s3IsMissingObjectError,
            configureS3: vi.fn(),
            checkConnection: vi.fn(),
            deleteGenericObject,
            deleteGenericPrefix: vi.fn().mockResolvedValue(undefined),
            getGenericObjectSize: vi.fn(),
            getGenericObjectStream,
            putGenericObject,
            putGenericObjectStream,
          })),
        }));
        vi.doUnmock("../../../../apps/api/src/lib/object-storage.js");
      });
      const { classifyError } = await vi.importActual<
        typeof import("../../../../apps/api/src/lib/error-report.js")
      >("../../../../apps/api/src/lib/error-report.js");

      const { Worker } = await import("bullmq");
      workerMod.startWorkers();
      const workerCalls = (Worker as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const systemCall = workerCalls.find(([queue]) => String(queue).endsWith("system"));
      if (!systemCall) throw new Error("system pool worker not registered");
      const processor = systemCall[1] as (job: unknown) => Promise<unknown>;

      const batchJob = {
        id: "batch-s3-1",
        name: "batch-finalize",
        attemptsMade: 0,
        opts: { attempts: 1 },
        updateProgress: vi.fn(),
        data: {
          kind: "batch-finalize",
          jobId: "batch-s3-1",
          toolId: "resize",
          userId: null,
          pool: "system",
          totalFiles: 1,
          inputRefs: [],
          filename: "",
          settings: { flowChildCount: 1, fileIndexMap: [0] },
        },
      };

      // 1. Mid-stream S3 ERR_STREAM_PREMATURE_CLOSE on source.on("error")
      const prematureClose = Object.assign(new Error("Premature close"), {
        code: "ERR_STREAM_PREMATURE_CLOSE",
      });
      getGenericObjectStream.mockResolvedValueOnce(
        Readable.from(
          (async function* () {
            yield Buffer.from("partial-child-bytes");
            throw prematureClose;
          })(),
        ),
      );
      failBatchJobMock.mockClear();
      deleteGenericObject.mockClear();
      const caughtPremature = await processor(batchJob).catch((err: unknown) => err);
      expect(caughtPremature).toMatchObject({
        name: "SafeError",
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        message: "The server's storage service is unavailable.",
        cause: prematureClose,
      });
      expect(classifyError(caughtPremature, "worker")).toBe("operational");
      expect(failBatchJobMock).toHaveBeenCalledWith({
        jobId: "batch-s3-1",
        totalFiles: 1,
        completedFiles: 1,
        failedFiles: 0,
        message: "The server's storage service is unavailable.",
        code: "storage-unavailable",
        errors: [{ filename: "", error: "The server's storage service is unavailable." }],
      });
      expect(deleteGenericObject).toHaveBeenCalledWith(
        "outputs/batch-s3-1/batch-resize-batch-s3.zip",
      );

      // 2. Mid-stream S3 { code: "EIO", syscall: "read" } on source.on("error")
      const midStreamEio = Object.assign(new Error("S3 stream reset"), {
        code: "EIO",
        syscall: "read",
      });
      getGenericObjectStream.mockResolvedValueOnce(
        Readable.from(
          (async function* () {
            yield Buffer.from("partial-child-bytes");
            throw midStreamEio;
          })(),
        ),
      );
      failBatchJobMock.mockClear();
      const caughtMidEio = await processor(batchJob).catch((err: unknown) => err);
      expect(caughtMidEio).toMatchObject({
        name: "SafeError",
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        message: "The server's storage service is unavailable.",
        cause: midStreamEio,
      });
      expect(classifyError(caughtMidEio, "worker")).toBe("operational");
      expect(failBatchJobMock).toHaveBeenCalledWith({
        jobId: "batch-s3-1",
        totalFiles: 1,
        completedFiles: 1,
        failedFiles: 0,
        message: "The server's storage service is unavailable.",
        code: "storage-unavailable",
        errors: [{ filename: "", error: "The server's storage service is unavailable." }],
      });

      // 3. Open-time getObjectStream rejections across S3 service and stream faults
      const openFaults = [
        Object.assign(new Error("Please reduce your request rate."), {
          name: "SlowDown",
          $metadata: { httpStatusCode: 503 },
        }),
        Object.assign(new Error("Access Denied"), {
          name: "AccessDenied",
          $metadata: { httpStatusCode: 403 },
        }),
        Object.assign(new Error("The specified bucket does not exist"), {
          name: "NoSuchBucket",
          $metadata: { httpStatusCode: 404 },
        }),
        Object.assign(new Error("Premature close"), { code: "ERR_STREAM_PREMATURE_CLOSE" }),
        Object.assign(new Error("S3 stream reset"), { code: "EIO", syscall: "read" }),
      ];
      for (const fault of openFaults) {
        getGenericObjectStream.mockRejectedValueOnce(fault);
        failBatchJobMock.mockClear();
        const caughtOpen = await processor(batchJob).catch((err: unknown) => err);
        expect(caughtOpen).toMatchObject({
          name: "SafeError",
          isSafeMessage: true,
          kind: "operational",
          code: "storage-unavailable",
          statusCode: 503,
          message: "The server's storage service is unavailable.",
          cause: fault,
        });
        expect(classifyError(caughtOpen, "worker")).toBe("operational");
        expect(failBatchJobMock).toHaveBeenCalledWith({
          jobId: "batch-s3-1",
          totalFiles: 1,
          completedFiles: 1,
          failedFiles: 0,
          message: "The server's storage service is unavailable.",
          code: "storage-unavailable",
          errors: [{ filename: "", error: "The server's storage service is unavailable." }],
        });
      }

      // 4. Unexpected non-S3 defect and missing-object (NoSuchKey) still classify as "bug"
      const unexpectedBug = new TypeError("unexpected S3 stream defect");
      getGenericObjectStream.mockRejectedValueOnce(unexpectedBug);
      failBatchJobMock.mockClear();
      const caughtBug = await processor(batchJob).catch((err: unknown) => err);
      expect(caughtBug).toBe(unexpectedBug);
      expect(classifyError(caughtBug, "worker")).toBe("bug");
      expect(failBatchJobMock).toHaveBeenCalledWith({
        jobId: "batch-s3-1",
        totalFiles: 1,
        completedFiles: 1,
        failedFiles: 0,
        message: "Failed to package batch results",
        code: undefined,
        errors: [{ filename: "", error: "Failed to package batch results" }],
      });

      const noSuchKey = Object.assign(new Error("The specified key does not exist."), {
        name: "NoSuchKey",
        $metadata: { httpStatusCode: 404 },
      });
      getGenericObjectStream.mockRejectedValueOnce(noSuchKey);
      failBatchJobMock.mockClear();
      const caughtMissing = await processor(batchJob).catch((err: unknown) => err);
      expect(caughtMissing).toBe(noSuchKey);
      expect(classifyError(caughtMissing, "worker")).toBe("bug");
      expect(failBatchJobMock).toHaveBeenCalledWith({
        jobId: "batch-s3-1",
        totalFiles: 1,
        completedFiles: 1,
        failedFiles: 0,
        message: "Failed to package batch results",
        code: undefined,
        errors: [{ filename: "", error: "Failed to package batch results" }],
      });

      getGenericObjectStream.mockRejectedValueOnce("raw-string-stream-fault");
      failBatchJobMock.mockClear();
      const caughtString = await processor(batchJob).catch((err: unknown) => err);
      expect(caughtString).toBeInstanceOf(Error);
      expect((caughtString as Error).message).toBe("raw-string-stream-fault");
      expect(classifyError(caughtString, "worker")).toBe("bug");
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
        stageAutoSaveToLibrary: vi.fn().mockResolvedValue({}),
      }));
      vi.doMock("@snapotter/media-engine", () => ({
        HW_ACCEL_FAMILIES: [],
        hwAccelStatus: vi.fn(() => ({ requested: undefined })),
        softwareEncoderStatus: vi.fn(() => ({ missing: [], probeError: undefined })),
      }));
      vi.doMock("../../../../apps/api/src/lib/binary-overrides.js", () => ({
        binaryOverrideWarning: vi.fn(),
        checkBinaryOverrides: vi.fn(() => []),
        isBinarySpawnFailure,
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

    // 4b. A worker-side binary spawn failure (qpdfSpawnFailure or a missing
    // engine binary) converts to an unrecoverable 503 ENGINE_UNAVAILABLE
    // SafeError without leaking the binary path or retrying (#2937).
    dbSetMock.mockClear();
    const spawnOom = Object.assign(new Error("spawn /usr/bin/qpdf ENOMEM"), {
      code: "ENOMEM",
      syscall: "spawn",
      path: "/usr/bin/qpdf",
      signal: "SIGKILL" as const,
    });
    processV2Mock.mockRejectedValueOnce(spawnOom);
    const rejectedSpawn = await processor({
      ...makeJob("job-spawn-oom"),
      opts: { attempts: 2 },
    }).catch((e: unknown) => e);
    expect(rejectedSpawn).toBeInstanceOf(UnrecoverableError);
    expect((rejectedSpawn as Error).message).not.toContain("/usr/bin/qpdf");
    expect((rejectedSpawn as { cause?: unknown }).cause).toMatchObject({
      name: "SafeError",
      kind: "operational",
      code: "ENGINE_UNAVAILABLE",
      statusCode: 503,
      cause: spawnOom,
    });
    expect(dbSetMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "failed",
        error: {
          code: "ENGINE_UNAVAILABLE",
          httpStatus: 503,
          message:
            "Processing is unavailable on this server because a required engine binary could not be started.",
        },
      }),
    );

    // Non-spawn ENOENT (e.g. syscall: "open" inside a tool) is NOT converted
    // to ENGINE_UNAVAILABLE or UnrecoverableError, so attempt 1 of 2 retries.
    dbSetMock.mockClear();
    const openEnoent = enoent("/tmp/scratch/missing.pdf");
    processV2Mock.mockRejectedValueOnce(openEnoent);
    const rejectedOpen = await processor({
      ...makeJob("job-open-enoent"),
      opts: { attempts: 2 },
    }).catch((e: unknown) => e);
    expect(rejectedOpen).toBe(openEnoent);
    expect(rejectedOpen).not.toBeInstanceOf(UnrecoverableError);

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
    // attempt (logging a warning if releaseFinalize rejects), including when
    // stageAutoSaveToLibrary claimed finalize before the rolled-back commit
    // (#2349, #2350), and keeps the claim on a final attempt.
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
    atomicCommitMock.mockClear();
    dbSetMock.mockClear();
    (progressMod.updateSingleFileProgress as ReturnType<typeof vi.fn>).mockClear();
    (logger.error as ReturnType<typeof vi.fn>).mockClear();
    const failureWriteErr = new Error("postgres still unreachable");
    let capturedFailureMutate: ((tx: unknown) => Promise<void>) | undefined;
    atomicCommitMock
      .mockRejectedValueOnce(new Error("final commit failed"))
      .mockImplementationOnce(async (_frame: unknown, mutate: (tx: unknown) => Promise<void>) => {
        capturedFailureMutate = mutate;
        throw failureWriteErr;
      });
    processV2Mock.mockResolvedValueOnce({
      buffer: Buffer.from("out-bytes"),
      filename: "out.jpg",
      contentType: "image/jpeg",
    });
    const finalFaultJob = makeJob("job-final-fault");
    (finalFaultJob.data as { clientJobId?: string }).clientJobId = "client-final-fault";
    await expect(processor(finalFaultJob)).rejects.toThrow("final commit failed");
    expect(releaseFinalizeMock).not.toHaveBeenCalled();
    expect(atomicCommitMock).toHaveBeenCalledTimes(2);
    expect(atomicCommitMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        jobId: "client-final-fault",
        phase: "failed",
        percent: 0,
        error: "final commit failed",
      }),
      expect.any(Function),
    );
    expect(progressMod.updateSingleFileProgress).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      { err: failureWriteErr, jobId: "job-final-fault", toolId: "compress" },
      "terminal status write failed",
    );
    const failureWhereMock = vi.fn().mockResolvedValue(undefined);
    const failureSetMock = vi.fn(() => ({ where: failureWhereMock }));
    await capturedFailureMutate?.({ update: vi.fn(() => ({ set: failureSetMock })) });
    expect(failureSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: { message: "final commit failed" },
      }),
    );
    expect(failureWhereMock).toHaveBeenCalledWith({
      op: "eq",
      col: "jobs.id",
      val: "job-final-fault",
    });

    const postprocessMod = await import("../../../../apps/api/src/jobs/postprocess.js");
    const stageAutoSaveMock = postprocessMod.stageAutoSaveToLibrary as ReturnType<typeof vi.fn>;
    const saveCommitMock = vi.fn().mockResolvedValue({ fileId: "saved-v2" });
    const saveAfterCommitMock = vi.fn().mockResolvedValue({ fileId: "saved-v2" });
    const saveOnAbortMock = vi.fn().mockResolvedValue(undefined);
    stageAutoSaveMock.mockResolvedValueOnce({
      finalizeClaimed: true,
      commit: saveCommitMock,
      afterCommit: saveAfterCommitMock,
      onAbort: saveOnAbortMock,
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
    expect(saveOnAbortMock).toHaveBeenCalledTimes(1);
    expect(saveAfterCommitMock).not.toHaveBeenCalled();
    expect(releaseFinalizeMock).toHaveBeenCalledWith("job-saved-commit-fault");

    // 7. When the completion transaction succeeds, stageAutoSaveToLibrary's
    // commit callback runs inside updateSingleFileProgressAtomically and
    // stamps savedFileId onto both the job row's progress and the returned
    // ToolJobResult (#2350).
    stageAutoSaveMock.mockResolvedValueOnce({
      finalizeClaimed: true,
      commit: saveCommitMock,
      afterCommit: saveAfterCommitMock,
      onAbort: saveOnAbortMock,
    });
    saveCommitMock.mockClear();
    saveAfterCommitMock.mockClear();
    saveOnAbortMock.mockClear();
    dbSetMock.mockClear();
    const txStub = {
      update: vi.fn(() => ({ set: dbSetMock })),
    };
    atomicCommitMock.mockImplementationOnce(
      async (_frame: unknown, mutate: (tx: unknown) => Promise<void>) => {
        await mutate(txStub);
      },
    );
    processV2Mock.mockResolvedValueOnce({
      buffer: Buffer.from("out-bytes"),
      filename: "out.jpg",
      contentType: "image/jpeg",
    });
    const completedSaved = (await processor(makeJob("job-saved-commit-ok"))) as {
      savedFileId?: string;
    };
    expect(saveCommitMock).toHaveBeenCalledWith(txStub);
    expect(saveAfterCommitMock).toHaveBeenCalledTimes(1);
    expect(saveOnAbortMock).not.toHaveBeenCalled();
    expect(completedSaved.savedFileId).toBe("saved-v2");
    expect(dbSetMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "completed",
        progress: expect.objectContaining({
          result: expect.objectContaining({ savedFileId: "saved-v2" }),
        }),
      }),
    );

    // 8. When stagedSave.commit(tx) returns an error (quota refusal or caught
    // save fault) or stageAutoSaveToLibrary returns a staging error,
    // autoSaveError propagates onto both the job row's progress and the
    // returned ToolJobResult (#2350).
    const quotaError = "Storage quota exceeded. Please delete some files.";
    const saveQuotaCommitMock = vi.fn().mockResolvedValue({ error: quotaError });
    const saveQuotaAfterCommitMock = vi.fn().mockResolvedValue({ error: quotaError });
    stageAutoSaveMock.mockResolvedValueOnce({
      finalizeClaimed: true,
      commit: saveQuotaCommitMock,
      afterCommit: saveQuotaAfterCommitMock,
      onAbort: saveOnAbortMock,
    });
    dbSetMock.mockClear();
    atomicCommitMock.mockImplementationOnce(
      async (_frame: unknown, mutate: (tx: unknown) => Promise<void>) => {
        await mutate(txStub);
      },
    );
    processV2Mock.mockResolvedValueOnce({
      buffer: Buffer.from("out-bytes"),
      filename: "out.jpg",
      contentType: "image/jpeg",
    });
    const completedQuota = (await processor(makeJob("job-saved-quota"))) as {
      savedFileId?: string;
      autoSaveError?: string;
    };
    expect(saveQuotaCommitMock).toHaveBeenCalledWith(txStub);
    expect(saveQuotaAfterCommitMock).toHaveBeenCalledWith();
    expect(completedQuota.savedFileId).toBeUndefined();
    expect(completedQuota.autoSaveError).toBe(quotaError);
    expect(dbSetMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "completed",
        progress: expect.objectContaining({
          result: expect.objectContaining({ autoSaveError: quotaError }),
        }),
      }),
    );

    const stageError = "An unexpected system error prevented saving to your library.";
    stageAutoSaveMock.mockResolvedValueOnce({ error: stageError });
    claimFinalizeMock.mockClear();
    dbSetMock.mockClear();
    atomicCommitMock.mockImplementationOnce(
      async (_frame: unknown, mutate: (tx: unknown) => Promise<void>) => {
        await mutate(txStub);
      },
    );
    processV2Mock.mockResolvedValueOnce({
      buffer: Buffer.from("out-bytes"),
      filename: "out.jpg",
      contentType: "image/jpeg",
    });
    const completedStageErr = (await processor(makeJob("job-saved-stage-err"))) as {
      autoSaveError?: string;
    };
    expect(claimFinalizeMock).toHaveBeenCalledWith("job-saved-stage-err");
    expect(completedStageErr.autoSaveError).toBe(stageError);
    expect(dbSetMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "completed",
        progress: expect.objectContaining({
          result: expect.objectContaining({ autoSaveError: stageError }),
        }),
      }),
    );
  });

  it("arms a fresh upload timeout signal after the handler returns for streamed primary and extra outputs (#2295)", async () => {
    const processV2Mock = vi.fn();
    const dbSetMock = vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    }));
    const userCancelAc = new AbortController();
    const timeoutControllers: AbortController[] = [];
    let handlerDoneAtCall = false;
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
      expect(handlerDoneAtCall).toBe(true);
      expect(ms).toBe(15_000);
      const ac = new AbortController();
      timeoutControllers.push(ac);
      return ac.signal;
    });

    try {
      const workerMod = await loadWorker("", () => {
        vi.doMock("node:fs", () => ({
          createReadStream: vi.fn((p: string) => ({ path: p })),
        }));
        vi.doMock("node:fs/promises", () => ({
          mkdir: vi.fn().mockResolvedValue(undefined),
          readFile: vi.fn(),
          rm: vi.fn().mockResolvedValue(undefined),
          stat: vi.fn().mockResolvedValue({ size: 2 * 1024 ** 3 }),
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
        vi.doMock("../../../../apps/api/src/jobs/cancel.js", () => ({
          claimFinalize: vi.fn(async () => true),
          registerCancelable: vi.fn(() => new AbortController()),
          releaseFinalize: vi.fn(async () => {}),
          unregisterCancelable: vi.fn(),
          userCancelSignal: vi.fn(() => userCancelAc.signal),
          wasUserCanceled: vi.fn(() => false),
        }));
        vi.doMock("../../../../apps/api/src/jobs/postprocess.js", () => ({
          autoSaveToLibrary: vi.fn().mockResolvedValue({}),
          buildOutputName: vi.fn((out: string) => out),
          generatePreview: vi.fn().mockResolvedValue(undefined),
          stageAutoSaveToLibrary: vi.fn().mockResolvedValue({}),
        }));
        vi.doMock("@snapotter/media-engine", () => ({
          HW_ACCEL_FAMILIES: [],
          hwAccelStatus: vi.fn(() => ({ requested: undefined })),
          softwareEncoderStatus: vi.fn(() => ({ missing: [], probeError: undefined })),
        }));
        vi.doMock("../../../../apps/api/src/lib/binary-overrides.js", () => ({
          binaryOverrideWarning: vi.fn(),
          checkBinaryOverrides: vi.fn(() => []),
          isBinarySpawnFailure,
          probeFailureLevel: vi.fn(() => "warn"),
        }));
      });

      objectStorageMocks.getObjectBuffer.mockResolvedValue(Buffer.from("input-bytes"));
      objectStorageMocks.putObject.mockResolvedValue(undefined);
      objectStorageMocks.putObjectStream.mockResolvedValue(2 * 1024 ** 3);

      const { Worker } = await import("bullmq");
      workerMod.startWorkers();
      const workerCalls = (Worker as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const imageCall = workerCalls.find(([queue]) => String(queue).endsWith("image"));
      if (!imageCall) throw new Error("image pool worker not registered");
      const processor = imageCall[1] as (job: unknown) => Promise<unknown>;

      // Buffered outputs never arm AbortSignal.timeout.
      processV2Mock.mockResolvedValueOnce({
        buffer: Buffer.from("small-bytes"),
        filename: "small.jpg",
        contentType: "image/jpeg",
      });
      await processor({
        id: "job-buffered-only",
        attemptsMade: 0,
        opts: { attempts: 1 },
        updateProgress: vi.fn(),
        data: {
          jobId: "job-buffered-only",
          toolId: "compress",
          userId: null,
          pool: "image",
          inputRefs: ["uploads/job-buffered-only/in.jpg"],
          filename: "in.jpg",
          settings: {},
          kind: "tool",
        },
      });
      expect(timeoutSpy).not.toHaveBeenCalled();

      processV2Mock.mockImplementationOnce(async () => {
        expect(timeoutSpy).not.toHaveBeenCalled();
        handlerDoneAtCall = true;
        return {
          scratchPath: "/tmp/job-stream/primary.bin",
          filename: "primary.bin",
          contentType: "application/octet-stream",
          extraOutputs: [
            {
              name: "extra.bin",
              scratchPath: "/tmp/job-stream/extra.bin",
              contentType: "application/octet-stream",
            },
          ],
        };
      });

      await processor({
        id: "job-stream",
        attemptsMade: 0,
        opts: { attempts: 1 },
        updateProgress: vi.fn(),
        data: {
          jobId: "job-stream",
          toolId: "compress",
          userId: null,
          pool: "image",
          inputRefs: ["uploads/job-stream/in.jpg"],
          filename: "in.jpg",
          settings: {},
          kind: "tool",
        },
      });

      expect(timeoutSpy).toHaveBeenCalledTimes(1);
      expect(objectStorageMocks.putObjectStream).toHaveBeenCalledTimes(2);
      const primaryOpts = objectStorageMocks.putObjectStream.mock.calls[0]?.[2] as {
        signal?: AbortSignal;
      };
      const extraOpts = objectStorageMocks.putObjectStream.mock.calls[1]?.[2] as {
        signal?: AbortSignal;
      };
      expect(primaryOpts.signal).toBeInstanceOf(AbortSignal);
      expect(primaryOpts.signal).not.toBe(userCancelAc.signal);
      expect(extraOpts.signal).toBe(primaryOpts.signal);
      expect(primaryOpts.signal?.aborted).toBe(false);
      const timeoutReason = new DOMException(
        "The operation was aborted due to timeout",
        "TimeoutError",
      );
      timeoutControllers[0]?.abort(timeoutReason);
      expect(primaryOpts.signal?.aborted).toBe(true);
      expect(primaryOpts.signal?.reason).toBe(timeoutReason);

      // Verify userCancel also aborts the composite uploadSignal.
      objectStorageMocks.putObjectStream.mockClear();
      processV2Mock.mockResolvedValueOnce({
        scratchPath: "/tmp/job-stream-cancel/primary.bin",
        filename: "primary.bin",
        contentType: "application/octet-stream",
      });
      await processor({
        id: "job-stream-cancel",
        attemptsMade: 0,
        opts: { attempts: 1 },
        updateProgress: vi.fn(),
        data: {
          jobId: "job-stream-cancel",
          toolId: "compress",
          userId: null,
          pool: "image",
          inputRefs: ["uploads/job-stream-cancel/in.jpg"],
          filename: "in.jpg",
          settings: {},
          kind: "tool",
        },
      });
      const cancelOpts = objectStorageMocks.putObjectStream.mock.calls[0]?.[2] as {
        signal?: AbortSignal;
      };
      expect(cancelOpts.signal?.aborted).toBe(false);
      userCancelAc.abort();
      expect(cancelOpts.signal?.aborted).toBe(true);

      // When the pool timeout is 0 (unlimited), putObjectStream receives
      // userCancel directly without arming AbortSignal.timeout.
      timeoutSpy.mockClear();
      objectStorageMocks.putObjectStream.mockClear();
      const { env } = await import("../../../../apps/api/src/config.js");
      (env as { JOB_TIMEOUT_FAST_S: number }).JOB_TIMEOUT_FAST_S = 0;
      const unlimitedCancelAc = new AbortController();
      const cancelMod = await import("../../../../apps/api/src/jobs/cancel.js");
      (cancelMod.userCancelSignal as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        unlimitedCancelAc.signal,
      );
      processV2Mock.mockResolvedValueOnce({
        scratchPath: "/tmp/job-stream-unlimited/primary.bin",
        filename: "primary.bin",
        contentType: "application/octet-stream",
      });
      await processor({
        id: "job-stream-unlimited",
        attemptsMade: 0,
        opts: { attempts: 1 },
        updateProgress: vi.fn(),
        data: {
          jobId: "job-stream-unlimited",
          toolId: "compress",
          userId: null,
          pool: "image",
          inputRefs: ["uploads/job-stream-unlimited/in.jpg"],
          filename: "in.jpg",
          settings: {},
          kind: "tool",
        },
      });
      expect(timeoutSpy).not.toHaveBeenCalled();
      expect(objectStorageMocks.putObjectStream).toHaveBeenCalledTimes(1);
      expect(objectStorageMocks.putObjectStream.mock.calls[0]?.[2]).toEqual({
        signal: unlimitedCancelAc.signal,
      });
    } finally {
      timeoutSpy.mockRestore();
    }
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
        isBinarySpawnFailure,
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
          isBinarySpawnFailure,
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

describe("processBatchFinalize durable error recovery (#2629)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  async function setupSystemProcessor(opts: {
    rowsById: Record<string, Record<string, unknown> | undefined>;
    counterErrors?: Array<{ filename: string; error: string }>;
  }) {
    const failBatchJobMock = vi.fn().mockResolvedValue(true);
    const completeBatchJobMock = vi.fn().mockResolvedValue(undefined);
    const cancelBatchJobMock = vi.fn().mockResolvedValue(undefined);
    const readBatchCountersMock = vi.fn().mockResolvedValue({
      done: 0,
      failed: (opts.counterErrors ?? []).length,
      errors: opts.counterErrors ?? [],
    });

    const actualErrors = await vi.importActual<
      typeof import("../../../../apps/api/src/lib/errors.js")
    >("../../../../apps/api/src/lib/errors.js");
    const actualEngineUnavailable = await vi.importActual<
      typeof import("../../../../apps/api/src/lib/engine-unavailable.js")
    >("../../../../apps/api/src/lib/engine-unavailable.js");

    const workerMod = await loadWorker("", () => {
      vi.doMock("../../../../apps/api/src/db/index.js", () => ({
        db: {
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(async (cond: { val?: string }) => {
                const row = cond?.val ? opts.rowsById[cond.val] : undefined;
                return row ? [row] : [];
              }),
            })),
          })),
        },
        schema: { jobs: { id: "jobs.id" } },
      }));
      vi.doMock("../../../../apps/api/src/lib/errors.js", () => ({
        friendlyError: vi.fn(actualErrors.friendlyError),
        sharedFailureReason: vi.fn(actualErrors.sharedFailureReason),
        stripInternalPaths: vi.fn(actualErrors.stripInternalPaths),
      }));
      vi.doMock("../../../../apps/api/src/lib/engine-unavailable.js", () => ({
        allFailedFault: vi.fn(actualEngineUnavailable.allFailedFault),
        allFailedInputCode: vi.fn(actualEngineUnavailable.allFailedInputCode),
      }));
      vi.doMock("../../../../apps/api/src/jobs/batch-progress.js", () => ({
        isBatchCanceled: vi.fn(async () => false),
        readBatchCounters: readBatchCountersMock,
        recordChildOutcome: vi.fn(),
      }));
      vi.doMock("../../../../apps/api/src/routes/progress.js", () => ({
        cancelBatchJob: cancelBatchJobMock,
        cancelSingleJobGuarded: vi.fn(),
        completeBatchJob: completeBatchJobMock,
        failBatchJob: failBatchJobMock,
        failSingleJobGuarded: vi.fn(),
        publishEphemeral: vi.fn(),
        updateSingleFileProgress: vi.fn(),
        updateSingleFileProgressAtomically: vi.fn(),
      }));
      vi.doMock("@snapotter/media-engine", () => ({
        HW_ACCEL_FAMILIES: [],
        hwAccelStatus: vi.fn(() => ({ requested: undefined })),
        softwareEncoderStatus: vi.fn(() => ({ missing: [], probeError: undefined })),
      }));
      vi.doMock("../../../../apps/api/src/lib/binary-overrides.js", () => ({
        binaryOverrideWarning: vi.fn(),
        checkBinaryOverrides: vi.fn(() => []),
        isBinarySpawnFailure,
        probeFailureLevel: vi.fn(() => "warn"),
      }));
    });

    const { Worker } = await import("bullmq");
    workerMod.startWorkers();
    const workerCalls = (Worker as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const systemCall = workerCalls.find(([queue]) => String(queue).endsWith("system"));
    if (!systemCall) throw new Error("system pool worker not registered");
    const processor = systemCall[1] as (job: unknown) => Promise<unknown>;

    return {
      processor,
      failBatchJobMock,
      completeBatchJobMock,
      cancelBatchJobMock,
      readBatchCountersMock,
    };
  }

  it("recovers per-file errors and sharedFailureReason from durable child rows when Redis counters are empty", async () => {
    const { processor, failBatchJobMock } = await setupSystemProcessor({
      rowsById: {
        "batch-1-f0": {
          id: "batch-1-f0",
          status: "failed",
          inputRefs: ["uploads/batch-1-f0/a.png"],
          error: { message: "Image width exceeds limit" },
        },
        "batch-1-f1": {
          id: "batch-1-f1",
          status: "failed",
          inputRefs: ["uploads/batch-1-f1/b.png"],
          error: { message: "Image width exceeds limit" },
        },
      },
      counterErrors: [],
    });

    await processor({
      id: "batch-1",
      name: "batch-finalize",
      data: {
        kind: "batch-finalize",
        jobId: "batch-1",
        toolId: "resize",
        userId: null,
        pool: "system",
        totalFiles: 2,
        inputRefs: [],
        filename: "",
        settings: { flowChildCount: 2, fileIndexMap: [0, 1] },
      },
    });

    expect(failBatchJobMock).toHaveBeenCalledWith({
      jobId: "batch-1",
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 2,
      message: "Image width exceeds limit",
      errors: [
        { filename: "a.png", error: "Image width exceeds limit" },
        { filename: "b.png", error: "Image width exceeds limit" },
        { filename: "", error: "Image width exceeds limit" },
      ],
    });
  });

  it("does not report a false sharedFailureReason when Redis counters missed a differently failed child", async () => {
    const { processor, failBatchJobMock } = await setupSystemProcessor({
      rowsById: {
        "batch-2-f0": {
          id: "batch-2-f0",
          status: "failed",
          inputRefs: ["uploads/batch-2-f0/a.png"],
          error: { message: "Reason A" },
        },
        "batch-2-f1": {
          id: "batch-2-f1",
          status: "failed",
          inputRefs: ["uploads/batch-2-f1/b.png"],
          error: { message: "Reason B" },
        },
      },
      counterErrors: [{ filename: "a.png", error: "Reason A" }],
    });

    await processor({
      id: "batch-2",
      name: "batch-finalize",
      data: {
        kind: "batch-finalize",
        jobId: "batch-2",
        toolId: "resize",
        userId: null,
        pool: "system",
        totalFiles: 2,
        inputRefs: [],
        filename: "",
        settings: { flowChildCount: 2, fileIndexMap: [0, 1] },
      },
    });

    expect(failBatchJobMock).toHaveBeenCalledWith({
      jobId: "batch-2",
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 2,
      message: "All files failed processing",
      errors: [
        { filename: "a.png", error: "Reason A" },
        { filename: "b.png", error: "Reason B" },
      ],
    });
  });

  it("backfills expired upload-time preFailureFaults alongside durable child failures", async () => {
    const { processor, failBatchJobMock } = await setupSystemProcessor({
      rowsById: {
        "batch-3-f0": {
          id: "batch-3-f0",
          status: "failed",
          inputRefs: ["uploads/batch-3-f0/a.png"],
          error: { message: "File is empty" },
        },
      },
      counterErrors: [],
    });

    await processor({
      id: "batch-3",
      name: "batch-finalize",
      data: {
        kind: "batch-finalize",
        jobId: "batch-3",
        toolId: "resize",
        userId: null,
        pool: "system",
        totalFiles: 3,
        inputRefs: [],
        filename: "",
        settings: {
          flowChildCount: 1,
          fileIndexMap: [0],
          preFailureFaults: [
            { filename: "empty.png", error: "File is empty" },
            { error: "File is empty" },
          ],
        },
      },
    });

    expect(failBatchJobMock).toHaveBeenCalledWith({
      jobId: "batch-3",
      totalFiles: 3,
      completedFiles: 3,
      failedFiles: 3,
      message: "File is empty",
      errors: [
        { filename: "empty.png", error: "File is empty" },
        { filename: "file-2", error: "File is empty" },
        { filename: "a.png", error: "File is empty" },
        { filename: "", error: "File is empty" },
      ],
    });
  });

  it("deduplicates partial counterErrors across pre-failures and pipeline-finalize rows and caps persisted errors at 100", async () => {
    // 1. Pre-failure recorded in counterErrors with real filename while flow child missed its write
    const { processor: p1, failBatchJobMock: fail1 } = await setupSystemProcessor({
      rowsById: {
        "batch-dedup-f0": {
          id: "batch-dedup-f0",
          type: "pipeline-finalize",
          status: "failed",
          inputRefs: [],
          error: { message: "Step 1: kaboom" },
        },
        "batch-dedup-f1": {
          id: "batch-dedup-f1",
          type: "pipeline-finalize",
          status: "failed",
          inputRefs: [],
          error: { message: "Step 1: other" },
        },
        "batch-dedup-f1-s0": {
          id: "batch-dedup-f1-s0",
          type: "pipeline-step",
          status: "failed",
          inputRefs: ["uploads/batch-dedup-f1-s0/second.png"],
          error: { message: "other" },
        },
        "batch-dedup-f2": {
          id: "batch-dedup-f2",
          type: "pipeline-finalize",
          status: "failed",
          inputRefs: ["uploads/batch-dedup-f2-s0/third.png"],
          error: { message: "Step 1: third-err" },
        },
      },
      counterErrors: [
        { filename: "empty.png", error: "File is empty" },
        { filename: "legacy-empty.png", error: "File is empty" },
        { filename: "first.png", error: "Step 1: kaboom" },
      ],
    });

    const res1 = (await p1({
      id: "batch-dedup",
      name: "batch-finalize",
      data: {
        kind: "batch-finalize",
        jobId: "batch-dedup",
        toolId: "pipeline-batch",
        userId: null,
        pool: "system",
        totalFiles: 5,
        inputRefs: [],
        filename: "",
        settings: {
          flowChildCount: 3,
          fileIndexMap: [2, 3, 4],
          preFailureFaults: [
            { filename: "empty.png", error: "File is empty" },
            { error: "File is empty" },
          ],
        },
      },
    })) as { resultPayload?: { manifest?: unknown } };

    expect(res1.resultPayload?.manifest).toEqual([
      { index: 0, filename: "file-0", error: "Step 1: kaboom" },
      { index: 1, filename: "second.png", error: "Step 1: other" },
      { index: 2, filename: "third.png", error: "Step 1: third-err" },
    ]);
    expect(fail1).toHaveBeenCalledWith({
      jobId: "batch-dedup",
      totalFiles: 5,
      completedFiles: 5,
      failedFiles: 5,
      message: "All files failed processing",
      errors: [
        { filename: "empty.png", error: "File is empty" },
        { filename: "legacy-empty.png", error: "File is empty" },
        { filename: "first.png", error: "Step 1: kaboom" },
        { filename: "second.png", error: "Step 1: other" },
        { filename: "third.png", error: "Step 1: third-err" },
      ],
    });

    // 2. 101 failed children: 100 in counterErrors with Reason A, 101st in DB with Reason B
    const rows101: Record<string, Record<string, unknown>> = {};
    const counter100: Array<{ filename: string; error: string }> = [];
    for (let i = 0; i < 101; i++) {
      const error = i < 100 ? "Reason A" : "Reason B";
      rows101[`batch-101-f${i}`] = {
        id: `batch-101-f${i}`,
        status: "failed",
        inputRefs: [`uploads/batch-101-f${i}/f${i}.png`],
        error: { message: error },
      };
      if (i < 100) {
        counter100.push({ filename: `f${i}.png`, error });
      }
    }
    const { processor: p2, failBatchJobMock: fail2 } = await setupSystemProcessor({
      rowsById: rows101,
      counterErrors: counter100,
    });

    await p2({
      id: "batch-101",
      name: "batch-finalize",
      data: {
        kind: "batch-finalize",
        jobId: "batch-101",
        toolId: "resize",
        userId: null,
        pool: "system",
        totalFiles: 101,
        inputRefs: [],
        filename: "",
        settings: { flowChildCount: 101 },
      },
    });

    expect(fail2).toHaveBeenCalledWith({
      jobId: "batch-101",
      totalFiles: 101,
      completedFiles: 101,
      failedFiles: 101,
      message: "All files failed processing",
      errors: counter100,
    });
  });

  it("retains per-file errors on partial failure, cancel, and packaging failure when Redis counters are empty", async () => {
    const { Readable } = await import("node:stream");
    objectStorageMocks.getObjectStream.mockImplementation(async () =>
      Readable.from(Buffer.from("ok")),
    );
    objectStorageMocks.putObject.mockResolvedValue(undefined);
    objectStorageMocks.putObjectStream.mockResolvedValue(42);

    const { processor, completeBatchJobMock, cancelBatchJobMock, failBatchJobMock } =
      await setupSystemProcessor({
        rowsById: {
          "batch-partial-f0": {
            id: "batch-partial-f0",
            status: "completed",
            inputRefs: ["uploads/batch-partial-f0/a.png"],
            outputRefs: ["outputs/batch-partial-f0/a.png"],
          },
          "batch-partial-f1": {
            id: "batch-partial-f1",
            status: "failed",
            inputRefs: ["uploads/batch-partial-f1/b.png"],
            error: { message: "corrupt at /data/workspace/uploads/b.png" },
          },
          "batch-partial-cancel-f0": {
            id: "batch-partial-cancel-f0",
            status: "completed",
            inputRefs: ["uploads/batch-partial-cancel-f0/a.png"],
            outputRefs: ["outputs/batch-partial-cancel-f0/a.png"],
          },
          "batch-partial-cancel-f1": {
            id: "batch-partial-cancel-f1",
            status: "canceled",
            inputRefs: ["uploads/batch-partial-cancel-f1/d.png"],
            error: { message: "Canceled" },
          },
          "batch-cancel-f0": {
            id: "batch-cancel-f0",
            status: "canceled",
            inputRefs: ["uploads/batch-cancel-f0/c.png"],
            error: { message: "Canceled" },
          },
        },
        counterErrors: [],
      });

    // All-canceled batch with empty Redis counters
    await processor({
      id: "batch-cancel",
      name: "batch-finalize",
      data: {
        kind: "batch-finalize",
        jobId: "batch-cancel",
        toolId: "resize",
        userId: null,
        pool: "system",
        totalFiles: 1,
        inputRefs: [],
        filename: "",
        settings: { flowChildCount: 1, fileIndexMap: [0] },
      },
    });
    expect(cancelBatchJobMock).toHaveBeenCalledWith({
      jobId: "batch-cancel",
      totalFiles: 1,
      completedFiles: 1,
      failedFiles: 1,
      errors: [
        { filename: "", error: "Canceled" },
        { filename: "c.png", error: "Canceled" },
      ],
    });

    // Partially succeeded batch with empty Redis counters
    await processor({
      id: "batch-partial",
      name: "batch-finalize",
      data: {
        kind: "batch-finalize",
        jobId: "batch-partial",
        toolId: "resize",
        userId: null,
        pool: "system",
        totalFiles: 2,
        inputRefs: [],
        filename: "",
        settings: { flowChildCount: 2, fileIndexMap: [0, 1] },
      },
    });
    expect(completeBatchJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "batch-partial",
        totalFiles: 2,
        completedFiles: 2,
        failedFiles: 1,
        errors: [{ filename: "b.png", error: "corrupt at [internal]" }],
      }),
    );
    const partialSidecarCall = objectStorageMocks.putObject.mock.calls.find(
      ([key]) => key === "outputs/batch-partial/.result-payload.json",
    );
    expect(partialSidecarCall).toBeDefined();
    expect(JSON.parse(String(partialSidecarCall?.[1]))).toEqual({
      zipFilename: "batch-resize-batch-pa.zip",
      fileResults: { "0": "a.png" },
      fileNotes: {},
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 1,
      errors: [{ filename: "b.png", error: "corrupt at [internal]" }],
    });

    // Partially canceled batch with empty Redis counters
    cancelBatchJobMock.mockClear();
    await processor({
      id: "batch-partial-cancel",
      name: "batch-finalize",
      data: {
        kind: "batch-finalize",
        jobId: "batch-partial-cancel",
        toolId: "resize",
        userId: null,
        pool: "system",
        totalFiles: 2,
        inputRefs: [],
        filename: "",
        settings: { flowChildCount: 2, fileIndexMap: [0, 1] },
      },
    });
    expect(cancelBatchJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "batch-partial-cancel",
        totalFiles: 2,
        completedFiles: 2,
        failedFiles: 1,
        errors: [{ filename: "d.png", error: "Canceled" }],
      }),
    );
    const cancelSidecarCall = objectStorageMocks.putObject.mock.calls.find(
      ([key]) => key === "outputs/batch-partial-cancel/.result-payload.json",
    );
    expect(cancelSidecarCall).toBeDefined();
    expect(JSON.parse(String(cancelSidecarCall?.[1]))).toEqual({
      zipFilename: "batch-resize-batch-pa.zip",
      fileResults: { "0": "a.png" },
      fileNotes: {},
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 1,
      errors: [{ filename: "d.png", error: "Canceled" }],
    });

    // Packaging failure on a partially succeeded batch with empty Redis counters
    completeBatchJobMock.mockClear();
    objectStorageMocks.putObject.mockRejectedValueOnce(new Error("disk write failed"));
    await expect(
      processor({
        id: "batch-partial",
        name: "batch-finalize",
        data: {
          kind: "batch-finalize",
          jobId: "batch-partial",
          toolId: "resize",
          userId: null,
          pool: "system",
          totalFiles: 2,
          inputRefs: [],
          filename: "",
          settings: { flowChildCount: 2, fileIndexMap: [0, 1] },
        },
      }),
    ).rejects.toThrow("disk write failed");
    expect(completeBatchJobMock).not.toHaveBeenCalled();
    expect(failBatchJobMock).toHaveBeenCalledWith({
      jobId: "batch-partial",
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 1,
      message: "Failed to package batch results",
      code: undefined,
      errors: [
        { filename: "b.png", error: "corrupt at [internal]" },
        { filename: "", error: "Failed to package batch results" },
      ],
    });
  });

  it("reconstructs step error, fault code, and cancel state from pipeline-step rows when a pipeline-batch child's terminal DB write rolled back (#3189)", async () => {
    // 1. Single-file pipeline-batch where child pipeline-finalize row stayed queued/error:null
    // after a 503 ENGINE_UNAVAILABLE on step 0, including internal path stripping via friendlyError.
    const { processor: p1, failBatchJobMock: fail1 } = await setupSystemProcessor({
      rowsById: {
        "bp-fault-f0": {
          id: "bp-fault-f0",
          type: "pipeline-finalize",
          status: "queued",
          inputRefs: ["uploads/bp-fault-f0-s0/doc.pdf"],
          error: null,
        },
        "bp-fault-f0-s0": {
          id: "bp-fault-f0-s0",
          type: "pipeline-step",
          status: "failed",
          inputRefs: ["uploads/bp-fault-f0-s0/doc.pdf"],
          error: {
            message: "qpdf failed on /data/workspace/uploads/bp-fault-f0-s0/doc.pdf",
            code: "ENGINE_UNAVAILABLE",
            details: "Check QPDF_PATH",
            httpStatus: 503,
          },
        },
      },
      counterErrors: [],
    });

    const res1 = (await p1({
      id: "bp-fault",
      name: "batch-finalize",
      data: {
        kind: "batch-finalize",
        jobId: "bp-fault",
        toolId: "pipeline-batch",
        userId: null,
        pool: "system",
        totalFiles: 1,
        inputRefs: [],
        filename: "",
        settings: { flowChildCount: 1, fileIndexMap: [0] },
      },
    })) as { resultPayload?: Record<string, unknown> };

    expect(res1.resultPayload).toEqual({
      manifest: [
        {
          index: 0,
          filename: "doc.pdf",
          error: "Step 1: qpdf failed on [internal]",
          code: "ENGINE_UNAVAILABLE",
        },
      ],
      allFailed: true,
      fault: {
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        error: "Step 1: qpdf failed on [internal]",
        details: "Check QPDF_PATH",
      },
    });
    expect(fail1).toHaveBeenCalledWith({
      jobId: "bp-fault",
      totalFiles: 1,
      completedFiles: 1,
      failedFiles: 1,
      message: "Step 1: qpdf failed on [internal]",
      code: "ENGINE_UNAVAILABLE",
      details: "Check QPDF_PATH",
      errors: [
        { filename: "doc.pdf", error: "Step 1: qpdf failed on [internal]" },
        { filename: "", error: "Step 1: qpdf failed on [internal]: Check QPDF_PATH" },
      ],
    });

    // 2. Multi-step failure (step 0 completed with inputRefs, step 1 failed without message),
    // missing step row resolved via parent batch row's settings.stepCount when child row has
    // settings: {}, and partial counterErrors deduplication in resolveBatchErrors.
    const { processor: p2, failBatchJobMock: fail2 } = await setupSystemProcessor({
      rowsById: {
        "bp-multi": {
          id: "bp-multi",
          type: "batch",
          toolId: "pipeline-batch",
          status: "queued",
          settings: { flowChildCount: 2, fileIndexMap: [0, 1], stepCount: 2 },
        },
        "bp-multi-f0": {
          id: "bp-multi-f0",
          type: "pipeline-finalize",
          status: "queued",
          inputRefs: [],
          settings: {},
          error: null,
        },
        "bp-multi-f0-s0": {
          id: "bp-multi-f0-s0",
          type: "pipeline-step",
          status: "completed",
          inputRefs: ["uploads/bp-multi-f0-s0/first.pdf"],
          outputRefs: ["outputs/bp-multi-f0-s0/first.pdf"],
        },
        "bp-multi-f0-s1": {
          id: "bp-multi-f0-s1",
          type: "pipeline-step",
          status: "failed",
          inputRefs: [],
          error: null,
        },
        "bp-multi-f1": {
          id: "bp-multi-f1",
          type: "pipeline-finalize",
          status: "queued",
          inputRefs: ["uploads/bp-multi-f1-s0/second.pdf"],
          settings: {},
          error: null,
        },
        "bp-multi-f1-s0": {
          id: "bp-multi-f1-s0",
          type: "pipeline-step",
          status: "completed",
          inputRefs: ["uploads/bp-multi-f1-s0/second.pdf"],
          outputRefs: ["outputs/bp-multi-f1-s0/second.pdf"],
        },
      },
      counterErrors: [{ filename: "first.pdf", error: "Step 2: Step 2 failed" }],
    });

    const res2 = (await p2({
      id: "bp-multi",
      name: "batch-finalize",
      data: {
        kind: "batch-finalize",
        jobId: "bp-multi",
        toolId: "pipeline-batch",
        userId: null,
        pool: "system",
        totalFiles: 2,
        inputRefs: [],
        filename: "",
        settings: { flowChildCount: 2, fileIndexMap: [0, 1] },
      },
    })) as { resultPayload?: { manifest?: unknown } };

    expect(res2.resultPayload?.manifest).toEqual([
      { index: 0, filename: "first.pdf", error: "Step 2: Step 2 failed" },
      { index: 1, filename: "second.pdf", error: "Step 2: Step 2 row not found" },
    ]);
    expect(fail2).toHaveBeenCalledWith({
      jobId: "bp-multi",
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 2,
      message: "All files failed processing",
      errors: [
        { filename: "first.pdf", error: "Step 2: Step 2 failed" },
        { filename: "second.pdf", error: "Step 2: Step 2 row not found" },
      ],
    });

    // 3. Canceled step row and all-completed step rows when child pipeline-finalize write faulted
    // before writing outputs/<childId>/<outFilename> (getObjectSize rejects with ENOENT).
    objectStorageMocks.getObjectSize.mockRejectedValueOnce(gone("done-steps.pdf"));
    objectStorageMocks.verifyS3Bucket.mockResolvedValueOnce(undefined);
    const { processor: p3, cancelBatchJobMock: cancel3 } = await setupSystemProcessor({
      rowsById: {
        "bp-cancel-f0": {
          id: "bp-cancel-f0",
          type: "pipeline-finalize",
          status: "queued",
          inputRefs: ["uploads/bp-cancel-f0-s0/canceled.pdf"],
          error: null,
        },
        "bp-cancel-f0-s0": {
          id: "bp-cancel-f0-s0",
          type: "pipeline-step",
          status: "canceled",
          inputRefs: ["uploads/bp-cancel-f0-s0/canceled.pdf"],
          error: { message: "Canceled" },
        },
        "bp-cancel-f1": {
          id: "bp-cancel-f1",
          type: "pipeline-finalize",
          status: "queued",
          inputRefs: ["uploads/bp-cancel-f1-s0/done-steps.pdf"],
          error: null,
        },
        "bp-cancel-f1-s0": {
          id: "bp-cancel-f1-s0",
          type: "pipeline-step",
          status: "completed",
          inputRefs: ["uploads/bp-cancel-f1-s0/done-steps.pdf"],
          outputRefs: ["outputs/bp-cancel-f1-s0/done-steps.pdf"],
        },
      },
      counterErrors: [],
    });

    const res3 = (await p3({
      id: "bp-cancel",
      name: "batch-finalize",
      data: {
        kind: "batch-finalize",
        jobId: "bp-cancel",
        toolId: "pipeline-batch",
        userId: null,
        pool: "system",
        totalFiles: 2,
        inputRefs: [],
        filename: "",
        settings: { flowChildCount: 2, fileIndexMap: [0, 1] },
      },
    })) as { resultPayload?: Record<string, unknown> };

    expect(objectStorageMocks.getObjectSize).toHaveBeenCalledWith(
      "outputs/bp-cancel-f1/done-steps.pdf",
    );
    expect(objectStorageMocks.verifyS3Bucket).toHaveBeenCalledTimes(1);
    expect(res3.resultPayload).toEqual({
      manifest: [
        { index: 0, filename: "canceled.pdf", error: "Canceled" },
        { index: 1, filename: "done-steps.pdf", error: "Processing failed" },
      ],
      canceled: true,
      allFailed: true,
    });
    expect(cancel3).toHaveBeenCalledWith({
      jobId: "bp-cancel",
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 2,
      errors: [
        { filename: "", error: "Canceled" },
        { filename: "canceled.pdf", error: "Canceled" },
        { filename: "done-steps.pdf", error: "Processing failed" },
      ],
    });

    // 4. All-completed multi-step rows where outputs/<childId>/<outFilename> was already written
    // before the child pipeline-finalize completion DB write faulted (#3190): recovers the
    // final step's artifact into the batch ZIP instead of dropping it as failed, and rethrows
    // normalized storage service faults from getObjectSize instead of swallowing them.
    const { Readable } = await import("node:stream");
    objectStorageMocks.getObjectStream.mockImplementation(async () =>
      Readable.from(Buffer.from("pdf-bytes")),
    );
    objectStorageMocks.getObjectSize.mockClear();
    objectStorageMocks.getObjectSize.mockResolvedValueOnce(9);
    objectStorageMocks.putObject.mockResolvedValue(undefined);
    objectStorageMocks.putObjectStream.mockResolvedValue(123);

    const {
      processor: p4,
      completeBatchJobMock: complete4,
      failBatchJobMock: fail4,
    } = await setupSystemProcessor({
      rowsById: {
        "bp-recovered": {
          id: "bp-recovered",
          type: "batch",
          toolId: "pipeline-batch",
          status: "queued",
          settings: { flowChildCount: 1, fileIndexMap: [0], stepCount: 2 },
        },
        "bp-recovered-f0": {
          id: "bp-recovered-f0",
          type: "pipeline-finalize",
          status: "queued",
          inputRefs: ["uploads/bp-recovered-f0-s0/doc.pdf"],
          settings: {},
          error: null,
        },
        "bp-recovered-f0-s0": {
          id: "bp-recovered-f0-s0",
          type: "pipeline-step",
          status: "completed",
          inputRefs: ["uploads/bp-recovered-f0-s0/doc.pdf"],
          outputRefs: ["outputs/bp-recovered-f0-s0/doc-step0.png"],
        },
        "bp-recovered-f0-s1": {
          id: "bp-recovered-f0-s1",
          type: "pipeline-step",
          status: "completed",
          inputRefs: ["outputs/bp-recovered-f0-s0/doc-step0.png"],
          outputRefs: ["outputs/bp-recovered-f0-s1/doc-out.pdf"],
        },
      },
      counterErrors: [],
    });

    const res4 = (await p4({
      id: "bp-recovered",
      name: "batch-finalize",
      data: {
        kind: "batch-finalize",
        jobId: "bp-recovered",
        toolId: "pipeline-batch",
        userId: null,
        pool: "system",
        totalFiles: 1,
        inputRefs: [],
        filename: "",
        settings: { flowChildCount: 1, fileIndexMap: [0] },
      },
    })) as { resultPayload?: Record<string, unknown> };

    expect(objectStorageMocks.getObjectSize).toHaveBeenCalledWith(
      "outputs/bp-recovered-f0/doc-out.pdf",
    );
    expect(objectStorageMocks.getObjectStream).toHaveBeenCalledWith(
      "outputs/bp-recovered-f0/doc-out.pdf",
    );
    expect(fail4).not.toHaveBeenCalled();
    expect(complete4).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "bp-recovered",
        totalFiles: 1,
        completedFiles: 1,
        failedFiles: 0,
        errors: [],
        outputRefs: ["outputs/bp-recovered/pipeline-batch-bp-recov.zip"],
      }),
    );
    expect(res4.resultPayload).toMatchObject({
      manifest: [
        {
          index: 0,
          filename: "doc-out.pdf",
          outputRef: "outputs/bp-recovered-f0/doc-out.pdf",
        },
      ],
    });

    const s3Outage = new Error("S3 HeadObject 503 SlowDown");
    const normalizedOutage = new Error("The server's storage service is unavailable.");
    objectStorageMocks.getObjectSize.mockRejectedValueOnce(s3Outage);
    objectStorageMocks.isStorageServiceFault.mockReturnValueOnce(true);
    objectStorageMocks.normalizeS3ReadFault.mockReturnValueOnce(normalizedOutage);
    await expect(
      p4({
        id: "bp-recovered",
        name: "batch-finalize",
        data: {
          kind: "batch-finalize",
          jobId: "bp-recovered",
          toolId: "pipeline-batch",
          userId: null,
          pool: "system",
          totalFiles: 1,
          inputRefs: [],
          filename: "",
          settings: { flowChildCount: 1, fileIndexMap: [0] },
        },
      }),
    ).rejects.toBe(normalizedOutage);
  });

  describe("child storage reclaim (#1241)", () => {
    const finalizeJob = (jobId: string, extra: Record<string, unknown> = {}) => ({
      id: jobId,
      name: "batch-finalize",
      data: {
        kind: "batch-finalize",
        jobId,
        toolId: "resize",
        userId: null,
        pool: "system",
        totalFiles: 2,
        inputRefs: [],
        filename: "",
        settings: { flowChildCount: 2, fileIndexMap: [0, 1] },
        ...extra,
      },
    });
    const rows = (jobId: string) => ({
      [`${jobId}-f0`]: {
        id: `${jobId}-f0`,
        status: "completed",
        inputRefs: [`uploads/${jobId}-f0/a.png`],
        outputRefs: [`outputs/${jobId}-f0/a.png`],
      },
      [`${jobId}-f1`]: {
        id: `${jobId}-f1`,
        status: "completed",
        inputRefs: [`uploads/${jobId}-f1/b.png`],
        outputRefs: [`outputs/${jobId}-f1/b.png`],
      },
    });
    const prefixes = () => objectStorageMocks.deletePrefix.mock.calls.map(([prefix]) => prefix);

    async function primeZip() {
      const { Readable } = await import("node:stream");
      objectStorageMocks.deletePrefix.mockReset().mockResolvedValue(undefined);
      objectStorageMocks.getObjectSize.mockResolvedValue(3);
      objectStorageMocks.getObjectStream.mockImplementation(async () =>
        Readable.from(Buffer.from("png")),
      );
      objectStorageMocks.putObject.mockResolvedValue(undefined);
      objectStorageMocks.putObjectStream.mockResolvedValue(123);
    }

    it("frees every child's input and output once the ZIP is written", async () => {
      await primeZip();
      const { processor, completeBatchJobMock } = await setupSystemProcessor({
        rowsById: rows("rc-ok"),
      });

      await processor(finalizeJob("rc-ok"));

      expect(completeBatchJobMock).toHaveBeenCalledTimes(1);
      await vi.waitFor(() => expect(prefixes()).toHaveLength(4));
      expect(prefixes().sort()).toEqual(
        ["uploads/rc-ok-f0", "outputs/rc-ok-f0", "uploads/rc-ok-f1", "outputs/rc-ok-f1"].sort(),
      );
      expect(prefixes()).not.toContain("outputs/rc-ok");
    });

    it("returns without waiting for the cleanup to finish (#4184)", async () => {
      await primeZip();
      objectStorageMocks.deletePrefix.mockReturnValue(new Promise(() => {}));
      const { processor, completeBatchJobMock } = await setupSystemProcessor({
        rowsById: rows("rc-slow"),
      });

      await expect(processor(finalizeJob("rc-slow"))).resolves.toBeDefined();

      expect(completeBatchJobMock).toHaveBeenCalledTimes(1);
      await vi.waitFor(() => expect(prefixes().length).toBeGreaterThan(0));
    });

    it("frees the children when packaging fails, so the next request is not refused", async () => {
      await primeZip();
      objectStorageMocks.putObjectStream.mockRejectedValue(new Error("disk full"));
      const { processor, failBatchJobMock } = await setupSystemProcessor({
        rowsById: rows("rc-fail"),
      });

      await expect(processor(finalizeJob("rc-fail"))).rejects.toThrow("disk full");

      expect(failBatchJobMock).toHaveBeenCalledTimes(1);
      await vi.waitFor(() => expect(prefixes()).toHaveLength(4));
      expect(prefixes()).toEqual(
        expect.arrayContaining([
          "uploads/rc-fail-f0",
          "outputs/rc-fail-f0",
          "uploads/rc-fail-f1",
          "outputs/rc-fail-f1",
        ]),
      );
    });

    it("still finishes the batch when a child delete fails", async () => {
      await primeZip();
      objectStorageMocks.deletePrefix.mockRejectedValue(new Error("EBUSY"));
      const { processor, completeBatchJobMock } = await setupSystemProcessor({
        rowsById: rows("rc-busy"),
      });

      await expect(processor(finalizeJob("rc-busy"))).resolves.toBeDefined();

      expect(completeBatchJobMock).toHaveBeenCalledTimes(1);
    });

    it("frees every pipeline step directory using the parent's stepCount", async () => {
      await primeZip();
      const { processor } = await setupSystemProcessor({
        rowsById: {
          "rc-pipe": {
            id: "rc-pipe",
            type: "batch",
            toolId: "pipeline-batch",
            status: "queued",
            settings: { flowChildCount: 1, fileIndexMap: [0], stepCount: 2 },
          },
          "rc-pipe-f0": {
            id: "rc-pipe-f0",
            type: "pipeline-finalize",
            status: "completed",
            inputRefs: ["uploads/rc-pipe-f0-s0/a.png"],
            outputRefs: ["outputs/rc-pipe-f0/a.png"],
          },
        },
      });

      await processor(
        finalizeJob("rc-pipe", {
          toolId: "pipeline-batch",
          totalFiles: 1,
          settings: { flowChildCount: 1, fileIndexMap: [0] },
        }),
      );

      await vi.waitFor(() => expect(prefixes().length).toBeGreaterThanOrEqual(6));
      expect(prefixes()).toEqual(
        expect.arrayContaining([
          "uploads/rc-pipe-f0",
          "outputs/rc-pipe-f0",
          "uploads/rc-pipe-f0-s0",
          "outputs/rc-pipe-f0-s0",
          "uploads/rc-pipe-f0-s1",
          "outputs/rc-pipe-f0-s1",
        ]),
      );
    });
  });
});

describe("processPipelineFinalize (#3167, #2703)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  async function setupPipelineFinalizeProcessor(
    rowsById: Record<string, Record<string, unknown> | undefined>,
  ) {
    const dbUpdateMock = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    }));
    const updateSingleFileProgressMock = vi.fn().mockResolvedValue(undefined);
    const updateSingleFileProgressAtomicallyMock = vi.fn();
    const cancelSingleJobGuardedMock = vi.fn().mockResolvedValue(undefined);
    const failSingleJobGuardedMock = vi.fn().mockResolvedValue(undefined);
    const publishEphemeralMock = vi.fn();
    const recordChildOutcomeMock = vi.fn().mockResolvedValue(undefined);
    const reportErrorMock = vi.fn();
    const trackEventMock = vi.fn();

    const actualErrors = await vi.importActual<
      typeof import("../../../../apps/api/src/lib/errors.js")
    >("../../../../apps/api/src/lib/errors.js");

    const workerMod = await loadWorker("", () => {
      vi.doMock("../../../../apps/api/src/db/index.js", () => ({
        db: {
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(async (cond: { val?: string }) => {
                const row = cond?.val ? rowsById[cond.val] : undefined;
                return row ? [row] : [];
              }),
            })),
          })),
          update: dbUpdateMock,
        },
        schema: { jobs: { id: "jobs.id" } },
      }));
      vi.doMock("../../../../apps/api/src/lib/errors.js", () => ({
        friendlyError: vi.fn(actualErrors.friendlyError),
        sharedFailureReason: vi.fn(actualErrors.sharedFailureReason),
        stripInternalPaths: vi.fn(actualErrors.stripInternalPaths),
      }));
      vi.doMock("../../../../apps/api/src/lib/error-report.js", () => ({
        classifyError: vi.fn(() => "operational"),
        reportError: reportErrorMock,
        safeFormatTag: vi.fn(() => undefined),
      }));
      vi.doMock("../../../../apps/api/src/lib/analytics.js", () => ({
        captureException: vi.fn(),
        trackEvent: trackEventMock,
      }));
      vi.doMock("../../../../apps/api/src/lib/analytics-gate.js", () => ({
        analyticsEnabled: vi.fn(() => true),
      }));
      vi.doMock("../../../../apps/api/src/jobs/batch-progress.js", () => ({
        isBatchCanceled: vi.fn(async () => false),
        readBatchCounters: vi.fn(),
        recordChildOutcome: recordChildOutcomeMock,
      }));
      vi.doMock("../../../../apps/api/src/routes/progress.js", () => ({
        cancelBatchJob: vi.fn(),
        cancelSingleJobGuarded: cancelSingleJobGuardedMock,
        completeBatchJob: vi.fn(),
        failBatchJob: vi.fn(),
        failSingleJobGuarded: failSingleJobGuardedMock,
        publishEphemeral: publishEphemeralMock,
        updateSingleFileProgress: updateSingleFileProgressMock,
        updateSingleFileProgressAtomically: updateSingleFileProgressAtomicallyMock,
      }));
      vi.doMock("@snapotter/media-engine", () => ({
        HW_ACCEL_FAMILIES: [],
        hwAccelStatus: vi.fn(() => ({ requested: undefined })),
        softwareEncoderStatus: vi.fn(() => ({ missing: [], probeError: undefined })),
      }));
      vi.doMock("../../../../apps/api/src/lib/binary-overrides.js", () => ({
        binaryOverrideWarning: vi.fn(),
        checkBinaryOverrides: vi.fn(() => []),
        isBinarySpawnFailure,
        probeFailureLevel: vi.fn(() => "warn"),
      }));
    });

    const { Worker } = await import("bullmq");
    const { logger } = await import("../../../../apps/api/src/lib/logger.js");
    workerMod.startWorkers();
    const workerCalls = (Worker as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const imageIdx = workerCalls.findIndex(([queue]) => String(queue).endsWith("image"));
    if (imageIdx === -1) throw new Error("image pool worker not registered");
    const processor = workerCalls[imageIdx][1] as (job: unknown) => Promise<unknown>;
    const workerInstance = (Worker as unknown as { mock: { results: Array<{ value: unknown }> } })
      .mock.results[imageIdx]?.value as {
      on: ReturnType<typeof vi.fn>;
    };
    const failedListener = workerInstance?.on.mock.calls.find(
      ([event]: unknown[]) => event === "failed",
    )?.[1] as ((job: unknown, err: Error) => void) | undefined;

    return {
      processor,
      failedListener,
      dbUpdateMock,
      cancelSingleJobGuardedMock,
      failSingleJobGuardedMock,
      publishEphemeralMock,
      updateSingleFileProgressMock,
      updateSingleFileProgressAtomicallyMock,
      recordChildOutcomeMock,
      reportErrorMock,
      trackEventMock,
      logger,
    };
  }

  it("commits the authoritative pipeline row and clientJobId replay row in one transaction via updateSingleFileProgressAtomically", async () => {
    const {
      processor,
      dbUpdateMock,
      updateSingleFileProgressMock,
      updateSingleFileProgressAtomicallyMock,
    } = await setupPipelineFinalizeProcessor({
      "pf-1-s0": {
        id: "pf-1-s0",
        status: "failed",
        toolId: "pdf-compress",
        error: {
          message: "qpdf is not installed",
          code: "ENGINE_UNAVAILABLE",
          details: "Check QPDF_PATH",
          httpStatus: 503,
        },
      },
    });

    const txWhereMock = vi.fn().mockResolvedValue(undefined);
    const txSetMock = vi.fn(() => ({ where: txWhereMock }));
    const txStub = { update: vi.fn(() => ({ set: txSetMock })) };
    updateSingleFileProgressAtomicallyMock.mockImplementationOnce(
      async (_progress: unknown, mutate: (tx: unknown) => Promise<void>) => {
        await mutate(txStub);
      },
    );

    const res = await processor({
      id: "pf-1",
      name: "pipeline-finalize",
      data: {
        kind: "pipeline-finalize",
        jobId: "pf-1",
        clientJobId: "pfc-1",
        toolId: "pipeline",
        userId: null,
        pool: "image",
        totalSteps: 1,
        inputRefs: [],
        filename: "doc.pdf",
        settings: {},
      },
    });

    expect(dbUpdateMock).not.toHaveBeenCalled();
    expect(updateSingleFileProgressMock).not.toHaveBeenCalled();
    expect(updateSingleFileProgressAtomicallyMock).toHaveBeenCalledTimes(1);
    expect(updateSingleFileProgressAtomicallyMock).toHaveBeenCalledWith(
      {
        jobId: "pfc-1",
        phase: "failed",
        percent: 0,
        error: "Step 1: qpdf is not installed",
        code: "ENGINE_UNAVAILABLE",
        details: "Check QPDF_PATH",
        httpStatus: 503,
        expectedPipelineFlowId: "pf-1",
      },
      expect.any(Function),
    );
    expect(txSetMock).toHaveBeenCalledWith({
      status: "failed",
      completedAt: expect.any(Date),
      error: {
        message: "Step 1: qpdf is not installed",
        code: "ENGINE_UNAVAILABLE",
        details: "Check QPDF_PATH",
        httpStatus: 503,
      },
    });
    expect(txWhereMock).toHaveBeenCalledWith({
      op: "eq",
      col: "jobs.id",
      val: "pf-1",
    });
    expect(res).toMatchObject({
      outputRefs: [],
      filename: "doc.pdf",
      resultPayload: {
        error: "Step 1: qpdf is not installed",
        code: "ENGINE_UNAVAILABLE",
        details: "Check QPDF_PATH",
        httpStatus: 503,
        stepsCompleted: 0,
        steps: [],
      },
    });
  });

  it("rethrows an atomic failure-write fault on a single-file pipeline so the failed-handler safety net runs", async () => {
    const { processor, updateSingleFileProgressAtomicallyMock, reportErrorMock } =
      await setupPipelineFinalizeProcessor({
        "pf-single-s0": {
          id: "pf-single-s0",
          status: "failed",
          toolId: "resize",
          error: { message: "boom" },
        },
      });

    const dbErr = new Error("connection terminated unexpectedly");
    updateSingleFileProgressAtomicallyMock.mockRejectedValueOnce(dbErr);

    await expect(
      processor({
        id: "pf-single",
        name: "pipeline-finalize",
        data: {
          kind: "pipeline-finalize",
          jobId: "pf-single",
          clientJobId: "pfc-single",
          toolId: "pipeline",
          userId: null,
          pool: "image",
          totalSteps: 1,
          inputRefs: [],
          filename: "chain.png",
          settings: {},
        },
      }),
    ).rejects.toBe(dbErr);
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("catches, logs, and reports a terminal write fault on a pipeline-batch child so recordChildOutcome and batch-finalize still run", async () => {
    const {
      processor,
      updateSingleFileProgressAtomicallyMock,
      recordChildOutcomeMock,
      reportErrorMock,
      trackEventMock,
      logger,
    } = await setupPipelineFinalizeProcessor({
      "pf-batch-f0-s0": {
        id: "pf-batch-f0-s0",
        status: "failed",
        toolId: "pdf-compress",
        error: {
          message: "qpdf is not installed",
          code: "ENGINE_UNAVAILABLE",
          details: "Check QPDF_PATH",
          httpStatus: 503,
        },
      },
    });

    const dbErr = new Error("postgres write failed");
    updateSingleFileProgressAtomicallyMock.mockRejectedValueOnce(dbErr);

    const res = await processor({
      id: "pf-batch-f0",
      name: "pipeline-finalize",
      data: {
        kind: "pipeline-finalize",
        jobId: "pf-batch-f0",
        parentId: "bp-1",
        totalFiles: 2,
        toolId: "pipeline",
        userId: null,
        pool: "image",
        totalSteps: 1,
        inputRefs: [],
        filename: "doc.pdf",
        settings: {},
      },
    });

    expect(logger.error).toHaveBeenCalledWith(
      { err: dbErr, jobId: "pf-batch-f0", parentId: "bp-1" },
      "failed pipeline terminal write failed",
    );
    expect(reportErrorMock).toHaveBeenCalledWith(dbErr, {
      source: "worker",
      pool: "image",
      jobId: "pf-batch-f0",
    });
    expect(recordChildOutcomeMock).toHaveBeenCalledWith(
      "bp-1",
      2,
      "doc.pdf",
      "Step 1: qpdf is not installed",
    );
    expect(trackEventMock).toHaveBeenCalledTimes(1);
    expect(res).toEqual({
      outputRefs: [],
      filename: "doc.pdf",
      contentType: "",
      originalSize: 0,
      processedSize: 0,
      resultPayload: {
        error: "Step 1: qpdf is not installed",
        code: "ENGINE_UNAVAILABLE",
        details: "Check QPDF_PATH",
        httpStatus: 503,
        stepsCompleted: 0,
        steps: [],
      },
    });
  });

  it.each([
    ["scan.tif", "edit-metadata", "image/tiff", "outputs/pf-ok/preview.webp"],
    ["photo.jxl", "convert", "image/jxl", "outputs/pf-ok/preview.webp"],
    ["vector.eps", "convert", "application/postscript", "outputs/pf-ok/preview.webp"],
    ["book.epub", "to-epub", "application/epub+zip", undefined],
    ["bundle.zip", "create-zip", "application/zip", undefined],
  ])(
    "resolves %s to %s on the pipeline-finalize success path and passes it to generatePreview (#2703)",
    async (outFilename, toolId, expectedContentType, previewRef) => {
      const generatePreviewMock = vi.fn().mockResolvedValue(previewRef);
      const { processor, updateSingleFileProgressAtomicallyMock } =
        await setupPipelineFinalizeProcessor({
          "pf-ok-s0": {
            id: "pf-ok-s0",
            status: "completed",
            toolId,
            bytesIn: 512,
            bytesOut: 256,
            outputRefs: [`outputs/pf-ok-s0/${outFilename}`],
            progress: { percent: 100, stage: "complete" },
          },
        });
      const postprocessMod = await import("../../../../apps/api/src/jobs/postprocess.js");
      (postprocessMod.generatePreview as ReturnType<typeof vi.fn>).mockImplementation(
        generatePreviewMock,
      );
      const outBytes = Buffer.from(`bytes-${outFilename}`);
      objectStorageMocks.getObjectBuffer.mockResolvedValueOnce(outBytes);
      objectStorageMocks.putObject.mockResolvedValue(undefined);
      updateSingleFileProgressAtomicallyMock.mockResolvedValueOnce(undefined);

      const res = await processor({
        id: "pf-ok",
        name: "pipeline-finalize",
        data: {
          kind: "pipeline-finalize",
          jobId: "pf-ok",
          toolId: "pipeline",
          userId: null,
          pool: "image",
          totalSteps: 1,
          inputRefs: [],
          filename: outFilename,
          settings: {},
        },
      });

      expect(generatePreviewMock).toHaveBeenCalledWith(
        outBytes,
        expectedContentType,
        "pf-ok",
        toolId,
      );
      expect(res).toMatchObject({
        outputRefs: [`outputs/pf-ok/${outFilename}`],
        filename: outFilename,
        contentType: expectedContentType,
        originalSize: 512,
        processedSize: 256,
        previewRef,
      });
    },
  );

  it("passes expectedPipelineFlowId on alias writes across completion, cancel, and the failed-handler safety net (#2741)", async () => {
    const {
      processor,
      failedListener,
      cancelSingleJobGuardedMock,
      failSingleJobGuardedMock,
      publishEphemeralMock,
      reportErrorMock,
      updateSingleFileProgressAtomicallyMock,
    } = await setupPipelineFinalizeProcessor({
      "pf-done-s0": {
        id: "pf-done-s0",
        status: "completed",
        toolId: "resize",
        bytesIn: 100,
        bytesOut: 80,
        outputRefs: ["outputs/pf-done-s0/out.png"],
        progress: { percent: 100, stage: "complete" },
      },
      "pf-cancel-s0": {
        id: "pf-cancel-s0",
        status: "canceled",
        toolId: "resize",
        error: { message: "Canceled" },
      },
      "pf-fail-s0": {
        id: "pf-fail-s0",
        status: "failed",
        toolId: "resize",
        error: { message: "boom" },
      },
    });
    objectStorageMocks.getObjectBuffer.mockResolvedValueOnce(Buffer.from("png"));
    objectStorageMocks.putObject.mockResolvedValue(undefined);
    updateSingleFileProgressAtomicallyMock.mockResolvedValueOnce(undefined);

    await processor({
      id: "pf-done",
      name: "pipeline-finalize",
      data: {
        kind: "pipeline-finalize",
        jobId: "pf-done",
        clientJobId: "pfc-done",
        toolId: "pipeline",
        userId: null,
        pool: "image",
        totalSteps: 1,
        inputRefs: [],
        filename: "out.png",
        settings: {},
      },
    });
    expect(updateSingleFileProgressAtomicallyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "pfc-done",
        phase: "complete",
        expectedPipelineFlowId: "pf-done",
      }),
      expect.any(Function),
    );

    await processor({
      id: "pf-cancel",
      name: "pipeline-finalize",
      data: {
        kind: "pipeline-finalize",
        jobId: "pf-cancel",
        clientJobId: "pfc-cancel",
        toolId: "pipeline",
        userId: null,
        pool: "image",
        totalSteps: 1,
        inputRefs: [],
        filename: "out.png",
        settings: {},
      },
    });
    expect(cancelSingleJobGuardedMock).toHaveBeenNthCalledWith(1, { jobId: "pf-cancel" });
    expect(cancelSingleJobGuardedMock).toHaveBeenNthCalledWith(2, {
      jobId: "pfc-cancel",
      expectedPipelineFlowId: "pf-cancel",
    });
    expect(publishEphemeralMock).not.toHaveBeenCalled();

    cancelSingleJobGuardedMock.mockClear();
    cancelSingleJobGuardedMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("alias write fault"));
    await processor({
      id: "pf-cancel",
      name: "pipeline-finalize",
      data: {
        kind: "pipeline-finalize",
        jobId: "pf-cancel",
        clientJobId: "pfc-cancel",
        toolId: "pipeline",
        userId: null,
        pool: "image",
        totalSteps: 1,
        inputRefs: [],
        filename: "out.png",
        settings: {},
      },
    });
    expect(publishEphemeralMock).toHaveBeenCalledWith({
      jobId: "pfc-cancel",
      type: "single",
      phase: "failed",
      percent: 0,
      error: "Canceled",
      code: "CANCELED",
    });

    cancelSingleJobGuardedMock.mockClear();
    failSingleJobGuardedMock.mockClear();
    failedListener?.(
      {
        id: "pf-cancel",
        data: {
          kind: "pipeline-finalize",
          jobId: "pf-cancel",
          clientJobId: "pfc-cancel",
          toolId: "pipeline",
          pool: "image",
          totalSteps: 1,
        },
      },
      new Error("stalled"),
    );
    await vi.waitFor(() => {
      expect(cancelSingleJobGuardedMock).toHaveBeenCalledWith({
        jobId: "pfc-cancel",
        expectedPipelineFlowId: "pf-cancel",
      });
      expect(cancelSingleJobGuardedMock).toHaveBeenCalledWith({ jobId: "pf-cancel" });
    });

    failedListener?.(
      {
        id: "pf-fail",
        data: {
          kind: "pipeline-finalize",
          jobId: "pf-fail",
          clientJobId: "pfc-fail",
          toolId: "pipeline",
          pool: "image",
          totalSteps: 1,
        },
      },
      new Error("stalled"),
    );
    await vi.waitFor(() => {
      expect(failSingleJobGuardedMock).toHaveBeenCalledWith({
        jobId: "pfc-fail",
        message: "Pipeline processing failed",
        expectedPipelineFlowId: "pf-fail",
      });
      expect(failSingleJobGuardedMock).toHaveBeenCalledWith({
        jobId: "pf-fail",
        message: "Pipeline processing failed",
      });
    });

    // A pipeline-batch child (parentId set) does not run the single-file
    // failed-handler safety net, while still reporting the worker error (#3190).
    cancelSingleJobGuardedMock.mockClear();
    failSingleJobGuardedMock.mockClear();
    reportErrorMock.mockClear();
    const stalledErr = new Error("stalled");
    failedListener?.(
      {
        id: "pf-batch-child",
        data: {
          kind: "pipeline-finalize",
          jobId: "pf-batch-child",
          parentId: "bp-parent",
          toolId: "pipeline",
          pool: "image",
          totalSteps: 1,
        },
      },
      stalledErr,
    );
    await Promise.resolve();
    expect(cancelSingleJobGuardedMock).not.toHaveBeenCalled();
    expect(failSingleJobGuardedMock).not.toHaveBeenCalled();
    expect(reportErrorMock).toHaveBeenCalledWith(
      stalledErr,
      expect.objectContaining({
        source: "worker",
        pool: "image",
        toolId: "pipeline",
        jobId: "pf-batch-child",
      }),
    );
  });

  it("catches, logs, and reports a completion terminal write fault on a pipeline-batch child while rethrowing on a single-file pipeline (#3190)", async () => {
    const {
      processor,
      updateSingleFileProgressAtomicallyMock,
      recordChildOutcomeMock,
      reportErrorMock,
      trackEventMock,
      logger,
    } = await setupPipelineFinalizeProcessor({
      "pf-batch-ok-s0": {
        id: "pf-batch-ok-s0",
        status: "completed",
        toolId: "resize",
        bytesIn: 200,
        bytesOut: 120,
        outputRefs: ["outputs/pf-batch-ok-s0/out.png"],
        progress: { percent: 100, stage: "complete" },
      },
      "pf-single-ok-s0": {
        id: "pf-single-ok-s0",
        status: "completed",
        toolId: "resize",
        bytesIn: 200,
        bytesOut: 120,
        outputRefs: ["outputs/pf-single-ok-s0/out.png"],
        progress: { percent: 100, stage: "complete" },
      },
    });

    objectStorageMocks.getObjectBuffer.mockResolvedValue(Buffer.from("png-out"));
    objectStorageMocks.putObject.mockResolvedValue(undefined);
    const dbErr = new Error("completion write failed");
    updateSingleFileProgressAtomicallyMock.mockRejectedValueOnce(dbErr);

    const res = await processor({
      id: "pf-batch-ok",
      name: "pipeline-finalize",
      data: {
        kind: "pipeline-finalize",
        jobId: "pf-batch-ok",
        parentId: "bp-ok",
        totalFiles: 2,
        toolId: "pipeline",
        userId: null,
        pool: "image",
        totalSteps: 1,
        inputRefs: [],
        filename: "in.png",
        settings: {},
      },
    });

    expect(logger.error).toHaveBeenCalledWith(
      { err: dbErr, jobId: "pf-batch-ok", parentId: "bp-ok" },
      "completed pipeline terminal write failed",
    );
    expect(reportErrorMock).toHaveBeenCalledWith(dbErr, {
      source: "worker",
      pool: "image",
      jobId: "pf-batch-ok",
    });
    expect(recordChildOutcomeMock).toHaveBeenCalledWith("bp-ok", 2, "out.png");
    expect(trackEventMock).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({
      outputRefs: ["outputs/pf-batch-ok/out.png"],
      filename: "out.png",
      contentType: "image/png",
      originalSize: 200,
      processedSize: 120,
      resultPayload: {
        stepsCompleted: 1,
        steps: [{ step: 1, toolId: "resize", size: 120 }],
      },
    });

    // Single-file pipeline still rethrows so the failed-handler safety net runs.
    reportErrorMock.mockClear();
    updateSingleFileProgressAtomicallyMock.mockRejectedValueOnce(dbErr);
    await expect(
      processor({
        id: "pf-single-ok",
        name: "pipeline-finalize",
        data: {
          kind: "pipeline-finalize",
          jobId: "pf-single-ok",
          clientJobId: "pfc-single-ok",
          toolId: "pipeline",
          userId: null,
          pool: "image",
          totalSteps: 1,
          inputRefs: [],
          filename: "in.png",
          settings: {},
        },
      }),
    ).rejects.toBe(dbErr);
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("settles schema.jobs, records pipeline-batch child outcomes, and passes 503 storage status and code through failSingleJobGuarded on output copy faults (#3479)", async () => {
    const { SafeError } = await vi.importActual<
      typeof import("../../../../packages/shared/src/tool-errors.js")
    >("../../../../packages/shared/src/tool-errors.js");
    const {
      processor,
      failedListener,
      failSingleJobGuardedMock,
      updateSingleFileProgressAtomicallyMock,
      recordChildOutcomeMock,
      reportErrorMock,
      trackEventMock,
      logger,
    } = await setupPipelineFinalizeProcessor({
      "pf-copy-1-s0": {
        id: "pf-copy-1-s0",
        status: "completed",
        toolId: "resize",
        bytesIn: 200,
        bytesOut: 120,
        outputRefs: ["outputs/pf-copy-1-s0/out.png"],
        progress: { percent: 100, stage: "complete" },
      },
      "pf-copy-batch-f0-s0": {
        id: "pf-copy-batch-f0-s0",
        status: "completed",
        toolId: "resize",
        bytesIn: 200,
        bytesOut: 120,
        outputRefs: ["outputs/pf-copy-batch-f0-s0/out.png"],
        progress: { percent: 100, stage: "complete" },
      },
    });

    const txWhereMock = vi.fn().mockResolvedValue(undefined);
    const txSetMock = vi.fn(() => ({ where: txWhereMock }));
    const txStub = { update: vi.fn(() => ({ set: txSetMock })) };
    updateSingleFileProgressAtomicallyMock.mockImplementation(
      async (_progress: unknown, mutate: (tx: unknown) => Promise<void>) => {
        await mutate(txStub);
      },
    );

    // 1. Single-file pipeline putObject 503 SafeError (e.g. storage-unavailable / workspace-cap)
    const storageUnavailable = new SafeError("The server's storage service is unavailable.", {
      kind: "operational",
      code: "storage-unavailable",
      statusCode: 503,
    });
    objectStorageMocks.getObjectBuffer.mockResolvedValueOnce(Buffer.from("png-out"));
    objectStorageMocks.putObject
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(storageUnavailable);

    await expect(
      processor({
        id: "pf-copy-1",
        name: "pipeline-finalize",
        data: {
          kind: "pipeline-finalize",
          jobId: "pf-copy-1",
          clientJobId: "pfc-copy-1",
          toolId: "pipeline",
          userId: null,
          pool: "image",
          totalSteps: 1,
          inputRefs: [],
          filename: "in.png",
          settings: {},
        },
      }),
    ).rejects.toBe(storageUnavailable);

    expect(updateSingleFileProgressAtomicallyMock).toHaveBeenCalledWith(
      {
        jobId: "pfc-copy-1",
        phase: "failed",
        percent: 0,
        error: "The server's storage service is unavailable.",
        code: "storage-unavailable",
        httpStatus: 503,
        expectedPipelineFlowId: "pf-copy-1",
      },
      expect.any(Function),
    );
    expect(txSetMock).toHaveBeenCalledWith({
      status: "failed",
      completedAt: expect.any(Date),
      error: {
        message: "The server's storage service is unavailable.",
        code: "storage-unavailable",
        httpStatus: 503,
      },
    });
    expect(trackEventMock).toHaveBeenCalledTimes(1);

    // 1b. Single-file pipeline where updateSingleFileProgressAtomically also rejects during output-copy fault:
    // logs/reports writeErr without parentId and still rethrows the original storageUnavailable error.
    (logger.error as ReturnType<typeof vi.fn>).mockClear();
    reportErrorMock.mockClear();
    const singleWriteErr = new Error("single-file terminal write failed");
    objectStorageMocks.getObjectBuffer.mockResolvedValueOnce(Buffer.from("png-out"));
    objectStorageMocks.putObject.mockRejectedValueOnce(storageUnavailable);
    updateSingleFileProgressAtomicallyMock.mockRejectedValueOnce(singleWriteErr);

    await expect(
      processor({
        id: "pf-copy-1",
        name: "pipeline-finalize",
        data: {
          kind: "pipeline-finalize",
          jobId: "pf-copy-1",
          clientJobId: "pfc-copy-1",
          toolId: "pipeline",
          userId: null,
          pool: "image",
          totalSteps: 1,
          inputRefs: [],
          filename: "in.png",
          settings: {},
        },
      }),
    ).rejects.toBe(storageUnavailable);
    expect(logger.error).toHaveBeenCalledWith(
      { err: singleWriteErr, jobId: "pf-copy-1" },
      "failed pipeline terminal write failed",
    );
    expect(reportErrorMock).toHaveBeenCalledWith(singleWriteErr, {
      source: "worker",
      pool: "image",
      jobId: "pf-copy-1",
    });

    // 2. Pipeline-batch child: records child outcome and logs/reports terminal DB or counter write faults without displacing the storage fault
    (logger.error as ReturnType<typeof vi.fn>).mockClear();
    reportErrorMock.mockClear();
    updateSingleFileProgressAtomicallyMock.mockClear();
    txSetMock.mockClear();
    trackEventMock.mockClear();
    const workspaceCap = new SafeError("Workspace storage limit reached", {
      kind: "operational",
      code: "workspace-cap",
      statusCode: 503,
    });
    const dbWriteErr = new Error("postgres write failed");
    const outcomeWriteErr = new Error("redis counter failed");
    objectStorageMocks.getObjectBuffer.mockResolvedValueOnce(Buffer.from("png-out"));
    objectStorageMocks.putObject.mockRejectedValueOnce(workspaceCap);
    updateSingleFileProgressAtomicallyMock.mockRejectedValueOnce(dbWriteErr);
    recordChildOutcomeMock.mockRejectedValueOnce(outcomeWriteErr);

    await expect(
      processor({
        id: "pf-copy-batch-f0",
        name: "pipeline-finalize",
        data: {
          kind: "pipeline-finalize",
          jobId: "pf-copy-batch-f0",
          parentId: "bp-copy",
          totalFiles: 2,
          toolId: "pipeline",
          userId: null,
          pool: "image",
          totalSteps: 1,
          inputRefs: [],
          filename: "in.png",
          settings: {},
        },
      }),
    ).rejects.toBe(workspaceCap);

    expect(recordChildOutcomeMock).toHaveBeenCalledWith(
      "bp-copy",
      2,
      "in.png",
      "Workspace storage limit reached",
    );
    expect(logger.error).toHaveBeenCalledWith(
      { err: dbWriteErr, jobId: "pf-copy-batch-f0", parentId: "bp-copy" },
      "failed pipeline terminal write failed",
    );
    expect(logger.error).toHaveBeenCalledWith(
      { err: outcomeWriteErr, jobId: "pf-copy-batch-f0", parentId: "bp-copy" },
      "failed pipeline batch outcome write failed",
    );
    expect(reportErrorMock).toHaveBeenCalledWith(dbWriteErr, {
      source: "worker",
      pool: "image",
      jobId: "pf-copy-batch-f0",
    });
    expect(reportErrorMock).toHaveBeenCalledWith(outcomeWriteErr, {
      source: "worker",
      pool: "image",
      jobId: "pf-copy-batch-f0",
    });
    expect(trackEventMock).toHaveBeenCalledTimes(1);

    // 2b. Pipeline-batch child with a non-SafeError defect records "Pipeline processing failed" via recordChildOutcome.
    recordChildOutcomeMock.mockClear();
    const rawCopyDefect = new TypeError("unexpected copy defect");
    objectStorageMocks.getObjectBuffer.mockRejectedValueOnce(rawCopyDefect);
    await expect(
      processor({
        id: "pf-copy-batch-f0",
        name: "pipeline-finalize",
        data: {
          kind: "pipeline-finalize",
          jobId: "pf-copy-batch-f0",
          parentId: "bp-copy",
          totalFiles: 2,
          toolId: "pipeline",
          userId: null,
          pool: "image",
          totalSteps: 1,
          inputRefs: [],
          filename: "in.png",
          settings: {},
        },
      }),
    ).rejects.toBe(rawCopyDefect);
    expect(recordChildOutcomeMock).toHaveBeenCalledWith(
      "bp-copy",
      2,
      "in.png",
      "Pipeline processing failed",
    );

    // 3. worker.on("failed") safety net unwraps UnrecoverableError.cause and forwards 503 SafeError message, code, and httpStatus into failSingleJobGuarded
    const { UnrecoverableError } = await import("bullmq");
    const wrappedUnrecoverable = Object.assign(new UnrecoverableError(storageUnavailable.message), {
      cause: storageUnavailable,
    });
    failSingleJobGuardedMock.mockClear();
    failedListener?.(
      {
        id: "pf-copy-1",
        data: {
          kind: "pipeline-finalize",
          jobId: "pf-copy-1",
          clientJobId: "pfc-copy-1",
          toolId: "pipeline",
          pool: "image",
          totalSteps: 1,
        },
      },
      wrappedUnrecoverable,
    );
    await vi.waitFor(() => {
      expect(failSingleJobGuardedMock).toHaveBeenCalledWith({
        jobId: "pfc-copy-1",
        message: "The server's storage service is unavailable.",
        code: "storage-unavailable",
        httpStatus: 503,
        expectedPipelineFlowId: "pf-copy-1",
      });
      expect(failSingleJobGuardedMock).toHaveBeenCalledWith({
        jobId: "pf-copy-1",
        message: "The server's storage service is unavailable.",
        code: "storage-unavailable",
        httpStatus: 503,
      });
    });
  });
});

describe("contentTypeForFilename (#2703)", () => {
  let contentTypeForFilename: (name: string) => string;

  beforeAll(async () => {
    ({ contentTypeForFilename } = await loadWorker());
  });

  it.each([
    ["scan.tif", "image/tiff"],
    ["SCAN.TIF", "image/tiff"],
    ["photo.jxl", "image/jxl"],
    ["favicon.ico", "image/x-icon"],
    ["cursor.cur", "image/x-icon"],
    ["design.psd", "image/vnd.adobe.photoshop"],
    ["tile.jp2", "image/jp2"],
    ["sprite.qoi", "image/qoi"],
    ["frame.ppm", "image/x-portable-pixmap"],
    ["texture.tga", "image/x-tga"],
    ["vector.eps", "application/postscript"],
    ["vector.epsf", "application/postscript"],
    ["raw.dng", "image/x-adobe-dng"],
    ["vector.svgz", "image/svg+xml"],
    ["book.epub", "application/epub+zip"],
    ["report.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["sheet.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["deck.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    ["notes.odt", "application/vnd.oasis.opendocument.text"],
    ["table.ods", "application/vnd.oasis.opendocument.spreadsheet"],
    ["slides.odp", "application/vnd.oasis.opendocument.presentation"],
    ["letter.rtf", "application/rtf"],
    ["page.html", "text/html"],
    ["page.htm", "text/html"],
    ["readme.md", "text/markdown"],
    ["readme.markdown", "text/markdown"],
    ["plain.txt", "text/plain"],
    ["data.csv", "text/csv"],
    ["data.tsv", "text/tab-separated-values"],
    ["config.json", "application/json"],
    ["feed.xml", "application/xml"],
    ["config.yaml", "application/yaml"],
    ["config.yml", "application/yaml"],
    ["archive.zip", "application/zip"],
    ["captions.srt", "application/x-subrip"],
    ["captions.vtt", "text/vtt"],
    ["clip.m4v", "video/mp4"],
    ["stream.ts", "video/mp2t"],
    ["clip.ogv", "video/ogg"],
    ["voice.opus", "audio/opus"],
    ["track.aiff", "audio/aiff"],
    ["unknown.xyz", "application/octet-stream"],
    ["output", "application/octet-stream"],
    ["pdf", "application/octet-stream"],
  ])("maps %s to %s", (filename, expected) => {
    expect(contentTypeForFilename(filename)).toBe(expected);
  });
});

describe("startWorkers sharp.concurrency wiring (#2708)", () => {
  it("configures sharp.concurrency from resolveWorkerThreads(env) when workers start", async () => {
    const { resolveWorkerThreads } = await vi.importActual<
      typeof import("../../../../apps/api/src/lib/env.js")
    >("../../../../apps/api/src/lib/env.js");
    const resolveWorkerThreadsSpy = vi.fn(resolveWorkerThreads);
    const imageEngineActual =
      await vi.importActual<typeof import("@snapotter/image-engine")>("@snapotter/image-engine");
    const configureSharpConcurrencySpy = vi.fn(() => 2);

    const workerMod = await loadWorker("", () => {
      vi.doMock("../../../../apps/api/src/config.js", () => ({
        env: {
          BASE_PATH: "",
          SCRATCH_PATH: "",
          JOB_TIMEOUT_LONG_S: 60,
          JOB_TIMEOUT_FAST_S: 15,
          CONCURRENT_JOBS: 1,
          MAX_WORKER_THREADS: 2,
        },
      }));
      vi.doMock("../../../../apps/api/src/lib/env.js", () => ({
        resolveConcurrency: vi.fn(() => 1),
        resolveWorkerThreads: resolveWorkerThreadsSpy,
      }));
      vi.doMock("@snapotter/image-engine", () => ({
        ...imageEngineActual,
        configureSharpConcurrency: configureSharpConcurrencySpy,
      }));
      vi.doMock("@snapotter/media-engine", () => ({
        HW_ACCEL_FAMILIES: [],
        hwAccelStatus: vi.fn(() => ({ requested: undefined })),
        softwareEncoderStatus: vi.fn(() => ({ missing: [], probeError: undefined })),
      }));
      vi.doMock("../../../../apps/api/src/lib/binary-overrides.js", () => ({
        binaryOverrideWarning: vi.fn(),
        checkBinaryOverrides: vi.fn(() => []),
        isBinarySpawnFailure,
        probeFailureLevel: vi.fn(() => "warn"),
      }));
    });

    sharp.concurrency(7);
    workerMod.startWorkers();

    expect(resolveWorkerThreadsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ MAX_WORKER_THREADS: 2 }),
    );
    expect(configureSharpConcurrencySpy).toHaveBeenCalledWith(2);
    expect(sharp.concurrency()).toBe(2);
  });

  it("configures sharp.concurrency at API boot before Fastify routes are registered", () => {
    const source = readFileSync(resolve(repoRoot, "apps/api/src/index.ts"), "utf8");
    const fastifyStart = source.indexOf("const app = Fastify(");
    const resolveCall = source.indexOf("const bootWorkerThreads = resolveWorkerThreads(env);");
    const sharpCall = source.indexOf("sharp.concurrency(bootWorkerThreads);");
    const engineCall = source.indexOf("configureSharpConcurrency(bootWorkerThreads);");

    expect(resolveCall).toBeGreaterThan(-1);
    expect(sharpCall).toBeGreaterThan(resolveCall);
    expect(engineCall).toBeGreaterThan(resolveCall);
    expect(sharpCall).toBeLessThan(fastifyStart);
    expect(engineCall).toBeLessThan(fastifyStart);
  });
});

describe("timeoutMsFor and executionHint: 'long' worker deadline (#3253)", () => {
  it("selects JOB_TIMEOUT_LONG_S for executionHint: 'long' tools on docs and image pools", async () => {
    const { TOOLS } = await vi.importActual<
      typeof import("../../../../packages/shared/src/constants.js")
    >("../../../../packages/shared/src/constants.js");
    const { SafeError, isSafeMessageError, isToolInputError, hasServerErrorStatus } =
      await vi.importActual<typeof import("../../../../packages/shared/src/tool-errors.js")>(
        "../../../../packages/shared/src/tool-errors.js",
      );
    const { IMAGE_EXT_TO_MIME } = await vi.importActual<
      typeof import("../../../../packages/shared/src/image-mime.js")
    >("../../../../packages/shared/src/image-mime.js");

    const workerMod = await loadWorker("", () => {
      vi.doMock("@snapotter/shared", () => ({
        SafeError,
        isSafeMessageError,
        isToolInputError,
        hasServerErrorStatus,
        IMAGE_EXT_TO_MIME,
        ANALYTICS_EVENTS: {},
        TOOLS,
        COMPRESS_PRESETS: [],
        CAMERA_RAW_INPUTS: [],
        getBundleForTool: vi.fn(() => null),
        getOptionalBundleForTool: vi.fn(() => null),
      }));
    });

    expect(workerMod.timeoutMsFor("ai")).toBe(60_000);
    expect(workerMod.timeoutMsFor("ai", "unknown-tool")).toBe(60_000);
    expect(workerMod.timeoutMsFor("ai", "remove-background")).toBe(60_000);
    expect(workerMod.timeoutMsFor("media")).toBe(60_000);
    expect(workerMod.timeoutMsFor("media", "unknown-tool")).toBe(60_000);
    expect(workerMod.timeoutMsFor("media", "convert-video")).toBe(60_000);
    expect(workerMod.timeoutMsFor("docs", "pdf-to-word")).toBe(60_000);
    expect(workerMod.timeoutMsFor("docs", "compress-pdf")).toBe(60_000);
    expect(workerMod.timeoutMsFor("docs", "convert-document")).toBe(60_000);
    expect(workerMod.timeoutMsFor("image", "content-aware-resize")).toBe(60_000);
    expect(workerMod.timeoutMsFor("docs", "merge-pdf")).toBe(15_000);
    expect(workerMod.timeoutMsFor("docs", "split-pdf")).toBe(15_000);
    expect(workerMod.timeoutMsFor("image", "compress")).toBe(15_000);
    expect(workerMod.timeoutMsFor("docs")).toBe(15_000);
    expect(workerMod.timeoutMsFor("docs", "unknown-tool")).toBe(15_000);
    for (const aliasId of [
      "brightness-contrast",
      "saturation",
      "color-channels",
      "color-effects",
    ]) {
      expect(workerMod.timeoutMsFor("image", aliasId)).toBe(15_000);
    }

    const longCanonicalWorkerMod = await loadWorker("", () => {
      vi.doMock("@snapotter/shared", () => ({
        SafeError,
        isSafeMessageError,
        isToolInputError,
        hasServerErrorStatus,
        IMAGE_EXT_TO_MIME,
        ANALYTICS_EVENTS: {},
        TOOLS: TOOLS.map((t) =>
          t.id === "adjust-colors" ? { ...t, executionHint: "long" as const } : t,
        ),
        COMPRESS_PRESETS: [],
        CAMERA_RAW_INPUTS: [],
        getBundleForTool: vi.fn(() => null),
        getOptionalBundleForTool: vi.fn(() => null),
      }));
    });
    for (const aliasId of [
      "brightness-contrast",
      "saturation",
      "color-channels",
      "color-effects",
    ]) {
      expect(longCanonicalWorkerMod.timeoutMsFor("image", aliasId)).toBe(60_000);
    }
  });

  it("runs a docs-pool pdf-to-word job under JOB_TIMEOUT_LONG_S instead of aborting at JOB_TIMEOUT_FAST_S", async () => {
    vi.useFakeTimers();
    const { TOOLS } = await vi.importActual<
      typeof import("../../../../packages/shared/src/constants.js")
    >("../../../../packages/shared/src/constants.js");
    const { SafeError, isSafeMessageError, isToolInputError, hasServerErrorStatus } =
      await vi.importActual<typeof import("../../../../packages/shared/src/tool-errors.js")>(
        "../../../../packages/shared/src/tool-errors.js",
      );
    const { IMAGE_EXT_TO_MIME } = await vi.importActual<
      typeof import("../../../../packages/shared/src/image-mime.js")
    >("../../../../packages/shared/src/image-mime.js");

    const processV2Mock = vi.fn(async (ctx: { signal: AbortSignal }) => {
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => reject(new Error("Aborted by signal"));
        ctx.signal.addEventListener("abort", onAbort, { once: true });
        setTimeout(() => {
          ctx.signal.removeEventListener("abort", onAbort);
          resolve();
        }, 20_000);
      });
      return {
        scratchPath: "/tmp/job-pdf-to-word/out.docx",
        filename: "out.docx",
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
    });
    const dbSetMock = vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    }));
    const userCancelAc = new AbortController();
    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation(() => new AbortController().signal);

    try {
      const workerMod = await loadWorker("", () => {
        vi.doMock("@snapotter/shared", () => ({
          SafeError,
          isSafeMessageError,
          isToolInputError,
          hasServerErrorStatus,
          IMAGE_EXT_TO_MIME,
          ANALYTICS_EVENTS: {},
          TOOLS,
          COMPRESS_PRESETS: [],
          CAMERA_RAW_INPUTS: [],
          getBundleForTool: vi.fn(() => null),
          getOptionalBundleForTool: vi.fn(() => null),
        }));
        vi.doMock("node:fs", () => ({
          createReadStream: vi.fn((p: string) => ({ path: p })),
        }));
        vi.doMock("node:fs/promises", () => ({
          mkdir: vi.fn().mockResolvedValue(undefined),
          readFile: vi.fn(),
          rm: vi.fn().mockResolvedValue(undefined),
          stat: vi.fn().mockResolvedValue({ size: 2 * 1024 ** 3 }),
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
        vi.doMock("../../../../apps/api/src/jobs/cancel.js", () => ({
          claimFinalize: vi.fn(async () => true),
          registerCancelable: vi.fn(() => new AbortController()),
          releaseFinalize: vi.fn(async () => {}),
          unregisterCancelable: vi.fn(),
          userCancelSignal: vi.fn(() => userCancelAc.signal),
          wasUserCanceled: vi.fn(() => false),
        }));
        vi.doMock("../../../../apps/api/src/jobs/postprocess.js", () => ({
          autoSaveToLibrary: vi.fn().mockResolvedValue({}),
          buildOutputName: vi.fn((out: string) => out),
          generatePreview: vi.fn().mockResolvedValue(undefined),
          stageAutoSaveToLibrary: vi.fn().mockResolvedValue({}),
        }));
        vi.doMock("@snapotter/media-engine", () => ({
          HW_ACCEL_FAMILIES: [],
          hwAccelStatus: vi.fn(() => ({ requested: undefined })),
          softwareEncoderStatus: vi.fn(() => ({ missing: [], probeError: undefined })),
        }));
        vi.doMock("../../../../apps/api/src/lib/binary-overrides.js", () => ({
          binaryOverrideWarning: vi.fn(),
          checkBinaryOverrides: vi.fn(() => []),
          isBinarySpawnFailure,
          probeFailureLevel: vi.fn(() => "warn"),
        }));
      });

      objectStorageMocks.getObjectBuffer.mockResolvedValue(Buffer.from("%PDF-1.4"));
      objectStorageMocks.putObject.mockResolvedValue(undefined);
      objectStorageMocks.putObjectStream.mockResolvedValue(1024);

      const { Worker } = await import("bullmq");
      workerMod.startWorkers();
      const workerCalls = (Worker as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const docsCall = workerCalls.find(([queue]) => String(queue).endsWith("docs"));
      if (!docsCall) throw new Error("docs pool worker not registered");
      const processor = docsCall[1] as (job: unknown) => Promise<unknown>;

      const jobPromise = processor({
        id: "job-pdf-to-word",
        attemptsMade: 0,
        opts: { attempts: 1 },
        updateProgress: vi.fn(),
        data: {
          jobId: "job-pdf-to-word",
          toolId: "pdf-to-word",
          userId: null,
          pool: "docs",
          inputRefs: ["uploads/job-pdf-to-word/in.pdf"],
          filename: "in.pdf",
          settings: {},
          kind: "tool",
        },
      });

      // 20s exceeds JOB_TIMEOUT_FAST_S (15s) but stays well within JOB_TIMEOUT_LONG_S (60s).
      const [, result] = await Promise.all([vi.advanceTimersByTimeAsync(20_000), jobPromise]);
      expect(result).toMatchObject({
        filename: "out.docx",
      });
      expect(timeoutSpy).toHaveBeenCalledWith(60_000);

      // And a docs-pool pdf-to-word job that exceeds JOB_TIMEOUT_LONG_S (60s) still times out at 60s.
      processV2Mock.mockImplementationOnce(async (ctx: { signal: AbortSignal }) => {
        await new Promise<void>((resolve, reject) => {
          const onAbort = () => reject(new Error("Aborted by signal"));
          ctx.signal.addEventListener("abort", onAbort, { once: true });
          setTimeout(() => {
            ctx.signal.removeEventListener("abort", onAbort);
            resolve();
          }, 90_000);
        });
        return {
          scratchPath: "/tmp/job-pdf-to-word-timeout/out.docx",
          filename: "out.docx",
          contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        };
      });

      const slowJobPromise = processor({
        id: "job-pdf-to-word-timeout",
        attemptsMade: 0,
        opts: { attempts: 1 },
        updateProgress: vi.fn(),
        data: {
          jobId: "job-pdf-to-word-timeout",
          toolId: "pdf-to-word",
          userId: null,
          pool: "docs",
          inputRefs: ["uploads/job-pdf-to-word-timeout/in.pdf"],
          filename: "in.pdf",
          settings: {},
          kind: "tool",
        },
      });
      const slowOutcome = slowJobPromise.then(
        () => null,
        (err: unknown) => err,
      );
      await vi.advanceTimersByTimeAsync(60_000);
      const slowErr = await slowOutcome;
      expect(slowErr).toBeInstanceOf(Error);
      expect((slowErr as Error).message).toMatch(/Timed out after 60s/);
    } finally {
      timeoutSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("checks wasUserCanceled before scrubPdfProducer and passes userCancel to primary and extra PDF scrubs (#3254)", async () => {
    const processV2Mock = vi.fn();
    const scrubPdfProducerMock = vi.fn(async (buf: Buffer, _opts?: { signal?: AbortSignal }) =>
      Buffer.concat([buf, Buffer.from("-scrubbed")]),
    );
    const dbSetMock = vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    }));
    const userCancelAc = new AbortController();
    const wasUserCanceledMock = vi.fn((_jobId?: string) => false);

    const workerMod = await loadWorker("", () => {
      vi.doMock("../../../../apps/api/src/lib/pdf-producer.js", () => ({
        SCRUB_PDF_PRODUCER_TOOLS: new Set(["word-to-pdf"]),
        scrubPdfProducer: (buf: Buffer, opts?: { signal?: AbortSignal }) =>
          scrubPdfProducerMock(buf, opts),
      }));
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
      vi.doMock("../../../../apps/api/src/jobs/cancel.js", () => ({
        claimFinalize: vi.fn(async () => true),
        registerCancelable: vi.fn(() => new AbortController()),
        releaseFinalize: vi.fn(async () => {}),
        unregisterCancelable: vi.fn(),
        userCancelSignal: vi.fn(() => userCancelAc.signal),
        wasUserCanceled: (id: string) => wasUserCanceledMock(id),
      }));
      vi.doMock("../../../../apps/api/src/jobs/postprocess.js", () => ({
        autoSaveToLibrary: vi.fn().mockResolvedValue({}),
        buildOutputName: vi.fn((out: string) => out),
        generatePreview: vi.fn().mockResolvedValue(undefined),
        stageAutoSaveToLibrary: vi.fn().mockResolvedValue({}),
      }));
      vi.doMock("@snapotter/media-engine", () => ({
        HW_ACCEL_FAMILIES: [],
        hwAccelStatus: vi.fn(() => ({ requested: undefined })),
        softwareEncoderStatus: vi.fn(() => ({ missing: [], probeError: undefined })),
      }));
      vi.doMock("../../../../apps/api/src/lib/binary-overrides.js", () => ({
        binaryOverrideWarning: vi.fn(),
        checkBinaryOverrides: vi.fn(() => []),
        isBinarySpawnFailure,
        probeFailureLevel: vi.fn(() => "warn"),
      }));
    });

    objectStorageMocks.getObjectBuffer.mockResolvedValue(Buffer.from("docx-input"));
    objectStorageMocks.putObject.mockResolvedValue(undefined);
    objectStorageMocks.deletePrefix.mockResolvedValue(undefined);

    const { Worker, UnrecoverableError } = await import("bullmq");
    workerMod.startWorkers();
    const workerCalls = (Worker as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const docsCall = workerCalls.find(([queue]) => String(queue).endsWith("docs"));
    if (!docsCall) throw new Error("docs pool worker not registered");
    const processor = docsCall[1] as (job: unknown) => Promise<unknown>;

    // 1. User cancel landed while the handler was finishing: wasUserCanceled runs BEFORE scrubPdfProducer.
    wasUserCanceledMock.mockReturnValueOnce(true).mockReturnValueOnce(true);
    processV2Mock.mockResolvedValueOnce({
      buffer: Buffer.from("%PDF-1.4 primary"),
      filename: "out.pdf",
      contentType: "application/pdf",
    });

    await expect(
      processor({
        id: "job-cancel-before-scrub",
        attemptsMade: 0,
        opts: { attempts: 1 },
        updateProgress: vi.fn(),
        data: {
          jobId: "job-cancel-before-scrub",
          toolId: "word-to-pdf",
          userId: null,
          pool: "docs",
          inputRefs: ["uploads/job-cancel-before-scrub/in.docx"],
          filename: "in.docx",
          settings: {},
          kind: "tool",
        },
      }),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(scrubPdfProducerMock).not.toHaveBeenCalled();
    expect(objectStorageMocks.putObject).not.toHaveBeenCalled();

    // 2. Normal completion forwards { signal: userCancel } to both primary and extra PDF scrubs.
    wasUserCanceledMock.mockReset().mockReturnValue(false);
    scrubPdfProducerMock.mockClear();
    objectStorageMocks.putObject.mockClear();
    processV2Mock.mockResolvedValueOnce({
      buffer: Buffer.from("%PDF-1.4 primary"),
      filename: "out.pdf",
      contentType: "application/pdf",
      extraOutputs: [
        {
          name: "attachment.pdf",
          buffer: Buffer.from("%PDF-1.4 extra"),
          contentType: "application/pdf",
        },
      ],
    });

    await processor({
      id: "job-scrub-signals",
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: vi.fn(),
      data: {
        jobId: "job-scrub-signals",
        toolId: "word-to-pdf",
        userId: null,
        pool: "docs",
        inputRefs: ["uploads/job-scrub-signals/in.docx"],
        filename: "in.docx",
        settings: {},
        kind: "tool",
      },
    });

    expect(scrubPdfProducerMock).toHaveBeenCalledTimes(2);
    expect(scrubPdfProducerMock).toHaveBeenNthCalledWith(1, Buffer.from("%PDF-1.4 primary"), {
      signal: userCancelAc.signal,
    });
    expect(scrubPdfProducerMock).toHaveBeenNthCalledWith(2, Buffer.from("%PDF-1.4 extra"), {
      signal: userCancelAc.signal,
    });

    // 3. User cancel landing during scrubPdfProducer aborts the scrub and settles the job canceled.
    scrubPdfProducerMock.mockClear();
    objectStorageMocks.putObject.mockClear();
    dbSetMock.mockClear();
    scrubPdfProducerMock.mockImplementationOnce(
      async (_buf: Buffer, opts?: { signal?: AbortSignal }) => {
        expect(opts?.signal).toBe(userCancelAc.signal);
        wasUserCanceledMock.mockReturnValue(true);
        userCancelAc.abort();
        throw Object.assign(new Error("Python script canceled"), {
          name: "AbortError",
          code: "canceled",
        });
      },
    );
    processV2Mock.mockResolvedValueOnce({
      buffer: Buffer.from("%PDF-1.4 primary"),
      filename: "out.pdf",
      contentType: "application/pdf",
    });

    await expect(
      processor({
        id: "job-cancel-during-scrub",
        attemptsMade: 0,
        opts: { attempts: 1 },
        updateProgress: vi.fn(),
        data: {
          jobId: "job-cancel-during-scrub",
          toolId: "word-to-pdf",
          userId: null,
          pool: "docs",
          inputRefs: ["uploads/job-cancel-during-scrub/in.docx"],
          filename: "in.docx",
          settings: {},
          kind: "tool",
        },
      }),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(scrubPdfProducerMock).toHaveBeenCalledTimes(1);
    expect(objectStorageMocks.putObject).not.toHaveBeenCalled();
    expect(dbSetMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "canceled",
        error: { message: "Canceled" },
      }),
    );

    // 4. User cancel landing right as scrubPdfProducer resolves is caught by the post-scrub wasUserCanceled guard.
    wasUserCanceledMock.mockReset().mockReturnValue(false);
    scrubPdfProducerMock.mockClear();
    objectStorageMocks.putObject.mockClear();
    dbSetMock.mockClear();
    scrubPdfProducerMock.mockImplementationOnce(async (buf: Buffer) => {
      wasUserCanceledMock.mockReturnValue(true);
      return Buffer.concat([buf, Buffer.from("-scrubbed")]);
    });
    processV2Mock.mockResolvedValueOnce({
      buffer: Buffer.from("%PDF-1.4 primary"),
      filename: "out.pdf",
      contentType: "application/pdf",
    });

    await expect(
      processor({
        id: "job-cancel-post-scrub",
        attemptsMade: 0,
        opts: { attempts: 1 },
        updateProgress: vi.fn(),
        data: {
          jobId: "job-cancel-post-scrub",
          toolId: "word-to-pdf",
          userId: null,
          pool: "docs",
          inputRefs: ["uploads/job-cancel-post-scrub/in.docx"],
          filename: "in.docx",
          settings: {},
          kind: "tool",
        },
      }),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(scrubPdfProducerMock).toHaveBeenCalledTimes(1);
    expect(objectStorageMocks.putObject).not.toHaveBeenCalled();
    expect(dbSetMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "canceled",
        error: { message: "Canceled" },
      }),
    );
  });
});

describe("legacy adjust-colors aliases in toolUsedBaseProps (#3386)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it.each(["brightness-contrast", "saturation", "color-channels", "color-effects"])(
    "resolves legacy alias %s to adjust-colors in toolUsedBaseProps on completed and failed jobs",
    async (aliasId) => {
      const { TOOLS } = await vi.importActual<
        typeof import("../../../../packages/shared/src/constants.js")
      >("../../../../packages/shared/src/constants.js");
      const { SafeError, isSafeMessageError, isToolInputError, hasServerErrorStatus } =
        await vi.importActual<typeof import("../../../../packages/shared/src/tool-errors.js")>(
          "../../../../packages/shared/src/tool-errors.js",
        );
      const { IMAGE_EXT_TO_MIME } = await vi.importActual<
        typeof import("../../../../packages/shared/src/image-mime.js")
      >("../../../../packages/shared/src/image-mime.js");

      const processV2Mock = vi.fn();
      const trackEventMock = vi.fn();
      const getBundleForToolMock = vi.fn(() => null);
      const getOptionalBundleForToolMock = vi.fn(() => null);
      const dbSetMock = vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      }));

      const workerMod = await loadWorker("", () => {
        vi.doMock("@snapotter/shared", () => ({
          SafeError,
          isSafeMessageError,
          isToolInputError,
          hasServerErrorStatus,
          IMAGE_EXT_TO_MIME,
          ANALYTICS_EVENTS: { TOOL_USED: "tool_used" },
          TOOLS,
          COMPRESS_PRESETS: [],
          CAMERA_RAW_INPUTS: [],
          ONBOARDING_FIRST_PROCESSED_KEY: "onboarding_first_processed_at",
          extractErrorCode: vi.fn(() => undefined),
          getBundleForTool: getBundleForToolMock,
          getOptionalBundleForTool: getOptionalBundleForToolMock,
        }));
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
        vi.doMock("../../../../apps/api/src/lib/analytics.js", () => ({
          captureException: vi.fn(),
          trackEvent: trackEventMock,
        }));
        vi.doMock("../../../../apps/api/src/lib/analytics-gate.js", () => ({
          analyticsEnabled: vi.fn(() => true),
        }));
        vi.doMock("../../../../apps/api/src/lib/error-report.js", () => ({
          classifyError: vi.fn(() => "bug"),
          reportError: vi.fn(),
          safeFormatTag: vi.fn((name?: string) => name?.split(".").pop()?.toLowerCase()),
        }));
        vi.doMock("../../../../apps/api/src/lib/settings-helpers.js", () => ({
          setSettingIfAbsent: vi.fn().mockResolvedValue(undefined),
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
          generatePreview: vi.fn().mockResolvedValue(undefined),
          stageAutoSaveToLibrary: vi.fn().mockResolvedValue({}),
        }));
        vi.doMock("@snapotter/media-engine", () => ({
          HW_ACCEL_FAMILIES: [],
          hwAccelStatus: vi.fn(() => ({ requested: undefined })),
          softwareEncoderStatus: vi.fn(() => ({ missing: [], probeError: undefined })),
        }));
        vi.doMock("../../../../apps/api/src/lib/binary-overrides.js", () => ({
          binaryOverrideWarning: vi.fn(),
          checkBinaryOverrides: vi.fn(() => []),
          isBinarySpawnFailure,
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

      const canonicalTool = TOOLS.find((t) => t.id === "adjust-colors");
      expect(canonicalTool?.category).toBe("adjustments");

      // 1. Completed job emits canonical category ("adjustments") while preserving alias tool_id
      processV2Mock.mockResolvedValueOnce({
        buffer: Buffer.from("out-bytes"),
        filename: "out.png",
        contentType: "image/png",
      });
      await processor({
        id: `job-ok-${aliasId}`,
        attemptsMade: 0,
        opts: { attempts: 1 },
        updateProgress: vi.fn(),
        data: {
          jobId: `job-ok-${aliasId}`,
          toolId: aliasId,
          userId: null,
          pool: "image",
          inputRefs: [`uploads/job-ok-${aliasId}/in.png`],
          filename: "in.png",
          settings: {},
          kind: "tool",
          analyticsDistinctId: "distinct-3386",
        },
      });

      expect(trackEventMock).toHaveBeenCalledTimes(1);
      expect(trackEventMock).toHaveBeenCalledWith(
        "tool_used",
        expect.objectContaining({
          tool_id: aliasId,
          category: "adjustments",
          is_ai_tool: false,
          execution_hint: "fast",
          status: "completed",
          input_format: "png",
          output_format: "png",
        }),
        "distinct-3386",
      );
      expect(getBundleForToolMock).toHaveBeenCalledWith("adjust-colors");
      expect(getOptionalBundleForToolMock).toHaveBeenCalledWith("adjust-colors");

      // 2. Failed job also emits canonical category ("adjustments") while preserving alias tool_id
      trackEventMock.mockClear();
      getBundleForToolMock.mockClear();
      getOptionalBundleForToolMock.mockClear();
      processV2Mock.mockRejectedValueOnce(new Error("encode failed"));
      await expect(
        processor({
          id: `job-fail-${aliasId}`,
          attemptsMade: 0,
          opts: { attempts: 1 },
          updateProgress: vi.fn(),
          data: {
            jobId: `job-fail-${aliasId}`,
            toolId: aliasId,
            userId: null,
            pool: "image",
            inputRefs: [`uploads/job-fail-${aliasId}/in.png`],
            filename: "in.png",
            settings: {},
            kind: "tool",
            analyticsDistinctId: "distinct-3386",
          },
        }),
      ).rejects.toThrow("encode failed");

      expect(trackEventMock).toHaveBeenCalledTimes(1);
      expect(trackEventMock).toHaveBeenCalledWith(
        "tool_used",
        expect.objectContaining({
          tool_id: aliasId,
          category: "adjustments",
          is_ai_tool: false,
          execution_hint: "fast",
          status: "failed",
          input_format: "png",
        }),
        "distinct-3386",
      );
      expect(getBundleForToolMock).toHaveBeenCalledWith("adjust-colors");
      expect(getOptionalBundleForToolMock).toHaveBeenCalledWith("adjust-colors");
    },
  );
});

describe("processToolJob expectedArtifactJobId alias guard (#3408)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("passes expectedArtifactJobId on alias completion and failure writes and skips publishEphemeral when a separate alias cancel write succeeds (#3408)", async () => {
    const processV2Mock = vi.fn();
    const cancelSingleJobGuardedMock = vi.fn().mockResolvedValue(undefined);
    const publishEphemeralMock = vi.fn();
    const updateSingleFileProgressMock = vi.fn().mockResolvedValue(undefined);
    const updateSingleFileProgressAtomicallyMock = vi.fn(
      async (_progress: unknown, mutate?: (tx: unknown) => Promise<void>) => {
        const { db } = await import("../../../../apps/api/src/db/index.js");
        if (mutate && "update" in db) {
          await mutate(db);
        }
      },
    );
    const wasUserCanceledMock = vi.fn(() => false);
    const dbSetMock = vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    }));

    const workerMod = await loadWorker("", () => {
      vi.doMock("node:fs/promises", () => ({
        mkdir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn(),
        rm: vi.fn().mockResolvedValue(undefined),
      }));
      vi.doMock("../../../../apps/api/src/db/index.js", () => ({
        db: {
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn().mockResolvedValue([]),
            })),
          })),
          update: vi.fn(() => ({
            set: dbSetMock,
          })),
        },
        schema: { jobs: { id: "jobs.id", status: "jobs.status", settings: "jobs.settings" } },
      }));
      vi.doMock("../../../../apps/api/src/routes/progress.js", () => ({
        cancelSingleJobGuarded: cancelSingleJobGuardedMock,
        publishEphemeral: publishEphemeralMock,
        updateSingleFileProgress: updateSingleFileProgressMock,
        updateSingleFileProgressAtomically: updateSingleFileProgressAtomicallyMock,
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
      vi.doMock("../../../../apps/api/src/jobs/cancel.js", () => ({
        claimFinalize: vi.fn(async () => true),
        registerCancelable: vi.fn(() => new AbortController()),
        releaseFinalize: vi.fn(async () => {}),
        unregisterCancelable: vi.fn(),
        userCancelSignal: vi.fn(() => new AbortController().signal),
        wasUserCanceled: wasUserCanceledMock,
      }));
      vi.doMock("../../../../apps/api/src/jobs/postprocess.js", () => ({
        autoSaveToLibrary: vi.fn().mockResolvedValue({}),
        buildOutputName: vi.fn((out: string) => out),
        generatePreview: vi.fn().mockResolvedValue(undefined),
        stageAutoSaveToLibrary: vi.fn().mockResolvedValue({}),
      }));
      vi.doMock("../../../../apps/api/src/lib/error-report.js", () => ({
        classifyError: vi.fn(() => "bug"),
        reportError: vi.fn(),
        safeFormatTag: vi.fn(() => "png"),
      }));
      vi.doMock("@snapotter/media-engine", () => ({
        HW_ACCEL_FAMILIES: [],
        hwAccelStatus: vi.fn(() => ({ requested: undefined })),
        softwareEncoderStatus: vi.fn(() => ({ missing: [], probeError: undefined })),
      }));
      vi.doMock("../../../../apps/api/src/lib/binary-overrides.js", () => ({
        binaryOverrideWarning: vi.fn(),
        checkBinaryOverrides: vi.fn(() => []),
        isBinarySpawnFailure,
        probeFailureLevel: vi.fn(() => "warn"),
      }));
    });

    objectStorageMocks.getObjectBuffer.mockResolvedValue(Buffer.from("input-bytes"));
    objectStorageMocks.putObject.mockResolvedValue(undefined);
    objectStorageMocks.deletePrefix.mockResolvedValue(undefined);

    const { Worker, UnrecoverableError } = await import("bullmq");
    workerMod.startWorkers();
    const workerCalls = (Worker as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const imageCall = workerCalls.find(([queue]) => String(queue).endsWith("image"));
    if (!imageCall) throw new Error("image pool worker not registered");
    const processor = imageCall[1] as (job: unknown) => Promise<unknown>;

    const makeToolJob = (jobId: string, clientJobId?: string) => ({
      id: jobId,
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: vi.fn(),
      data: {
        jobId,
        ...(clientJobId ? { clientJobId } : {}),
        toolId: "compress",
        userId: null,
        pool: "image",
        inputRefs: [`uploads/${jobId}/in.png`],
        filename: "in.png",
        settings: {},
        kind: "tool",
      },
    });

    // 1. Completion with separate clientJobId passes expectedArtifactJobId: jobId
    processV2Mock.mockResolvedValueOnce({
      buffer: Buffer.from("out-bytes"),
      filename: "out.png",
      contentType: "image/png",
    });
    await processor(makeToolJob("job-done-alias", "client-done-alias"));
    expect(updateSingleFileProgressAtomicallyMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        jobId: "client-done-alias",
        phase: "complete",
        expectedArtifactJobId: "job-done-alias",
      }),
      expect.any(Function),
    );

    // 1b. Completion without separate clientJobId omits expectedArtifactJobId
    updateSingleFileProgressAtomicallyMock.mockClear();
    processV2Mock.mockResolvedValueOnce({
      buffer: Buffer.from("out-bytes"),
      filename: "out.png",
      contentType: "image/png",
    });
    await processor(makeToolJob("job-done-direct"));
    const directCompleteArg = updateSingleFileProgressAtomicallyMock.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(directCompleteArg).toMatchObject({
      jobId: "job-done-direct",
      phase: "complete",
    });
    expect(directCompleteArg).not.toHaveProperty("expectedArtifactJobId");

    // 2. Failure with separate clientJobId passes expectedArtifactJobId: jobId
    updateSingleFileProgressAtomicallyMock.mockClear();
    processV2Mock.mockRejectedValueOnce(new Error("boom"));
    await expect(processor(makeToolJob("job-fail-alias", "client-fail-alias"))).rejects.toThrow(
      "boom",
    );
    expect(updateSingleFileProgressAtomicallyMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        jobId: "client-fail-alias",
        phase: "failed",
        error: "boom",
        expectedArtifactJobId: "job-fail-alias",
      }),
      expect.any(Function),
    );

    // 2b. Failure without separate clientJobId omits expectedArtifactJobId
    updateSingleFileProgressAtomicallyMock.mockClear();
    processV2Mock.mockRejectedValueOnce(new Error("boom-direct"));
    await expect(processor(makeToolJob("job-fail-direct"))).rejects.toThrow("boom-direct");
    const directFailArg = updateSingleFileProgressAtomicallyMock.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(directFailArg).toMatchObject({
      jobId: "job-fail-direct",
      phase: "failed",
      error: "boom-direct",
    });
    expect(directFailArg).not.toHaveProperty("expectedArtifactJobId");

    // 3. Cancel with separate clientJobId: when cancelSingleJobGuarded succeeds, publishEphemeral is NOT called
    cancelSingleJobGuardedMock.mockClear();
    publishEphemeralMock.mockClear();
    wasUserCanceledMock.mockReturnValue(true);
    processV2Mock.mockRejectedValueOnce(new Error("Canceled"));
    await expect(
      processor(makeToolJob("job-cancel-alias", "client-cancel-alias")),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(cancelSingleJobGuardedMock).toHaveBeenCalledWith({
      jobId: "client-cancel-alias",
      expectedArtifactJobId: "job-cancel-alias",
    });
    expect(publishEphemeralMock).not.toHaveBeenCalled();

    // 3b. Cancel with separate clientJobId: when cancelSingleJobGuarded throws, publishEphemeral IS called as fallback
    cancelSingleJobGuardedMock.mockClear();
    publishEphemeralMock.mockClear();
    cancelSingleJobGuardedMock.mockRejectedValueOnce(new Error("alias write fault"));
    processV2Mock.mockRejectedValueOnce(new Error("Canceled"));
    await expect(
      processor(makeToolJob("job-cancel-fault", "client-cancel-fault")),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(publishEphemeralMock).toHaveBeenCalledWith({
      jobId: "client-cancel-fault",
      type: "single",
      phase: "failed",
      percent: 0,
      error: "Canceled",
      code: "CANCELED",
    });

    // 3c. Cancel without separate clientJobId: publishEphemeral IS called directly
    cancelSingleJobGuardedMock.mockClear();
    publishEphemeralMock.mockClear();
    processV2Mock.mockRejectedValueOnce(new Error("Canceled"));
    await expect(processor(makeToolJob("job-cancel-direct"))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(cancelSingleJobGuardedMock).not.toHaveBeenCalled();
    expect(publishEphemeralMock).toHaveBeenCalledWith({
      jobId: "job-cancel-direct",
      type: "single",
      phase: "failed",
      percent: 0,
      error: "Canceled",
      code: "CANCELED",
    });

    // 4. Non-terminal progress in processToolJob passes expectedArtifactJobId when clientJobId !== jobId and omits it when direct (#3409)
    wasUserCanceledMock.mockReturnValue(false);
    updateSingleFileProgressMock.mockClear();
    processV2Mock.mockImplementationOnce(
      async (ctx: { report: (percent: number, stage?: string) => void }) => {
        ctx.report(45, "Encoding...");
        return {
          buffer: Buffer.from("out-bytes"),
          filename: "out.png",
          contentType: "image/png",
        };
      },
    );
    await processor(makeToolJob("job-progress-alias", "client-progress-alias"));
    expect(updateSingleFileProgressMock).toHaveBeenCalledWith({
      jobId: "client-progress-alias",
      phase: "processing",
      percent: 45,
      stage: "Encoding...",
      expectedArtifactJobId: "job-progress-alias",
    });

    updateSingleFileProgressMock.mockClear();
    processV2Mock.mockImplementationOnce(
      async (ctx: { report: (percent: number, stage?: string) => void }) => {
        ctx.report(45, "Encoding...");
        return {
          buffer: Buffer.from("out-bytes"),
          filename: "out.png",
          contentType: "image/png",
        };
      },
    );
    await processor(makeToolJob("job-progress-direct"));
    const directProgressArg = updateSingleFileProgressMock.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(directProgressArg).toEqual({
      jobId: "job-progress-direct",
      phase: "processing",
      percent: 45,
      stage: "Encoding...",
    });
    expect(directProgressArg).not.toHaveProperty("expectedArtifactJobId");

    // 5. Non-terminal progress in processPipelineStep passes expectedPipelineFlowId when clientJobId !== flowId and omits it when clientJobId === flowId (#3409)
    updateSingleFileProgressMock.mockClear();
    processV2Mock.mockImplementationOnce(
      async (ctx: { report: (percent: number, stage?: string) => void }) => {
        ctx.report(60, "Inner tool progress");
        return {
          buffer: Buffer.from("step-bytes"),
          filename: "step.png",
          contentType: "image/png",
        };
      },
    );
    await processor({
      id: "flow-step-alias-s1",
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: vi.fn(),
      data: {
        kind: "pipeline-step",
        jobId: "flow-step-alias-s1",
        clientJobId: "client-pipeline-alias",
        toolId: "compress",
        userId: null,
        pool: "image",
        stepIndex: 1,
        totalSteps: 2,
        inputRefs: ["uploads/flow-step-alias-s0/mid.png"],
        filename: "mid.png",
        settings: {},
      },
    });
    expect(updateSingleFileProgressMock).toHaveBeenNthCalledWith(1, {
      jobId: "client-pipeline-alias",
      phase: "processing",
      percent: 45,
      stage: "Step 2/2: compress",
      expectedPipelineFlowId: "flow-step-alias",
    });
    // The inner processToolJob runs with data.clientJobId cleared, so its own report targets the step row without expectedArtifactJobId or expectedPipelineFlowId.
    expect(updateSingleFileProgressMock).toHaveBeenNthCalledWith(2, {
      jobId: "flow-step-alias-s1",
      phase: "processing",
      percent: 60,
      stage: "Inner tool progress",
    });

    updateSingleFileProgressMock.mockClear();
    processV2Mock.mockResolvedValueOnce({
      buffer: Buffer.from("step-bytes"),
      filename: "step.png",
      contentType: "image/png",
    });
    await processor({
      id: "flow-step-direct-s0",
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: vi.fn(),
      data: {
        kind: "pipeline-step",
        jobId: "flow-step-direct-s0",
        clientJobId: "flow-step-direct",
        toolId: "compress",
        userId: null,
        pool: "image",
        stepIndex: 0,
        totalSteps: 2,
        inputRefs: ["uploads/flow-step-direct-s0/in.png"],
        filename: "in.png",
        settings: {},
      },
    });
    const directStepProgressArg = updateSingleFileProgressMock.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(directStepProgressArg).toEqual({
      jobId: "flow-step-direct",
      phase: "processing",
      percent: 0,
      stage: "Step 1/2: compress",
    });
    expect(directStepProgressArg).not.toHaveProperty("expectedPipelineFlowId");
  });
});

// #951: processPipelineStep and processBatchChild catch processToolJob throws
// and return failure markers so BullMQ parent flows settle, which meant the
// worker failed listeners never ran for them and their errors never reached
// reportError.
describe("pipeline-step and batch-child failure reporting (#951)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  async function setupProcessor(prevRow?: Record<string, unknown>) {
    const processV2Mock = vi.fn();
    const reportErrorMock = vi.fn();
    const recordChildOutcomeMock = vi.fn().mockResolvedValue(undefined);
    const dbSetMock = vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    }));
    const actualErrorReport = await vi.importActual<
      typeof import("../../../../apps/api/src/lib/error-report.js")
    >("../../../../apps/api/src/lib/error-report.js");

    const workerMod = await loadWorker("", () => {
      vi.doMock("node:fs/promises", () => ({
        mkdir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn(),
        rm: vi.fn().mockResolvedValue(undefined),
      }));
      vi.doMock("../../../../apps/api/src/db/index.js", () => ({
        db: {
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn().mockResolvedValue(prevRow ? [prevRow] : []),
            })),
          })),
          update: vi.fn(() => ({
            set: dbSetMock,
          })),
        },
        schema: {
          jobs: {
            id: "jobs.id",
            status: "jobs.status",
            settings: "jobs.settings",
            outputRefs: "jobs.outputRefs",
            error: "jobs.error",
          },
        },
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
      vi.doMock("../../../../apps/api/src/jobs/batch-progress.js", () => ({
        isBatchCanceled: vi.fn(async () => false),
        recordChildOutcome: recordChildOutcomeMock,
      }));
      vi.doMock("../../../../apps/api/src/lib/error-report.js", () => ({
        classifyError: actualErrorReport.classifyError,
        reportError: reportErrorMock,
        safeFormatTag: actualErrorReport.safeFormatTag,
      }));
      vi.doMock("@snapotter/media-engine", () => ({
        HW_ACCEL_FAMILIES: [],
        hwAccelStatus: vi.fn(() => ({ requested: undefined })),
        softwareEncoderStatus: vi.fn(() => ({ missing: [], probeError: undefined })),
      }));
      vi.doMock("../../../../apps/api/src/lib/binary-overrides.js", () => ({
        binaryOverrideWarning: vi.fn(),
        checkBinaryOverrides: vi.fn(() => []),
        isBinarySpawnFailure,
        probeFailureLevel: vi.fn(() => "warn"),
      }));
    });

    objectStorageMocks.getObjectBuffer.mockResolvedValue(Buffer.from("input-bytes"));
    objectStorageMocks.putObject.mockResolvedValue(undefined);
    objectStorageMocks.deletePrefix.mockResolvedValue(undefined);

    const { Worker } = await import("bullmq");
    const { logger } = await import("../../../../apps/api/src/lib/logger.js");
    workerMod.startWorkers();
    const workerCalls = (Worker as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const imageCall = workerCalls.find(([queue]) => String(queue).endsWith("image"));
    if (!imageCall) throw new Error("image pool worker not registered");
    const processor = imageCall[1] as (job: unknown) => Promise<unknown>;

    return { processor, processV2Mock, reportErrorMock, recordChildOutcomeMock, logger };
  }

  it("reports a failed pipeline step with worker context and unwraps UnrecoverableError causes", async () => {
    const { processor, processV2Mock, reportErrorMock, logger } = await setupProcessor({
      status: "completed",
      outputRefs: ["outputs/pipe-1-s0/converted.webp"],
      error: null,
    });

    const bugErr = new Error("sharp pipeline assertion failed");
    processV2Mock.mockRejectedValueOnce(bugErr);

    const stepResult = await processor({
      id: "pipe-1-s1",
      timestamp: 1_000,
      processedOn: 4_500,
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: vi.fn(),
      data: {
        kind: "pipeline-step",
        jobId: "pipe-1-s1",
        prevJobId: "pipe-1-s0",
        stepIndex: 1,
        totalSteps: 2,
        toolId: "image-enhancement",
        userId: null,
        pool: "image",
        inputRefs: [],
        filename: "photo.jpg",
        settings: { preset: "vivid" },
      },
    });

    expect(stepResult).toMatchObject({
      outputRefs: [],
      filename: "photo.jpg",
      resultPayload: { failed: true, error: "sharp pipeline assertion failed" },
    });
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock).toHaveBeenCalledWith(bugErr, {
      source: "worker",
      pool: "image",
      toolId: "image-enhancement",
      jobId: "pipe-1-s1",
      inputFormat: "webp",
      settings: { preset: "vivid" },
      jobAgeMs: 3_500,
    });

    // UnrecoverableError wrapping a sidecar/engine failure unwraps cause and logs pythonFrames.
    reportErrorMock.mockClear();
    const { SafeError } = await vi.importActual<
      typeof import("../../../../packages/shared/src/tool-errors.js")
    >("../../../../packages/shared/src/tool-errors.js");
    const sidecarErr = Object.assign(
      new SafeError("Engine unavailable", {
        kind: "operational",
        code: "ENGINE_UNAVAILABLE",
        statusCode: 503,
      }),
      { pythonFrames: [{ file: "enhance.py", line: 42, func: "run" }] },
    );
    processV2Mock.mockRejectedValueOnce(sidecarErr);

    await processor({
      id: "pipe-2-s0",
      timestamp: 2_000,
      processedOn: 3_000,
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: vi.fn(),
      data: {
        kind: "pipeline-step",
        jobId: "pipe-2-s0",
        stepIndex: 0,
        totalSteps: 1,
        toolId: "image-enhancement",
        userId: null,
        pool: "ai",
        inputRefs: ["uploads/pipe-2-s0/photo.png"],
        filename: "photo.png",
        settings: {},
      },
    });

    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock).toHaveBeenCalledWith(sidecarErr, {
      source: "worker",
      pool: "ai",
      toolId: "image-enhancement",
      jobId: "pipe-2-s0",
      inputFormat: "png",
      settings: {},
      jobAgeMs: 1_000,
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        pool: "ai",
        jobId: "pipe-2-s0",
        pythonFrames: sidecarErr.pythonFrames,
      }),
      "sidecar failure",
    );
  });

  it("does not report a subsequent pipeline step that skips processing because a previous step failed", async () => {
    const { processor, processV2Mock, reportErrorMock } = await setupProcessor({
      status: "failed",
      outputRefs: [],
      error: { message: "step 1 boom" },
    });

    const stepResult = await processor({
      id: "pipe-skip-s1",
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: vi.fn(),
      data: {
        kind: "pipeline-step",
        jobId: "pipe-skip-s1",
        prevJobId: "pipe-skip-s0",
        stepIndex: 1,
        totalSteps: 2,
        toolId: "resize",
        userId: null,
        pool: "image",
        inputRefs: [],
        filename: "photo.jpg",
        settings: {},
      },
    });

    expect(stepResult).toMatchObject({
      resultPayload: { failed: true, error: "step 1 boom" },
    });
    expect(processV2Mock).not.toHaveBeenCalled();
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("reports a failed batch child with worker context and unwraps UnrecoverableError causes", async () => {
    const { processor, processV2Mock, reportErrorMock, recordChildOutcomeMock, logger } =
      await setupProcessor();

    const { SafeError } = await vi.importActual<
      typeof import("../../../../packages/shared/src/tool-errors.js")
    >("../../../../packages/shared/src/tool-errors.js");
    const childErr = Object.assign(
      new SafeError("Engine unavailable", {
        kind: "operational",
        code: "ENGINE_UNAVAILABLE",
        statusCode: 503,
      }),
      { pythonFrames: [{ file: "upscale.py", line: 19, func: "main" }] },
    );
    processV2Mock.mockRejectedValueOnce(childErr);

    const childResult = await processor({
      id: "batch-1-f0",
      timestamp: 500,
      processedOn: 2_500,
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: vi.fn(),
      data: {
        kind: "batch-child",
        jobId: "batch-1-f0",
        parentId: "batch-1",
        totalFiles: 2,
        toolId: "upscale",
        userId: null,
        pool: "ai",
        inputRefs: ["uploads/batch-1-f0/frame.tiff"],
        filename: "frame.tiff",
        settings: { scale: 2 },
      },
    });

    expect(childResult).toMatchObject({
      outputRefs: [],
      filename: "frame.tiff",
      resultPayload: { failed: true, error: "Engine unavailable" },
    });
    expect(recordChildOutcomeMock).toHaveBeenCalledWith(
      "batch-1",
      2,
      "frame.tiff",
      "Engine unavailable",
    );
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock).toHaveBeenCalledWith(childErr, {
      source: "worker",
      pool: "ai",
      toolId: "upscale",
      jobId: "batch-1-f0",
      inputFormat: "tiff",
      settings: { scale: 2 },
      jobAgeMs: 2_000,
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        pool: "ai",
        jobId: "batch-1-f0",
        pythonFrames: childErr.pythonFrames,
      }),
      "sidecar failure",
    );

    // When inputRefs[0] has no extension, inputFormat falls back to data.filename.
    reportErrorMock.mockClear();
    const fallbackErr = new Error("codec fault");
    processV2Mock.mockRejectedValueOnce(fallbackErr);

    await processor({
      id: "batch-1-f1",
      timestamp: 1_000,
      processedOn: 2_000,
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: vi.fn(),
      data: {
        kind: "batch-child",
        jobId: "batch-1-f1",
        parentId: "batch-1",
        totalFiles: 2,
        toolId: "upscale",
        userId: null,
        pool: "ai",
        inputRefs: ["uploads/batch-1-f1/blob"],
        filename: "frame.tiff",
        settings: { scale: 2 },
      },
    });

    expect(reportErrorMock).toHaveBeenCalledWith(fallbackErr, {
      source: "worker",
      pool: "ai",
      toolId: "upscale",
      jobId: "batch-1-f1",
      inputFormat: "tiff",
      settings: { scale: 2 },
      jobAgeMs: 1_000,
    });
  });

  it("logs and reports when a predecessor pipeline step row is missing or completed without outputRefs (#3954)", async () => {
    // 1. Missing predecessor row (!prevRow)
    const {
      processor: pMissing,
      processV2Mock: v2Missing,
      reportErrorMock: reportMissing,
      logger: loggerMissing,
    } = await setupProcessor(undefined);

    const missingRes = await pMissing({
      id: "pipe-miss-s1",
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: vi.fn(),
      data: {
        kind: "pipeline-step",
        jobId: "pipe-miss-s1",
        prevJobId: "pipe-miss-s0",
        stepIndex: 1,
        totalSteps: 2,
        toolId: "resize",
        userId: null,
        pool: "image",
        inputRefs: [],
        filename: "photo.jpg",
        settings: {},
      },
    });

    expect(missingRes).toMatchObject({
      resultPayload: { failed: true, error: "Previous step has no output" },
    });
    expect(v2Missing).not.toHaveBeenCalled();
    expect(loggerMissing.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        jobId: "pipe-miss-s1",
        prevJobId: "pipe-miss-s0",
      }),
      expect.any(String),
    );
    expect(reportMissing).toHaveBeenCalledTimes(1);
    expect(reportMissing).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Previous step has no output" }),
      {
        source: "worker",
        pool: "image",
        toolId: "resize",
        jobId: "pipe-miss-s1",
      },
    );

    // 2. Completed predecessor row with empty outputRefs
    const {
      processor: pEmpty,
      processV2Mock: v2Empty,
      reportErrorMock: reportEmpty,
      logger: loggerEmpty,
    } = await setupProcessor({
      status: "completed",
      outputRefs: [],
      error: null,
    });

    const emptyRes = await pEmpty({
      id: "pipe-empty-s1",
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: vi.fn(),
      data: {
        kind: "pipeline-step",
        jobId: "pipe-empty-s1",
        prevJobId: "pipe-empty-s0",
        stepIndex: 1,
        totalSteps: 2,
        toolId: "resize",
        userId: null,
        pool: "image",
        inputRefs: [],
        filename: "photo.jpg",
        settings: {},
      },
    });

    expect(emptyRes).toMatchObject({
      resultPayload: { failed: true, error: "Previous step has no output" },
    });
    expect(v2Empty).not.toHaveBeenCalled();
    expect(loggerEmpty.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        jobId: "pipe-empty-s1",
        prevJobId: "pipe-empty-s0",
      }),
      expect.any(String),
    );
    expect(reportEmpty).toHaveBeenCalledTimes(1);
    expect(reportEmpty).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Previous step has no output" }),
      {
        source: "worker",
        pool: "image",
        toolId: "resize",
        jobId: "pipe-empty-s1",
      },
    );

    // 3. Canceled predecessor row does not report
    const {
      processor: pCanceled,
      processV2Mock: v2Canceled,
      reportErrorMock: reportCanceled,
    } = await setupProcessor({
      status: "canceled",
      outputRefs: [],
      error: { message: "Canceled" },
    });

    await pCanceled({
      id: "pipe-cancel-s1",
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: vi.fn(),
      data: {
        kind: "pipeline-step",
        jobId: "pipe-cancel-s1",
        prevJobId: "pipe-cancel-s0",
        stepIndex: 1,
        totalSteps: 2,
        toolId: "resize",
        userId: null,
        pool: "image",
        inputRefs: [],
        filename: "photo.jpg",
        settings: {},
      },
    });

    expect(v2Canceled).not.toHaveBeenCalled();
    expect(reportCanceled).not.toHaveBeenCalled();
  });

  it("logs and reports when a step or child row is missing during pipeline-finalize or batch-finalize (#3954)", async () => {
    const reportErrorMock = vi.fn();
    const updateSingleFileProgressAtomicallyMock = vi.fn().mockResolvedValue(undefined);
    const failBatchJobMock = vi.fn().mockResolvedValue(true);

    const workerMod = await loadWorker("", () => {
      vi.doMock("../../../../apps/api/src/db/index.js", () => ({
        db: {
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(async () => []),
            })),
          })),
          update: vi.fn(() => ({
            set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
          })),
        },
        schema: { jobs: { id: "jobs.id" } },
      }));
      vi.doMock("../../../../apps/api/src/lib/error-report.js", () => ({
        classifyError: vi.fn(() => "bug"),
        reportError: reportErrorMock,
        safeFormatTag: vi.fn(),
      }));
      vi.doMock("../../../../apps/api/src/jobs/batch-progress.js", () => ({
        isBatchCanceled: vi.fn(async () => false),
        readBatchCounters: vi.fn(async () => ({ done: 0, failed: 0, errors: [] })),
        recordChildOutcome: vi.fn(),
      }));
      vi.doMock("../../../../apps/api/src/routes/progress.js", () => ({
        cancelBatchJob: vi.fn(),
        cancelSingleJobGuarded: vi.fn(),
        completeBatchJob: vi.fn(),
        failBatchJob: failBatchJobMock,
        failSingleJobGuarded: vi.fn(),
        publishEphemeral: vi.fn(),
        updateSingleFileProgress: vi.fn(),
        updateSingleFileProgressAtomically: updateSingleFileProgressAtomicallyMock,
      }));
      vi.doMock("@snapotter/media-engine", () => ({
        HW_ACCEL_FAMILIES: [],
        hwAccelStatus: vi.fn(() => ({ requested: undefined })),
        softwareEncoderStatus: vi.fn(() => ({ missing: [], probeError: undefined })),
      }));
      vi.doMock("../../../../apps/api/src/lib/binary-overrides.js", () => ({
        binaryOverrideWarning: vi.fn(),
        checkBinaryOverrides: vi.fn(() => []),
        isBinarySpawnFailure,
        probeFailureLevel: vi.fn(() => "warn"),
      }));
    });

    const { Worker } = await import("bullmq");
    const { logger } = await import("../../../../apps/api/src/lib/logger.js");
    workerMod.startWorkers();
    const workerCalls = (Worker as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const imageCall = workerCalls.find(([queue]) => String(queue).endsWith("image"));
    const systemCall = workerCalls.find(([queue]) => String(queue).endsWith("system"));
    if (!imageCall || !systemCall) throw new Error("workers not registered");
    const imageProcessor = imageCall[1] as (job: unknown) => Promise<unknown>;
    const systemProcessor = systemCall[1] as (job: unknown) => Promise<unknown>;

    // 1. processPipelineFinalize with missing step row
    const pfRes = await imageProcessor({
      id: "pf-missing",
      name: "pipeline-finalize",
      data: {
        kind: "pipeline-finalize",
        jobId: "pf-missing",
        toolId: "pipeline",
        userId: null,
        pool: "image",
        totalSteps: 1,
        inputRefs: [],
        filename: "chain.png",
        settings: {},
      },
    });

    expect(pfRes).toMatchObject({
      resultPayload: {
        error: "Step 1: Step 1 row not found",
        stepsCompleted: 0,
        steps: [],
      },
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        jobId: "pf-missing",
        stepId: "pf-missing-s0",
      }),
      expect.any(String),
    );
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Step 1 row not found" }),
      {
        source: "worker",
        pool: "image",
        toolId: "pipeline",
        jobId: "pf-missing",
      },
    );

    // 2. processBatchFinalize with missing child row
    reportErrorMock.mockClear();
    (logger.error as ReturnType<typeof vi.fn>).mockClear();

    const bfRes = (await systemProcessor({
      id: "bf-missing",
      name: "batch-finalize",
      data: {
        kind: "batch-finalize",
        jobId: "bf-missing",
        toolId: "resize",
        userId: null,
        pool: "system",
        totalFiles: 1,
        inputRefs: [],
        filename: "",
        settings: { flowChildCount: 1 },
      },
    })) as { resultPayload?: { manifest?: unknown } };

    expect(bfRes.resultPayload?.manifest).toEqual([
      { index: 0, filename: "file-0", error: "Child job row not found" },
    ]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        jobId: "bf-missing",
        childId: "bf-missing-f0",
      }),
      expect.any(String),
    );
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Child job row not found" }),
      {
        source: "worker",
        pool: "system",
        toolId: "resize",
        jobId: "bf-missing",
      },
    );
  });

  it("logs and reports completed batch children without outputRefs and missing fallback step rows (#3959)", async () => {
    const reportErrorMock = vi.fn();
    const failBatchJobMock = vi.fn().mockResolvedValue(true);
    const completeBatchJobMock = vi.fn().mockResolvedValue(undefined);
    const rowsById: Record<string, Record<string, unknown> | undefined> = {
      "bf-empty-out-f0": {
        id: "bf-empty-out-f0",
        type: "batch-child",
        status: "completed",
        inputRefs: ["uploads/bf-empty-out-f0/a.png"],
        outputRefs: [],
        error: null,
      },
      "bf-pipe-empty-f0": {
        id: "bf-pipe-empty-f0",
        type: "pipeline-finalize",
        status: "completed",
        inputRefs: ["uploads/bf-pipe-empty-f0-s0/b.pdf"],
        outputRefs: [],
        settings: { stepCount: 1 },
        error: null,
      },
      "bf-pipe-empty-f0-s0": {
        id: "bf-pipe-empty-f0-s0",
        type: "pipeline-step",
        status: "completed",
        inputRefs: ["uploads/bf-pipe-empty-f0-s0/b.pdf"],
        outputRefs: ["outputs/bf-pipe-empty-f0-s0/b.pdf"],
        error: null,
      },
      "bf-pipe-miss-step-f0": {
        id: "bf-pipe-miss-step-f0",
        type: "pipeline-finalize",
        status: "queued",
        inputRefs: ["uploads/bf-pipe-miss-step-f0-s0/c.pdf"],
        outputRefs: [],
        settings: { stepCount: 2 },
        error: null,
      },
      "bf-pipe-miss-step-f0-s0": {
        id: "bf-pipe-miss-step-f0-s0",
        type: "pipeline-step",
        status: "completed",
        inputRefs: ["uploads/bf-pipe-miss-step-f0-s0/c.pdf"],
        outputRefs: ["outputs/bf-pipe-miss-step-f0-s0/c.pdf"],
        error: null,
      },
      "bf-pipe-already-failed-f0": {
        id: "bf-pipe-already-failed-f0",
        type: "pipeline-finalize",
        status: "failed",
        inputRefs: ["uploads/bf-pipe-already-failed-f0-s0/d.pdf"],
        outputRefs: [],
        settings: { stepCount: 1 },
        error: { message: "Step 1: Step 1 row not found" },
      },
    };

    const workerMod = await loadWorker("", () => {
      vi.doMock("../../../../apps/api/src/db/index.js", () => ({
        db: {
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(async (cond: { val?: string }) => {
                const row = cond?.val ? rowsById[cond.val] : undefined;
                return row ? [row] : [];
              }),
            })),
          })),
        },
        schema: { jobs: { id: "jobs.id" } },
      }));
      vi.doMock("../../../../apps/api/src/lib/error-report.js", () => ({
        classifyError: vi.fn(() => "bug"),
        reportError: reportErrorMock,
        safeFormatTag: vi.fn(),
      }));
      vi.doMock("../../../../apps/api/src/jobs/batch-progress.js", () => ({
        isBatchCanceled: vi.fn(async () => false),
        readBatchCounters: vi.fn(async () => ({ done: 0, failed: 0, errors: [] })),
        recordChildOutcome: vi.fn(),
      }));
      vi.doMock("../../../../apps/api/src/routes/progress.js", () => ({
        cancelBatchJob: vi.fn(),
        cancelSingleJobGuarded: vi.fn(),
        completeBatchJob: completeBatchJobMock,
        failBatchJob: failBatchJobMock,
        failSingleJobGuarded: vi.fn(),
        publishEphemeral: vi.fn(),
        updateSingleFileProgress: vi.fn(),
        updateSingleFileProgressAtomically: vi.fn(),
      }));
      vi.doMock("@snapotter/media-engine", () => ({
        HW_ACCEL_FAMILIES: [],
        hwAccelStatus: vi.fn(() => ({ requested: undefined })),
        softwareEncoderStatus: vi.fn(() => ({ missing: [], probeError: undefined })),
      }));
      vi.doMock("../../../../apps/api/src/lib/binary-overrides.js", () => ({
        binaryOverrideWarning: vi.fn(),
        checkBinaryOverrides: vi.fn(() => []),
        isBinarySpawnFailure,
        probeFailureLevel: vi.fn(() => "warn"),
      }));
    });

    const { Worker } = await import("bullmq");
    const { logger } = await import("../../../../apps/api/src/lib/logger.js");
    workerMod.startWorkers();
    const workerCalls = (Worker as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const systemCall = workerCalls.find(([queue]) => String(queue).endsWith("system"));
    if (!systemCall) throw new Error("system worker not registered");
    const systemProcessor = systemCall[1] as (job: unknown) => Promise<unknown>;

    // 1. Completed batch-child row with empty outputRefs
    const res1 = (await systemProcessor({
      id: "bf-empty-out",
      name: "batch-finalize",
      data: {
        kind: "batch-finalize",
        jobId: "bf-empty-out",
        toolId: "resize",
        userId: null,
        pool: "system",
        totalFiles: 1,
        inputRefs: [],
        filename: "",
        settings: { flowChildCount: 1 },
      },
    })) as { resultPayload?: { manifest?: unknown } };

    expect(res1.resultPayload?.manifest).toEqual([
      { index: 0, filename: "a.png", error: "Processing failed" },
    ]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        jobId: "bf-empty-out",
        childId: "bf-empty-out-f0",
      }),
      expect.any(String),
    );
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Completed child job has no output" }),
      {
        source: "worker",
        pool: "system",
        toolId: "resize",
        jobId: "bf-empty-out",
      },
    );

    // 2. Completed pipeline-finalize child row with empty outputRefs and no recovered completedOutputRef
    reportErrorMock.mockClear();
    (logger.error as ReturnType<typeof vi.fn>).mockClear();
    objectStorageMocks.getObjectSize.mockRejectedValueOnce(gone("b.pdf"));
    objectStorageMocks.verifyS3Bucket.mockResolvedValueOnce(undefined);

    const res2 = (await systemProcessor({
      id: "bf-pipe-empty",
      name: "batch-finalize",
      data: {
        kind: "batch-finalize",
        jobId: "bf-pipe-empty",
        toolId: "pipeline-batch",
        userId: null,
        pool: "system",
        totalFiles: 1,
        inputRefs: [],
        filename: "",
        settings: { flowChildCount: 1, stepCount: 1 },
      },
    })) as { resultPayload?: { manifest?: unknown } };

    expect(res2.resultPayload?.manifest).toEqual([
      { index: 0, filename: "b.pdf", error: "Processing failed" },
    ]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        jobId: "bf-pipe-empty",
        childId: "bf-pipe-empty-f0",
      }),
      expect.any(String),
    );
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Completed child job has no output" }),
      {
        source: "worker",
        pool: "system",
        toolId: "pipeline-batch",
        jobId: "bf-pipe-empty",
      },
    );

    // 3. Non-completed pipeline-finalize child row with error === null and a missing step row
    reportErrorMock.mockClear();
    (logger.error as ReturnType<typeof vi.fn>).mockClear();

    const res3 = (await systemProcessor({
      id: "bf-pipe-miss-step",
      name: "batch-finalize",
      data: {
        kind: "batch-finalize",
        jobId: "bf-pipe-miss-step",
        toolId: "pipeline-batch",
        userId: null,
        pool: "system",
        totalFiles: 1,
        inputRefs: [],
        filename: "",
        settings: { flowChildCount: 1, stepCount: 2 },
      },
    })) as { resultPayload?: { manifest?: unknown } };

    expect(res3.resultPayload?.manifest).toEqual([
      { index: 0, filename: "c.pdf", error: "Step 2: Step 2 row not found" },
    ]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        jobId: "bf-pipe-miss-step",
        childId: "bf-pipe-miss-step-f0",
        stepId: "bf-pipe-miss-step-f0-s1",
      }),
      expect.any(String),
    );
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Step 2 row not found" }),
      {
        source: "worker",
        pool: "system",
        toolId: "pipeline-batch",
        jobId: "bf-pipe-miss-step",
      },
    );

    // 4. Already-failed pipeline-finalize child row does not re-report
    reportErrorMock.mockClear();
    (logger.error as ReturnType<typeof vi.fn>).mockClear();

    await systemProcessor({
      id: "bf-pipe-already-failed",
      name: "batch-finalize",
      data: {
        kind: "batch-finalize",
        jobId: "bf-pipe-already-failed",
        toolId: "pipeline-batch",
        userId: null,
        pool: "system",
        totalFiles: 1,
        inputRefs: [],
        filename: "",
        settings: { flowChildCount: 1, stepCount: 1 },
      },
    });

    expect(reportErrorMock).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("records the canceled batch child outcome before writing the canceled row or incrementing jobsTotal so a failing skip does not transiently cancel or double-count (#1347)", async () => {
    const callOrder: string[] = [];
    const dbUpdateSetMock = vi.fn((vals: Record<string, unknown>) => {
      callOrder.push(`db.update:${String(vals.status)}`);
      return {
        where: vi.fn().mockResolvedValue(undefined),
      };
    });
    const recordChildOutcomeMock = vi.fn(
      async (_parentId: string, _totalFiles: number, _filename: string, error?: string) => {
        callOrder.push(`recordChildOutcome:${error ?? "done"}`);
        if (error === "Canceled" && failSkipRecord) {
          throw new Error("injected outcome-recording outage");
        }
      },
    );
    let failSkipRecord = true;

    const workerMod = await loadWorker("", () => {
      vi.doMock("node:fs/promises", () => ({
        mkdir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn(),
        rm: vi.fn().mockResolvedValue(undefined),
      }));
      vi.doMock("../../../../apps/api/src/db/index.js", () => ({
        db: {
          update: vi.fn(() => ({
            set: dbUpdateSetMock,
          })),
        },
        schema: {
          jobs: {
            id: "jobs.id",
            status: "jobs.status",
          },
        },
      }));
      vi.doMock("../../../../apps/api/src/routes/tool-factory.js", () => ({
        getToolConfig: vi.fn(() => ({
          processV2: vi.fn().mockResolvedValue({
            buffer: Buffer.from("out-bytes"),
            filename: "fallthrough.png",
            contentType: "image/png",
          }),
        })),
      }));
      vi.doMock("../../../../apps/api/src/jobs/ai-handlers.js", () => ({
        hasAiJobHandler: vi.fn(() => false),
        hasAiPathJobHandler: vi.fn(() => false),
        runAiToolJob: vi.fn(),
        runAiPathToolJob: vi.fn(),
      }));
      vi.doMock("../../../../apps/api/src/jobs/batch-progress.js", () => ({
        isBatchCanceled: vi.fn(async () => true),
        recordChildOutcome: recordChildOutcomeMock,
      }));
      vi.doMock("../../../../apps/api/src/jobs/postprocess.js", () => ({
        autoSaveToLibrary: vi.fn(),
        buildOutputName: vi.fn(() => "fallthrough_resize.png"),
        generatePreview: vi.fn().mockResolvedValue(undefined),
        stageAutoSaveToLibrary: vi.fn().mockResolvedValue({}),
      }));
      vi.doMock("@snapotter/media-engine", () => ({
        HW_ACCEL_FAMILIES: [],
        hwAccelStatus: vi.fn(() => ({ requested: undefined })),
        softwareEncoderStatus: vi.fn(() => ({ missing: [], probeError: undefined })),
      }));
      vi.doMock("../../../../apps/api/src/lib/binary-overrides.js", () => ({
        binaryOverrideWarning: vi.fn(),
        checkBinaryOverrides: vi.fn(() => []),
        isBinarySpawnFailure,
        probeFailureLevel: vi.fn(() => "warn"),
      }));
    });

    objectStorageMocks.getObjectBuffer.mockResolvedValue(Buffer.from("input-bytes"));
    objectStorageMocks.putObject.mockResolvedValue(undefined);

    const { Worker } = await import("bullmq");
    const { jobsTotal } = await import("../../../../apps/api/src/lib/metrics.js");
    const { logger } = await import("../../../../apps/api/src/lib/logger.js");
    const jobsTotalIncMock = jobsTotal.inc as ReturnType<typeof vi.fn>;
    workerMod.startWorkers();
    const workerCalls = (Worker as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const imageCall = workerCalls.find(([queue]) => String(queue).endsWith("image"));
    if (!imageCall) throw new Error("image pool worker not registered");
    const processor = imageCall[1] as (job: unknown) => Promise<unknown>;

    // 1. Skip outcome recording throws: falls through to normal processing
    // without ever setting status="canceled" or incrementing jobsTotal{status:"canceled"}.
    const fallthroughResult = await processor({
      id: "batch-skip-fault-f0",
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: vi.fn(),
      data: {
        kind: "batch-child",
        jobId: "batch-skip-fault-f0",
        parentId: "batch-skip-fault",
        totalFiles: 1,
        toolId: "resize",
        userId: null,
        pool: "image",
        inputRefs: ["uploads/batch-skip-fault-f0/fallthrough.png"],
        filename: "fallthrough.png",
        settings: {},
      },
    });

    expect(fallthroughResult).toMatchObject({
      outputRefs: ["outputs/batch-skip-fault-f0/fallthrough_resize.png"],
      filename: "fallthrough_resize.png",
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "batch-skip-fault-f0",
        parentId: "batch-skip-fault",
      }),
      "batch cancel skip failed; processing the child normally",
    );
    expect(callOrder).toEqual([
      "recordChildOutcome:Canceled",
      "db.update:processing",
      "db.update:completed",
      "recordChildOutcome:done",
    ]);
    expect(jobsTotalIncMock.mock.calls).toEqual([[{ pool: "image", status: "completed" }]]);

    // 2. Skip outcome recording succeeds: records outcome first, then updates row to canceled.
    callOrder.length = 0;
    jobsTotalIncMock.mockClear();
    failSkipRecord = false;

    const skippedResult = await processor({
      id: "batch-skip-ok-f0",
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: vi.fn(),
      data: {
        kind: "batch-child",
        jobId: "batch-skip-ok-f0",
        parentId: "batch-skip-ok",
        totalFiles: 1,
        toolId: "resize",
        userId: null,
        pool: "image",
        inputRefs: ["uploads/batch-skip-ok-f0/skipme.png"],
        filename: "skipme.png",
        settings: {},
      },
    });

    expect(skippedResult).toMatchObject({
      outputRefs: [],
      filename: "skipme.png",
      resultPayload: { failed: true, canceled: true, error: "Canceled" },
    });
    expect(callOrder).toEqual(["recordChildOutcome:Canceled", "db.update:canceled"]);
    expect(jobsTotalIncMock.mock.calls).toEqual([[{ pool: "image", status: "canceled" }]]);
  });
});
