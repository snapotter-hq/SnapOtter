import { describe, expect, it } from "vitest";
import { csvParseFailure, parseCsvWithHeader } from "../../../apps/api/src/lib/csv-parse.js";

/**
 * Papa raises UndetectableDelimiter when no separator averages more than one field
 * per row, then parses with "," anyway. For a real one-column file that is an
 * advisory and refusing it rejected every one-column CSV (#2099). The same code also
 * fires when the comma fallback split the data, which must stay an error. The tools'
 * integration tests drive real files through each route.
 */
const advisory = {
  type: "Delimiter",
  code: "UndetectableDelimiter",
  message: "Unable to auto-detect delimiting character; defaulted to ','",
  row: 0,
} as const;

const quotes = {
  type: "Quotes",
  code: "MissingQuotes",
  message: "Quoted field unterminated",
  row: 1,
} as const;

const meta = (fields?: string[]) => ({ fields }) as never;

describe("csvParseFailure", () => {
  it("lets a one-column file with a header through, however it was parsed", () => {
    expect(
      csvParseFailure({ data: [{ email: "a@x.io" }], errors: [advisory], meta: meta(["email"]) }),
    ).toBeNull();
    expect(
      csvParseFailure({ data: [["email"], ["a@x.io"]], errors: [advisory], meta: meta() }),
    ).toBeNull();
  });

  it("keeps the advisory fatal when the comma fallback split the data", () => {
    // "sales / 1,200 / 2,400": two columns after the fallback, so not a one-column file.
    expect(
      csvParseFailure({
        data: [["sales"], ["1", "200"], ["2", "400"]],
        errors: [advisory],
        meta: meta(),
      }),
    ).toMatch(/auto-detect/);
    expect(
      csvParseFailure({ data: [{ a: "1", b: "2" }], errors: [advisory], meta: meta(["a", "b"]) }),
    ).toMatch(/auto-detect/);
  });

  it("refuses a file with no rows instead of converting nothing", () => {
    expect(csvParseFailure({ data: [], errors: [advisory], meta: meta() })).toBe(
      "The file has no rows",
    );
    expect(csvParseFailure({ data: [], errors: [], meta: meta([]) })).toBe("The file has no rows");
  });

  it("still converts a header-only file that has a header", () => {
    expect(csvParseFailure({ data: [], errors: [advisory], meta: meta(["email"]) })).toBeNull();
  });

  it("returns the message of a real error", () => {
    expect(csvParseFailure({ data: [["a"]], errors: [quotes], meta: meta() })).toBe(
      "Quoted field unterminated",
    );
  });

  it("skips the advisory on a one-column file when a real error follows", () => {
    expect(csvParseFailure({ data: [["a"]], errors: [advisory, quotes], meta: meta() })).toBe(
      "Quoted field unterminated",
    );
  });

  it("returns null when there are no errors", () => {
    expect(csvParseFailure({ data: [["a", "b"]], errors: [], meta: meta() })).toBeNull();
  });

  it("refuses a file with duplicate column headers and names the duplicate", () => {
    expect(csvParseFailure({ data: [], errors: [], meta: meta(["a", "a"]) })).toBe(
      "The file has duplicate column headers: a",
    );
  });

  it("refuses a file when PapaParse renames duplicate column headers and names each duplicate", () => {
    expect(
      csvParseFailure({
        data: [],
        errors: [],
        meta: {
          fields: ["a", "b", "a_1", "b_1"],
          renamedHeaders: { a_1: "a", b_1: "b" },
        } as never,
      }),
    ).toBe("The file has duplicate column headers: a, b");
  });

  it("refuses a parsed CSV with duplicate headers from parseCsvWithHeader (#2229)", () => {
    expect(csvParseFailure(parseCsvWithHeader("a,a\r\n1,2"))).toBe(
      "The file has duplicate column headers: a",
    );
    expect(csvParseFailure(parseCsvWithHeader("__proto__,__proto__\r\n1,2"))).toBe(
      "The file has duplicate column headers: __proto__",
    );
    expect(csvParseFailure(parseCsvWithHeader("__proto__,__proto___1,__proto__\r\n1,2,3"))).toBe(
      "The file has duplicate column headers: __proto__",
    );
    expect(csvParseFailure(parseCsvWithHeader("__parsed_extra,__parsed_extra\r\n1,2"))).toBe(
      "The file has duplicate column headers: __parsed_extra",
    );
  });

  it("labels blank or whitespace duplicate headers as (empty), truncates long names, and caps long lists", () => {
    expect(csvParseFailure({ data: [], errors: [], meta: meta(["", "", "   ", "   "]) })).toBe(
      "The file has duplicate column headers: (empty)",
    );
    const longHeader = "a".repeat(30);
    expect(csvParseFailure({ data: [], errors: [], meta: meta([longHeader, longHeader]) })).toBe(
      `The file has duplicate column headers: ${"a".repeat(24)}`,
    );
    const cols = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"].map(
      (c) => `${c}_${"x".repeat(22)}`,
    );
    expect(csvParseFailure({ data: [], errors: [], meta: meta([...cols, ...cols]) })).toBe(
      `The file has duplicate column headers: ${cols
        .slice(0, 6)
        .map((c) => c.slice(0, 24))
        .join(", ")}, and 2 more`,
    );
  });

  it("ignores an empty renamedHeaders object when no headers were renamed", () => {
    expect(
      csvParseFailure({
        data: [{ a: "1", b: "2" }],
        errors: [],
        meta: { fields: ["a", "b"], renamedHeaders: {} } as never,
      }),
    ).toBeNull();
  });
});
