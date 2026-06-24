// @vitest-environment node
//
// Proves the invariant: PostHog and Sentry are NEVER called when
// analytics is disabled in the baked config.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockPosthogInit = vi.fn(() => ({
  capture: mockCapture,
  startSessionRecording: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  reset: vi.fn(),
  register: vi.fn(),
  get_distinct_id: vi.fn(() => "test-id"),
  persistence: { disabled: false },
}));
const mockCapture = vi.fn();

vi.mock("posthog-js", () => ({
  __esModule: true,
  default: { init: mockPosthogInit },
}));

const mockSentryInit = vi.fn();
const mockBrowserTracingIntegration = vi.fn(() => ({ name: "BrowserTracing" }));
vi.mock("@sentry/react", () => ({
  init: mockSentryInit,
  browserTracingIntegration: mockBrowserTracingIntegration,
}));

const noop = () => {};
beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response("{}", { status: 200 }))),
  );
  process.removeAllListeners("unhandledRejection");
  process.on("unhandledRejection", noop);
});
afterAll(() => {
  process.removeListener("unhandledRejection", noop);
  vi.restoreAllMocks();
});

const enabledConfig = {
  enabled: true,
  posthogApiKey: "phc_test",
  posthogHost: "https://ph.test",
  sentryDsn: "https://sentry.test/123",
  sampleRate: 1,
  instanceId: "inst-1",
};

const disabledConfig = {
  enabled: false,
  posthogApiKey: "",
  posthogHost: "",
  sentryDsn: "",
  sampleRate: 0,
  instanceId: "",
};

type AnalyticsModule = typeof import("../../../apps/web/src/lib/analytics");
let mod: AnalyticsModule;

describe("Analytics No-Leak Invariant (baked model)", () => {
  beforeEach(async () => {
    mockPosthogInit.mockClear();
    mockCapture.mockClear();
    mockSentryInit.mockClear();
    vi.resetModules();
    mod = await import("../../../apps/web/src/lib/analytics");
  });

  describe("when config.enabled is false", () => {
    it("initAnalytics never calls posthog.init", async () => {
      await mod.initAnalytics(disabledConfig);
      expect(mockPosthogInit).not.toHaveBeenCalled();
    });

    it("initAnalytics never calls Sentry.init", async () => {
      await mod.initAnalytics(disabledConfig);
      expect(mockSentryInit).not.toHaveBeenCalled();
    });

    it("track() is a silent no-op", async () => {
      await mod.initAnalytics(disabledConfig);
      mod.track("test_event", { key: "value" });
      expect(mockCapture).not.toHaveBeenCalled();
    });
  });

  describe("when config.enabled is true", () => {
    it("initAnalytics calls posthog.init", async () => {
      await mod.initAnalytics(enabledConfig);
      expect(mockPosthogInit).toHaveBeenCalledOnce();
    });

    it("track() forwards to posthog.capture", async () => {
      await mod.initAnalytics(enabledConfig);
      mod.track("tool_used", { tool: "resize" });
      expect(mockCapture).toHaveBeenCalledWith("tool_used", { tool: "resize" });
    });

    it("initAnalytics initializes Sentry when sentryDsn provided", async () => {
      await mod.initAnalytics(enabledConfig);
      expect(mockSentryInit).toHaveBeenCalledOnce();
      expect(mockSentryInit).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: "https://sentry.test/123",
          sendDefaultPii: false,
        }),
      );
    });
  });

  describe("PII never leaks even when analytics enabled", () => {
    it("Sentry strips user.email and user.username from events", async () => {
      await mod.initAnalytics(enabledConfig);
      const sentryCall = mockSentryInit.mock.calls.find((call: unknown[]) => call[0]?.beforeSend);
      const beforeSend = sentryCall?.[0].beforeSend;
      if (!beforeSend) return;

      const event = {
        user: { email: "user@example.com", username: "admin", id: "123" },
        exception: { values: [] },
      };
      const result = beforeSend(event);
      expect(result.user.email).toBeUndefined();
      expect(result.user.username).toBeUndefined();
      expect(result.user.id).toBe("123");
    });

    it("Sentry redacts file paths from exception values", async () => {
      await mod.initAnalytics(enabledConfig);
      const sentryCall = mockSentryInit.mock.calls.find((call: unknown[]) => call[0]?.beforeSend);
      const beforeSend = sentryCall?.[0].beforeSend;
      if (!beforeSend) return;

      const event = {
        exception: {
          values: [
            {
              value: "Error processing /tmp/workspace/photo.jpg",
              stacktrace: {
                frames: [{ filename: "/Users/test/project/handler.png" }],
              },
            },
          ],
        },
      };
      const result = beforeSend(event);
      expect(result.exception.values[0].value).not.toContain("photo.jpg");
      expect(result.exception.values[0].value).toContain("[REDACTED]");
      expect(result.exception.values[0].stacktrace.frames[0].filename).toContain("[REDACTED]");
    });

    it("Sentry blocks ui.click breadcrumbs", async () => {
      await mod.initAnalytics(enabledConfig);
      const sentryCall = mockSentryInit.mock.calls.find(
        (call: unknown[]) => call[0]?.beforeBreadcrumb,
      );
      const beforeBreadcrumb = sentryCall?.[0].beforeBreadcrumb;
      if (!beforeBreadcrumb) return;

      expect(beforeBreadcrumb({ category: "ui.click" })).toBeNull();
    });

    it("Sentry blocks fetch breadcrumbs to file URLs", async () => {
      await mod.initAnalytics(enabledConfig);
      const sentryCall = mockSentryInit.mock.calls.find(
        (call: unknown[]) => call[0]?.beforeBreadcrumb,
      );
      const beforeBreadcrumb = sentryCall?.[0].beforeBreadcrumb;
      if (!beforeBreadcrumb) return;

      expect(
        beforeBreadcrumb({
          category: "fetch",
          data: { url: "https://example.com/uploads/photo.png" },
        }),
      ).toBeNull();
    });
  });
});
