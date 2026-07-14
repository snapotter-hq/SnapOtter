import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SUPPORTED_LOCALES } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../../..");

function readRestGuide(locale: string): string {
  const localizedPath = locale === "en" ? [] : [locale];
  return readFileSync(join(root, "apps/docs", ...localizedPath, "api/rest.md"), "utf8");
}

function genericBatchSection(content: string, locale: string): string {
  const anchor = "{#batch-processing}";
  const anchorIndex = content.indexOf(anchor);
  expect(anchorIndex, `${locale} batch section anchor`).toBeGreaterThanOrEqual(0);

  const bodyStart = content.indexOf("\n", anchorIndex) + 1;
  const nextSection = content.indexOf("\n## ", bodyStart);
  expect(nextSection, `${locale} next section heading`).toBeGreaterThan(bodyStart);
  return content.slice(bodyStart, nextSection);
}

describe("localized REST batch documentation", () => {
  it("states that ocr-pdf supports the generic batch route without listing it as custom", () => {
    expect(SUPPORTED_LOCALES).toHaveLength(21);

    for (const { code } of SUPPORTED_LOCALES) {
      const section = genericBatchSection(readRestGuide(code), code);
      const assertionLines = section.split("\n").filter((line) => line.includes("`ocr-pdf`"));

      expect(assertionLines, `${code} support assertion`).toHaveLength(1);
      expect(assertionLines[0], `${code} generic batch route`).toContain("`/batch`");
      expect(section.replaceAll("ocr-pdf", ""), `${code} stale OCR exclusion`).not.toMatch(
        /\bocr\b/i,
      );
    }
  });
});
