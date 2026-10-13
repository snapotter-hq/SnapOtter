import Papa, { type ParseError, type ParseResult } from "papaparse";

// A header Papa can't be handed as itself: it builds each row as `{}` and assigns
// `row[field] = value`, and a field named __proto__ hits the prototype setter, so
// the column's cells vanish while meta.fields still lists it (#2096).
// Papaparse also hard-codes __parsed_extra as an array destination for cells beyond
// the header width, which mangles a real column with that name (#2269).
// The NULs make a collision with a real header practically impossible.
const SENTINELS = new Map<string, string>([
  ["__proto__", "\u0000proto\u0000"],
  ["__parsed_extra", "\u0000parsed_extra\u0000"],
]);
const SENTINEL_PREFIX = "\u0000";

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
  // Papa renames duplicate headers on the very first row before applying skipEmptyLines.
  // A leading completely blank line becomes the "header" it deduplicates, bypassing the
  // real header row. We strip the BOM and leading blank lines so Papa sees the real header first.
  const cleanedText = text.replace(/^﻿/, "").replace(/^[\r\n]+/, "");

  const parsed = Papa.parse<Record<string, unknown>>(cleanedText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => SENTINELS.get(header) ?? header,
  });

  const sentinelFields = parsed.meta.fields ?? [];
  const taken = new Set(sentinelFields.filter((field) => !field.startsWith(SENTINEL_PREFIX)));
  const names = new Map<string, string>();

  // To assign deterministic suffixes (name_1, name_2) sequentially without quadratic restarts,
  // we track the next available suffix per reserved prefix.
  const suffixCounts = new Map<string, number>();

  for (const field of sentinelFields) {
    if (!field.startsWith(SENTINEL_PREFIX) || names.has(field)) continue;

    // Reverse the sentinel back to the original reserved keyword it represents
    const originalReserved = Array.from(SENTINELS.keys()).find((k) =>
      field.startsWith(SENTINELS.get(k)!),
    );
    if (!originalReserved) continue; // Should not happen

    let name: string;
    let suffix = suffixCounts.get(originalReserved) ?? 0;
    do {
      name = suffix === 0 ? originalReserved : `${originalReserved}_${suffix}`;
      suffix++;
    } while (taken.has(name));
    suffixCounts.set(originalReserved, suffix);
    taken.add(name);
    names.set(field, name);
  }

  if (names.size === 0) return parsed;
  const restore = (key: string) => names.get(key) ?? key;

  const data = parsed.data.map((row) => {
    const out: Record<string, unknown> = Object.create(null);

    // First, restore all headers that were in parsed.meta.fields (if any).
    // This ensures user columns always get their intended names before any internal extras.
    for (const field of parsed.meta.fields || []) {
      if (field in row) {
        out[restore(field)] = row[field];
      }
    }

    // Now, handle any extra keys PapaParse added (like its internal "__parsed_extra" array).
    for (const [key, value] of Object.entries(row)) {
      if (parsed.meta.fields?.includes(key)) continue;

      let finalKey = restore(key);
      if (finalKey in out) {
        let suffix = 1;
        while (`${finalKey}_${suffix}` in out) suffix++;
        finalKey = `${finalKey}_${suffix}`;
      }
      out[finalKey] = value;
    }
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

  if (fields) {
    const uniqueFields = new Set(fields);
    if (
      uniqueFields.size !== fields.length ||
      (parsed.meta as { renamedHeaders?: unknown }).renamedHeaders
    ) {
      return "The file has duplicate column headers";
    }
  }

  const singleColumn = fields
    ? fields.length === 1
    : rows.every((row) => Array.isArray(row) && row.length === 1);
  const fatal = parsed.errors.find(
    (err: ParseError) => !(err.code === "UndetectableDelimiter" && singleColumn),
  );
  return fatal ? fatal.message : null;
}
