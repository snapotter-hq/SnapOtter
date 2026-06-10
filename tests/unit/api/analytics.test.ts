import { beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({
  ANALYTICS_ENABLED: false,
  POSTHOG_API_KEY: "",
  POSTHOG_HOST: "",
  SENTRY_DSN: "",
  ANALYTICS_SAMPLE_RATE: 1.0,
}));

const dbGetResult = vi.hoisted(() => ({ value: null as unknown }));
const mockAuthUser = vi.hoisted(() => ({
  value: null as { id: string; analyticsEnabled?: boolean } | null,
}));

const mockCapture = vi.hoisted(() => vi.fn());
const mockShutdown = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const MockPostHog = vi.hoisted(() =>
  vi.fn().mockImplementation(() => ({
    capture: mockCapture,
    shutdown: mockShutdown,
  })),
);

const mockSentryCapture = vi.hoisted(() => vi.fn());
const mockSentryClose = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockSentryInit = vi.hoisted(() => vi.fn());

vi.mock("../../../apps/api/src/config.js", () => ({ env: config }));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => {
          const val = dbGetResult.value;
          return Promise.resolve(val ? [val] : []);
        },
      }),
    }),
  },
  pool: {},
  closeDb: async () => {},
  schema: {
    settings: { key: "key" },
    users: { id: "id", analyticsEnabled: "analyticsEnabled" },
  },
}));

vi.mock("../../../apps/api/src/plugins/auth.js", () => ({
  getAuthUser: () => mockAuthUser.value,
}));

vi.mock("drizzle-orm", () => ({
  eq: () => "mocked-eq",
}));

vi.mock("posthog-node", () => ({
  PostHog: MockPostHog,
}));

vi.mock("@sentry/node", () => ({
  init: mockSentryInit,
  captureException: mockSentryCapture,
  close: mockSentryClose,
}));

type AnalyticsModule = typeof import("../../../apps/api/src/lib/analytics.js");
let mod: AnalyticsModule;

beforeEach(async () => {
  config.ANALYTICS_ENABLED = false;
  config.POSTHOG_API_KEY = "";
  config.POSTHOG_HOST = "";
  config.SENTRY_DSN = "";
  config.ANALYTICS_SAMPLE_RATE = 1.0;

  dbGetResult.value = null;
  mockAuthUser.value = null;

  mockCapture.mockClear();
  mockShutdown.mockClear();
  MockPostHog.mockClear();
  mockSentryCapture.mockClear();
  mockSentryClose.mockClear();
  mockSentryInit.mockClear();

  vi.resetModules();
  mod = await import("../../../apps/api/src/lib/analytics.js");
});

describe("initAnalytics", () => {
  it("does nothing when ANALYTICS_ENABLED is false", async () => {
    config.ANALYTICS_ENABLED = false;
    await expect(mod.initAnalytics()).resolves.toBeUndefined();
    expect(MockPostHog).not.toHaveBeenCalled();
  });

  it("does nothing when ANALYTICS_ENABLED is true but POSTHOG_API_KEY is empty", async () => {
    config.ANALYTICS_ENABLED = true;
    config.POSTHOG_API_KEY = "";
    await expect(mod.initAnalytics()).resolves.toBeUndefined();
    expect(MockPostHog).not.toHaveBeenCalled();
  });

  it("initializes posthog when enabled with API key", async () => {
    config.ANALYTICS_ENABLED = true;
    config.POSTHOG_API_KEY = "phc_test_key";
    config.POSTHOG_HOST = "https://test.posthog.com";
    await mod.initAnalytics();

    expect(MockPostHog).toHaveBeenCalledWith("phc_test_key", {
      host: "https://test.posthog.com",
      flushAt: 20,
      flushInterval: 30000,
    });
  });

  it("initializes sentry when SENTRY_DSN is provided", async () => {
    config.ANALYTICS_ENABLED = true;
    config.POSTHOG_API_KEY = "phc_test_key";
    config.SENTRY_DSN = "https://test@sentry.io/123";
    await mod.initAnalytics();
    expect(mockSentryInit).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://test@sentry.io/123",
        sendDefaultPii: false,
      }),
    );
  });
});

