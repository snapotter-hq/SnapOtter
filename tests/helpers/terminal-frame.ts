/**
 * The Redis terminal replay frame a reconnecting SSE client is sent.
 *
 * The worker commits the job row first and writes this key afterwards in a
 * `setex` nobody awaits (`announce()` in apps/api/src/routes/progress.ts), so a
 * settled row or a returned HTTP response doesn't mean the key exists yet.
 * Read it through here rather than with a single `get` (#4789, #4795). A check
 * that the key is absent stays a plain `get`: polling it would hide a late write.
 *
 * The API modules load lazily because integration files set their env before
 * importing them.
 */
export async function waitForTerminalFrame(
  jobId: string,
  timeoutMs = 30_000,
): Promise<Record<string, unknown>> {
  const { sharedRedis } = await import("../../apps/api/src/jobs/connection.js");
  const { bullPrefix } = await import("../../apps/api/src/jobs/types.js");
  const key = `${bullPrefix()}:terminal:${jobId}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const raw = await sharedRedis().get(key);
    if (raw) return JSON.parse(raw) as Record<string, unknown>;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`No terminal frame for ${jobId} within ${timeoutMs}ms`);
}
