// tests/unit/scripts/i18n/core.test.ts
import { describe, expect, it, vi } from "vitest";
import { runTranslation } from "../../../../scripts/i18n/core.mjs";
import { makeFakeAdapter } from "./fake-adapter";

const echo = (units: any[], locale: string) =>
  Promise.resolve(new Map(units.map((u) => [u.id, `${locale}:${u.sourceText}`])));

describe("runTranslation", () => {
  it("translates all units on a cold run", async () => {
    const adapter = makeFakeAdapter([{ id: "a", sourceText: "hi" }]);
    const summary = await runTranslation({ adapter, locales: ["de"], translate: echo });
    expect(summary.de.translated).toBe(1);
    expect((adapter._store.get("de") as Map<string, any>).get("a").text).toBe("de:hi");
  });

  it("skips unchanged units on a second run (hash-gating)", async () => {
    const adapter = makeFakeAdapter([{ id: "a", sourceText: "hi" }]);
    const translate = vi.fn(echo);
    await runTranslation({ adapter, locales: ["de"], translate });
    translate.mockClear();
    const summary = await runTranslation({ adapter, locales: ["de"], translate });
    expect(translate).not.toHaveBeenCalled();
    expect(summary.de.skipped).toBe(1);
  });

  it("re-translates a machine unit when its source changes", async () => {
    const units = [{ id: "a", sourceText: "hi" }];
    const adapter = makeFakeAdapter(units);
    await runTranslation({ adapter, locales: ["de"], translate: echo });
    units[0].sourceText = "hello";
    const summary = await runTranslation({ adapter, locales: ["de"], translate: echo });
    expect(summary.de.translated).toBe(1);
    expect((adapter._store.get("de") as Map<string, any>).get("a").text).toBe("de:hello");
  });

  it("marks a human-edited unit stale instead of overwriting when source changes", async () => {
    const units = [{ id: "a", sourceText: "hi" }];
    const adapter = makeFakeAdapter(units);
    await runTranslation({ adapter, locales: ["de"], translate: echo });
    // Simulate a human refining the translation in the store.
    const entry = (adapter._store.get("de") as Map<string, any>).get("a");
    entry.text = "menschlich";
    // Source then changes upstream.
    units[0].sourceText = "hello";
    const summary = await runTranslation({ adapter, locales: ["de"], translate: echo });
    expect(summary.de.stale).toBe(1);
    expect(summary.de.translated).toBe(0);
    expect((adapter._store.get("de") as Map<string, any>).get("a").text).toBe("menschlich");
  });

  it("records a failed unit and keeps prior text when validation fails", async () => {
    const adapter = makeFakeAdapter([{ id: "a", sourceText: "keep `code` here" }]);
    // Translator drops the code span -> validator rejects.
    const bad = (units: any[], locale: string) =>
      Promise.resolve(new Map(units.map((u) => [u.id, `${locale} no code`])));
    const summary = await runTranslation({ adapter, locales: ["de"], translate: bad });
    expect(summary.de.failed).toBe(1);
    expect(summary.de.translated).toBe(0);
  });
});
