/**
 * i18n untranslated-value guard.
 *
 * Flags non-en string leaves byte-identical to `en` for the same key, which
 * the key-parity guard (i18n-parity.test.ts) and tsc both miss. Real bugs:
 * `auth.mfaEnrollmentHeading` shipped in English in all 20 non-en locales,
 * and short labels such as `a11y.comparisonScroller` and
 * `tools.multi-tool-pdf.name` stayed English because the old length cutoff
 * skipped them. A separate check below keeps `categories.video-edit` from
 * reusing the modality word instead of "Edit".
 *
 * Longer human sentences are checked everywhere (MIN_LENGTH). Short values
 * are checked only in namespaces that hold user-facing labels, so technical
 * codes (SAML, OIDC, PDF, SnapOtter, ...) elsewhere don't need an allowlist.
 * Values that legitimately match en go in ALLOWLIST (technical format
 * strings) or COGNATE_ALLOWLIST (native cognates and established loanwords).
 */

import { en, loadTranslations, SUPPORTED_LOCALES } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

const MIN_LENGTH = 26;

/** Values that genuinely should match en in every locale (technical format strings). */
const ALLOWLIST = new Set<string>([
  "Original: {width} x {height}",
  "Original: {width} x {height} px",
  "Variables: {{index}}, {{padded}}, {{original}}",
  "Original: {size} KB",
  "PDF OCR",
]);

/**
 * Values that legitimately match en for one locale: native cognates (German
 * "Text", French "Saturation") and established loanwords (Indonesian
 * "Watermark Video"). Keyed by locale so one locale's cognate cannot excuse an
 * untranslated string in another.
 */
const COGNATE_ALLOWLIST: Record<string, Set<string>> = {
  de: new Set([
    "Detail",
    "Duotone",
    "Hand",
    "Linear",
    "Navigation",
    "Normal",
    "Radius",
    "Text",
    "Vignette",
    "Zoom",
  ]),
  es: new Set(["Color", "Normal", "Zoom"]),
  fr: new Set([
    "Archives",
    "Exclusion",
    "Navigation",
    "Normal",
    "Portrait",
    "Saturation",
    "Vignette",
    "Zoom",
  ]),
  id: new Set([
    "Detail",
    "Duotone",
    "Fade Audio",
    "Histogram",
    "Linear",
    "Metadata",
    "Normal",
    "Radius",
    "Watermark PDF",
    "Watermark Video",
    "Zoom",
  ]),
  it: new Set(["Zoom"]),
  nl: new Set(["Detail", "Hand", "Help", "Histogram", "Metadata", "Zoom"]),
  pl: new Set(["Duotone", "Gradient", "Histogram"]),
  "pt-BR": new Set(["Duotone", "Linear", "Normal", "Zoom"]),
  sv: new Set(["Hand", "Histogram", "Metadata", "Normal", "Text", "Zoom"]),
  tr: new Set(["Histogram", "Normal"]),
};

/** Namespaces that hold short user-facing labels, not technical codes. */
const LABEL_PREFIXES = [
  "a11y.",
  "categories.",
  "editor.toolbar.",
  "editor.panels.layers.blendModes.",
  "editor.panels.adjustments.curvePresets.",
  "toolSettings.compose.",
  "toolSettings.sharpening.",
];

/** Short keys outside the label namespaces that must still be translated. */
const MUST_TRANSLATE_KEYS = new Set<string>([
  "toolSettings.gif-tools.dither",
  "toolSettings.qr-generate.vcardJobTitlePlaceholder",
]);

function isLabelKey(path: string): boolean {
  if (path.startsWith("tools.") && path.endsWith(".name")) return true;
  return LABEL_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function getStringLeaves(obj: Record<string, unknown>, prefix = ""): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out.push(...getStringLeaves(v as Record<string, unknown>, path));
    } else if (typeof v === "string") {
      out.push([path, v]);
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === "string") out.push([`${path}[${i}]`, item]);
      });
    }
  }
  return out;
}

describe("i18n untranslated values", () => {
  const enLeaves = new Map(getStringLeaves(en as unknown as Record<string, unknown>));

  it("uses the same word for the video and audio edit categories", async () => {
    for (const locale of SUPPORTED_LOCALES.filter((l) => l.code !== "en")) {
      const translations = await loadTranslations(locale.code);
      expect(
        translations.categories["video-edit"],
        `locale "${locale.code}" labels video-edit differently from audio-edit`,
      ).toBe(translations.categories["audio-edit"]);
    }
  });

  it.each(SUPPORTED_LOCALES.filter((l) => l.code !== "en").map((l) => [l.code]))(
    "%s has no untranslated (byte-identical to en) sentences or labels",
    async (code) => {
      const translations = await loadTranslations(code);
      const cognates = COGNATE_ALLOWLIST[code] ?? new Set<string>();
      const untranslated = getStringLeaves(
        translations as unknown as Record<string, unknown>,
      ).filter(
        ([path, value]) =>
          (value.length >= MIN_LENGTH || isLabelKey(path) || MUST_TRANSLATE_KEYS.has(path)) &&
          enLeaves.get(path) === value &&
          !ALLOWLIST.has(value) &&
          !cognates.has(value),
      );
      expect(
        untranslated,
        `locale "${code}" has ${untranslated.length} values identical to en (untranslated?):\n` +
          untranslated
            .slice(0, 20)
            .map(([p, v]) => `  ${p}: ${JSON.stringify(v)}`)
            .join("\n"),
      ).toEqual([]);
    },
  );
});
