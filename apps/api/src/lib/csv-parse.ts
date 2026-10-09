import Papa, { type ParseError, type ParseResult } from "papaparse";

// A header Papa can't be handed as itself: it builds each row as `{}` and assigns
// `row[field] = value`, and a field named __proto__ hits the prototype setter, so
// the column's cells vanish while meta.fields still lists it (#2096). The NULs make
// a collision with a real header practically impossible.
const PROTO_HEADER = "\u0000proto\u0000";
const restoreHeader = (field: string) =>
  field.startsWith(PROTO_HEADER) ? `__proto__${field.slice(PROTO_HEADER.length)}` : field;

/**
 * Parse CSV text with a header row into rows keyed by header. Same options and
 * result as `Papa.parse(text, { header: true, skipEmptyLines: true })`, except the
 * rows have no prototype: every header, `__proto__` included, is an own property,
 * and a key a row lacks never reads an inherited member. A duplicated `__proto__`
 * header is renamed the way Papa renames any other duplicate (`__proto___1`).
 */
export function parseCsvWithHeader(text: string): ParseResult<Record<string, unknown>> {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => (header === "__proto__" ? PROTO_HEADER : header),
  });
  const data = parsed.data.map((row) => {
    const out: Record<string, unknown> = Object.create(null);
    for (const [key, value] of Object.entries(row)) out[restoreHeader(key)] = value;
    return out;
  });
  const fields = parsed.meta.fields?.map(restoreHeader);
  return { ...parsed, data, meta: { ...parsed.meta, ...(fields && { fields }) } };
}

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
