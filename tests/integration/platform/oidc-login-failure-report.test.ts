/**
 * OIDC faults at sign-in must reach Sentry, once, as operational warnings
 * (#1869). Before this, a failed discovery on the login route or in the
 * callback, and every failed token exchange, only went to the local log, so
 * an IdP that was down or misconfigured blocked every SSO login without a
 * trace in triage. The callback's discovery failure also skipped the failure
 * metric and audit row that every other callback failure writes.
 *
 * Token-exchange failures are split. The ones that mean the server or its
 * IdP config is broken (IdP unreachable or 5xx, client credentials or
 * redirect_uri rejected) are reported. The ones a user causes (an expired or
 * replayed code: invalid_grant; access_denied) are not, or every back-button
 * press would land in Sentry.
 *
 * An https deployment with a plain-http issuer fails discovery because
 * openid-client refuses insecure requests there. It used to look exactly like
 * an unreachable IdP; it now carries its own code and audit reason.
 *
 * Everything runs against a real mock IdP: discovery and the token exchange
 * are the real openid-client calls. `discovery` is a passthrough spy only so
 * the timeout case can hand back openid-client's own timeout error without a
 * 30s wait.
 */
import { createServer, type Server } from "node:http";
import { sign } from "@fastify/cookie";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const discoverySpy = vi.hoisted(() => vi.fn());
vi.mock("openid-client", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  const realDiscovery = actual.discovery as (...args: unknown[]) => Promise<unknown>;
  discoverySpy.mockImplementation((...args: unknown[]) => realDiscovery(...args));
  return { ...actual, discovery: discoverySpy };
});

const trackEventSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../../../apps/api/src/lib/analytics.js", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, trackEvent: trackEventSpy };
});

const reportErrorSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../../../apps/api/src/lib/error-report.js", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, reportError: reportErrorSpy };
});

vi.resetModules();

const oidc = await import("openid-client");
const { env } = await import("../../../apps/api/src/config.js");
const { db, schema } = await import("../../../apps/api/src/db/index.js");
const { classifyError } = await import("../../../apps/api/src/lib/error-report.js");
const { buildBeforeSend } = await import("../../../apps/api/src/lib/sentry-scrub.js");
const { getOidcEndSessionEndpoint, resetOidcDiscoveryCacheForTests } = await import(
  "../../../apps/api/src/plugins/oidc.js"
);
const { buildTestApp } = await import("../test-server.js");

import type { TestApp } from "../test-server.js";

const mutableEnv = env as unknown as Record<string, unknown>;
const CLIENT_SECRET = "i1869-client-secret";
const TEST_COOKIE_SECRET = "test-cookie-secret";

// Token-endpoint answers the mock IdP gives under the issuer /t/<kind>.
const TOKEN_RESPONSES: Record<
  string,
  { status: number; body: string; json: boolean; challenge?: string }
> = {
  "server-error": { status: 500, body: "upstream exploded", json: false },
  "server-error-json": {
    status: 503,
    body: JSON.stringify({ error: "temporarily_unavailable" }),
    json: true,
  },
  "invalid-grant": {
    status: 400,
    body: JSON.stringify({ error: "invalid_grant", error_description: "Code not valid" }),
    json: true,
  },
  "access-denied": {
    status: 400,
    body: JSON.stringify({ error: "access_denied" }),
    json: true,
  },
  "invalid-client": {
    status: 401,
    body: JSON.stringify({ error: "invalid_client", error_description: "Invalid client secret" }),
    json: true,
  },
  "unauthorized-client": {
    status: 400,
    body: JSON.stringify({ error: "unauthorized_client" }),
    json: true,
  },
  // Keycloak's answer to a redirect_uri that doesn't match the login's.
  "redirect-uri": {
    status: 400,
    body: JSON.stringify({ error: "invalid_grant", error_description: "Incorrect redirect_uri" }),
    json: true,
  },
  "redirect-uri-mismatch": {
    status: 400,
    body: JSON.stringify({ error: "redirect_uri_mismatch" }),
    json: true,
  },
  // Client authentication refused with a challenge header, which openid-client
  // throws on before it reads the body.
  "client-challenge": {
    status: 401,
    body: JSON.stringify({ error: "invalid_client" }),
    json: true,
    challenge: 'Basic realm="idp", error="invalid_client"',
  },
  // An expired code from an IdP that adds a challenge header to every 4xx.
  "grant-challenge": {
    status: 400,
    body: JSON.stringify({ error: "invalid_grant" }),
    json: true,
    challenge: 'Basic realm="idp", error="invalid_grant"',
  },
};

