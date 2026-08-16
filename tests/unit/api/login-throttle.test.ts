/**
 * Unit tests for the per-username failed-login throttle (issue #820).
 *
 * Runs against the real per-fork Redis (per-fork-env.ts sets REDIS_URL and a
 * unique BULLMQ_PREFIX, which the throttle key embeds), so the sliding-window
 * ZSET semantics are exercised for real. Expiry is tested by injecting `now`
 * values instead of sleeping.
 */
import { randomUUID } from "node:crypto";
import type Redis from "ioredis";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createRedisConnection } from "../../../apps/api/src/jobs/connection.js";
import {
  checkLoginThrottle,
  clearLoginFailures,
  type LoginThrottleConfig,
  loginThrottleKey,
  recordLoginFailure,
} from "../../../apps/api/src/lib/login-throttle.js";

const WINDOW_S = 900;
const CONFIG: LoginThrottleConfig = { maxFailures: 3, windowS: WINDOW_S };

let redis: Redis;

beforeAll(() => {
  redis = createRedisConnection();
});

afterAll(async () => {
  await redis.quit();
});

/** Unique username per test so windows never bleed between cases. */
const uid = () => `throttle-user-${randomUUID().slice(0, 8)}`;

describe("loginThrottleKey", () => {
  it("keys on the lowercase username under the BullMQ prefix", () => {
    expect(loginThrottleKey("MixedCase")).toBe(
      `${process.env.BULLMQ_PREFIX}:login-throttle:mixedcase`,
    );
  });
});

describe("window counting", () => {
  it("stays unthrottled below the failure threshold", async () => {
    const username = uid();
    await recordLoginFailure(redis, username, CONFIG);
    await recordLoginFailure(redis, username, CONFIG);

    const state = await checkLoginThrottle(redis, username, CONFIG);
    expect(state).toEqual({ throttled: false, retryAfterS: 0 });
  });

  it("throttles once failures reach the threshold", async () => {
    const username = uid();
    for (let i = 0; i < CONFIG.maxFailures; i++) {
      await recordLoginFailure(redis, username, CONFIG);
    }

    const state = await checkLoginThrottle(redis, username, CONFIG);
    expect(state.throttled).toBe(true);
    expect(state.retryAfterS).toBeGreaterThanOrEqual(1);
    expect(state.retryAfterS).toBeLessThanOrEqual(WINDOW_S);
  });

  it("reports crossedThreshold only on the failure that arms the throttle", async () => {
    const username = uid();
    const first = await recordLoginFailure(redis, username, CONFIG);
    const second = await recordLoginFailure(redis, username, CONFIG);
    const third = await recordLoginFailure(redis, username, CONFIG);
    const fourth = await recordLoginFailure(redis, username, CONFIG);

    expect(first).toEqual({ failures: 1, crossedThreshold: false });
    expect(second).toEqual({ failures: 2, crossedThreshold: false });
    expect(third).toEqual({ failures: 3, crossedThreshold: true });
    expect(fourth).toEqual({ failures: 4, crossedThreshold: false });
  });

  it("shares one window across case variants of the same username", async () => {
    const username = `Case-${uid()}`;
    for (let i = 0; i < CONFIG.maxFailures; i++) {
      await recordLoginFailure(redis, username.toUpperCase(), CONFIG);
    }

    const state = await checkLoginThrottle(redis, username.toLowerCase(), CONFIG);
    expect(state.throttled).toBe(true);
  });
});

describe("window expiry", () => {
  it("unthrottles after the window slides past the failures", async () => {
    const username = uid();
    const t0 = Date.now();
    for (let i = 0; i < CONFIG.maxFailures; i++) {
      await recordLoginFailure(redis, username, CONFIG, t0);
    }

    const during = await checkLoginThrottle(redis, username, CONFIG, t0);
    expect(during.throttled).toBe(true);

    const after = await checkLoginThrottle(redis, username, CONFIG, t0 + WINDOW_S * 1000 + 1000);
    expect(after).toEqual({ throttled: false, retryAfterS: 0 });
  });

  it("only counts failures inside the window", async () => {
    const username = uid();
    const t0 = Date.now();
    await recordLoginFailure(redis, username, CONFIG, t0);
    await recordLoginFailure(redis, username, CONFIG, t0);
    await recordLoginFailure(redis, username, CONFIG, t0 + 600_000);

    // At t0 + 901s the two t0 failures have aged out; one remains.
    const state = await checkLoginThrottle(redis, username, CONFIG, t0 + 901_000);
    expect(state.throttled).toBe(false);
  });

  it("computes retryAfterS from the failure whose expiry re-opens the window", async () => {
    const username = uid();
    const t0 = Date.now();
    for (let i = 0; i < CONFIG.maxFailures; i++) {
      await recordLoginFailure(redis, username, CONFIG, t0);
    }

    // All three failures sit at t0, so the window re-opens when the oldest
    // ages out at t0 + 900s. Checked 100s in: 800s to go.
    const state = await checkLoginThrottle(redis, username, CONFIG, t0 + 100_000);
    expect(state.throttled).toBe(true);
    expect(state.retryAfterS).toBe(800);
  });

  it("uses the correct pivot when failures exceed the threshold", async () => {
    const username = uid();
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) {
      await recordLoginFailure(redis, username, CONFIG, t0 + i * 1000);
    }

    // 5 failures, threshold 3: the count drops to 2 once the failure at
    // t0 + 2s expires, i.e. at t0 + 2s + 900s. Checked at t0 + 10s: 892s.
    const state = await checkLoginThrottle(redis, username, CONFIG, t0 + 10_000);
    expect(state.throttled).toBe(true);
    expect(state.retryAfterS).toBe(892);
  });
});

