import type { FastifyRequest } from "fastify";
import { env } from "../config.js";
import { isHttpsUrl } from "./env.js";

/**
 * Whether an auth cookie set on this request should carry the Secure
 * attribute (issue #817).
 *
 * Two independent signals, OR-ed:
 *  - EXTERNAL_URL declares an https origin. The scheme is parsed, so
 *    "HTTPS://" counts (#1775). The old lowercase prefix match is kept
 *    alongside it: with SSO off EXTERNAL_URL isn't validated at boot, and a
 *    typo like "https//host" that got Secure before must not quietly lose it.
 *  - request.protocol is "https": the request actually arrived over HTTPS.
 *    Fastify resolves this from X-Forwarded-Proto when the peer is trusted,
 *    and the TRUST_PROXY default (loopback,linklocal,uniquelocal) already
 *    trusts a reverse proxy on a private network, so HTTPS-behind-proxy
 *    installs get Secure cookies without configuring EXTERNAL_URL.
 *
 * Never hardcode this to true: plain-HTTP LAN installs are supported, and
 * browsers refuse to store Secure cookies over http.
 */
export function isSecureRequest(request: FastifyRequest): boolean {
  return (
    isHttpsUrl(env.EXTERNAL_URL) ||
    env.EXTERNAL_URL.startsWith("https") ||
    request.protocol === "https"
  );
}
