/**
 * LOGIN_ATTEMPT_LIMIT=0 and API_KEYS_RATE_LIMIT_PER_MIN=0 follow the repo rule
 * that 0 means unlimited. @fastify/rate-limit treats a literal max of 0 as
 * "block all", so before #5201 both answered 429 to the very first request.
 */
import { describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  AUTH_ENABLED: false,
  DEFAULT_USERNAME: "admin",
  DEFAULT_PASSWORD: "Adminpass1",
  SKIP_MUST_CHANGE_PASSWORD: true,
  SESSION_DURATION_HOURS: 168,
  RATE_LIMIT_PER_MIN: 1000,
  LOGIN_ATTEMPT_LIMIT: 0,
  API_KEYS_RATE_LIMIT_PER_MIN: 0,
  MAX_USERS: 50,
  EXTERNAL_URL: "",
}));

vi.mock("../../../apps/api/src/config.js", () => ({ env }));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    // No loginAttemptLimit row, so the login route falls back to the env value.
    select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    delete: () => ({ where: () => Promise.resolve() }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  },
  pool: {},
  closeDb: async () => {},
  schema: {
    users: { id: {}, username: {}, role: {} },
    sessions: { id: {}, userId: {} },
    settings: { key: {} },
    apiKeys: { id: {}, userId: {}, keyPrefix: {} },
    teams: { id: {}, name: {} },
    roles: { name: {} },
    auditLog: {},
  },
}));

vi.mock("../../../apps/api/src/lib/audit.js", () => ({
  auditLog: vi.fn(),
  auditFromRequest: () => vi.fn(),
  sanitizeAuditInput: (value: string) => value,
}));

import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import {
  rateLimitMax,
  UNLIMITED_RATE_LIMIT_MAX,
} from "../../../apps/api/src/lib/rate-limit-max.js";
import { authRoutes } from "../../../apps/api/src/plugins/auth.js";
import { apiKeyRoutes } from "../../../apps/api/src/routes/api-keys.js";

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(rateLimit, { max: 1000, timeWindow: "1 minute" });
  await authRoutes(app);
  await apiKeyRoutes(app);
  await app.ready();
  return app;
}

describe("rateLimitMax", () => {
  it("passes a positive per-minute limit through", () => {
    expect(rateLimitMax(30)).toBe(30);
  });

  it("maps 0 to the unlimited ceiling instead of a block-all max", () => {
    expect(rateLimitMax(0)).toBe(UNLIMITED_RATE_LIMIT_MAX);
  });
});

describe("zero rate-limit env vars mean unlimited (#5201)", () => {
  it("LOGIN_ATTEMPT_LIMIT=0 does not refuse the first login", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "Adminpass1" },
    });
    await app.close();

    // AUTH_ENABLED=false answers 403 from the handler; a 429 means the
    // per-route limiter blocked the request before it got there.
    expect(res.statusCode).toBe(403);
  });

  it("API_KEYS_RATE_LIMIT_PER_MIN=0 does not refuse the first API key request", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/api-keys" });
    await app.close();

    // No session, so requireAuth answers 401 once the limiter lets it through.
    expect(res.statusCode).toBe(401);
  });
});
