/**
 * Keeps a job's reported progress from moving backwards.
 *
 * Tools report progress on their own scale, and several of them legitimately
 * report more than once from more than one source: a two-pass ffmpeg tool
 * reports before each pass, and an AI tool reports around a Python sidecar that
 * emits its own percentages. When a later source starts from a low number the
 * client sees the progress bar jump left, which reads as the job restarting.
 *
 * Clamping happens per reporter, and the worker builds one reporter per job
 * attempt, so a retry still starts over at zero instead of inheriting the
 * failed attempt's high-water mark.
 */

export type ProgressReporter = (percent: number, stage?: string) => void;

/** Wraps a reporter so emitted percentages are non-decreasing. */
export function createMonotonicReporter(emit: ProgressReporter): ProgressReporter {
  let highWater = Number.NEGATIVE_INFINITY;
  return (percent, stage) => {
    // A non-finite reading must not become the new floor for everything after.
    const candidate = Number.isFinite(percent) ? percent : highWater;
    const clamped = Math.max(candidate, highWater);
    highWater = clamped;
    emit(clamped, stage);
  };
}
