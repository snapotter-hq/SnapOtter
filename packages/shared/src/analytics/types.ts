export interface AnalyticsConfig {
  enabled: boolean;
  posthogApiKey: string;
  posthogHost: string;
  sentryDsn: string;
  sampleRate: number;
  instanceId: string;
}
