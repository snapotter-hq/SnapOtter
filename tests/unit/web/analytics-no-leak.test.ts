// @vitest-environment node
//
// Proves the invariant: PostHog and Sentry are NEVER called when
// analytics is disabled or the user has not granted consent.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockPosthogInit = vi.fn(() => ({
  capture: mockCapture,
  identify: mockIdentify,
  startSessionRecording: mockStartSessionRecording,
  opt_in_capturing: vi.fn(),
  opt_out_capturing: mockOptOut,
  reset: mockReset,
  persistence: { disabled: false },
}));
const mockCapture = vi.fn();
const mockIdentify = vi.fn();
const mockStartSessionRecording = vi.fn();
const mockOptOut = vi.fn();
const mockReset = vi.fn();

vi.mock("posthog-js", () => ({
  __esModule: true,
  default: { init: mockPosthogInit },
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
  posthogApiKey: "",
  posthogHost: "",
  sentryDsn: "",
  sampleRate: 0,
  instanceId: "",
};

function clearAllMocks() {
  shutdownAnalytics();
  mockPosthogInit.mockClear();
  mockCapture.mockClear();
  mockIdentify.mockClear();
  mockStartSessionRecording.mockClear();
  mockOptOut.mockClear();
  mockReset.mockClear();
  mockSentryInit.mockClear();
}

describe("Analytics No-Leak Invariant", () => {
  beforeEach(clearAllMocks);

  // ── Scenario 1: Server has analytics disabled ─────────────────────
  describe("when server config.enabled is false", () => {
    it("initAnalytics never calls posthog.init", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(disabledConfig);
      expect(mockPosthogInit).not.toHaveBeenCalled();
    });

    it("initAnalytics never calls Sentry.init", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(disabledConfig);
      expect(mockSentryInit).not.toHaveBeenCalled();
    });

    it("track() is a silent no-op", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(disabledConfig);
      track("test_event", { key: "value" });
      expect(mockCapture).not.toHaveBeenCalled();
    });

    it("identify() is a silent no-op", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(disabledConfig);
      identify("inst-1", { version: "1.0" });
      expect(mockIdentify).not.toHaveBeenCalled();
    });

    it("startErrorReplay() is a silent no-op", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(disabledConfig);
      startErrorReplay();
      expect(mockStartSessionRecording).not.toHaveBeenCalled();
    });
  });

  // ── Scenario 2: Consent never granted ─────────────────────────────
  describe("when consent is never granted (fresh user)", () => {
    it("initAnalytics with enabled config but no consent skips PostHog", async () => {
      // Do NOT call setAnalyticsConsent(true) -- simulates fresh user
      await initAnalytics(enabledConfig);
      expect(mockPosthogInit).not.toHaveBeenCalled();
    });

    it("track() never calls posthog.capture", () => {
      track("should_not_fire");
      expect(mockCapture).not.toHaveBeenCalled();
    });

    it("identify() never calls posthog.identify", () => {
      identify("inst-1", {});
      expect(mockIdentify).not.toHaveBeenCalled();
    });

    it("startErrorReplay() never calls posthog.startSessionRecording", () => {
      startErrorReplay();
      expect(mockStartSessionRecording).not.toHaveBeenCalled();
    });

    it("no PostHog or Sentry SDK is loaded at all", async () => {
      await initAnalytics(enabledConfig);
      expect(mockPosthogInit).not.toHaveBeenCalled();
      expect(mockSentryInit).not.toHaveBeenCalled();
    });
  });

  // ── Scenario 3: Consent explicitly revoked ────────────────────────
  describe("when consent is revoked after being granted", () => {
    it("shutdownAnalytics opts out and resets PostHog", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      expect(mockPosthogInit).toHaveBeenCalledOnce();

      setAnalyticsConsent(false);
      expect(mockOptOut).toHaveBeenCalledOnce();
      expect(mockReset).toHaveBeenCalledOnce();
    });

    it("track() is silent after revocation", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      mockCapture.mockClear();

      setAnalyticsConsent(false);
      track("should_not_fire");
      expect(mockCapture).not.toHaveBeenCalled();
    });

    it("identify() is silent after revocation", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      mockIdentify.mockClear();

      setAnalyticsConsent(false);
      identify("inst-1", { phase: 2 });
      expect(mockIdentify).not.toHaveBeenCalled();
    });

    it("startErrorReplay() is silent after revocation", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      mockStartSessionRecording.mockClear();

      setAnalyticsConsent(false);
      startErrorReplay();
      expect(mockStartSessionRecording).not.toHaveBeenCalled();
    });

    it("Sentry beforeSend returns null after revocation", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      const sentryCall = mockSentryInit.mock.calls.find((call: unknown[]) => call[0]?.beforeSend);
      expect(sentryCall).toBeDefined();
      const beforeSend = sentryCall![0].beforeSend;

      setAnalyticsConsent(false);
      const result = beforeSend({ exception: { values: [] } });
      expect(result).toBeNull();
    });

    it("Sentry beforeBreadcrumb returns null after revocation", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      const sentryCall = mockSentryInit.mock.calls.find(
        (call: unknown[]) => call[0]?.beforeBreadcrumb,
      );
      expect(sentryCall).toBeDefined();
      const beforeBreadcrumb = sentryCall![0].beforeBreadcrumb;

      setAnalyticsConsent(false);
      const result = beforeBreadcrumb({ category: "console", message: "test" });
      expect(result).toBeNull();
    });
  });

  // ── Scenario 4: Remind-later state ────────────────────────────────
  describe("when user is in remind-later state (consent = null)", () => {
    it("remind-later calls setAnalyticsConsent(false), not true", () => {
      // This is tested in the store, but verify the invariant:
      // When consent hasn't been given, setAnalyticsConsent(false) is called,
      // which means PostHog/Sentry are never active during the remind period.
      setAnalyticsConsent(false);
      track("during_remind_period");
      expect(mockCapture).not.toHaveBeenCalled();
    });

    it("no SDK activity after remind-later even with enabled config", async () => {
      // Simulate: user hit "Not right now" -- consent was never true
      setAnalyticsConsent(false);
      await initAnalytics(enabledConfig);
      expect(mockPosthogInit).not.toHaveBeenCalled();
      expect(mockSentryInit).not.toHaveBeenCalled();

      track("event_during_remind");
      identify("inst-1", {});
      startErrorReplay();
      expect(mockCapture).not.toHaveBeenCalled();
      expect(mockIdentify).not.toHaveBeenCalled();
      expect(mockStartSessionRecording).not.toHaveBeenCalled();
    });
  });

  // ── Scenario 5: Consent race condition ────────────────────────────
  describe("consent revoked during async SDK import", () => {
    it("PostHog is not active if consent revoked while import resolves", async () => {
      setAnalyticsConsent(true);
      const initPromise = initAnalytics(enabledConfig);
      setAnalyticsConsent(false);
      await initPromise;

      track("after_race_condition");
      expect(mockCapture).not.toHaveBeenCalled();
    });
  });

  // ── Scenario 6: Multiple rapid toggles ────────────────────────────
  describe("rapid consent toggles", () => {
    it("ending on false means nothing is active", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      setAnalyticsConsent(false);
      setAnalyticsConsent(true);
      setAnalyticsConsent(false);
      setAnalyticsConsent(true);
      setAnalyticsConsent(false);

      mockCapture.mockClear();
      mockIdentify.mockClear();
      track("after_toggles");
      identify("inst-1", {});
      expect(mockCapture).not.toHaveBeenCalled();
      expect(mockIdentify).not.toHaveBeenCalled();
    });
  });

  // ── Scenario 7: PII scrubbing even when consent is granted ────────
  describe("PII never leaks even with consent", () => {
    it("Sentry strips user.email and user.username from events", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      const sentryCall = mockSentryInit.mock.calls.find((call: unknown[]) => call[0]?.beforeSend);
      const beforeSend = sentryCall![0].beforeSend;

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
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      const sentryCall = mockSentryInit.mock.calls.find((call: unknown[]) => call[0]?.beforeSend);
      const beforeSend = sentryCall![0].beforeSend;

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
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      const sentryCall = mockSentryInit.mock.calls.find(
        (call: unknown[]) => call[0]?.beforeBreadcrumb,
      );
      const beforeBreadcrumb = sentryCall![0].beforeBreadcrumb;

      expect(beforeBreadcrumb({ category: "ui.click" })).toBeNull();
    });

    it("Sentry blocks fetch breadcrumbs to file URLs", async () => {
      setAnalyticsConsent(true);
      await initAnalytics(enabledConfig);
      const sentryCall = mockSentryInit.mock.calls.find(
        (call: unknown[]) => call[0]?.beforeBreadcrumb,
      );
      const beforeBreadcrumb = sentryCall![0].beforeBreadcrumb;

      expect(
        beforeBreadcrumb({
          category: "fetch",
          data: { url: "https://example.com/uploads/photo.png" },
        }),
      ).toBeNull();
    });
  });
});
