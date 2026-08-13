import type { IncomingHttpHeaders } from "node:http";
import proxy from "@fastify/http-proxy";
import { POSTHOG_PROXY_PATH } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import { analyticsEnabled } from "../lib/analytics-gate.js";
import { PROXY_STRIP_HEADERS, resolvePostHogUpstreams } from "../lib/posthog-proxy.js";

// First-party reverse proxy: the browser's posthog-js traffic goes through the
// instance's own origin (ad-blocker-resistant) instead of a third-party host.
// posthog-node (server side) still talks to PostHog directly -- a server never
// meets an ad blocker, so there is nothing to route around there.
export async function registerPostHogProxy(app: FastifyInstance): Promise<void> {
  const { apiHost, assetsHost } = resolvePostHogUpstreams();

  // @fastify/http-proxy is fastify-plugin-wrapped, so it adds its own passthrough
  // content-type parsers to whatever scope it is registered in. The main app
  // (index.ts) already defines a custom application/json parser at the root, and a
  // Fastify child inherits its parent's parsers, so a naive registration throws
  // FST_ERR_CTP_ALREADY_PRESENT at boot. Register in an encapsulated child and
  // clear the inherited parsers there first: the proxy streams raw bodies upstream
  // and needs no parser of the app's, and the removal is scoped to this child, so
  // the app's root parser is untouched. The /ingest route stays globally routable.
  await app.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    await scope.register(proxy, {
      upstream: "", // required key, but getUpstream below picks the real target per request
      prefix: POSTHOG_PROXY_PATH,
      http2: false,
      websocket: false, // PostHog ingestion is plain HTTP; no WS upstream to proxy
      // Fire-and-forget analytics: fail fast on a stalled PostHog rather than hold
      // the socket for undici's 5-minute default. posthog-js retries dropped events.
      undici: { headersTimeout: 15_000, bodyTimeout: 15_000 },
      // Respect the runtime opt-out: a disabled instance exposes no forwarder, so
      // "analytics off" genuinely means zero egress (the invariant PR #423 hardened).
      preHandler: async (_request, reply) => {
        if (!analyticsEnabled()) {
          await reply.code(204).send();
        }
      },
      replyOptions: {
        // Best-effort error handling by design: reply-from's default onError logs
        // the upstream failure at warn and maps it to a 5xx, which posthog-js
        // treats as a dropped event and retries. We keep that rather than a custom
        // onError; richer operator signal (metric + error id) is tracked in #788.
        //
        // Only posthog-js's lazily loaded static assets (recorder, surveys, ...)
        // live on the assets host; capture / decide / flags / etc. go to ingestion.
        // This hook receives the full pre-strip path ("/ingest/static/recorder.js");
        // the bare "/static" clause is a fallback should a future version pre-strip.
        getUpstream(request) {
          const url = request.url;
          const isAsset =
            url.startsWith(`${POSTHOG_PROXY_PATH}/static`) || url.startsWith("/static");
          return isAsset ? assetsHost : apiHost;
        },
        rewriteRequestHeaders(_request, headers) {
          const out: IncomingHttpHeaders = {};
          for (const [name, value] of Object.entries(headers)) {
            if (!PROXY_STRIP_HEADERS.has(name.toLowerCase())) out[name] = value;
          }
          return out;
        },
      },
    });
  });
}
