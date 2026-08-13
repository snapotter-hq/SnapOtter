export interface AnalyticsConfig {
  enabled: boolean;
  posthogApiKey: string;
  posthogHost: string;
  // Root-relative path the browser routes PostHog through (first-party, so ad
  // blockers don't drop events). Empty string means talk to `posthogHost`
  // directly. See packages/shared/src/analytics/proxy.ts.
  posthogProxyPath: string;
  sentryDsn: string;
  sentryDsnWeb: string;
  posthogSampleRate: number;
  instanceId: string;
}
