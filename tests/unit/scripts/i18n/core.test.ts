// tests/unit/scripts/i18n/core.test.ts
import { describe, expect, it, vi } from "vitest";
import { collectPending, reportPending, runTranslation } from "../../../../scripts/i18n/core.mjs";
import { hash } from "../../../../scripts/i18n/lib/hash.mjs";
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

describe("collectPending", () => {
  it("marks a new unit pending", () => {
    const units = [{ id: "a", sourceText: "hi" }];
    const { pending, merged, stats } = collectPending(units, new Map());
    expect(pending.map((p: { unit: { id: string } }) => p.unit.id)).toEqual(["a"]);
    expect(stats).toMatchObject({ skipped: 0, stale: 0 });
    expect(merged.has("a")).toBe(false);
  });

  it("skips a unit whose stored hash matches", () => {
    const units = [{ id: "a", sourceText: "hi" }];
    const stored = new Map([
      ["a", { text: "de", sourceHash: hash("hi"), provenance: "machine", outputHash: hash("de") }],
    ]);
    const { pending, stats } = collectPending(units, stored);
    expect(pending).toEqual([]);
    expect(stats.skipped).toBe(1);
  });

  it("marks a human-edited unit stale when source changed, not pending", () => {
    const units = [{ id: "a", sourceText: "hello" }];
    const stored = new Map([
      [
        "a",
        {
          text: "menschlich",
          sourceHash: hash("hi"),
          provenance: "machine",
          outputHash: hash("de"),
        },
      ],
    ]);
    const { pending, merged, stats } = collectPending(units, stored);
    expect(pending).toEqual([]);
    expect(stats.stale).toBe(1);
    expect(merged.get("a")).toMatchObject({ provenance: "human", stale: true, text: "menschlich" });
  });
});

describe("reportPending", () => {
  it("counts pending, skipped, and stale units per locale without writing (#916)", async () => {
    const units = [
      { id: "new", sourceText: "fresh" },
      { id: "same", sourceText: "hi" },
      { id: "edited", sourceText: "hello" },
    ];
    const adapter = makeFakeAdapter(units);
    adapter._store.set(
      "de",
      new Map<string, any>([
        [
          "same",
          {
            text: "de:hi",
            sourceHash: hash("hi"),
            provenance: "machine",
            outputHash: hash("de:hi"),
          },
        ],
        [
          "edited",
          {
            text: "menschlich",
            sourceHash: hash("hey"),
            provenance: "human",
            outputHash: hash("x"),
          },
        ],
      ]),
    );
    const before = new Map(adapter._store.get("de"));
    const write = vi.spyOn(adapter, "write");

    const summary = await reportPending({ adapter, locales: ["en", "de", "fr"] });

    expect(write).not.toHaveBeenCalled();
    expect(adapter._store.get("de")).toEqual(before);
    expect(adapter._store.has("fr")).toBe(false);
    expect(summary).toEqual({
      de: { pending: 1, skipped: 1, stale: 1 },
      fr: { pending: 3, skipped: 0, stale: 0 },
    });
  });

  it("counts stale human units as pending under refreshStale", async () => {
    const adapter = makeFakeAdapter([{ id: "a", sourceText: "hello" }]);
    adapter._store.set(
      "de",
      new Map<string, any>([
        [
          "a",
          {
            text: "menschlich",
            sourceHash: hash("hi"),
            provenance: "human",
            outputHash: hash("x"),
          },
        ],
      ]),
    );
    const summary = await reportPending({ adapter, locales: ["de"], refreshStale: true });
    expect(summary.de).toEqual({ pending: 1, skipped: 0, stale: 0 });
  });
});
