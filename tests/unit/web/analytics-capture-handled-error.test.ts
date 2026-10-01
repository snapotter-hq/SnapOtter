// @vitest-environment jsdom

import { type AnalyticsConfig, SafeError } from "@snapotter/shared";
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

  // #1351: the status stays out of the SafeError message and goes on as a tag,
  // so every call site gets it without having to remember.
  describe("status_code tag", () => {
    async function captureAndReadTags(
      err: Error,
      tags?: Record<string, string>,
    ): Promise<Record<string, string> | undefined> {
      const a = await freshAnalytics();
      await a.initAnalytics({ enabled: true } as AnalyticsConfig);
      sentry.getClient.mockReturnValue({});
      const scope = { setTags: vi.fn(), setTag: vi.fn() };
      sentry.withScope.mockImplementation((cb: (s: unknown) => unknown) => cb(scope));
      await a.captureHandledError(err, tags);
      expect(sentry.captureException).toHaveBeenCalledWith(err);
      return scope.setTags.mock.calls[0]?.[0];
    }

    it("tags a SafeError's statusCode", async () => {
      const err = new SafeError("Save to Files upload failed", { statusCode: 503 });
      expect(await captureAndReadTags(err, { error_class: "operational" })).toEqual({
        status_code: "503",
        error_class: "operational",
      });
    });

    it("tags it even when the caller passes no tags", async () => {
      const err = new SafeError("Media preview generation failed", { statusCode: 502 });
      expect(await captureAndReadTags(err)).toEqual({ status_code: "502" });
    });

    it("lets a caller's explicit status_code stand", async () => {
      const err = new SafeError("x", { statusCode: 500 });
      expect(await captureAndReadTags(err, { status_code: "404" })).toEqual({
        status_code: "404",
      });
    });

    it("falls back to the SafeError's statusCode when the caller's status_code is not a status", async () => {
      const err = new SafeError("x", { statusCode: 500 });
      expect(await captureAndReadTags(err, { status_code: "abc", tool_id: "resize" })).toEqual({
        status_code: "500",
        tool_id: "resize",
      });
    });

    it.each([42, 600, 404.5])("leaves an out-of-range statusCode (%s) off", async (statusCode) => {
      const err = new SafeError("x", { statusCode });
      expect(await captureAndReadTags(err, { error_class: "operational" })).toEqual({
        error_class: "operational",
      });
    });

    it("leaves a SafeError without a statusCode untagged", async () => {
      expect(await captureAndReadTags(new SafeError("x"))).toBeUndefined();
    });

    it("does not read a statusCode off an error that isn't a SafeError", async () => {
      const err = Object.assign(new Error("x"), { statusCode: 500 });
      expect(await captureAndReadTags(err)).toBeUndefined();
    });
  });
});
