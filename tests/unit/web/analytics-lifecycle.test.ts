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

// A Sentry whose client can be closed, like the real one.
let client: { close: ReturnType<typeof vi.fn> } | null = null;
const mockSentryInit = vi.fn(() => {
  client = { close: vi.fn() };
});
const mockCaptureException = vi.fn();
vi.mock("@sentry/react", () => ({
  init: mockSentryInit,
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

  it("optIn() after optOut() brings Sentry back too", async () => {
    await mod.initAnalytics(ON);
    mod.optOut();
    await settle();
    mod.optIn();
    await settle();

    expect(mockSentryInit).toHaveBeenCalledTimes(2);
  });
});
