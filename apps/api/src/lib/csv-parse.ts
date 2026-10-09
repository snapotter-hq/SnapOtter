import type { ParseError } from "papaparse";

/**
 * The message of the first Papa parse error that should fail a request, or null.
 *
 * Papa raises UndetectableDelimiter for any file with a single column. It is an
 * advisory ("defaulted to ','"): the file parsed correctly, so treating it as
 * fatal refused every one-column CSV (#2099). The delimiter is left to Papa's
 * auto-detection rather than forced, because TSV input relies on it.
 */
export function csvParseFailure(errors: readonly ParseError[]): string | null {
  const fatal = errors.find((e) => e.code !== "UndetectableDelimiter");
  return fatal ? fatal.message : null;
}
