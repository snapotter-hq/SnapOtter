import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolJobData } from "../../../../apps/api/src/jobs/types.js";

const insertedValues = vi.hoisted(() => vi.fn());
const onConflictDoNothingMock = vi.hoisted(() => vi.fn());
const onConflictDoUpdateMock = vi.hoisted(() => vi.fn());
const queueAdd = vi.hoisted(() => vi.fn());
const getJob = vi.hoisted(() => vi.fn());
const queueEventClose = vi.hoisted(() => vi.fn());
const queueEventRun = vi.hoisted(() => vi.fn());
const queueEventOn = vi.hoisted(() => vi.fn());
const queueEventsCtor = vi.hoisted(() => vi.fn());
const flowProducerAdd = vi.hoisted(() => vi.fn());
const flowProducerClose = vi.hoisted(() => vi.fn());
const flowProducerOn = vi.hoisted(() => vi.fn());
const assertAiJobQuotaMock = vi.hoisted(() => vi.fn());
const isFeatureEnabledMock = vi.hoisted(() => vi.fn());
const propagationInjectMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());
const updateSetMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const clearTerminalReplayKeyMock = vi.hoisted(() => vi.fn());

// Chain builder for `db.select(...).from(...).where(...).limit(...)`.
function selectChain<T>(result: T) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(result)),
  };
  return chain;
}

const loggerMock = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }));

