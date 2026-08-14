import { ANALYTICS_BAKED, posthogAssetsHost } from "@snapotter/shared";

// Request headers the /ingest proxy must never forward to PostHog.
//   cookie / authorization -- carry the app session; forwarding them would leak
//     credentials to a third party.
//   host -- recomputed by the transport for the upstream.
//   client-IP carriers -- x-forwarded-*, x-real-ip, RFC 7239 `forwarded`, and the
//     CDN-specific true-client-ip / cf-connecting-ip -- stripped so PostHog
//     geolocates events to the instance's egress IP, never an end user's browser
//     IP. Also stops a client spoofing its way into the geo data. See TELEMETRY.md.
export const PROXY_STRIP_HEADERS: ReadonlySet<string> = new Set([
  "cookie",
  "authorization",
  "host",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
  "forwarded",
  "true-client-ip",
  "cf-connecting-ip",
]);

// Trim trailing slashes without a regex: `/\/+$/` is a polynomial-ReDoS shape
// (CodeQL js/polynomial-redos) on inputs with many trailing slashes.
const stripTrailingSlash = (url: string): string => {
  let end = url.length;
  while (end > 0 && url.charCodeAt(end - 1) === 47) end--; // 47 = "/"
  return url.slice(0, end);
};

const isOff = (v: string | undefined): boolean => v === "0" || v === "off" || v === "false";

// Break-glass for odd topologies (e.g. a deployment served under a subpath, where
// `origin + /ingest` would not route back to the app). On by default;
// SNAPOTTER_POSTHOG_PROXY in {0,off,false} makes the browser talk to PostHog
// directly instead. Disabling it does not disable analytics -- use
// SNAPOTTER_TELEMETRY for that.
export function posthogProxyEnabled(): boolean {
  return !isOff(process.env.SNAPOTTER_POSTHOG_PROXY);
}

// The fixed upstreams the /ingest route forwards to. A fixed host means the route
// can never be coerced into an open proxy. Defaults to the baked ingestion host
// (the same place posthog-node sends), with env overrides for tests.
export function resolvePostHogUpstreams(): { apiHost: string; assetsHost: string } {
  const apiHost = stripTrailingSlash(
    process.env.SNAPOTTER_POSTHOG_UPSTREAM ||
      ANALYTICS_BAKED.posthogHost ||
      "https://us.i.posthog.com",
  );
  const assetsHost = stripTrailingSlash(
    process.env.SNAPOTTER_POSTHOG_ASSETS_UPSTREAM || posthogAssetsHost(apiHost),
  );
  return { apiHost, assetsHost };
}

// ── Upstream failure observability (#788) ───────────────────────────────────

export type PostHogUpstreamErrorKind = "timeout" | "dns" | "socket" | "refused" | "other";

// @fastify/reply-from wraps transport failures into typed HTTP errors before
// invoking onError, so classification keys off the wrapper codes the hook
// actually receives (reply-from v12 index.js, verified against source):
//   ENOTFOUND / h2 stream cancel        -> FST_REPLY_FROM_SERVICE_UNAVAILABLE
//   TimeoutError / UND_ERR_HEADERS_TIMEOUT -> FST_REPLY_FROM_GATEWAY_TIMEOUT
//   ECONNRESET / UND_ERR_SOCKET / UND_ERR_CONNECT_TIMEOUT keep their codes
//   everything else (notably ECONNREFUSED and EAI_AGAIN) ->
//   FST_REPLY_FROM_INTERNAL_SERVER_ERROR with the raw message preserved
//   ("connect ECONNREFUSED <ip>:<port>", "getaddrinfo EAI_AGAIN <host>").
// h2 is disabled on this proxy, so the service-unavailable wrapper means DNS.
// The kind set is closed, so the Prometheus label stays low-cardinality.
//
// Known precision limits, all still counted (as "other"), just less specific:
// a dual-stack refused upstream surfaces as an AggregateError whose empty
// message the wrapper preserves (no cause chain to recover the code from), and
// EHOSTUNREACH / ENETUNREACH are left unmapped rather than guessed into
// "refused". The counter total is exact either way.
export function classifyPostHogUpstreamError(error: unknown): PostHogUpstreamErrorKind {
  const e = error as { code?: unknown; message?: unknown } | null | undefined;
  const code = typeof e?.code === "string" ? e.code : "";
  const message = typeof e?.message === "string" ? e.message : "";
  if (code === "FST_REPLY_FROM_GATEWAY_TIMEOUT" || code === "UND_ERR_CONNECT_TIMEOUT") {
    return "timeout";
  }
  if (code === "FST_REPLY_FROM_SERVICE_UNAVAILABLE") return "dns";
  if (code === "ECONNRESET" || code === "UND_ERR_SOCKET") return "socket";
  if (code === "FST_REPLY_FROM_INTERNAL_SERVER_ERROR") {
    if (message.includes("ECONNREFUSED")) return "refused";
    // The stalled-resolver shape (common when a container's DNS is broken):
    // not ENOTFOUND, so it bypasses the service-unavailable wrapper.
    if (message.includes("EAI_AGAIN")) return "dns";
  }
  return "other";
}

// A down upstream fails every forwarded event, which would mean one warn line
// per event. Throttle to one line per kind per minute; the Prometheus counter
// carries the true rate.
const UPSTREAM_ERROR_LOG_WINDOW_MS = 60_000;
const upstreamErrorLastLoggedAt = new Map<string, number>();

export function shouldLogUpstreamError(
  kind: PostHogUpstreamErrorKind,
  now: number = Date.now(),
): boolean {
  const last = upstreamErrorLastLoggedAt.get(kind);
  if (last !== undefined && now - last < UPSTREAM_ERROR_LOG_WINDOW_MS) return false;
  upstreamErrorLastLoggedAt.set(kind, now);
  return true;
}

// Test seam (no-op in production paths).
export function __resetUpstreamErrorLogThrottleForTests(): void {
  upstreamErrorLastLoggedAt.clear();
}
