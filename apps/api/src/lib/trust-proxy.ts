/**
 * TRUST_PROXY parsing.
 *
 * The value decides which peers Fastify believes when they send
 * `X-Forwarded-For`, and therefore what `request.ip` resolves to. Every
 * IP-keyed control in the product reads `request.ip`: the global rate limiter,
 * the login brute-force limiter, the enterprise IP allowlist, and audit-log
 * attribution. Extracted from apps/api/src/index.ts so the security suite can
 * pin this behaviour without booting the server.
 */

/**
 * Turn the raw TRUST_PROXY env string into a Fastify `trustProxy` value.
 *
 * Three forms, all of which proxy-addr understands:
 *   "true" / "false" -> trust every peer / trust none
 *   a number         -> trust that many hops
 *   anything else    -> a comma-separated list of CIDRs or named ranges
 *                       ("loopback", "linklocal", "uniquelocal")
 */
export function parseTrustProxy(value: string): boolean | number | string {
  if (value === "true") return true;
  if (value === "false") return false;
  const asNum = Number(value);
  if (!Number.isNaN(asNum)) return asNum;
  return value; // CIDR list
}