async function loadEnqueueModule(
  options: {
    /** Whether the enterprise team_retention_overrides feature is enabled. */
    teamRetentionEnabled?: boolean;
    /** Rows returned by the users-table select in computeDeleteAfter. */
    userRow?: Array<{ team: string | null }>;
    /** Rows returned by the teams-table select in computeDeleteAfter. */
    teamRow?: Array<{ retentionHours: number | null }>;
    /** Carrier populated by the mocked propagation.inject. */
    injectCarrier?: Record<string, string>;
    /** Force the dynamic enterprise import to throw. */
    enterpriseImportThrows?: boolean;
  } = {},
) {
  vi.resetModules();
  insertedValues.mockReset();
  onConflictDoNothingMock.mockReset();
  onConflictDoUpdateMock.mockReset();
  queueAdd.mockReset();
  getJob.mockReset();
  queueEventClose.mockReset();
  flowProducerAdd.mockReset();
  flowProducerClose.mockReset();
  flowProducerOn.mockReset();
  assertAiJobQuotaMock.mockReset();
  isFeatureEnabledMock.mockReset();
  propagationInjectMock.mockReset();
  selectMock.mockReset();
  updateSetMock.mockReset();
  updateMock.mockReset();
  clearTerminalReplayKeyMock.mockReset().mockResolvedValue(undefined);

  queueEventRun.mockReset();
  queueEventOn.mockReset();
  queueEventsCtor.mockReset();

  queueAdd.mockImplementation(async (_name: string, data: unknown) => ({ id: "job-1", data }));
  onConflictDoNothingMock.mockResolvedValue({ rowCount: 1 });
  onConflictDoUpdateMock.mockResolvedValue([{ status: "queued" }]);
  insertedValues.mockImplementation(() => {
    const wrapConflictUpdate = (...args: unknown[]) => {
      const rawPromise = Promise.resolve(onConflictDoUpdateMock(...args)).then((val) => {
        if (Array.isArray(val)) return val;
        const rc = (val as { rowCount?: number } | undefined)?.rowCount ?? 1;
        return rc === 0 ? [] : [{ status: "queued" }];
      });
      return Object.assign(rawPromise, {
        returning: () => rawPromise,
      });
    };
    const p = Promise.resolve(undefined) as Promise<undefined> & {
      onConflictDoNothing: typeof onConflictDoNothingMock;
      onConflictDoUpdate: typeof wrapConflictUpdate;
    };
    p.onConflictDoNothing = onConflictDoNothingMock;
    p.onConflictDoUpdate = wrapConflictUpdate;
    return p;
  });
  queueEventClose.mockResolvedValue(undefined);
  // run() resolves only when the consumer is closing; a never-settling promise
  // is the honest stand-in for a loop that stays up for the process's life.
  queueEventRun.mockReturnValue(new Promise(() => {}));
  flowProducerAdd.mockImplementation(async (flow: unknown) => ({ job: flow }));
  flowProducerClose.mockResolvedValue(undefined);
  assertAiJobQuotaMock.mockResolvedValue(undefined);
  isFeatureEnabledMock.mockReturnValue(options.teamRetentionEnabled ?? false);

  // Default: two sequential selects (users then teams).
  selectMock
    .mockReturnValueOnce(selectChain(options.userRow ?? [{ team: null }]))
    .mockReturnValueOnce(selectChain(options.teamRow ?? [{ retentionHours: null }]));

  const updateWhere = vi.fn(() => Promise.resolve(undefined));
  updateSetMock.mockReturnValue({ where: updateWhere });
  updateMock.mockReturnValue({ set: updateSetMock });

  // The mocked propagation.inject copies the requested carrier keys into the
  // carrier object enqueueToolJob passes in.
  propagationInjectMock.mockImplementation((_ctx: unknown, carrier: Record<string, string>) => {
    const src = options.injectCarrier ?? {};
    for (const [k, v] of Object.entries(src)) carrier[k] = v;
  });

  vi.doMock("bullmq", () => ({
    QueueEvents: vi.fn((name: string, opts: Record<string, unknown>) => {
      queueEventsCtor(name, opts);
      return {
        close: queueEventClose,
        waitUntilReady: vi.fn().mockResolvedValue(undefined),
        run: queueEventRun,
        on: queueEventOn,
      };
    }),
    FlowProducer: vi.fn(() => ({
      add: flowProducerAdd,
      close: flowProducerClose,
      on: flowProducerOn,
    })),
  }));

  vi.doMock("@opentelemetry/api", () => ({
    context: { active: vi.fn(() => ({})) },
    propagation: { inject: propagationInjectMock },
  }));

  vi.doMock("drizzle-orm", () => ({
    and: vi.fn((...args: unknown[]) => ({ and: args })),
    eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
    isNull: vi.fn((a: unknown) => ({ isNull: a })),
    or: vi.fn((...args: unknown[]) => ({ or: args })),
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      sql: [strings, values],
    })),
  }));

  if (options.enterpriseImportThrows) {
    vi.doMock("@snapotter/enterprise", () => {
      throw new Error("enterprise unavailable");
    });
  } else {
    vi.doMock("@snapotter/enterprise", () => ({
      isFeatureEnabled: isFeatureEnabledMock,
    }));
  }

  loggerMock.error.mockClear();
  loggerMock.warn.mockClear();
  vi.doMock("../../../../apps/api/src/lib/logger.js", () => ({ logger: loggerMock }));
  vi.doMock("../../../../apps/api/src/lib/ai-quota.js", () => ({
    assertAiJobQuota: assertAiJobQuotaMock,
  }));

  vi.doMock("../../../../apps/api/src/config.js", () => ({
    env: { SYNC_WAIT_MS: 50, FILE_MAX_AGE_HOURS: 24 },
  }));

  vi.doMock("../../../../apps/api/src/db/index.js", () => ({
    db: {
      insert: vi.fn(() => ({
        values: insertedValues,
      })),
      select: selectMock,
      update: updateMock,
    },
    schema: {
      jobs: {
        id: "jobs.id",
        type: "jobs.type",
        userId: "jobs.userId",
        settings: "jobs.settings",
        createdAt: "jobs.createdAt",
        status: "jobs.status",
        completedAt: "jobs.completedAt",
        error: "jobs.error",
        progress: "jobs.progress",
        deleteAfter: "jobs.deleteAfter",
      },
      users: { id: "users.id", team: "users.team" },
      teams: { id: "teams.id", retentionHours: "teams.retentionHours" },
    },
  }));

  vi.doMock("../../../../apps/api/src/jobs/connection.js", () => ({
    createBullMQConnection: vi.fn(() => ({ mocked: "connection" })),
  }));

  vi.doMock("../../../../apps/api/src/jobs/queues.js", () => ({
    getQueue: vi.fn(() => ({
      add: queueAdd,
      getJob,
    })),
  }));

  vi.doMock("../../../../apps/api/src/routes/progress.js", () => ({
    clearTerminalReplayKey: clearTerminalReplayKeyMock,
  }));

  const mod = await import("../../../../apps/api/src/jobs/enqueue.js");
  return { mod, updateWhere };
}

