import { describe, expect, it } from "vitest";
import { adapter as docsAdapter } from "../../../scripts/i18n/adapters/docs-md.mjs";
import { collectPending } from "../../../scripts/i18n/core.mjs";
import { hash } from "../../../scripts/i18n/lib/hash.mjs";
import { localeCodes } from "../../../scripts/i18n/lib/shared-i18n.mjs";

// These tool pages shipped in English only because their PRs never ran the
// docs translation handoff, so no translated docs site had them (#5256).
const LOCALES: string[] = localeCodes().filter((c: string) => c !== "en");
const PAGES = [
  "tools/video/convert-subtitles.md",
  "tools/files/base64.md",
  "tools/files/convert-case.md",
  "tools/files/proportion-calculator.md",
  "tools/pdf/resize-pdf-pages.md",
];

type Unit = { id: string; sourceText: string };

describe("translated docs pages for recently added tools (#5256)", () => {
  it("finds every page in the English docs", async () => {
    const ids = (await docsAdapter.extract()).map((u: Unit) => u.id);
    for (const page of PAGES) expect(ids).toContain(page);
  });

  it.each(LOCALES)("has every page translated and hash-current in %s", async (locale: string) => {
    const units: Unit[] = (await docsAdapter.extract()).filter((u: Unit) => PAGES.includes(u.id));
    const stored = await docsAdapter.load(locale);
    const { pending, stats } = collectPending(units, stored);
    expect(pending.map((p: { unit: Unit }) => p.unit.id)).toEqual([]);
    expect(stats.stale).toBe(0);
    for (const unit of units) {
      const entry = stored.get(unit.id);
      expect(entry?.sourceHash, unit.id).toBe(hash(unit.sourceText));
      expect(entry?.text, unit.id).not.toBe(unit.sourceText);
    }
  });
});
