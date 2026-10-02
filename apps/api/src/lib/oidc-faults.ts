/**
 * Classification of OIDC sign-in failures for error reporting (#1869).
 *
 * Every SafeError built here has a constant message and a code (tagged as
 * error_code on the Sentry event), so the event never carries an issuer URL,
 * an authorization code, a state value, or a token. The original error rides
 * along as `cause` for the local log and the stack. An unreachable IdP
 * (refused connection, unknown host, dropped socket, connect timeout) still
 * groups under reportError's shared connectivity fingerprint rather than its
 * own code. connectivityClass has no timeout class, so CONNECT_TIMEOUT_CODES
 * below is what keeps the TIMEOUT codes apart from UNREACHABLE.
 */
import { connectivityClass, SafeError } from "@snapotter/shared";

interface OidcErrorShape {
  code?: unknown;
  error?: unknown;
  error_description?: unknown;
  status?: unknown;
  cause?: unknown;
}

// undici's connect timeout (10s) fires before openid-client's own 30s request
// timeout, so an IdP behind a firewall that drops packets surfaces as a
// "fetch failed" TypeError with this code somewhere in its cause chain.
const CONNECT_TIMEOUT_CODES = new Set(["UND_ERR_CONNECT_TIMEOUT"]);

function chainHasCode(err: unknown, codes: Set<string>): boolean {
  let cur = err;
  for (let depth = 0; depth < 6 && cur && typeof cur === "object"; depth++) {
    const code = (cur as OidcErrorShape).code;
    if (typeof code === "string" && codes.has(code)) return true;
    cur = (cur as OidcErrorShape).cause;
  }
  return false;
}

function isTimeout(err: unknown): boolean {
  return (
    (err as OidcErrorShape | null)?.code === "OAUTH_TIMEOUT" ||
    chainHasCode(err, CONNECT_TIMEOUT_CODES)
  );
}

/**
 * Wrap a failed discovery. openid-client tags a refused plain-http request
 * with OAUTH_HTTP_REQUEST_FORBIDDEN, which here only happens for an http
 * issuer on an https deployment (insecure requests are allowed otherwise),
 * so that case gets its own code instead of passing for an unreachable IdP.
 */
export function oidcDiscoveryFault(cause: unknown): SafeError {
  if ((cause as OidcErrorShape | null)?.code === "OAUTH_HTTP_REQUEST_FORBIDDEN") {
    return new SafeError("OIDC issuer is plain http but EXTERNAL_URL is https", {
      code: "OIDC_ISSUER_SCHEME_MISMATCH",
      cause,
    });
  }
  if (isTimeout(cause)) {
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
 * The OAuth `error` and `error_description` of a token-endpoint answer. A
 * ResponseBodyError carries them itself; a WWWAuthenticateChallengeError
 * (any non-200 with a WWW-Authenticate header, thrown before the body is
 * read) carries them as parameters of its parsed challenges.
 */
function oauthErrorOf(err: OidcErrorShape | null): { error?: string; description: string } {
  if (typeof err?.error === "string") {
    return {
      error: err.error,
      description: typeof err.error_description === "string" ? err.error_description : "",
    };
  }
  if (err?.code === "OAUTH_WWW_AUTHENTICATE_CHALLENGE" && Array.isArray(err.cause)) {
    for (const challenge of err.cause) {
      const params = (challenge as { parameters?: Record<string, unknown> } | null)?.parameters;
      if (typeof params?.error === "string") {
        return {
          error: params.error,
          description: typeof params.error_description === "string" ? params.error_description : "",
        };
      }
    }
  }
  return { description: "" };
}

/**
 * The report code for a failed authorization-code exchange, or null when the
 * user caused it and it should not be reported. Anything not recognisably
 * user-caused is reported: a misconfigured client fails every login, and
 * reportError throttles an operational code to one warning an hour.
 */
export function oidcTokenExchangeFaultCode(err: unknown): string | null {
  const e = err as OidcErrorShape | null;
  if (isTimeout(err)) return "OIDC_TOKEN_TIMEOUT";
  if (connectivityClass(err)) return "OIDC_TOKEN_UNREACHABLE";

  const status = httpStatus(e);
  if (status !== undefined && status >= 500) return "OIDC_TOKEN_IDP_ERROR";

  const { error: oauthError, description } = oauthErrorOf(e);
  // RFC 6749 answers a redirect_uri mismatch with invalid_grant, so only the
  // description (Keycloak: "Incorrect redirect_uri") or a provider's own
  // redirect_uri_mismatch code tells it from an expired code.
  if (oauthError === "redirect_uri_mismatch" || /redirect_uri/i.test(description)) {
    return "OIDC_TOKEN_REDIRECT_URI";
  }
  if (
    oauthError === "invalid_client" ||
    oauthError === "unauthorized_client" ||
    // A bare 401 challenge with no OAuth error: client authentication failed.
    (oauthError === undefined && e?.code === "OAUTH_WWW_AUTHENTICATE_CHALLENGE" && status === 401)
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