/**
 * Yield the event loop so the fire-and-forget computeDeleteAfter chain can
 * settle. The chain awaits a dynamic import plus up to three DB calls, so drain
 * a batch of microtasks then a macrotask, twice, to cover import scheduling.
 */
async function flushMicrotasks(): Promise<void> {
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < 12; i++) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("job enqueue helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("strips NUL bytes recursively before persisting settings but keeps queue data intact", async () => {
    const { mod } = await loadEnqueueModule();
    const data = {
      jobId: "job-1",
      userId: null,
      toolId: "tool-a",
      pool: "image",
      kind: "single",
      inputRefs: ["uploads/job-1/input.png"],
      filename: "input.png",
      settings: {
        title: "a\0b",
        nested: { value: "c\0d" },
        list: ["e\0f", 1],
      },
    } as never;

    await mod.enqueueToolJob(data);

    expect(insertedValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "job-1",
        settings: {
          title: "ab",
          nested: { value: "cd" },
          list: ["ef", 1],
        },
      }),
    );
    expect(queueAdd).toHaveBeenCalledWith(
      "tool-a",
      expect.objectContaining({
        settings: {
          title: "a\0b",
          nested: { value: "c\0d" },
          list: ["e\0f", 1],
        },
      }),
      { jobId: "job-1" },
    );
  });

  it("persists redacted dbSettings while enqueueing real settings", async () => {
    const { mod } = await loadEnqueueModule();

    await mod.enqueueToolJob({
      jobId: "job-2",
      userId: null,
      toolId: "ftp-upload",
      pool: "system",
      kind: "single",
      inputRefs: [],
      filename: "file.txt",
      settings: { password: "secret" },
      dbSettings: { password: "[redacted]" },
    } as never);

    expect(insertedValues).toHaveBeenCalledWith(
      expect.objectContaining({ settings: { password: "[redacted]" } }),
    );
    expect(queueAdd).toHaveBeenCalledWith(
      "ftp-upload",
      expect.objectContaining({ settings: { password: "secret" } }),
      { jobId: "job-2" },
    );
  });

  it("waitForJob returns null when the job is missing or the sync window times out", async () => {
    const { mod } = await loadEnqueueModule();

    getJob.mockResolvedValueOnce(undefined);
    await expect(mod.waitForJob("image", "missing")).resolves.toBeNull();

    getJob.mockResolvedValueOnce({
      waitUntilFinished: vi.fn().mockRejectedValue(new Error("job timed out before finishing")),
    });
    await expect(mod.waitForJob("image", "slow", 25)).resolves.toBeNull();
  });

  it("waitForJob rethrows real job failures and tags stripped QueueEvents Errors while leaving Redis and stall faults untagged (#3791)", async () => {
    const { classifyError, isQueueEventsJobFailure } = await import(
      "../../../../apps/api/src/lib/error-report.js"
    );
    const { mod } = await loadEnqueueModule();
    const stripped503 = new Error("The server's storage service is unavailable.");
    getJob.mockResolvedValueOnce({
      waitUntilFinished: vi.fn().mockRejectedValue(stripped503),
    });

    await expect(mod.waitForJob("image", "failed")).rejects.toBe(stripped503);
    expect(isQueueEventsJobFailure(stripped503)).toBe(true);
    expect(classifyError(stripped503, "http")).toBe("expected");

    const stallErr = new Error("Missing lock for job 1 moveToFinished");
    getJob.mockResolvedValueOnce({
      waitUntilFinished: vi.fn().mockRejectedValue(stallErr),
    });
    await expect(mod.waitForJob("image", "stalled")).rejects.toBe(stallErr);
    expect(isQueueEventsJobFailure(stallErr)).toBe(false);
    expect(classifyError(stallErr, "http")).toBe("operational");

    const redisErr = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:6379"), {
      code: "ECONNREFUSED",
    });
    getJob.mockResolvedValueOnce({
      waitUntilFinished: vi.fn().mockRejectedValue(redisErr),
    });
    await expect(mod.waitForJob("image", "redis-down")).rejects.toBe(redisErr);
    expect(isQueueEventsJobFailure(redisErr)).toBe(false);
    expect(classifyError(redisErr, "http")).toBe("operational");

    const redisResetErr = Object.assign(new Error("read ECONNRESET"), {
      code: "ECONNRESET",
      syscall: "read",
    });
    getJob.mockResolvedValueOnce({
      waitUntilFinished: vi.fn().mockRejectedValue(redisResetErr),
    });
    await expect(mod.waitForJob("image", "redis-reset")).rejects.toBe(redisResetErr);
    expect(isQueueEventsJobFailure(redisResetErr)).toBe(false);
    expect(classifyError(redisResetErr, "http")).toBe("operational");

    const getJobResetErr = Object.assign(new Error("read ECONNRESET"), {
      code: "ECONNRESET",
      syscall: "read",
    });
    getJob.mockRejectedValueOnce(getJobResetErr);
    await expect(mod.waitForJob("image", "redis-getjob-reset")).rejects.toBe(getJobResetErr);
    expect(isQueueEventsJobFailure(getJobResetErr)).toBe(false);
    expect(classifyError(getJobResetErr, "http")).toBe("operational");

    const addResetErr = Object.assign(new Error("read ECONNRESET"), {
      code: "ECONNRESET",
      syscall: "read",
    });
    queueAdd.mockRejectedValueOnce(addResetErr);
    await expect(
      mod.enqueueToolJob({
        jobId: "job-add-reset",
        userId: null,
        toolId: "resize",
        pool: "image",
        kind: "single",
        inputRefs: [],
        filename: "file.png",
        settings: {},
      } as never),
    ).rejects.toBe(addResetErr);
    expect(classifyError(addResetErr, "http")).toBe("operational");
  });

  it("waitForJob returns the job result on the success path", async () => {
    const { mod } = await loadEnqueueModule();
    const result = {
      outputRefs: ["outputs/ok/out.png"],
      filename: "out.png",
      contentType: "image/png",
      originalSize: 10,
      processedSize: 8,
    };
    const waitUntilFinished = vi.fn().mockResolvedValue(result);
    getJob.mockResolvedValueOnce({ waitUntilFinished });

    await expect(mod.waitForJob("image", "ok")).resolves.toEqual(result);
    // Uses the pool's queueEvents consumer and the default SYNC_WAIT_MS window.
    expect(waitUntilFinished).toHaveBeenCalledWith(expect.anything(), 50);
  });

  it("waitForJob rethrows non-Error rejections stringified and non-timeout", async () => {
    const { mod } = await loadEnqueueModule();
    getJob.mockResolvedValueOnce({
      waitUntilFinished: vi.fn().mockRejectedValue("kaboom"),
    });

    await expect(mod.waitForJob("image", "weird")).rejects.toBe("kaboom");
  });

  it("closes lazy QueueEvents and FlowProducer singletons", async () => {
    const { mod } = await loadEnqueueModule();

    await mod.warmQueueEvents();
    mod.getFlowProducer();
    getJob.mockResolvedValueOnce(undefined);
    await mod.waitForJob("image", "job-1");

    await mod.closeQueueEvents();
    await mod.closeFlowProducer();

    expect(queueEventClose).toHaveBeenCalled();
    expect(flowProducerClose).toHaveBeenCalledTimes(1);
  });

  it("drives the consumer loop itself rather than relying on BullMQ autorun", async () => {
    const { mod } = await loadEnqueueModule();

    await mod.warmQueueEvents();

    // One consumer per pool, each opted out of autorun and started here.
    expect(queueEventsCtor).toHaveBeenCalledTimes(5);
    expect(queueEventsCtor).toHaveBeenCalledWith(
      expect.stringMatching(/-image$/),
      expect.objectContaining({ autorun: false }),
    );
    expect(queueEventRun).toHaveBeenCalledTimes(5);
    expect(queueEventOn).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("restarts a consumer loop that stops, instead of leaving the pool deaf", async () => {
    vi.useFakeTimers();
    const errors = loggerMock.error;
    try {
      const { mod } = await loadEnqueueModule();
      // BullMQ's autorun would emit 'error' here and never run again, so every
      // later sync request on this pool would burn the whole SYNC_WAIT_MS window.
      queueEventRun
        .mockImplementationOnce(() => Promise.reject(new Error("consumer connection lost")))
        .mockReturnValue(new Promise(() => {}));

      getJob.mockResolvedValueOnce(undefined);
      await mod.waitForJob("image", "job-1");
      await vi.advanceTimersByTimeAsync(1100);

      expect(queueEventRun).toHaveBeenCalledTimes(2);
      expect(errors).toHaveBeenCalledWith(
        { err: expect.any(Error) },
        expect.stringContaining("consumer stopped; restarting"),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops supervising once the consumer has been closed", async () => {
    vi.useFakeTimers();
    try {
      const { mod } = await loadEnqueueModule();
      queueEventRun.mockImplementation(() => Promise.reject(new Error("consumer connection lost")));

      getJob.mockResolvedValueOnce(undefined);
      await mod.waitForJob("image", "job-1");
      await mod.closeQueueEvents();
      const runsAtClose = queueEventRun.mock.calls.length;
      await vi.advanceTimersByTimeAsync(5000);

      expect(queueEventRun).toHaveBeenCalledTimes(runsAtClose);
    } finally {
      vi.useRealTimers();
    }
  });

  it("getFlowProducer returns the same cached instance on repeated calls and attaches an error listener", async () => {
    const errorSpy = loggerMock.error;
    const { mod } = await loadEnqueueModule();
    const a = mod.getFlowProducer();
    const b = mod.getFlowProducer();
    expect(a).toBe(b);
    expect(flowProducerOn).toHaveBeenCalledTimes(1);
    expect(flowProducerOn).toHaveBeenCalledWith("error", expect.any(Function));
    const handler = flowProducerOn.mock.calls[0][1] as (err: Error) => void;
    const boom = new Error("flow redis blip");
    handler(boom);
    expect(errorSpy).toHaveBeenCalledWith({ err: boom }, "[flow-producer] connection error");

    const { classifyError } = await import("../../../../apps/api/src/lib/error-report.js");
    const flow = { name: "parent", queueName: "snapotter-system", data: {} };
    await expect(a.add(flow)).resolves.toEqual({ job: flow });
    expect(flowProducerAdd).toHaveBeenCalledWith(flow);

    const flowResetErr = Object.assign(new Error("read ECONNRESET"), {
      code: "ECONNRESET",
      syscall: "read",
    });
    flowProducerAdd.mockRejectedValueOnce(flowResetErr);
    await expect(a.add(flow)).rejects.toBe(flowResetErr);
    expect(classifyError(flowResetErr, "http")).toBe("operational");
  });

  it("closeFlowProducer is a no-op when no producer was created", async () => {
    const { mod } = await loadEnqueueModule();
    await expect(mod.closeFlowProducer()).resolves.toBeUndefined();
    expect(flowProducerClose).not.toHaveBeenCalled();
  });
});

describe("enqueueToolJob AI quota gate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("checks the AI quota before inserting for ai-tool jobs", async () => {
    const { mod } = await loadEnqueueModule();
    await mod.enqueueToolJob({
      jobId: "ai-1",
      userId: "user-1",
      toolId: "colorize",
      pool: "ai",
      kind: "ai-tool",
      inputRefs: ["uploads/ai-1/x.png"],
      filename: "x.png",
      settings: {},
    } as never);

    expect(assertAiJobQuotaMock).toHaveBeenCalledWith("user-1");
    expect(insertedValues).toHaveBeenCalled();
  });

  it("does not check the AI quota for non-ai-tool kinds", async () => {
    const { mod } = await loadEnqueueModule();
    await mod.enqueueToolJob({
      jobId: "img-1",
      userId: "user-1",
      toolId: "resize",
      pool: "image",
      kind: "tool",
      inputRefs: ["uploads/img-1/x.png"],
      filename: "x.png",
      settings: {},
    } as never);

    expect(assertAiJobQuotaMock).not.toHaveBeenCalled();
  });

  it("propagates the quota rejection and never inserts the job row", async () => {
    const { mod } = await loadEnqueueModule();
    const quotaErr = Object.assign(new Error("Too many concurrent AI jobs."), { statusCode: 429 });
    assertAiJobQuotaMock.mockRejectedValueOnce(quotaErr);

    await expect(
      mod.enqueueToolJob({
        jobId: "ai-2",
        userId: "user-1",
        toolId: "colorize",
        pool: "ai",
        kind: "ai-tool",
        inputRefs: ["uploads/ai-2/x.png"],
        filename: "x.png",
        settings: {},
      } as never),
    ).rejects.toThrow("Too many concurrent AI jobs.");

    expect(insertedValues).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });
});

