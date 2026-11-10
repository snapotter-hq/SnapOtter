/**
 * The auth hook must reject a request with no valid credentials before Fastify
 * reads its body, or an anonymous caller can make any protected JSON route
 * buffer and parse up to the upload-sized bodyLimit first (#4543).
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

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    // Every lookup misses: no session and no API key matches.
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

vi.mock("../../../apps/api/src/config.js", () => ({ env }));

vi.mock("../../../apps/api/src/lib/audit.js", () => ({
  auditLog: vi.fn(),
  auditFromRequest: () => vi.fn(),
}));

import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { authMiddleware, getAuthUser } from "../../../apps/api/src/plugins/auth.js";

async function buildApp(opts: { rateLimitMax?: number } = {}) {
  const parse = vi.fn();
  const app = Fastify({ logger: false });
  if (opts.rateLimitMax)
    await app.register(rateLimit, { max: opts.rateLimitMax, timeWindow: "1 minute" });
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    parse();
    done(null, JSON.parse(body as string));
  });
  await authMiddleware(app);
  let seenUser: ReturnType<typeof getAuthUser> = null;
  const handler = async (request: Parameters<typeof getAuthUser>[0]) => {
    seenUser = getAuthUser(request);
    return { body: request.body };
  };
  app.put("/api/v1/settings", handler);
  app.post("/api/auth/login", handler);
  await app.ready();
  return { app, parse, user: () => seenUser };
}

afterEach(() => {
  env.AUTH_ENABLED = true;
});

describe("auth hook ordering (#4543)", () => {
  it("answers 401 to an anonymous JSON body without parsing it", async () => {
    const { app, parse } = await buildApp();
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ filler: "a".repeat(64 * 1024) }),
    });
    await app.close();

    expect(res.statusCode).toBe(401);
    expect(parse).not.toHaveBeenCalled();
  });

  it("answers 401 to an unknown bearer token without parsing the body", async () => {
    const { app, parse } = await buildApp();
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: "Bearer not-a-session", "content-type": "application/json" },
      payload: JSON.stringify({ a: 1 }),
    });
    await app.close();

    expect(res.statusCode).toBe(401);
    expect(parse).not.toHaveBeenCalled();
  });

  it("still parses the body on a public route with no credentials", async () => {
    const { app, parse } = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ username: "admin" }),
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(parse).toHaveBeenCalledOnce();
    expect(JSON.parse(res.body).body).toEqual({ username: "admin" });
  });

  it("still parses the body for the anonymous admin when AUTH_ENABLED=false", async () => {
    env.AUTH_ENABLED = false;
    const { app, parse, user } = await buildApp();
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ a: 1 }),
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(parse).toHaveBeenCalledOnce();
    expect(JSON.parse(res.body).body).toEqual({ a: 1 });
    expect(user()?.username).toBe("anonymous");
  });

  it("still counts anonymous 401s against the global rate limit", async () => {
    // @fastify/rate-limit runs as a route-level onRequest hook, so an auth
    // hook on instance-level onRequest would answer first and skip it.
    const { app } = await buildApp({ rateLimitMax: 2 });
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({
        method: "PUT",
        url: "/api/v1/settings",
        headers: { "content-type": "application/json" },
        payload: "{}",
      });
      statuses.push(res.statusCode);
    }
    await app.close();

    expect(statuses).toEqual([401, 401, 429]);
  });
});
