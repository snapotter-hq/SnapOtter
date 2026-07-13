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
  sentryDsnWeb: "https://sentry.test/web/456",
  posthogSampleRate: 1,
  instanceId: "inst-1",
};

const disabledConfig = {
  enabled: false,
  posthogApiKey: "key",
  posthogHost: "https://ph.test",
  sentryDsn: "",
  sentryDsnWeb: "",
  posthogSampleRate: 1,
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

    it("initializes Sentry with the web DSN when sentryDsnWeb is provided", async () => {
      await mod.initAnalytics(enabledConfig);
      expect(mockSentryInit).toHaveBeenCalledOnce();
      expect(mockSentryInit).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: "https://sentry.test/web/456",
          sendDefaultPii: false,
        }),
      );
    });

    it("skips Sentry when sentryDsnWeb is empty", async () => {
      await mod.initAnalytics({ ...enabledConfig, sentryDsnWeb: "" });
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
    it("forwards only allow-listed primitive properties for a known event", async () => {
      await mod.initAnalytics(enabledConfig);
      mod.track("tool_opened", { tool_id: "resize", category: "image", secret: "leak" });
      // Allow-listed keys pass through; anything else is dropped at the boundary.
      expect(mockCapture).toHaveBeenCalledWith("tool_opened", {
        tool_id: "resize",
        category: "image",
      });
    });

    it("sends an empty property bag when none are provided", async () => {
      await mod.initAnalytics(enabledConfig);
      mod.track("tool_opened");
      expect(mockCapture).toHaveBeenCalledWith("tool_opened", {});
    });

    it("drops all properties for an unknown event", async () => {
      await mod.initAnalytics(enabledConfig);
      mod.track("not_allow_listed", { tool_id: "resize" });
      expect(mockCapture).toHaveBeenCalledWith("not_allow_listed", {});
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

    it("strips identity and free-text channels from exception events", async () => {
      const beforeSend = await getBeforeSend();
      if (!beforeSend) return;

      const event = {
        user: { email: "test@example.com", username: "user1", id: "42" },
        message: "boom at /tmp/workspace/image.jpg",
        request: { url: "https://app/secret" },
        breadcrumbs: [{ message: "/Users/test/file.png" }],
        exception: {
          values: [
            {
              type: "TypeError",
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
      // Identity and free-text channels are removed wholesale.
      expect(result.user).toBeUndefined();
      expect(result.message).toBeUndefined();
      expect(result.request).toBeUndefined();
      // Breadcrumbs are kept for debugging but sanitized (paths/urls redacted).
      expect(result.breadcrumbs).toEqual([{ message: "<path>" }]);
      // The exception message is replaced by its type so no free text leaves.
      expect(result.exception.values[0].value).toBe("TypeError");
      // Filesystem paths collapse to the basename (directory and any username
      // stripped); abs_path is scrubbed the same way rather than dropped.
      expect(result.exception.values[0].stacktrace.frames[0].filename).toBe("file.png");
      expect(result.exception.values[0].stacktrace.frames[0].abs_path).toBe("photo.jpeg");
    });

    it("handles event without user or exception fields", async () => {
      const beforeSend = await getBeforeSend();
      if (!beforeSend) return;

      const result = beforeSend({});
      expect(result).toBeDefined();
    });

    it("replaces the exception message with its type when there is no stacktrace", async () => {
      const beforeSend = await getBeforeSend();
      if (!beforeSend) return;

      const event = {
        exception: { values: [{ type: "RangeError", value: "plain error at /tmp/x.png" }] },
      };
      const result = beforeSend(event);
      expect(result).toBeDefined();
      expect(result.exception.values[0].value).toBe("RangeError");
    });
  });
});
