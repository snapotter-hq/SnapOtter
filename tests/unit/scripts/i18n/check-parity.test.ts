// tests/unit/scripts/i18n/check-parity.test.ts
import { describe, expect, it } from "vitest";
import { checkAdapter } from "../../../../scripts/i18n/check-parity.mjs";
import { hash } from "../../../../scripts/i18n/lib/hash.mjs";
import { makeFakeAdapter } from "./fake-adapter";

// Seed a locale store on the fake adapter with a full, in-sync translation,
// so checkAdapter has something complete to validate against.
// biome-ignore lint/suspicious/noExplicitAny: fake in-memory adapter, untyped by design
async function seedComplete(adapter: any, locale: string) {
  const units = await adapter.extract();
  // biome-ignore lint/suspicious/noExplicitAny: stored entry shape mirrors core.mjs StoredEntry
  const entries = new Map<string, any>();
  for (const u of units) {
    const sourceHash = hash(u.sourceText);
    const text = `${locale}:${u.sourceText}`;
    entries.set(u.id, {
      text,
      sourceHash,
      provenance: "machine",
      outputHash: hash(text),
      stale: false,
    });
  }
  await adapter.write(locale, entries);
}

describe("checkAdapter", () => {
  it("passes when every locale has every unit with a matching source hash", async () => {
    const adapter = makeFakeAdapter([
      { id: "a", sourceText: "hi" },
      { id: "b", sourceText: "bye" },
    ]);
    await seedComplete(adapter, "de");
    await seedComplete(adapter, "fr");
    const report = await checkAdapter(adapter, ["de", "fr"]);
    expect(report.ok).toBe(true);
    expect(report.problems).toEqual([]);
  });

  it("fails and reports the unit when a locale is missing a translation", async () => {
    const adapter = makeFakeAdapter([
      { id: "a", sourceText: "hi" },
      { id: "b", sourceText: "bye" },
    ]);
    await seedComplete(adapter, "de");
    // Drop unit "b" from the German store to simulate an untranslated unit.
    // biome-ignore lint/suspicious/noExplicitAny: fake store is untyped by design
    const de = adapter._store.get("de") as Map<string, any>;
    de.delete("b");
    const report = await checkAdapter(adapter, ["de"]);
    expect(report.ok).toBe(false);
    const joined = report.problems.join(" ");
    expect(joined).toMatch(/de/);
    expect(joined).toMatch(/\bb\b/);
    expect(joined).toMatch(/missing/i);
  });

  it("fails when a stored source hash is stale (English moved under the translation)", async () => {
    const adapter = makeFakeAdapter([{ id: "a", sourceText: "hi" }]);
    await seedComplete(adapter, "de");
    // Corrupt the stored sourceHash so it no longer matches the English source.
    // biome-ignore lint/suspicious/noExplicitAny: fake store is untyped by design
    const de = adapter._store.get("de") as Map<string, any>;
    de.get("a").sourceHash = "deadbeefdead";
    const report = await checkAdapter(adapter, ["de"]);
    expect(report.ok).toBe(false);
    expect(report.problems.join(" ")).toMatch(/stale/i);
  });

  it("skips en and treats it as the source, never a target", async () => {
    const adapter = makeFakeAdapter([{ id: "a", sourceText: "hi" }]);
    await seedComplete(adapter, "de");
    // en is never seeded; it must be ignored even if passed in.
    const report = await checkAdapter(adapter, ["en", "de"]);
    expect(report.ok).toBe(true);
  });
});
