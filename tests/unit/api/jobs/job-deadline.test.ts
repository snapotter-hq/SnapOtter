import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../apps/api/src/lib/error-report.js", () => ({
  reportError: vi.fn(),
  safeFormatTag: vi.fn(() => undefined),
}));
vi.mock("../../../../apps/api/src/lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { createJobDeadline, MAX_EXTENDED_JOB_TIMEOUT_MS } = await import(
  "../../../../apps/api/src/jobs/worker-shared.js"
);

const MIN = 60_000;
const HOUR = 60 * MIN;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

// A Best OCR run over about 24 pages outlived the flat 2-hour JOB_TIMEOUT_LONG_S
// even though its own runtime budget allowed it (#4719).
describe("createJobDeadline", () => {
  it("fires at the configured deadline when nothing extends it", () => {
    const onExpire = vi.fn();
    createJobDeadline(2 * HOUR, onExpire);
    vi.advanceTimersByTime(2 * HOUR - 1);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("moves the deadline out to at least the requested time from now", () => {
    const onExpire = vi.fn();
    const deadline = createJobDeadline(2 * HOUR, onExpire);
    vi.advanceTimersByTime(10 * MIN);
    deadline.extend(151 * MIN);
    expect(deadline.timeoutMs()).toBe(161 * MIN);
    vi.advanceTimersByTime(2 * HOUR);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(41 * MIN);
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("never shortens the deadline", () => {
    const onExpire = vi.fn();
    const deadline = createJobDeadline(2 * HOUR, onExpire);
    deadline.extend(5 * MIN);
    expect(deadline.timeoutMs()).toBe(2 * HOUR);
    vi.advanceTimersByTime(2 * HOUR - 1);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("stops at the ceiling", () => {
    const deadline = createJobDeadline(2 * HOUR, vi.fn());
    deadline.extend(100 * HOUR);
    expect(deadline.timeoutMs()).toBe(MAX_EXTENDED_JOB_TIMEOUT_MS);
  });

  it("keeps an operator deadline above the ceiling", () => {
    const deadline = createJobDeadline(12 * HOUR, vi.fn());
    deadline.extend(100 * HOUR);
    expect(deadline.timeoutMs()).toBe(12 * HOUR);
  });

  it("stays unlimited at 0 and ignores extensions", () => {
    const onExpire = vi.fn();
    const deadline = createJobDeadline(0, onExpire);
    deadline.extend(3 * HOUR);
    expect(deadline.timeoutMs()).toBe(0);
    vi.advanceTimersByTime(100 * HOUR);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("ignores a bad or non-positive request", () => {
    const deadline = createJobDeadline(2 * HOUR, vi.fn());
    for (const ms of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0]) deadline.extend(ms);
    expect(deadline.timeoutMs()).toBe(2 * HOUR);
  });

  it("doesn't move a deadline that already fired", () => {
    const onExpire = vi.fn();
    const deadline = createJobDeadline(MIN, onExpire);
    vi.advanceTimersByTime(MIN);
    deadline.extend(3 * HOUR);
    expect(deadline.timeoutMs()).toBe(MIN);
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("clear stops the timer", () => {
    const onExpire = vi.fn();
    const deadline = createJobDeadline(MIN, onExpire);
    deadline.extend(10 * MIN);
    deadline.clear();
    vi.advanceTimersByTime(HOUR);
    expect(onExpire).not.toHaveBeenCalled();
  });
});
