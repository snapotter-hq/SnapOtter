<!-- scripts/i18n/README.md -->
# Web-surfaces translation pipeline

Translates the three public web surfaces (landing site, docs, API reference) into
the 20 non-English languages the main app already supports, gated on content
hashes so only changed English source is re-translated. This is build-time
tooling. It is not shipped in any app runtime and never runs on an end user's
machine.

The pipeline core, the surface adapters, and the CLI live in this directory. The
adapter registry (`adapters/registry.mjs`) is the single source of truth for the
four surfaces (`landing-ui`, `landing-seo`, `docs`, `api`); both `translate.mjs`
and `check-parity.mjs` import it, so the surface list is defined once.

## The engine: a Claude Code batch handoff (no API key)

Translation is a three-step handoff, not a headless API call. There is no
`ANTHROPIC_API_KEY` in the default path and no CI job that spends tokens.

1. **Export.** `--export` collects every pending unit (missing, or whose English
   source moved under a machine translation), masks the parts a translator must
   not touch (code fences, inline code, link URLs, `{placeholders}`), and writes
   one file per surface and locale:
   `.i18n-batches/<surface>.<locale>.pending.json`. Each row is `{ id, masked }`.
2. **Translate.** A human, or a Claude Code session, translates each pending file
   into `.i18n-batches/<surface>.<locale>.done.json`, a flat
   `{ [id]: translatedMaskedText }` map. Every `⸤I18N…⸥` mask token must survive
   verbatim; the import step validates this and rejects a unit that drops or
   reorders one.
3. **Import.** `--import` reads the done files, restores each mask token to its
   original code/URL/placeholder, validates structure, and writes the result
   through the surface adapters (landing JSON + `.meta.json`, per-locale docs
   markdown, `openapi.<locale>.yaml`). Each written unit is stamped `machine`
   with the source hash it was translated against.

An optional `--engine=api` path exists for self-hosters who bring their own key
and want a headless run, but the shipped, CI-safe default is the batch handoff
above.

## Commands

```bash
# 1. Export pending batches (all surfaces, all locales).
pnpm i18n:translate --export

# Scope by surface and/or locale (comma lists).
pnpm i18n:translate --export --surface=docs --locale=de,fr

# 2. Translate each .pending.json into a .done.json (Claude Code session or human).

# 3. Import the done batches back through the adapters.
pnpm i18n:translate --import --surface=docs --locale=de,fr

# Report the change set without exporting or writing anything.
pnpm i18n:translate --dry-run

# Show usage and the currently registered surfaces.
pnpm i18n:translate --help

# Fail if any registered locale is missing a unit or its source hash is stale.
pnpm i18n:check
```

If no adapter is registered, both commands are no-ops: `i18n:translate` prints
"No adapters registered yet" and `i18n:check` passes.

## Chunking a large surface (docs)

The docs surface is by far the biggest: full parity is on the order of thousands
of markdown files. A single `.pending.json` can be large, so translate it in
parallel:

- Split the pending file's rows into chunks by a rough character budget (a few
  thousand chars per chunk keeps each agent's context small and its output
  reviewable), one Claude Code agent per chunk.
- Each agent translates only its slice, preserving every `⸤I18N…⸥` token.
- Merge the per-chunk outputs into one `.done.json` for that locale, keyed by
  `id`, then run `--import`.

Chunk the shared English source once and reuse the slices across locales so every
language sees the same unit boundaries. Because import is idempotent and
hash-gated, a partial merge is safe: re-running import after adding more chunks
only writes the newly present ids.

## How gating works

Each translation unit's English source is hashed (`lib/hash.mjs`, a 12-char
sha256 with CRLF normalized to LF). The hash is stored inline next to the
translation by the adapter, not in a central manifest. Per unit, on export:

- Missing translation: include it in the pending batch.
- Stored hash matches the current English hash: skip it.
- Hash differs and the unit is machine-translated: include it (re-translate).
- Hash differs and the unit was human-refined: mark it `stale` for review and
  keep the human text. The pipeline never overwrites human work.

## Resumability

Import checkpoints every 20 units per locale, so an interrupted run resumes from
the last completed chunk with no duplicated work: a re-run skips everything whose
hash already matches. Exporting again is likewise safe: an already-in-sync unit
is not re-exported, so the pending files shrink to only what still needs work.

## Parity check (local / optional gate)

`pnpm i18n:check` validates every registered adapter against the current English
source and exits non-zero if any locale is missing a unit or carries a stale
source hash. It is the build-time mirror of the app's TypeScript key-parity
guarantee, and it imports the same `adapters/registry.mjs` the CLI does.

Run it before committing regenerated translations. It is documented as a local
and optional gate rather than wired as an always-on required status check: on
this repo, a required context that never reports a conclusion deadlocks
docs-only and landing-only PRs (see the header of `.github/workflows/ci.yml`).
The first surface plan that needs a hard gate can add a non-required
`pull_request` job that runs `pnpm i18n:check`.

## Deliberately no translation CI job

There is intentionally no GitHub Actions workflow that runs the translation
engine. The engine is a Claude Code batch handoff (export, translate, import),
not a headless API call, so there is nothing for a scheduled or dispatched job to
run unattended. Translation is done on demand from a local session; the only CI
touchpoint is the parity check above. A note for anyone tempted to wire one up
later: never pass a list of surfaces or locales through a workflow `inputs` /
`args` field and split it in the job. Workflow inputs arrive as a single string,
which silently breaks list handling. Hardcode the surface/locale set in the
workflow and hard-cap it instead.

## Accepted decisions

Two decisions from the design spec, recorded here as revisit-points, not one-way
doors:

1. **Manual, on-demand translation cadence.** We translate by hand (export ->
   Claude Code session -> import) when content changes warrant it, rather than on
   every push. This keeps the first-pass effort controlled and avoids an
   always-on job. Moving to a scheduled or push-triggered cadence later is a
   process change, not a rewrite.
2. **Full docs coverage was chosen.** We translate the entire docs surface into
   all 20 languages rather than restricting docs to a subset of high-traffic
   languages. That grows VitePress build time and repo size and adds a pagefind
   index per locale. We accept this for the first pass and watch Cloudflare Pages
   build times after docs lands.
