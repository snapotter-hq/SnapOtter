# Translation guide

SnapOtter ships with English by default. The i18n system is designed so adding a new language is straightforward.

## How translations work

All UI strings live in `packages/shared/src/i18n/`. The reference file is `en.ts`, which exports a typed object with every string the app uses. Other languages are separate files (e.g., `de.ts`, `fr.ts`) that export the same shape.

The `TranslationKeys` type is derived from the English file, so TypeScript will catch any missing keys in any translation file.

## Requesting a translation

To request a new language or report a mistranslation, open a [GitHub Issue](https://github.com/snapotter-hq/snapotter/issues) with:

- The language name and locale code (e.g., German / `de`)
- Any specific strings or sections you want translated
- If you have a translation ready, paste the translated strings directly in the issue

We do not accept pull requests. Submitting translations via issues is the right path.

## How to create a translation (for your own fork)

If you are running a fork and want to add a language yourself:

### 1. Copy the reference file

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/de.ts
```

### 2. Translate the strings

Open your new file and translate every string value. Keep the object structure and keys exactly the same - only change the values.

```ts
// packages/shared/src/i18n/de.ts
export const de = {
  common: {
    upload: "Vom Computer hochladen",
    process: "Verarbeiten",
    download: "Herunterladen",
    cancel: "Abbrechen",
    // ... translate all entries
  },
  tools: {
    resize: {
      name: "Grosse andern",
      description: "Grosse nach Pixeln, Prozent oder Social-Media-Vorgaben andern",
    },
    // ... translate all tool entries
  },
  // ... translate all sections: settings, auth, pipeline, nav
} as const;
```

Things to keep in mind:

- Do not translate object keys, only values.
- Keep the `as const` assertion at the end.
- If a string is the same in your language (technical terms, proper nouns), leave the English value.

### 3. Export the new language

Edit `packages/shared/src/i18n/index.ts` to include your language:

```ts
export type { TranslationKeys } from "./en.js";
export { en } from "./en.js";
export { de } from "./de.js";
```

### 4. Verify

```bash
pnpm typecheck    # catches missing or mistyped keys
pnpm dev          # manually verify strings appear correctly
```

## Adding new translation keys

When adding a new feature that needs new UI strings:

1. Add the new keys to `packages/shared/src/i18n/en.ts` first. This is the reference file.
2. Run `pnpm typecheck` to make sure all language files still satisfy the `TranslationKeys` type.

## File reference

| File | Purpose |
|------|---------|
| `packages/shared/src/i18n/en.ts` | English strings (reference locale) |
| `packages/shared/src/i18n/index.ts` | Exports all locales and the `TranslationKeys` type |
| `packages/shared/src/constants.ts` | Tool registry (names/descriptions also live here) |
