import { en, type TranslationKeys } from "@stirling-image/shared";

/**
 * Simple i18n hook that returns the current locale translations.
 *
 * For now this always returns English. To add a new language:
 *   1. Create e.g. `packages/shared/src/i18n/de.ts` matching TranslationKeys shape
 *   2. Import it here and look up the locale from a store
 *   3. Return the correct locale object
 */

const locales: Record<string, TranslationKeys> = {
  en,
};

export function useI18n(): { t: TranslationKeys; locale: string } {
  // In the future, read from a locale store / user preferences
  const locale = "en";
  return { t: locales[locale] ?? en, locale };
}
