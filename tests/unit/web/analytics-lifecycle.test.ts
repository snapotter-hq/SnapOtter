// @vitest-environment jsdom
//
// The analytics setting is refetched on every focus, so a tab sees it change
// while it's running. Whatever order the answers arrive in, the last one wins:
// an opt-out stops all egress (#423), and a re-enable brings everything back
// (#2197).
import { beforeEach, describe, expect, it, vi } from "vitest";

const posthogInstance = () => ({
  capture: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  register: vi.fn(),
  get_distinct_id: vi.fn(() => "id"),
});
const mockPosthogInit = vi.fn(posthogInstance);
vi.mock("posthog-js", () => ({ __esModule: true, default: { init: mockPosthogInit } }));

// A Sentry whose client can be closed, like the real one. `order` records
// scope clears and inits so a test can check which came first.
let client: { close: ReturnType<typeof vi.fn> } | null = null;
const order: string[] = [];
const mockSentryInit = vi.fn(() => {
  order.push("init");
  client = { close: vi.fn() };
});
const mockCaptureException = vi.fn();
/** Fail the next Sentry.init calls, as a chunk that didn't load would. */
let sentryInitFailures = 0;
vi.mock("@sentry/react", () => ({
  init: (...args: unknown[]) => {
    if (sentryInitFailures > 0) {
      sentryInitFailures--;
      throw new Error("chunk failed");
    }
    return mockSentryInit(...(args as []));
  },
  getIsolationScope: () => ({ clearBreadcrumbs: () => order.push("clear isolation") }),
  getCurrentScope: () => ({ clearBreadcrumbs: () => order.push("clear current") }),
  getClient: () => client,
  captureException: mockCaptureException,
  captureReactException: vi.fn(),
  setTag: vi.fn(),
  withScope: vi.fn(),
}));

const ON = {
  enabled: true,
  posthogApiKey: "phc_test",
  posthogHost: "https://ph.test",
  posthogProxyPath: "",
  sentryDsn: "",
  sentryDsnWeb: "https://sentry.test/web/1",
  posthogSampleRate: 1,
  instanceId: "inst",
};
const OFF = { ...ON, enabled: false };

type Analytics = typeof import("../../../apps/web/src/lib/analytics");
type EarlyErrors = typeof import("../../../apps/web/src/lib/early-errors");
let mod: Analytics;
let early: EarlyErrors;

