// @vitest-environment jsdom
//
// #2196: the first render always beats the analytics config fetch, and React
// does not re-dispatch a boundary-caught error to window "error". So the early
// buffer, which only listened for window errors, never saw first-paint crashes.
// They wait there now and are delivered only once telemetry is known to be on.
import type { AnalyticsConfig } from "@snapotter/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => {
  const order: string[] = [];
  return {
    order,
    init: vi.fn(() => {
      order.push("init");
    }),
    getClient: vi.fn<() => object | undefined>(() => ({})),
    getIsolationScope: () => ({ clearBreadcrumbs: vi.fn() }),
    getCurrentScope: () => ({ clearBreadcrumbs: vi.fn() }),
    withScope: vi.fn(),
    captureException: vi.fn(),
    captureReactException: vi.fn(() => {
      order.push("capture");
    }),
    setTag: vi.fn(),
  };
});
vi.mock("@sentry/react", () => sentry);

type Analytics = typeof import("@/lib/analytics");
type Report = typeof import("@/lib/report-render-error");

const ON: AnalyticsConfig = {
  enabled: true,
  posthogApiKey: "",
  posthogHost: "",
  posthogProxyPath: "",
  sentryDsn: "",
  sentryDsnWeb: "https://sentry.test/web/1",
  posthogSampleRate: 1,
  instanceId: "inst",
};
const OFF: AnalyticsConfig = { ...ON, enabled: false };
const ERROR_INFO = { componentStack: "\n    at ToolPage" };

async function load(): Promise<{ analytics: Analytics; report: Report }> {
  vi.resetModules();
  return {
    analytics: await import("@/lib/analytics"),
    report: await import("@/lib/report-render-error"),
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  sentry.order.length = 0;
  sentry.getClient.mockReturnValue({});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("a render crash before the analytics setting loads (#2196)", () => {
  it("is replayed once an enabled setting starts Sentry", async () => {
    const { analytics, report } = await load();
    const error = new Error("first paint");

    report.reportRenderError(error, ERROR_INFO);
    await settle();
    expect(sentry.captureReactException).not.toHaveBeenCalled();

    await analytics.applyInstanceAnalytics(ON);
    await settle();

    expect(sentry.captureReactException).toHaveBeenCalledWith(error, ERROR_INFO);
  });

  it("is dropped when the instance turns out to be off", async () => {
    const { analytics, report } = await load();
    report.reportRenderError(new Error("opted out"), ERROR_INFO);

    await analytics.applyInstanceAnalytics(OFF);
    await analytics.applyInstanceAnalytics(ON);
    await settle();

    expect(sentry.captureReactException).not.toHaveBeenCalled();
  });

  it("waits while the setting is unknown, then replays on a later answer", async () => {
    const { analytics, report } = await load();
    const error = new Error("before the setting");
    report.reportRenderError(error, ERROR_INFO);

    await analytics.applyInstanceAnalytics(null);
    await settle();
    expect(sentry.captureReactException).not.toHaveBeenCalled();

    await analytics.applyInstanceAnalytics(ON);
    await settle();

    expect(sentry.captureReactException).toHaveBeenCalledWith(error, ERROR_INFO);
  });

  it("waits for the Sentry client even after the setting says on", async () => {
    const { analytics, report } = await load();
    const error = new Error("during the start");
    const starting = analytics.applyInstanceAnalytics(ON);

    report.reportRenderError(error, ERROR_INFO);
    expect(sentry.captureReactException).not.toHaveBeenCalled();
    await starting;
    await settle();

    expect(sentry.order).toEqual(["init", "capture"]);
    expect(sentry.captureReactException).toHaveBeenCalledWith(error, ERROR_INFO);
  });

  it("sends immediately once Sentry is up", async () => {
    const { analytics, report } = await load();
    await analytics.applyInstanceAnalytics(ON);

    const error = new Error("after boot");
    report.reportRenderError(error, ERROR_INFO);
    await settle();

    expect(sentry.captureReactException).toHaveBeenCalledWith(error, ERROR_INFO);
  });

  it("drops it when the instance has no web Sentry DSN", async () => {
    const { analytics, report } = await load();
    report.reportRenderError(new Error("no dsn"), ERROR_INFO);

    await analytics.applyInstanceAnalytics({ ...ON, sentryDsnWeb: "" });
    await settle();

    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.captureReactException).not.toHaveBeenCalled();
  });
});
