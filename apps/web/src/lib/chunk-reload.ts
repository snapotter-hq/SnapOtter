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
 */

export const CHUNK_RELOAD_GUARD_KEY = "snapotter-chunk-reload-at";
export const CHUNK_RELOAD_GUARD_MS = 30_000;

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
  const onPreloadError = (event: Event) => {
    if (Date.now() - readLastReloadAt() < CHUNK_RELOAD_GUARD_MS) return;
    markReloadedNow();
    // Handled here: stop Vite from rethrowing into the error boundary.
    event.preventDefault();
    reload();
  };
  window.addEventListener("vite:preloadError", onPreloadError);
  return () => window.removeEventListener("vite:preloadError", onPreloadError);
}
