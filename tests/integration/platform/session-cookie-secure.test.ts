/**
 * Session cookie Secure flag (issue #817).
 *
 * The Secure attribute must be derived from the actual connection, not only
 * from EXTERNAL_URL: that env var defaults to "" and the shipped compose file
 * comments it out, so an HTTPS-behind-proxy install would otherwise get a
 * session cookie the browser also attaches to plain-http requests.
 *
 * Fastify resolves `request.protocol` from X-Forwarded-Proto when the peer is
 * trusted. The test app mirrors production's trustProxy setting, and inject()
 * requests originate from 127.0.0.1, which the default TRUST_PROXY policy
 * (loopback,linklocal,uniquelocal) trusts. Prior art for this seam:
 * tests/unit/security/trust-proxy-policy.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { buildTestApp, type TestApp } from "../test-server.js";

let testApp: TestApp;

beforeAll(async () => {
  testApp = await buildTestApp();
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

/** Log in and return the raw Set-Cookie header for the session cookie. */
async function loginSetCookie(
  opts: { headers?: Record<string, string>; remoteAddress?: string } = {},
): Promise<string> {
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "admin", password: "Adminpass1" },
    headers: opts.headers,
    ...(opts.remoteAddress ? { remoteAddress: opts.remoteAddress } : {}),
  });
  expect(res.statusCode).toBe(200);
  const raw = res.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const session = cookies.find((c) => c.startsWith("snapotter-session="));
  expect(session, "login must set the snapotter-session cookie").toBeDefined();
  return session as string;
}

const SECURE_ATTR = /;\s*Secure(;|$)/i;

describe("session cookie Secure flag", () => {
  it("stays non-Secure on a plain-http login with EXTERNAL_URL unset", async () => {
    // Plain-HTTP LAN installs are supported; browsers refuse to store Secure
    // cookies over http, so Secure here would break login outright.
    expect(env.EXTERNAL_URL).toBe("");
    const cookie = await loginSetCookie();
    expect(cookie).not.toMatch(SECURE_ATTR);
  });

  it("sets Secure when a trusted proxy forwarded an https request", async () => {
    const cookie = await loginSetCookie({ headers: { "x-forwarded-proto": "https" } });
    expect(cookie).toMatch(SECURE_ATTR);
  });

  it("ignores x-forwarded-proto from an untrusted public peer", async () => {
    const cookie = await loginSetCookie({
      headers: { "x-forwarded-proto": "https" },
      remoteAddress: "203.0.113.9",
    });
    expect(cookie).not.toMatch(SECURE_ATTR);
  });

  it("sets Secure from an https EXTERNAL_URL with no forwarded header", async () => {
    const orig = env.EXTERNAL_URL;
    (env as { EXTERNAL_URL: string }).EXTERNAL_URL = "https://snapotter.example.com";
    try {
      const cookie = await loginSetCookie();
      expect(cookie).toMatch(SECURE_ATTR);
    } finally {
      (env as { EXTERNAL_URL: string }).EXTERNAL_URL = orig;
    }
  });
});
