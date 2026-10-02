/**
 * Runs each of a run's ending store writes in its own guard, so one that
 * throws can't skip the rest and leave the run half ended (#1791, #1814).
 * Zustand commits a write before its listeners run, so a write whose
 * listener threw has usually landed anyway; what a bare sequence loses is
 * every write after it. Each throw is logged, and the first is returned for
 * the caller to rethrow once the run is over, so it still reaches whoever
 * reports it.
 */
export function runEndWrites(writes: ReadonlyArray<() => void>): { cause: unknown } | null {
  let firstError: { cause: unknown } | null = null;
  for (const write of writes) {
    try {
      write();
    } catch (cause) {
      console.error("Ending the run failed", cause);
      firstError ??= { cause };
    }
  }
  return firstError;
}