describe("reset on success", () => {
  it("clearLoginFailures empties the window", async () => {
    const username = uid();
    for (let i = 0; i < CONFIG.maxFailures; i++) {
      await recordLoginFailure(redis, username, CONFIG);
    }
    expect((await checkLoginThrottle(redis, username, CONFIG)).throttled).toBe(true);

    await clearLoginFailures(redis, username, CONFIG);

    expect((await checkLoginThrottle(redis, username, CONFIG)).throttled).toBe(false);
    // The next failure starts a fresh window rather than re-arming instantly.
    const next = await recordLoginFailure(redis, username, CONFIG);
    expect(next).toEqual({ failures: 1, crossedThreshold: false });
  });

  it("clears case variants through the shared lowercase key", async () => {
    const username = `Case-${uid()}`;
    for (let i = 0; i < CONFIG.maxFailures; i++) {
      await recordLoginFailure(redis, username.toUpperCase(), CONFIG);
    }

    await clearLoginFailures(redis, username.toLowerCase(), CONFIG);

    expect((await checkLoginThrottle(redis, username, CONFIG)).throttled).toBe(false);
  });
});

describe("maxFailures 0 disables", () => {
  const disabled: LoginThrottleConfig = { maxFailures: 0, windowS: WINDOW_S };

  it("never throttles and records nothing when disabled", async () => {
    const username = uid();
    const record = await recordLoginFailure(redis, username, disabled);
    expect(record).toEqual({ failures: 0, crossedThreshold: false });

    expect(await redis.exists(loginThrottleKey(username))).toBe(0);
    expect(await checkLoginThrottle(redis, username, disabled)).toEqual({
      throttled: false,
      retryAfterS: 0,
    });
  });

  it("ignores failures recorded while a threshold was active", async () => {
    const username = uid();
    for (let i = 0; i < CONFIG.maxFailures; i++) {
      await recordLoginFailure(redis, username, CONFIG);
    }

    const state = await checkLoginThrottle(redis, username, disabled);
    expect(state).toEqual({ throttled: false, retryAfterS: 0 });
  });

  it("clearLoginFailures never touches redis when disabled", async () => {
    const del = vi.fn();
    const stub = { del } as unknown as Redis;

    await clearLoginFailures(stub, uid(), disabled);

    expect(del).not.toHaveBeenCalled();
  });
});

describe("redis command failures fail closed", () => {
  /**
   * Stub whose multi().exec() resolves the way ioredis reports command-level
   * failures (WRONGTYPE, OOM, LOADING): a fulfilled promise of [err, result]
   * tuples, or null when the transaction aborts. The throttle must reject in
   * both cases; coalescing them into "not throttled" / "0 failures" would
   * fail the brake open.
   */
  const stubRedis = (execResult: [Error | null, unknown][] | null): Redis => {
    const multi = {
      zremrangebyscore: () => multi,
      zrange: () => multi,
      zadd: () => multi,
      zcard: () => multi,
      expire: () => multi,
      exec: async () => execResult,
    };
    return { multi: () => multi } as unknown as Redis;
  };

  const wrongType = new Error("WRONGTYPE Operation against a key holding the wrong kind of value");

  it("checkLoginThrottle rejects when a command in the transaction errors", async () => {
    const stub = stubRedis([
      [null, 0],
      [wrongType, null],
    ]);
    await expect(checkLoginThrottle(stub, uid(), CONFIG)).rejects.toThrow(/WRONGTYPE/);
  });

  it("recordLoginFailure rejects when a command in the transaction errors", async () => {
    const stub = stubRedis([
      [null, 0],
      [wrongType, null],
      [null, 1],
      [null, 1],
    ]);
    await expect(recordLoginFailure(stub, uid(), CONFIG)).rejects.toThrow(/WRONGTYPE/);
  });

  it("both reject when exec() resolves null (transaction aborted)", async () => {
    await expect(checkLoginThrottle(stubRedis(null), uid(), CONFIG)).rejects.toThrow(/aborted/);
    await expect(recordLoginFailure(stubRedis(null), uid(), CONFIG)).rejects.toThrow(/aborted/);
  });
});
