import { describe, expect, it, vi } from "vitest";

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ get: () => null, all: () => [] }),
        all: () => [],
      }),
    }),
    insert: () => ({
      values: () => ({ onConflictDoNothing: () => ({ run: vi.fn() }), run: vi.fn() }),
    }),
    delete: () => ({ where: () => ({ run: vi.fn() }) }),
    update: () => ({ set: () => ({ where: () => ({ run: vi.fn() }) }) }),
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

vi.mock("../../../apps/api/src/config.js", () => ({
  env: {
    AUTH_ENABLED: false,
    DEFAULT_USERNAME: "admin",
    DEFAULT_PASSWORD: "Adminpass1",
    SKIP_MUST_CHANGE_PASSWORD: false,
    SESSION_DURATION_HOURS: 168,
    RATE_LIMIT_PER_MIN: 10000,
    LOGIN_ATTEMPT_LIMIT: 500,
    MAX_USERS: 50,
  },
}));

vi.mock("../../../apps/api/src/lib/audit.js", () => ({
  auditLog: vi.fn(),
}));

import Fastify from "fastify";
import { hasPermission } from "../../../apps/api/src/permissions.js";
import { authMiddleware, authRoutes, getAuthUser } from "../../../apps/api/src/plugins/auth.js";

describe("anonymous user when AUTH_ENABLED=false", () => {
  it("assigns admin role to anonymous user", async () => {
    const app = Fastify({ logger: false });

    await authMiddleware(app);

    let capturedUser: ReturnType<typeof getAuthUser> = null;
    app.get("/test", (request, reply) => {
      capturedUser = getAuthUser(request);
      reply.send({ ok: true });
    });

    await app.ready();
    await app.inject({ method: "GET", url: "/test" });
    await app.close();

    expect(capturedUser).not.toBeNull();
    expect(capturedUser?.role).toBe("admin");
    expect(capturedUser?.username).toBe("anonymous");
  });

  it("anonymous admin has settings:write permission", async () => {
    expect(await hasPermission("admin", "settings:write")).toBe(true);
  });

  it("anonymous admin has all admin permissions", async () => {
    const adminPerms = [
      "tools:use",
      "files:own",
      "files:all",
      "apikeys:own",
      "apikeys:all",
      "pipelines:own",
      "pipelines:all",
      "settings:read",
      "settings:write",
      "users:manage",
      "teams:manage",
      "features:manage",
      "system:health",
      "audit:read",
    ] as const;

    for (const perm of adminPerms) {
      expect(await hasPermission("admin", perm)).toBe(true);
    }
  });

  it("anonymous admin can pass requirePermission('settings:write')", async () => {
    const { requirePermission } = await import("../../../apps/api/src/permissions.js");

    const user = { id: "anonymous", username: "anonymous", role: "admin" as const };
    const req = { user } as never;
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() } as never;

    const result = await requirePermission("settings:write")(req, reply);
    expect(result).toEqual(user);
    expect((reply as { status: ReturnType<typeof vi.fn> }).status).not.toHaveBeenCalled();
  });
});

describe("session endpoint when AUTH_ENABLED=false", () => {
  it("GET /api/auth/session returns admin role", async () => {
    const app = Fastify({ logger: false });

    await authMiddleware(app);
    await authRoutes(app);
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/api/auth/session" });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.role).toBe("admin");
    expect(body.user.username).toBe("anonymous");
    expect(body.user.permissions).toContain("settings:write");
    expect(body.user.permissions).toContain("users:manage");
  });

  it("GET /api/auth/session returns null expiresAt", async () => {
    const app = Fastify({ logger: false });

    await authMiddleware(app);
    await authRoutes(app);
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/api/auth/session" });
    await app.close();

    const body = JSON.parse(res.body);
    expect(body.expiresAt).toBeNull();
  });
});
