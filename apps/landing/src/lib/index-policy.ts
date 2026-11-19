// apps/landing/src/lib/index-policy.ts
//
// Which landing pages ask search engines not to index them (#4833).
//
// Search impressions fell about 95% the day after Google's September 2026 spam
// update. The two most templated page groups were the localized copies of the
// alternatives pages and the `x-to-y` converter and preset tool pages, so those are
// noindexed. Pages that earned impressions before the drop stay indexed even when
// they fall in one of those groups.
//
// Three consumers need the same answer: the page head (robots meta and hreflang),
// and astro.config.mjs (sitemap filter). Like en-only-paths.ts, this file stays
// free of `astro:*` and `@/` imports so the config can load it.

import { SUPPORTED_LOCALES, TOOLS } from "@snapotter/shared";

/**
 * Pages kept indexed whatever group they belong to: the ones that had real search
 * impressions before the drop. Paths are emitted URLs with the trailing slash.
 */
export const INDEXED_KEEP_PATHS: readonly string[] = [
  "/tools/image/smart-crop/",
  "/tools/audio/ringtone-maker/",
  "/alternatives/removebg/",
  "/alternatives/stirling-pdf/",
  "/alternatives/ilovepdf/",
  "/ru/alternatives/adobe-acrobat-online/",
];

const KEEP = new Set(INDEXED_KEEP_PATHS);

/** Converter and preset tools: every tool whose id reads `<from>-to-<to>`. */
const CONVERTER_TOOL_IDS = new Set(TOOLS.filter((t) => t.id.includes("-to-")).map((t) => t.id));

const NON_ENGLISH_LOCALES = new Set(
  SUPPORTED_LOCALES.map((l) => l.code).filter((code) => code !== "en"),
);

const TOOL_DETAIL_RE = /^\/tools\/(?:image|video|audio|pdf|files)\/([^/]+)\/$/;
const LOCALIZED_ALTERNATIVES_RE = /^\/([^/]+)\/alternatives\/(?:[^/]+\/)?$/;

function withTrailingSlash(pathname: string): string {
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

/** True when the page at `pathname` (as served, locale prefix included) is noindexed. */
export function isNoindexPath(pathname: string): boolean {
  const path = withTrailingSlash(pathname);
  if (KEEP.has(path)) return false;

  const tool = TOOL_DETAIL_RE.exec(path);
  if (tool) return CONVERTER_TOOL_IDS.has(tool[1]);

  const alternatives = LOCALIZED_ALTERNATIVES_RE.exec(path);
  if (alternatives) return NON_ENGLISH_LOCALES.has(alternatives[1]);

  return false;
}

/** `isNoindexPath` for a full URL. A value that will not parse is not noindexed. */
export function isNoindexUrl(url: string): boolean {
  try {
    return isNoindexPath(new URL(url).pathname);
  } catch {
    return false;
  }
}