describe("captureException", () => {
  it("does nothing when sentryModule is null", async () => {
    await expect(mod.captureException(new Error("test"))).resolves.toBeUndefined();
  });

  it("does nothing when request user is not opted in", async () => {
    config.ANALYTICS_ENABLED = true;
    config.POSTHOG_API_KEY = "phc_test_key";
    config.SENTRY_DSN = "https://test@sentry.io/123";
    await mod.initAnalytics();

    mockAuthUser.value = null;
    const fakeRequest = { headers: {} } as Parameters<typeof mod.captureException>[1];
    await mod.captureException(new Error("test"), fakeRequest);
    expect(mockSentryCapture).not.toHaveBeenCalled();
  });

  it("captures when sentry is initialized and no request provided", async () => {
    config.ANALYTICS_ENABLED = true;
    config.POSTHOG_API_KEY = "phc_test_key";
    config.SENTRY_DSN = "https://test@sentry.io/123";
    await mod.initAnalytics();

    const err = new Error("test error");
    await mod.captureException(err);
    expect(mockSentryCapture).toHaveBeenCalledWith(err);
  });

  it("captures when sentry is initialized and request user is opted in", async () => {
    config.ANALYTICS_ENABLED = true;
    config.POSTHOG_API_KEY = "phc_test_key";
    config.SENTRY_DSN = "https://test@sentry.io/123";
    await mod.initAnalytics();

    mockAuthUser.value = { id: "user-1", analyticsEnabled: true };
    dbGetResult.value = { analyticsEnabled: true };
    const fakeRequest = { headers: {} } as Parameters<typeof mod.captureException>[1];
    const err = new Error("opted in error");
    await mod.captureException(err, fakeRequest);
    expect(mockSentryCapture).toHaveBeenCalledWith(err);
  });
});

describe("shutdownAnalytics", () => {
  it("resolves without error when no clients initialized", async () => {
    await expect(mod.shutdownAnalytics()).resolves.toBeUndefined();
  });

  it("shuts down posthog when initialized", async () => {
    config.ANALYTICS_ENABLED = true;
    config.POSTHOG_API_KEY = "phc_test_key";
    await mod.initAnalytics();
    await mod.shutdownAnalytics();
    expect(mockShutdown).toHaveBeenCalled();
  });

  it("closes sentry when initialized", async () => {
    config.ANALYTICS_ENABLED = true;
    config.POSTHOG_API_KEY = "phc_test_key";
    config.SENTRY_DSN = "https://test@sentry.io/123";
    await mod.initAnalytics();
    await mod.shutdownAnalytics();
    expect(mockSentryClose).toHaveBeenCalledWith(2000);
  });
});

