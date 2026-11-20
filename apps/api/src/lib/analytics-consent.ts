/**
 * Written once at boot by classifyAnalyticsConsentOrigin (settings-helpers.ts):
 * "upgrade" for an instance that already had data before the first-run consent
 * prompt existed, "fresh" for a new one. It decides what a missing
 * analyticsEnabled row means (#4910).
 */
export const ANALYTICS_CONSENT_ORIGIN_KEY = "analyticsConsentOrigin";
