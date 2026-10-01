import { create } from "zustand";

/**
 * Why a save failed, when the server said. "expired" (the result is gone) and
 * "tooLarge" (over the upload limit) can't succeed on a retry; "quota" can,
 * once the user frees some space. "generic" is everything else (#1350).
 */
export type SaveFailure = "expired" | "quota" | "tooLarge" | "generic";

/** One result's Save to Files attempt. A result with no entry was never saved. */
export type SaveState =
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; failure: SaveFailure };

/** How long a generic error label stays up before the button comes back. */
export const GENERIC_ERROR_RESET_MS = 3000;

interface SaveToFilesState {
  /** Keyed by the result's download URL, which is unique per job and entry. */
  byUrl: Readonly<Record<string, SaveState>>;
  saving: (url: string) => void;
  saved: (url: string) => void;
  failed: (url: string, failure: SaveFailure) => void;
  reset: () => void;
}

// A generic error resets itself. One timer per result: a retry clears that
// result's pending reset, or it would flip the retry's "Saved" back to an
// enabled button and invite a duplicate save.
const resetTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearResetTimer(url: string) {
  clearTimeout(resetTimers.get(url));
  resetTimers.delete(url);
}

/**
 * Save to Files state per result (#1502). It lives outside the review panel
 * because the panel isn't remounted when the selection moves, and is unmounted
 * on a result with nothing to show (a failed batch entry): a save that ends
 * meanwhile still lands on the result it was for, and coming back to a saved
 * result still says so.
 */
export const useSaveToFilesStore = create<SaveToFilesState>((set) => {
  const put = (url: string, state: SaveState | null) =>
    set(({ byUrl }) => {
      const next = { ...byUrl };
      if (state) next[url] = state;
      else delete next[url];
      return { byUrl: next };
    });

  return {
    byUrl: {},
    saving: (url) => {
      clearResetTimer(url);
      put(url, { status: "saving" });
    },
    saved: (url) => {
      clearResetTimer(url);
      put(url, { status: "saved" });
    },
    failed: (url, failure) => {
      clearResetTimer(url);
      put(url, { status: "error", failure });
      // A reason stays on screen: it tells the user what to do, and a reset
      // would hand back a button that fails the same way.
      if (failure !== "generic") return;
      resetTimers.set(
        url,
        setTimeout(() => {
          resetTimers.delete(url);
          put(url, null);
        }, GENERIC_ERROR_RESET_MS),
      );
    },
    reset: () => {
      for (const timer of resetTimers.values()) clearTimeout(timer);
      resetTimers.clear();
      set({ byUrl: {} });
    },
  };
});
