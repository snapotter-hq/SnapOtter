/** A per-minute ceiling no real client reaches, standing in for "unlimited". */
export const UNLIMITED_RATE_LIMIT_MAX = 50_000;

/**
 * Turn a per-minute env limit into an @fastify/rate-limit `max`. The plugin
 * counts a request as over the limit when the count exceeds `max`, so a literal
 * 0 refuses every request; the repo convention is that 0 means unlimited.
 */
export function rateLimitMax(perMinute: number): number {
  return perMinute > 0 ? perMinute : UNLIMITED_RATE_LIMIT_MAX;
}
