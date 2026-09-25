/**
 * qpdf page-spec serialization for the Organize PDF tool.
 *
 * The API takes a qpdf `--pages` spec ("3,1,2", "5-20") capped at 200
 * characters, so a naive one-number-per-page list stops fitting somewhere
 * around page 50. Collapsing consecutive runs into ranges keeps the edits
 * people actually make (move a page, pull a section to the front, reverse a
 * chapter) comfortably inside the cap.
 */

/** Longest spec the API accepts (`rangeField` in routes/tools/organize-pdf.ts). */
export const MAX_ORDER_LENGTH = 200;

/** Shortest run worth writing as a range. "1-2" and "1,2" are both 3 chars. */
const MIN_RANGE_RUN = 3;

/**
 * Collapse a 1-based page order into the shortest equivalent qpdf spec.
 * Ascending and descending runs both become ranges, because qpdf reads "5-3"
 * as 5,4,3.
 *
 * When `pageCount` is given, an ascending run that ends on the last page is
 * written as "n-z". pdf.js takes its count from the page tree's /Count while
 * qpdf walks the tree itself, so on a malformed file the two can disagree;
 * "z" keeps any pages pdf.js missed instead of silently dropping them.
 *
 * @param pages - Page numbers in their desired output order (1-based)
 * @param pageCount - Page count the order was built from, if known
 * @returns A qpdf pages spec, or "" for an empty order
 */
export function serializePageOrder(pages: number[], pageCount?: number): string {
  const parts: string[] = [];
  let i = 0;

  while (i < pages.length) {
    // Walk the run as far as it stays consecutive in one direction. Past the
    // last page the step is NaN, so a lone page is a run of one.
    const step = pages[i + 1] - pages[i];
    let end = i;
    if (step === 1 || step === -1) {
      while (end + 1 < pages.length && pages[end + 1] - pages[end] === step) end += 1;
    }
    const length = end - i + 1;

    if (pages[end] === pageCount && (length === 1 || step === 1)) {
      parts.push(`${pages[i]}-z`);
      i = end + 1;
    } else if (length >= MIN_RANGE_RUN) {
      parts.push(`${pages[i]}-${pages[end]}`);
      i = end + 1;
    } else {
      parts.push(String(pages[i]));
      i += 1;
    }
  }

  return parts.join(",");
}
