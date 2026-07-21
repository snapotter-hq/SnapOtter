import { beforeEach, describe, expect, it, vi } from "vitest";

const bakedConfig = vi.hoisted(() => ({
  enabled: false,
  posthogApiKey: "",
  posthogHost: "",
  sentryDsn: "",
  sentryDsnWeb: "",
  posthogSampleRate: 1.0,
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
// The captureException shim routes through reportError, which captures
// inside Sentry.withScope; the mock must invoke the callback.
const mockSentryWithScope = vi.hoisted(() =>
  vi.fn((cb: (scope: unknown) => unknown) =>
    cb({ setTag: () => {}, setLevel: () => {}, setFingerprint: () => {} }),
  ),
);

vi.mock("@snapotter/shared", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return {
    ...actual,
    ANALYTICS_BAKED: bakedConfig,
  };
});

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([]),
      }),
    }),
  },
  pool: {},
  closeDb: async () => {},
  schema: {
    settings: { key: "key" },
  },
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
  withScope: mockSentryWithScope,
}));

type AnalyticsModule = typeof import("../../../apps/api/src/lib/analytics.js");
let mod: AnalyticsModule;

beforeEach(async () => {
  bakedConfig.enabled = false;
  bakedConfig.posthogApiKey = "";
  bakedConfig.posthogHost = "";
  bakedConfig.sentryDsn = "";
  bakedConfig.sentryDsnWeb = "";
  bakedConfig.posthogSampleRate = 1.0;

  mockCapture.mockClear();
  mockShutdown.mockClear();
  MockPostHog.mockClear();
  mockSentryCapture.mockClear();
  mockSentryClose.mockClear();
  mockSentryInit.mockClear();
  mockSentryWithScope.mockClear();

  vi.resetModules();
  mod = await import("../../../apps/api/src/lib/analytics.js");
});

describe("initAnalytics", () => {
  it("does nothing when ANALYTICS_BAKED.enabled is false", async () => {
    bakedConfig.enabled = false;
    await expect(mod.initAnalytics()).resolves.toBeUndefined();
    expect(MockPostHog).not.toHaveBeenCalled();
  });

  it("does nothing when enabled is true but posthogApiKey is empty", async () => {
    bakedConfig.enabled = true;
    bakedConfig.posthogApiKey = "";
    await expect(mod.initAnalytics()).resolves.toBeUndefined();
    expect(MockPostHog).not.toHaveBeenCalled();
  });

  it("initializes posthog when enabled with API key", async () => {
    bakedConfig.enabled = true;
    bakedConfig.posthogApiKey = "phc_test_key";
    bakedConfig.posthogHost = "https://test.posthog.com";
    await mod.initAnalytics();

    expect(MockPostHog).toHaveBeenCalledWith("phc_test_key", {
      host: "https://test.posthog.com",
      flushAt: 20,
      flushInterval: 30000,
    });
  });

  it("does not initialize sentry (moved to preload)", async () => {
    bakedConfig.enabled = true;
    bakedConfig.posthogApiKey = "phc_test_key";
    bakedConfig.sentryDsn = "https://test@sentry.io/123";
    await mod.initAnalytics();
    expect(mockSentryInit).not.toHaveBeenCalled();
  });
});

describe("captureException", () => {
  it("does nothing when sentryModule is null", async () => {
    await expect(mod.captureException(new Error("test"))).resolves.toBeUndefined();
  });

  it("captures when sentry is initialized", async () => {
    bakedConfig.enabled = true;
    bakedConfig.posthogApiKey = "phc_test_key";
    bakedConfig.sentryDsn = "https://test@sentry.io/123";
    await mod.initAnalytics();

    const err = new Error("test error");
    await mod.captureException(err);
    expect(mockSentryCapture).toHaveBeenCalledWith(err);
  });
});

