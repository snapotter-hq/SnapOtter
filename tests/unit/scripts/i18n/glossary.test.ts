// tests/unit/scripts/i18n/glossary.test.ts
import { describe, expect, it } from "vitest";
import { buildSystemPrompt, DO_NOT_TRANSLATE } from "../../../../scripts/i18n/lib/glossary.mjs";

describe("glossary", () => {
  it("keeps the product name and format terms untranslated", () => {
    expect(DO_NOT_TRANSLATE).toContain("SnapOtter");
    expect(DO_NOT_TRANSLATE).toContain("WebP");
  });

  it("builds a system prompt naming the target language and the rules", () => {
    const prompt = buildSystemPrompt("de");
    expect(prompt).toContain("German");
    expect(prompt).toContain("SnapOtter");
    expect(prompt).toMatch(/do not translate|keep.*unchanged/i);
    expect(prompt).toMatch(/⸤I18N/); // must warn about the token markers
  });

  it("throws on an unknown locale so typos fail loudly", () => {
    expect(() => buildSystemPrompt("xx")).toThrow();
  });
});
