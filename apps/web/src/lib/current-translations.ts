// apps/web/src/lib/current-translations.ts
import { en, type TranslationKeys } from "@snapotter/shared";

// Stores run outside React and cannot call useTranslation(). I18nProvider
// keeps this in step with the active locale so a store can translate an error
// at the moment it happens.
let active: TranslationKeys = en;

export function setCurrentTranslations(t: TranslationKeys): void {
  active = t;
}

export function currentTranslations(): TranslationKeys {
  return active;
}
