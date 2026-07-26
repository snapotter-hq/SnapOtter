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
 * The shipped TRUST_PROXY default: believe `X-Forwarded-For` only from a peer
 * on a private network.
 *
 * The default install is `docker run -p 1349:1349` with nothing in front of it,
 * so trusting the header unconditionally made `request.ip` client-controlled
 * and every IP-keyed control bypassable by rotating one header
 * (SEC-20260726-002). A reverse proxy on a Docker network or a LAN holds an
 * RFC1918 address and is still believed; a public client's forged header is
 * not.
 *
 * `false` would close the same hole, but it would also collapse every proxied
 * deployment into a single rate-limit bucket keyed on the proxy, which is its
 * own denial of service.
 *
 * These three tokens are proxy-addr's named ranges: 127.0.0.0/8 and ::1/128,
 * 169.254.0.0/16 and fe80::/10, and 10/8 + 172.16/12 + 192.168/16 + fc00::/7.
 *
 * This constant is the single source of truth. docker/Dockerfile,
 * docker/docker-compose.yml and docker/docker-compose-gpu.yml repeat the
 * literal because they are not TypeScript; tests/unit/security/
 * trust-proxy-policy.test.ts pins all four together so they cannot drift.
 */
export const DEFAULT_TRUST_PROXY = "loopback,linklocal,uniquelocal";

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
