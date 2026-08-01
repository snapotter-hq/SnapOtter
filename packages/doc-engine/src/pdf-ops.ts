import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
 * Security note: qpdfEncrypt passes its passwords through a 0600 job-JSON file that
 * is unlinked in a finally block, so they stay out of argv. qpdfDecrypt still passes
 * one as an argv element to spawn() (no shell), visible in /proc/<pid>/cmdline for
 * the ~1s process lifetime, which is acceptable for the single-tenant container
 * threat model. Its `--password=` form is a single token, so the argument-file
 * pre-pass described below cannot fire on it.
 */

/**
 * AES-256 encrypt with user + owner passwords, via a qpdf job-JSON file.
 *
 * The passwords deliberately never appear in argv. qpdf runs an argument-file
 * pre-pass over every argv element before it parses options, so a bare positional
 * password beginning with `@` is resolved as a path and that file's lines are
 * spliced into qpdf's own argv. A single-line file then encrypts the document under
 * that file's contents at exit 0, handing the user a PDF their own password does not
 * open, and a multi-line one shifts the arguments enough to surface part of the file
 * in qpdf's error text.
 *
 * The `=`-joined flag form (`--encrypt --user-password=...`) also avoids this, but
 * only on qpdf 11.7 and newer; the shipped image carries 11.3, which rejects it
 * outright. Job JSON is accepted by both (verified against 11.3.0 and 12.1.0) and
 * has the side benefit of keeping the passwords out of /proc/<pid>/cmdline, which
 * the note above asks for.
 */
export async function qpdfEncrypt(
  inputPath: string,
  userPassword: string,
  ownerPassword: string,
  outPath: string,
): Promise<void> {
  assertPassword(userPassword);
  assertPassword(ownerPassword);

  const jobPath = join(tmpdir(), `snapotter-qpdf-job-${randomUUID()}.json`);
  await writeFile(
    jobPath,
    JSON.stringify({
      inputFile: inputPath,
      outputFile: outPath,
      encrypt: { userPassword, ownerPassword, "256bit": {} },
    }),
    { mode: 0o600 },
  );

  try {
    await runQpdf([`--job-json-file=${jobPath}`], 60_000);
  } finally {
    await rm(jobPath, { force: true });
  }
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
