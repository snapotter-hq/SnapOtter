import { afterEach, describe, expect, it, vi } from "vitest";

const objectStorageMocks = vi.hoisted(() => ({
  copyObjectToFile: vi.fn(),
  getObjectBuffer: vi.fn(),
  getObjectSize: vi.fn(),
  putObject: vi.fn(),
}));

async function loadWorker() {
  vi.resetModules();

  vi.doMock("node:fs/promises", () => ({
    mkdir: vi.fn(),
    readFile: vi.fn(),
    rm: vi.fn(),
  }));

  vi.doMock("@snapotter/shared", () => ({
    ANALYTICS_EVENTS: {},
    TOOLS: [],
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

  it("builds legacy download, preview, saved-file, and tool payload fields", async () => {
    const { buildLegacyResultPayload } = await loadWorker();

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
  });

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
