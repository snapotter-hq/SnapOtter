/**
 * Cancel's best-effort fault paths (#4177): a failed cancel publish, a failed
 * reverse alias settle, and the cancel subscriber's connection errors. Each is
 * swallowed so the cancel still answers, so the logger is the only place the
 * fault shows up; console output never reaches the support bundle.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  publishError: null as Error | null,
  selectRows: [] as Array<Record<string, unknown> | Error>,
  queueState: null as string | null,
  subscriber: { on: vi.fn(), subscribe: vi.fn(async () => 1) },
}));

const loggerMock = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("../../../../apps/api/src/lib/logger.js", () => ({ logger: loggerMock }));

vi.mock("../../../../apps/api/src/db/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../apps/api/src/db/index.js")>();
  return {
    ...actual,
    db: {
      select: () => ({
        from: () => ({
          where: async () => {
            const next = stubs.selectRows.shift();
            if (next instanceof Error) throw next;
            return next ? [next] : [];
          },
        }),
      }),
      update: () => ({ set: () => ({ where: async () => ({ rowCount: 1 }) }) }),
    },
  };
});

vi.mock("../../../../apps/api/src/routes/progress.js", () => ({
  cancelSingleJobGuarded: vi.fn(),
}));

vi.mock("../../../../apps/api/src/jobs/batch-progress.js", () => ({
  markBatchCanceled: vi.fn(async () => {}),
}));

vi.mock("../../../../apps/api/src/jobs/connection.js", () => ({
  createRedisSubscriberConnection: vi.fn(() => stubs.subscriber),
  sharedRedis: () => ({
    publish: async () => {
      if (stubs.publishError) throw stubs.publishError;
      return 1;
    },
  }),
}));

vi.mock("../../../../apps/api/src/jobs/queues.js", () => ({
  getQueue: (pool: string) => ({
    getJob: async () =>
      pool === "image" && stubs.queueState
        ? { getState: async () => stubs.queueState, remove: async () => {} }
        : undefined,
  }),
}));

const { requestCancel, startCancelListener } = await import(
  "../../../../apps/api/src/jobs/cancel.js"
);
const { createRedisSubscriberConnection } = await import(
  "../../../../apps/api/src/jobs/connection.js"
);

describe("cancel fault logging (#4177)", () => {
  beforeEach(() => {
    stubs.publishError = null;
    stubs.selectRows.length = 0;
    stubs.queueState = null;
    loggerMock.error.mockClear();
    loggerMock.warn.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs a failed cancel publish with the job id and still answers the cancel", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("redis publish down");
    stubs.publishError = err;
    stubs.selectRows.push({
      type: "batch",
      toolId: "resize",
      status: "processing",
      settings: { flowChildCount: 1 },
    });

    await expect(requestCancel("batch-1")).resolves.toBe(true);

    expect(loggerMock.warn).toHaveBeenCalledWith(
      { err, jobId: "batch-1-f0" },
      "cancel publish failed",
    );
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("logs a failed reverse alias settle with the job id and keeps the committed cancel", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("alias lookup failed");
    stubs.queueState = "waiting";
    // First select: no jobs row for the id, so the queue scan runs. Second:
    // the reverse alias lookup, which faults.
    stubs.selectRows.push(undefined as never, err);

    await expect(requestCancel("server-job")).resolves.toBe(true);

    expect(loggerMock.warn).toHaveBeenCalledWith(
      { err, jobId: "server-job" },
      "reverse alias settle failed",
    );
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("leaves subscriber connection errors to the shared Redis listener", async () => {
    stubs.subscriber.on.mockClear();

    await startCancelListener();

    // createRedisSubscriberConnection already logs every connection error
    // through the logger; a second listener here would double each line.
    const events = stubs.subscriber.on.mock.calls.map(([event]) => event);
    expect(events).toContain("message");
    expect(events).not.toContain("error");
    // The shared listener labels its lines with this name (#4552).
    expect(createRedisSubscriberConnection).toHaveBeenCalledWith("cancel");
  });
});
