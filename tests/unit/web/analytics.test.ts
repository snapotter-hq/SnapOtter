// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockInit = vi.fn(() => ({
  capture: mockCapture,
  identify: mockIdentify,
  startSessionRecording: mockStartSessionRecording,
  opt_in_capturing: mockOptIn,
  opt_out_capturing: mockOptOut,
  reset: mockReset,
  persistence: { disabled: false },
}));
const mockCapture = vi.fn();
const mockIdentify = vi.fn();
const mockStartSessionRecording = vi.fn();
const mockOptIn = vi.fn();
const mockOptOut = vi.fn();
const mockReset = vi.fn();

vi.mock("posthog-js", () => ({
  __esModule: true,
  default: { init: mockInit },
}));

const mockSentryInit = vi.fn();
vi.mock("@sentry/react", () => ({
  init: mockSentryInit,
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

import {
  identify,
  initAnalytics,
  setAnalyticsConsent,
  shutdownAnalytics,
  startErrorReplay,
  track,
} from "@/lib/analytics";

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
  posthogApiKey: "key",
  posthogHost: "https://ph.test",
  sentryDsn: "",
  sampleRate: 1,
  instanceId: "inst-1",
};

describe("analytics lib", () => {
  beforeEach(() => {
    shutdownAnalytics();
    mockInit.mockClear();
    mockCapture.mockClear();
    mockIdentify.mockClear();
    mockStartSessionRecording.mockClear();
    mockOptIn.mockClear();
    mockOptOut.mockClear();
    mockReset.mockClear();
    mockSentryInit.mockClear();
  });

  describe("initAnalytics", () => {
    it("skips initialization when config.enabled is false", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(disabledConfig);
      expect(mockInit).not.toHaveBeenCalled();
    });

    it("skips posthog.init when consent is not granted", async () => {
      await initAnalytics(enabledConfig);
      expect(mockInit).not.toHaveBeenCalled();
    });

    it("calls posthog.init when config.enabled and consent are both true", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      expect(mockInit).toHaveBeenCalledOnce();
      expect(mockInit).toHaveBeenCalledWith(
        "phc_test",
        expect.objectContaining({
          api_host: "https://ph.test",
          autocapture: false,
          ip: false,
        }),
      );
    });

    it("initializes Sentry when sentryDsn is provided and consent is granted", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      expect(mockSentryInit).toHaveBeenCalledOnce();
      expect(mockSentryInit).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: "https://sentry.test/123",
          sendDefaultPii: false,
        }),
      );
    });

    it("skips Sentry when sentryDsn is empty", async () => {
      setAnalyticsConsent(true);
      await initAnalytics({ ...enabledConfig, sentryDsn: "" });
      expect(mockSentryInit).not.toHaveBeenCalled();
    });

    it("does not double-initialize on repeated calls", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      await initAnalytics(enabledConfig);
      expect(mockInit).toHaveBeenCalledOnce();
    });

    it("retries initialization if first attempt throws", async () => {
      setAnalyticsConsent(true);
      mockInit.mockImplementationOnce(() => {
        throw new Error("init failed");
      });
      await initAnalytics(enabledConfig);
      expect(mockInit).toHaveBeenCalledOnce();

      mockInit.mockClear();
      mockInit.mockReturnValueOnce({
        capture: mockCapture,
        identify: mockIdentify,
        startSessionRecording: mockStartSessionRecording,
        opt_in_capturing: mockOptIn,
        opt_out_capturing: mockOptOut,
        reset: mockReset,
        persistence: { disabled: false },
      });
      await initAnalytics(enabledConfig);
      expect(mockInit).toHaveBeenCalledOnce();
    });

    it("bails out if consent is revoked during async import", async () => {
      setAnalyticsConsent(true);
      const initPromise = initAnalytics(enabledConfig);
      setAnalyticsConsent(false);
      await initPromise;
      // shutdownAnalytics was called by setAnalyticsConsent(false),
      // and the init should have bailed after the import resolved
      // because consentGranted was false at that point.
      // mockInit may or may not have been called depending on timing,
      // but the SDK should not be active after shutdown.
      // Verify track does not forward to posthog:
      track("test_event");
      expect(mockCapture).not.toHaveBeenCalled();
    });
  });

  describe("shutdownAnalytics", () => {
    it("calls opt_out_capturing and reset on the posthog instance", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      shutdownAnalytics();
      expect(mockOptOut).toHaveBeenCalledOnce();
      expect(mockReset).toHaveBeenCalledOnce();
    });

    it("is safe to call when not initialized", () => {
      expect(() => shutdownAnalytics()).not.toThrow();
    });

    it("is safe to call multiple times", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      shutdownAnalytics();
      expect(() => shutdownAnalytics()).not.toThrow();
      // opt_out and reset only called once (first shutdown had a posthog instance)
      expect(mockOptOut).toHaveBeenCalledOnce();
      expect(mockReset).toHaveBeenCalledOnce();
    });

    it("allows re-initialization after shutdown", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      expect(mockInit).toHaveBeenCalledOnce();

      shutdownAnalytics();
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      expect(mockInit).toHaveBeenCalledTimes(2);
    });

    it("swallows exceptions from posthog.opt_out_capturing", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      mockOptOut.mockImplementationOnce(() => {
        throw new Error("opt_out boom");
      });
      expect(() => shutdownAnalytics()).not.toThrow();
    });

    it("swallows exceptions from posthog.reset", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      mockReset.mockImplementationOnce(() => {
        throw new Error("reset boom");
      });
      expect(() => shutdownAnalytics()).not.toThrow();
    });
  });

  describe("setAnalyticsConsent", () => {
    it("does not throw when setting consent to true", () => {
      expect(() => setAnalyticsConsent(true)).not.toThrow();
    });

    it("does not throw when setting consent to false", () => {
      expect(() => setAnalyticsConsent(false)).not.toThrow();
    });

    it("can be toggled multiple times", () => {
      expect(() => {
        setAnalyticsConsent(true);
        setAnalyticsConsent(false);
        setAnalyticsConsent(true);
      }).not.toThrow();
    });

    it("triggers shutdown when set to false after init", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      setAnalyticsConsent(false);
      expect(mockOptOut).toHaveBeenCalledOnce();
      expect(mockReset).toHaveBeenCalledOnce();
    });

    it("does not trigger shutdown when set to true", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      mockOptOut.mockClear();
      mockReset.mockClear();
      setAnalyticsConsent(true);
      expect(mockOptOut).not.toHaveBeenCalled();
      expect(mockReset).not.toHaveBeenCalled();
    });
  });

  describe("track", () => {
    it("does not call capture without consent", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      mockCapture.mockClear();
      setAnalyticsConsent(false);
      // Re-init to have a posthog instance for the next consent grant
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      setAnalyticsConsent(false);
      track("blocked_event");
      expect(mockCapture).not.toHaveBeenCalled();
    });

    it("calls capture with consent", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      track("tool_used", { tool: "resize" });
      expect(mockCapture).toHaveBeenCalledWith("tool_used", { tool: "resize" });
    });

    it("works without properties", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      track("simple_event");
      expect(mockCapture).toHaveBeenCalledWith("simple_event", undefined);
    });

    it("does not throw before initialization", () => {
      setAnalyticsConsent(true);
      expect(() => track("pre_init_event")).not.toThrow();
    });

    it("swallows exceptions from posthog.capture", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      mockCapture.mockImplementationOnce(() => {
        throw new Error("capture boom");
      });
      expect(() => track("should_not_throw")).not.toThrow();
    });
  });

  describe("identify", () => {
    it("does not call posthog.identify without consent", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      setAnalyticsConsent(false);
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      setAnalyticsConsent(false);
      mockIdentify.mockClear();
      identify("blocked-id", {});
      expect(mockIdentify).not.toHaveBeenCalled();
    });

    it("calls posthog.identify with consent", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      identify("inst-1", { version: "1.0" });
      expect(mockIdentify).toHaveBeenCalledWith("inst-1", { version: "1.0" });
    });

    it("does not throw before initialization", () => {
      setAnalyticsConsent(true);
      expect(() => identify("inst-1", {})).not.toThrow();
    });

    it("swallows exceptions from posthog.identify", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      mockIdentify.mockImplementationOnce(() => {
        throw new Error("identify boom");
      });
      expect(() => identify("inst-x", { foo: "bar" })).not.toThrow();
    });
  });

  describe("startErrorReplay", () => {
    it("does not call startSessionRecording without consent", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      setAnalyticsConsent(false);
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      setAnalyticsConsent(false);
      mockStartSessionRecording.mockClear();
      startErrorReplay();
      expect(mockStartSessionRecording).not.toHaveBeenCalled();
    });

    it("calls startSessionRecording with consent", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      startErrorReplay();
      expect(mockStartSessionRecording).toHaveBeenCalledOnce();
    });

    it("does not throw before initialization", () => {
      setAnalyticsConsent(true);
      expect(() => startErrorReplay()).not.toThrow();
    });

    it("swallows exceptions from posthog.startSessionRecording", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      mockStartSessionRecording.mockImplementationOnce(() => {
        throw new Error("replay boom");
      });
      expect(() => startErrorReplay()).not.toThrow();
    });
  });

  describe("full consent lifecycle", () => {
    it("accept -> use -> revoke -> silent -> re-accept -> use", async () => {
      // Phase 1: Accept and use analytics
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      expect(mockInit).toHaveBeenCalledOnce();

      track("phase1_event");
      expect(mockCapture).toHaveBeenCalledWith("phase1_event", undefined);
      identify("inst-1", { phase: 1 });
      expect(mockIdentify).toHaveBeenCalledWith("inst-1", { phase: 1 });

      // Phase 2: Revoke consent mid-session
      setAnalyticsConsent(false);
      expect(mockOptOut).toHaveBeenCalledOnce();
      expect(mockReset).toHaveBeenCalledOnce();

      mockCapture.mockClear();
      mockIdentify.mockClear();
      track("phase2_blocked");
      identify("inst-1", { phase: 2 });
      expect(mockCapture).not.toHaveBeenCalled();
      expect(mockIdentify).not.toHaveBeenCalled();

      // Phase 3: Re-accept consent
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      expect(mockInit).toHaveBeenCalledTimes(2);

      track("phase3_event");
      expect(mockCapture).toHaveBeenCalledWith("phase3_event", undefined);
    });

    it("server disabled overrides user consent", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(disabledConfig);
      expect(mockInit).not.toHaveBeenCalled();

      track("should_not_fire");
      expect(mockCapture).not.toHaveBeenCalled();
    });

    it("rapid consent toggles do not corrupt state", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);

      setAnalyticsConsent(false);
      setAnalyticsConsent(true);
      setAnalyticsConsent(false);
      setAnalyticsConsent(true);

      // After rapid toggles ending on true, SDK was shut down multiple times.
      // Re-init should work cleanly.
      await initAnalytics(enabledConfig);
      track("after_rapid_toggle");
      expect(mockCapture).toHaveBeenCalledWith("after_rapid_toggle", undefined);
    });
  });

  describe("Sentry beforeSend callback", () => {
    async function getBeforeSend() {
      shutdownAnalytics();
      mockSentryInit.mockClear();
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      const sentryCall = mockSentryInit.mock.calls.find((call: unknown[]) => call[0]?.beforeSend);
      return sentryCall ? sentryCall[0].beforeSend : null;
    }

    it("scrubs file extensions from exception values", async () => {
      const beforeSend = await getBeforeSend();
      if (!beforeSend) return;

      const event = {
        user: { email: "test@example.com", username: "user1" },
        exception: {
          values: [
            {
              value: "Failed to load /tmp/workspace/image.jpg",
              stacktrace: {
                frames: [
                  {
                    filename: "/Users/test/project/file.png",
                    abs_path: "/home/user/data/files/photo.jpeg",
                  },
                ],
              },
            },
          ],
        },
      };

      const result = beforeSend(event);
      expect(result.user.email).toBeUndefined();
      expect(result.user.username).toBeUndefined();
      expect(result.exception.values[0].value).toContain("[REDACTED]");
      expect(result.exception.values[0].stacktrace.frames[0].filename).toContain("[REDACTED]");
      expect(result.exception.values[0].stacktrace.frames[0].abs_path).toContain("[REDACTED]");
    });

    it("returns null when consent is not granted", async () => {
      const beforeSend = await getBeforeSend();
      if (!beforeSend) return;

      setAnalyticsConsent(false);
      const result = beforeSend({ exception: { values: [] } });
      expect(result).toBeNull();
    });

    it("handles event without user or exception fields", async () => {
      const beforeSend = await getBeforeSend();
      if (!beforeSend) return;

      const result = beforeSend({});
      expect(result).toBeDefined();
    });

    it("handles exception values without stacktrace", async () => {
      const beforeSend = await getBeforeSend();
      if (!beforeSend) return;

      const event = {
        exception: { values: [{ value: "plain error" }] },
      };
      const result = beforeSend(event);
      expect(result).toBeDefined();
      expect(result.exception.values[0].value).toBe("plain error");
    });
  });

  describe("Sentry beforeBreadcrumb callback", () => {
    async function getBeforeBreadcrumb() {
      shutdownAnalytics();
      mockSentryInit.mockClear();
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      const sentryCall = mockSentryInit.mock.calls.find(
        (call: unknown[]) => call[0]?.beforeBreadcrumb,
      );
      return sentryCall ? sentryCall[0].beforeBreadcrumb : null;
    }

    it("returns null for ui.click breadcrumbs", async () => {
      const beforeBreadcrumb = await getBeforeBreadcrumb();
      if (!beforeBreadcrumb) return;

      const result = beforeBreadcrumb({ category: "ui.click" });
      expect(result).toBeNull();
    });

    it("returns null for fetch breadcrumbs with file extension URLs", async () => {
      const beforeBreadcrumb = await getBeforeBreadcrumb();
      if (!beforeBreadcrumb) return;

      const result = beforeBreadcrumb({
        category: "fetch",
        data: { url: "https://example.com/uploads/photo.png" },
      });
      expect(result).toBeNull();
    });

    it("scrubs messages containing file paths", async () => {
      const beforeBreadcrumb = await getBeforeBreadcrumb();
      if (!beforeBreadcrumb) return;

      const breadcrumb = {
        category: "console",
        message: "Error loading /tmp/workspace/file.jpg",
      };
      const result = beforeBreadcrumb(breadcrumb);
      expect(result).not.toBeNull();
      expect(result.message).toContain("[REDACTED]");
    });

    it("returns null when consent is not granted", async () => {
      const beforeBreadcrumb = await getBeforeBreadcrumb();
      if (!beforeBreadcrumb) return;

      setAnalyticsConsent(false);
      const result = beforeBreadcrumb({ category: "console", message: "test" });
      expect(result).toBeNull();
    });

    it("passes through fetch breadcrumbs without file extension URLs", async () => {
      const beforeBreadcrumb = await getBeforeBreadcrumb();
      if (!beforeBreadcrumb) return;

      const breadcrumb = {
        category: "fetch",
        data: { url: "https://example.com/api/v1/health" },
      };
      const result = beforeBreadcrumb(breadcrumb);
      expect(result).not.toBeNull();
    });

    it("passes through breadcrumbs without message field", async () => {
      const beforeBreadcrumb = await getBeforeBreadcrumb();
      if (!beforeBreadcrumb) return;

      const breadcrumb = { category: "navigation" };
      const result = beforeBreadcrumb(breadcrumb);
      expect(result).not.toBeNull();
    });
  });
});
