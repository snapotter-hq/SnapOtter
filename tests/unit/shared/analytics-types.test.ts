import type { AnalyticsConfig } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

describe("AnalyticsConfig type", () => {
  it("accepts a fully populated config object", () => {
    const config: AnalyticsConfig = {
      enabled: true,
      posthogApiKey: "phc_test123",
      posthogHost: "https://us.i.posthog.com",
      sentryDsn: "https://abc@sentry.io/123",
      sentryDsnWeb: "https://abc@sentry.io/456",
      posthogSampleRate: 1.0,
      instanceId: "inst-abc-123",
    };
    expect(config.enabled).toBe(true);
    expect(config.posthogApiKey).toBe("phc_test123");
    expect(config.posthogHost).toBe("https://us.i.posthog.com");
    expect(config.sentryDsn).toBe("https://abc@sentry.io/123");
    expect(config.sentryDsnWeb).toBe("https://abc@sentry.io/456");
    expect(config.posthogSampleRate).toBe(1.0);
    expect(config.instanceId).toBe("inst-abc-123");
  });

  it("accepts a config with analytics disabled", () => {
    const config: AnalyticsConfig = {
      enabled: false,
      posthogApiKey: "",
      posthogHost: "",
      sentryDsn: "",
      sentryDsnWeb: "",
      posthogSampleRate: 0,
      instanceId: "",
    };
    expect(config.enabled).toBe(false);
    expect(config.posthogSampleRate).toBe(0);
  });

  it("accepts fractional sample rates", () => {
    const config: AnalyticsConfig = {
      enabled: true,
      posthogApiKey: "key",
      posthogHost: "https://host.com",
      sentryDsn: "https://dsn",
      sentryDsnWeb: "https://dsn-web",
      posthogSampleRate: 0.5,
      instanceId: "id",
    };
    expect(config.posthogSampleRate).toBe(0.5);
  });

  it("has exactly the expected keys", () => {
    const config: AnalyticsConfig = {
      enabled: true,
      posthogApiKey: "key",
      posthogHost: "host",
      sentryDsn: "dsn",
      sentryDsnWeb: "dsn-web",
      posthogSampleRate: 1,
      instanceId: "id",
    };
    const keys = Object.keys(config).sort();
    expect(keys).toEqual(
      [
        "enabled",
        "instanceId",
        "posthogApiKey",
        "posthogHost",
        "posthogSampleRate",
        "sentryDsn",
        "sentryDsnWeb",
      ].sort(),
    );
  });
});
