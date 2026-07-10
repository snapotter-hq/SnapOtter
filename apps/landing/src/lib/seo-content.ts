// apps/landing/src/lib/seo-content.ts
import { SUPPORTED_LOCALES } from "@snapotter/shared";

// Eager glob of every generated locale SEO/alternatives file. Missing files simply
// do not appear, so lookups fall back to the English source passed by the caller.
const seoFiles = import.meta.glob<{ default: Record<string, { text: string }> }>(
  "../data/i18n/tool-seo.*.json",
  { eager: true },
);
const altFiles = import.meta.glob<{ default: Record<string, { text: string }> }>(
  "../data/i18n/alternatives.*.json",
  { eager: true },
);

function catalog(
  files: Record<string, { default: Record<string, { text: string }> }>,
  base: string,
  locale: string,
) {
  return files[`../data/i18n/${base}.${locale}.json`]?.default ?? {};
}

/** Native/tool locale codes, from shared. */
export const SEO_LOCALES = SUPPORTED_LOCALES.map((l) => l.code);

/**
 * Look up a translated SEO string by id, falling back to the English source.
 * `id` matches the landing-seo adapter ids ("seo:<tool>:<field>", "alt:<slug>:<field>").
 */
export function seoText(locale: string, id: string, englishFallback: string): string {
  if (locale === "en") return englishFallback;
  const store = id.startsWith("alt:")
    ? catalog(altFiles, "alternatives", locale)
    : catalog(seoFiles, "tool-seo", locale);
  return store[id]?.text ?? englishFallback;
}

/** Translate an indexed array field, falling back per-item to the English source array. */
export function seoArray(locale: string, base: string, field: string, english: string[]): string[] {
  if (locale === "en") return english;
  return english.map((en, i) => seoText(locale, `${base}:${field}.${i}`, en));
}
