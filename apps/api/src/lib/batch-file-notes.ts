import { FILE_NOTES_ALL_FILES } from "@snapotter/shared";

/**
 * What a batch reports per file, so it can say what a single run says (#1292):
 * compress's `resizedTo` when it scaled an image down to fit, the
 * target-size verdict (`targetKb`, `targetMet`) from compress and compress-pdf,
 * and image-enhancement's `deepEnhanceSkipped` when Deep Enhance didn't run
 * (#1303).
 */
export interface BatchFileNotes {
  resizedTo?: { width: number; height: number };
  targetKb?: number;
  targetMet?: boolean;
  deepEnhanceSkipped?: DeepEnhanceSkipReason;
}

/** Why image-enhancement's requested Deep Enhance pass didn't run (#950). */
export type DeepEnhanceSkipReason = "failed" | "unavailable" | "animated";

const DEEP_ENHANCE_SKIP_REASONS: ReadonlySet<string> = new Set([
  "failed",
  "unavailable",
  "animated",
]);

/**
 * The note for one child's stored result, or undefined when there is nothing
 * to warn about. Only a scaled-down image, a missed target, or a skipped Deep
 * Enhance gets one: every target-size result carries targetKb, and sending
 * that for every file would grow X-File-Notes with the batch until a proxy's
 * header buffer overflowed. A skipped Deep Enhance often does apply to every
 * file (the bundle isn't installed), which compactFileNotes handles.
 */
export function pickBatchFileNotes(
  result: Record<string, unknown> | null | undefined,
): BatchFileNotes | undefined {
  if (!result) return undefined;
  const notes: BatchFileNotes = {};
  const resized = result.resizedTo as { width?: unknown; height?: unknown } | undefined;
  if (resized && typeof resized.width === "number" && typeof resized.height === "number") {
    notes.resizedTo = { width: resized.width, height: resized.height };
  }
  if (result.targetMet === false) notes.targetMet = false;
  const skipped = result.deepEnhanceSkipped;
  if (typeof skipped === "string" && DEEP_ENHANCE_SKIP_REASONS.has(skipped)) {
    notes.deepEnhanceSkipped = skipped as DeepEnhanceSkipReason;
  }
  if (Object.keys(notes).length === 0) return undefined;
  if (typeof result.targetKb === "number") notes.targetKb = result.targetKb;
  return notes;
}

/**
 * The X-File-Notes map as sent in the header: a single FILE_NOTES_ALL_FILES
 * entry when every file with a result carries the same note, otherwise the
 * per-file map unchanged. A batch of 500 files the bundle can't deep-enhance
 * would otherwise send 500 identical notes (about 35 KB once URL-encoded) and
 * trip a proxy's header limit. The durable row keeps the full map.
 */
export function compactFileNotes(
  fileNotes: Record<string, BatchFileNotes>,
  fileResults: Record<string, string>,
): Record<string, BatchFileNotes> {
  const keys = Object.keys(fileResults);
  if (keys.length < 2) return fileNotes;
  const first = fileNotes[keys[0]];
  if (!first) return fileNotes;
  const shape = JSON.stringify(first);
  if (keys.some((key) => JSON.stringify(fileNotes[key]) !== shape)) return fileNotes;
  return { [FILE_NOTES_ALL_FILES]: first };
}
