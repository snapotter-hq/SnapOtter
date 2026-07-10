// scripts/i18n/lib/glossary.mjs
import { SUPPORTED_LOCALES } from "../../../packages/shared/src/i18n/index.ts";

/** Terms that must stay verbatim in every language. */
export const DO_NOT_TRANSLATE = [
  "SnapOtter",
  "API",
  "REST",
  "JSON",
  "YAML",
  "URL",
  "HTTP",
  "JPEG",
  "PNG",
  "WebP",
  "AVIF",
  "HEIC",
  "GIF",
  "SVG",
  "EXIF",
  "PDF",
  "FFmpeg",
  "Docker",
  "Compose",
  "Postgres",
  "Redis",
  "OIDC",
  "SSO",
  "SAML",
  "SCIM",
];

/**
 * @param {string} locale
 * @returns {string} the English display name of the locale
 */
function localeName(locale) {
  const entry = SUPPORTED_LOCALES.find((l) => l.code === locale);
  if (!entry) throw new Error(`Unknown locale: ${locale}`);
  return entry.name;
}

/**
 * System prompt for translating one batch into `locale`.
 * @param {string} locale
 * @returns {string}
 */
export function buildSystemPrompt(locale) {
  const name = localeName(locale);
  return [
    `You are a professional software-localization translator. Translate the user's content into ${name}.`,
    "",
    "Rules:",
    `- Translate prose only. Preserve all markdown structure, whitespace, and line breaks exactly.`,
    `- Never translate, reorder, or remove any ⸤I18N…⸥ marker. Copy each one verbatim in place.`,
    `- Do not translate these terms; keep them exactly as written: ${DO_NOT_TRANSLATE.join(", ")}.`,
    `- Keep code, URLs, file paths, and CLI flags unchanged.`,
    `- Preserve the meaning and tone. Do not add notes, explanations, or extra text.`,
    `- Output only the translation. No preamble, no closing remarks.`,
  ].join("\n");
}
