import { create } from "zustand";
import type { Base64Result } from "@/stores/base64-store";
import type { DuplicateResult } from "@/stores/duplicate-store";
import type { GenerateResult } from "@/stores/passport-photo-store";
import type { PageResult } from "@/stores/pdf-to-image-store";
import type { TileInfo } from "@/stores/split-store";

/**
 * Which result each own-store tool has had taken, keyed by tool id, valued by
 * that result's identity. A new run changes the identity, so the claim stops
 * matching and the guard speaks up again without any store having to remember
 * to clear anything. Same rule the file store enforces through updateEntry.
 *
 * A boolean per store would need every one of those stores to clear it at the
 * start of every run, and a missed reset there leaves a claim standing over a
 * result the user has never seen: the guard goes quiet on real work, which is
 * the failure direction that costs something.
 */

/**
 * A result's identity.
 *
 * A string where the store holds one that changes per run: these download urls
 * carry a job id minted per request, and a blob url is minted per blob. The
 * result object itself where it does not, because a fresh run always parses a
 * fresh object, and reference identity separates runs that content cannot
 * (rescanning the same folder twice produces byte-identical output, and
 * passport-photo regenerates under the upload's job id, so its url repeats).
 *
 * null means no result, which is also how the guard asks "is there anything
 * here to lose": a null key is never unclaimed.
 */
export type ResultKey = string | object | null;

/**
 * How a claim is kept: strings as themselves, objects behind a WeakRef.
 *
 * tool-page resets most of these stores on tool navigation, which would leave
 * this map the only thing still holding the result. For image-to-base64 that is
 * every base64 and dataUri string of the last batch, pinned for the rest of the
 * session. The WeakRef costs nothing in behaviour: while the store still holds
 * the result the ref resolves, and once the store has dropped it the guard's
 * key is null, so a dead ref can never disagree with a live one.
 */
type StoredKey = string | WeakRef<object>;

interface ToolResultClaimsState {
  /** Tool id -> the identity of the result that tool has had taken. */
  claimed: Record<string, StoredKey>;
  claim: (toolId: string, key: ResultKey) => void;
  reset: () => void;
}

/** Whether a stored claim still stands for this result. */
function matches(stored: StoredKey | undefined, key: ResultKey): boolean {
  if (key === null || stored === undefined) return false;
  if (typeof key === "string") return stored === key;
  // A ref whose result has been collected resolves to undefined, which is not
  // the live key and so does not match.
  return typeof stored !== "string" && stored.deref() === key;
}

export const useToolResultClaims = create<ToolResultClaimsState>((set) => ({
  claimed: {},

  claim: (toolId, key) =>
    set((s) =>
      // Nothing to claim, or claimed already: leave the map alone so a second
      // click on the same download does not re-render everything reading it.
      key === null || matches(s.claimed[toolId], key)
        ? s
        : {
            claimed: {
              ...s.claimed,
              [toolId]: typeof key === "string" ? key : new WeakRef(key),
            },
          },
    ),

  reset: () => set({ claimed: {} }),
}));

/**
 * Record that the user has taken this result, so the navigation guard stops
 * warning about it. Call it from a control that hands over the whole result: a
 * download click, a copy that succeeded, the zip of everything a run produced.
 *
 * NOT from a per-item control. A claim is per tool, so the tile, page or file a
 * user saved one of many would answer for the ones they never took, and silence
 * about work nobody has seen is the failure this guard exists to prevent. The
 * file store can claim a batch zip across every entry (markBatchClaimed)
 * because the zip really does contain all of them; one tile does not. Per-item
 * granularity is the right long-term answer. Until then those controls claim
 * nothing and the guard asks again, which is the safe way to be wrong.
 */
export function claimToolResult(toolId: string, key: ResultKey): void {
  useToolResultClaims.getState().claim(toolId, key);
}

/** Whether a result is sitting there that the user has not taken. */
export function isUnclaimed(key: ResultKey, claimed: StoredKey | undefined): boolean {
  return key !== null && !matches(claimed, key);
}

// -- Result keys ------------------------------------------------------------
//
// One per own-store tool, called from both sides: the guard asks what is on the
// page, the download control says what it just handed over. Sharing the
// function is what stops the two spelling a result differently.

/** The collage, once a run has produced one. Its url carries a fresh job id. */
export function collageResultKey(resultUrl: string | null): ResultKey {
  return resultUrl;
}

/**
 * The duplicate report. Scanning the same files twice produces identical
 * content, so this keys on the object a scan parsed rather than on what is in
 * it: a rescan is a new result even when it reads the same.
 */
export function duplicateResultKey(results: DuplicateResult | null): ResultKey {
  return results;
}

/** The captured screenshot. Its url carries a fresh job id. */
export function htmlToImageResultKey(resultUrl: string | null): ResultKey {
  return resultUrl;
}

/**
 * The encoded files. Keyed on the array a run built, since re-encoding the same
 * image produces the same text; the store replaces the array per run.
 */
export function base64ResultKey(results: Base64Result[]): ResultKey {
  return results.length > 0 ? results : null;
}

/** The generated meme. Its url carries a fresh job id. */
export function memeResultKey(resultUrl: string | null): ResultKey {
  return resultUrl;
}

/**
 * The generated passport photo.
 *
 * NOT its downloadUrl: generate writes under the jobId the upload was analyzed
 * as (`outputs/<jobId>/<name>_passport.jpg`), so regenerating after a nudge to
 * the crop or a change of country hands back the same url for a different
 * photo. Keying on the url would leave the first claim standing over the
 * second photo and the guard silent on it.
 */
export function passportPhotoResultKey(generateResult: GenerateResult | null): ResultKey {
  return generateResult;
}

/**
 * The converted pages, or the zip of them. One response carries both, so the
 * pages identify the whole set and the zip url stands in for a run that landed
 * nothing else. Only the zip control claims this; a single page does not.
 */
export function pdfToImageResultKey(
  results: PageResult[] | null,
  zipUrl: string | null,
): ResultKey {
  return results && results.length > 0 ? results : zipUrl;
}

/**
 * The tiles, or the zip of them. One run produces both, so the tiles identify
 * the set: zipping does not change what the user has already taken. Only the
 * zip control claims this; a single tile does not.
 */
export function splitResultKey(tiles: TileInfo[], zipBlobUrl: string | null): ResultKey {
  return tiles.length > 0 ? tiles : zipBlobUrl;
}
