// @vitest-environment jsdom

/**
 * Regression coverage for Sentry WEB-8/WEB-5/WEB-S/WEB-1: after a container
 * update, an open tab's next lazy route import requests a chunk hash that no
 * longer exists, the import rejects, and the app is dead until the user
 * reloads by hand. Vite reports exactly this as a window "vite:preloadError"
 * event; the handler reloads once, with a guard so a genuinely broken server
 * cannot cause a reload loop.
 *
 * Firefox and Safari also reject in-flight imports when the page starts
 * navigating away, which fires the same event. Reloading then reloads the
 * page being left and cancels the navigation (#912), so the handler only
 * reloads once the server is shown to serve a different build.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHUNK_RELOAD_GUARD_KEY,
  CHUNK_RELOAD_GUARD_MS,
  installChunkReloadHandler,
  servedBuildDiffers,
} from "@/lib/chunk-reload";

function fireChunkError(): Event {
  const event = new Event("vite:preloadError", { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

/** Let the handler's async build check settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe("installChunkReloadHandler", () => {
  let reload: ReturnType<typeof vi.fn>;
  let isStale: ReturnType<typeof vi.fn>;
  let uninstall: () => void;

  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T12:00:00Z"));
    reload = vi.fn();
    isStale = vi.fn().mockResolvedValue(true);
    uninstall = installChunkReloadHandler(reload, isStale);
  });

  afterEach(() => {
    uninstall();
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it("reloads once on a chunk preload error and marks the event handled", async () => {
    const event = fireChunkError();
    // preventDefault stops Vite from rethrowing the error into the boundary.
    expect(event.defaultPrevented).toBe(true);

    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload when the server still serves the build this page loaded (#912)", async () => {
    // A navigation away aborted the import: reloading would cancel it.
    isStale.mockResolvedValue(false);

    fireChunkError();
    await settle();

    expect(reload).not.toHaveBeenCalled();
    // No reload happened, so a later real deploy must still get one.
    expect(sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY)).toBeNull();
  });

  it("does not reload when the build check itself fails (#912)", async () => {
    // Firefox aborts the check's own fetch while the page is being left.
    isStale.mockRejectedValue(new TypeError("NetworkError when attempting to fetch resource."));

    fireChunkError();
    await settle();

    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload again within the guard window (broken server, not an update)", async () => {
    fireChunkError();
    await settle();
    vi.advanceTimersByTime(1000);
    const second = fireChunkError();
    await settle();

    expect(reload).toHaveBeenCalledTimes(1);
    // The second failure is left to propagate so the error boundary shows.
    expect(second.defaultPrevented).toBe(false);
  });

  it("reloads again after the guard window has passed (a later, separate update)", async () => {
    fireChunkError();
    await settle();
    vi.advanceTimersByTime(CHUNK_RELOAD_GUARD_MS + 1000);
    fireChunkError();
    await settle();

    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("persists the guard across the reload via sessionStorage", async () => {
    fireChunkError();
    await settle();
    expect(sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY)).not.toBeNull();

    // Simulate the post-reload page: a fresh handler, same sessionStorage.
    uninstall();
    const reloadAfter = vi.fn();
    uninstall = installChunkReloadHandler(reloadAfter, isStale);
    fireChunkError();
    await settle();

    expect(reloadAfter).not.toHaveBeenCalled();
  });

  it("still reloads when sessionStorage is unavailable (Safari private mode)", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    fireChunkError();
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);

    setItem.mockRestore();
    getItem.mockRestore();
  });
});

describe("servedBuildDiffers", () => {
  const shell = (entry: string) =>
    `<!doctype html><html><head><base href="/"><script type="module" crossorigin src="${entry}"></script></head><body><div id="root"></div></body></html>`;

  function htmlResponse(body: string, status = 200): Response {
    return new Response(body, { status, headers: { "content-type": "text/html" } });
  }

  beforeEach(() => {
    document.head.innerHTML = `<script type="module" crossorigin src="/assets/index-OLD.js"></script>`;
  });

  afterEach(() => {
    document.head.innerHTML = "";
  });

  it("is true when the served shell boots a different entry (a deploy happened)", async () => {
    const fetchShell = vi.fn().mockResolvedValue(htmlResponse(shell("/assets/index-NEW.js")));

    await expect(servedBuildDiffers(fetchShell)).resolves.toBe(true);
    // The shell must bypass the HTTP cache, or a cached copy hides the deploy.
    expect(fetchShell).toHaveBeenCalledWith("/", { cache: "no-store" });
  });

  it("is false when the served shell boots the same entry", async () => {
    const fetchShell = vi.fn().mockResolvedValue(htmlResponse(shell("/assets/index-OLD.js")));

    await expect(servedBuildDiffers(fetchShell)).resolves.toBe(false);
  });

  it("is false when the shell request fails with an HTTP error", async () => {
    const fetchShell = vi.fn().mockResolvedValue(htmlResponse("Bad gateway", 502));

    await expect(servedBuildDiffers(fetchShell)).resolves.toBe(false);
  });

  it("is false when the response is not the app shell (no entry script)", async () => {
    // A proxy error page with a 200: reloading would land on it, not the app.
    const fetchShell = vi
      .fn()
      .mockResolvedValue(htmlResponse("<html><body>Maintenance</body></html>"));

    await expect(servedBuildDiffers(fetchShell)).resolves.toBe(false);
  });

  it("rejects when the shell request itself fails", async () => {
    const fetchShell = vi.fn().mockRejectedValue(new TypeError("Load failed"));

    await expect(servedBuildDiffers(fetchShell)).rejects.toThrow("Load failed");
  });
});
