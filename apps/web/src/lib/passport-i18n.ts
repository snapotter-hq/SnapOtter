import type { PassportSpec, TranslationKeys } from "@snapotter/shared";

/**
 * PASSPORT_SPECS carries English country names and document labels as data.
 * Display strings come from per-code i18n keys (country{CODE} / doc{CODE} in
 * the passport-photo block), falling back to the data's English when a code
 * has no key (e.g. the synthetic CUSTOM spec). Same cast pattern as
 * template-i18n.ts: the block's exact key set is locale-file-defined.
 */

function block(t: TranslationKeys): Record<string, string> {
  return t.toolSettings["passport-photo"] as unknown as Record<string, string>;
}

export function passportCountryName(t: TranslationKeys, spec: PassportSpec): string {
  return block(t)[`country${spec.code}`] ?? spec.name;
}

export function passportDocLabel(t: TranslationKeys, spec: PassportSpec): string {
  return block(t)[`doc${spec.code}`] ?? spec.documents[0]?.label ?? spec.name;
}
