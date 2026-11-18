/**
 * With Postgres down, GET /api/v1/health must reach its own handler and answer
 * 503. The auth hook's session lookup and the per-user rate limiter's settings
 * read used to run first, throw, and turn every Docker healthcheck tick into a
 * 500 that went to Sentry (#4652, Sentry NODE-23 and NODE-AK).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  AUTH_ENABLED: true,
  DEFAULT_USERNAME: "admin",
  DEFAULT_PASSWORD: "Adminpass1",
  SKIP_MUST_CHANGE_PASSWORD: false,
  SESSION_DURATION_HOURS: 168,
  RATE_LIMIT_PER_MIN: 10000,
  LOGIN_ATTEMPT_LIMIT: 500,
  MAX_USERS: 50,
}));

const dbQueries = vi.hoisted(() => ({ count: 0 }));

vi.mock("../../../apps/api/src/db/index.js", () => {
  // Every query rejects the way pg does when the server refuses connections.
  const refuse = () => {
    dbQueries.count++;
    return Promise.reject(
      Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" }),
    );
  };
  // `.where()` is one query whether it is awaited or chained into `.limit()`.
  const where = () => {
    const query = refuse();
    query.catch(() => {});
    return Object.assign(query, { limit: () => query });
  };
  const from = () => ({ where, limit: refuse });
  return {
    db: {
      select: () => ({ from }),
      delete: () => ({ where }),
      update: () => ({ set: () => ({ where }) }),
    },
    pool: {},
    closeDb: async () => {},
    schema: {
      users: { id: {}, username: {}, role: {} },
      sessions: { id: {}, userId: {} },
      settings: { key: {}, value: {} },
      apiKeys: { id: {}, userId: {}, keyPrefix: {} },
      teams: { id: {}, name: {} },
      roles: { name: {} },
      auditLog: {},
    },
  };
});

vi.mock("../../../apps/api/src/config.js", () => ({ env }));

vi.mock("../../../apps/api/src/lib/audit.js", () => ({
  auditLog: vi.fn(),
  auditFromRequest: () => vi.fn(),
}));

vi.mock("../../../apps/api/src/jobs/connection.js", () => ({
  sharedRedis: () => {
    throw new Error("redis must not be reached");
  },
}));

import Fastify from "fastify";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { HEALTH_PROBE_ROUTE } from "../../../apps/api/src/lib/health-probe.js";
import { authMiddleware } from "../../../apps/api/src/plugins/auth.js";
import { registerPerUserRateLimit } from "../../../apps/api/src/plugins/per-user-rate-limit.js";

async function buildApp() {
  const app = Fastify({ logger: false });
  await authMiddleware(app);
  await registerPerUserRateLimit(app);
  // Same shape as the real handler in apps/api/src/index.ts.
  app.get(HEALTH_PROBE_ROUTE, async (_request, reply) => {
    let dbOk = false;
    try {
      await db.select().from(schema.settings).limit(1);
      dbOk = true;
    } catch {
      /* db unreachable */
    }
    return reply.code(dbOk ? 200 : 503).send({ status: dbOk ? "healthy" : "unhealthy" });
  });
  app.get("/api/v1/health-lookalike", async () => ({ ok: true }));
  await app.ready();
  return app;
}

afterEach(() => {
  env.AUTH_ENABLED = true;
  dbQueries.count = 0;
});

describe("health probe with Postgres down (#4652)", () => {
  it("answers 503 for a caller that sends a session token", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/health",
      headers: { authorization: "Bearer 00000000-0000-0000-0000-000000000000" },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "unhealthy" });
    // Only the handler's own probe touched the database.
    expect(dbQueries.count).toBe(1);
    await app.close();
  });

  it("answers 503 with AUTH_ENABLED=false, where every request has a user", async () => {
    env.AUTH_ENABLED = false;
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(res.statusCode).toBe(503);
    expect(dbQueries.count).toBe(1);
    await app.close();
  });

  it("answers 503 to a HEAD probe and ignores a query string", async () => {
    env.AUTH_ENABLED = false;
    const app = await buildApp();
    const head = await app.inject({ method: "HEAD", url: "/api/v1/health" });
    expect(head.statusCode).toBe(503);
    const qs = await app.inject({ method: "GET", url: "/api/v1/health?probe=1" });
    expect(qs.statusCode).toBe(503);
    await app.close();
  });

  it("keeps the session lookup on other routes, even ones that share the prefix", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/health-lookalike",
      headers: { authorization: "Bearer 00000000-0000-0000-0000-000000000000" },
    });
    expect(res.statusCode).toBe(500);
    expect(dbQueries.count).toBe(1);
    await app.close();
  });
});
