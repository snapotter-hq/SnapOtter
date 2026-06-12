/**
 * Pure helper: expand a human-friendly page specification into a Set of
 * 1-based page numbers. Handles single pages (N), ranges (N-M), reverse
 * indices (rN = total - N + 1), the "z" alias for the last page, and
 * comma-separated combinations.
 *
 * Throws on out-of-range references or empty specs.
 */
export function parsePageSpec(spec: string, total: number): Set<number> {
  if (total < 1) throw new Error("Total page count must be at least 1");

  const result = new Set<number>();
  const parts = spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    throw new Error("Empty page specification");
  }

  for (const part of parts) {
    if (part.includes("-")) {
      const [startRaw, endRaw] = part.split("-", 2);
      const start = resolveToken(startRaw, total);
      const end = resolveToken(endRaw, total);
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
  } else if (t.startsWith("r")) {
    const n = Number.parseInt(t.slice(1), 10);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error(`Invalid reverse page index: ${token}`);
    }
    page = total - n + 1;
    if (page < 1) {
      throw new Error(
        `Reverse index ${token} resolves to page ${page}, out of range for ${total} pages`,
      );
    }
  } else {
    page = Number.parseInt(t, 10);
    if (!Number.isFinite(page) || page < 1) {
      throw new Error(`Invalid page number: ${token}`);
    }
  }

  if (page < 1 || page > total) {
    throw new Error(`Page ${page} out of range for a ${total}-page document`);
  }

  return page;
}
