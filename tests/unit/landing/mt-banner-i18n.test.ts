import { readFileSync } from "node:fs";
import path from "node:path";
import { SUPPORTED_LOCALES } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

/**
 * The machine-translation banner reads as one sentence: the notice as plain
 * text, then a short call to action as the link (#933). It used to print the
 * notice key in both places, so every localized page showed the sentence
 * twice. The e2e MT banner specs only check visibility, so this pins the keys.
 */

const LANDING = path.resolve(__dirname, "../../../apps/landing/src");
const I18N_DIR = path.join(LANDING, "i18n");

type Catalog = Record<string, string>;

function catalog(locale: string): Catalog {
  return JSON.parse(readFileSync(path.join(I18N_DIR, `${locale}.json`), "utf8")) as Catalog;
}

const locales = SUPPORTED_LOCALES.map((l) => l.code);

describe("machine-translation banner", () => {
  it("links the short call to action, not the notice sentence", () => {
    const source = readFileSync(
      path.join(LANDING, "components/MachineTranslationBanner.astro"),
      "utf8",
    );
    const anchor = source.match(/<a\b[^>]*>([\s\S]*?)<\/a>/);
    expect(anchor?.[1]).toContain('t(locale, "banner.helpImprove")');
    expect(source.match(/"banner\.machineTranslated"/g)).toHaveLength(1);
  });

  it("covers every supported locale", () => {
    expect(locales.length).toBe(21);
  });

  it.each(locales)("%s splits the notice from the link text", (locale) => {
    const strings = catalog(locale);
    const notice = strings["banner.machineTranslated"];
    const link = strings["banner.helpImprove"];
    expect(notice?.trim()).toBeTruthy();
    expect(link?.trim()).toBeTruthy();
    expect(notice).not.toContain(link);
  });
});
