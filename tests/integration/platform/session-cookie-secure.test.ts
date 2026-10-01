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
import { parseExternalUrl } from "./sso-deployments.js";

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

  /** Log in with EXTERNAL_URL set as boot parses `typed`, return the session cookie. */
  async function loginWithExternalUrl(typed: string): Promise<string> {
    const orig = env.EXTERNAL_URL;
    (env as { EXTERNAL_URL: string }).EXTERNAL_URL = parseExternalUrl(typed);
    try {
      return await loginSetCookie();
    } finally {
      (env as { EXTERNAL_URL: string }).EXTERNAL_URL = orig;
    }
  }

  // The scheme is case-insensitive, so an uppercase spelling is still an
  // https origin. The prefix match on "https" missed it and dropped Secure
  // behind a proxy that sends no X-Forwarded-Proto (#1775).
  it.each(["HTTPS://snapotter.example.com", "Https://Snapotter.Example.com/"])(
    "sets Secure from an uppercase https EXTERNAL_URL %s",
    async (typed) => {
      expect(await loginWithExternalUrl(typed)).toMatch(SECURE_ATTR);
    },
  );

  // With SSO off EXTERNAL_URL isn't validated, and this typo got Secure from
  // the old prefix match, so parsing the scheme must not quietly take it away.
  it("keeps Secure for an unparseable EXTERNAL_URL that starts with https", async () => {
    expect(await loginWithExternalUrl("https//snapotter.example.com")).toMatch(SECURE_ATTR);
  });

  it("stays non-Secure for an uppercase plain-http EXTERNAL_URL", async () => {
    expect(await loginWithExternalUrl("HTTP://snapotter.example.com")).not.toMatch(SECURE_ATTR);
  });
});
