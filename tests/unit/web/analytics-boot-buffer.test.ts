// @vitest-environment jsdom
//
// #4032: Sentry starts only after the analytics config round-trip, so a handled
// error or tag recorded during the first mount had nowhere to go and was lost.
// Both wait in a buffer now and flush once the SDK is up, or are thrown away
// with the opt-out if the instance turns out to be off (#423).
import { type AnalyticsConfig, SafeError } from "@snapotter/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => {
  const order: string[] = [];
  const scopes: Array<{ setTags: ReturnType<typeof vi.fn>; setTag: ReturnType<typeof vi.fn> }> = [];
  return {
    order,
    scopes,
    init: vi.fn(() => {
      order.push("init");
    }),
    getClient: vi.fn<() => object | undefined>(() => ({})),
    getIsolationScope: () => ({ clearBreadcrumbs: vi.fn() }),
    getCurrentScope: () => ({ clearBreadcrumbs: vi.fn() }),
    withScope: vi.fn((cb: (s: (typeof scopes)[number]) => unknown) => {
      const scope = { setTags: vi.fn(), setTag: vi.fn() };
      scopes.push(scope);
      return cb(scope);
    }),
    captureException: vi.fn(() => {
      order.push("capture");
      return "evt-boot";
    }),
    captureReactException: vi.fn(),
    setTag: vi.fn((key: string) => {
      order.push(`tag:${key}`);
    }),
  };
});
vi.mock("@sentry/react", () => sentry);

type Analytics = typeof import("@/lib/analytics");

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

async function freshAnalytics(): Promise<Analytics> {
  vi.resetModules();
  return await import("@/lib/analytics");
}

/** Let lazy imports and fire-and-forget Sentry calls settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  sentry.order.length = 0;
  sentry.scopes.length = 0;
  sentry.getClient.mockReturnValue({});
});

describe("telemetry recorded during app boot (#4032)", () => {
  it("sends a handled error captured before the config arrives once Sentry starts", async () => {
    const a = await freshAnalytics();
    const error = new SafeError("Save to Files upload failed", { statusCode: 503 });

    expect(await a.captureHandledError(error, { tool_id: "resize" })).toBeNull();
    expect(sentry.captureException).not.toHaveBeenCalled();

    await a.applyInstanceAnalytics(ON);
    await settle();

    expect(sentry.init).toHaveBeenCalledTimes(1);
    expect(sentry.captureException).toHaveBeenCalledWith(error);
    expect(sentry.scopes[0]?.setTags).toHaveBeenCalledWith({
      tool_id: "resize",
      status_code: "503",
    });
  });

  it("applies a buffered tag before replaying buffered errors", async () => {
    const a = await freshAnalytics();
    a.setSentryTag("locale", "fr");
    await a.captureHandledError(new Error("boot"));

    await a.applyInstanceAnalytics(ON);
    await settle();

    expect(sentry.setTag).toHaveBeenCalledWith("locale", "fr");
    expect(sentry.order).toEqual(["init", "tag:locale", "capture"]);
  });

  it("keeps both while the setting is still unknown, then flushes on a later answer", async () => {
    const a = await freshAnalytics();
    const error = new Error("before the setting");
    a.setSentryTag("route", "/editor");
    await a.captureHandledError(error);

    await a.applyInstanceAnalytics(null);
    await settle();
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.setTag).not.toHaveBeenCalled();

    await a.applyInstanceAnalytics(ON);
    await settle();

    expect(sentry.setTag).toHaveBeenCalledWith("route", "/editor");
    expect(sentry.captureException).toHaveBeenCalledWith(error);
  });

  it("drops both when the instance is off, even if it is turned on later", async () => {
    const a = await freshAnalytics();
    a.setSentryTag("locale", "fr");
    await a.captureHandledError(new Error("opted out"));

    await a.applyInstanceAnalytics(OFF);
    await a.applyInstanceAnalytics(ON);
    await settle();

    expect(sentry.setTag).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("drops both on an instance with no web Sentry DSN", async () => {
    const a = await freshAnalytics();
    a.setSentryTag("locale", "fr");
    await a.captureHandledError(new Error("no dsn"));

    await a.applyInstanceAnalytics({ ...ON, sentryDsnWeb: "" });
    await settle();

    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.setTag).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("buffers while Sentry is starting and flushes on success", async () => {
    const a = await freshAnalytics();
    const starting = a.applyInstanceAnalytics(ON);
    const error = new Error("during the start");
    await a.captureHandledError(error);
    expect(sentry.captureException).not.toHaveBeenCalled();

    await starting;
    await settle();

    expect(sentry.order).toEqual(["init", "capture"]);
    expect(sentry.captureException).toHaveBeenCalledWith(error);
  });

  it("buffers after a Settings opt-in until the enabled config arrives", async () => {
    const a = await freshAnalytics();
    // This tab booted with analytics off, so it never saw a config with a DSN.
    await a.applyInstanceAnalytics(OFF);
    // The settings dialog calls optIn() before its config refetch lands.
    a.optIn();

    const error = new Error("during the re-enable");
    a.setSentryTag("locale", "fr");
    await a.captureHandledError(error);
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.setTag).not.toHaveBeenCalled();

    await a.applyInstanceAnalytics(ON);
    await settle();

    expect(sentry.setTag).toHaveBeenCalledWith("locale", "fr");
    expect(sentry.captureException).toHaveBeenCalledWith(error);
  });

  it("keeps replaying the rest when one buffered error throws", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = await freshAnalytics();
    const first = new Error("first");
    const second = new Error("second");
    await a.captureHandledError(first);
    await a.captureHandledError(second);
    sentry.captureException.mockImplementationOnce(() => {
      throw new Error("the SDK threw");
    });

    await a.applyInstanceAnalytics(ON);
    await settle();

    expect(sentry.captureException).toHaveBeenCalledWith(second);
  });

  it("keeps the buffer through a failed Sentry start and flushes on the retry", async () => {
    sentry.init.mockImplementationOnce(() => {
      throw new Error("sentry chunk failed");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = await freshAnalytics();
    const error = new Error("while Sentry failed");
    await a.captureHandledError(error);

    await a.applyInstanceAnalytics(ON);
    await settle();
    expect(sentry.captureException).not.toHaveBeenCalled();

    await a.applyInstanceAnalytics(ON);
    await settle();

    expect(sentry.init).toHaveBeenCalledTimes(2);
    expect(sentry.captureException).toHaveBeenCalledWith(error);
  });

  it("returns a Sentry event id for a handled error captured after startup", async () => {
    const a = await freshAnalytics();
    await a.applyInstanceAnalytics(ON);

    expect(await a.captureHandledError(new Error("ready"))).toBe("evt-boot");
  });
});
