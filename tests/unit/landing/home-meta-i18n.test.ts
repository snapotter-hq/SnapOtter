// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { SUPPORTED_LOCALES } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

/**
 * The landing home page is the highest-value SEO page in each language, and all
 * 20 localized copies shipped the English <title> and <meta description>
 * because index.astro held them as string literals.
 *
 * t() falls back to English, so adding the keys to en.json alone changes
 * nothing. A per-locale check is the only thing that can tell the difference,
 * and it has to reject an English value rather than just a present one.
 */

const ROOT = path.resolve(__dirname, "../../..");
const I18N_DIR = path.join(ROOT, "apps/landing/src/i18n");
const KEYS = ["home.metaTitle", "home.metaDescription"] as const;

function catalog(locale: string): Record<string, string> {
  return JSON.parse(fs.readFileSync(path.join(I18N_DIR, `${locale}.json`), "utf-8"));
}

const en = catalog("en");
const locales = SUPPORTED_LOCALES.map((l) => l.code);

describe("landing home page metadata", () => {
  it("covers every supported locale", () => {
    expect(locales.length).toBe(21);
  });

  it("resolves the title and description from the catalog, not from a literal", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "apps/landing/src/pages/[...locale]/index.astro"),
      "utf-8",
    );
    for (const key of KEYS) {
      expect(src).toContain(`t(locale, "${key}")`);
    }
    // The English strings living in the page again would silently un-localize it.
    expect(src).not.toContain(en["home.metaTitle"]);
  });

  it.each(KEYS)("en.json defines %s", (key) => {
    expect(en[key]).toBeTruthy();
  });

  it.each(locales.filter((l) => l !== "en"))("%s translates both keys", (locale) => {
    const strings = catalog(locale);
    for (const key of KEYS) {
      expect(strings[key], `${locale} is missing ${key}`).toBeTruthy();
      expect(strings[key], `${locale} still carries the English ${key}`).not.toBe(en[key]);
    }
    // A title that gets cut off in a search result is barely better than a
    // missing one. Chinese and Japanese run short, so this is a ceiling only.
    expect(strings["home.metaTitle"].length).toBeLessThanOrEqual(70);
  });
});
