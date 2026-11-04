import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loggerError = vi.hoisted(() => vi.fn());
vi.mock("../../../../apps/api/src/lib/logger.js", () => ({
  logger: { error: loggerError, info: vi.fn(), warn: vi.fn() },
}));

const { createWorkerErrorLogger, WORKER_ERROR_LOG_WINDOW_MS } = await import(
  "../../../../apps/api/src/jobs/worker-error-log.js"
);

describe("createWorkerErrorLogger (#4360)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    loggerError.mockReset();
  });

  it("keeps holding errors back until the full window has passed", () => {
    const onError = createWorkerErrorLogger("image");
    onError(new Error("first"));
    vi.advanceTimersByTime(WORKER_ERROR_LOG_WINDOW_MS - 1);
    onError(new Error("still inside"));
    expect(loggerError).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    const late = new Error("after the window");
    onError(late);
    expect(loggerError).toHaveBeenCalledTimes(2);
    expect(loggerError).toHaveBeenLastCalledWith(
      { err: late, pool: "image", suppressed: 1 },
      "Worker error",
    );
  });

  it("starts a fresh count after each logged line", () => {
    const onError = createWorkerErrorLogger("docs", 1_000);
    onError(new Error("a"));
    onError(new Error("b"));
    onError(new Error("c"));
    vi.advanceTimersByTime(1_000);
    onError(new Error("d"));
    vi.advanceTimersByTime(1_000);
    onError(new Error("e"));

    expect(loggerError.mock.calls.map((c) => c[0].suppressed)).toEqual([undefined, 2, undefined]);
  });

  it("throttles each pool on its own", () => {
    const image = createWorkerErrorLogger("image");
    const system = createWorkerErrorLogger("system");
    image(new Error("image down"));
    system(new Error("system down"));
    image(new Error("image again"));

    expect(loggerError.mock.calls.map((c) => c[0].pool)).toEqual(["image", "system"]);
  });
});
