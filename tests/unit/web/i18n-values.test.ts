/**
 * i18n untranslated-value guard.
 *
 * Flags non-en string leaves byte-identical to `en` for the same key, which
 * the key-parity guard (i18n-parity.test.ts) and tsc both miss. Real bug:
 * `auth.mfaEnrollmentHeading` shipped in English in all 20 non-en locales.
 *
 * Only longer human sentences are checked (MIN_LENGTH) so short codes that
 * are legitimately identical (SAML, OIDC, PDF, SnapOtter, ...) don't need an
 * allowlist. Interpolated sentences are checked too; a string that should stay
 * identical to en (a technical format string) goes in ALLOWLIST.
 */

import { en, loadTranslations, SUPPORTED_LOCALES } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

const MIN_LENGTH = 26;

/** Values that genuinely should match en (technical format strings). */
const ALLOWLIST = new Set<string>([
  "Original: {width} x {height}",
  "Original: {width} x {height} px",
  "Variables: {{index}}, {{padded}}, {{original}}",
]);

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

  it.each(SUPPORTED_LOCALES.filter((l) => l.code !== "en").map((l) => [l.code]))(
    "%s has no untranslated (byte-identical to en) sentences",
    async (code) => {
      const translations = await loadTranslations(code);
      const untranslated = getStringLeaves(
        translations as unknown as Record<string, unknown>,
      ).filter(
        ([path, value]) =>
          value.length >= MIN_LENGTH && enLeaves.get(path) === value && !ALLOWLIST.has(value),
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
