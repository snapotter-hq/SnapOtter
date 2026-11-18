import type { FastifyRequest } from "fastify";

export const HEALTH_PROBE_ROUTE = "/api/v1/health";

/**
 * The public health probe (Docker HEALTHCHECK, uptime monitors). Its handler
 * runs its own database probe and answers 503 when that fails, so hooks that
 * would query Postgres first (session lookup, per-user rate limit) must skip it
 * or a database outage turns every probe into a reported 500 (#4652).
 * Keyed on the matched route, not request.url, so a lookalike path or query
 * string can't borrow the exemption.
 */
export function isHealthProbe(request: FastifyRequest): boolean {
  return (
    (request.method === "GET" || request.method === "HEAD") &&
    request.routeOptions?.url === HEALTH_PROBE_ROUTE
  );
}
