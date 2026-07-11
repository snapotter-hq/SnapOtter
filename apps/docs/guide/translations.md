---
description: 21 supported languages and how to create or improve translations for SnapOtter using the TypeScript-enforced i18n system.
---

# Translation guide {#translation-guide}

SnapOtter ships with 21 languages out of the box. The i18n system uses a lightweight custom runtime with TypeScript-enforced locale completeness and dynamic code-splitting.

## Supported languages {#supported-languages}

| Code | Language | Native Name | Direction |
|------|----------|-------------|-----------|
| `en` | English | English | LTR |
| `zh-CN` | Chinese (Simplified) | 简体中文 | LTR |
| `zh-TW` | Chinese (Traditional) | 繁體中文 | LTR |
| `ja` | Japanese | 日本語 | LTR |
| `ko` | Korean | 한국어 | LTR |
| `es` | Spanish | Español | LTR |
| `fr` | French | Français | LTR |
| `it` | Italian | Italiano | LTR |
| `pt-BR` | Portuguese (Brazil) | Português (Brasil) | LTR |
| `de` | German | Deutsch | LTR |
| `nl` | Dutch | Nederlands | LTR |
| `sv` | Swedish | Svenska | LTR |
| `ru` | Russian | Русский | LTR |
| `pl` | Polish | Polski | LTR |
| `uk` | Ukrainian | Українська | LTR |
| `ar` | Arabic | العربية | RTL |
| `tr` | Turkish | Türkçe | LTR |
| `hi` | Hindi | हिन्दी | LTR |
| `vi` | Vietnamese | Tiếng Việt | LTR |
| `id` | Indonesian | Bahasa Indonesia | LTR |
| `th` | Thai | ไทย | LTR |

## How language detection works {#how-language-detection-works}

SnapOtter uses a three-tier resolution order:

1. **User preference** - stored in `localStorage("snapotter-locale")` and synced to user settings when authenticated
2. **Browser auto-detect** - walks the `navigator.languages` array with BCP 47 prefix matching
3. **Instance default** - the admin's `DEFAULT_LOCALE` env var (fetched from `GET /api/v1/config/locale`)
4. **English fallback** - always available

Users can change language from:
- The **footer Globe selector** (desktop, always visible)
- The **login page** language selector (pre-auth)
- The **Settings > General** section (per-user preference)
- The **mobile sidebar** language dropdown
- The **Settings > System** section sets the instance-wide default (admin only)

## How translations work {#how-translations-work}

All UI strings live in `packages/shared/src/i18n/`. The reference file is `en.ts`, which exports a typed object with every string the app uses (~1500 keys). Other languages are separate files (e.g., `de.ts`, `fr.ts`) that export the same shape.

The `TranslationKeys` type uses `DeepStringRecord` to accept any string value while enforcing the key structure. TypeScript catches missing keys in any translation file at compile time.

Only the active locale is loaded at runtime via dynamic `import()`, keeping the main bundle small.

## Using translations in components {#using-translations-in-components}

```tsx
import { useTranslation } from "@/contexts/i18n-context";
import { format, plural } from "@/lib/format";

function MyComponent() {
  const { t, locale, setLocale } = useTranslation();
  
  return (
    <div>
      <h1>{t.common.settings}</h1>
      <p>{format(t.settings.people.deleteConfirm, { username: "admin" })}</p>
      <p>{plural(count, t.automate.fileCount, t.automate.fileCountPlural)}</p>
    </div>
  );
}
```

## Contributing a translation {#contributing-a-translation}

We welcome translation PRs directly. You can improve an existing locale or add a new one.

To report a mistranslation without submitting code, open a [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) with the language, the incorrect string, and the suggested fix.

::: tip
Translation PRs do not require prior approval. Fork the repo, make your changes, and open a PR. See the [Contributing Guide](/guide/contributing) for the full PR process and CLA requirement.
:::

## How to create or update a translation {#how-to-create-or-update-a-translation}

### 1. Fork and clone {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. Copy the reference file (new language only) {#_2-copy-the-reference-file-new-language-only}

