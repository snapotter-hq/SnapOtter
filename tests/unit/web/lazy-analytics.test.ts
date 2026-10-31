// @vitest-environment jsdom

/**
 * #4141: a fire-and-forget analytics call must never reload the page. After a
 * deploy the analytics chunk can be gone; Vite fires vite:preloadError before
 * the importer's catch runs, and the chunk-reload handler used to reload the
 * tab under the user's files.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("withAnalytics", () => {
  let reload: ReturnType<typeof vi.fn>;
  let uninstall: () => void;

  beforeEach(async () => {
    sessionStorage.clear();
    vi.resetModules();
    // Same module instance as lazy-analytics gets, or the in-flight count is not shared.
    const { installChunkReloadHandler } = await import("@/lib/chunk-reload");
    reload = vi.fn();
    uninstall = installChunkReloadHandler(reload);
  });

  afterEach(() => {
    uninstall();
    sessionStorage.clear();
    vi.doUnmock("@/lib/analytics");
  });

  it("hands the analytics module to the callback", async () => {
    vi.doMock("@/lib/analytics", () => ({ track: vi.fn() }));
    const { withAnalytics } = await import("@/lib/lazy-analytics");
    const use = vi.fn();

    withAnalytics(use);

    await vi.waitFor(() => expect(use).toHaveBeenCalledTimes(1));
    expect(use.mock.calls[0][0]).toHaveProperty("track");
  });

  it("skips the call and does not reload when the analytics chunk is gone (#4141)", async () => {
    const error = new Error("Failed to fetch dynamically imported module");
    let event: Event | undefined;
    vi.doMock("@/lib/analytics", () => {
      // Vite reports the failed chunk on window before the import rejects.
      event = Object.assign(new Event("vite:preloadError", { cancelable: true }), {
        payload: error,
      });
      window.dispatchEvent(event);
      throw error;
    });
    const { withAnalytics } = await import("@/lib/lazy-analytics");
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const use = vi.fn();

    withAnalytics(use);
    await vi.waitFor(() => expect(event).toBeDefined());
    await new Promise((resolve) => setTimeout(resolve, 20));
    process.off("unhandledRejection", unhandled);

    expect(use).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(event?.defaultPrevented).toBe(false);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
