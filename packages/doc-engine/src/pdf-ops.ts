import { runQpdf } from "./qpdf.js";

// qpdf page ranges: digits, commas, hyphens, r-prefixed (r1 = last), and z (last page).
const RANGE_RE = /^[0-9rz][0-9rz,-]*$/i;

export function assertValidRange(range: string): void {
  if (!RANGE_RE.test(range) || range.length > 200) {
    throw new Error(`Invalid page range: ${range.slice(0, 50)}`);
  }
}

function assertPassword(pw: string): void {
  if (pw.length === 0 || pw.length > 256) throw new Error("Password must be 1-256 characters");
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

/*
 * Security note: passwords are passed as argv elements to spawn() (no shell).
 * They are visible in /proc/<pid>/cmdline for the ~1s process lifetime. This
 * is acceptable for the single-tenant container threat model. If multi-tenant
 * isolation is ever needed, switch to qpdf's --password-file or @argfile
 * syntax with a 0600 temp file in the scratch dir, deleted in a finally block.
 */

/** AES-256 encrypt with user + owner passwords (qpdf --encrypt user owner 256 --). */
export async function qpdfEncrypt(
  inputPath: string,
  userPassword: string,
  ownerPassword: string,
  outPath: string,
): Promise<void> {
  assertPassword(userPassword);
  assertPassword(ownerPassword);
  await runQpdf(
    [inputPath, "--encrypt", userPassword, ownerPassword, "256", "--", outPath],
    60_000,
  );
}

/** Decrypt with a known password; qpdf rejects wrong passwords with exit 2. */
export async function qpdfDecrypt(
  inputPath: string,
  password: string,
  outPath: string,
): Promise<void> {
  assertPassword(password);
  await runQpdf([`--password=${password}`, "--decrypt", inputPath, outPath], 60_000);
}

/**
 * Arbitrary qpdf pages spec against a single input (extract "1-3", explicit
 * reorder "3,1,2", inverse keep-sets computed by callers). Same validated
 * grammar as the wave-1 range ops.
 */
export async function qpdfPagesSpec(
  inputPath: string,
  spec: string,
  outPath: string,
): Promise<void> {
  assertValidRange(spec);
  await runQpdf([inputPath, "--pages", ".", spec, "--", outPath], 60_000);
}

/**
 * Internal variant of qpdfPagesSpec that validates the grammar (charset) but
 * NOT the 200-character length cap. Use ONLY for specs built programmatically
 * from validated integers (e.g. keepPages derived from parsePageSpec output),
 * never for raw user input.
 *
 * Trust boundary: the caller guarantees every number in the spec originated
 * from parsePageSpec (which validates bounds against the real page count).
 * We still verify the characters are safe for the qpdf CLI.
 */
export async function qpdfPagesSpecUnchecked(
  inputPath: string,
  spec: string,
  outPath: string,
): Promise<void> {
  if (!RANGE_RE.test(spec)) {
    throw new Error(`Invalid page range: ${spec.slice(0, 50)}`);
  }
  await runQpdf([inputPath, "--pages", ".", spec, "--", outPath], 60_000);
}

export async function qpdfLinearize(inputPath: string, outPath: string): Promise<void> {
  await runQpdf(["--linearize", inputPath, outPath], 60_000);
}

/**
 * Repair: qpdf's reader recovers damaged xref/structure where possible and
 * the rewrite produces a clean file. Damaged-beyond-recovery inputs reject
 * with qpdf's diagnostics.
 */
export async function qpdfRepair(inputPath: string, outPath: string): Promise<void> {
  await runQpdf([inputPath, outPath], 60_000);
}
