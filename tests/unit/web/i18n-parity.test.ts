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

/** Map every array-valued key path to its array. */
function getArrays(obj: Record<string, unknown>, prefix = ""): Map<string, unknown[]> {
  const arrays = new Map<string, unknown[]>();
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) {
      arrays.set(path, v);
    } else if (v && typeof v === "object") {
      for (const [p, a] of getArrays(v as Record<string, unknown>, path)) arrays.set(p, a);
    }
  }
  return arrays;
}

describe("i18n cross-locale parity", () => {
  const enKeys = new Set(getStructuralKeys(en as unknown as Record<string, unknown>));
  const enArrays = getArrays(en as unknown as Record<string, unknown>);

  // The key-set check treats an array as one leaf, so a locale with fewer
  // entries passes it. Rotating-line components index these arrays with a
  // counter, and a short or blank entry renders as an empty line (#1268).
  it.each(SUPPORTED_LOCALES.filter((l) => l.code !== "en").map((l) => [l.code, l.name]))(
    "%s (%s) has the same array lengths as en, with no blank entries",
    async (code) => {
      const localeArrays = getArrays(
        (await loadTranslations(code)) as unknown as Record<string, unknown>,
      );
      expect(enArrays.size).toBeGreaterThan(0);
      for (const [path, enArray] of enArrays) {
        // An empty array makes the components' `index % length` NaN.
        expect(enArray.length, `en ${path} is empty`).toBeGreaterThan(0);
        const localeArray = localeArrays.get(path);
        expect(localeArray, `locale "${code}" has no array at ${path}`).toBeDefined();
        expect(
          localeArray?.length,
          `locale "${code}" ${path} has ${localeArray?.length} entries, en has ${enArray.length}`,
        ).toBe(enArray.length);
        const blank = (localeArray ?? []).findIndex(
          (entry) => typeof entry !== "string" || entry.trim() === "",
        );
        expect(blank, `locale "${code}" ${path}[${blank}] is blank or not a string`).toBe(-1);
      }
    },
  );

  it("en reference locale has keys", () => {
    expect(enKeys.size).toBeGreaterThan(100);
  });

  it.each(SUPPORTED_LOCALES.filter((l) => l.code !== "en").map((l) => [l.code, l.name]))(
    "%s (%s) has the same key set as en",
    async (code) => {
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
    },
  );

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
