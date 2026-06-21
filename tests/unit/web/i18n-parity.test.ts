/**
 * i18n cross-locale key parity guard.
 *
 * Asserts that every locale in SUPPORTED_LOCALES has exactly the same key set
 * as en.ts (the reference locale). Missing or extra keys in any locale fail
 * the test.
 *
 * Runtime behavior: loadTranslations() falls back to `en` when a locale file
 * fails to load or the named export is not found (no crash). So missing keys
 * do not crash the app, but they cause untranslated English text to appear for
 * users of that locale. This guard catches that drift at PR time.
 *
 * Real bug found and fixed: zh-CN and pt-BR exported only a camelCase named
 * export (e.g. `zhCN`) with no `export default`. loadTranslations looks up
 * `mod[locale]` (e.g. `mod["zh-CN"]`), which fails for dashed locale codes.
 * Without a default export fallback, these two locales silently returned
 * English. Fixed by adding `export default` to both files.
 */

import { en, loadTranslations, SUPPORTED_LOCALES } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

/** Recursively collect all dot-separated key paths from an object tree. */
function getKeyPaths(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...getKeyPaths(v as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

/** Recursively collect dot-separated key paths for array-valued leaves too. */
function getStructuralKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...getStructuralKeys(v as Record<string, unknown>, path));
    } else {
      // Leaf: string, number, array, etc.
      keys.push(path);
    }
  }
  return keys;
}

describe("i18n cross-locale parity", () => {
  const enKeys = new Set(getStructuralKeys(en as unknown as Record<string, unknown>));

  it("en reference locale has keys", () => {
    expect(enKeys.size).toBeGreaterThan(100);
  });

  it.each(
    SUPPORTED_LOCALES.filter((l) => l.code !== "en").map((l) => [l.code, l.name]),
  )("%s (%s) has the same key set as en", async (code) => {
    const translations = await loadTranslations(code);

    // If loadTranslations fell back to en, we get en back. That is a real
    // problem (the locale file failed to load). Detect this by checking
    // whether the returned object is literally the en reference.
    expect(
      translations !== en || code === "en",
      `locale "${code}" fell back to English -- check the file exports a default or named export matching the locale code`,
    ).toBe(true);

    const localeKeys = new Set(
      getStructuralKeys(translations as unknown as Record<string, unknown>),
    );

    const missing = [...enKeys].filter((k) => !localeKeys.has(k));
    const extra = [...localeKeys].filter((k) => !enKeys.has(k));

    expect(
      missing,
      `locale "${code}" is missing ${missing.length} keys from en:\n  ${missing.slice(0, 20).join("\n  ")}${missing.length > 20 ? `\n  ... and ${missing.length - 20} more` : ""}`,
    ).toEqual([]);

    expect(
      extra,
      `locale "${code}" has ${extra.length} extra keys not in en:\n  ${extra.slice(0, 20).join("\n  ")}${extra.length > 20 ? `\n  ... and ${extra.length - 20} more` : ""}`,
    ).toEqual([]);
  });

  it("all dashed locales load their own translations (not en fallback)", async () => {
    const dashedLocales = SUPPORTED_LOCALES.filter((l) => l.code.includes("-"));
    for (const locale of dashedLocales) {
      const translations = await loadTranslations(locale.code);
      expect(
        translations !== en,
        `locale "${locale.code}" (${locale.name}) fell back to English -- this means ${locale.nativeName} users see untranslated UI`,
      ).toBe(true);
    }
  });

  it("loadTranslations returns en for unknown locale (graceful fallback)", async () => {
    const result = await loadTranslations("xx-FAKE");
    expect(result).toBe(en);
  });
});
