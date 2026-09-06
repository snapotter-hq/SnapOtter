// First-party PostHog reverse proxy for self-hosted instances.
//
// The self-hosted app forwards the browser's PostHog traffic through its own
// origin so ad blockers (which key on third-party hosts and obvious segments
// like /analytics or /track, not a plain first-party /ingest) don't drop it.
// The single baked ingestion host drives three PostHog hosts, so these helpers
// are the one place that mapping lives, shared by the proxy route, the config
// endpoint, and the client SDK init.

// Root-relative so the browser targets its own origin. Neutral segment on
// purpose: no "analytics", "tracking", "telemetry", "posthog", or bare "ph".
export const POSTHOG_PROXY_PATH = "/ingest";

// Trim trailing slashes without a regex: `/\/+$/` is a polynomial-ReDoS shape
// (CodeQL js/polynomial-redos) on inputs with many trailing slashes.
export const stripTrailingSlash = (url: string): string => {
  let end = url.length;
  while (end > 0 && url.charCodeAt(end - 1) === 47) end--; // 47 = "/"
  return url.slice(0, end);
};

// us.i.posthog.com -> us-assets.i.posthog.com (where posthog-js lazy-loads the
// recorder, surveys, etc.). A self-hosted PostHog has no <region>.i.posthog.com
// shape and serves assets from the same host, so leave it untouched.
export function posthogAssetsHost(ingestionHost: string): string {
  return stripTrailingSlash(ingestionHost).replace(
    /^(https?:\/\/)([a-z0-9-]+)\.i\.posthog\.com$/i,
    "$1$2-assets.i.posthog.com",
  );
}

// us.i.posthog.com -> us.posthog.com (the product UI host posthog-js points the
// toolbar and "view in PostHog" links at). Same self-hosted fallthrough.
export function posthogUiHost(ingestionHost: string): string {
  return stripTrailingSlash(ingestionHost).replace(
    /^(https?:\/\/)([a-z0-9-]+)\.i\.posthog\.com$/i,
    "$1$2.posthog.com",
  );
}

// Where posthog-js should send events from the browser. In proxy mode it targets
// the instance's own origin (first-party, ad-blocker-resistant) and points the
// UI host at real PostHog; otherwise it talks to PostHog directly.
export function resolvePostHogClientHosts(input: {
  posthogHost: string;
  posthogProxyPath: string;
  origin: string;
}): { apiHost: string; uiHost?: string } {
  const { posthogHost, posthogProxyPath, origin } = input;
  if (posthogProxyPath) {
    return {
      apiHost: `${stripTrailingSlash(origin)}${posthogProxyPath}`,
      uiHost: posthogUiHost(posthogHost),
    };
  }
  return { apiHost: posthogHost };
}
