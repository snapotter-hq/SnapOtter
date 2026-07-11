// apps/docs/.vitepress/i18n/ui.mjs
import { SUPPORTED_LOCALES } from "../../../../packages/shared/src/i18n/index.ts";

// Source strings (English). Other locales override keys as translations land;
// missing keys fall back to English via t().
const EN = {
  // DocsHome.vue
  "home.title": "SnapOtter Documentation",
  "home.copy": "Copy",
  "home.copied": "Copied!",
  "home.selfHosting": "Self-hosting",
  "home.enterprise": "Enterprise",
  "home.startSelfHosting": "Start self-hosting →",
  "home.evaluate": "See enterprise features →",
  "home.modalities": "200+ tools across 5 modalities",
  "home.browseByType": "browse the full reference by type",
  // FundButton.vue
  "fund.label": "Fund Development",
  // GitHubStars.vue
  "github.star": "Star",
  // Machine-translation banner
  "banner.text": "This page was machine-translated. Spotted a mistake?",
  "banner.cta": "Help improve it.",
  // not-found (Layout.vue)
  "notFound.heading": "Hello from the otter side!",
  "notFound.text": "This page swam away. Let's get you back on track.",
  "notFound.link": "Back to docs",
};

// Per-locale overrides. Generated/refined by the pipeline in Plan 05; ships with
// English only, so t() returns English for every non-en locale until then.
/** @type {Record<string, Record<string, string>>} */
const OVERRIDES = {};

/**
 * @param {string} locale
 * @param {string} key
 * @returns {string}
 */
export function t(locale, key) {
  return OVERRIDES[locale]?.[key] ?? EN[key] ?? key;
}

/**
 * Normalize a VitePress lang to a catalog locale key (en for English variants).
 * @param {string} lang
 * @returns {string}
 */
export function normalizeLocale(lang) {
  const code = (lang || "en").trim();
  if (code === "en" || code.startsWith("en-")) return "en";
  return SUPPORTED_LOCALES.some((l) => l.code === code) ? code : "en";
}

export { SUPPORTED_LOCALES };
