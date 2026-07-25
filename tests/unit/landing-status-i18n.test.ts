import fs from "node:fs";
import path from "node:path";
import { SUPPORTED_LOCALES } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

/**
 * The footer status badge resolves all four labels server-side and hands them
 * to its inline script, so a catalog gap is invisible on the English page and
 * only shows on the localized one.
 *
 * `t()` falls back with `??`, which does not fall through on `""`. An empty
 * translation therefore resolves to an empty string rather than English, and
 * the badge would sit blank on that locale forever. Scoped to these four keys
 * on purpose: a whole-catalog parity guard is worth having but is a separate
 * change, and would trip on pre-existing debt.
 */

const I18N_DIR = path.resolve(__dirname, "../../apps/landing/src/i18n");

const STATUS_KEYS = [
  "footer.status.checking",
  "footer.status.operational",
  "footer.status.partial",
  "footer.status.down",
];

const locales = SUPPORTED_LOCALES.map((l) => l.code);

function catalog(locale: string): Record<string, string> {
  return JSON.parse(fs.readFileSync(path.join(I18N_DIR, `${locale}.json`), "utf-8"));
}

describe("landing footer status labels", () => {
  it("covers every supported locale", () => {
    // Guards the loop below: if the locale list were ever empty or unresolvable
    // the per-locale assertions would vacuously pass.
    expect(locales.length).toBe(21);
  });

  it.each(locales)("%s defines all four status labels as non-empty strings", (locale) => {
    const strings = catalog(locale);
    for (const key of STATUS_KEYS) {
      expect(typeof strings[key], `${locale}.json is missing ${key}`).toBe("string");
      expect(strings[key].trim(), `${locale}.json has an empty ${key}`).not.toBe("");
    }
  });
});
