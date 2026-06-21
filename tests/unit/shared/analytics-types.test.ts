import type { AnalyticsConfig, ConsentState } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

describe("AnalyticsConfig type", () => {
  it("accepts a fully populated config object", () => {
    const config: AnalyticsConfig = {
      enabled: true,
      posthogApiKey: "phc_test123",
      posthogHost: "https://us.i.posthog.com",
      sentryDsn: "https://abc@sentry.io/123",
      sampleRate: 1.0,
      instanceId: "inst-abc-123",
    };
    expect(config.enabled).toBe(true);
    expect(config.posthogApiKey).toBe("phc_test123");
    expect(config.posthogHost).toBe("https://us.i.posthog.com");
    expect(config.sentryDsn).toBe("https://abc@sentry.io/123");
    expect(config.sampleRate).toBe(1.0);
    expect(config.instanceId).toBe("inst-abc-123");
  });

  it("accepts a config with analytics disabled", () => {
    const config: AnalyticsConfig = {
      enabled: false,
      posthogApiKey: "",
      posthogHost: "",
      sentryDsn: "",
      sampleRate: 0,
      instanceId: "",
    };
    expect(config.enabled).toBe(false);
    expect(config.sampleRate).toBe(0);
  });

  it("accepts fractional sample rates", () => {
    const config: AnalyticsConfig = {
      enabled: true,
      posthogApiKey: "key",
      posthogHost: "https://host.com",
      sentryDsn: "https://dsn",
      sampleRate: 0.5,
      instanceId: "id",
    };
    expect(config.sampleRate).toBe(0.5);
  });

  it("has exactly the expected keys", () => {
    const config: AnalyticsConfig = {
      enabled: true,
      posthogApiKey: "key",
      posthogHost: "host",
      sentryDsn: "dsn",
      sampleRate: 1,
      instanceId: "id",
    };
    const keys = Object.keys(config).sort();
    expect(keys).toEqual(
      ["enabled", "instanceId", "posthogApiKey", "posthogHost", "sampleRate", "sentryDsn"].sort(),
    );
  });
});

describe("ConsentState type", () => {
  it("accepts all-null state (fresh user)", () => {
    const state: ConsentState = {
      analyticsEnabled: null,
      analyticsConsentShownAt: null,
      analyticsConsentRemindAt: null,
    };
    expect(state.analyticsEnabled).toBeNull();
    expect(state.analyticsConsentShownAt).toBeNull();
    expect(state.analyticsConsentRemindAt).toBeNull();
  });

  it("accepts opted-in state (analyticsEnabled = true)", () => {
    const state: ConsentState = {
      analyticsEnabled: true,
      analyticsConsentShownAt: 1713800000000,
      analyticsConsentRemindAt: null,
    };
    expect(state.analyticsEnabled).toBe(true);
    expect(state.analyticsConsentShownAt).toBe(1713800000000);
    expect(state.analyticsConsentRemindAt).toBeNull();
  });

  it("accepts declined state (analyticsEnabled = false)", () => {
    const state: ConsentState = {
      analyticsEnabled: false,
      analyticsConsentShownAt: 1713800000000,
      analyticsConsentRemindAt: null,
    };
    expect(state.analyticsEnabled).toBe(false);
  });

  it("accepts deferred state (maybe later with remindAt set)", () => {
    const shownAt = Date.now() - 86400000;
    const remindAt = Date.now() + 86400000 * 6;
    const state: ConsentState = {
      analyticsEnabled: null,
      analyticsConsentShownAt: shownAt,
      analyticsConsentRemindAt: remindAt,
    };
    expect(state.analyticsEnabled).toBeNull();
    expect(state.analyticsConsentShownAt).toBe(shownAt);
    expect(state.analyticsConsentRemindAt).toBe(remindAt);
  });

  it("accepts mixed state with analyticsEnabled true and remindAt set", () => {
    const state: ConsentState = {
      analyticsEnabled: true,
      analyticsConsentShownAt: 1713800000000,
      analyticsConsentRemindAt: 1714400000000,
    };
    expect(state.analyticsEnabled).toBe(true);
    expect(state.analyticsConsentRemindAt).toBe(1714400000000);
  });

  it("has exactly the expected keys", () => {
    const state: ConsentState = {
      analyticsEnabled: null,
      analyticsConsentShownAt: null,
      analyticsConsentRemindAt: null,
    };
    const keys = Object.keys(state).sort();
    expect(keys).toEqual(
      ["analyticsConsentRemindAt", "analyticsConsentShownAt", "analyticsEnabled"].sort(),
    );
  });
});
