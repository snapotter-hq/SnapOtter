import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loggerWarn = vi.hoisted(() => vi.fn());
const loggerError = vi.hoisted(() => vi.fn());
vi.mock("../../../../apps/api/src/lib/logger.js", () => ({
  logger: { error: loggerError, info: vi.fn(), warn: loggerWarn },
}));

const {
  createWorkerErrorBackoff,
  WORKER_ERROR_BACKOFF_MS,
  WORKER_ERROR_BURST,
  WORKER_ERROR_BURST_WINDOW_MS,
} = await import("../../../../apps/api/src/jobs/worker-error-backoff.js");

/** Just enough of a BullMQ Worker: a paused flag the listener can flip. */
function fakeWorker() {
  const state = { paused: false, closing: undefined as Promise<void> | undefined };
  const worker = {
    get closing() {
      return state.closing;
    },
    isPaused: vi.fn(() => state.paused),
    pause: vi.fn(async () => {
      state.paused = true;
    }),
    resume: vi.fn(() => {
      state.paused = false;
    }),
  };
  return { worker, state };
}

function noreplicas(): Error {
  return Object.assign(new Error("NOREPLICAS Not enough good replicas to write."), {
    name: "ReplyError",
  });
}

describe("createWorkerErrorBackoff (#4530)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    loggerWarn.mockReset();
    loggerError.mockReset();
  });

  it("pauses a worker that emits a burst of errors and resumes it after the backoff", () => {
    const { worker } = fakeWorker();
    const onError = createWorkerErrorBackoff(worker, "system");

    for (let i = 0; i < WORKER_ERROR_BURST - 1; i++) onError(noreplicas());
    expect(worker.pause).not.toHaveBeenCalled();

    onError(noreplicas());
    expect(worker.pause).toHaveBeenCalledExactlyOnceWith(true);
    expect(loggerWarn).toHaveBeenCalledExactlyOnceWith(
      { pool: "system", errors: WORKER_ERROR_BURST, backoffMs: WORKER_ERROR_BACKOFF_MS },
      "Worker paused after a burst of errors",
    );

    for (let i = 0; i < 1_000; i++) onError(noreplicas());
    expect(worker.pause).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(WORKER_ERROR_BACKOFF_MS - 1);
    expect(worker.resume).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(worker.resume).toHaveBeenCalledTimes(1);
  });

  it("pauses again when Redis is still refusing after the resume", () => {
    const { worker } = fakeWorker();
    const onError = createWorkerErrorBackoff(worker, "image");

    for (let round = 1; round <= 3; round++) {
      for (let i = 0; i < WORKER_ERROR_BURST; i++) onError(noreplicas());
      expect(worker.pause).toHaveBeenCalledTimes(round);
      vi.advanceTimersByTime(WORKER_ERROR_BACKOFF_MS);
      expect(worker.resume).toHaveBeenCalledTimes(round);
    }
  });

  it("leaves a worker alone when its reply errors are spread out", () => {
    const { worker } = fakeWorker();
    const onError = createWorkerErrorBackoff(worker, "ai");

    for (let i = 0; i < WORKER_ERROR_BURST * 5; i++) {
      onError(noreplicas());
      vi.advanceTimersByTime(Math.ceil(WORKER_ERROR_BURST_WINDOW_MS / (WORKER_ERROR_BURST - 1)));
    }
    expect(worker.pause).not.toHaveBeenCalled();
  });

  it("ignores a tick of lock-renewal failures on a busy pool", () => {
    const { worker } = fakeWorker();
    const onError = createWorkerErrorBackoff(worker, "image");

    for (let job = 0; job < WORKER_ERROR_BURST * 3; job++) {
      onError(new Error(`could not renew lock for job ${job}`));
    }
    expect(worker.pause).not.toHaveBeenCalled();
  });

  it("does not take over a worker that something else paused", () => {
    const { worker, state } = fakeWorker();
    state.paused = true;
    const onError = createWorkerErrorBackoff(worker, "system");

    for (let i = 0; i < WORKER_ERROR_BURST * 3; i++) onError(noreplicas());
    vi.advanceTimersByTime(WORKER_ERROR_BACKOFF_MS * 2);

    expect(worker.pause).not.toHaveBeenCalled();
    expect(worker.resume).not.toHaveBeenCalled();
  });

  it("does not resume a worker that started closing during the backoff", () => {
    const { worker, state } = fakeWorker();
    const onError = createWorkerErrorBackoff(worker, "system");

    for (let i = 0; i < WORKER_ERROR_BURST; i++) onError(noreplicas());
    expect(worker.pause).toHaveBeenCalledTimes(1);
    state.closing = Promise.resolve();
    vi.advanceTimersByTime(WORKER_ERROR_BACKOFF_MS);

    expect(worker.resume).not.toHaveBeenCalled();
  });

  it("does not resume a worker somebody else resumed first", () => {
    const { worker, state } = fakeWorker();
    const onError = createWorkerErrorBackoff(worker, "system");

    for (let i = 0; i < WORKER_ERROR_BURST; i++) onError(noreplicas());
    state.paused = false;
    vi.advanceTimersByTime(WORKER_ERROR_BACKOFF_MS);

    expect(worker.resume).not.toHaveBeenCalled();
  });

  it("logs a pause that fails instead of leaving an unhandled rejection", async () => {
    const { worker } = fakeWorker();
    const failure = new Error("pause blew up");
    worker.pause.mockRejectedValueOnce(failure);
    const onError = createWorkerErrorBackoff(worker, "system");

    for (let i = 0; i < WORKER_ERROR_BURST; i++) onError(noreplicas());
    await vi.waitFor(() =>
      expect(loggerError).toHaveBeenCalledWith(
        { err: failure, pool: "system" },
        "Worker pause after an error burst failed",
      ),
    );
  });
});
