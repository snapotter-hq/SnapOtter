/**
 * Self-heal for stale-deploy chunk failures (Sentry WEB-8/WEB-5/WEB-S/WEB-1).
 *
 * Every page component is lazy()-loaded with hashed filenames. When the
 * container updates under an open tab, the tab's next route navigation
 * requests a chunk that no longer exists, the dynamic import rejects, and
 * the ErrorBoundary shows a crash screen until the user reloads by hand.
 * Vite surfaces exactly this case as a window "vite:preloadError" event.
 *
 * The handler reloads the page once. The guard (persisted in sessionStorage
 * so it survives the reload it triggers) makes a second failure inside the
 * window fall through to the error boundary instead of looping: chunks that
 * are still missing after a fresh load mean the server is broken, not
 * updated.
 *
 * Firefox and Safari also abort in-flight imports when the page starts
 * navigating away, which raises the same event. Reloading then reloads the
 * page being left and cancels the navigation (#912), so failures that follow
 * a beforeunload are left alone. Vite needs the answer synchronously, and
 * beforeunload is the first step of every cross-document navigation. The
 * listener costs Firefox's back/forward cache for these pages; in-app
 * navigation is pushState, so only cross-document history pays for it.
 */

export const CHUNK_RELOAD_GUARD_KEY = "snapotter-chunk-reload-at";
export const CHUNK_RELOAD_GUARD_MS = 30_000;
// How long after beforeunload a chunk failure is blamed on the navigation.
// There is no event for a cancelled leave, so this is what ends it.
export const LEAVING_WINDOW_MS = 10_000;

function readLastReloadAt(): number {
  try {
    return Number(sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) ?? 0);
  } catch {
    return 0; // storage blocked (private mode): reload without a guard record
  }
}

function markReloadedNow(): void {
  try {
    sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    // storage blocked: the reload still happens, only loop protection is lost
  }
}

/** Returns an uninstall function (used by tests; the app installs once for its lifetime). */
export function installChunkReloadHandler(
  reload: () => void = () => window.location.reload(),
): () => void {
  let leavingAt = Number.NEGATIVE_INFINITY;
  const onBeforeUnload = () => {
    leavingAt = Date.now();
  };
  // A page restored from the back/forward cache is no longer being left.
  const onPageShow = () => {
    leavingAt = Number.NEGATIVE_INFINITY;
  };
  const onPreloadError = (event: Event) => {
    // Unhandled on purpose: if the leave is cancelled after all, the error
    // boundary shows the real chunk error rather than an undefined module.
    if (Date.now() - leavingAt < LEAVING_WINDOW_MS) return;
    if (Date.now() - readLastReloadAt() < CHUNK_RELOAD_GUARD_MS) return;
    markReloadedNow();
    // Handled here: stop Vite from rethrowing into the error boundary.
    event.preventDefault();
    reload();
  };
  window.addEventListener("beforeunload", onBeforeUnload);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("vite:preloadError", onPreloadError);
  return () => {
    window.removeEventListener("beforeunload", onBeforeUnload);
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("vite:preloadError", onPreloadError);
  };
}
