// @vitest-environment jsdom

/**
 * Regression coverage for Sentry WEB-8/WEB-5/WEB-S/WEB-1: after a container
 * update, an open tab's next lazy route import requests a chunk hash that no
 * longer exists, the import rejects, and the app is dead until the user
 * reloads by hand. Vite reports exactly this as a window "vite:preloadError"
 * event; the handler reloads once, with a guard so a genuinely broken server
 * cannot cause a reload loop.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHUNK_RELOAD_GUARD_KEY,
  CHUNK_RELOAD_GUARD_MS,
  installChunkReloadHandler,
} from "@/lib/chunk-reload";

function fireChunkError(): Event {
  const event = new Event("vite:preloadError", { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

describe("installChunkReloadHandler", () => {
  let reload: ReturnType<typeof vi.fn>;
  let uninstall: () => void;

  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T12:00:00Z"));
    reload = vi.fn();
    uninstall = installChunkReloadHandler(reload);
  });

  afterEach(() => {
    uninstall();
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it("reloads once on a chunk preload error and marks the event handled", () => {
    const event = fireChunkError();

    expect(reload).toHaveBeenCalledTimes(1);
    // preventDefault stops Vite from rethrowing the error into the boundary.
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not reload again within the guard window (broken server, not an update)", () => {
    fireChunkError();
    vi.advanceTimersByTime(1000);
    const second = fireChunkError();

    expect(reload).toHaveBeenCalledTimes(1);
    // The second failure is left to propagate so the error boundary shows.
    expect(second.defaultPrevented).toBe(false);
  });

  it("reloads again after the guard window has passed (a later, separate update)", () => {
    fireChunkError();
    vi.advanceTimersByTime(CHUNK_RELOAD_GUARD_MS + 1000);
    fireChunkError();

    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("persists the guard across the reload via sessionStorage", () => {
    fireChunkError();
    expect(sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY)).not.toBeNull();

    // Simulate the post-reload page: a fresh handler, same sessionStorage.
    uninstall();
    const reloadAfter = vi.fn();
    uninstall = installChunkReloadHandler(reloadAfter);
    fireChunkError();

    expect(reloadAfter).not.toHaveBeenCalled();
  });

  it("still reloads when sessionStorage is unavailable (Safari private mode)", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    fireChunkError();
    expect(reload).toHaveBeenCalledTimes(1);

    setItem.mockRestore();
    getItem.mockRestore();
  });
});
