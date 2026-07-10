// tests/unit/scripts/i18n/fake-adapter.ts
// In-memory adapter matching the contract in scripts/i18n/adapter-contract.md.
export function makeFakeAdapter(units: Array<{ id: string; sourceText: string; kind?: string }>) {
  const store = new Map<string, Map<string, any>>(); // locale -> (id -> entry)
  return {
    name: "fake",
    async extract() {
      return units.map((u) => ({ kind: "markdown", ...u }));
    },
    async load(locale: string) {
      return new Map(store.get(locale) ?? new Map());
    },
    async write(locale: string, entries: Map<string, any>) {
      store.set(locale, new Map(entries));
    },
    _store: store,
  };
}
