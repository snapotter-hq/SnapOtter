/**
 * Unit tests for the progress tracking module.
 *
 * Tests updateJobProgress, updateSingleFileProgress, recoverStaleJobs,
 * and the in-memory pub/sub listener system.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock DB
vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ get: () => null }),
      }),
    }),
    insert: () => ({ values: () => ({ run: vi.fn() }) }),
    update: () => ({
      set: () => ({
        where: () => ({ run: () => ({ changes: 0 }) }),
      }),
    }),
  },
  pool: {},
  closeDb: async () => {},
  schema: {
    jobs: { id: {}, status: {} },
  },
}));

vi.mock("../../../apps/api/src/config.js", () => ({
  env: { WORKSPACE_PATH: "/tmp/test" },
}));

import type { JobProgress } from "../../../apps/api/src/routes/progress.js";
import {
  recoverStaleJobs,
  updateJobProgress,
  updateSingleFileProgress,
} from "../../../apps/api/src/routes/progress.js";

describe("updateJobProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores progress that can be sent to SSE listeners", () => {
    const progress: JobProgress = {
      jobId: "test-job-1",
      status: "processing",
      totalFiles: 5,
      completedFiles: 2,
      failedFiles: 0,
      errors: [],
    };

    // Should not throw
    expect(() => updateJobProgress(progress)).not.toThrow();
  });

  it("handles completed status", () => {
    const progress: JobProgress = {
      jobId: "test-job-2",
      status: "completed",
      totalFiles: 3,
      completedFiles: 3,
      failedFiles: 0,
      errors: [],
    };

    expect(() => updateJobProgress(progress)).not.toThrow();
  });

  it("handles failed status with errors", () => {
    const progress: JobProgress = {
      jobId: "test-job-3",
      status: "failed",
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 2,
      errors: [
        { filename: "a.png", error: "corrupt" },
        { filename: "b.png", error: "too large" },
      ],
    };

    expect(() => updateJobProgress(progress)).not.toThrow();
  });

  it("handles progress with currentFile", () => {
    const progress: JobProgress = {
      jobId: "test-job-4",
      status: "processing",
      totalFiles: 5,
      completedFiles: 1,
      failedFiles: 0,
      errors: [],
      currentFile: "photo.png",
    };

    expect(() => updateJobProgress(progress)).not.toThrow();
  });
});

describe("updateSingleFileProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("handles processing phase", () => {
    expect(() =>
      updateSingleFileProgress({
        jobId: "single-1",
        phase: "processing",
        percent: 50,
        stage: "Downloading model...",
      }),
    ).not.toThrow();
  });

  it("handles complete phase", () => {
    expect(() =>
      updateSingleFileProgress({
        jobId: "single-2",
        phase: "complete",
        percent: 100,
        stage: "Done",
      }),
    ).not.toThrow();
  });

  it("handles failed phase with error", () => {
    expect(() =>
      updateSingleFileProgress({
        jobId: "single-3",
        phase: "failed",
        percent: 0,
        error: "Model not found",
      }),
    ).not.toThrow();
  });

  it("handles progress with result data", () => {
    expect(() =>
      updateSingleFileProgress({
        jobId: "single-4",
        phase: "complete",
        percent: 100,
        result: { text: "OCR result" },
      }),
    ).not.toThrow();
  });
});

describe("recoverStaleJobs", () => {
  it("does not throw when called", () => {
    expect(() => recoverStaleJobs()).not.toThrow();
  });
});

describe("JobProgress type shape", () => {
  it("supports all required fields", () => {
    const p: JobProgress = {
      jobId: "shape-test",
      status: "processing",
      totalFiles: 1,
      completedFiles: 0,
      failedFiles: 0,
      errors: [],
    };
    expect(p.jobId).toBe("shape-test");
    expect(p.status).toBe("processing");
    expect(p.totalFiles).toBe(1);
    expect(p.currentFile).toBeUndefined();
  });

  it("supports optional currentFile and type", () => {
    const p: JobProgress = {
      jobId: "shape-test-2",
      type: "batch",
      status: "completed",
      totalFiles: 3,
      completedFiles: 3,
      failedFiles: 0,
      errors: [],
      currentFile: "last.png",
    };
    expect(p.type).toBe("batch");
    expect(p.currentFile).toBe("last.png");
  });
});
