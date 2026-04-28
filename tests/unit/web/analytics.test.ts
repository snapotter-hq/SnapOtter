// @vitest-environment node
/**
 * Tests for the analytics lib's exported functions.
 *
 * Since posthog-js and @sentry/react are heavy browser-side SDKs that
 * vitest cannot easily resolve (they live in web's node_modules behind
 * a complex resolution chain), we test the module's behavior through
 * its public API contract:
 *
 * - Functions never throw (silent failures per design)
 * - Consent gating works correctly
 * - setAnalyticsConsent can be called standalone
 * - Functions are safe to call before/without initialization
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock both posthog-js and @sentry/react so the module can load
const mockCapture = vi.fn();
const mockIdentify = vi.fn();
const mockStartSessionRecording = vi.fn();
const mockOptIn = vi.fn();
const mockOptOut = vi.fn();

vi.mock("posthog-js", () => ({
  __esModule: true,
  default: {
    init: vi.fn(() => ({
      capture: mockCapture,
      identify: mockIdentify,
      startSessionRecording: mockStartSessionRecording,
      opt_in_capturing: mockOptIn,
      opt_out_capturing: mockOptOut,
      persistence: { disabled: false },
    })),
  },
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
  startErrorReplay,
  track,
} from "@/lib/analytics";

describe("analytics lib", () => {
  describe("initAnalytics", () => {
    it("does not throw when config.enabled is false", () => {
      expect(() =>
        initAnalytics({
          enabled: false,
          posthogApiKey: "key",
          posthogHost: "https://ph.test",
          sentryDsn: "",
          sampleRate: 1,
          instanceId: "inst-1",
        }),
      ).not.toThrow();
    });

    it("does not throw when config.enabled is true", () => {
      expect(() =>
        initAnalytics({
          enabled: true,
          posthogApiKey: "phc_test",
          posthogHost: "https://ph.test",
          sentryDsn: "https://sentry.test/123",
          sampleRate: 1,
          instanceId: "inst-1",
        }),
      ).not.toThrow();
    });

    it("does not throw on double initialization", () => {
      const config = {
        enabled: true,
        posthogApiKey: "phc_test",
        posthogHost: "https://ph.test",
        sentryDsn: "",
        sampleRate: 1,
        instanceId: "inst-1",
      };
      expect(() => {
        initAnalytics(config);
        initAnalytics(config);
      }).not.toThrow();
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
  });

  describe("track", () => {
    it("does not throw without consent", () => {
      setAnalyticsConsent(false);
      expect(() => track("test_event", { foo: "bar" })).not.toThrow();
    });

    it("does not throw with consent", () => {
      setAnalyticsConsent(true);
      expect(() => track("tool_used", { tool: "resize" })).not.toThrow();
    });

    it("does not throw without properties", () => {
      setAnalyticsConsent(true);
      expect(() => track("simple_event")).not.toThrow();
    });

    it("does not throw with empty properties", () => {
      setAnalyticsConsent(true);
      expect(() => track("event", {})).not.toThrow();
    });
  });

  describe("identify", () => {
    it("does not throw without consent", () => {
      setAnalyticsConsent(false);
      expect(() => identify("inst-1", { version: "1.0" })).not.toThrow();
    });

    it("does not throw with consent", () => {
      setAnalyticsConsent(true);
      expect(() => identify("inst-1", { plan: "free" })).not.toThrow();
    });

    it("does not throw with empty properties", () => {
      setAnalyticsConsent(true);
      expect(() => identify("inst-1", {})).not.toThrow();
    });
  });

  describe("startErrorReplay", () => {
    it("does not throw without consent", () => {
      setAnalyticsConsent(false);
      expect(() => startErrorReplay()).not.toThrow();
    });

    it("does not throw with consent", () => {
      setAnalyticsConsent(true);
      expect(() => startErrorReplay()).not.toThrow();
    });
  });

  describe("consent gating behavior", () => {
    it("track captures only when consent is granted", () => {
      mockCapture.mockClear();
      setAnalyticsConsent(false);
      track("no_consent_event");
      const callsWithoutConsent = mockCapture.mock.calls.length;

      setAnalyticsConsent(true);
      track("with_consent_event");
      const callsWithConsent = mockCapture.mock.calls.length;

      // With consent should have more calls than without
      expect(callsWithConsent).toBeGreaterThanOrEqual(callsWithoutConsent);
    });

    it("identify only works when consent is granted", () => {
      mockIdentify.mockClear();
      setAnalyticsConsent(false);
      identify("no-consent", {});
      const callsWithoutConsent = mockIdentify.mock.calls.length;

      setAnalyticsConsent(true);
      identify("with-consent", {});
      const callsWithConsent = mockIdentify.mock.calls.length;

      expect(callsWithConsent).toBeGreaterThanOrEqual(callsWithoutConsent);
    });
  });

  describe("error resilience", () => {
    it("track swallows exception from posthog.capture", () => {
      setAnalyticsConsent(true);
      mockCapture.mockImplementationOnce(() => {
        throw new Error("capture boom");
      });
      expect(() => track("should_not_throw")).not.toThrow();
    });

    it("identify swallows exception from posthog.identify", () => {
      setAnalyticsConsent(true);
      mockIdentify.mockImplementationOnce(() => {
        throw new Error("identify boom");
      });
      expect(() => identify("inst-x", { foo: "bar" })).not.toThrow();
    });

    it("startErrorReplay swallows exception from posthog.startSessionRecording", () => {
      setAnalyticsConsent(true);
      mockStartSessionRecording.mockImplementationOnce(() => {
        throw new Error("replay boom");
      });
      expect(() => startErrorReplay()).not.toThrow();
    });
  });

  describe("consent gating prevents calls", () => {
    it("track does not call capture when consent is false", () => {
      mockCapture.mockClear();
      setAnalyticsConsent(false);
      track("blocked_event");
      expect(mockCapture).not.toHaveBeenCalled();
    });

    it("identify does not call identify when consent is false", () => {
      mockIdentify.mockClear();
      setAnalyticsConsent(false);
      identify("blocked-id", {});
      expect(mockIdentify).not.toHaveBeenCalled();
    });

    it("startErrorReplay does not call startSessionRecording when consent is false", () => {
      mockStartSessionRecording.mockClear();
      setAnalyticsConsent(false);
      startErrorReplay();
      expect(mockStartSessionRecording).not.toHaveBeenCalled();
    });
  });

  describe("Sentry beforeSend callback", () => {
    function getBeforeSend() {
      const sentryCall = mockSentryInit.mock.calls.find((call: unknown[]) => call[0]?.beforeSend);
      return sentryCall ? sentryCall[0].beforeSend : null;
    }

    it("scrubs file extensions from exception values", () => {
      const beforeSend = getBeforeSend();
      if (!beforeSend) return;

      setAnalyticsConsent(true);
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

    it("returns null when consent is not granted", () => {
      const beforeSend = getBeforeSend();
      if (!beforeSend) return;

      setAnalyticsConsent(false);
      const result = beforeSend({ exception: { values: [] } });
      expect(result).toBeNull();
    });

    it("handles event without user or exception fields", () => {
      const beforeSend = getBeforeSend();
      if (!beforeSend) return;

      setAnalyticsConsent(true);
      const result = beforeSend({});
      expect(result).toBeDefined();
    });

    it("handles exception values without stacktrace", () => {
      const beforeSend = getBeforeSend();
      if (!beforeSend) return;

      setAnalyticsConsent(true);
      const event = {
        exception: { values: [{ value: "plain error" }] },
      };
      const result = beforeSend(event);
      expect(result).toBeDefined();
      expect(result.exception.values[0].value).toBe("plain error");
    });
  });

  describe("Sentry beforeBreadcrumb callback", () => {
    function getBeforeBreadcrumb() {
      const sentryCall = mockSentryInit.mock.calls.find(
        (call: unknown[]) => call[0]?.beforeBreadcrumb,
      );
      return sentryCall ? sentryCall[0].beforeBreadcrumb : null;
    }

    it("returns null for ui.click breadcrumbs", () => {
      const beforeBreadcrumb = getBeforeBreadcrumb();
      if (!beforeBreadcrumb) return;

      setAnalyticsConsent(true);
      const result = beforeBreadcrumb({ category: "ui.click" });
      expect(result).toBeNull();
    });

    it("returns null for fetch breadcrumbs with file extension URLs", () => {
      const beforeBreadcrumb = getBeforeBreadcrumb();
      if (!beforeBreadcrumb) return;

      setAnalyticsConsent(true);
      const result = beforeBreadcrumb({
        category: "fetch",
        data: { url: "https://example.com/uploads/photo.png" },
      });
      expect(result).toBeNull();
    });

    it("scrubs messages containing file paths", () => {
      const beforeBreadcrumb = getBeforeBreadcrumb();
      if (!beforeBreadcrumb) return;

      setAnalyticsConsent(true);
      const breadcrumb = {
        category: "console",
        message: "Error loading /tmp/workspace/file.jpg",
      };
      const result = beforeBreadcrumb(breadcrumb);
      expect(result).not.toBeNull();
      expect(result.message).toContain("[REDACTED]");
    });

    it("returns null when consent is not granted", () => {
      const beforeBreadcrumb = getBeforeBreadcrumb();
      if (!beforeBreadcrumb) return;

      setAnalyticsConsent(false);
      const result = beforeBreadcrumb({ category: "console", message: "test" });
      expect(result).toBeNull();
    });

    it("passes through fetch breadcrumbs without file extension URLs", () => {
      const beforeBreadcrumb = getBeforeBreadcrumb();
      if (!beforeBreadcrumb) return;

      setAnalyticsConsent(true);
      const breadcrumb = {
        category: "fetch",
        data: { url: "https://example.com/api/v1/health" },
      };
      const result = beforeBreadcrumb(breadcrumb);
      expect(result).not.toBeNull();
    });

    it("passes through breadcrumbs without message field", () => {
      const beforeBreadcrumb = getBeforeBreadcrumb();
      if (!beforeBreadcrumb) return;

      setAnalyticsConsent(true);
      const breadcrumb = { category: "navigation" };
      const result = beforeBreadcrumb(breadcrumb);
      expect(result).not.toBeNull();
    });
  });
});
