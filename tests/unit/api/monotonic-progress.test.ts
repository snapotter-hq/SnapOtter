import { describe, expect, it, vi } from "vitest";
import { createMonotonicReporter } from "../../../apps/api/src/jobs/monotonic-progress.js";

/**
 * Progress that moves backwards makes the UI progress bar jump left mid-job.
 * Two live tools did it on the release container: stabilize-video reported
 * 5, 50, then 5 again because its second ffmpeg pass restarts the 5..95 mapping
 * in runFfmpegWithProgress, and ocr-pdf reported 10 then 0 when the Python
 * sidecar began emitting its own scale. Both are the same class of defect, so
 * the guard lives at the one place every tool's progress passes through.
 */
describe("createMonotonicReporter", () => {
  it("never emits a percent lower than one already emitted", () => {
    const emit = vi.fn();
    const report = createMonotonicReporter(emit);

    report(5, "Analyzing");
    report(50, "Stabilizing");
    report(5, "Preparing");
    report(73, "Processing");

    expect(emit.mock.calls.map((call) => call[0])).toEqual([5, 50, 50, 73]);
  });

  it("keeps the stage label of the regressing report", () => {
    const emit = vi.fn();
    const report = createMonotonicReporter(emit);

    report(50, "Stabilizing");
    report(5, "Preparing");

    // The percentage is held, but the user still learns what the job is doing.
    expect(emit).toHaveBeenLastCalledWith(50, "Preparing");
  });

  it("passes strictly increasing progress through untouched", () => {
    const emit = vi.fn();
    const report = createMonotonicReporter(emit);

    for (const percent of [0, 1, 25, 60, 99, 100]) report(percent, "step");

    expect(emit.mock.calls.map((call) => call[0])).toEqual([0, 1, 25, 60, 99, 100]);
  });

  it("reproduces the ocr-pdf sequence without going backwards", () => {
    const emit = vi.fn();
    const report = createMonotonicReporter(emit);

    report(5, "Preparing PDF");
    report(10, "Extracting text from PDF");
    report(0, "Loading OCR model");
    report(80, "Recognizing");

    const percents = emit.mock.calls.map((call) => call[0]);
    expect(percents).toEqual([5, 10, 10, 80]);
    expect(percents.every((value, i) => i === 0 || value >= percents[i - 1])).toBe(true);
  });

  it("gives each reporter its own high-water mark so a retry can restart", () => {
    const first = vi.fn();
    const second = vi.fn();
    createMonotonicReporter(first)(90, "almost done");
    const retry = createMonotonicReporter(second);

    retry(0, "retrying");

    // A new attempt legitimately starts over; clamping across attempts would
    // freeze the bar at the failed attempt's high-water mark.
    expect(second).toHaveBeenCalledWith(0, "retrying");
  });

  it("ignores non-finite percentages rather than poisoning the high-water mark", () => {
    const emit = vi.fn();
    const report = createMonotonicReporter(emit);

    report(40, "working");
    report(Number.NaN, "bad reading");
    report(55, "working");

    expect(emit.mock.calls.map((call) => call[0])).toEqual([40, 40, 55]);
  });
});
