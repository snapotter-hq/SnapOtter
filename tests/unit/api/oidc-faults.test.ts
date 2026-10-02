/**
 * The report/no-report split for OIDC sign-in failures (#1869), on errors
 * shaped exactly like the ones openid-client throws. The integration suite
 * (tests/integration/platform/oidc-login-failure-report.test.ts) drives the
 * real calls against a mock IdP; this pins the branches it can't reach
 * cheaply, such as a token-endpoint timeout.
 */

import { ClientError, ResponseBodyError, WWWAuthenticateChallengeError } from "openid-client";
import { describe, expect, it } from "vitest";
import { classifyError } from "../../../apps/api/src/lib/error-report.js";
import {
  oidcDiscoveryFault,
  oidcTokenExchangeFault,
  oidcTokenExchangeFaultCode,
} from "../../../apps/api/src/lib/oidc-faults.js";

function bodyError(status: number, body: Record<string, string>): Error {
  return new ResponseBodyError("server responded with an error in the response body", {
    cause: body,
    response: new Response(JSON.stringify(body), { status }),
  });
}

// What oauth4webapi throws for any non-200 token answer carrying a
// WWW-Authenticate header, before it reads the body.
function challengeError(status: number, parameters: Record<string, string>): Error {
  return new WWWAuthenticateChallengeError("server responded with a challenge", {
    cause: [{ scheme: "basic", parameters }],
    response: new Response("", { status, headers: { "www-authenticate": "Basic" } }),
  });
}

function fetchFailed(code: string): Error {
  return new TypeError("fetch failed", {
    cause: Object.assign(new Error(`connect ${code} 127.0.0.1:1`), { code }),
  });
}

describe("oidcDiscoveryFault", () => {
  it("names an http issuer on an https deployment instead of calling the IdP unreachable", () => {
    const cause = new ClientError("only requests to HTTPS are allowed", {
      code: "OAUTH_HTTP_REQUEST_FORBIDDEN",
    });
    const fault = oidcDiscoveryFault(cause);
    expect(fault).toMatchObject({
      code: "OIDC_ISSUER_SCHEME_MISMATCH",
      message: "OIDC issuer is plain http but EXTERNAL_URL is https",
      kind: "operational",
      cause,
    });
    expect(classifyError(fault, "http")).toBe("operational");
  });

  it("treats undici's connect timeout as a timed-out discovery", () => {
    const cause = new TypeError("fetch failed", {
      cause: Object.assign(new Error("Connect Timeout Error"), { code: "UND_ERR_CONNECT_TIMEOUT" }),
    });
    expect(oidcDiscoveryFault(cause)).toMatchObject({ code: "OIDC_DISCOVERY_TIMEOUT", cause });
  });

  it("gives openid-client's timeout its own code", () => {
    const cause = new ClientError("operation timed out", {
      code: "OAUTH_TIMEOUT",
      cause: new DOMException("The operation timed out.", "TimeoutError"),
    });
    const fault = oidcDiscoveryFault(cause);
    expect(fault).toMatchObject({ code: "OIDC_DISCOVERY_TIMEOUT", cause });
    expect(classifyError(fault, "http")).toBe("operational");
  });

  it.each([
    [
      "a 404 discovery document",
      new ClientError("unexpected HTTP response status code", {
        code: "OAUTH_RESPONSE_IS_NOT_CONFORM",
      }),
    ],
    ["a refused connection", fetchFailed("ECONNREFUSED")],
    ["a non-error throw", "boom"],
    ["undefined", undefined],
  ])("reports %s as a failed discovery", (_label, cause) => {
    const fault = oidcDiscoveryFault(cause);
    expect(fault).toMatchObject({
      code: "OIDC_DISCOVERY_FAILED",
      message: "OIDC discovery failed",
    });
    expect(classifyError(fault, "http")).toBe("operational");
  });
});

