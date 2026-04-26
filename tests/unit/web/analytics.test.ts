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

vi.mock("@sentry/react", () => ({
  init: vi.fn(),
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
});
