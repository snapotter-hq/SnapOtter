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
 * navigating away, which fires the same event. Reloading then reloaded the
 * page being left and cancelled the navigation (#912), so failures that
 * follow a beforeunload are left alone.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHUNK_RELOAD_GUARD_KEY,
  CHUNK_RELOAD_GUARD_MS,
  installChunkReloadHandler,
  isAbortedByLeaving,
  LEAVING_WINDOW_MS,
} from "@/lib/chunk-reload";

function fireChunkErrorWith(payload: unknown): Event {
  const event = Object.assign(new Event("vite:preloadError", { cancelable: true }), { payload });
  window.dispatchEvent(event);
  return event;
}

function fireChunkError(): Event {
  const event = new Event("vite:preloadError", { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

function startLeaving(): void {
  window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
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

  describe("isAbortedByLeaving (#1480)", () => {
    it("recognises exactly the error it left alone while leaving", () => {
      startLeaving();
      const aborted = new TypeError("error loading dynamically imported module: /assets/a.js");
      fireChunkErrorWith(aborted);

      expect(isAbortedByLeaving(aborted)).toBe(true);
      // Same message, different object: a real failure elsewhere still counts.
      expect(isAbortedByLeaving(new TypeError(aborted.message))).toBe(false);
    });

    it("does not mark an error the handler reloaded for", () => {
      const stale = new TypeError("Importing a module script failed.");
      fireChunkErrorWith(stale);

      expect(reload).toHaveBeenCalledTimes(1);
      expect(isAbortedByLeaving(stale)).toBe(false);
    });

    it("ignores payloads that are not objects", () => {
      startLeaving();
      expect(() => fireChunkErrorWith("string payload")).not.toThrow();
      expect(() => fireChunkErrorWith(undefined)).not.toThrow();

      expect(isAbortedByLeaving("string payload")).toBe(false);
      expect(isAbortedByLeaving(undefined)).toBe(false);
      expect(isAbortedByLeaving(null)).toBe(false);
    });
  });

  describe("while the page is being left (#912)", () => {
    it("does not reload, which would cancel the navigation", () => {
      startLeaving();
      vi.advanceTimersByTime(200);
      const event = fireChunkError();

      expect(reload).not.toHaveBeenCalled();
      // Left unhandled: if the navigation was cancelled after all, the
      // boundary shows the real chunk error, not an undefined module.
      expect(event.defaultPrevented).toBe(false);
      // Nothing reloaded, so a real deploy afterwards still gets its reload.
      expect(sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY)).toBeNull();
    });

    it("reloads again once the leaving window has passed (the leave was cancelled)", () => {
      startLeaving();
      vi.advanceTimersByTime(LEAVING_WINDOW_MS + 1);
      fireChunkError();

      expect(reload).toHaveBeenCalledTimes(1);
    });

    it("reloads again after the page comes back from the back/forward cache", () => {
      startLeaving();
      vi.advanceTimersByTime(500);
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
      fireChunkError();

      expect(reload).toHaveBeenCalledTimes(1);
    });

    it("keeps leaving through a pageshow that is not a back/forward restore", () => {
      // A slow first load can still fire load/pageshow while being left.
      startLeaving();
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false }));
      fireChunkError();

      expect(reload).not.toHaveBeenCalled();
    });

    it("removes every listener it added once uninstalled", () => {
      const remove = vi.spyOn(window, "removeEventListener");
      uninstall();

      const removed = remove.mock.calls.map(([type]) => type);
      expect(removed).toEqual(
        expect.arrayContaining(["beforeunload", "pageshow", "vite:preloadError"]),
      );
      remove.mockRestore();
      uninstall = installChunkReloadHandler(reload);
    });
  });

  describe("a leave announced only by the Navigation API (#1479)", () => {
    // iOS Safari never fires beforeunload, so on iPhone and iPad the handler
    // used to reload and cancel the navigation. Verified in the iOS 27
    // Simulator: `navigate` does fire, with a cross-document destination,
    // before the import is aborted.
    let navigation: EventTarget;

    function navigate(init: {
      sameDocument: boolean;
      downloadRequest?: string | null;
      url?: string;
    }): void {
      const event = Object.assign(new Event("navigate"), {
        destination: {
          sameDocument: init.sameDocument,
          url: init.url ?? "https://snapotter.example/logout",
        },
        downloadRequest: init.downloadRequest ?? null,
      });
      navigation.dispatchEvent(event);
    }

    beforeEach(() => {
      uninstall();
      navigation = new EventTarget();
      Object.defineProperty(window, "navigation", { value: navigation, configurable: true });
      uninstall = installChunkReloadHandler(reload);
    });

    afterEach(() => {
      Reflect.deleteProperty(window, "navigation");
    });

    it("does not reload after a cross-document navigation starts", () => {
      navigate({ sameDocument: false });
      vi.advanceTimersByTime(200);
      const event = fireChunkError();

      expect(reload).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });

    it("still reloads after an in-app (same-document) navigation", () => {
      // React Router's pushState navigations fire `navigate` too; the page
      // stays, so a chunk failure there is a real one.
      navigate({ sameDocument: true });
      fireChunkError();

      expect(reload).toHaveBeenCalledTimes(1);
    });

    it("still reloads after a download, which does not leave the page", () => {
      navigate({ sameDocument: false, downloadRequest: "result.zip" });
      fireChunkError();

      expect(reload).toHaveBeenCalledTimes(1);
    });

    it("still reloads after a bare <a download>, whose downloadRequest is an empty string", () => {
      // ResultDownloadLink renders download="" (download={name ?? true}).
      navigate({ sameDocument: false, downloadRequest: "" });
      fireChunkError();

      expect(reload).toHaveBeenCalledTimes(1);
    });

    it("still reloads after a mailto: link, which hands off to another app", () => {
      // Chromium fires a cross-document navigate for mailto: while the page
      // stays put (checked in Chromium 1.61's build; Firefox and WebKit don't).
      navigate({ sameDocument: false, url: "mailto:contact@snapotter.com" });
      fireChunkError();

      expect(reload).toHaveBeenCalledTimes(1);
    });

    it("reloads again once the leaving window has passed", () => {
      navigate({ sameDocument: false });
      vi.advanceTimersByTime(LEAVING_WINDOW_MS + 1);
      fireChunkError();

      expect(reload).toHaveBeenCalledTimes(1);
    });

    it("stops listening to the Navigation API once uninstalled", () => {
      const remove = vi.spyOn(navigation, "removeEventListener");
      uninstall();

      expect(remove).toHaveBeenCalledWith("navigate", expect.any(Function));
      remove.mockRestore();
      uninstall = installChunkReloadHandler(reload);
    });
  });
});
