/**
 * Per-user rate limiting using Redis sliding window (sorted sets).
 *
 * Runs AFTER auth middleware so `request.user` is populated.
 * Only applies to authenticated users on /api/ routes.
 * The limit is controlled by the `rateLimitPerUser` DB setting (0 = unlimited).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sharedRedis } from "../jobs/connection.js";
import { getSettingStrict, parseNumericSettingValue } from "../lib/settings-helpers.js";
import { getAuthUser } from "./auth.js";

const WINDOW_MS = 60_000; // 1-minute sliding window

export async function registerPerUserRateLimit(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getAuthUser(request);
    if (!user) return; // Anonymous/public requests skip per-user limits

    // Only rate-limit API routes
    if (!request.url.startsWith("/api/")) return;

    const rateLimitPerUser = parseNumericSettingValue(
      "rateLimitPerUser",
      await getSettingStrict("rateLimitPerUser"),
      0,
    );
    if (rateLimitPerUser <= 0) return; // 0 = unlimited

    const redis = sharedRedis();
    const key = `ratelimit:user:${user.id}`;
    const now = Date.now();

    // Sliding window using Redis sorted set:
    // 1. Remove entries older than the window
    // 2. Add current request with timestamp as score
    // 3. Count entries in the window
    // 4. Set TTL slightly longer than window for cleanup
    const multi = redis.multi();
    multi.zremrangebyscore(key, 0, now - WINDOW_MS);
    multi.zadd(key, now, `${now}:${Math.random()}`);
    multi.zcard(key);
    multi.expire(key, 61);
    const results = await multi.exec();

    // multi.exec() returns [[err, result], ...] for each command
    const requestCount = (results?.[2]?.[1] as number) ?? 0;

    // Set standard rate limit headers
    reply.header("X-RateLimit-Limit", rateLimitPerUser);
    reply.header("X-RateLimit-Remaining", Math.max(0, rateLimitPerUser - requestCount));
    reply.header("X-RateLimit-Reset", Math.ceil((now + WINDOW_MS) / 1000));

    if (requestCount > rateLimitPerUser) {
      return reply.status(429).send({
        error: "Rate limit exceeded",
        retryAfter: Math.ceil(WINDOW_MS / 1000),
      });
    }
  });
}
