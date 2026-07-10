// tests/unit/scripts/i18n/shared-i18n.test.ts
import { describe, expect, it } from "vitest";
import { loadToolStrings, localeCodes } from "../../../../scripts/i18n/lib/shared-i18n.mjs";

describe("shared-i18n", () => {
  it("returns all 21 locale codes including en and ar", () => {
    const codes = localeCodes();
    expect(codes).toContain("en");
    expect(codes).toContain("ar");
    expect(codes).toContain("pt-BR");
    expect(codes.length).toBe(21);
  });

  it("loads translated tool name/description for a locale", async () => {
    const en = await loadToolStrings("en");
    expect(en.convert).toBeTruthy();
    expect(typeof en.convert.name).toBe("string");
    const de = await loadToolStrings("de");
    expect(de.convert.name).toBeTruthy();
  });
});