describe("oidcTokenExchangeFaultCode", () => {
  it.each([
    [
      "an expired or replayed code",
      bodyError(400, { error: "invalid_grant", error_description: "Code not valid" }),
    ],
    ["access_denied", bodyError(400, { error: "access_denied" })],
    ["an expired code behind a challenge header", challengeError(400, { error: "invalid_grant" })],
  ])("does not report %s: the user caused it", (_label, err) => {
    expect(oidcTokenExchangeFaultCode(err)).toBeNull();
  });

  it.each([
    [
      "a token endpoint timeout",
      new ClientError("operation timed out", { code: "OAUTH_TIMEOUT" }),
      "OIDC_TOKEN_TIMEOUT",
    ],
    ["a refused connection", fetchFailed("ECONNREFUSED"), "OIDC_TOKEN_UNREACHABLE"],
    ["an unknown host", fetchFailed("ENOTFOUND"), "OIDC_TOKEN_UNREACHABLE"],
    ["an IdP that closes the socket", fetchFailed("UND_ERR_SOCKET"), "OIDC_TOKEN_UNREACHABLE"],
    [
      "a 500 with an OAuth error body",
      bodyError(500, { error: "server_error" }),
      "OIDC_TOKEN_IDP_ERROR",
    ],
    [
      "a 502 with no OAuth body",
      new ClientError("unexpected HTTP response status code", {
        code: "OAUTH_RESPONSE_IS_NOT_CONFORM",
        cause: new Response("bad gateway", { status: 502 }),
      }),
      "OIDC_TOKEN_IDP_ERROR",
    ],
    // An IdP 5xx wins over the OAuth code it happens to carry.
    ["a 503 invalid_grant", bodyError(503, { error: "invalid_grant" }), "OIDC_TOKEN_IDP_ERROR"],
    ["invalid_client", bodyError(401, { error: "invalid_client" }), "OIDC_TOKEN_CLIENT_REJECTED"],
    [
      "unauthorized_client",
      bodyError(400, { error: "unauthorized_client" }),
      "OIDC_TOKEN_CLIENT_REJECTED",
    ],
    ["a bare 401 challenge", challengeError(401, { realm: "idp" }), "OIDC_TOKEN_CLIENT_REJECTED"],
    [
      "a 401 challenge naming invalid_client",
      challengeError(401, { error: "invalid_client" }),
      "OIDC_TOKEN_CLIENT_REJECTED",
    ],
    [
      "a 400 challenge naming a redirect_uri mismatch",
      challengeError(400, { error: "invalid_grant", error_description: "Incorrect redirect_uri" }),
      "OIDC_TOKEN_REDIRECT_URI",
    ],
    [
      "a firewall that drops packets (undici connect timeout)",
      new TypeError("fetch failed", {
        cause: Object.assign(new Error("Connect Timeout Error"), {
          code: "UND_ERR_CONNECT_TIMEOUT",
        }),
      }),
      "OIDC_TOKEN_TIMEOUT",
    ],
    [
      "Keycloak's redirect_uri rejection",
      bodyError(400, { error: "invalid_grant", error_description: "Incorrect redirect_uri" }),
      "OIDC_TOKEN_REDIRECT_URI",
    ],
    [
      "redirect_uri_mismatch",
      bodyError(400, { error: "redirect_uri_mismatch" }),
      "OIDC_TOKEN_REDIRECT_URI",
    ],
    [
      "unsupported_grant_type",
      bodyError(400, { error: "unsupported_grant_type" }),
      "OIDC_TOKEN_EXCHANGE_FAILED",
    ],
    [
      "a 404 token endpoint",
      new ClientError("unexpected HTTP response status code", {
        code: "OAUTH_RESPONSE_IS_NOT_CONFORM",
        cause: new Response("", { status: 404 }),
      }),
      "OIDC_TOKEN_EXCHANGE_FAILED",
    ],
    [
      "an ID token outside its validity window (clock skew)",
      new ClientError("JWT timestamp claim value failed validation", {
        code: "OAUTH_JWT_TIMESTAMP_CHECK",
      }),
      "OIDC_TOKEN_EXCHANGE_FAILED",
    ],
    ["a non-error throw", "boom", "OIDC_TOKEN_EXCHANGE_FAILED"],
  ])("reports %s as %s", (_label, err, code) => {
    expect(oidcTokenExchangeFaultCode(err)).toBe(code);
    const fault = oidcTokenExchangeFault(code, err);
    expect(fault).toMatchObject({
      code,
      message: "OIDC token exchange failed",
      kind: "operational",
    });
    expect(classifyError(fault, "http")).toBe("operational");
  });
});
