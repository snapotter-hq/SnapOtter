/**
 * What a batch reports per file, so it can say what a single run says (#1292):
 * compress's `resizedTo` when it scaled an image down to fit, and the
 * target-size verdict (`targetKb`, `targetMet`) from compress and compress-pdf.
 */
export interface BatchFileNotes {
  resizedTo?: { width: number; height: number };
  targetKb?: number;
  targetMet?: boolean;
}

/**
 * The note for one child's stored result, or undefined when there is nothing
 * to warn about. Only a scaled-down image or a missed target gets one: every
 * target-size result carries targetKb, and sending that for every file would
 * grow X-File-Notes with the batch until a proxy's header buffer overflowed.
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
  if (Object.keys(notes).length === 0) return undefined;
  if (typeof result.targetKb === "number") notes.targetKb = result.targetKb;
  return notes;
}