describe("injectTraceContext", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets _otel with traceparent and tracestate when both are present", async () => {
    const { mod } = await loadEnqueueModule({
      injectCarrier: { traceparent: "00-abc-def-01", tracestate: "vendor=1" },
    });
    const data = { jobId: "t-1" } as unknown as ToolJobData;
    mod.injectTraceContext(data);
    expect(data._otel).toEqual({ traceparent: "00-abc-def-01", tracestate: "vendor=1" });
  });

  it("sets _otel with an undefined tracestate when only traceparent is present", async () => {
    const { mod } = await loadEnqueueModule({
      injectCarrier: { traceparent: "00-abc-def-01" },
    });
    const data = { jobId: "t-2" } as unknown as ToolJobData;
    mod.injectTraceContext(data);
    expect(data._otel).toEqual({ traceparent: "00-abc-def-01", tracestate: undefined });
  });

  it("leaves _otel unset when no traceparent is produced", async () => {
    const { mod } = await loadEnqueueModule({ injectCarrier: {} });
    const data = { jobId: "t-3" } as unknown as ToolJobData;
    mod.injectTraceContext(data);
    expect(data._otel).toBeUndefined();
  });
});

describe("computeDeleteAfter (via enqueueToolJob fire-and-forget)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  type EnqueueModule = Awaited<ReturnType<typeof loadEnqueueModule>>["mod"];

  async function enqueueWithUser(mod: EnqueueModule): Promise<void> {
    await mod.enqueueToolJob({
      jobId: "ret-1",
      userId: "user-1",
      toolId: "resize",
      pool: "image",
      kind: "tool",
      inputRefs: ["uploads/ret-1/x.png"],
      filename: "x.png",
      settings: {},
    } as never);
    await flushMicrotasks();
  }

  it("does nothing when team_retention_overrides is disabled", async () => {
    const { mod, updateWhere } = await loadEnqueueModule({ teamRetentionEnabled: false });
    await enqueueWithUser(mod);
    expect(selectMock).not.toHaveBeenCalled();
    expect(updateWhere).not.toHaveBeenCalled();
  });

  it("does nothing when the enterprise import throws (feature stays disabled)", async () => {
    const { mod, updateWhere } = await loadEnqueueModule({ enterpriseImportThrows: true });
    await enqueueWithUser(mod);
    expect(selectMock).not.toHaveBeenCalled();
    expect(updateWhere).not.toHaveBeenCalled();
  });

  it("returns early when the user has no team row", async () => {
    const { mod, updateWhere } = await loadEnqueueModule({
      teamRetentionEnabled: true,
      userRow: [],
    });
    await enqueueWithUser(mod);
    expect(selectMock).toHaveBeenCalledTimes(1); // only the users lookup ran
    expect(updateWhere).not.toHaveBeenCalled();
  });

  it("returns early when the user's team is null", async () => {
    const { mod, updateWhere } = await loadEnqueueModule({
      teamRetentionEnabled: true,
      userRow: [{ team: null }],
    });
    await enqueueWithUser(mod);
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(updateWhere).not.toHaveBeenCalled();
  });

  it("uses the team retentionHours when set", async () => {
    const start = Date.now();
    const { mod, updateWhere } = await loadEnqueueModule({
      teamRetentionEnabled: true,
      userRow: [{ team: "team-1" }],
      teamRow: [{ retentionHours: 2 }],
    });
    await enqueueWithUser(mod);

    expect(selectMock).toHaveBeenCalledTimes(2);
    expect(updateSetMock).toHaveBeenCalledTimes(1);
    const arg = updateSetMock.mock.calls[0][0] as { deleteAfter: Date };
    expect(arg.deleteAfter).toBeInstanceOf(Date);
    // 2 hours out, within a generous tolerance of the enqueue instant.
    const expected = start + 2 * 60 * 60 * 1000;
    expect(Math.abs(arg.deleteAfter.getTime() - expected)).toBeLessThan(5000);
    expect(updateWhere).toHaveBeenCalledTimes(1);
  });

  it("falls back to FILE_MAX_AGE_HOURS when the team retentionHours is null", async () => {
    const start = Date.now();
    const { mod } = await loadEnqueueModule({
      teamRetentionEnabled: true,
      userRow: [{ team: "team-1" }],
      teamRow: [{ retentionHours: null }],
    });
    await enqueueWithUser(mod);

    const arg = updateSetMock.mock.calls[0][0] as { deleteAfter: Date };
    const expected = start + 24 * 60 * 60 * 1000; // FILE_MAX_AGE_HOURS mocked to 24
    expect(Math.abs(arg.deleteAfter.getTime() - expected)).toBeLessThan(5000);
  });

  it("falls back to FILE_MAX_AGE_HOURS when the teams lookup returns no row", async () => {
    const start = Date.now();
    const { mod } = await loadEnqueueModule({
      teamRetentionEnabled: true,
      userRow: [{ team: "team-1" }],
      teamRow: [],
    });
    await enqueueWithUser(mod);

    const arg = updateSetMock.mock.calls[0][0] as { deleteAfter: Date };
    const expected = start + 24 * 60 * 60 * 1000;
    expect(Math.abs(arg.deleteAfter.getTime() - expected)).toBeLessThan(5000);
  });

  it("swallows a computeDeleteAfter failure without rejecting enqueueToolJob", async () => {
    const { mod } = await loadEnqueueModule({
      teamRetentionEnabled: true,
      userRow: [{ team: "team-1" }],
      teamRow: [{ retentionHours: 5 }],
    });
    // Make the update leg throw; the .catch(() => {}) must absorb it.
    updateSetMock.mockReturnValueOnce({
      where: vi.fn(() => Promise.reject(new Error("db down"))),
    });

    await expect(
      mod.enqueueToolJob({
        jobId: "ret-err",
        userId: "user-1",
        toolId: "resize",
        pool: "image",
        kind: "tool",
        inputRefs: ["uploads/ret-err/x.png"],
        filename: "x.png",
        settings: {},
      } as never),
    ).resolves.toBeDefined();
    await flushMicrotasks();
  });
});

