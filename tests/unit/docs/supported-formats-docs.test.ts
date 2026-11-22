import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { SUPPORTED_LOCALES } from "../../../packages/shared/src/i18n/index.js";
import { createDocsAdapter } from "../../../scripts/i18n/adapters/docs-md.mjs";
import { hash } from "../../../scripts/i18n/lib/hash.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const docsRoot = join(root, "apps/docs");
const UNIT_ID = "guide/supported-formats.md";
const localeCodes = SUPPORTED_LOCALES.map((l) => l.code).filter((c) => c !== "en");

// The extension lists of every table row, in page order. Format names and
// notes are translated, but the extensions are not, so they must match
// English row for row.
function tableExtensions(markdown: string): string[] {
  return markdown
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) => [...line.matchAll(/(?<![\w/.])\.[a-z0-9]{2,5}\b/g)].map((m) => m[0]).join(" "))
    .filter((exts) => exts.length > 0);
}

// #5195: the locale copies are human provenance, so `i18n:translate` never
// refreshes them. #5023 added `.hif` to the English HEIC/HEIF row and the
// locales silently fell behind until `i18n:check` flagged them as stale.
describe("translated supported-formats docs stay in sync with English", () => {
  const english = readFileSync(join(docsRoot, UNIT_ID), "utf8");
  const englishExtensions = tableExtensions(english);

  test("the English tables parse and there are 20 locales to check", () => {
    expect(localeCodes).toHaveLength(20);
    expect(englishExtensions.length).toBeGreaterThan(30);
    expect(englishExtensions).toContain(".heic .heif .hif");
  });

  test.each(localeCodes)("%s lists the same extensions as English", (locale) => {
    const localized = readFileSync(join(docsRoot, locale, UNIT_ID), "utf8");
    expect(tableExtensions(localized)).toEqual(englishExtensions);
  });

  test("every locale's hash stamps match the English source and its own text", async () => {
    const adapter = createDocsAdapter({ root: docsRoot });
    const source = (await adapter.extract()).find((u: { id: string }) => u.id === UNIT_ID);
    expect(source).toBeDefined();
    const sourceHash = hash(source?.sourceText ?? "");

    for (const locale of localeCodes) {
      const entry = (await adapter.load(locale)).get(UNIT_ID);
      expect(entry, locale).toBeDefined();
      expect(entry?.sourceHash, `${locale} sourceHash`).toBe(sourceHash);
      expect(entry?.outputHash, `${locale} outputHash`).toBe(hash(entry?.text ?? ""));
      expect(entry?.stale, `${locale} stale`).toBe(false);
    }
  });
});
