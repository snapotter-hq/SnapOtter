import type { IncomingHttpHeaders } from "node:http";
import proxy from "@fastify/http-proxy";
import { POSTHOG_PROXY_PATH } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import { analyticsEnabled } from "../lib/analytics-gate.js";
import { posthogProxyUpstreamErrors } from "../lib/metrics.js";
import {
  classifyPostHogUpstreamError,
  PROXY_STRIP_HEADERS,
  resolvePostHogUpstreams,
  shouldLogUpstreamError,
} from "../lib/posthog-proxy.js";

// First-party reverse proxy: the browser's posthog-js traffic goes through the
// instance's own origin (ad-blocker-resistant) instead of a third-party host.
// posthog-node (server side) still talks to PostHog directly -- a server never
// meets an ad blocker, so there is nothing to route around there.
export async function registerPostHogProxy(app: FastifyInstance): Promise<void> {
  const { apiHost, assetsHost } = resolvePostHogUpstreams();
  // Root logger, captured on purpose: the proxy scope runs at logLevel "error"
  // (see below), which silences the request-bound logger for these routes. The
  // throttled operator warn in onError must survive that, so it goes through
  // the app's own logger instead of reply.request.log.
  const log = app.log;

  // @fastify/http-proxy is fastify-plugin-wrapped, so it adds its own passthrough
  // content-type parsers to whatever scope it is registered in. The main app
  // (index.ts) already defines a custom application/json parser at the root, and a
  // Fastify child inherits its parent's parsers, so a naive registration throws
  // FST_ERR_CTP_ALREADY_PRESENT at boot. Register in an encapsulated child and
  // clear the inherited parsers there first: the proxy streams raw bodies upstream
  // and needs no parser of the app's, and the removal is scoped to this child, so
  // the app's root parser is untouched. The /ingest route stays globally routable.
  //
  // logLevel "error" applies to every route the proxy registers in this scope.
  // Analytics beacons are high-frequency and best-effort, and reply-from emits an
  // unsuppressable per-event "response errored" warn plus per-request info lines;
  // during a PostHog outage that is one line per dropped event. The counter and
  // the throttled warn below are the operator signal, so the per-event stream is
  // noise by design here, not lost information.
  await app.register(
    async (scope) => {
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
          // Operator signal for #788: a Prometheus counter per failed forward,
          // classified into a closed kind set, plus one attributable warn per kind
          // per minute through the root logger. Fires only after the
          // analyticsEnabled() preHandler let the forward proceed, so a
          // telemetry-off instance stays silent here too.
          //
          // The reply is a hand-built terminal response, NOT reply.send(error):
          // sending an Error instance would route through the app's global error
          // handler (index.ts setErrorHandler), which logs error-level per event
          // and reports >=500s to Sentry as bug-class. reply-from's wrappers carry
          // no cause chain, so classifyError cannot see the underlying network
          // code, and a PostHog outage would storm Sentry from every instance.
          // An unreachable third party is operational noise, not an app bug, so
          // it stays out of the error pipeline entirely. posthog-js only looks at
          // the status class: it treats the mapped 5xx as a dropped event and
          // retries, same as reply-from's default.
          onError(reply, { error }) {
            const kind = classifyPostHogUpstreamError(error);
            posthogProxyUpstreamErrors.inc({ kind });
            if (shouldLogUpstreamError(kind)) {
              log.warn(
                { err: error, kind },
                "posthog proxy upstream unreachable: browser analytics is not reaching PostHog",
              );
            }
            const statusCode = (error as { statusCode?: number }).statusCode ?? 502;
            reply.code(statusCode).send({ error: "posthog_upstream_unreachable" });
          },
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
    },
    { logLevel: "error" },
  );
}
