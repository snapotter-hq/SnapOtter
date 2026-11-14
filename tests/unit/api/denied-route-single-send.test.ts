/**
 * A route that denies through a helper must send its 401/403 exactly once.
 *
 * The permission helpers (requirePermission, requireFullAdmin, requireAuth,
 * scimAuth, ...) send the denial themselves and return null or false. When the
 * async handler then resolves undefined (`if (!user) return;`), Fastify's
 * wrapThenable calls reply.send(undefined) again while the app's async onSend
 * hooks are still running, and logs "Reply was already sent" on every denied
 * request (#4657, same mechanism as #4656). The handler has to return the reply.
 *
 * Every other route is covered structurally by reply-return-drift.test.ts;
 * these pin the runtime behaviour on representative routes.
 */
import { Writable } from "node:stream";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {},
  pool: {},
  closeDb: async () => {},
  schema: {},
}));
vi.mock("../../../apps/api/src/jobs/connection.js", () => ({ sharedRedis: () => ({}) }));

const { adminOpsRoutes } = await import("../../../apps/api/src/routes/admin-ops.js");
const { auditLogRoutes } = await import("../../../apps/api/src/routes/audit-log.js");
const { rolesRoutes } = await import("../../../apps/api/src/routes/roles.js");
const { teamsRoutes } = await import("../../../apps/api/src/routes/teams.js");
const { registerGdprRoutes } = await import("../../../apps/api/src/routes/enterprise/gdpr.js");
const { registerIpAllowlistRoutes } = await import(
  "../../../apps/api/src/routes/enterprise/ip-allowlist.js"
);
const { registerLegalHoldRoutes } = await import(
  "../../../apps/api/src/routes/enterprise/legal-hold.js"
);
const { registerScimRoutes } = await import("../../../apps/api/src/routes/enterprise/scim.js");
const { registerWebhookRoutes } = await import(
  "../../../apps/api/src/routes/enterprise/webhooks.js"
);

const logLines: Array<{ msg?: string; err?: { message?: string } }> = [];
const sink = new Writable({
  write(chunk, _encoding, callback) {
    for (const line of String(chunk).split("\n")) {
      if (line.trim()) logLines.push(JSON.parse(line));
    }
    callback();
  },
});

const app = Fastify({ logger: { level: "warn", stream: sink } });

beforeAll(async () => {
  // Stands in for the auth plugin: a built-in role resolves its permissions
  // without the database, so "user" is a signed-in caller without admin rights.
  app.addHook("onRequest", async (request) => {
    const role = request.headers["x-test-role"];
    if (typeof role === "string") {
      (request as typeof request & { user: unknown }).user = {
        id: "test-user",
        username: "test",
        role,
      };
    }
  });
  // Stand-in for the app's async onSend hooks (security headers, response
  // envelope, inline tool audit). It waits a macrotask, as a hook doing real IO
  // does, so the handler resolves while the first send is still in flight.
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("x-test-hook", "1");
    await new Promise((resolve) => setImmediate(resolve));
    return payload;
  });
  await app.register(adminOpsRoutes);
  await app.register(auditLogRoutes);
  await app.register(rolesRoutes);
  await app.register(teamsRoutes);
  await app.register(registerGdprRoutes);
  await app.register(registerIpAllowlistRoutes);
  await app.register(registerLegalHoldRoutes);
  await app.register(registerScimRoutes);
  await app.register(registerWebhookRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

async function settledDoubleSends() {
  // inject resolves on the first end(); let a losing second send settle and log.
  await new Promise((resolve) => setImmediate(resolve));
  return logLines.filter(
    (line) =>
      /already sent/i.test(line.msg ?? "") ||
      /already sent|headers after they are sent/i.test(line.err?.message ?? ""),
  );
}

const ROUTES = [
  ["requirePermission", "GET", "/api/v1/admin/log-level", "FORBIDDEN"],
  ["requirePermission", "POST", "/api/v1/admin/log-level", "FORBIDDEN"],
  ["requirePermission", "GET", "/api/v1/audit-log", "FORBIDDEN"],
  ["requirePermission", "GET", "/api/v1/roles", "FORBIDDEN"],
  ["requirePermission", "GET", "/api/v1/teams", "FORBIDDEN"],
  ["requirePermission", "POST", "/api/v1/enterprise/users/u1/export", "FORBIDDEN"],
  ["requirePermission", "GET", "/api/v1/enterprise/ip-allowlist", "FORBIDDEN"],
  ["requirePermission", "GET", "/api/v1/enterprise/legal-hold", "FORBIDDEN"],
  ["requirePermission", "GET", "/api/v1/enterprise/webhooks", "FORBIDDEN"],
  ["requireFullAdmin", "POST", "/api/v1/enterprise/scim/token", "ESCALATION_DENIED"],
] as const;

describe("denied requests send once", () => {
  it.each(ROUTES)("%s on %s %s answers 401 once without a session", async (_h, method, url) => {
    logLines.length = 0;
    const res = await app.inject({ method, url, payload: method === "POST" ? {} : undefined });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: "AUTH_REQUIRED" });
    expect(res.headers["x-test-hook"]).toBe("1");
    expect(await settledDoubleSends()).toEqual([]);
  });

  it.each(ROUTES)("%s on %s %s answers 403 once for a non-admin", async (_h, method, url, code) => {
    logLines.length = 0;
    const res = await app.inject({
      method,
      url,
      headers: { "x-test-role": "user" },
      payload: method === "POST" ? {} : undefined,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code });
    expect(res.headers["x-test-hook"]).toBe("1");
    expect(await settledDoubleSends()).toEqual([]);
  });
});
