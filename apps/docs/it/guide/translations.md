---
description: "21 lingue supportate e come creare o migliorare le traduzioni per SnapOtter usando il sistema i18n con verifica TypeScript."
i18n_source_hash: 0fdac8be0c98
i18n_provenance: machine
i18n_output_hash: dce69e1760d8
---

# Guida alle traduzioni {#translation-guide}

SnapOtter include 21 lingue di serie. Il sistema i18n usa un runtime personalizzato leggero con completezza delle localizzazioni garantita da TypeScript e code-splitting dinamico.

## Lingue supportate {#supported-languages}

| Codice | Lingua | Nome nativo | Direzione |
|------|----------|-------------|-----------|
| `en` | Inglese | English | LTR |
| `zh-CN` | Cinese (semplificato) | 简体中文 | LTR |
| `zh-TW` | Cinese (tradizionale) | 繁體中文 | LTR |
| `ja` | Giapponese | 日本語 | LTR |
| `ko` | Coreano | 한국어 | LTR |
| `es` | Spagnolo | Español | LTR |
| `fr` | Francese | Français | LTR |
| `it` | Italiano | Italiano | LTR |
| `pt-BR` | Portoghese (Brasile) | Português (Brasil) | LTR |
| `de` | Tedesco | Deutsch | LTR |
| `nl` | Olandese | Nederlands | LTR |
| `sv` | Svedese | Svenska | LTR |
| `ru` | Russo | Русский | LTR |
| `pl` | Polacco | Polski | LTR |
| `uk` | Ucraino | Українська | LTR |
| `ar` | Arabo | العربية | RTL |
| `tr` | Turco | Türkçe | LTR |
| `hi` | Hindi | हिन्दी | LTR |
| `vi` | Vietnamita | Tiếng Việt | LTR |
| `id` | Indonesiano | Bahasa Indonesia | LTR |
| `th` | Thai | ไทย | LTR |

## Come funziona il rilevamento della lingua {#how-language-detection-works}

SnapOtter usa un ordine di risoluzione a tre livelli:

1. **Preferenza utente** - memorizzata in `localStorage("snapotter-locale")` e sincronizzata con le impostazioni utente quando si è autenticati
2. **Rilevamento automatico del browser** - scorre l'array `navigator.languages` con corrispondenza dei prefissi BCP 47
3. **Predefinita dell'istanza** - la variabile d'ambiente `DEFAULT_LOCALE` dell'amministratore (recuperata da `GET /api/v1/config/locale`)
4. **Fallback in inglese** - sempre disponibile

Gli utenti possono cambiare lingua da:
- Il **selettore Globo nel footer** (desktop, sempre visibile)
- Il selettore di lingua nella **pagina di login** (pre-autenticazione)
- La sezione **Impostazioni > Generale** (preferenza per singolo utente)
- Il menu a discesa della lingua nella **barra laterale mobile**
- La sezione **Impostazioni > Sistema** imposta la predefinita a livello di istanza (solo amministratore)

## Come funzionano le traduzioni {#how-translations-work}

Tutte le stringhe dell'interfaccia risiedono in `packages/shared/src/i18n/`. Il file di riferimento è `en.ts`, che esporta un oggetto tipizzato con ogni stringa usata dall'app (~1500 chiavi). Le altre lingue sono file separati (ad es. `de.ts`, `fr.ts`) che esportano la stessa struttura.

Il tipo `TranslationKeys` usa `DeepStringRecord` per accettare qualsiasi valore stringa applicando al contempo la struttura delle chiavi. TypeScript rileva le chiavi mancanti in qualsiasi file di traduzione in fase di compilazione.

Solo la localizzazione attiva viene caricata in fase di esecuzione tramite `import()` dinamico, mantenendo piccolo il bundle principale.

## Uso delle traduzioni nei componenti {#using-translations-in-components}

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

## Contribuire con una traduzione {#contributing-a-translation}

Accettiamo volentieri PR di traduzione dirette. Puoi migliorare una localizzazione esistente o aggiungerne una nuova.

Per segnalare una traduzione errata senza inviare codice, apri una [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) indicando la lingua, la stringa errata e la correzione suggerita.

::: tip 
Le PR di traduzione non richiedono un'approvazione preventiva. Fai il fork del repository, apporta le tue modifiche e apri una PR. Consulta la [Guida al contributo](/it/guide/contributing) per l'intero processo di PR e il requisito CLA.
:::

## Come creare o aggiornare una traduzione {#how-to-create-or-update-a-translation}

### 1. Fork e clone {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. Copia il file di riferimento (solo per una nuova lingua) {#_2-copy-the-reference-file-new-language-only}

Salta questo passaggio se stai migliorando una traduzione esistente.

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. Traduci le stringhe {#_3-translate-the-strings}

Apri il tuo nuovo file e traduci ogni valore stringa. Mantieni la struttura dell'oggetto e le chiavi esattamente identiche.

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

Regole:
- Non tradurre le chiavi dell'oggetto, solo i valori stringa
- Mantieni `as const` alla fine
- Importa `TranslationKeys` da `./en.js` e tipizza il tuo export
- Mantieni i segnaposto `{variable}` esattamente com'erano
- Gli array (`rotatingPhrases`, `progressMessages`) devono avere lo stesso numero di elementi
- Non tradurre: SnapOtter, JPEG, PNG, WebP, EXIF, API e altri termini tecnici

### 4. Registra la localizzazione (solo per una nuova lingua) {#_4-register-the-locale-new-language-only}

Aggiungi la tua localizzazione a `SUPPORTED_LOCALES` in `packages/shared/src/i18n/index.ts`:

```ts
{ code: "xx", name: "Language Name", nativeName: "Native Name", dir: "ltr" },
```

### 5. Verifica {#_5-verify}

```bash
pnpm typecheck    # catches missing or mistyped keys
pnpm lint         # formatting check
pnpm dev          # manually verify strings appear correctly
```

### 6. Invia {#_6-submit}

Apri una PR verso `main` con un titolo tipo `feat(i18n): add Swedish translation` o `fix(i18n): correct German typos`. Il bot CLA ti chiederà di firmare al tuo primo contributo.

## Aggiunta di nuove chiavi di traduzione {#adding-new-translation-keys}

Quando aggiungi una nuova funzionalità che richiede nuove stringhe dell'interfaccia:

1. Aggiungi prima le nuove chiavi a `en.ts` (il file di riferimento)
2. Esegui `pnpm typecheck` - ogni file di localizzazione fallirà se manca la nuova chiave
3. Aggiungi la nuova chiave a tutti i file di localizzazione (usa l'inglese come fallback temporaneo)

## Configurazione {#configuration}

Imposta la lingua predefinita dell'istanza tramite variabile d'ambiente:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## Riferimento dei file {#file-reference}

| File | Scopo |
|------|---------|
| `packages/shared/src/i18n/en.ts` | Stringhe in inglese (localizzazione di riferimento, ~1500 chiavi) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, export dei tipi |
| `packages/shared/src/i18n/<locale>.ts` | File di traduzione per singola lingua |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, hook `useTranslation()` |
| `apps/web/src/lib/format.ts` | Funzioni di supporto `format()`, `plural()`, `formatFileSize()` |
| `apps/api/src/routes/config.ts` | Endpoint pubblico `GET /api/v1/config/locale` |
