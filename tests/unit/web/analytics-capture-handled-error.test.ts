// @vitest-environment jsdom

import type { AnalyticsConfig } from "@snapotter/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  getClient: vi.fn(),
  withScope: vi.fn(),
  captureException: vi.fn(),
  setTag: vi.fn(),
}));
vi.mock("@sentry/react", () => sentry);
vi.mock("@/lib/early-errors", () => ({ flushEarlyErrors: vi.fn() }));

type Analytics = typeof import("@/lib/analytics");

// analytics.ts keeps module-level enabled/initialized state; a fresh module per
// test isolates the "before init" case from the "after init" ones.
async function freshAnalytics(): Promise<Analytics> {
  vi.resetModules();
  return await import("@/lib/analytics");
}

beforeEach(() => {
  vi.clearAllMocks();
  sentry.withScope.mockImplementation((cb: (scope: unknown) => unknown) =>
    cb({ setTags: vi.fn(), setTag: vi.fn() }),
  );
});

describe("captureHandledError", () => {
  it("returns null and sends nothing before analytics is initialized", async () => {
    const a = await freshAnalytics();
    expect(await a.captureHandledError(new Error("x"))).toBeNull();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("returns null when no Sentry client exists (DSN absent or opt-out)", async () => {
    const a = await freshAnalytics();
    await a.initAnalytics({ enabled: true } as AnalyticsConfig);
    sentry.getClient.mockReturnValue(undefined);
    expect(await a.captureHandledError(new Error("x"))).toBeNull();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("captures with the given tags and returns the Sentry event id", async () => {
    const a = await freshAnalytics();
    await a.initAnalytics({ enabled: true } as AnalyticsConfig);
    sentry.getClient.mockReturnValue({});
    sentry.captureException.mockReturnValue("evt-1");
    const scope = { setTags: vi.fn(), setTag: vi.fn() };
    sentry.withScope.mockImplementation((cb: (s: unknown) => unknown) => cb(scope));

    const err = new Error("boom");
    const id = await a.captureHandledError(err, {
      tool_id: "pixelate",
      error_class: "operational",
    });

    expect(id).toBe("evt-1");
    expect(sentry.captureException).toHaveBeenCalledWith(err);
    expect(scope.setTags).toHaveBeenCalledWith({
      tool_id: "pixelate",
      error_class: "operational",
    });
  });
});