describe("alias claim outcomes (#895)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("insertToolJobAlias returns true when the row is inserted and false on conflict", async () => {
    const { mod } = await loadEnqueueModule();

    onConflictDoNothingMock.mockResolvedValueOnce({ rowCount: 1 });
    await expect(
      mod.insertToolJobAlias({
        jobId: "job-1",
        clientJobId: "client-1",
        userId: "user-1",
        pool: "image",
      }),
    ).resolves.toBe(true);

    onConflictDoNothingMock.mockResolvedValueOnce({ rowCount: 0 });
    await expect(
      mod.insertToolJobAlias({
        jobId: "job-2",
        clientJobId: "client-1",
        userId: "user-1",
        pool: "image",
      }),
    ).resolves.toBe(false);
  });

  it("enqueueToolJob strips clientJobId from job data when upsertToolJobAlias is refused", async () => {
    const warnSpy = loggerMock.warn;
    const { mod } = await loadEnqueueModule();
    onConflictDoUpdateMock.mockResolvedValueOnce({ rowCount: 0 });

    const data: ToolJobData = {
      jobId: "job-refused",
      clientJobId: "colliding-batch-id",
      userId: "user-1",
      toolId: "resize",
      pool: "image",
      kind: "tool",
      inputRefs: ["uploads/job-refused/x.png"],
      filename: "x.png",
      settings: {},
    };

    const job = await mod.enqueueToolJob(data);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "alias claim skipped for clientJobId colliding-batch-id (job job-refused); progress and cancel fell back to the server job id",
      ),
    );
    expect(data.clientJobId).toBeUndefined();
    expect(job.data.clientJobId).toBeUndefined();
    expect(clearTerminalReplayKeyMock).not.toHaveBeenCalled();
    expect(queueAdd).toHaveBeenCalledWith(
      "resize",
      expect.objectContaining({ jobId: "job-refused", clientJobId: undefined }),
      { jobId: "job-refused" },
    );
  });

  it("enqueueToolJob preserves clientJobId when upsertToolJobAlias claims the row", async () => {
    const { mod } = await loadEnqueueModule();
    onConflictDoUpdateMock.mockResolvedValueOnce({ rowCount: 1 });

    const data: ToolJobData = {
      jobId: "job-claimed",
      clientJobId: "owned-alias-id",
      userId: null,
      toolId: "resize",
      pool: "image",
      kind: "tool",
      inputRefs: ["uploads/job-claimed/x.png"],
      filename: "x.png",
      settings: {},
    };

    const job = await mod.enqueueToolJob(data);

    expect(data.clientJobId).toBe("owned-alias-id");
    expect(job.data.clientJobId).toBe("owned-alias-id");
    expect(clearTerminalReplayKeyMock).toHaveBeenCalledTimes(1);
    expect(clearTerminalReplayKeyMock).toHaveBeenCalledWith("owned-alias-id");
    expect(clearTerminalReplayKeyMock.mock.invocationCallOrder[0]).toBeLessThan(
      queueAdd.mock.invocationCallOrder[0],
    );
    expect(queueAdd).toHaveBeenCalledWith(
      "resize",
      expect.objectContaining({ jobId: "job-claimed", clientJobId: "owned-alias-id" }),
      { jobId: "job-claimed" },
    );
  });

  it("upsertToolJobAlias resets createdAt alongside terminal columns when re-pointing (#2807)", async () => {
    const { mod } = await loadEnqueueModule();
    onConflictDoUpdateMock.mockResolvedValueOnce({ rowCount: 1 });

    await expect(
      mod.upsertToolJobAlias({
        jobId: "job-next",
        clientJobId: "reused-client-id",
        userId: "user-1",
        pool: "docs",
      }),
    ).resolves.toBe(true);

    expect(onConflictDoUpdateMock).toHaveBeenCalledTimes(1);
    const conflictArg = onConflictDoUpdateMock.mock.calls[0][0] as {
      set: Record<string, unknown>;
    };
    expect(conflictArg.set.pool).toBe("docs");
    const createdAtSql = conflictArg.set.createdAt as { sql?: [TemplateStringsArray, unknown[]] };
    expect(createdAtSql).toBeDefined();
    const [strings, values] = createdAtSql.sql ?? [[], []];
    expect(strings.join(" ")).toContain("CASE WHEN");
    expect(strings.join(" ")).toContain("THEN now() ELSE");
    const isRepointSql = values[0] as { sql?: [TemplateStringsArray, unknown[]] };
    expect(isRepointSql.sql?.[0].join(" ")).toContain("->>'artifactJobId' is distinct from");
    expect(isRepointSql.sql?.[1]).toEqual(["jobs.settings", "job-next"]);
    expect(values[1]).toBe("jobs.createdAt");
    expect(conflictArg.set.status).toBeDefined();
    expect(conflictArg.set.completedAt).toBeDefined();
    expect(conflictArg.set.error).toBeDefined();
    expect(conflictArg.set.progress).toBeDefined();
    expect(clearTerminalReplayKeyMock).toHaveBeenCalledTimes(1);
    expect(clearTerminalReplayKeyMock).toHaveBeenCalledWith("reused-client-id");
  });

  it("upsertToolJobAlias preserves the terminal replay key when a same-run validation-window cancel already settled the row (#2740)", async () => {
    const warnSpy = loggerMock.warn;
    const { mod } = await loadEnqueueModule();
    onConflictDoUpdateMock.mockResolvedValueOnce([{ status: "canceled" }]);

    await expect(
      mod.upsertToolJobAlias({
        jobId: "job-same",
        clientJobId: "window-canceled-id",
        userId: "user-1",
        pool: "image",
      }),
    ).resolves.toBe(true);
    expect(clearTerminalReplayKeyMock).not.toHaveBeenCalled();

    onConflictDoUpdateMock.mockResolvedValueOnce([{ status: "queued" }]);
    clearTerminalReplayKeyMock.mockRejectedValueOnce(new Error("redis del fault"));

    await expect(
      mod.upsertToolJobAlias({
        jobId: "job-next",
        clientJobId: "reused-id",
        userId: "user-1",
        pool: "image",
      }),
    ).resolves.toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      { err: expect.any(Error), clientJobId: "reused-id" },
      "terminal replay key clear failed",
    );
  });
});
