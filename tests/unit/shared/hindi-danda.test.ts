import { describe, expect, it } from "vitest";
import { hi } from "../../../packages/shared/src/i18n/hi.js";

// Hindi ends a sentence with the danda (U+0964), not a period. A period right
// after a Devanagari letter, a closing ")", or a "}" placeholder is a
// sentence end in the wrong script, except for abbreviations like "उदा."
// ("e.g."), which keep their period.
const ABBREVIATIONS = ["उदा."];
const SENTENCE_FINAL_PERIOD = /[\u0900-\u097F)}]\.(?=\s|$)/u;

function* strings(node: unknown, path: string): Generator<[string, string]> {
  if (typeof node === "string") {
    yield [path, node];
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      yield* strings(value, path ? `${path}.${key}` : key);
    }
  }
}

describe("hi locale punctuation (#4786)", () => {
  it("ends Devanagari sentences with the danda, not a period", () => {
    const offenders = [...strings(hi, "")]
      .filter(([, text]) => {
        const stripped = ABBREVIATIONS.reduce((acc, abbr) => acc.replaceAll(abbr, ""), text);
        return SENTENCE_FINAL_PERIOD.test(stripped);
      })
      .map(([key]) => key);
    expect(offenders).toEqual([]);
  });

  it("keeps the period on abbreviations", () => {
    const withAbbreviation = [...strings(hi, "")].filter(([, text]) => text.includes("उदा."));
    expect(withAbbreviation.length).toBeGreaterThan(0);
  });
});