describe("shutdownAnalytics", () => {
  it("resolves without error when no clients initialized", async () => {
    await expect(mod.shutdownAnalytics()).resolves.toBeUndefined();
  });

  it("shuts down posthog when initialized", async () => {
    bakedConfig.enabled = true;
    bakedConfig.posthogApiKey = "phc_test_key";
    await mod.initAnalytics();
    await mod.shutdownAnalytics();
    expect(mockShutdown).toHaveBeenCalled();
  });

  it("does not close sentry (moved to preload)", async () => {
    bakedConfig.enabled = true;
    bakedConfig.posthogApiKey = "phc_test_key";
    bakedConfig.sentryDsn = "https://test@sentry.io/123";
    await mod.initAnalytics();
    await mod.shutdownAnalytics();
    expect(mockSentryClose).not.toHaveBeenCalled();
  });
});

describe("trackEvent", () => {
  it("does nothing when posthogClient is null", async () => {
    await expect(mod.trackEvent("test_event", { key: "value" })).resolves.toBeUndefined();
  });

  it("does nothing when ANALYTICS_BAKED.enabled is false", async () => {
    bakedConfig.enabled = false;
    await expect(mod.trackEvent("test_event", { key: "value" })).resolves.toBeUndefined();
  });

  it("does nothing when posthogSampleRate is 0", async () => {
    bakedConfig.enabled = true;
    bakedConfig.posthogApiKey = "phc_test_key";
    bakedConfig.posthogSampleRate = 0;
    await mod.initAnalytics();

    await mod.trackEvent("test_event", { key: "value" });
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("captures despite sampleRate 0 when ignoreSampleRate is set (once-per-boot census)", async () => {
    bakedConfig.enabled = true;
    bakedConfig.posthogApiKey = "phc_test_key";
    bakedConfig.posthogSampleRate = 0;
    await mod.initAnalytics();

    await mod.trackEvent("instance_started", { arch: "arm64" }, "did-boot", {
      ignoreSampleRate: true,
    });
    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: "did-boot",
      event: "instance_started",
      properties: { arch: "arm64" },
    });
  });

  it("captures event with only allow-listed properties when enabled", async () => {
    bakedConfig.enabled = true;
    bakedConfig.posthogApiKey = "phc_test_key";
    bakedConfig.posthogSampleRate = 1.0;
    await mod.initAnalytics();

    await mod.trackEvent("tool_used", {
      tool_id: "resize",
      status: "completed",
      error_message: "secret detail",
    });
    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: "unknown",
      event: "tool_used",
      // error_message is free-text and never allow-listed.
      properties: { tool_id: "resize", status: "completed" },
    });
  });

  it("uses provided distinctId when given", async () => {
    bakedConfig.enabled = true;
    bakedConfig.posthogApiKey = "phc_test_key";
    bakedConfig.posthogSampleRate = 1.0;
    await mod.initAnalytics();

    await mod.trackEvent("tool_used", { tool: "crop" }, "custom-id-123");
    expect(mockCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: "custom-id-123",
      }),
    );
  });

  it("does not throw when capture throws internally", async () => {
    bakedConfig.enabled = true;
    bakedConfig.posthogApiKey = "phc_test_key";
    bakedConfig.posthogSampleRate = 1.0;
    await mod.initAnalytics();

    mockCapture.mockImplementationOnce(() => {
      throw new Error("capture failed");
    });

    await expect(mod.trackEvent("test_event", { key: "value" })).resolves.toBeUndefined();
  });
});

