// tests/unit/docs/subtitle-format-i18n-sync.test.ts
import { describe, expect, it } from "vitest";
import { adapter as apiAdapter } from "../../../scripts/i18n/adapters/api-spec.mjs";
import { adapter as docsAdapter } from "../../../scripts/i18n/adapters/docs-md.mjs";
import { collectPending } from "../../../scripts/i18n/core.mjs";
import { hash } from "../../../scripts/i18n/lib/hash.mjs";
import { localeCodes } from "../../../scripts/i18n/lib/shared-i18n.mjs";

// #5052 added a format setting to extract-subtitles and four subtitle presets.
// Their docs page and OpenAPI units must stay translated and hash-current in
// every locale, or the translated pages go back to saying "SRT only" (#5166).
const LOCALES = localeCodes().filter((c: string) => c !== "en");
const API_PATHS = ["extract-subtitles", "srt-to-vtt", "vtt-to-srt", "ass-to-srt", "srt-to-ass"].map(
  (tool) => `/api/v1/tools/video/${tool}`,
);
const isApiTarget = (id: string) =>
  API_PATHS.some(
    (p) => id.startsWith(`paths.${p}.`) || id.startsWith(`ptr:/paths/${p.replace(/\//g, "~1")}/`),
  );
// The Hindi spec keeps most tool operation summaries ("Extract Subtitles",
// "SRT to VTT") in English.
const keptEnglish = (locale: string, id: string) =>
  locale === "hi" && /^paths\.\/api\/v1\/tools\/video\/[a-z-]+\.post\.summary$/.test(id);

type Unit = { id: string; sourceText: string };
type Stored = Map<
  string,
  { text: string; sourceHash: string; provenance: "machine" | "human"; outputHash: string }
>;

function expectInSync(units: Unit[], stored: Stored, locale: string) {
  const { pending, stats } = collectPending(units, stored);
  expect(pending.map((p: { unit: Unit }) => p.unit.id)).toEqual([]);
  expect(stats.stale).toBe(0);
  for (const unit of units) {
    const entry = stored.get(unit.id);
    expect(entry?.sourceHash).toBe(hash(unit.sourceText));
    if (!keptEnglish(locale, unit.id)) expect(entry?.text, unit.id).not.toBe(unit.sourceText);
  }
}

describe("subtitle format and preset translations (#5166)", () => {
  it("covers all five operations in the English spec", async () => {
    const units: Unit[] = (await apiAdapter.extract()).filter((u: Unit) => isApiTarget(u.id));
    for (const p of API_PATHS) expect(units.some((u) => u.id.startsWith(`paths.${p}.`))).toBe(true);
  });

  it.each(LOCALES)("keeps the API reference units current in %s", async (locale) => {
    const units: Unit[] = (await apiAdapter.extract()).filter((u: Unit) => isApiTarget(u.id));
    expectInSync(units, await apiAdapter.load(locale), locale);
  });

  it.each(LOCALES)("keeps the extract-subtitles docs page current in %s", async (locale) => {
    const units: Unit[] = (await docsAdapter.extract()).filter(
      (u: Unit) => u.id === "tools/video/extract-subtitles.md",
    );
    expect(units).toHaveLength(1);
    expectInSync(units, await docsAdapter.load(locale), locale);
  });
});
