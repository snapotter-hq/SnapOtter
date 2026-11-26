import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { SUPPORTED_LOCALES } from "../../../packages/shared/src/i18n/index.js";
import { createDocsAdapter } from "../../../scripts/i18n/adapters/docs-md.mjs";
import { hash } from "../../../scripts/i18n/lib/hash.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const docsRoot = join(root, "apps/docs");
const UNIT_ID = "tools/conversion-presets.md";
const localeCodes = SUPPORTED_LOCALES.map((l) => l.code).filter((c) => c !== "en");

// Maps each preset id to the extensions in its "Accepted inputs" column.
// Locales separate the list with ",", "、" or "،", so only the backticked
// extensions are compared.
function acceptedInputsByPreset(markdown: string): Map<string, string[]> {
  const rows = new Map<string, string[]>();
  for (const line of markdown.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    const id = cells[1]?.match(/^`([a-z0-9-]+)`$/)?.[1];
    if (!id || cells.length < 7) continue;
    rows.set(
      id,
      [...cells[5].matchAll(/`(\.[a-z0-9]+)`/g)].map((m) => m[1]),
    );
  }
  return rows;
}

// #5164: the locale copies are human provenance, so `i18n:translate` never
// refreshes them. #5023 added `.hif` to the English HEIC rows and the locales
// silently fell behind until `i18n:check` flagged them as stale.
describe("translated conversion-presets docs stay in sync with English", () => {
  const english = readFileSync(join(docsRoot, UNIT_ID), "utf8");
  const englishInputs = acceptedInputsByPreset(english);

  test("the English table parses and there are 20 locales to check", () => {
    expect(localeCodes).toHaveLength(20);
    expect(englishInputs.size).toBeGreaterThan(50);
    expect(englishInputs.get("heic-to-jpg")).toEqual([".heic", ".heif", ".hif"]);
  });

  test.each(localeCodes)("%s lists the same accepted inputs as English", (locale) => {
    const localized = readFileSync(join(docsRoot, locale, UNIT_ID), "utf8");
    expect(Object.fromEntries(acceptedInputsByPreset(localized))).toEqual(
      Object.fromEntries(englishInputs),
    );
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
