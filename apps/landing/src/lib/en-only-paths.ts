// apps/landing/src/lib/en-only-paths.ts
//
// Which landing paths the build emits in English only.
//
// Two consumers need this answer and used to hold their own copy: astro.config.mjs
// (to strip sitemap alternates) and the page head (to strip hreflang alternates).
// Only the sitemap copy existed, so every English tool-detail page shipped twenty
// `<link rel="alternate">` tags pointing at pages that were never built. One
// definition, imported by both, is the reason that cannot happen again.
//
// Deliberately free of `astro:*` imports so `astro.config.mjs` can import it: the
// config is evaluated before the Astro virtual modules exist.

/**
 * Tool DETAIL pages (/tools/<section>/<tool>/) and the /self-hosted pages have no
 * per-locale route. The /tools/ index and /tools/<section>/ section pages have one
 * path segment fewer and DO stay localized, which is why the tool pattern pins the
 * segment count instead of matching a prefix.
 */
const EN_ONLY_PATTERNS = [
  /^\/tools\/(?:image|video|audio|pdf|files)\/[^/]+\/?$/,
  /^\/self-hosted(?:\/[^/]+)?\/?$/,
];

/** True when `pathname` is served in English only, so it has no localized twin. */
export function isEnglishOnlyPath(pathname: string): boolean {
  return EN_ONLY_PATTERNS.some((pattern) => pattern.test(pathname));
}

/** `isEnglishOnlyPath` for a full URL. A value that will not parse is not English-only. */
export function isEnglishOnlyUrl(url: string): boolean {
  try {
    return isEnglishOnlyPath(new URL(url).pathname);
  } catch {
    return false;
  }
}
