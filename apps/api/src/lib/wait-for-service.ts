export interface WaitForServiceOptions {
  /** Give up (and rethrow the last probe error) after this many milliseconds. */
  timeoutMs: number;
  /** Delay between probe attempts. */
  intervalMs: number;
  /** Called after each failed attempt, before the next sleep. */
  onRetry?: (attempt: number, err: unknown) => void;
  /** Injectable clock (tests); defaults to Date.now. */
  now?: () => number;
  /** Injectable sleep (tests); defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll `probe` until it resolves without throwing, or `timeoutMs` elapses.
 *
 * A startup dependency (Postgres, Redis) is often reachable only a few seconds
 * after the app process starts: Docker Compose without a healthcheck gate, or a
 * native systemd unit ordered after Debian's no-op `postgresql.service` umbrella
 * rather than the real cluster. Retrying briefly turns a crash-loop into a clean
 * boot; a genuinely-absent dependency still surfaces the real error on timeout.
 */
export async function waitForService(
  probe: () => Promise<void>,
  options: WaitForServiceOptions,
): Promise<void> {
  const { timeoutMs, intervalMs, onRetry } = options;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? realSleep;

  const deadline = now() + timeoutMs;
  let attempt = 0;
  for (;;) {
    attempt++;
    try {
      await probe();
      return;
    } catch (err) {
      if (now() >= deadline) throw err;
      onRetry?.(attempt, err);
      await sleep(intervalMs);
    }
  }
}