describe("captureFeedback", () => {
  it("captures feedback_submitted with explicit feedback properties", async () => {
    bakedConfig.enabled = true;
    bakedConfig.posthogApiKey = "phc_test_key";
    await mod.initAnalytics();

    await mod.captureFeedback(
      {
        source: "admin_installer",
        survey_id: "admin-install-v1",
        prompt_variant: "settings-card-v1",
        sentiment: "issue",
        feedback_type: "bug",
        message: "Docs need a complete S3 example.",
        contact_ok: true,
        contact_email: "admin@example.com",
        contact_name: "Pat",
        company: "Example Co",
        install_method: "docker_compose",
        usage_type: "team_internal",
        friction_area: "environment_variables",
        important_areas: ["pdf_docs", "batch_workflows"],
        error_category: "processing_error",
      },
      "distinct-feedback",
    );

    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: "distinct-feedback",
      event: "feedback_submitted",
      properties: expect.objectContaining({
        feedback_version: 1,
        source: "admin_installer",
        survey_id: "admin-install-v1",
        prompt_variant: "settings-card-v1",
        contact_ok: true,
        contact_email: "admin@example.com",
        install_method: "docker_compose",
        usage_type: "team_internal",
        friction_area: "environment_variables",
        important_areas: ["pdf_docs", "batch_workflows"],
        error_category: "processing_error",
      }),
    });
  });

  it("routes an onboarding survey to its own event, not feedback_submitted", async () => {
    bakedConfig.enabled = true;
    bakedConfig.posthogApiKey = "phc_test_key";
    await mod.initAnalytics();

    await mod.captureFeedback(
      {
        source: "onboarding",
        survey_id: "onboarding-usage-v1",
        contact_ok: false,
        usage_type: "personal",
        prior_tool: "command_line",
        selfhost_motivation: "privacy_control",
        discovery_source: "github",
      },
      "distinct-onboarding",
    );

    expect(mockCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: "distinct-onboarding",
        event: "onboarding_survey_submitted",
        properties: expect.objectContaining({
          usage_type: "personal",
          prior_tool: "command_line",
          selfhost_motivation: "privacy_control",
          discovery_source: "github",
        }),
      }),
    );
  });

  it("keeps genuine feedback sources on the feedback_submitted event", async () => {
    bakedConfig.enabled = true;
    bakedConfig.posthogApiKey = "phc_test_key";
    await mod.initAnalytics();

    await mod.captureFeedback({ source: "global", contact_ok: false, message: "A message" });

    expect(mockCapture).toHaveBeenCalledWith(
      expect.objectContaining({ event: "feedback_submitted" }),
    );
  });

  it("drops an empty important_areas array instead of forwarding it", async () => {
    bakedConfig.enabled = true;
    bakedConfig.posthogApiKey = "phc_test_key";
    await mod.initAnalytics();

    await mod.captureFeedback(
      {
        source: "onboarding",
        survey_id: "onboarding-usage-v1",
        prompt_variant: "onboarding-overlay-v1",
        contact_ok: false,
        usage_type: "personal",
        important_areas: [],
      },
      "distinct-empty-areas",
    );

    const properties = mockCapture.mock.calls.at(-1)?.[0].properties;
    expect(properties).not.toHaveProperty("important_areas");
  });

  it("forwards search_query for a search_miss request", async () => {
    bakedConfig.enabled = true;
    bakedConfig.posthogApiKey = "phc_test_key";
    await mod.initAnalytics();

    await mod.captureFeedback(
      {
        source: "search_miss",
        survey_id: "search-miss-v1",
        prompt_variant: "search-empty-v1",
        feedback_type: "feature_request",
        search_query: "convert to dicom",
        contact_ok: false,
      },
      "distinct-search-miss",
    );

    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: "distinct-search-miss",
      event: "feedback_submitted",
      properties: expect.objectContaining({
        source: "search_miss",
        survey_id: "search-miss-v1",
        prompt_variant: "search-empty-v1",
        feedback_type: "feature_request",
        search_query: "convert to dicom",
      }),
    });
  });

  it("does nothing when analytics is disabled", async () => {
    bakedConfig.enabled = false;

    await mod.captureFeedback({
      source: "global",
      contact_ok: false,
      message: "A message",
    });

    expect(mockCapture).not.toHaveBeenCalled();
  });
});
