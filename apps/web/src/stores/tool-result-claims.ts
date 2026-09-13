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
 *
 * Holding the object keeps it reachable after the store has moved on, so a
 * claimed result outlives the run that made it. The ceiling is one per
 * own-store tool, replaced by that tool's next claim.
 */
export type ResultKey = string | object | null;

interface ToolResultClaimsState {
  /** Tool id -> the identity of the result that tool has had taken. */
  claimed: Record<string, ResultKey>;
  claim: (toolId: string, key: ResultKey) => void;
  reset: () => void;
}

export const useToolResultClaims = create<ToolResultClaimsState>((set) => ({
  claimed: {},

  claim: (toolId, key) =>
    set((s) =>
      // Nothing to claim, or claimed already: leave the map alone so a second
      // click on the same download does not re-render everything reading it.
      key === null || Object.is(s.claimed[toolId], key)
        ? s
        : { claimed: { ...s.claimed, [toolId]: key } },
    ),

  reset: () => set({ claimed: {} }),
}));

/**
 * Record that the user has taken this result, so the navigation guard stops
 * warning about it. Call it from wherever the file is handed over: a download
 * click, a copy that succeeded.
 *
 * Where a run leaves several artifacts (split's tiles and their zip,
 * pdf-to-image's pages and theirs), they share one key, so taking any of them
 * claims the set. That is how the file store already treats a batch zip:
 * markBatchClaimed claims every entry behind it.
 */
export function claimToolResult(toolId: string, key: ResultKey): void {
  useToolResultClaims.getState().claim(toolId, key);
}

/** Whether a result is sitting there that the user has not taken. */
export function isUnclaimed(key: ResultKey, claimed: ResultKey | undefined): boolean {
  return key !== null && !Object.is(key, claimed);
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
 * nothing else.
 */
export function pdfToImageResultKey(
  results: PageResult[] | null,
  zipUrl: string | null,
): ResultKey {
  return results && results.length > 0 ? results : zipUrl;
}

/**
 * The tiles, or the zip of them. One run produces both, so the tiles identify
 * the set: zipping does not change what the user has already taken.
 */
export function splitResultKey(tiles: TileInfo[], zipBlobUrl: string | null): ResultKey {
  return tiles.length > 0 ? tiles : zipBlobUrl;
}