Skip this step if you are improving an existing translation.

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. Translate the strings {#_3-translate-the-strings}

Open your new file and translate every string value. Keep the object structure and keys exactly the same.

```ts
import type { TranslationKeys } from "./en.js";

export const xx: TranslationKeys = {
  common: {
    upload: "Your translation here",
    // ... translate all entries
  },
  // ... translate all sections
} as const;
```

Rules:
- Do not translate object keys, only string values
- Keep `as const` at the end
- Import `TranslationKeys` from `./en.js` and type your export
- Keep `{variable}` placeholders exactly as-is
- Arrays (`rotatingPhrases`, `progressMessages`) must have the same number of entries
- Do not translate: SnapOtter, JPEG, PNG, WebP, EXIF, API, and other technical terms

### 4. Register the locale (new language only) {#_4-register-the-locale-new-language-only}

Add your locale to `SUPPORTED_LOCALES` in `packages/shared/src/i18n/index.ts`:

```ts
{ code: "xx", name: "Language Name", nativeName: "Native Name", dir: "ltr" },
```

### 5. Verify {#_5-verify}

```bash
pnpm typecheck    # catches missing or mistyped keys
pnpm lint         # formatting check
pnpm dev          # manually verify strings appear correctly
```

### 6. Submit {#_6-submit}

Open a PR against `main` with a title like `feat(i18n): add Swedish translation` or `fix(i18n): correct German typos`. The CLA bot will ask you to sign on your first contribution.

## Adding new translation keys {#adding-new-translation-keys}

When adding a new feature that needs new UI strings:

1. Add the new keys to `en.ts` first (the reference file)
2. Run `pnpm typecheck` - every locale file will fail if missing the new key
3. Add the new key to all locale files (use English as a temporary fallback)

## Configuration {#configuration}

Set the instance default language via environment variable:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## File reference {#file-reference}

| File | Purpose |
|------|---------|
| `packages/shared/src/i18n/en.ts` | English strings (reference locale, ~1500 keys) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, type exports |
| `packages/shared/src/i18n/<locale>.ts` | Per-language translation files |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, `useTranslation()` hook |
| `apps/web/src/lib/format.ts` | `format()`, `plural()`, `formatFileSize()` helpers |
| `apps/api/src/routes/config.ts` | `GET /api/v1/config/locale` public endpoint |

## Translating the website, docs, and API reference {#translating-the-web-surfaces}

The 21-language support above covers the **app**. The public website
(snapotter.com), this documentation site, and the REST API reference are also
translated into all 21 languages, by a separate hash-gated pipeline that reuses
the same tool names and descriptions from `packages/shared/src/i18n`, so
terminology stays consistent everywhere.

### Machine-translated by default {#machine-translated-by-default}

Every non-English page on the website and docs is **machine-translated** on the
first pass (by a Claude Code session, not a third-party service) and carries a
small, dismissible banner saying so, with a link back here. That is deliberate:
it ships all 21 languages quickly and honestly, then invites the community to
refine the pages that matter most. Machine translation gets the meaning across;
human review makes it read naturally.

### How the pipeline decides what to translate {#how-the-web-pipeline-decides}

Each translatable unit of English source is hashed, and the hash is stored next
to its translation. On each run the pipeline:

- translates any unit that has no translation yet,
- skips any unit whose stored hash still matches the English source,
- re-translates a **machine** unit when its English source changes,
- and flags a **human**-refined unit as `stale` (needs review) when its English
  source changes, instead of overwriting your work.

### Refining a web translation by PR {#refining-a-web-translation-by-pr}

You improve a website, docs, or API-reference translation the same way you
improve an app locale: by editing the generated file and opening a PR.

1. Find the generated translation for your language:
   - website UI strings: `apps/landing/src/i18n/<locale>.json`
   - a docs page: `apps/docs/<locale>/**.md`
   - the API reference: `apps/api/src/openapi.<locale>.yaml`
2. Edit the text. Keep code, links, `{placeholders}`, and any `⸤I18N…⸥` markers
   exactly as they are; the pipeline's validator rejects a translation that drops
   or reorders them.
3. Open a PR. Editing a unit flips its provenance from `machine` to `human`, so
   the pipeline will **never overwrite it** on a later run. If the English source
   changes afterwards, your unit is flagged `stale` for review rather than
   silently replaced.

To report a mistranslation without submitting code, open a
[GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) with the page
URL, the language, the incorrect text, and your suggested fix.

::: tip
Maintainers run the translation pipeline; you do not need an API key to
contribute. Just edit the generated file and open a PR. See
[`scripts/i18n/README.md`](https://github.com/snapotter-hq/SnapOtter/blob/main/scripts/i18n/README.md)
for how the pipeline runs.
:::
