import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loggerError = vi.hoisted(() => vi.fn());
vi.mock("../../../../apps/api/src/lib/logger.js", () => ({
  logger: { error: loggerError, info: vi.fn(), warn: vi.fn() },
}));

const { createWorkerErrorLogger, WORKER_ERROR_LOG_WINDOW_MS } = await import(
  "../../../../apps/api/src/jobs/worker-error-log.js"
);

function messages(): string[] {
  return loggerError.mock.calls.map((c) => c[1] as string);
}

describe("createWorkerErrorLogger (#4360)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    loggerError.mockReset();
  });

  it("holds repeats back until the full window has passed", () => {
    const onError = createWorkerErrorLogger("image");
    const first = new Error("MISCONF");
    onError(first);
    vi.advanceTimersByTime(WORKER_ERROR_LOG_WINDOW_MS - 1);
    onError(new Error("MISCONF"));
    expect(loggerError.mock.calls).toEqual([[{ err: first, pool: "image" }, "Worker error"]]);

    vi.advanceTimersByTime(1);
    expect(loggerError).toHaveBeenLastCalledWith(
      { pool: "image", suppressed: 1, windowMs: WORKER_ERROR_LOG_WINDOW_MS },
      "Worker errors suppressed",
    );

    const late = new Error("MISCONF");
    onError(late);
    expect(loggerError).toHaveBeenLastCalledWith({ err: late, pool: "image" }, "Worker error");
  });

  it("closes a quiet window without a summary line", () => {
    const onError = createWorkerErrorLogger("ai", 1_000);
    onError(new Error("once"));
    vi.advanceTimersByTime(1_000);
    onError(new Error("once"));
    expect(messages()).toEqual(["Worker error", "Worker error"]);
  });

  it("still logs a different error that arrives during a flood", () => {
    const onError = createWorkerErrorLogger("system");
    for (let i = 0; i < 100; i++) onError(new Error("MISCONF"));
    const auth = new Error("NOAUTH Authentication required.");
    onError(auth);
    for (let i = 0; i < 100; i++) onError(new Error("MISCONF"));

    expect(loggerError.mock.calls.map((c) => c[0].err.message)).toEqual([
      "MISCONF",
      "NOAUTH Authentication required.",
    ]);
    vi.advanceTimersByTime(WORKER_ERROR_LOG_WINDOW_MS);
    expect(loggerError).toHaveBeenLastCalledWith(
      expect.objectContaining({ suppressed: 199 }),
      "Worker errors suppressed",
    );
  });

  it("caps the distinct errors one window logs in full", () => {
    const onError = createWorkerErrorLogger("docs");
    for (let i = 0; i < 50; i++) onError(new Error(`job ${i} failed`));
    expect(messages().filter((m) => m === "Worker error")).toHaveLength(10);
    vi.advanceTimersByTime(WORKER_ERROR_LOG_WINDOW_MS);
    expect(loggerError).toHaveBeenLastCalledWith(
      expect.objectContaining({ suppressed: 40 }),
      "Worker errors suppressed",
    );
  });

  it("throttles each pool on its own", () => {
    const image = createWorkerErrorLogger("image");
    const system = createWorkerErrorLogger("system");
    image(new Error("down"));
    system(new Error("down"));
    image(new Error("down"));

    expect(loggerError.mock.calls.map((c) => c[0].pool)).toEqual(["image", "system"]);
  });
});
