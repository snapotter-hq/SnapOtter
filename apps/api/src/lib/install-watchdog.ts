/**
 * Pure decision for the AI-bundle install watchdog.
 *
 * A wedged installer (dead download socket, hung pip) holds the venv writer lock
 * forever and blocks every other install with no exit but a server restart. The
 * watchdog kills such a child so its close handler frees the locks and the user
 * gets a retryable failure. This function holds the (timer-free, side-effect
 * free) rule so it can be unit-tested exhaustively; features.ts owns the timers.
 *
 * @param now            current time (ms)
 * @param lastProgressAt time of the last progress frame (ms)
 * @param startedAt      time the install started (ms)
 * @param stallMs        max time with no progress before a kill (0 disables)
 * @param maxMs          absolute wall-clock ceiling (0 disables)
 */
export function evaluateInstallWatchdog(
  now: number,
  lastProgressAt: number,
  startedAt: number,
  stallMs: number,
  maxMs: number,
): { kill: boolean; reason: string | null } {
  const overMax = maxMs > 0 && now - startedAt > maxMs;
  if (overMax) {
    return {
      kill: true,
      reason: `Installation exceeded the ${Math.round(
        maxMs / 60_000,
      )} minute time limit and was stopped. Please retry.`,
    };
  }
  const stalled = stallMs > 0 && now - lastProgressAt > stallMs;
  if (stalled) {
    return {
      kill: true,
      reason: `Installation made no progress for ${Math.round(
        stallMs / 60_000,
      )} minutes and was stopped. Check your connection and retry.`,
    };
  }
  return { kill: false, reason: null };
}