describe("trackEvent", () => {
  it("does nothing when posthogClient is null", async () => {
    const fakeRequest = {} as Parameters<typeof mod.trackEvent>[0];
    await expect(
      mod.trackEvent(fakeRequest, "test_event", { key: "value" }),
    ).resolves.toBeUndefined();
  });

  it("does nothing when ANALYTICS_ENABLED is false", async () => {
    config.ANALYTICS_ENABLED = false;
    const fakeRequest = {} as Parameters<typeof mod.trackEvent>[0];
    await expect(
      mod.trackEvent(fakeRequest, "test_event", { key: "value" }),
    ).resolves.toBeUndefined();
  });

  it("does nothing when request user is not opted in", async () => {
    config.ANALYTICS_ENABLED = true;
    config.POSTHOG_API_KEY = "phc_test_key";
    await mod.initAnalytics();

    mockAuthUser.value = null;
    const fakeRequest = { headers: {} } as Parameters<typeof mod.trackEvent>[0];
    await mod.trackEvent(fakeRequest, "test_event", { key: "value" });
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("does nothing when ANALYTICS_SAMPLE_RATE is 0", async () => {
    config.ANALYTICS_ENABLED = true;
    config.POSTHOG_API_KEY = "phc_test_key";
    config.ANALYTICS_SAMPLE_RATE = 0;
    await mod.initAnalytics();

    mockAuthUser.value = { id: "user-1", analyticsEnabled: true };
    dbGetResult.value = { analyticsEnabled: true };
    const fakeRequest = { headers: {} } as Parameters<typeof mod.trackEvent>[0];
    await mod.trackEvent(fakeRequest, "test_event", { key: "value" });
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("captures event when all conditions are met", async () => {
    config.ANALYTICS_ENABLED = true;
    config.POSTHOG_API_KEY = "phc_test_key";
    config.ANALYTICS_SAMPLE_RATE = 1.0;
    await mod.initAnalytics();

    mockAuthUser.value = { id: "user-1", analyticsEnabled: true };
    dbGetResult.value = { analyticsEnabled: true };
    const fakeRequest = { headers: {} } as Parameters<typeof mod.trackEvent>[0];
    await mod.trackEvent(fakeRequest, "tool_used", { tool: "resize" });
    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: "unknown",
      event: "tool_used",
      properties: { tool: "resize" },
    });
  });

  it("uses instance ID from DB when available", async () => {
    config.ANALYTICS_ENABLED = true;
    config.POSTHOG_API_KEY = "phc_test_key";
    config.ANALYTICS_SAMPLE_RATE = 1.0;
    await mod.initAnalytics();

    dbGetResult.value = { value: "inst-abc-123", analyticsEnabled: true };
    mockAuthUser.value = { id: "user-1", analyticsEnabled: true };
    const fakeRequest = { headers: {} } as Parameters<typeof mod.trackEvent>[0];
    await mod.trackEvent(fakeRequest, "tool_used", { tool: "crop" });
    expect(mockCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: "inst-abc-123",
      }),
    );
  });

  it("allows anonymous users with x-analytics-consent header", async () => {
    config.ANALYTICS_ENABLED = true;
    config.POSTHOG_API_KEY = "phc_test_key";
    config.ANALYTICS_SAMPLE_RATE = 1.0;
    await mod.initAnalytics();

    mockAuthUser.value = { id: "anonymous" };
    const fakeRequest = {
      headers: { "x-analytics-consent": "true" },
    } as unknown as Parameters<typeof mod.trackEvent>[0];
    await mod.trackEvent(fakeRequest, "test_event", { key: "value" });
    expect(mockCapture).toHaveBeenCalled();
  });

  it("rejects anonymous users without consent header", async () => {
    config.ANALYTICS_ENABLED = true;
    config.POSTHOG_API_KEY = "phc_test_key";
    config.ANALYTICS_SAMPLE_RATE = 1.0;
    await mod.initAnalytics();

    mockAuthUser.value = { id: "anonymous" };
    const fakeRequest = {
      headers: {},
    } as unknown as Parameters<typeof mod.trackEvent>[0];
    mod.trackEvent(fakeRequest, "test_event", { key: "value" });
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("does not throw when capture throws internally", async () => {
    config.ANALYTICS_ENABLED = true;
    config.POSTHOG_API_KEY = "phc_test_key";
    config.ANALYTICS_SAMPLE_RATE = 1.0;
    await mod.initAnalytics();

    mockCapture.mockImplementationOnce(() => {
      throw new Error("capture failed");
    });

    mockAuthUser.value = { id: "user-1", analyticsEnabled: true };
    dbGetResult.value = { analyticsEnabled: true };
    const fakeRequest = { headers: {} } as Parameters<typeof mod.trackEvent>[0];
    expect(() => mod.trackEvent(fakeRequest, "test_event", { key: "value" })).not.toThrow();
  });
});
