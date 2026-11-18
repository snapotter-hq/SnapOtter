/**
 * The OIDC login and callback routes end most failures with
 * `return redirectToLogin(reply, code)`. While that helper returned void, the
 * async handler resolved undefined after reply.redirect() had started sending,
 * so Fastify sent a second time while the app's async onSend hooks ran, and
 * the second writeHead threw ERR_HTTP_HEADERS_SENT (the same fault as Sentry
 * NODE-A3 on /llms.txt). Each failure redirect must send exactly once.
 */
import { Writable } from "node:stream";
import cookie from "@fastify/cookie";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {},
  pool: {},
  closeDb: async () => {},
  schema: {},
}));
vi.mock("../../../apps/api/src/jobs/connection.js", () => ({ sharedRedis: {} }));
vi.mock("../../../apps/api/src/lib/error-report.js", () => ({
  reportError: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../apps/api/src/lib/analytics.js", () => ({
  trackEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../apps/api/src/lib/audit.js", () => ({
  auditFromRequest: () => async () => {},
  sanitizeAuditInput: (value: string) => value,
}));

const { env } = await import("../../../apps/api/src/config.js");
const { oidcRoutes, resetOidcDiscoveryCacheForTests } = await import(
  "../../../apps/api/src/plugins/oidc.js"
);

const mutableEnv = env as unknown as Record<string, unknown>;
const ORIGINAL = {
  OIDC_ENABLED: env.OIDC_ENABLED,
  OIDC_ISSUER_URL: env.OIDC_ISSUER_URL,
  OIDC_CLIENT_ID: env.OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET: env.OIDC_CLIENT_SECRET,
  EXTERNAL_URL: env.EXTERNAL_URL,
};

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
  mutableEnv.OIDC_ENABLED = true;
  // Nothing listens on port 1, so discovery fails fast with ECONNREFUSED.
  mutableEnv.OIDC_ISSUER_URL = "http://127.0.0.1:1/realms/test";
  mutableEnv.OIDC_CLIENT_ID = "test-client-id";
  mutableEnv.OIDC_CLIENT_SECRET = "test-client-secret";
  mutableEnv.EXTERNAL_URL = "http://localhost:1349";
  resetOidcDiscoveryCacheForTests();
  await app.register(cookie, { secret: "test-cookie-secret" });
  // Stand-in for the app's async onSend hooks (security headers, response
  // envelope, inline tool audit): any async hook opens the double-send window.
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("x-test-hook", "1");
    await Promise.resolve();
    return payload;
  });
  await app.register(oidcRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  Object.assign(mutableEnv, ORIGINAL);
  resetOidcDiscoveryCacheForTests();
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

describe("OIDC failure redirects send once", () => {
  it("login with an unreachable IdP redirects to the login error once", async () => {
    logLines.length = 0;
    const res = await app.inject({ method: "GET", url: "/api/auth/oidc/login" });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/login?error=oidc_provider_unreachable");
    expect(res.headers["x-test-hook"]).toBe("1");
    expect(await settledDoubleSends()).toEqual([]);
  });

  it("callback without a state cookie redirects to the login error once", async () => {
    logLines.length = 0;
    const res = await app.inject({ method: "GET", url: "/api/auth/oidc/callback?state=x" });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/login?error=oidc_session_expired");
    expect(await settledDoubleSends()).toEqual([]);
  });
});
