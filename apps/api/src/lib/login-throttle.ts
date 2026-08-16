/**
 * Per-username sliding-window throttle for failed password logins (issue #820).
 *
 * Mirrors the Redis sorted-set window in plugins/per-user-rate-limit.ts, but
 * keys on the LOWERCASE attempted username instead of the authenticated user
 * id. Failures for nonexistent usernames are counted under the same key shape
 * on purpose: if the throttle only ever fired for real accounts, its 429 would
 * become a username-enumeration oracle and undo the equalized 401s of #818.
 *
 * Kept free of Fastify and DB imports so the window semantics unit-test
 * cleanly; the login handler in plugins/auth.ts resolves the config (env vars
 * plus DB setting overrides) and wires these calls into the request flow.
 */
import type Redis from "ioredis";
import { bullPrefix } from "../jobs/types.js";

export interface LoginThrottleConfig {
  /** Failures tolerated inside the window before logins 429; 0 disables. */
  maxFailures: number;
  /** Sliding-window length in seconds. */
  windowS: number;
}

export interface LoginThrottleState {
  throttled: boolean;
  /** Seconds until enough failures age out to retry; 0 when not throttled. */
  retryAfterS: number;
}

export interface LoginFailureRecord {
  /** Failures inside the window, including the one just recorded. */
  failures: number;
  /** True only for the failure that arms the throttle (count reaches the threshold). */
  crossedThreshold: boolean;
}

/**
 * Redis key for one username's failure window. The bullPrefix() namespace
 * isolates parallel test forks the same way BullMQ queue names do (the
 * per-user rate limiter can key on bare user ids because those are unique
 * per fork database; usernames like "admin" are not).
 */
export function loginThrottleKey(username: string): string {
  return `${bullPrefix()}:login-throttle:${username.toLowerCase()}`;
}

/**
 * Unwrap a multi.exec() result, throwing on a null result (transaction
 * aborted) or any per-command error tuple. ioredis resolves exec() with
 * [err, result] pairs and reports command-level failures (WRONGTYPE, OOM,
 * LOADING) inside them instead of rejecting; coalescing those into defaults
 * would silently fail the throttle open. Throwing here propagates to the
 * login handler and 500s, which is this module's documented fail-closed
 * behavior.
 */
function unwrapExec(results: [error: Error | null, result: unknown][] | null): unknown[] {
  if (results === null) {
    throw new Error("login throttle: redis MULTI transaction aborted");
  }
  for (const [err] of results) {
    if (err) {
      throw new Error(`login throttle: redis command failed: ${err.message}`, { cause: err });
    }
  }
  return results.map(([, result]) => result);
}

/**
 * Read the current window without recording anything. Runs at the top of the
 * login handler, before user lookup, so real and nonexistent usernames share
 * the exact same throttled response.
 */
export async function checkLoginThrottle(
  redis: Redis,
  username: string,
  config: LoginThrottleConfig,
  now = Date.now(),
): Promise<LoginThrottleState> {
  if (config.maxFailures <= 0) return { throttled: false, retryAfterS: 0 };

  const key = loginThrottleKey(username);
  const windowMs = config.windowS * 1000;
  const multi = redis.multi();
  multi.zremrangebyscore(key, 0, now - windowMs);
  multi.zrange(key, 0, -1, "WITHSCORES");
  const results = unwrapExec(await multi.exec());

  // WITHSCORES alternates member, score, member, score, ... in ascending
  // score order.
  const entries = results[1] as string[];
  const scores: number[] = [];
  for (let i = 1; i < entries.length; i += 2) {
    scores.push(Number(entries[i]));
  }
  if (scores.length < config.maxFailures) return { throttled: false, retryAfterS: 0 };

  // The throttle releases once enough of the oldest failures age out that the
  // count drops below the threshold again: that is the moment the entry at
  // index (count - maxFailures) leaves the window, leaving maxFailures - 1.
  const pivot = scores[scores.length - config.maxFailures];
  const retryAfterMs = pivot + windowMs - now;
  return { throttled: true, retryAfterS: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
}

/** Record one failed password attempt for the username's window. */
export async function recordLoginFailure(
  redis: Redis,
  username: string,
  config: LoginThrottleConfig,
  now = Date.now(),
): Promise<LoginFailureRecord> {
  if (config.maxFailures <= 0) return { failures: 0, crossedThreshold: false };

  const key = loginThrottleKey(username);
  const multi = redis.multi();
  multi.zremrangebyscore(key, 0, now - config.windowS * 1000);
  multi.zadd(key, now, `${now}:${Math.random()}`);
  multi.zcard(key);
  multi.expire(key, config.windowS + 1);
  const results = unwrapExec(await multi.exec());

  const failures = results[2] as number;
  // Exactly-at-threshold detection keeps the LOGIN_THROTTLED audit event to
  // one per episode: later attempts are rejected before verification and
  // never recorded, so the count cannot re-hit the threshold until the
  // window slides and the throttle genuinely trips again. Known corner: if
  // an admin lowers the threshold below an already-accumulated count
  // mid-window, the throttle arms via the check path without a
  // LOGIN_THROTTLED audit row for that episode; accepted for the same
  // reason, throttled attempts are never recorded.
  return { failures, crossedThreshold: failures === config.maxFailures };
}

/**
 * Forget the username's failures. Called after a successful password check.
 * Short-circuits when the throttle is disabled, like the other two functions,
 * so opted-out instances never touch Redis on the login happy path.
 */
export async function clearLoginFailures(
  redis: Redis,
  username: string,
  config: LoginThrottleConfig,
): Promise<void> {
  if (config.maxFailures <= 0) return;
  await redis.del(loginThrottleKey(username));
}
