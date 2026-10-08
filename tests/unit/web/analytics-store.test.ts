// @vitest-environment jsdom

/**
 * The analytics setting is refetched on every focus, and the app opts the tab
 * out whenever it reads as off. A failed fetch must not read as off: a 500's
 * JSON body has no `enabled`, and treating it as a config turned telemetry
 * off for the rest of the tab's life, Sentry-only instances included (#1115).
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const { useAnalyticsStore } = await import("@/stores/analytics-store");

const ON = {
  enabled: true,
  posthogApiKey: "",
  posthogHost: "",
  posthogProxyPath: "",
  sentryDsn: "",
  sentryDsnWeb: "https://sentry.test/web/1",
  posthogSampleRate: 1,
  instanceId: "inst",
};

function respond(status: number, body: unknown) {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("analytics store fetchConfig", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useAnalyticsStore.setState({ config: null, configLoaded: false });
  });

  it("keeps the last setting when a refetch answers with an error", async () => {
    respond(200, ON);
    await useAnalyticsStore.getState().fetchConfig();
    expect(useAnalyticsStore.getState().config).toEqual(ON);

    respond(500, { statusCode: 500, error: "Internal Server Error" });
    await useAnalyticsStore.getState().fetchConfig();

    expect(useAnalyticsStore.getState().config).toEqual(ON);
    expect(useAnalyticsStore.getState().configLoaded).toBe(true);
  });

  it("leaves the setting unknown when the first fetch answers with an error", async () => {
    respond(503, { error: "unavailable" });
    await useAnalyticsStore.getState().fetchConfig();

    expect(useAnalyticsStore.getState().config).toBeNull();
    expect(useAnalyticsStore.getState().configLoaded).toBe(true);
  });

  it("takes an instance-wide opt-out the server reports", async () => {
    respond(200, ON);
    await useAnalyticsStore.getState().fetchConfig();
    respond(200, { ...ON, enabled: false });
    await useAnalyticsStore.getState().fetchConfig();

    expect(useAnalyticsStore.getState().config?.enabled).toBe(false);
  });
});
