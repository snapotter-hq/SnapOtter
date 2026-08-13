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
