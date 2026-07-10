// apps/landing/src/lib/i18n-page.ts
import { getRelativeLocaleUrl } from "astro:i18n";
import { isRtl, LANDING_LOCALES } from "@/i18n";

/** Absolute site origin used for canonical + hreflang hrefs. */
export const SITE = "https://snapotter.com";

/** Prefix a path for a locale ("/faq" -> "/de/faq" for de, "/faq" for en). */
export function localizeHref(locale: string, path: string): string {
  const clean = path.startsWith("/") ? path.slice(1) : path;
  return getRelativeLocaleUrl(locale, clean);
}

/** Direction attribute for the current locale. */
export function dirFor(locale: string): "ltr" | "rtl" {
  return isRtl(locale) ? "rtl" : "ltr";
}

/**
 * Reciprocal hreflang alternates for one page path (same path across all locales),
 * plus an x-default pointing at English.
 */
export function altLinks(path: string): Array<{ hreflang: string; href: string }> {
  const links = LANDING_LOCALES.map((code) => ({
    hreflang: code,
    href: `${SITE}${localizeHref(code, path)}`,
  }));
  links.push({ hreflang: "x-default", href: `${SITE}${localizeHref("en", path)}` });
  return links;
}

/** BCP-47-ish og:locale value ("de" -> "de", "pt-BR" -> "pt_BR"). */
export function ogLocale(locale: string): string {
  return locale.replace("-", "_");
}
