import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks: the plugin depends on getAuthUser (auth), sharedRedis (BullMQ Redis
// connection), and getSettingNumber (DB-backed settings). Mocking all three
// lets us drive every branch of the preHandler deterministically, without a
// real Redis instance or the timing flakiness of a sliding-window counter.
// ---------------------------------------------------------------------------

type AuthUser = { id: string; username: string; role: string } | null;

let mockUser: AuthUser = null;
let mockRateLimit = 0;
let mockZcardResult: number | null = 0;
// When true, multi.exec() resolves to null (a Redis MULTI abort / WATCH fail).
let mockExecReturnsNull = false;

const zremrangebyscore = vi.fn();
const zadd = vi.fn();
const zcard = vi.fn();
const expire = vi.fn();
const exec = vi.fn();

function makeMulti() {
  const multi = {
    zremrangebyscore: (...args: unknown[]) => {
      zremrangebyscore(...args);
      return multi;
    },
    zadd: (...args: unknown[]) => {
      zadd(...args);
      return multi;
    },
    zcard: (...args: unknown[]) => {
      zcard(...args);
      return multi;
    },
    expire: (...args: unknown[]) => {
      expire(...args);
      return multi;
    },
    exec: async () => {
      exec();
      if (mockExecReturnsNull) return null;
      // Real ioredis shape: [[err, result], ...] positionally per command.
      // Index 2 is the zcard result the plugin reads.
      return [
        [null, 0],
        [null, 1],
        [null, mockZcardResult],
        [null, 1],
      ];
    },
  };
  return multi;
}

const redisMulti = vi.fn(() => makeMulti());

vi.mock("../../../apps/api/src/plugins/auth.js", () => ({
  getAuthUser: () => mockUser,
}));

vi.mock("../../../apps/api/src/jobs/connection.js", () => ({
  sharedRedis: () => ({ multi: redisMulti }),
}));

vi.mock("../../../apps/api/src/lib/settings-helpers.js", () => ({
  getSettingNumber: vi.fn(async () => mockRateLimit),
}));

import { registerPerUserRateLimit } from "../../../apps/api/src/plugins/per-user-rate-limit.js";

// light-my-request may surface a numeric header as either "10" or 10 depending
// on version; coerce so value assertions stay strict without depending on that.
function headerNum(value: string | string[] | number | undefined): number {
  if (Array.isArray(value)) return Number(value[0]);
  return Number(value);
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await registerPerUserRateLimit(app);
  // A couple of terminal routes so requests that pass the hook reach a handler.
  app.get("/api/v1/ping", async () => ({ ok: true }));
  app.get("/health", async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe("registerPerUserRateLimit", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    mockUser = { id: "user-1", username: "alice", role: "user" };
    mockRateLimit = 0;
    mockZcardResult = 0;
    mockExecReturnsNull = false;
    zremrangebyscore.mockClear();
    zadd.mockClear();
    zcard.mockClear();
    expire.mockClear();
    exec.mockClear();
    redisMulti.mockClear();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  // -- Branch: no authenticated user -> skip entirely -----------------------
  it("skips rate limiting for anonymous/public requests (no user)", async () => {
    mockUser = null;
    mockRateLimit = 5;
    app = await buildApp();

    const res = await app.inject({ method: "GET", url: "/api/v1/ping" });

    expect(res.statusCode).toBe(200);
    // No Redis work and no rate-limit headers when there is no user.
    expect(redisMulti).not.toHaveBeenCalled();
    expect(res.headers["x-ratelimit-limit"]).toBeUndefined();
  });

  // -- Branch: non-/api/ route -> skip --------------------------------------
  it("skips rate limiting for routes outside /api/", async () => {
    mockRateLimit = 5;
    app = await buildApp();

    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    expect(redisMulti).not.toHaveBeenCalled();
    expect(res.headers["x-ratelimit-limit"]).toBeUndefined();
  });

  // -- Branch: rateLimitPerUser <= 0 -> unlimited, skip ---------------------
  it("treats a limit of 0 as unlimited and skips Redis work", async () => {
    mockRateLimit = 0;
    app = await buildApp();

    const res = await app.inject({ method: "GET", url: "/api/v1/ping" });

    expect(res.statusCode).toBe(200);
    expect(redisMulti).not.toHaveBeenCalled();
    expect(res.headers["x-ratelimit-limit"]).toBeUndefined();
  });

  it("treats a negative limit as unlimited and skips Redis work", async () => {
    mockRateLimit = -1;
    app = await buildApp();

    const res = await app.inject({ method: "GET", url: "/api/v1/ping" });

    expect(res.statusCode).toBe(200);
    expect(redisMulti).not.toHaveBeenCalled();
  });

  // -- Branch: under limit -> pass, headers set -----------------------------
  it("allows a request under the limit and sets rate-limit headers", async () => {
    mockRateLimit = 10;
    mockZcardResult = 3; // 3 <= 10
    app = await buildApp();

    const res = await app.inject({ method: "GET", url: "/api/v1/ping" });

    expect(res.statusCode).toBe(200);
    expect(headerNum(res.headers["x-ratelimit-limit"])).toBe(10);
    // remaining = max(0, 10 - 3) = 7
    expect(headerNum(res.headers["x-ratelimit-remaining"])).toBe(7);
    expect(res.headers["x-ratelimit-reset"]).toBeDefined();
    // The full sliding-window pipeline ran.
    expect(zremrangebyscore).toHaveBeenCalledTimes(1);
    expect(zadd).toHaveBeenCalledTimes(1);
    expect(zcard).toHaveBeenCalledTimes(1);
    expect(expire).toHaveBeenCalledWith("ratelimit:user:user-1", 61);
  });

  // -- Boundary: count exactly equal to limit -> still allowed --------------
  it("allows a request exactly at the limit (count === limit)", async () => {
    mockRateLimit = 5;
    mockZcardResult = 5; // 5 > 5 is false, so allowed
    app = await buildApp();

    const res = await app.inject({ method: "GET", url: "/api/v1/ping" });

    expect(res.statusCode).toBe(200);
    expect(headerNum(res.headers["x-ratelimit-remaining"])).toBe(0);
  });

  // -- Branch: over limit -> 429 --------------------------------------------
  it("returns 429 when the request count exceeds the limit", async () => {
    mockRateLimit = 5;
    mockZcardResult = 6; // 6 > 5
    app = await buildApp();

    const res = await app.inject({ method: "GET", url: "/api/v1/ping" });

    expect(res.statusCode).toBe(429);
    const body = res.json();
    expect(body.error).toBe("Rate limit exceeded");
    expect(body.retryAfter).toBe(60);
    // Headers are still emitted on the 429 response.
    expect(headerNum(res.headers["x-ratelimit-limit"])).toBe(5);
    expect(headerNum(res.headers["x-ratelimit-remaining"])).toBe(0);
  });

  // -- Branch: multi.exec() returns null -> requestCount falls back to 0 ----
  it("falls back to a count of 0 when Redis MULTI returns null", async () => {
    mockRateLimit = 5;
    mockExecReturnsNull = true;
    app = await buildApp();

    const res = await app.inject({ method: "GET", url: "/api/v1/ping" });

    // Count defaults to 0, which is under the limit -> request passes.
    expect(res.statusCode).toBe(200);
    // remaining = max(0, 5 - 0) = 5
    expect(headerNum(res.headers["x-ratelimit-remaining"])).toBe(5);
  });

  // -- Branch: zcard result missing/undefined -> requestCount falls back ----
  it("falls back to a count of 0 when the zcard result is null", async () => {
    mockRateLimit = 5;
    mockZcardResult = null; // results[2][1] is null -> ?? 0
    app = await buildApp();

    const res = await app.inject({ method: "GET", url: "/api/v1/ping" });

    expect(res.statusCode).toBe(200);
    expect(headerNum(res.headers["x-ratelimit-remaining"])).toBe(5);
  });

  // -- Remaining clamps at 0 when count far exceeds limit -------------------
  it("clamps X-RateLimit-Remaining at 0 (never negative)", async () => {
    mockRateLimit = 2;
    mockZcardResult = 100; // way over
    app = await buildApp();

    const res = await app.inject({ method: "GET", url: "/api/v1/ping" });

    expect(res.statusCode).toBe(429);
    expect(headerNum(res.headers["x-ratelimit-remaining"])).toBe(0);
  });

  // -- Key derivation uses the authenticated user id ------------------------
  it("scopes the Redis key to the authenticated user id", async () => {
    mockUser = { id: "user-42", username: "bob", role: "admin" };
    mockRateLimit = 10;
    mockZcardResult = 1;
    app = await buildApp();

    await app.inject({ method: "GET", url: "/api/v1/ping" });

    expect(zremrangebyscore).toHaveBeenCalledWith("ratelimit:user:user-42", 0, expect.any(Number));
    expect(expire).toHaveBeenCalledWith("ratelimit:user:user-42", 61);
  });
});
