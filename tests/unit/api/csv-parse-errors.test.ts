import { describe, expect, it } from "vitest";
import { csvParseFailure } from "../../../apps/api/src/lib/csv-parse.js";

/**
 * Papa raises UndetectableDelimiter, an advisory ("defaulted to ','"), for any
 * file with a single column, after parsing it correctly. Treating it as fatal
 * refused every one-column CSV (#2099). Real parse errors still fail. The tools'
 * integration tests drive real single-column files through each route.
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

describe("csvParseFailure", () => {
  it("lets a file that only raised the delimiter advisory through", () => {
    expect(csvParseFailure([advisory])).toBeNull();
  });

  it("returns the message of a real error", () => {
    expect(csvParseFailure([quotes])).toBe("Quoted field unterminated");
  });

  it("skips the advisory when a real error comes after it", () => {
    expect(csvParseFailure([advisory, quotes])).toBe("Quoted field unterminated");
  });

  it("returns null when there are no errors", () => {
    expect(csvParseFailure([])).toBeNull();
  });
});
