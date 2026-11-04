import { en, SUPPORTED_LOCALES, TRANSLATION_LOADERS } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import { loadLocale, localeLoaders } from "@/contexts/i18n-context";

// The app and the shared package each keep a loader table (#4321). A locale missing
// from the app table renders in English with no other check failing.
const nonEnglish = SUPPORTED_LOCALES.map((l) => l.code)
  .filter((code) => code !== "en")
  .sort();

describe("locale loader tables", () => {
  it("lists every supported non-English locale in the app table", () => {
    expect(Object.keys(localeLoaders).sort()).toEqual(nonEnglish);
  });

  it("lists every supported non-English locale in the shared table", () => {
    expect(Object.keys(TRANSLATION_LOADERS).sort()).toEqual(nonEnglish);
  });

  it.each(nonEnglish)("%s loads the same translations through both tables", async (code) => {
    const viaApp = await loadLocale(code);
    const viaShared = await TRANSLATION_LOADERS[code]();
    expect(viaApp).not.toBe(en);
    expect(viaApp).toBe(viaShared);
  });
});
