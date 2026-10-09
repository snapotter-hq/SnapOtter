import Papa, { type ParseError, type ParseResult } from "papaparse";

// A header Papa can't be handed as itself: it builds each row as `{}` and assigns
// `row[field] = value`, and a field named __proto__ hits the prototype setter, so
// the column's cells vanish while meta.fields still lists it (#2096). The NULs make
// a collision with a real header practically impossible.
const PROTO_HEADER = "\u0000proto\u0000";

/**
 * Parse CSV text with a header row into rows keyed by header. Same options and
 * result as `Papa.parse(text, { header: true, skipEmptyLines: true })`, except that
 * a file with a `__proto__` header gets null-prototype rows, so that column is an
 * own property. A file without one is returned untouched: rebuilding every row
 * as a null-prototype object costs about 2.5x the memory on a large CSV.
 *
 * Papa renames a duplicated header to `name_1`, `name_2`, ... skipping names a real
 * column has. The `__proto__` copies get the same treatment here (`__proto__`, then
 * `__proto___1`, ...), done by hand because Papa checks its candidates against the
 * raw header names, not against what the sentinel restores to.
 */
export function parseCsvWithHeader(text: string): ParseResult<Record<string, unknown>> {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => (header === "__proto__" ? PROTO_HEADER : header),
  });

  const sentinelFields = parsed.meta.fields ?? [];
  const taken = new Set(sentinelFields.filter((field) => !field.startsWith(PROTO_HEADER)));
  const names = new Map<string, string>();
  // The counter lives outside the loop: every suffix below it is already taken, so
  // restarting per column would make a header of many copies quadratic.
  let suffix = 0;
  for (const field of sentinelFields) {
    if (!field.startsWith(PROTO_HEADER) || names.has(field)) continue;
    let name: string;
    do {
      name = suffix === 0 ? "__proto__" : `__proto___${suffix}`;
      suffix++;
    } while (taken.has(name));
    taken.add(name);
    names.set(field, name);
  }
  if (names.size === 0) return parsed;
  const restore = (key: string) => names.get(key) ?? key;

  const data = parsed.data.map((row) => {
    const out: Record<string, unknown> = Object.create(null);
    for (const [key, value] of Object.entries(row)) out[restore(key)] = value;
    return out;
  });
  const renamedHeaders = parsed.meta.renamedHeaders
    ? Object.fromEntries(
        Object.entries(parsed.meta.renamedHeaders).map(([renamed, original]) => [
          restore(renamed),
          restore(original),
        ]),
      )
    : undefined;
  return {
    ...parsed,
    data,
    meta: {
      ...parsed.meta,
      ...(parsed.meta.fields && { fields: sentinelFields.map(restore) }),
      ...(renamedHeaders && { renamedHeaders }),
    },
  };
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
