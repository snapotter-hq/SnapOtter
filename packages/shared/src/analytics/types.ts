export interface AnalyticsConfig {
  enabled: boolean;
  posthogApiKey: string;
  posthogHost: string;
  sentryDsn: string;
  sentryDsnWeb: string;
  posthogSampleRate: number;
  instanceId: string;
}
