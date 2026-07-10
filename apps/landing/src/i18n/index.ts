// apps/landing/src/i18n/index.ts
import { SUPPORTED_LOCALES } from "@snapotter/shared";
import en from "./en.json";

/** All landing locale codes, imported from shared so the list never drifts. */
export const LANDING_LOCALES: string[] = SUPPORTED_LOCALES.map((l) => l.code);

/** The default/source locale. English is served at the root without a prefix. */
export const DEFAULT_LOCALE = "en";

const RTL_LOCALES = new Set(SUPPORTED_LOCALES.filter((l) => l.dir === "rtl").map((l) => l.code));

/** True when the locale must render `dir="rtl"`. */
export function isRtl(locale: string): boolean {
  return RTL_LOCALES.has(locale);
}

/** Native display name for a locale, used in the switcher. */
export function nativeName(locale: string): string {
  return SUPPORTED_LOCALES.find((l) => l.code === locale)?.nativeName ?? locale;
}

type Catalog = Record<string, string>;

// Eager glob so the build inlines every catalog. English is the fallback source.
// Generated catalogs (de.json, ...) are picked up automatically once they exist.
const catalogs = import.meta.glob<{ default: Catalog }>("./*.json", { eager: true });

function catalogFor(locale: string): Catalog {
  const mod = catalogs[`./${locale}.json`];
  return (mod?.default as Catalog) ?? {};
}

/**
 * Resolve a UI string for `locale`, falling back to English, then to the key.
 * Supports `{name}` interpolation from `vars`.
 */
export function t(locale: string, key: string, vars?: Record<string, string | number>): string {
  const localized = catalogFor(locale);
  const raw = localized[key] ?? (en as Catalog)[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}
