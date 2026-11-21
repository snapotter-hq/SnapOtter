import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "../../../packages/shared/src/i18n/index.js";
import { createDocsAdapter } from "../../../scripts/i18n/adapters/docs-md.mjs";
import { hash } from "../../../scripts/i18n/lib/hash.mjs";

const UNIT = "tools/files/convert-font.md";
const LOCALES = SUPPORTED_LOCALES.map((l) => l.code).filter((c) => c !== "en");

describe("convert-font docs page translations (#5054)", () => {
  it("exists in every docs locale at the current English source hash", async () => {
    const adapter = createDocsAdapter();
    const source = (await adapter.extract()).find((u) => u.id === UNIT);
    expect(source).toBeDefined();
    const sourceHash = hash(source?.sourceText ?? "");

    expect(LOCALES).toHaveLength(20);
    for (const locale of LOCALES) {
      const entry = (await adapter.load(locale)).get(UNIT);
      expect(entry, locale).toBeDefined();
      expect(entry?.sourceHash, locale).toBe(sourceHash);
      expect(entry?.stale, locale).toBe(false);
    }
  });
});
