import type { ParseError, ParseResult } from "papaparse";

/**
 * The message of the first Papa parse problem that should fail a request, or
 * null when the parse is usable.
 *
 * Papa raises UndetectableDelimiter when no separator averages more than one
 * field per row, then parses with "," anyway. For a real one-column file that is
 * an advisory (#2099): the rows came back whole, and treating it as fatal
 * refused every one-column CSV. The same code also fires for a blank file, a
 * short row in a small file, or a separator Papa doesn't try, where the comma
 * fallback may have split the data ("sales / 1,200 / 2,400" into 1 and 200). So
 * it is forgiven only when the parse really yielded one column, the rule
 * chart-maker already applies. A file with no rows at all is refused here too,
 * since there is nothing to convert.
 *
 * The delimiter is left to Papa's auto-detection rather than forced, because TSV
 * input relies on it.
 */
export function csvParseFailure(parsed: Pick<ParseResult<unknown>, "data" | "errors" | "meta">) {
  const rows = parsed.data as unknown[];
  const fields = parsed.meta.fields;
  if (rows.length === 0 && !fields?.length) return "The file has no rows";

  const singleColumn = fields
    ? fields.length === 1
    : rows.every((row) => Array.isArray(row) && row.length === 1);
  const fatal = parsed.errors.find(
    (err: ParseError) => !(err.code === "UndetectableDelimiter" && singleColumn),
  );
  return fatal ? fatal.message : null;
}
