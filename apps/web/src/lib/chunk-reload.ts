/**
 * Self-heal for stale-deploy chunk failures (Sentry WEB-8/WEB-5/WEB-S/WEB-1).
 *
 * Every page component is lazy()-loaded with hashed filenames. When the
 * container updates under an open tab, the tab's next route navigation
 * requests a chunk that no longer exists, the dynamic import rejects, and
 * the ErrorBoundary shows a crash screen until the user reloads by hand.
 * Vite surfaces exactly this case as a window "vite:preloadError" event.
 *
 * Firefox and Safari fire the same event when the page starts navigating
 * away with an import still in flight: they abort it. Reloading then would
 * reload the page being left and cancel the navigation (#912), so the
 * handler first checks that the server now serves a different build, and
 * reloads only then.
 *
 * The handler reloads once. The guard (persisted in sessionStorage so it
 * survives the reload it triggers) makes a second failure inside the window
 * fall through to the error boundary instead of looping: chunks that are
 * still missing after a fresh load mean the server is broken, not updated.
 */

import { appUrl } from "./app-url";

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

function entryScriptSrc(doc: Document): string | null {
  return doc.querySelector('script[type="module"][src]')?.getAttribute("src") ?? null;
}

/**
 * True when a fresh copy of the app shell boots a different entry script
 * than this page did, i.e. a reload would load a newer build. Every build
 * hashes its entry, and the entry names every lazy chunk, so a deploy that
 * removed a chunk always changes it. A response that isn't the shell (an
 * HTTP error, a proxy's error page) is false: a reload would not reach the
 * app either. A failed request rejects.
 */
export async function servedBuildDiffers(fetchShell: typeof fetch = fetch): Promise<boolean> {
  const res = await fetchShell(appUrl("/"), { cache: "no-store" });
  if (!res.ok) return false;
  const served = entryScriptSrc(new DOMParser().parseFromString(await res.text(), "text/html"));
  return served !== null && served !== entryScriptSrc(document);
}

/** Returns an uninstall function (used by tests; the app installs once for its lifetime). */
export function installChunkReloadHandler(
  reload: () => void = () => window.location.reload(),
  isStaleBuild: () => Promise<boolean> = servedBuildDiffers,
): () => void {
  const onPreloadError = (event: Event) => {
    if (Date.now() - readLastReloadAt() < CHUNK_RELOAD_GUARD_MS) return;
    // Handled here: stop Vite from rethrowing into the error boundary. Vite
    // needs the answer synchronously, before the build check can finish.
    event.preventDefault();
    isStaleBuild().then(
      (stale) => {
        if (!stale) return;
        markReloadedNow();
        reload();
      },
      // The check's own request failed. The page is most likely being left
      // (#912), and otherwise a reload could not reach the server either.
      () => {},
    );
  };
  window.addEventListener("vite:preloadError", onPreloadError);
  return () => window.removeEventListener("vite:preloadError", onPreloadError);
}
