/**
 * The integration list instrument.ts hands to Sentry.init, built from the SDK
 * module it already loaded so this file never imports @sentry/node at runtime
 * (the type import is erased). Kept separate so a test can init the real SDK
 * with exactly the production list.
 */
import type * as SentryNode from "@sentry/node";
import { buildGatedSpotlight } from "./sentry-transport.js";

type SentryModule = typeof SentryNode;
type SentryIntegrations = NonNullable<Parameters<SentryModule["init"]>[0]>["integrations"];

export function buildSentryIntegrations(
  Sentry: SentryModule,
  tracingEnabled: boolean,
  isActive: () => boolean,
): SentryIntegrations {
  // Both replace the default instance of the same name (#1880). The http
  // integration buffers up to 10 KB of every incoming request body by default,
  // and sendDefaultPii does not gate that, so a login password, a SAML
  // assertion, or an uploaded file's bytes rode along on events. "none" stops
  // the buffering at the source. RequestData then never attaches a body,
  // cookies, the separate query_string, or a client IP to `event.request`.
  // It still attaches the full url (query included) and the raw headers
  // (Authorization included): beforeSend and beforeSendTransaction in
  // sentry-scrub.ts remove those, and span attributes, on the way out.
  const ours = [
    Sentry.httpIntegration({
      trackIncomingRequestsAsSessions: false,
      maxIncomingRequestBodySize: "none",
    }),
    Sentry.requestDataIntegration({
      include: { cookies: false, data: false, query_string: false, ip: false },
    }),
    // Only does anything when SENTRY_SPOTLIGHT is set; see sentry-transport.ts.
    buildGatedSpotlight(isActive, Sentry.spotlightIntegration),
  ];
  // With tracing on, use the function form to DROP the default Redis
  // integration (the array form is additive and would keep it). With tracing
  // off, the array form is fine: no sampler means the defaults never start a
  // transaction, so they stay inert.
  return tracingEnabled
    ? (defaults) => defaults.filter((i) => i.name !== "Redis").concat(ours)
    : ours;
}
