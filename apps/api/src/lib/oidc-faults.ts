/**
 * Classification of OIDC sign-in failures for error reporting (#1869).
 *
 * Every SafeError built here has a constant message and a code, so the event
 * Sentry gets groups by code and never carries an issuer URL, an
 * authorization code, a state value, or a token. The original error rides
 * along as `cause` for the local log and the stack.
 */
import { connectivityClass, SafeError } from "@snapotter/shared";

interface OidcErrorShape {
  code?: unknown;
  error?: unknown;
  error_description?: unknown;
  status?: unknown;
  cause?: unknown;
}

/**
 * Wrap a failed discovery. openid-client tags a refused plain-http request
 * with OAUTH_HTTP_REQUEST_FORBIDDEN, which here only happens for an http
 * issuer on an https deployment (insecure requests are allowed otherwise),
 * so that case gets its own code instead of passing for an unreachable IdP.
 */
export function oidcDiscoveryFault(cause: unknown): SafeError {
  const code = (cause as OidcErrorShape | null)?.code;
  if (code === "OAUTH_HTTP_REQUEST_FORBIDDEN") {
    return new SafeError("OIDC issuer is plain http but EXTERNAL_URL is https", {
      code: "OIDC_ISSUER_SCHEME_MISMATCH",
      cause,
    });
  }
  if (code === "OAUTH_TIMEOUT") {
    return new SafeError("OIDC discovery timed out", { code: "OIDC_DISCOVERY_TIMEOUT", cause });
  }
  return new SafeError("OIDC discovery failed", { code: "OIDC_DISCOVERY_FAILED", cause });
}

// OAuth error codes a user produces on their own: an authorization code that
// expired or was already used (a back-button press, a double submit, a slow
// tab) comes back as invalid_grant, and access_denied is a refusal.
const USER_CAUSED_OAUTH_ERRORS = new Set(["invalid_grant", "access_denied"]);

function httpStatus(err: OidcErrorShape | null): number | undefined {
  if (typeof err?.status === "number") return err.status;
  // openid-client's "unexpected HTTP response status code" error carries the
  // raw Response as its cause.
  const causeStatus = (err?.cause as { status?: unknown } | null | undefined)?.status;
  return typeof causeStatus === "number" ? causeStatus : undefined;
}

/**
 * The report code for a failed authorization-code exchange, or null when the
 * user caused it and it should not be reported. Anything not recognisably
 * user-caused is reported: a misconfigured client fails every login, and
 * reportError throttles an operational code to one warning an hour.
 */
export function oidcTokenExchangeFaultCode(err: unknown): string | null {
  const e = err as OidcErrorShape | null;
  if (e?.code === "OAUTH_TIMEOUT") return "OIDC_TOKEN_TIMEOUT";
  if (connectivityClass(err)) return "OIDC_TOKEN_UNREACHABLE";

  const status = httpStatus(e);
  if (status !== undefined && status >= 500) return "OIDC_TOKEN_IDP_ERROR";

  const oauthError = typeof e?.error === "string" ? e.error : undefined;
  const description = typeof e?.error_description === "string" ? e.error_description : "";
  // RFC 6749 answers a redirect_uri mismatch with invalid_grant, so only the
  // description (Keycloak: "Incorrect redirect_uri") or a provider's own
  // redirect_uri_mismatch code tells it from an expired code.
  if (oauthError === "redirect_uri_mismatch" || /redirect_uri/i.test(description)) {
    return "OIDC_TOKEN_REDIRECT_URI";
  }
  if (
    oauthError === "invalid_client" ||
    oauthError === "unauthorized_client" ||
    // A 401 with a WWW-Authenticate challenge: client authentication failed.
    (e?.code === "OAUTH_WWW_AUTHENTICATE_CHALLENGE" && status === 401)
  ) {
    return "OIDC_TOKEN_CLIENT_REJECTED";
  }
  if (oauthError !== undefined && USER_CAUSED_OAUTH_ERRORS.has(oauthError)) return null;
  return "OIDC_TOKEN_EXCHANGE_FAILED";
}

/** Wrap a reportable token-exchange failure under the code classification gave it. */
export function oidcTokenExchangeFault(code: string, cause: unknown): SafeError {
  return new SafeError("OIDC token exchange failed", { code, cause });
}
