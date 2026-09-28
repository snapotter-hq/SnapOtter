import type { ResultNotes } from "@/stores/file-store";

/**
 * The per-file notes a result carries beyond the file itself (#1292): compress's
 * resizedTo, the target-size verdict from compress and compress-pdf, and Image
 * Enhancement's skipped Deep Enhance (#1303). Takes a single run's result or one
 * entry of a batch's fileNotes map; anything else in the object is ignored, and
 * malformed fields are dropped rather than trusted.
 */
export function pickResultNotes(source: unknown): ResultNotes | null {
  if (!source || typeof source !== "object") return null;
  const raw = source as Record<string, unknown>;
  const notes: ResultNotes = {};
  const resized = raw.resizedTo as { width?: unknown; height?: unknown } | undefined;
  if (resized && typeof resized.width === "number" && typeof resized.height === "number") {
    notes.resizedTo = { width: resized.width, height: resized.height };
  }
  if (typeof raw.targetKb === "number") notes.targetKb = raw.targetKb;
  if (typeof raw.targetMet === "boolean") notes.targetMet = raw.targetMet;
  const skipped = raw.deepEnhanceSkipped;
  if (skipped === "failed" || skipped === "unavailable" || skipped === "animated") {
    notes.deepEnhanceSkipped = skipped;
  }
  return Object.keys(notes).length > 0 ? notes : null;
}

/** A batch's notes map, or an empty one when the value isn't a plain object. */
export function asNotesMap(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Decode the batch route's X-File-Notes header. A missing header (a server
 * from before #1292) is no notes. Anything that doesn't decode to an object is
 * logged and treated as no notes, so the results still settle.
 */
export function parseFileNotesHeader(header: string | null): Record<string, unknown> {
  if (header == null) return {};
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(header));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    console.warn("Ignoring X-File-Notes that isn't an object", parsed);
  } catch (err) {
    console.warn("Ignoring unparseable X-File-Notes", err);
  }
  return {};
}

/** A result worth flagging: scaled down to fit, or short of its size target. */
export function hasResultWarning(notes: ResultNotes | null | undefined): boolean {
  return notes?.resizedTo != null || notes?.targetMet === false;
}