/** Let lazy imports and the fire-and-forget Sentry calls settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

describe("analytics lifecycle (#2197)", () => {
  beforeEach(async () => {
    mockPosthogInit.mockClear();
    mockSentryInit.mockClear();
    mockCaptureException.mockClear();
    client = null;
    order.length = 0;
    sentryInitFailures = 0;
    vi.resetModules();
    early = await import("../../../apps/web/src/lib/early-errors");
    mod = await import("../../../apps/web/src/lib/analytics");
  });

  it("an opt-out that arrives while PostHog is loading wins", async () => {
    const starting = mod.applyInstanceAnalytics(ON);
    await mod.applyInstanceAnalytics(OFF);
    await starting;
    await settle();

    expect(mod.isTelemetryEnabled()).toBe(false);
    expect(mockPosthogInit).not.toHaveBeenCalled();
    expect(mockSentryInit).not.toHaveBeenCalled();
  });

  it("starts telemetry once when two answers both say on", async () => {
    await Promise.all([mod.applyInstanceAnalytics(ON), mod.applyInstanceAnalytics(ON)]);

    expect(mockPosthogInit).toHaveBeenCalledTimes(1);
    expect(mockSentryInit).toHaveBeenCalledTimes(1);
  });

  it("drops errors captured while the instance was off", async () => {
    early.startEarlyErrorCapture();
    const err = new Error("while off");
    window.dispatchEvent(new ErrorEvent("error", { error: err }));

    await mod.applyInstanceAnalytics(OFF);
    await mod.applyInstanceAnalytics(ON);
    await settle();

    expect(mockSentryInit).toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalledWith(err);
  });

  it("still replays errors captured before an instance that is on", async () => {
    early.startEarlyErrorCapture();
    const err = new Error("first paint");
    window.dispatchEvent(new ErrorEvent("error", { error: err }));

    await mod.applyInstanceAnalytics(ON);
    await settle();

    expect(mockCaptureException).toHaveBeenCalledWith(err);
  });

  it("comes back, Sentry included, when the instance is turned back on", async () => {
    await mod.applyInstanceAnalytics(ON);
    const firstClient = client;
    await mod.applyInstanceAnalytics(OFF);
    await settle();
    expect(firstClient?.close).toHaveBeenCalled();

    await mod.applyInstanceAnalytics(ON);
    await settle();

    expect(mod.isTelemetryEnabled()).toBe(true);
    expect(mockSentryInit).toHaveBeenCalledTimes(2);
    const instance = mockPosthogInit.mock.results[0]?.value;
    expect(instance.opt_in_capturing).toHaveBeenCalledTimes(2);
  });

  it("brings Sentry back after an opt-out that landed once PostHog was up", async () => {
    // The opt-out arrives right after posthog.init, while the start is still
    // loading what it registers as super properties.
    mockPosthogInit.mockImplementationOnce(() => {
      queueMicrotask(() => mod.optOut());
      return posthogInstance();
    });
    await mod.applyInstanceAnalytics(ON);
    await settle();
    expect(mockSentryInit).not.toHaveBeenCalled();

    await mod.applyInstanceAnalytics(ON);
    await settle();

    expect(mod.isTelemetryEnabled()).toBe(true);
    expect(mockSentryInit).toHaveBeenCalledTimes(1);
    const instance = mockPosthogInit.mock.results[0]?.value;
    expect(instance.register).toHaveBeenCalled();
  });

  it("keeps errors for later when the setting couldn't be loaded", async () => {
    early.startEarlyErrorCapture();
    const err = new Error("before the setting");
    window.dispatchEvent(new ErrorEvent("error", { error: err }));

    await mod.applyInstanceAnalytics(null);
    await mod.applyInstanceAnalytics(ON);
    await settle();

    expect(mockCaptureException).toHaveBeenCalledWith(err);
  });

  it("restarts Sentry without the breadcrumbs from the opted-out period", async () => {
    await mod.applyInstanceAnalytics(ON);
    await mod.applyInstanceAnalytics(OFF);
    await settle();
    order.length = 0;

    await mod.applyInstanceAnalytics(ON);
    await settle();

    expect(order).toEqual(["clear isolation", "clear current", "init"]);
  });

  it("retries a Sentry start that failed on the next answer that says on", async () => {
    sentryInitFailures = 1;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await mod.applyInstanceAnalytics(ON);
    await settle();
    expect(mockSentryInit).not.toHaveBeenCalled();

    await mod.applyInstanceAnalytics(ON);
    await settle();

    expect(mockSentryInit).toHaveBeenCalledTimes(1);
  });

  // #2217: telemetry being allowed used to depend on PostHog starting, so a
  // PostHog that failed left Sentry initialised but dropping everything.
  describe("when PostHog fails to start", () => {
    beforeEach(() => {
      mockPosthogInit.mockImplementationOnce(() => {
        throw new Error("posthog-js chunk failed");
      });
      vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    it("still reports crashes to Sentry", async () => {
      await mod.applyInstanceAnalytics(ON);
      await settle();

      expect(mod.isTelemetryEnabled()).toBe(true);
      expect(mod.isAnalyticsActive()).toBe(false);
      expect(mockSentryInit).toHaveBeenCalledTimes(1);
      const options = (mockSentryInit.mock.calls[0] as unknown[])[0] as {
        beforeSend: (e: unknown) => unknown;
      };
      expect(
        options.beforeSend({ exception: { values: [{ type: "TypeError", value: "x" }] } }),
      ).not.toBeNull();
    });

    it("replays crashes from before the start", async () => {
      early.startEarlyErrorCapture();
      const err = new Error("first paint");
      window.dispatchEvent(new ErrorEvent("error", { error: err }));

      await mod.applyInstanceAnalytics(ON);
      await settle();

      expect(mockCaptureException).toHaveBeenCalledWith(err);
    });

    it("retries PostHog on the next answer that says on, without restarting Sentry", async () => {
      await mod.applyInstanceAnalytics(ON);
      await settle();
      await mod.applyInstanceAnalytics(ON);
      await settle();

      expect(mockPosthogInit).toHaveBeenCalledTimes(2);
      expect(mod.isAnalyticsActive()).toBe(true);
      expect(mockSentryInit).toHaveBeenCalledTimes(1);
    });

    it("still stops everything on an opt-out", async () => {
      await mod.applyInstanceAnalytics(ON);
      await settle();
      await mod.applyInstanceAnalytics(OFF);
      await settle();

      expect(mod.isTelemetryEnabled()).toBe(false);
      expect(client?.close).toHaveBeenCalled();
    });
  });

  it("optIn() after optOut() brings Sentry back too", async () => {
    await mod.initAnalytics(ON);
    mod.optOut();
    await settle();
    mod.optIn();
    await settle();

    expect(mockSentryInit).toHaveBeenCalledTimes(2);
  });
});