describe("OIDC sign-in faults reach Sentry (#1869)", () => {
  let oidcApp: TestApp;
  let mockServer: Server;
  let mockPort: number;
  let closedPort: number;

  const orig = {
    OIDC_ENABLED: env.OIDC_ENABLED,
    EXTERNAL_URL: env.EXTERNAL_URL,
    OIDC_ISSUER_URL: env.OIDC_ISSUER_URL,
    OIDC_CLIENT_ID: env.OIDC_CLIENT_ID,
    OIDC_CLIENT_SECRET: env.OIDC_CLIENT_SECRET,
  };

  function discoveryDocument(issuerPath: string, tokenEndpoint: string) {
    return JSON.stringify({
      issuer: `http://localhost:${mockPort}${issuerPath}`,
      authorization_endpoint: `http://localhost:${mockPort}/authorize`,
      token_endpoint: tokenEndpoint,
      jwks_uri: `http://localhost:${mockPort}/jwks`,
      response_types_supported: ["code"],
      code_challenge_methods_supported: ["S256"],
    });
  }

  beforeAll(async () => {
    // A port nothing listens on: bind, read the port, close.
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const probeAddr = probe.address();
    closedPort = typeof probeAddr === "object" && probeAddr ? probeAddr.port : 0;
    await new Promise<void>((resolve) => probe.close(() => resolve()));

    mockServer = createServer((req, res) => {
      const discovery = req.url?.match(/^\/t\/([\w-]+)\/\.well-known\/openid-configuration$/);
      if (discovery) {
        const kind = discovery[1];
        const tokenEndpoint =
          kind === "unreachable"
            ? `http://127.0.0.1:${closedPort}/token`
            : `http://localhost:${mockPort}/t/${kind}/token`;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(discoveryDocument(`/t/${kind}`, tokenEndpoint));
        return;
      }
      const token = req.url?.match(/^\/t\/([\w-]+)\/token$/);
      const answer = token ? TOKEN_RESPONSES[token[1]] : undefined;
      if (answer) {
        res.writeHead(answer.status, {
          "Content-Type": answer.json ? "application/json" : "text/plain",
          ...(answer.challenge && { "WWW-Authenticate": answer.challenge }),
        });
        res.end(answer.body);
        return;
      }
      // Every other discovery document, /missing included, is a 404.
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
    const addr = mockServer.address();
    mockPort = typeof addr === "object" && addr ? addr.port : 0;

    mutableEnv.OIDC_ENABLED = true;
    mutableEnv.EXTERNAL_URL = "http://localhost:9999";
    mutableEnv.OIDC_ISSUER_URL = `http://localhost:${mockPort}/t/invalid-grant`;
    mutableEnv.OIDC_CLIENT_ID = "test-client-id";
    mutableEnv.OIDC_CLIENT_SECRET = CLIENT_SECRET;
    oidcApp = await buildTestApp();
  }, 30_000);

  afterAll(async () => {
    Object.assign(mutableEnv, orig);
    resetOidcDiscoveryCacheForTests();
    await oidcApp.cleanup();
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }, 10_000);

  beforeEach(() => {
    resetOidcDiscoveryCacheForTests();
    reportErrorSpy.mockClear();
    trackEventSpy.mockClear();
  });

  afterEach(() => {
    mutableEnv.EXTERNAL_URL = "http://localhost:9999";
    discoverySpy.mockClear();
  });

  function setIssuer(path: string) {
    mutableEnv.OIDC_ISSUER_URL = `http://localhost:${mockPort}${path}`;
  }

  async function login() {
    return oidcApp.app.inject({ method: "GET", url: "/api/auth/oidc/login" });
  }

  // A callback whose signed state cookie matches its query, with a code and
  // state unique to the call, so a test can prove neither reaches Sentry.
  async function callback() {
    const rand = Math.random().toString(36).slice(2, 10);
    const state = `i1869state${rand}`;
    const code = `i1869code${rand}`;
    const cookie = sign(
      JSON.stringify({ state, nonce: `n${rand}`, codeVerifier: `v${rand}`.padEnd(43, "x") }),
      TEST_COOKIE_SECRET,
    );
    const res = await oidcApp.app.inject({
      method: "GET",
      url: `/api/auth/oidc/callback?code=${code}&state=${state}`,
      cookies: { "oidc-state": cookie },
    });
    return { res, code, state };
  }

  async function failedLoginRows(reason: string): Promise<number> {
    const rows = await db
      .select()
      .from(schema.auditLog)
      .where(
        sql`${schema.auditLog.action} = 'OIDC_LOGIN_FAILED' AND ${schema.auditLog.details}->>'reason' = ${reason}`,
      );
    return rows.length;
  }

  /**
   * Exactly one report, with the exact context (so no user id, code, or URL
   * rides along in it), an operational SafeError carrying `code` and a
   * constant `message`, which the real classifier keeps as operational.
   */
  function expectOneReport(route: string, code: string, message: string): Error {
    expect(reportErrorSpy).toHaveBeenCalledTimes(1);
    const [err, ctx] = reportErrorSpy.mock.calls[0];
    expect(ctx).toEqual({ source: "http", route, method: "GET", subsystem: "oidc-login" });
    expect(err).toMatchObject({ name: "SafeError", kind: "operational", code, message });
    expect(classifyError(err, "http")).toBe("operational");
    return err as Error;
  }

  /**
   * What Sentry keeps of the report on the default and the diagnostic (raw
   * message) path, with the cause chain laid out the way the SDK's linked
   * errors integration does, must carry none of `secrets`.
   */
  function expectNoneInSentryView(err: Error, secrets: string[]): void {
    const values: { type: string; value: string }[] = [];
    let cur: unknown = err;
    while (cur instanceof Error && values.length < 6) {
      values.unshift({ type: cur.name, value: cur.message });
      cur = cur.cause;
    }
    for (const diagnostic of [false, true]) {
      const sent = buildBeforeSend(() => true, diagnostic)(
        { exception: { values: values.map((v) => ({ ...v })) } },
        { originalException: err },
      );
      expect(sent).not.toBeNull();
      for (const secret of secrets) expect(JSON.stringify(sent)).not.toContain(secret);
    }
  }

  describe("discovery at login", () => {
    it("reports a discovery document the IdP 404s, once, and still redirects", async () => {
      setIssuer("/missing");
      const res = await login();

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe("/login?error=oidc_provider_unreachable");
      const err = expectOneReport(
        "/api/auth/oidc/login",
        "OIDC_DISCOVERY_FAILED",
        "OIDC discovery failed",
      );
      expect(err.cause).toBeInstanceOf(oidc.ClientError);
      expectNoneInSentryView(err, [CLIENT_SECRET]);
    });

    it("reports an IdP nothing listens on as a failed discovery", async () => {
      mutableEnv.OIDC_ISSUER_URL = `http://127.0.0.1:${closedPort}`;
      const res = await login();

      expect(res.headers.location).toBe("/login?error=oidc_provider_unreachable");
      expectOneReport("/api/auth/oidc/login", "OIDC_DISCOVERY_FAILED", "OIDC discovery failed");
    });

    it("reports openid-client's discovery timeout with its own code", async () => {
      setIssuer("/t/invalid-grant");
      discoverySpy.mockRejectedValueOnce(
        new oidc.ClientError("operation timed out", {
          code: "OAUTH_TIMEOUT",
          cause: new DOMException("The operation timed out.", "TimeoutError"),
        }),
      );
      const res = await login();

      expect(res.headers.location).toBe("/login?error=oidc_provider_unreachable");
      expectOneReport("/api/auth/oidc/login", "OIDC_DISCOVERY_TIMEOUT", "OIDC discovery timed out");
    });

    it("tells a plain-http issuer on an https deployment apart from an unreachable IdP (#1775)", async () => {
      setIssuer("/t/invalid-grant");
      mutableEnv.EXTERNAL_URL = "https://snapotter.example.test";
      const res = await login();

      // The provider answers fine; openid-client refuses to ask it over http.
      expect(res.headers.location).toBe("/login?error=oidc_provider_unreachable");
      const err = expectOneReport(
        "/api/auth/oidc/login",
        "OIDC_ISSUER_SCHEME_MISMATCH",
        "OIDC issuer is plain http but EXTERNAL_URL is https",
      );
      expectNoneInSentryView(err, [CLIENT_SECRET, `localhost:${mockPort}`]);
    });

    it("reports nothing when discovery succeeds", async () => {
      setIssuer("/t/invalid-grant");
      const res = await login();

      expect(new URL(String(res.headers.location)).pathname).toBe("/authorize");
      expect(reportErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe("discovery in the callback", () => {
    it("reports, counts, and audits a callback whose discovery fails", async () => {
      setIssuer("/missing");
      const before = await failedLoginRows("discovery_failed");
      const { res, code, state } = await callback();

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe("/login?error=oidc_provider_unreachable");
      const err = expectOneReport(
        "/api/auth/oidc/callback",
        "OIDC_DISCOVERY_FAILED",
        "OIDC discovery failed",
      );
      expectNoneInSentryView(err, [code, state, CLIENT_SECRET]);
      expect(trackEventSpy).toHaveBeenCalledWith("auth_login_failed", { method: "oidc" });
      expect(await failedLoginRows("discovery_failed")).toBe(before + 1);
    });

    it("reports and audits a timed-out callback discovery with its own code", async () => {
      setIssuer("/t/invalid-grant");
      discoverySpy.mockRejectedValueOnce(
        new oidc.ClientError("operation timed out", {
          code: "OAUTH_TIMEOUT",
          cause: new DOMException("The operation timed out.", "TimeoutError"),
        }),
      );
      const before = await failedLoginRows("discovery_timeout");
      const { res } = await callback();

      expect(res.headers.location).toBe("/login?error=oidc_provider_unreachable");
      expectOneReport(
        "/api/auth/oidc/callback",
        "OIDC_DISCOVERY_TIMEOUT",
        "OIDC discovery timed out",
      );
      expect(await failedLoginRows("discovery_timeout")).toBe(before + 1);
    });

    it("audits the scheme mismatch under its own reason", async () => {
      setIssuer("/t/invalid-grant");
      mutableEnv.EXTERNAL_URL = "https://snapotter.example.test";
      const before = await failedLoginRows("issuer_scheme_mismatch");
      const { res } = await callback();

      expect(res.headers.location).toBe("/login?error=oidc_provider_unreachable");
      expectOneReport(
        "/api/auth/oidc/callback",
        "OIDC_ISSUER_SCHEME_MISMATCH",
        "OIDC issuer is plain http but EXTERNAL_URL is https",
      );
      expect(trackEventSpy).toHaveBeenCalledWith("auth_login_failed", { method: "oidc" });
      expect(await failedLoginRows("issuer_scheme_mismatch")).toBe(before + 1);
    });
  });

  describe("token exchange", () => {
    async function exchangeAgainst(kind: string) {
      setIssuer(`/t/${kind}`);
      const before = await failedLoginRows("token_exchange_failed");
      const result = await callback();
      expect(result.res.statusCode).toBe(302);
      expect(result.res.headers.location).toBe("/login?error=oidc_auth_failed");
      expect(trackEventSpy).toHaveBeenCalledWith("auth_login_failed", { method: "oidc" });
      expect(await failedLoginRows("token_exchange_failed")).toBe(before + 1);
      return result;
    }

    it.each([
      ["server-error", "OIDC_TOKEN_IDP_ERROR"],
      ["server-error-json", "OIDC_TOKEN_IDP_ERROR"],
      ["unreachable", "OIDC_TOKEN_UNREACHABLE"],
      ["invalid-client", "OIDC_TOKEN_CLIENT_REJECTED"],
      ["unauthorized-client", "OIDC_TOKEN_CLIENT_REJECTED"],
      ["redirect-uri", "OIDC_TOKEN_REDIRECT_URI"],
      ["redirect-uri-mismatch", "OIDC_TOKEN_REDIRECT_URI"],
      ["client-challenge", "OIDC_TOKEN_CLIENT_REJECTED"],
    ])("reports a server-side token-exchange fault (%s) once as %s", async (kind, code) => {
      const { code: authCode, state } = await exchangeAgainst(kind);

      const err = expectOneReport("/api/auth/oidc/callback", code, "OIDC token exchange failed");
      expectNoneInSentryView(err, [authCode, state, CLIENT_SECRET]);
    });

    it.each(["invalid-grant", "access-denied", "grant-challenge"])(
      "does not report a token exchange the user caused (%s), but still counts and audits it",
      async (kind) => {
        await exchangeAgainst(kind);

        expect(reportErrorSpy).not.toHaveBeenCalled();
      },
    );
  });

  // Logout shares the discovery classification, so its report names the
  // scheme mismatch too instead of a generic failed discovery.
  describe("discovery at logout", () => {
    it("rejects a cold-cache logout discovery with the scheme-mismatch code", async () => {
      setIssuer("/t/invalid-grant");
      mutableEnv.EXTERNAL_URL = "https://snapotter.example.test";

      await expect(getOidcEndSessionEndpoint()).rejects.toMatchObject({
        name: "SafeError",
        kind: "operational",
        code: "OIDC_ISSUER_SCHEME_MISMATCH",
      });
    });
  });
});
