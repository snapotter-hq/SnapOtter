/**
 * sessions.id holds sha256(token), never the token itself, so a read of the
 * table (or of the Redis idle keys) is not a working login (#4579). The client
 * keeps presenting the raw token and the auth hook hashes it before the lookup.
 */
import { createHash } from "node:crypto";
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

const state = vi.hoisted(() => ({
  sessions: [] as Array<{ id: string; userId: string; expiresAt: Date; lastActivity: Date | null }>,
  idleTimeoutMinutes: "0",
  redisKeys: [] as string[],
}));

const schema = vi.hoisted(() => ({
  users: { id: { name: "users.id" }, username: {}, role: {} },
  sessions: { id: { name: "sessions.id" }, userId: {} },
  settings: { key: {} },
  apiKeys: { id: {}, userId: {}, keyPrefix: {} },
  teams: { id: {}, name: {} },
  roles: { name: {} },
  auditLog: {},
}));

vi.mock("drizzle-orm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("drizzle-orm")>()),
  eq: (column: unknown, value: unknown) => ({ column, value }),
}));

vi.mock("../../../apps/api/src/db/index.js", () => {
  type Cond = { column: unknown; value: unknown };
  const rowsFor = (table: unknown, cond: Cond) => {
    if (table === schema.sessions && cond.column === schema.sessions.id) {
      return state.sessions.filter((s) => s.id === cond.value);
    }
    if (table === schema.users && cond.column === schema.users.id) {
      return cond.value === "u1" ? [{ id: "u1", username: "alice", role: "admin" }] : [];
    }
    return [];
  };
  return {
    db: {
      select: () => ({
        from: (table: unknown) => ({
          where: (cond: Cond) => Promise.resolve(rowsFor(table, cond)),
        }),
      }),
      delete: () => ({ where: () => Promise.resolve() }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    },
    pool: {},
    closeDb: async () => {},
    schema,
  };
});

vi.mock("../../../apps/api/src/config.js", () => ({ env }));

vi.mock("../../../apps/api/src/lib/audit.js", () => ({
  auditLog: vi.fn(),
  auditFromRequest: () => vi.fn(),
}));

vi.mock("../../../apps/api/src/lib/settings-helpers.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/lib/settings-helpers.js")>()),
  getSettingStrict: async (key: string) =>
    key === "sessionIdleTimeoutMinutes" ? state.idleTimeoutMinutes : null,
}));

vi.mock("../../../apps/api/src/jobs/connection.js", () => ({
  sharedRedis: () => ({
    get: async () => null,
    setex: async (key: string) => {
      state.redisKeys.push(key);
      return "OK";
    },
    set: async () => "OK",
  }),
}));

import Fastify from "fastify";
import { hashSessionToken } from "../../../apps/api/src/lib/session-token.js";
import { authMiddleware, getAuthUser } from "../../../apps/api/src/plugins/auth.js";

const RAW_SESSION_ID = "3f2b8c1e-9a4d-4e7b-8c2f-1d5e6a7b8c9d";
const DIGEST = createHash("sha256").update(RAW_SESSION_ID).digest("hex");

async function whoAmI(bearer: string) {
  const app = Fastify({ logger: false });
  await authMiddleware(app);
  app.get("/api/v1/me", async (request) => ({ user: getAuthUser(request)?.username ?? null }));
  await app.ready();
  const res = await app.inject({
    method: "GET",
    url: "/api/v1/me",
    headers: { authorization: `Bearer ${bearer}` },
  });
  await app.close();
  return res;
}

afterEach(() => {
  state.sessions = [];
  state.idleTimeoutMinutes = "0";
  state.redisKeys = [];
});

describe("hashSessionToken (#4579)", () => {
  it("is the lowercase hex sha256 of the token, matching migration 0013", () => {
    expect(hashSessionToken(RAW_SESSION_ID)).toBe(DIGEST);
    expect(hashSessionToken(RAW_SESSION_ID)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is never the token itself", () => {
    expect(hashSessionToken(RAW_SESSION_ID)).not.toBe(RAW_SESSION_ID);
  });
});

describe("auth hook session lookup (#4579)", () => {
  function storeSession() {
    state.sessions.push({
      id: DIGEST,
      userId: "u1",
      expiresAt: new Date(Date.now() + 60_000),
      lastActivity: null,
    });
  }

  it("authenticates the raw token against the stored digest", async () => {
    storeSession();
    const res = await whoAmI(RAW_SESSION_ID);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ user: "alice" });
  });

  it("rejects the stored value presented as a bearer token", async () => {
    storeSession();
    const res = await whoAmI(DIGEST);
    expect(res.statusCode).toBe(401);
  });

  it("keys the Redis idle entry by digest, not by the raw token", async () => {
    storeSession();
    state.idleTimeoutMinutes = "30";
    const res = await whoAmI(RAW_SESSION_ID);
    expect(res.statusCode).toBe(200);
    expect(state.redisKeys).toEqual([`session:idle:${DIGEST}`]);
  });
});
