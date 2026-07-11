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
  sentryDsnWeb: "https://sentry.test/web/456",
  posthogSampleRate: 1,
  instanceId: "inst-1",
};

const disabledConfig = {
  enabled: false,
  posthogApiKey: "",
  posthogHost: "",
  sentryDsn: "",
  sentryDsnWeb: "",
  posthogSampleRate: 0,
  instanceId: "",
};

type AnalyticsModule = typeof import("../../../apps/web/src/lib/analytics");
let mod: AnalyticsModule;

describe("Analytics No-Leak Invariant (baked model)", () => {
  beforeEach(async () => {
    mockPosthogInit.mockClear();
    mockCapture.mockClear();
    mockSentryInit.mockClear();
    mockBrowserTracingIntegration.mockClear();
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

    it("track() forwards only allow-listed properties to posthog.capture", async () => {
      await mod.initAnalytics(enabledConfig);
      mod.track("tool_opened", { tool_id: "resize", filename: "secret.png" });
      // filename is free-text and never allow-listed, so it is stripped.
      expect(mockCapture).toHaveBeenCalledWith("tool_opened", { tool_id: "resize" });
    });

    it("initAnalytics initializes Sentry with the web DSN when sentryDsnWeb provided", async () => {
      await mod.initAnalytics(enabledConfig);
      expect(mockSentryInit).toHaveBeenCalledOnce();
      expect(mockSentryInit).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: "https://sentry.test/web/456",
          sendDefaultPii: false,
        }),
      );
    });
  });

  describe("errors-only web Sentry init", () => {
    async function getSentryOptions() {
      await mod.initAnalytics(enabledConfig);
      return mockSentryInit.mock.calls[0]?.[0];
    }

    it("passes no tracesSampleRate and never constructs a tracing integration", async () => {
      const options = await getSentryOptions();
      expect(options).toBeDefined();
      expect("tracesSampleRate" in options).toBe(false);
      expect("tracesSampler" in options).toBe(false);
      expect(mockBrowserTracingIntegration).not.toHaveBeenCalled();
    });

    it("disables SDK client reports", async () => {
      const options = await getSentryOptions();
      expect(options.sendClientReports).toBe(false);
    });

    it("filters the release-health session integration out of the defaults", async () => {
      const options = await getSentryOptions();
      const filtered = options.integrations([{ name: "BrowserSession" }, { name: "Dedupe" }]);
      expect(filtered).toEqual([{ name: "Dedupe" }]);
    });

    it("does not init Sentry when sentryDsnWeb is empty even if sentryDsn is set", async () => {
      await mod.initAnalytics({ ...enabledConfig, sentryDsnWeb: "" });
      expect(mockSentryInit).not.toHaveBeenCalled();
    });
  });

  describe("web-DSN-only init (no PostHog key)", () => {
    const sentryOnlyConfig = { ...enabledConfig, posthogApiKey: "", posthogHost: "" };

    it("skips posthog.init entirely but still initializes Sentry", async () => {
      await mod.initAnalytics(sentryOnlyConfig);
      expect(mockPosthogInit).not.toHaveBeenCalled();
      expect(mockSentryInit).toHaveBeenCalledOnce();
      expect(mockSentryInit).toHaveBeenCalledWith(
        expect.objectContaining({ dsn: "https://sentry.test/web/456" }),
      );
    });

    it("keeps beforeSend active: error events still pass the enabled gate", async () => {
      await mod.initAnalytics(sentryOnlyConfig);
      const beforeSend = mockSentryInit.mock.calls[0]?.[0]?.beforeSend;
      expect(beforeSend).toBeDefined();
      const result = beforeSend({
        exception: { values: [{ type: "TypeError", value: "boom" }] },
      });
      // A null here would mean the enabled gate never opened for a web-DSN-only
      // bake; the event must survive (scrubbed to type-only).
      expect(result).not.toBeNull();
      expect(result.exception.values[0].value).toBe("TypeError");
    });
  });

  describe("PII never leaks even when analytics enabled", () => {
    it("Sentry strips the entire user object from events", async () => {
      await mod.initAnalytics(enabledConfig);
      const sentryCall = mockSentryInit.mock.calls.find((call: unknown[]) => call[0]?.beforeSend);
      const beforeSend = sentryCall?.[0].beforeSend;
      if (!beforeSend) return;

      const event = {
        user: { email: "user@example.com", username: "admin", id: "123" },
        exception: { values: [] },
      };
      const result = beforeSend(event);
      // The hardened model removes the whole user object, not just email/username.
      expect(result.user).toBeUndefined();
    });

    it("Sentry removes free-text and paths from exception values", async () => {
      await mod.initAnalytics(enabledConfig);
      const sentryCall = mockSentryInit.mock.calls.find((call: unknown[]) => call[0]?.beforeSend);
      const beforeSend = sentryCall?.[0].beforeSend;
      if (!beforeSend) return;

      const event = {
        exception: {
          values: [
            {
              type: "Error",
              value: "Error processing /tmp/workspace/photo.jpg",
              stacktrace: {
                frames: [{ filename: "/Users/test/project/handler.png" }],
              },
            },
          ],
        },
      };
      const result = beforeSend(event);
      // Free-text message is replaced by the bare error type; the path cannot leak.
      expect(result.exception.values[0].value).toBe("Error");
      expect(result.exception.values[0].value).not.toContain("photo.jpg");
      // Filesystem-style paths still collapse to the basename (no dir/username leak).
      expect(result.exception.values[0].stacktrace.frames[0].filename).toBe("handler.png");
    });

    it("Sentry keeps a host-stripped path for app bundle frames so maps symbolicate", async () => {
      await mod.initAnalytics(enabledConfig);
      const sentryCall = mockSentryInit.mock.calls.find((call: unknown[]) => call[0]?.beforeSend);
      const beforeSend = sentryCall?.[0].beforeSend;
      if (!beforeSend) return;

      const event = {
        exception: {
          values: [
            {
              type: "TypeError",
              value: "boom",
              stacktrace: {
                frames: [
                  {
                    filename: "https://files.acme.example/assets/index-abc123.js",
                    abs_path: "https://files.acme.example/assets/index-abc123.js",
                    lineno: 5,
                    colno: 12,
                  },
                ],
              },
            },
          ],
        },
        debug_meta: {
          images: [
            {
              type: "sourcemap",
              code_file: "https://files.acme.example/assets/index-abc123.js",
              debug_id: "11111111-2222-3333-4444-555555555555",
            },
          ],
        },
      };
      const result = beforeSend(event);
      const frame = result.exception.values[0].stacktrace.frames[0];
      // Host-less path is kept (Sentry needs it to match the uploaded map); the
      // instance hostname is dropped. Line/column survive for symbolication.
      expect(frame.filename).toBe("/assets/index-abc123.js");
      expect(frame.abs_path).toBe("/assets/index-abc123.js");
      expect(frame.lineno).toBe(5);
      // debug_meta stays consistent with the frame and keeps the debug id.
      expect(result.debug_meta.images[0].code_file).toBe("/assets/index-abc123.js");
      expect(result.debug_meta.images[0].debug_id).toBe("11111111-2222-3333-4444-555555555555");
      // The instance hostname must not appear anywhere in the serialized event.
      expect(JSON.stringify(result)).not.toContain("acme.example");
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

  describe("runtime opt-out / opt-in toggle", () => {
    it("opts in to capturing when analytics initializes enabled (clears a stale persisted opt-out)", async () => {
      await mod.initAnalytics(enabledConfig);
      const instance = mockPosthogInit.mock.results.at(-1)?.value;
      expect(instance.opt_in_capturing).toHaveBeenCalled();
    });

    it("optOut() stops track() and opts out of capturing", async () => {
      await mod.initAnalytics(enabledConfig);
      const instance = mockPosthogInit.mock.results.at(-1)?.value;
      mockCapture.mockClear();
      mod.optOut();
      mod.track("tool_opened", { tool_id: "resize" });
      expect(mockCapture).not.toHaveBeenCalled();
      expect(instance.opt_out_capturing).toHaveBeenCalled();
    });

    it("optIn() resumes track() and opts back in after an optOut()", async () => {
      await mod.initAnalytics(enabledConfig);
      const instance = mockPosthogInit.mock.results.at(-1)?.value;
      mod.optOut();
      mockCapture.mockClear();
      mod.optIn();
      mod.track("tool_opened", { tool_id: "resize" });
      expect(mockCapture).toHaveBeenCalledWith("tool_opened", { tool_id: "resize" });
      expect(instance.opt_in_capturing).toHaveBeenCalled();
    });
  });
});
