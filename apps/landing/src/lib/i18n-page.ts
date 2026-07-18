// apps/landing/src/lib/i18n-page.ts
import { getRelativeLocaleUrl } from "astro:i18n";
import { isRtl, LANDING_LOCALES } from "@/i18n";

/** Absolute site origin used for canonical + hreflang hrefs. */
export const SITE = "https://snapotter.com";

/**
 * Prefix a path for a locale ("/faq" -> "/de/faq" for de, "/faq" for en).
 * A trailing "#hash" is split off first and reattached untouched, since
 * Astro's URL builder would otherwise treat it as part of the path and
 * mangle it with a trailing slash (e.g. "/#pricing" -> "/#pricing/").
 *
 * `normalizeLocale: false` keeps the locale segment identical to its code.
 * By default Astro lowercases it (getRelativeLocaleUrl runs normalizeTheLocale,
 * so "zh-CN" -> "zh-cn", "pt-BR" -> "pt-br"), but our routes are built from the
 * raw codes (getStaticPaths -> /zh-CN/, /pt-BR/) and the sitemap keeps that same
 * mixed case. The lowercased links resolve fine on case-insensitive local hosting
 * but 404 on case-sensitive hosts like Cloudflare Pages, so we pin the casing here.
 */
export function localizeHref(locale: string, path: string): string {
  const hashIndex = path.indexOf("#");
  const pathname = hashIndex === -1 ? path : path.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : path.slice(hashIndex);
  const clean = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  return `${getRelativeLocaleUrl(locale, clean, { normalizeLocale: false })}${hash}`;
}

/**
 * Href for a page that is built ONLY in English: the individual tool-detail pages
 * under /tools/<section>/<tool> and the /self-hosted pages. These have no per-locale
 * route, so a locale-prefixed URL would 404. Always emit the un-prefixed English URL
 * so localized pages link to the page that actually exists.
 */
export function enOnlyHref(path: string): string {
  return localizeHref("en", path);
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
