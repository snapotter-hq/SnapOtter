import { describe, expect, it } from "vitest";
import { csvParseFailure } from "../../../apps/api/src/lib/csv-parse.js";

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
});
