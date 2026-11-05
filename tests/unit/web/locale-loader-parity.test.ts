import { SUPPORTED_LOCALES } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import { localeLoaders } from "../../../apps/web/src/contexts/i18n-context.js";
import { TRANSLATION_LOADERS } from "../../../packages/shared/src/i18n/index.js";

/**
 * The app and the shared package each keep a locale loader table (#4321). A
 * locale missing from the app table renders in English with no other failing
 * check, so both must cover every SUPPORTED_LOCALES code except en.
 */

const nonEnglish = SUPPORTED_LOCALES.map((l) => l.code)
  .filter((c) => c !== "en")
  .sort();

describe("locale loader parity (#4321)", () => {
  it("lists every supported locale in the app loader table", () => {
    expect(Object.keys(localeLoaders).sort()).toEqual(nonEnglish);
  });

  it("lists every supported locale in the shared loader table", () => {
    expect(Object.keys(TRANSLATION_LOADERS).sort()).toEqual(nonEnglish);
  });
});
