/**
 * Branch-coverage completion for the OIDC callback route
 * (apps/api/src/plugins/oidc.ts).
 *
 * The sibling files leave a handful of callback branches uncovered because
 * they need a controlled ID-token payload (no real signed JWT from a live
 * JWKS) or a cold discovery cache at callback time:
 *
 *   - getOrDiscoverConfig secure branch + discovery failure DURING the
 *     callback (oidc.ts:225-229), not just during login.
 *   - deriveUsername fallbacks (oidc.ts:62-91): configured claim, the
 *     preferred_username fallback when a *custom* claim key is configured but
 *     absent, the display-name fallback, and the bare-subject fallback.
 *   - resolveExternalUser "denied" outcomes surfaced by the callback
 *     (oidc.ts:282-288): user_not_authorized and user_limit_reached.
 *   - claims() returning no ID-token claims (oidc.ts:253-258).
 *   - the MFA policy lookup throwing (#815): the login fails *closed* with a
 *     distinct, retryable error, and the swallowed fault reaches reportError
 *     (#1789).
 *   - the resolver's retry-exhaustion throw (#978): caught, turned into a
 *     login failure, and reported (#1789), while any other resolver throw
 *     still surfaces as a 500 that the callback leaves to the global error
 *     handler.
 *   - RP-initiated logout (auth.ts POST /api/auth/logout): the logoutUrl built
 *     from the discovery cache the callback warms, including the
 *     post_logout_redirect_uri under a BASE_PATH prefix (#1355), and the
 *     line between an expected local-only logout (no ID token, OIDC off, no
 *     end_session_endpoint) and a fault building the URL, which must still
 *     log the user out but reach reportError (#1514). A cold discovery cache
 *     (an API restart, or a second replica) must discover on demand rather
 *     than skip the IdP logout, and a failed or slow discovery there must be
 *     reported while the local logout still goes through (#1787). An
 *     end_session_endpoint that already has a query string (Azure AD B2C's
 *     `?p=`) keeps it, with our two parameters set on it (#1788). Only an
 *     http(s) end_session_endpoint becomes a logoutUrl (https only on an https
 *     deployment); anything else, javascript: and data: included, is a
 *     reported local-only logout (#1855).
 *
 * Like oidc-mfa-callback.test.ts, the cryptographic token exchange is mocked
 * at the `openid-client` boundary (only `authorizationCodeGrant`; discovery,
 * PKCE, and URL building stay real) so the REAL callback route, REAL signed
 * state cookie, REAL resolver (passthrough-wrapped so two tests can make it
 * throw), and REAL session creation run end to end.
 *
 * This is a new sibling rather than an extension of oidc-auth.test.ts on
 * purpose: that file drives real login handshakes whose token exchange is
 * expected to FAIL against a mock provider, so globally replacing
 * `authorizationCodeGrant` there would break its existing token-exchange
 * assertions.
 */
import { createServer, type Server, type ServerResponse } from "node:http";
import { inspect } from "node:util";
import { sign } from "@fastify/cookie";
import { and, DrizzleQueryError, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const authorizationCodeGrantMock = vi.hoisted(() => vi.fn());

vi.mock("openid-client", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, authorizationCodeGrant: authorizationCodeGrantMock };
});

// trackEvent is mocked so OIDC failure analytics can be asserted without a
// baked PostHog client; every other analytics export stays real.
const trackEventSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../../../apps/api/src/lib/analytics.js", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, trackEvent: trackEventSpy };
});

// reportError is mocked so the logout and callback tests can tell a reported
// fault from an expected outcome (#1514, #1789); every other error-report
// export stays real.
const reportErrorSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../../../apps/api/src/lib/error-report.js", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, reportError: reportErrorSpy };
});

// resolveExternalUser stays REAL by default. The #978 tests swap in a throw for
// one call each: the retry-exhaustion error the resolver raises after three
// lost username races (three different identities taking the scanned name
// between scan and insert, which isn't worth staging against a real DB), and a
// plain fault that must keep surfacing as a 500.
const resolverFailure = vi.hoisted(() => ({ next: null as Error | null }));
vi.mock("../../../apps/api/src/lib/external-auth-resolver.js", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  const realResolve = actual.resolveExternalUser as (...args: unknown[]) => Promise<unknown>;
  return {
    ...actual,
    resolveExternalUser: async (...args: unknown[]) => {
      const err = resolverFailure.next;
      if (err) {
        resolverFailure.next = null;
        throw err;
      }
      return realResolve(...args);
    },
  };
});

vi.resetModules();

const { env } = await import("../../../apps/api/src/config.js");
const { db, schema } = await import("../../../apps/api/src/db/index.js");
const { sanitizeUsername, UsernameRaceExhaustedError } = await import(
  "../../../apps/api/src/lib/external-auth-resolver.js"
);
const { classifyError } = await import("../../../apps/api/src/lib/error-report.js");
const { buildBeforeSend } = await import("../../../apps/api/src/lib/sentry-scrub.js");
const mfaModule = await import("../../../apps/api/src/plugins/mfa.js");
const oidcModule = await import("../../../apps/api/src/plugins/oidc.js");
const { getOidcEndSessionEndpoint } = oidcModule;
const { buildTestApp, loginAsAdmin } = await import("../test-server.js");

import type { TestApp } from "../test-server.js";
import { parseExternalUrl, SSO_DEPLOYMENTS } from "./sso-deployments.js";

// Sign our own oidc-state cookie with the exact secret buildTestApp() gives
// @fastify/cookie, so callback branches are reachable without first driving a
// real login (which would warm the module-level discovery cache).
const TEST_COOKIE_SECRET = "test-cookie-secret";
function signState(state: string): string {
  return sign(JSON.stringify({ state, nonce: "n", codeVerifier: "v" }), TEST_COOKIE_SECRET);
}

/**
 * The reported error, and what Sentry's beforeSend keeps of it on the default
 * and the diagnostic (raw message) path, must not mention the username (or
 * any other string a test passes, such as an IdP's endpoint).
 */
function expectNoUsernameInSentryView(reported: unknown, username: string): void {
  const err = reported as Error;
  expect(inspect(err, { showHidden: true, depth: Number.POSITIVE_INFINITY })).not.toContain(
    username,
  );
  for (const diagnostic of [false, true]) {
    const event = { exception: { values: [{ type: err.name, value: err.message }] } };
    const sent = buildBeforeSend(() => true, diagnostic)(event, { originalException: err });
    expect(sent).not.toBeNull();
    expect(JSON.stringify(sent)).not.toContain(username);
  }
}

// end_session_endpoint values the mock IdP advertises under /scheme/<key>
// (#1855). Each hostile one carries SCHEME_MARKER so a test can prove none of
// it reaches the report.
const SCHEME_MARKER = "i1855marker";
const SCHEME_ENDPOINTS: Record<string, (port: number) => string> = {
  javascript: () => `javascript:alert("${SCHEME_MARKER}")`,
  javascriptUpper: () => `JavaScript:alert("${SCHEME_MARKER}")`,
  data: () => `data:text/html,<script>alert("${SCHEME_MARKER}")</script>`,
  vbscript: () => `vbscript:msgbox("${SCHEME_MARKER}")`,
  file: () => `file:///etc/${SCHEME_MARKER}`,
  relative: () => `/${SCHEME_MARKER}/logout`,
  http: (port) => `http://localhost:${port}/scheme/http/logout`,
  https: () => "https://idp.example.test/oidc/logout",
};

