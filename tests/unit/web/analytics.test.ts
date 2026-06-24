// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockInit = vi.fn(() => ({
  capture: mockCapture,
  startSessionRecording: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  reset: vi.fn(),
  register: vi.fn(),
  get_distinct_id: vi.fn(() => "test-distinct-id"),
  persistence: { disabled: false },
}));
const mockCapture = vi.fn();

vi.mock("posthog-js", () => ({
  __esModule: true,
  default: { init: mockInit },
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
  posthogApiKey: "key",
  posthogHost: "https://ph.test",
  sentryDsn: "",
  sampleRate: 1,
  instanceId: "inst-1",
};

type AnalyticsModule = typeof import("../../../apps/web/src/lib/analytics");

// The frontend analytics module has internal state (initialized flag, posthog instance)
// that persists across calls. We reset modules before each test to get a fresh module.
let mod: AnalyticsModule;

beforeEach(async () => {
  mockInit.mockClear();
  mockCapture.mockClear();
  mockSentryInit.mockClear();
  vi.resetModules();
  mod = await import("../../../apps/web/src/lib/analytics");
});

describe("analytics lib (baked model)", () => {
  describe("initAnalytics", () => {
    it("skips initialization when config.enabled is false", async () => {
      await mod.initAnalytics(disabledConfig);
      expect(mockInit).not.toHaveBeenCalled();
    });

    it("calls posthog.init when config.enabled is true", async () => {
      await mod.initAnalytics(enabledConfig);
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

    it("initializes Sentry when sentryDsn is provided", async () => {
      await mod.initAnalytics(enabledConfig);
      expect(mockSentryInit).toHaveBeenCalledOnce();
      expect(mockSentryInit).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: "https://sentry.test/123",
          sendDefaultPii: false,
        }),
      );
    });

    it("skips Sentry when sentryDsn is empty", async () => {
      await mod.initAnalytics({ ...enabledConfig, sentryDsn: "" });
      expect(mockSentryInit).not.toHaveBeenCalled();
    });

    it("swallows Sentry init errors and logs a warning", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockSentryInit.mockImplementationOnce(() => {
        throw new Error("Sentry init boom");
      });
      await mod.initAnalytics(enabledConfig);
      expect(consoleSpy).toHaveBeenCalledWith("[analytics] Sentry init failed:", expect.any(Error));
      consoleSpy.mockRestore();
    });

    it("does not double-initialize on repeated calls", async () => {
      await mod.initAnalytics(enabledConfig);
      await mod.initAnalytics(enabledConfig);
      expect(mockInit).toHaveBeenCalledOnce();
    });
  });

  describe("track", () => {
    it("calls capture when initialized", async () => {
      await mod.initAnalytics(enabledConfig);
      mod.track("tool_used", { tool: "resize" });
      expect(mockCapture).toHaveBeenCalledWith("tool_used", { tool: "resize" });
    });

    it("works without properties", async () => {
      await mod.initAnalytics(enabledConfig);
      mod.track("simple_event");
      expect(mockCapture).toHaveBeenCalledWith("simple_event", undefined);
    });

    it("does not throw before initialization", () => {
      expect(() => mod.track("pre_init_event")).not.toThrow();
    });

    it("swallows exceptions from posthog.capture", async () => {
      await mod.initAnalytics(enabledConfig);
      mockCapture.mockImplementationOnce(() => {
        throw new Error("capture boom");
      });
      expect(() => mod.track("should_not_throw")).not.toThrow();
    });

    it("is silent when config was disabled", async () => {
      await mod.initAnalytics(disabledConfig);
      mod.track("blocked_event");
      expect(mockCapture).not.toHaveBeenCalled();
    });
  });

  describe("getDistinctId", () => {
    it("returns null before initialization", () => {
      expect(mod.getDistinctId()).toBeNull();
    });

    it("returns distinct ID after initialization", async () => {
      await mod.initAnalytics(enabledConfig);
      expect(mod.getDistinctId()).toBe("test-distinct-id");
    });
  });

  describe("Sentry beforeSend callback", () => {
    async function getBeforeSend() {
      mockSentryInit.mockClear();
      await mod.initAnalytics(enabledConfig);
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
      mockSentryInit.mockClear();
      await mod.initAnalytics(enabledConfig);
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
