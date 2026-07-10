<!-- scripts/i18n/adapter-contract.md -->
# i18n adapter contract

Each surface (landing UI, landing SEO, docs, API spec) implements one adapter object:

```js
export const adapter = {
  name: "docs",                                  // unique surface key used on the CLI
  async extract() { /* return Unit[] */ },
  async load(locale) { /* return Map<id, StoredEntry> */ },
  async write(locale, entries) { /* persist Map<id, StoredEntry> */ },
};
```

Unit: `{ id: string, sourceText: string, kind: "markdown"|"text"|"html", context?: string }`
- `id` must be stable across runs (a file path, a data key). It keys the stored translation.

StoredEntry (written and read back by the adapter, hashes stored inline per the spec):
`{ text: string, sourceHash: string, provenance: "machine"|"human", outputHash: string, stale?: boolean }`

Rules the adapter owns:
- `load` reads whatever inline representation the surface uses (frontmatter for `.md`,
  `_sourceHash`/`_meta` for JSON) and reconstructs `StoredEntry`.
- `write` persists it back in that same representation. `stale: true` entries keep their
  existing `text` and should surface a review marker in the file (e.g. a frontmatter flag).
- Adapters never call the model. They only extract and persist. `core.mjs` owns gating.
