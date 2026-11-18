import { InputValidationError } from "../modality/contract.js";

/** Codes the web app translates; prose gets reworded, these don't. */
export const PAGE_OUT_OF_RANGE = "PAGE_OUT_OF_RANGE";
export const INVALID_PAGE_RANGE = "INVALID_PAGE_RANGE";

function outOfRange(message: string): InputValidationError {
  return new InputValidationError(message, 400, undefined, PAGE_OUT_OF_RANGE);
}

function invalidRange(message: string): InputValidationError {
  return new InputValidationError(message, 400, undefined, INVALID_PAGE_RANGE);
}

/**
 * Pure helper: expand a human-friendly page specification into a Set of
 * 1-based page numbers. Handles single pages (N), ranges (N-M), reverse
 * indices (rN = total - N + 1), the "z" alias for the last page, and
 * comma-separated combinations.
 *
 * Throws a 400 InputValidationError on out-of-range references, malformed
 * tokens, or empty specs: every one of them is the user's input.
 */
export function parsePageSpec(spec: string, total: number): Set<number> {
  if (!Number.isInteger(total) || total < 1) {
    throw new Error("Total page count must be a positive integer");
  }

  const result = new Set<number>();
  const parts = spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    throw invalidRange("Empty page specification");
  }

  for (const part of parts) {
    if (part.includes("-")) {
      const bounds = part.split("-");
      if (bounds.length !== 2) throw invalidRange(`Invalid page range: ${part.slice(0, 50)}`);
      const start = resolveToken(bounds[0], total);
      const end = resolveToken(bounds[1], total);
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      for (let i = lo; i <= hi; i++) {
        result.add(i);
      }
    } else {
      result.add(resolveToken(part, total));
    }
  }

  return result;
}

/**
 * Check a qpdf page spec against the document before qpdf sees it. qpdf
 * rejects a page past the end with exit 2 and its own stderr, which used to
 * surface as a 500-class "Processing failed" and a Sentry bug (NODE-A4).
 */
export function assertPageSpecInRange(spec: string, total: number): void {
  parsePageSpec(spec, total);
}

/**
 * Collapse a sorted-ascending array of page numbers into the most compact
 * qpdf range string by merging consecutive runs into N-M parts.
 *
 * Examples:
 *   [2,3,4,...,80] -> "2-80"
 *   [1,3,5,7]      -> "1,3,5,7"
 *   [1,2,4,5,6,9]  -> "1-2,4-6,9"
 *   []              -> ""
 *   [3]             -> "3"
 *
 * The input MUST be sorted ascending with no duplicates (as produced by
 * iterating 1..total and filtering).
 */
export function compressPageRuns(pages: number[]): string {
  if (pages.length === 0) return "";

  const parts: string[] = [];
  let runStart = pages[0];
  let runEnd = pages[0];

  for (let i = 1; i < pages.length; i++) {
    if (pages[i] === runEnd + 1) {
      runEnd = pages[i];
    } else {
      parts.push(runStart === runEnd ? `${runStart}` : `${runStart}-${runEnd}`);
      runStart = pages[i];
      runEnd = pages[i];
    }
  }

  parts.push(runStart === runEnd ? `${runStart}` : `${runStart}-${runEnd}`);
  return parts.join(",");
}

function resolveToken(token: string, total: number): number {
  const t = token.trim().toLowerCase();
  let page: number;

  if (t === "z") {
    page = total;
  } else if (/^r\d+$/.test(t)) {
    const n = Number.parseInt(t.slice(1), 10);
    if (n < 1) throw invalidRange(`Invalid reverse page index: ${token.slice(0, 20)}`);
    page = total - n + 1;
    if (page < 1) {
      throw outOfRange(`Page ${token.trim()} is out of range for a ${total}-page document`);
    }
  } else if (/^\d+$/.test(t)) {
    page = Number.parseInt(t, 10);
    if (page < 1) throw outOfRange(`Page ${page} is out of range for a ${total}-page document`);
  } else {
    throw invalidRange(`Invalid page number: ${token.slice(0, 20)}`);
  }

  if (page > total) {
    throw outOfRange(`Page ${page} is out of range for a ${total}-page document`);
  }

  return page;
}
