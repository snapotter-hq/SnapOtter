import { runQpdf } from "./qpdf.js";

// qpdf page ranges: digits, commas, hyphens, r-prefixed (r1 = last), and z (last page).
const RANGE_RE = /^[0-9rz][0-9rz,-]*$/i;

export function assertValidRange(range: string): void {
  if (!RANGE_RE.test(range) || range.length > 200) {
    throw new Error(`Invalid page range: ${range.slice(0, 50)}`);
  }
}

/** Merge inputs (>= 2) into outPath, full pages, input order. */
export async function qpdfMerge(inputPaths: string[], outPath: string): Promise<void> {
  if (inputPaths.length < 2) throw new Error("qpdfMerge needs at least two inputs");
  await runQpdf(["--empty", "--pages", ...inputPaths, "--", outPath], 60_000);
}

/** Extract a page range (qpdf syntax, e.g. "1-3", "1,3,5", "2-z") into outPath. */
export async function qpdfSplitRanges(
  inputPath: string,
  range: string,
  outPath: string,
): Promise<void> {
  assertValidRange(range);
  await runQpdf([inputPath, "--pages", ".", range, "--", outPath], 60_000);
}

/** Rotate by +angle (90|180|270) applied to a page range (default all: "1-z"). */
export async function qpdfRotate(
  inputPath: string,
  angle: 90 | 180 | 270,
  range: string,
  outPath: string,
): Promise<void> {
  assertValidRange(range);
  await runQpdf([`--rotate=+${angle}:${range}`, inputPath, outPath], 60_000);
}
