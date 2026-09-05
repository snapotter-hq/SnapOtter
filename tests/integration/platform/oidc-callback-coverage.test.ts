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
 *   - the optional-MFA-plugin catch (oidc.ts:325-327): the MFA policy lookup
 *     throwing must fail *open* (login proceeds) because MFA is an optional
 *     enterprise plugin.
 *   - the resolver's retry-exhaustion throw (#978): caught and turned into a
 *     login failure, while any other resolver throw still surfaces as a 500.
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
import { createServer, type Server } from "node:http";
import { sign } from "@fastify/cookie";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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
const mfaModule = await import("../../../apps/api/src/plugins/mfa.js");
const { buildTestApp } = await import("../test-server.js");

import type { TestApp } from "../test-server.js";

// Sign our own oidc-state cookie with the exact secret buildTestApp() gives
// @fastify/cookie, so callback branches are reachable without first driving a
// real login (which would warm the module-level discovery cache).
const TEST_COOKIE_SECRET = "test-cookie-secret";
function signState(state: string): string {
  return sign(JSON.stringify({ state, nonce: "n", codeVerifier: "v" }), TEST_COOKIE_SECRET);
}

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
    // the `execute: undefined` (secure) arm of the discovery ternary. Discovery
    // still fails because the issuer 404s the discovery document.
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
      url: `/api/auth/oidc/callback?code=code-abc&state=${state}`,
      cookies: { "oidc-state": cookieValue },
    });
  }

  beforeAll(async () => {
    mockServer = createServer((req, res) => {
      if (req.url === "/.well-known/openid-configuration") {
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

  it("fails with oidc_auth_failed when the token response carries no ID-token claims", async () => {
    const res = await callbackWithClaims(null);

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/login?error=oidc_auth_failed");
    // The no-claims path records the failed attempt, same as the password path.
    expect(trackEventSpy).toHaveBeenCalledWith("auth_login_failed", { method: "oidc" });
    const setCookie = res.headers["set-cookie"];
    expect(String(setCookie ?? "")).not.toContain("snapotter-session=");
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
  });

  it("redirects to oidc_auth_failed instead of a raw 500 when auto-create exhausts its username-race retries (#978)", async () => {
    const sub = `sub-raced-${Math.random().toString(36).slice(2, 10)}`;
    resolverFailure.next = new UsernameRaceExhaustedError("oidc", "raced", 3);
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
  });

  it("still surfaces any other resolver throw as a 500 with no misclassified audit row", async () => {
    // The catch is narrow on purpose: only the resolver's own retry-exhaustion
    // signal is a login outcome. A fault (DB down, a leaked constraint error)
    // must keep reaching the global handler instead of being audited as a race.
    const sub = `sub-fault-${Math.random().toString(36).slice(2, 10)}`;
    resolverFailure.next = new Error("simulated resolver fault");
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
  });

  it("fails closed with a distinct error when the MFA policy lookup throws (#815)", async () => {
    // The dynamic import("./mfa.js") in the callback resolves to this same
    // module instance, so spying getMfaPolicy to reject drives the callback's
    // policy-read catch. A thrown policy lookup must fail CLOSED for an
    // unenrolled user: the stored policy may well be "required", so the
    // login is denied with a retryable error param instead of a session.
    const spy = vi
      .spyOn(mfaModule, "getMfaPolicy")
      .mockRejectedValue(new Error("simulated MFA policy lookup failure"));
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
    } finally {
      spy.mockRestore();
    }
  });
});