async function findUserByExternalId(externalId: string) {
  const [row] = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.externalId, externalId), eq(schema.users.authProvider, "oidc")))
    .limit(1);
  return row;
}

// =====================================================================
// CALLBACK-TIME DISCOVERY FAILURE (oidc.ts:225-229)
//
// MUST be the first describe: getOrDiscoverConfig() caches the resolved
// config in a module-level variable for 24h. This test needs a COLD cache so
// the callback's own getOrDiscoverConfig() (line 225) is the call that fails.
// A failed discovery never populates the cache, so later describes can still
// discover successfully against the live mock provider.
// =====================================================================
describe("OIDC callback discovery failure (cold cache)", () => {
  let oidcApp: TestApp;
  let deadServer: Server;
  let deadPort: number;

  const origOidcEnabled = env.OIDC_ENABLED;
  const origExternalUrl = env.EXTERNAL_URL;
  const origIssuerUrl = env.OIDC_ISSUER_URL;
  const origClientId = env.OIDC_CLIENT_ID;
  const origClientSecret = env.OIDC_CLIENT_SECRET;

  beforeAll(async () => {
    deadServer = createServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => {
      deadServer.listen(0, "127.0.0.1", () => {
        const addr = deadServer.address();
        deadPort = typeof addr === "object" && addr ? addr.port : 0;
        resolve();
      });
    });

    (env as any).OIDC_ENABLED = true;
    // https EXTERNAL_URL makes isSecure() true, so getOrDiscoverConfig() takes
    // the `execute: undefined` (secure) arm of the discovery ternary. With a
    // plain-http issuer, openid-client refuses before sending any request (the
    // scheme-mismatch case, pinned in oidc-login-failure-report.test.ts).
    (env as any).EXTERNAL_URL = "https://localhost:9999";
    (env as any).OIDC_ISSUER_URL = `http://localhost:${deadPort}`;
    (env as any).OIDC_CLIENT_ID = "test-client-id";
    (env as any).OIDC_CLIENT_SECRET = "test-client-secret";

    oidcApp = await buildTestApp();
  }, 30_000);

  afterAll(async () => {
    (env as any).OIDC_ENABLED = origOidcEnabled;
    (env as any).EXTERNAL_URL = origExternalUrl;
    (env as any).OIDC_ISSUER_URL = origIssuerUrl;
    (env as any).OIDC_CLIENT_ID = origClientId;
    (env as any).OIDC_CLIENT_SECRET = origClientSecret;
    await oidcApp.cleanup();
    await new Promise<void>((resolve) => deadServer.close(() => resolve()));
  }, 10_000);

  it("redirects to oidc_provider_unreachable when discovery fails at callback time", async () => {
    // Signed cookie whose state matches the query, so the callback passes the
    // cookie + state guards and reaches getOrDiscoverConfig() at line 225.
    const cookieValue = signState("cold-state");

    const res = await oidcApp.app.inject({
      method: "GET",
      url: "/api/auth/oidc/callback?code=abc&state=cold-state",
      cookies: { "oidc-state": cookieValue },
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/login?error=oidc_provider_unreachable");
    // authorizationCodeGrant is never reached because discovery failed first.
    expect(authorizationCodeGrantMock).not.toHaveBeenCalled();
  });
});

// =====================================================================
// CLAIMS / USERNAME-DERIVATION / RESOLVER-DENIED (live mock provider)
// =====================================================================
describe("OIDC callback claim handling and resolver outcomes", () => {
  let oidcApp: TestApp;
  let mockServer: Server;
  let mockPort: number;
  // Discovery-document fetches the mock IdP has answered, so a logout test can
  // tell an on-demand discovery from a cache hit (#1787).
  let discoveryRequests = 0;
  // Requests under /hang/ get no answer, standing in for an IdP that accepts
  // the connection and never replies. The test answers them in its finally.
  const hungResponses: ServerResponse[] = [];

  const origOidcEnabled = env.OIDC_ENABLED;
  const origExternalUrl = env.EXTERNAL_URL;
  const origIssuerUrl = env.OIDC_ISSUER_URL;
  const origClientId = env.OIDC_CLIENT_ID;
  const origClientSecret = env.OIDC_CLIENT_SECRET;
  const origAutoCreate = env.OIDC_AUTO_CREATE_USERS;
  const origUsernameClaim = env.OIDC_USERNAME_CLAIM;
  const origMaxUsers = env.MAX_USERS;

  // Drive the callback with a fully-controlled ID-token payload. `claims` is
  // whatever authorizationCodeGrant.claims() should return; passing `null`
  // exercises the no-claims branch.
  async function callbackWithClaims(
    claims: Record<string, unknown> | null,
    idToken: string | null = "fake-id-token",
  ) {
    authorizationCodeGrantMock.mockResolvedValueOnce({
      claims: () => claims ?? undefined,
      id_token: idToken,
    });
    const state = `st-${Math.random().toString(36).slice(2, 10)}`;
    const cookieValue = signState(state);
    return oidcApp.app.inject({
      method: "GET",
      url: `${env.BASE_PATH}/api/auth/oidc/callback?code=code-abc&state=${state}`,
      cookies: { "oidc-state": cookieValue },
    });
  }

  beforeAll(async () => {
    mockServer = createServer((req, res) => {
      if (req.url?.startsWith("/hang/")) {
        hungResponses.push(res);
        return;
      }
      // A provider that advertises no end_session_endpoint (#1787).
      if (req.url === "/noend/.well-known/openid-configuration") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            issuer: `http://localhost:${mockPort}/noend`,
            authorization_endpoint: `http://localhost:${mockPort}/authorize`,
            token_endpoint: `http://localhost:${mockPort}/token`,
            jwks_uri: `http://localhost:${mockPort}/jwks`,
            response_types_supported: ["code"],
          }),
        );
        return;
      }
      // Providers whose end_session_endpoint already carries a query (#1788):
      // Azure AD B2C names the user flow in `p`, and /stale advertises the
      // two parameters the logout route sets itself.
      const queryIssuer = req.url?.match(
        /^\/(b2c|stale)\/\.well-known\/openid-configuration$/,
      )?.[1];
      if (queryIssuer) {
        const query =
          queryIssuer === "b2c"
            ? "p=B2C_1_signin"
            : "p=B2C_1_signin&post_logout_redirect_uri=https%3A%2F%2Fold.example%2F&id_token_hint=stale-hint&id_token_hint=again";
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            issuer: `http://localhost:${mockPort}/${queryIssuer}`,
            authorization_endpoint: `http://localhost:${mockPort}/authorize`,
            token_endpoint: `http://localhost:${mockPort}/token`,
            jwks_uri: `http://localhost:${mockPort}/jwks`,
            response_types_supported: ["code"],
            end_session_endpoint: `http://localhost:${mockPort}/${queryIssuer}/logout?${query}`,
          }),
        );
        return;
      }
      // Providers whose end_session_endpoint is whatever SCHEME_ENDPOINTS
      // names, javascript: and data: included: openid-client's discovery
      // takes any string there (#1855).
      const schemeIssuer = req.url?.match(
        /^\/scheme\/(\w+)\/\.well-known\/openid-configuration$/,
      )?.[1];
      if (schemeIssuer && schemeIssuer in SCHEME_ENDPOINTS) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            issuer: `http://localhost:${mockPort}/scheme/${schemeIssuer}`,
            authorization_endpoint: `http://localhost:${mockPort}/authorize`,
            token_endpoint: `http://localhost:${mockPort}/token`,
            jwks_uri: `http://localhost:${mockPort}/jwks`,
            response_types_supported: ["code"],
            end_session_endpoint: SCHEME_ENDPOINTS[schemeIssuer](mockPort),
          }),
        );
        return;
      }
      if (req.url === "/.well-known/openid-configuration") {
        discoveryRequests++;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            issuer: `http://localhost:${mockPort}`,
            authorization_endpoint: `http://localhost:${mockPort}/authorize`,
            token_endpoint: `http://localhost:${mockPort}/token`,
            jwks_uri: `http://localhost:${mockPort}/jwks`,
            response_types_supported: ["code"],
            subject_types_supported: ["public"],
            id_token_signing_alg_values_supported: ["RS256"],
            code_challenge_methods_supported: ["S256"],
            end_session_endpoint: `http://localhost:${mockPort}/logout`,
          }),
        );
        return;
      }
      if (req.url === "/jwks") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ keys: [] }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => {
      mockServer.listen(0, "127.0.0.1", () => {
        const addr = mockServer.address();
        mockPort = typeof addr === "object" && addr ? addr.port : 0;
        resolve();
      });
    });

    (env as any).OIDC_ENABLED = true;
    // http EXTERNAL_URL -> isSecure() false -> discovery is allowed against the
    // insecure mock issuer (allowInsecureRequests arm).
    (env as any).EXTERNAL_URL = "http://localhost:9999";
    (env as any).OIDC_ISSUER_URL = `http://localhost:${mockPort}`;
    (env as any).OIDC_CLIENT_ID = "test-client-id";
    (env as any).OIDC_CLIENT_SECRET = "test-client-secret";
    (env as any).OIDC_AUTO_CREATE_USERS = true;
    (env as any).OIDC_USERNAME_CLAIM = "preferred_username";
    (env as any).MAX_USERS = 0;

    oidcApp = await buildTestApp();
  }, 30_000);

  // Cleared before (not after) each test so a report from the cold-cache
  // describe above can't leak into the first assertion here.
  beforeEach(() => {
    reportErrorSpy.mockClear();
  });

  afterEach(() => {
    authorizationCodeGrantMock.mockReset();
    trackEventSpy.mockClear();
    resolverFailure.next = null;
    // Reset the knobs individual tests tweak back to the describe defaults.
    (env as any).OIDC_AUTO_CREATE_USERS = true;
    (env as any).OIDC_USERNAME_CLAIM = "preferred_username";
    (env as any).MAX_USERS = 0;
  });

  afterAll(async () => {
    (env as any).OIDC_ENABLED = origOidcEnabled;
    (env as any).EXTERNAL_URL = origExternalUrl;
    (env as any).OIDC_ISSUER_URL = origIssuerUrl;
    (env as any).OIDC_CLIENT_ID = origClientId;
    (env as any).OIDC_CLIENT_SECRET = origClientSecret;
    (env as any).OIDC_AUTO_CREATE_USERS = origAutoCreate;
    (env as any).OIDC_USERNAME_CLAIM = origUsernameClaim;
    (env as any).MAX_USERS = origMaxUsers;
    await oidcApp.cleanup();
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }, 10_000);

  describe.each(SSO_DEPLOYMENTS)("deployment at '%s', EXTERNAL_URL %s", (basePath, typed) => {
    const originalBasePath = env.BASE_PATH;
    let externalUrl: string;

    beforeAll(() => {
      externalUrl = env.EXTERNAL_URL;
      env.BASE_PATH = basePath;
      env.EXTERNAL_URL = parseExternalUrl(typed);
    });
    afterAll(() => {
      env.BASE_PATH = originalBasePath;
      env.EXTERNAL_URL = externalUrl;
    });

    it("redirects into the app with a usable session cookie at the deployment path", async () => {
      const sub = `sub-path-${Math.random().toString(36).slice(2, 10)}`;
      const res = await callbackWithClaims({ sub, preferred_username: sub });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe(`${basePath}/`);
      const cookie = res.cookies.find((c) => c.name === "snapotter-session");
      expect(cookie).toMatchObject({ path: `${basePath}/`, httpOnly: true });
      expect(res.cookies.find((c) => c.name === "oidc-state")).toMatchObject({
        path: `${basePath}/api/auth/oidc`,
        value: "",
        expires: new Date(0),
      });
      const session = await oidcApp.app.inject({
        url: `${basePath}/api/auth/session`,
        cookies: { "snapotter-session": cookie?.value ?? "" },
      });
      expect(session.statusCode).toBe(200);
      expect(session.json().user.username).toBe(sub);
    });

    // The IdP compares the token-exchange redirect_uri with the one it saw at
    // login and rejects a mismatch, so a dropped or doubled prefix here breaks
    // SSO while the login-time redirect_uri checks in oidc-auth.test.ts stay
    // green (#1297).
    it("sends the token exchange a redirect_uri under the deployment path", async () => {
      const sub = `sub-uri-${Math.random().toString(36).slice(2, 10)}`;
      const res = await callbackWithClaims({ sub, preferred_username: sub });
      expect(res.statusCode).toBe(302);

      expect(authorizationCodeGrantMock).toHaveBeenCalledTimes(1);
      const callbackUrl = authorizationCodeGrantMock.mock.calls[0][1] as URL;
      expect(callbackUrl.origin).toBe("http://localhost:9999");
      expect(callbackUrl.pathname).toBe(`${basePath}/api/auth/oidc/callback`);
    });

    it("sends an MFA challenge to the login page under the deployment path", async () => {
      // The callback's dynamic import("./mfa.js") resolves to this same module
      // instance, so the spy forces the challenge outcome (as the #815 test
      // forces a policy-read failure).
      const spy = vi
        .spyOn(mfaModule, "resolveExternalLoginMfaOutcome")
        .mockReturnValue("challenge");
      try {
        const sub = `sub-mfa-${Math.random().toString(36).slice(2, 10)}`;
        const res = await callbackWithClaims({ sub, preferred_username: sub });
        expect(res.statusCode).toBe(302);
        const location = new URL(String(res.headers.location), "http://localhost:9999");
        expect(location.pathname).toBe(`${basePath}/login`);
        expect(location.searchParams.get("mfaToken")).toBeTruthy();
        expect(res.cookies.find((c) => c.name === "snapotter-session")).toBeUndefined();
      } finally {
        spy.mockRestore();
      }
    });

    // The IdP sends the user back to post_logout_redirect_uri after ending its
    // own session. Under a subpath deployment that has to be the app's login
    // page at the prefix; a dropped or doubled prefix lands on a 404 or is
    // rejected by the IdP as an unregistered URI (#1355).
    it("returns an IdP logoutUrl that redirects back to the login page under the deployment path", async () => {
      const sub = `sub-logout-${Math.random().toString(36).slice(2, 10)}`;
      const login = await callbackWithClaims({ sub, preferred_username: sub });
      expect(login.statusCode).toBe(302);
      const sessionToken = login.cookies.find((c) => c.name === "snapotter-session")?.value;
      expect(sessionToken).toBeTruthy();
      const [before] = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, sessionToken ?? ""));
      expect(before?.idToken).toBe("fake-id-token");

      const res = await oidcApp.app.inject({
        method: "POST",
        url: `${basePath}/api/auth/logout`,
        cookies: { "snapotter-session": sessionToken ?? "" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(typeof body.logoutUrl).toBe("string");
      const logoutUrl = new URL(body.logoutUrl);
      expect(`${logoutUrl.origin}${logoutUrl.pathname}`).toBe(
        `http://localhost:${mockPort}/logout`,
      );
      expect(logoutUrl.searchParams.get("id_token_hint")).toBe("fake-id-token");
      expect(logoutUrl.searchParams.get("post_logout_redirect_uri")).toBe(
        `http://localhost:9999${basePath}/login`,
      );
      // The whole string, so a change in how the URL is built (#1788) can't
      // reorder or re-encode it unnoticed.
      expect(body.logoutUrl).toBe(
        `http://localhost:${mockPort}/logout?id_token_hint=fake-id-token&post_logout_redirect_uri=${encodeURIComponent(`http://localhost:9999${basePath}/login`)}`,
      );
      expect(res.cookies.find((c) => c.name === "snapotter-session")).toMatchObject({
        path: `${basePath}/`,
        value: "",
      });
      const [session] = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, sessionToken ?? ""));
      expect(session).toBeUndefined();
      expect(reportErrorSpy).not.toHaveBeenCalled();
    });
  });

  // The logout cases below log in through the callback first, which warms the
  // discovery cache with an end_session_endpoint, so each one changes a single
  // input to the logout route and pins its own branch.
  async function oidcSessionWithWarmCache(): Promise<string> {
    const sub = `sub-warm-${Math.random().toString(36).slice(2, 10)}`;
    const login = await callbackWithClaims({ sub, preferred_username: sub });
    expect(login.headers.location).toBe(`${env.BASE_PATH}/`);
    expect(await getOidcEndSessionEndpoint()).toBe(`http://localhost:${mockPort}/logout`);
    const sessionToken = login.cookies.find((c) => c.name === "snapotter-session")?.value;
    if (!sessionToken) throw new Error("callback set no snapotter-session cookie");
    return sessionToken;
  }

  it("omits logoutUrl for a session with no ID token", async () => {
    await oidcSessionWithWarmCache();
    const passwordToken = await loginAsAdmin(oidcApp.app);

    const res = await oidcApp.app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { authorization: `Bearer ${passwordToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(reportErrorSpy).not.toHaveBeenCalled();
  });

  it("omits logoutUrl for an ID-token session once OIDC is switched off", async () => {
    const sessionToken = await oidcSessionWithWarmCache();
    (env as any).OIDC_ENABLED = false;
    try {
      const res = await oidcApp.app.inject({
        method: "POST",
        url: "/api/auth/logout",
        cookies: { "snapotter-session": sessionToken },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
      expect(reportErrorSpy).not.toHaveBeenCalled();
    } finally {
      (env as any).OIDC_ENABLED = true;
    }
  });

  // The logout route's dynamic import("./oidc.js") resolves to this same
  // module instance, so a spy on getOidcEndSessionEndpoint drives the route
  // the way the MFA spies drive the callback.
  async function logoutWithSession(sessionToken: string) {
    return oidcApp.app.inject({
      method: "POST",
      url: "/api/auth/logout",
      cookies: { "snapotter-session": sessionToken },
    });
  }

  async function expectLoggedOutLocally(
    res: Awaited<ReturnType<typeof logoutWithSession>>,
    sessionToken: string,
  ) {
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(res.cookies.find((c) => c.name === "snapotter-session")).toMatchObject({
      path: "/",
      value: "",
    });
    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionToken));
    expect(session).toBeUndefined();
  }

  it("omits logoutUrl without reporting when discovery advertises no end_session_endpoint", async () => {
    const sessionToken = await oidcSessionWithWarmCache();
    const spy = vi.spyOn(oidcModule, "getOidcEndSessionEndpoint").mockResolvedValue(null);
    try {
      const res = await logoutWithSession(sessionToken);

      expect(spy).toHaveBeenCalledTimes(1);
      await expectLoggedOutLocally(res, sessionToken);
      expect(reportErrorSpy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  // A throw here leaves the IdP session open, so the next SSO sign-in skips
  // the IdP prompt and logout looks broken. The user still gets a local
  // logout, and the fault reaches Sentry instead of vanishing (#1514).
  it("still logs out locally and reports the fault when building the IdP logout URL throws (#1514)", async () => {
    const sessionToken = await oidcSessionWithWarmCache();
    const fault = new Error("simulated serverMetadata fault");
    const spy = vi.spyOn(oidcModule, "getOidcEndSessionEndpoint").mockRejectedValue(fault);
    try {
      const res = await logoutWithSession(sessionToken);

      expect(spy).toHaveBeenCalledTimes(1);
      await expectLoggedOutLocally(res, sessionToken);
      expect(reportErrorSpy).toHaveBeenCalledTimes(1);
      expect(reportErrorSpy).toHaveBeenCalledWith(fault, {
        source: "http",
        route: "/api/auth/logout",
        method: "POST",
        subsystem: "oidc-logout",
      });
    } finally {
      spy.mockRestore();
    }
  });

  async function expectSessionGone(sessionToken: string) {
    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionToken));
    expect(session).toBeUndefined();
  }

  it("builds logoutUrl from a warm discovery cache without asking the IdP again", async () => {
    const sessionToken = await oidcSessionWithWarmCache();
    const before = discoveryRequests;

    const res = await logoutWithSession(sessionToken);

    expect(res.statusCode).toBe(200);
    const logoutUrl = new URL(res.json().logoutUrl);
    expect(`${logoutUrl.origin}${logoutUrl.pathname}`).toBe(`http://localhost:${mockPort}/logout`);
    expect(discoveryRequests).toBe(before);
    await expectSessionGone(sessionToken);
    expect(reportErrorSpy).not.toHaveBeenCalled();
  });

  // The discovery cache lives in process memory and only the login flow used
  // to fill it, so after an API restart (or on a second replica) logout found
  // no end_session_endpoint and skipped the IdP. Its session stayed open and
  // the next "Sign in with SSO" on that machine went straight back into the
  // previous user's account (#1787).
  it("discovers on demand and returns the IdP logoutUrl when the discovery cache is cold (#1787)", async () => {
    const sessionToken = await oidcSessionWithWarmCache();
    oidcModule.resetOidcDiscoveryCacheForTests();
    const before = discoveryRequests;

    const res = await logoutWithSession(sessionToken);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.logoutUrl).toBe("string");
    const logoutUrl = new URL(body.logoutUrl);
    expect(`${logoutUrl.origin}${logoutUrl.pathname}`).toBe(`http://localhost:${mockPort}/logout`);
    expect(logoutUrl.searchParams.get("id_token_hint")).toBe("fake-id-token");
    expect(logoutUrl.searchParams.get("post_logout_redirect_uri")).toBe(
      "http://localhost:9999/login",
    );
    expect(discoveryRequests).toBe(before + 1);
    await expectSessionGone(sessionToken);
    expect(reportErrorSpy).not.toHaveBeenCalled();
  });

  function expectReportedDiscoveryFault(code: string) {
    expect(reportErrorSpy).toHaveBeenCalledTimes(1);
    const [err, ctx] = reportErrorSpy.mock.calls[0];
    expect(ctx).toEqual({
      source: "http",
      route: "/api/auth/logout",
      method: "POST",
      subsystem: "oidc-logout",
    });
    // Operational: an unreachable or broken IdP is an environment problem,
    // not a SnapOtter bug, so it reaches Sentry as a throttled warning.
    expect(err).toMatchObject({ name: "SafeError", kind: "operational", code });
    // The real classifier must agree: an abort-shaped cause, say, would make
    // it drop the event as "expected" and nothing would reach Sentry.
    expect(classifyError(err, "http")).toBe("operational");
    return err as Error;
  }

  it("still logs out locally and reports when cold-cache discovery fails (#1787)", async () => {
    const sessionToken = await oidcSessionWithWarmCache();
    oidcModule.resetOidcDiscoveryCacheForTests();
    // The mock IdP 404s every discovery document outside its root issuer.
    (env as any).OIDC_ISSUER_URL = `http://localhost:${mockPort}/broken`;
    try {
      const res = await logoutWithSession(sessionToken);

      await expectLoggedOutLocally(res, sessionToken);
      const err = expectReportedDiscoveryFault("OIDC_DISCOVERY_FAILED");
      expect(err.cause).toBeInstanceOf(Error);
    } finally {
      (env as any).OIDC_ISSUER_URL = `http://localhost:${mockPort}`;
    }
  });

  it("omits logoutUrl without reporting when a cold-cache discovery finds no end_session_endpoint (#1787)", async () => {
    const sessionToken = await oidcSessionWithWarmCache();
    oidcModule.resetOidcDiscoveryCacheForTests();
    (env as any).OIDC_ISSUER_URL = `http://localhost:${mockPort}/noend`;
    try {
      const res = await logoutWithSession(sessionToken);

      await expectLoggedOutLocally(res, sessionToken);
      expect(reportErrorSpy).not.toHaveBeenCalled();
    } finally {
      (env as any).OIDC_ISSUER_URL = `http://localhost:${mockPort}`;
      // This discovery succeeded, so the cache now holds the /noend document.
      oidcModule.resetOidcDiscoveryCacheForTests();
    }
  });

  // Log out against an issuer whose end_session_endpoint already carries a
  // query string, discovered on a cold cache like a fresh restart would.
  async function logoutAgainstIssuer(issuerPath: string) {
    const sessionToken = await oidcSessionWithWarmCache();
    oidcModule.resetOidcDiscoveryCacheForTests();
    (env as any).OIDC_ISSUER_URL = `http://localhost:${mockPort}${issuerPath}`;
    try {
      const res = await logoutWithSession(sessionToken);
      expect(res.statusCode).toBe(200);
      await expectSessionGone(sessionToken);
      expect(reportErrorSpy).not.toHaveBeenCalled();
      return res.json() as { ok: boolean; logoutUrl?: string };
    } finally {
      (env as any).OIDC_ISSUER_URL = `http://localhost:${mockPort}`;
      // This discovery succeeded, so the cache now holds that issuer's document.
      oidcModule.resetOidcDiscoveryCacheForTests();
    }
  }

  // Azure AD B2C advertises its logout endpoint with the user flow in `p`.
  // Appending "?..." to that gave "?p=B2C_1_signin?id_token_hint=...", which
  // folds the hint into `p` and the IdP rejects the logout (#1788).
  it("appends to an end_session_endpoint that already has a query string (#1788)", async () => {
    const body = await logoutAgainstIssuer("/b2c");

    expect(body.logoutUrl).toBe(
      `http://localhost:${mockPort}/b2c/logout?p=B2C_1_signin&id_token_hint=fake-id-token&post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A9999%2Flogin`,
    );
    const logoutUrl = new URL(body.logoutUrl ?? "");
    expect(logoutUrl.searchParams.get("p")).toBe("B2C_1_signin");
    expect(logoutUrl.searchParams.get("id_token_hint")).toBe("fake-id-token");
  });

  // The hint has to be this session's token and the redirect this deployment's
  // login page, so values the endpoint already carries are replaced, never
  // sent alongside ours for the IdP to pick between (#1788).
  it("replaces id_token_hint and post_logout_redirect_uri the endpoint already carries (#1788)", async () => {
    const body = await logoutAgainstIssuer("/stale");

    expect(body.logoutUrl).toBe(
      `http://localhost:${mockPort}/stale/logout?p=B2C_1_signin&post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A9999%2Flogin&id_token_hint=fake-id-token`,
    );
    const logoutUrl = new URL(body.logoutUrl ?? "");
    expect(logoutUrl.searchParams.getAll("id_token_hint")).toEqual(["fake-id-token"]);
    expect(logoutUrl.searchParams.getAll("post_logout_redirect_uri")).toEqual([
      "http://localhost:9999/login",
    ]);
  });

  // An endpoint that isn't a URL used to be glued into a broken redirect and
  // returned without a trace. Now it's a fault like any other: local logout,
  // no logoutUrl, and a report (#1788). The report is a constant-message IdP
  // fault: Node's own TypeError carried the raw endpoint in an enumerable
  // `input` property and classified as a SnapOtter bug (#1887).
  it.each([
    `not a url ${SCHEME_MARKER}?p=B2C_1_signin`,
    `<script>alert("${SCHEME_MARKER}")</script>`,
  ])(
    "logs out locally and reports when the end_session_endpoint is not a valid URL: %s (#1788, #1887)",
    async (endpoint) => {
      const sessionToken = await oidcSessionWithWarmCache();
      const spy = vi.spyOn(oidcModule, "getOidcEndSessionEndpoint").mockResolvedValue(endpoint);
      try {
        const res = await logoutWithSession(sessionToken);

        await expectLoggedOutLocally(res, sessionToken);
        expect(res.body).not.toContain(SCHEME_MARKER);
        expectReportedInvalidEndpointFault();
      } finally {
        spy.mockRestore();
      }
    },
  );

  // new URL() trims surrounding whitespace before parsing, and the validity
  // check has to agree with it, so a padded endpoint still yields a logout URL
  // (#1887).
  it("still builds logoutUrl for an end_session_endpoint with surrounding whitespace (#1887)", async () => {
    const sessionToken = await oidcSessionWithWarmCache();
    const spy = vi
      .spyOn(oidcModule, "getOidcEndSessionEndpoint")
      .mockResolvedValue(" https://idp.example.test/oidc/logout\n");
    try {
      const res = await logoutWithSession(sessionToken);

      expect(res.statusCode).toBe(200);
      const logoutUrl = new URL((res.json() as { logoutUrl?: string }).logoutUrl ?? "");
      expect(`${logoutUrl.origin}${logoutUrl.pathname}`).toBe(
        "https://idp.example.test/oidc/logout",
      );
      expect(logoutUrl.searchParams.get("id_token_hint")).toBe("fake-id-token");
      await expectSessionGone(sessionToken);
      expect(reportErrorSpy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  // Log out against /scheme/<key>, whose end_session_endpoint is
  // SCHEME_ENDPOINTS[key]. With the default http EXTERNAL_URL the route runs
  // the discovery itself on a cold cache. An https EXTERNAL_URL turns off
  // plain-http discovery, which the mock IdP needs, so passing externalUrl
  // discovers first under the ambient http one and switches EXTERNAL_URL
  // just for the logout.
  async function logoutWithEndSessionEndpoint(key: string, externalUrl?: string) {
    const sessionToken = await oidcSessionWithWarmCache();
    const prevExternalUrl = env.EXTERNAL_URL;
    const prevIssuerUrl = env.OIDC_ISSUER_URL;
    oidcModule.resetOidcDiscoveryCacheForTests();
    (env as any).OIDC_ISSUER_URL = `http://localhost:${mockPort}/scheme/${key}`;
    try {
      if (externalUrl !== undefined) {
        expect(await getOidcEndSessionEndpoint()).toBe(SCHEME_ENDPOINTS[key](mockPort));
        (env as any).EXTERNAL_URL = externalUrl;
      }
      const res = await logoutWithSession(sessionToken);
      return { res, sessionToken };
    } finally {
      (env as any).EXTERNAL_URL = prevExternalUrl;
      (env as any).OIDC_ISSUER_URL = prevIssuerUrl;
      // This discovery succeeded, so the cache now holds that issuer's document.
      oidcModule.resetOidcDiscoveryCacheForTests();
    }
  }

  function expectReportedEndpointFault(message: string, code: string) {
    expect(reportErrorSpy).toHaveBeenCalledTimes(1);
    const [err, ctx] = reportErrorSpy.mock.calls[0];
    expect(ctx).toEqual({
      source: "http",
      route: "/api/auth/logout",
      method: "POST",
      subsystem: "oidc-logout",
    });
    // A constant message: the endpoint itself (script source, a data: page)
    // stays out of the event entirely.
    expect(err).toMatchObject({ name: "SafeError", message, kind: "operational", code });
    expect((err as Error).cause).toBeUndefined();
    expectNoUsernameInSentryView(err, SCHEME_MARKER);
    // A misconfigured IdP is an environment problem: a throttled warning.
    expect(classifyError(err, "http")).toBe("operational");
  }

  function expectReportedSchemeFault() {
    expectReportedEndpointFault(
      "OIDC end_session_endpoint has an unsupported scheme",
      "OIDC_END_SESSION_SCHEME",
    );
  }

  function expectReportedInvalidEndpointFault() {
    expectReportedEndpointFault(
      "OIDC end_session_endpoint is not a valid URL",
      "OIDC_END_SESSION_INVALID",
    );
  }

  // openid-client's discovery accepts any string as end_session_endpoint and
  // serverMetadata() hands it back untouched, so before #1855 a javascript:
  // or data: endpoint went out as logoutUrl and the web app assigned it to
  // window.location.href, running it in SnapOtter's origin.
  it.each(["javascript", "javascriptUpper", "data", "vbscript", "file"])(
    "omits logoutUrl, logs out locally, and reports when the end_session_endpoint is a %s: URL (#1855)",
    async (key) => {
      const { res, sessionToken } = await logoutWithEndSessionEndpoint(key);

      await expectLoggedOutLocally(res, sessionToken);
      expect(res.body).not.toContain(SCHEME_MARKER);
      expectReportedSchemeFault();
    },
  );

  // A relative endpoint has no scheme to check: it fails the URL parse, the
  // #1788 path, and gets that path's constant-message fault (#1887).
  it("omits logoutUrl, logs out locally, and reports when the end_session_endpoint is relative (#1855, #1887)", async () => {
    const { res, sessionToken } = await logoutWithEndSessionEndpoint("relative");

    await expectLoggedOutLocally(res, sessionToken);
    expect(res.body).not.toContain(SCHEME_MARKER);
    expectReportedInvalidEndpointFault();
  });

  it.each([
    ["http", undefined],
    ["https", undefined],
    ["https", "https://snapotter.example.test"],
  ])(
    "returns logoutUrl for a %s end_session_endpoint with EXTERNAL_URL %s (#1855)",
    async (key, externalUrl) => {
      const { res, sessionToken } = await logoutWithEndSessionEndpoint(key, externalUrl);

      expect(res.statusCode).toBe(200);
      const body = res.json() as { ok: boolean; logoutUrl?: string };
      expect(body.ok).toBe(true);
      const logoutUrl = new URL(body.logoutUrl ?? "");
      expect(`${logoutUrl.origin}${logoutUrl.pathname}`).toBe(SCHEME_ENDPOINTS[key](mockPort));
      expect(logoutUrl.searchParams.get("id_token_hint")).toBe("fake-id-token");
      expect(logoutUrl.searchParams.get("post_logout_redirect_uri")).toBe(
        `${externalUrl ?? "http://localhost:9999"}/login`,
      );
      await expectSessionGone(sessionToken);
      expect(reportErrorSpy).not.toHaveBeenCalled();
    },
  );

  // An https deployment already refuses plain-http discovery, so a plain-http
  // logout endpoint (which would carry the ID token in the clear) gets the
  // same answer. A local-dev IdP on http needs an http EXTERNAL_URL to be
  // discovered at all, so it keeps working (the case above).
  it.each(["http", "javascript"])(
    "omits logoutUrl and reports a %s end_session_endpoint when EXTERNAL_URL is https (#1855)",
    async (key) => {
      const { res, sessionToken } = await logoutWithEndSessionEndpoint(
        key,
        "https://snapotter.example.test",
      );

      await expectLoggedOutLocally(res, sessionToken);
      expectReportedSchemeFault();
    },
  );

  // Only an ID-token session with OIDC on needs the IdP. Any other logout on a
  // cold cache must not wait on discovery, even with the IdP hanging.
  it("never runs discovery on a cold cache for a logout that has no IdP session to end (#1787)", async () => {
    const oidcToken = await oidcSessionWithWarmCache();
    const passwordToken = await loginAsAdmin(oidcApp.app);
    oidcModule.resetOidcDiscoveryCacheForTests();
    (env as any).OIDC_ISSUER_URL = `http://localhost:${mockPort}/hang`;
    try {
      const started = Date.now();
      const passwordRes = await oidcApp.app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { authorization: `Bearer ${passwordToken}` },
      });
      (env as any).OIDC_ENABLED = false;
      const oidcOffRes = await logoutWithSession(oidcToken);

      expect(Date.now() - started).toBeLessThan(2_000);
      expect(passwordRes.json()).toEqual({ ok: true });
      await expectLoggedOutLocally(oidcOffRes, oidcToken);
      expect(hungResponses).toHaveLength(0);
      expect(reportErrorSpy).not.toHaveBeenCalled();
    } finally {
      (env as any).OIDC_ENABLED = true;
      (env as any).OIDC_ISSUER_URL = `http://localhost:${mockPort}`;
    }
  });

  it("gives up on a cold-cache discovery the IdP never answers, logs out locally, and reports it (#1787)", async () => {
    const sessionToken = await oidcSessionWithWarmCache();
    oidcModule.resetOidcDiscoveryCacheForTests();
    (env as any).OIDC_ISSUER_URL = `http://localhost:${mockPort}/hang`;
    try {
      const started = Date.now();
      const res = await logoutWithSession(sessionToken);
      const elapsed = Date.now() - started;

      // Well under openid-client's own 30s request timeout, which a logout
      // click would otherwise sit on.
      expect(elapsed).toBeLessThan(10_000);
      expect(hungResponses.length).toBeGreaterThan(0);
      await expectLoggedOutLocally(res, sessionToken);
      expectReportedDiscoveryFault("OIDC_DISCOVERY_TIMEOUT");
    } finally {
      (env as any).OIDC_ISSUER_URL = `http://localhost:${mockPort}`;
      for (const hung of hungResponses.splice(0)) {
        hung.writeHead(404);
        hung.end();
      }
    }
  }, 20_000);

  it("fails with oidc_auth_failed when the token response carries no ID-token claims", async () => {
    const res = await callbackWithClaims(null);

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/login?error=oidc_auth_failed");
    // The no-claims path records the failed attempt, same as the password path.
    expect(trackEventSpy).toHaveBeenCalledWith("auth_login_failed", { method: "oidc" });
    const setCookie = res.headers["set-cookie"];
    expect(String(setCookie ?? "")).not.toContain("snapotter-session=");
    expect(reportErrorSpy).not.toHaveBeenCalled();
  });

  it("derives the username from the configured claim (preferred_username)", async () => {
    const sub = `sub-pref-${Math.random().toString(36).slice(2, 10)}`;
    const raw = `PrefUser.${Math.random().toString(36).slice(2, 8)}`;
    // email is present too, but the configured preferred_username claim wins.
    const res = await callbackWithClaims({
      sub,
      preferred_username: raw,
      email: `${sub}@example.com`,
      email_verified: true,
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/");
    const user = await findUserByExternalId(sub);
    expect(user).toBeDefined();
    expect(user?.username).toBe(sanitizeUsername(raw));
    // A normal SSO login, MFA policy read included, reports nothing.
    expect(reportErrorSpy).not.toHaveBeenCalled();
  });

  it("falls back to preferred_username when a custom username claim is configured but absent", async () => {
    // Configure a custom claim key the token does NOT contain, so branch 1
    // (configured claim) is skipped and branch 2 (preferred_username) runs.
    (env as any).OIDC_USERNAME_CLAIM = "custom_login";
    const sub = `sub-custabsent-${Math.random().toString(36).slice(2, 10)}`;
    const raw = `CarolPref-${Math.random().toString(36).slice(2, 8)}`;
    const res = await callbackWithClaims({
      sub,
      preferred_username: raw,
      // no custom_login claim on purpose
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/");
    const user = await findUserByExternalId(sub);
    expect(user?.username).toBe(sanitizeUsername(raw));
  });

  it("uses the custom username claim when it is present", async () => {
    (env as any).OIDC_USERNAME_CLAIM = "custom_login";
    const sub = `sub-custpresent-${Math.random().toString(36).slice(2, 10)}`;
    const raw = `BobCustom-${Math.random().toString(36).slice(2, 8)}`;
    const res = await callbackWithClaims({
      sub,
      custom_login: raw,
      preferred_username: "should-be-ignored",
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/");
    const user = await findUserByExternalId(sub);
    expect(user?.username).toBe(sanitizeUsername(raw));
  });

  it("falls back to the display name when no username or email-with-@ claim is present", async () => {
    const sub = `sub-name-${Math.random().toString(36).slice(2, 10)}`;
    const raw = `Eve Adams ${Math.random().toString(36).slice(2, 6)}`;
    const res = await callbackWithClaims({
      sub,
      name: raw,
      // no preferred_username, no email
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/");
    const user = await findUserByExternalId(sub);
    expect(user?.username).toBe(sanitizeUsername(raw));
  });

  it("falls back to the subject when the token carries only a sub claim", async () => {
    const sub = `sub-only-${Math.random().toString(36).slice(2, 12)}`;
    const res = await callbackWithClaims({ sub });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/");
    const user = await findUserByExternalId(sub);
    expect(user?.username).toBe(sanitizeUsername(sub));
  });

  it("redirects to oidc_user_not_authorized when auto-create is off and the user is unknown", async () => {
    (env as any).OIDC_AUTO_CREATE_USERS = false;
    const sub = `sub-denied-${Math.random().toString(36).slice(2, 10)}`;
    const res = await callbackWithClaims({
      sub,
      preferred_username: `nope-${Math.random().toString(36).slice(2, 8)}`,
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/login?error=oidc_user_not_authorized");
    expect(trackEventSpy).toHaveBeenCalledWith("auth_login_failed", { method: "oidc" });
    // No account was created and no session cookie was set.
    expect(await findUserByExternalId(sub)).toBeUndefined();
    const setCookie = res.headers["set-cookie"];
    expect(String(setCookie ?? "")).not.toContain("snapotter-session=");
    // A denial is a login outcome, not a fault.
    expect(reportErrorSpy).not.toHaveBeenCalled();
  });

  it("redirects to oidc_user_limit_reached when auto-create hits the user cap", async () => {
    // The seeded fork already has at least the admin account, so a cap of 1
    // is already met and any auto-create is refused with user_limit_reached.
    (env as any).OIDC_AUTO_CREATE_USERS = true;
    (env as any).MAX_USERS = 1;
    const sub = `sub-limit-${Math.random().toString(36).slice(2, 10)}`;
    const res = await callbackWithClaims({
      sub,
      preferred_username: `capped-${Math.random().toString(36).slice(2, 8)}`,
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/login?error=oidc_user_limit_reached");
    expect(trackEventSpy).toHaveBeenCalledWith("auth_login_failed", { method: "oidc" });
    expect(await findUserByExternalId(sub)).toBeUndefined();

    // The denial leaves an audit row like every other one (issue #967).
    const auditRows = await db
      .select()
      .from(schema.auditLog)
      .where(
        sql`${schema.auditLog.action} = 'OIDC_LOGIN_FAILED' AND ${schema.auditLog.details}->>'reason' = 'user_limit_reached' AND ${schema.auditLog.details}->>'externalId' = ${sub}`,
      );
    expect(auditRows).toHaveLength(1);
    expect(reportErrorSpy).not.toHaveBeenCalled();
  });

  it("redirects to oidc_auth_failed instead of a raw 500 when auto-create exhausts its username-race retries (#978)", async () => {
    const sub = `sub-raced-${Math.random().toString(36).slice(2, 10)}`;
    const raceErr = new UsernameRaceExhaustedError();
    resolverFailure.next = raceErr;
    const res = await callbackWithClaims({ sub, preferred_username: "raced" });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/login?error=oidc_auth_failed");
    expect(trackEventSpy).toHaveBeenCalledWith("auth_login_failed", { method: "oidc" });
    const setCookie = res.headers["set-cookie"];
    expect(String(setCookie ?? "")).not.toContain("snapotter-session=");

    // Exhaustion gets the same audit trail as every other terminal denial.
    const auditRows = await db
      .select()
      .from(schema.auditLog)
      .where(
        sql`${schema.auditLog.action} = 'OIDC_LOGIN_FAILED' AND ${schema.auditLog.details}->>'reason' = 'auto_create_race_exhausted' AND ${schema.auditLog.details}->>'externalId' = ${sub}`,
      );
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].details).toMatchObject({ attemptedUsername: "raced" });

    // Caught before the global error handler, so the callback reports it
    // itself, exactly once, or sustained username contention never reaches
    // Sentry (#1789).
    expect(reportErrorSpy).toHaveBeenCalledTimes(1);
    expect(reportErrorSpy).toHaveBeenCalledWith(raceErr, {
      source: "http",
      route: "/api/auth/oidc/callback",
      method: "GET",
      subsystem: "external-auth",
    });
    // The real reportError drops "expected" errors, which would make this
    // report a no-op.
    expect(classifyError(raceErr, "http")).not.toBe("expected");
    // The exact-context match above already rules out a username riding along
    // in the report context. This guards the callback against wrapping or
    // annotating the error with it on the way out (#1866); the error's own
    // contents are pinned at the real throw site in
    // tests/unit/api/external-auth-resolver-mutation.test.ts.
    expectNoUsernameInSentryView(reportErrorSpy.mock.calls[0][0], "raced");
  });

  it("still surfaces any other resolver throw as a 500 with no misclassified audit row", async () => {
    // The catch is narrow on purpose: only the resolver's own retry-exhaustion
    // signal is a login outcome. A fault (DB down, a leaked constraint error)
    // must keep reaching the global handler instead of being audited as a race.
    const sub = `sub-fault-${Math.random().toString(36).slice(2, 10)}`;
    const fault = new Error("simulated resolver fault");
    resolverFailure.next = fault;
    const res = await callbackWithClaims({ sub, preferred_username: "faulty" });

    expect(res.statusCode).toBe(500);
    expect(res.headers.location).toBeUndefined();
    const setCookie = res.headers["set-cookie"];
    expect(String(setCookie ?? "")).not.toContain("snapotter-session=");
    const auditRows = await db
      .select()
      .from(schema.auditLog)
      .where(
        sql`${schema.auditLog.action} = 'OIDC_LOGIN_FAILED' AND ${schema.auditLog.details}->>'externalId' = ${sub}`,
      );
    expect(auditRows).toHaveLength(0);
    // The callback's own catch must not report it as username contention; the
    // 500 is the global error handler's to report. buildTestApp() doesn't
    // install that handler yet (#1243), so this only rules out the callback's
    // report and holds whether or not the handler is there.
    expect(reportErrorSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ subsystem: "external-auth" }),
    );
  });

  it("fails closed with a distinct error when the MFA policy lookup throws (#815)", async () => {
    // The dynamic import("./mfa.js") in the callback resolves to this same
    // module instance, so spying getMfaPolicy to reject drives the callback's
    // policy-read catch. A thrown policy lookup must fail CLOSED for an
    // unenrolled user: the stored policy may well be "required", so the
    // login is denied with a retryable error param instead of a session.
    // Shaped like the real failure: the settings read losing its Postgres
    // connection (SQLSTATE 57P01, admin_shutdown).
    const policyFault = Object.assign(
      new Error("terminating connection due to administrator command"),
      { code: "57P01" },
    );
    const spy = vi.spyOn(mfaModule, "getMfaPolicy").mockRejectedValue(policyFault);
    try {
      const sub = `sub-mfathrow-${Math.random().toString(36).slice(2, 10)}`;
      const res = await callbackWithClaims({
        sub,
        preferred_username: `mfaclosed-${Math.random().toString(36).slice(2, 8)}`,
      });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe("/login?error=mfa_policy_unavailable");
      const setCookie = res.headers["set-cookie"];
      expect(String(setCookie ?? "")).not.toContain("snapotter-session=");

      // Provisioning happens before the MFA decision, so the user row may
      // exist, but no session row was minted and no login success fired.
      const user = await findUserByExternalId(sub);
      expect(user).toBeDefined();
      const [session] = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, user?.id ?? ""))
        .limit(1);
      expect(session).toBeUndefined();
      expect(trackEventSpy).not.toHaveBeenCalledWith("auth_login", { method: "oidc" });
      expect(trackEventSpy).toHaveBeenCalledWith("auth_login_failed", { method: "oidc" });

      // The catch keeps the fault from the global error handler, so the
      // callback reports it itself, exactly once: a settings fault denying
      // every SSO login must show up in triage, not only in the log (#1789).
      expect(reportErrorSpy).toHaveBeenCalledTimes(1);
      expect(reportErrorSpy).toHaveBeenCalledWith(policyFault, {
        source: "http",
        route: "/api/auth/oidc/callback",
        method: "GET",
        statusCode: 503,
        subsystem: "mfa-policy",
      });
      // A lost database is the operator's environment, so it reaches Sentry
      // as a throttled warning rather than being dropped as expected.
      expect(classifyError(policyFault, "http")).toBe("operational");
    } finally {
      spy.mockRestore();
    }
  });

  it("fails closed and reports the fault once when the MFA enrollment read throws (#1867)", async () => {
    // A first login provisions the user, so the second one below takes the
    // existing-user path and the fault can carry the real user id.
    const sub = `sub-enrollread-${Math.random().toString(36).slice(2, 10)}`;
    const username = `enrollread-${Math.random().toString(36).slice(2, 8)}`;
    expect((await callbackWithClaims({ sub, preferred_username: username })).statusCode).toBe(302);
    const user = await findUserByExternalId(sub);
    expect(user).toBeDefined();
    const userId = user?.id ?? "";
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
    reportErrorSpy.mockClear();
    trackEventSpy.mockClear();

    // Shaped like the real failure: drizzle wraps the driver's error (a lost
    // Postgres connection, SQLSTATE 57P01) in a DrizzleQueryError whose
    // message carries the query params, the user's id among them.
    const pgFault = Object.assign(
      new Error("terminating connection due to administrator command"),
      { code: "57P01" },
    );
    const enrollmentFault = new DrizzleQueryError(
      'select "totp_enabled" from "users" where "users"."id" = $1',
      [userId],
      pgFault,
    );
    // Only the callback's single-column enrollment read fails; provisioning,
    // session, and audit queries still hit the real database.
    let enrollmentReads = 0;
    const originalSelect = db.select.bind(db);
    const selectSpy = vi.spyOn(db, "select").mockImplementation((...args: unknown[]) => {
      const selection = args[0] as Record<string, unknown> | undefined;
      if (selection && Object.keys(selection).join() === "totpEnabled") {
        enrollmentReads++;
        throw enrollmentFault;
      }
      // biome-ignore lint/suspicious/noExplicitAny: passthrough to the real overloaded implementation
      return (originalSelect as any)(...args);
    });
    try {
      const res = await callbackWithClaims({ sub, preferred_username: username });

      // Fails closed: no way of knowing whether the user is enrolled, so no
      // session and no challenge, only the generic retryable SSO failure.
      expect(enrollmentReads).toBe(1);
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe("/login?error=oidc_auth_failed");
      expect(String(res.headers["set-cookie"] ?? "")).not.toContain("snapotter-session=");
      const sessions = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, userId));
      expect(sessions).toHaveLength(0);
      expect(trackEventSpy).not.toHaveBeenCalledWith("auth_login", { method: "oidc" });
      expect(trackEventSpy).toHaveBeenCalledWith("auth_login_failed", { method: "oidc" });
      const auditRows = await db
        .select()
        .from(schema.auditLog)
        .where(
          sql`${schema.auditLog.action} = 'OIDC_LOGIN_FAILED' AND ${schema.auditLog.details}->>'reason' = 'mfa_check_error' AND ${schema.auditLog.details}->>'userId' = ${userId}`,
        );
      expect(auditRows).toHaveLength(1);

      // The catch keeps the fault from the global error handler, so the
      // callback reports it itself, exactly once, tagged with its own
      // subsystem so triage can tell it from the MFA-policy fault. The exact
      // context match rules out a user id or username riding along in it.
      expect(reportErrorSpy).toHaveBeenCalledTimes(1);
      expect(reportErrorSpy).toHaveBeenCalledWith(enrollmentFault, {
        source: "http",
        route: "/api/auth/oidc/callback",
        method: "GET",
        statusCode: 503,
        subsystem: "mfa-enrollment",
      });
      // The real reportError drops "expected" errors; a lost database is the
      // operator's environment, so it goes out as a throttled warning.
      expect(classifyError(enrollmentFault, "http")).toBe("operational");
      // On the default (non-diagnostic) path Sentry gets a safe summary of a
      // database error, never drizzle's message with its params.
      const event = {
        exception: { values: [{ type: enrollmentFault.name, value: enrollmentFault.message }] },
      };
      const sent = buildBeforeSend(() => true)(event, { originalException: enrollmentFault });
      expect(sent).not.toBeNull();
      expect(JSON.stringify(sent)).not.toContain(userId);
      expect(JSON.stringify(sent)).not.toContain(username);
    } finally {
      selectSpy.mockRestore();
    }
  });
});
