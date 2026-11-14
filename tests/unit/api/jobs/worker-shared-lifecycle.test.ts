import { isSafeMessageError } from "@snapotter/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  reportError: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("../../../../apps/api/src/lib/error-report.js", () => ({
  reportError: h.reportError,
  safeFormatTag: vi.fn(() => undefined),
}));
vi.mock("../../../../apps/api/src/lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: h.warn },
}));

const { createJobProgressSink, reportToolJobFailure } = await import(
  "../../../../apps/api/src/jobs/worker-shared.js"
);

class UnrecoverableError extends Error {
  name = "UnrecoverableError";
}

function missingKey(id: string): Error {
  return new Error(`Missing key for job ${id}. updateProgress`);
}

/** Let every queued .catch handler run. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createJobProgressSink (#4658, Sentry NODE-AT)", () => {
  it("forwards progress to the BullMQ job", async () => {
    const job = { id: "job-1", updateProgress: vi.fn().mockResolvedValue(undefined) };
    const sink = createJobProgressSink(job, "convert-video");
    sink({ percent: 10, stage: "encode" });
    sink({ percent: 20 });
    await flush();
    expect(job.updateProgress).toHaveBeenNthCalledWith(1, { percent: 10, stage: "encode" });
    expect(job.updateProgress).toHaveBeenNthCalledWith(2, { percent: 20 });
    expect(h.warn).not.toHaveBeenCalled();
  });

  it("swallows a rejected write, logs it once, and stops writing for the attempt", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const job = { id: "job-1", updateProgress: vi.fn().mockRejectedValue(missingKey("job-1")) };
      const sink = createJobProgressSink(job, "convert-video");
      // Two ticks land before the first rejection settles, as a fast tool's do.
      sink({ percent: 1 });
      sink({ percent: 2 });
      await flush();
      sink({ percent: 3 });
      sink({ percent: 4 });
      await flush();

      expect(job.updateProgress).toHaveBeenCalledTimes(2);
      expect(h.warn).toHaveBeenCalledTimes(1);
      expect(h.warn.mock.calls[0][0]).toMatchObject({ jobId: "job-1", toolId: "convert-video" });
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});

describe("reportToolJobFailure names BullMQ stall failures (#4658, Sentry NODE-4J)", () => {
  const job = {
    id: "job-9",
    timestamp: 1_000,
    processedOn: 2_000,
    data: {
      jobId: "job-9",
      toolId: "remove-background",
      pool: "ai",
      inputRefs: ["uploads/job-9/in.png"],
      filename: "in.png",
      settings: {},
      kind: "ai-tool",
    },
  };

  it.each(["job stalled more than allowable limit", "job started more than allowable limit"])(
    "reports BullMQ's own %j as an operational JOB_STALLED SafeError",
    (message) => {
      const stall = new UnrecoverableError(message);
      reportToolJobFailure(job as never, stall);

      expect(h.reportError).toHaveBeenCalledTimes(1);
      const reported = h.reportError.mock.calls[0][0];
      expect(isSafeMessageError(reported)).toBe(true);
      expect(reported).toMatchObject({ code: "JOB_STALLED", kind: "operational" });
      expect(reported.message).not.toContain("job-9");
      expect((reported as Error).cause).toBe(stall);
      expect(h.reportError.mock.calls[0][1]).toMatchObject({
        source: "worker",
        pool: "ai",
        toolId: "remove-background",
        jobId: "job-9",
      });
    },
  );

  it("still unwraps an UnrecoverableError we threw around a real cause", () => {
    const cause = new Error("decoder blew up");
    const wrapped = Object.assign(new UnrecoverableError("decoder blew up"), { cause });
    reportToolJobFailure(job as never, wrapped);
    expect(h.reportError.mock.calls[0][0]).toBe(cause);
  });

  it("leaves any other cause-less UnrecoverableError as it is", () => {
    const other = new UnrecoverableError("Canceled");
    reportToolJobFailure(job as never, other);
    expect(h.reportError.mock.calls[0][0]).toBe(other);
  });
});
