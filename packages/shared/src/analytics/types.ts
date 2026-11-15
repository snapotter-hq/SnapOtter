/** Fixed install-type enum; the only values that may become a Sentry or PostHog tag. */
export const DEPLOY_MODES = ["embedded", "external", "native"] as const;
export type DeployMode = (typeof DEPLOY_MODES)[number];

export interface AnalyticsConfig {
  enabled: boolean;
  posthogApiKey: string;
  posthogHost: string;
  // Root-relative path the browser routes PostHog through (first-party, so ad
  // blockers don't drop events). Empty string means talk to `posthogHost`
  // directly. See packages/shared/src/analytics/proxy.ts.
  posthogProxyPath: string;
  /**
   * Whether the API has a PostHog client that can actually take feedback.
   * `enabled` can be true with a key baked while `posthog-node` failed to
   * start, and the feedback route declines in that case. Clients gate their
   * feedback prompts on this rather than on the key (#2252).
   */
  feedbackSink: boolean;
  sentryDsn: string;
  sentryDsnWeb: string;
  posthogSampleRate: number;
  instanceId: string;
  /**
   * How this instance is installed. Tags web Sentry events so triage can tell a
   * Compose stack from the all-in-one container. Absent when analytics is off.
   */
  deployMode?: DeployMode;
}
