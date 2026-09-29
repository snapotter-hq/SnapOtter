// @vitest-environment jsdom

/**
 * Render crashes turn into telemetry in one place. A lazy chunk that Firefox
 * or Safari aborted because the page was being left is not a crash: released
 * builds sent those to Sentry as "error loading dynamically imported module"
 * and "Importing a module script failed." (never Chrome's wording, since
 * Chrome doesn't abort), in bursts as several imports died at once (#1480).
 * The report waits out the leave instead: if the page is gone, it never goes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const track = vi.fn();
const captureReactException = vi.fn();
const captureException = vi.fn();

vi.mock("@/lib/analytics", () => ({
  isAnalyticsActive: () => true,
  track: (...args: unknown[]) => track(...args),
}));
vi.mock("@sentry/react", () => ({
  captureReactException: (...args: unknown[]) => captureReactException(...args),
  captureException: (...args: unknown[]) => captureException(...args),
}));

const { reportRenderError } = await import("@/lib/report-render-error");
const { installChunkReloadHandler, LEAVING_WINDOW_MS } = await import("@/lib/chunk-reload");

/** Let the lazy Sentry import settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function abortedImport(message: string): Error {
  const error = new TypeError(message);
  const event = Object.assign(new Event("vite:preloadError", { cancelable: true }), {
    payload: error,
  });
  window.dispatchEvent(event);
  return error;
}

describe("reportRenderError", () => {
  let uninstall: () => void;

  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    uninstall = installChunkReloadHandler(vi.fn());
  });

  afterEach(() => {
    uninstall();
    vi.restoreAllMocks();
    track.mockReset();
    captureReactException.mockReset();
    captureException.mockReset();
  });

  it("reports a render crash to analytics and Sentry", async () => {
    const error = new Error("boom");
    reportRenderError(error, { componentStack: "\n    at Page" });
    await settle();

    expect(track).toHaveBeenCalledTimes(1);
    expect(captureReactException).toHaveBeenCalledWith(error, { componentStack: "\n    at Page" });
  });

  it("reports loader errors without errorInfo through captureException", async () => {
    const error = new Error("loader");
    reportRenderError(error);
    await settle();

    expect(captureException).toHaveBeenCalledWith(error);
  });

  describe("a chunk aborted while the page was being left (#1480)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("sends nothing while the leave can still complete", async () => {
      window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
      const error = abortedImport("error loading dynamically imported module: /assets/esm-x.js");

      reportRenderError(error, { componentStack: "\n    at Lazy" });
      await vi.advanceTimersByTimeAsync(LEAVING_WINDOW_MS - 1);

      expect(track).not.toHaveBeenCalled();
      expect(captureReactException).not.toHaveBeenCalled();
      // Still logged locally straight away.
      expect(console.error).toHaveBeenCalled();
    });

    it("reports it once the page has outlived the leave (the leave was cancelled)", async () => {
      // A document that really unloads never runs this timer. One that is
      // still here after the window stayed, so the failure was genuine.
      window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
      const error = abortedImport("Importing a module script failed.");

      reportRenderError(error, { componentStack: "\n    at Lazy" });
      await vi.advanceTimersByTimeAsync(LEAVING_WINDOW_MS);

      expect(track).toHaveBeenCalledTimes(1);
      expect(captureReactException).toHaveBeenCalledWith(error, {
        componentStack: "\n    at Lazy",
      });
    });
  });

  it("still reports a chunk failure outside a leave (a real stale deploy)", async () => {
    const error = abortedImport("Importing a module script failed.");

    reportRenderError(error, { componentStack: "\n    at Lazy" });
    await settle();

    expect(captureReactException).toHaveBeenCalledWith(error, expect.anything());
  });
});
