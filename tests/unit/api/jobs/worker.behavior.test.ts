import { afterEach, describe, expect, it, vi } from "vitest";

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
    getObjectBuffer: vi.fn(),
    putObject: vi.fn(),
  }));

  vi.doMock("../../../../apps/api/src/routes/progress.js", () => ({
    publishEphemeral: vi.fn(),
    updateSingleFileProgress: vi.fn(),
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
    vi.restoreAllMocks();
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
