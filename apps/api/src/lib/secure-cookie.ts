import type { FastifyRequest } from "fastify";
import { env } from "../config.js";

/**
 * Whether an auth cookie set on this request should carry the Secure
 * attribute (issue #817).
 *
 * Two independent signals, OR-ed:
 *  - EXTERNAL_URL starts with https: the operator declared an HTTPS origin.
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
  return env.EXTERNAL_URL.startsWith("https") || request.protocol === "https";
}
