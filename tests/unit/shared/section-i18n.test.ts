import { loadTranslations, SECTIONS, SUPPORTED_LOCALES } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

describe("section names", () => {
  it("covers all 21 locales", () => {
    expect(SUPPORTED_LOCALES).toHaveLength(21);
  });

  it.each(SUPPORTED_LOCALES.map((l) => l.code))("%s has a name for every section", async (code) => {
    const t = await loadTranslations(code);
    const names = t.sections as Record<string, string>;
    for (const section of SECTIONS) {
      expect(names[section.id], `${code} sections.${section.id}`).toEqual(expect.any(String));
      expect(names[section.id].trim()).not.toBe("");
    }
  });
});
