---
description: "21 lingue supportate e come creare o migliorare le traduzioni di SnapOtter usando il sistema i18n con completezza garantita da TypeScript."
i18n_source_hash: 55837d9fdaef
i18n_provenance: human
i18n_output_hash: 31e121da72c9
---

# Guida alla traduzione {#translation-guide}

SnapOtter include 21 lingue pronte all'uso. Il sistema i18n usa un runtime personalizzato leggero, con completezza dei locale garantita da TypeScript e code-splitting dinamico.

## Lingue supportate {#supported-languages}

| Code | Language | Native Name | Direction |
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
| `th` | Thailandese | ไทย | LTR |

## Come funziona il rilevamento della lingua {#how-language-detection-works}

SnapOtter usa un ordine di risoluzione a tre livelli:

1. **Preferenza dell'utente** - memorizzata in `localStorage("snapotter-locale")` e sincronizzata con le impostazioni utente quando si è autenticati
2. **Rilevamento automatico del browser** - scorre l'array `navigator.languages` con corrispondenza per prefisso BCP 47
3. **Impostazione predefinita dell'istanza** - la variabile d'ambiente `DEFAULT_LOCALE` dell'amministratore (recuperata da `GET /api/v1/config/locale`)
4. **Fallback all'inglese** - sempre disponibile

Gli utenti possono cambiare lingua da:
- Il **selettore Globo nel footer** (desktop, sempre visibile)
- Il selettore di lingua della **pagina di login** (pre-autenticazione)
- La sezione **Impostazioni > Generale** (preferenza per singolo utente)
- Il menu a tendina della lingua nella **barra laterale mobile**
- La sezione **Impostazioni > Sistema** imposta l'impostazione predefinita a livello di istanza (solo amministratore)

## Come funzionano le traduzioni {#how-translations-work}

Tutte le stringhe dell'interfaccia si trovano in `packages/shared/src/i18n/`. Il file di riferimento è `en.ts`, che esporta un oggetto tipizzato con ogni stringa usata dall'app (~1500 chiavi). Le altre lingue sono file separati (ad esempio `de.ts`, `fr.ts`) che esportano la stessa struttura.

Il tipo `TranslationKeys` usa `DeepStringRecord` per accettare qualsiasi valore stringa pur imponendo la struttura delle chiavi. TypeScript individua le chiavi mancanti in qualsiasi file di traduzione al momento della compilazione.

Al runtime viene caricato solo il locale attivo tramite `import()` dinamico, mantenendo piccolo il bundle principale.

## Usare le traduzioni nei componenti {#using-translations-in-components}

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

Accogliamo con favore le PR di traduzione dirette. Puoi migliorare un locale esistente o aggiungerne uno nuovo.

Per segnalare una traduzione errata senza inviare codice, apri una [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) indicando la lingua, la stringa errata e la correzione suggerita.

::: tip 
Le PR di traduzione non richiedono un'approvazione preliminare. Fai il fork del repository, apporta le tue modifiche e apri una PR. Consulta la [Guida al contributo](/it/guide/contributing) per l'intero processo di PR e i requisiti CLA.
:::

## Come creare o aggiornare una traduzione {#how-to-create-or-update-a-translation}

### 1. Fai il fork e clona {#_1-fork-and-clone}

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

Apri il tuo nuovo file e traduci ogni valore stringa. Mantieni identiche la struttura dell'oggetto e le chiavi.

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
- Mantieni i segnaposto `{variable}` esattamente come sono
- Gli array (`rotatingPhrases`, `progressMessages`) devono avere lo stesso numero di voci
- Non tradurre: SnapOtter, JPEG, PNG, WebP, EXIF, API e altri termini tecnici

### 4. Registra il locale (solo per una nuova lingua) {#_4-register-the-locale-new-language-only}

Aggiungi il tuo locale a `SUPPORTED_LOCALES` in `packages/shared/src/i18n/index.ts`:

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

Apri una PR verso `main` con un titolo come `feat(i18n): add Swedish translation` o `fix(i18n): correct German typos`. Il bot CLA ti chiederà di firmare al tuo primo contributo.

## Aggiungere nuove chiavi di traduzione {#adding-new-translation-keys}

Quando aggiungi una nuova funzionalità che necessita di nuove stringhe dell'interfaccia:

1. Aggiungi prima le nuove chiavi a `en.ts` (il file di riferimento)
2. Esegui `pnpm typecheck` - ogni file di locale fallirà se manca la nuova chiave
3. Aggiungi la nuova chiave a tutti i file di locale (usa l'inglese come fallback temporaneo)

## Configurazione {#configuration}

Imposta la lingua predefinita dell'istanza tramite variabile d'ambiente:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## Riferimento dei file {#file-reference}

| File | Purpose |
|------|---------|
| `packages/shared/src/i18n/en.ts` | Stringhe in inglese (locale di riferimento, ~1500 chiavi) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, export dei tipi |
| `packages/shared/src/i18n/<locale>.ts` | File di traduzione per lingua |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, hook `useTranslation()` |
| `apps/web/src/lib/format.ts` | Helper `format()`, `plural()`, `formatFileSize()` |
| `apps/api/src/routes/config.ts` | Endpoint pubblico `GET /api/v1/config/locale` |

## Tradurre il sito web, la documentazione e il riferimento API {#translating-the-web-surfaces}

Il supporto per 21 lingue descritto sopra riguarda l'**app**. Anche il sito web pubblico
(snapotter.com), questo sito di documentazione e il riferimento API REST sono
tradotti in tutte le 21 lingue, tramite una pipeline separata regolata dagli hash che riutilizza
gli stessi nomi e descrizioni dei tool da `packages/shared/src/i18n`, così che la
terminologia resti coerente ovunque.

### Tradotto automaticamente per impostazione predefinita {#machine-translated-by-default}

Ogni pagina non in inglese del sito web e della documentazione viene **tradotta automaticamente** al
primo passaggio (da una sessione di Claude Code, non da un servizio di terze parti) e riporta un
piccolo banner richiudibile che lo segnala, con un link di ritorno a questa pagina. È una scelta deliberata:
consente di rilasciare tutte le 21 lingue rapidamente e onestamente, per poi invitare la community a
perfezionare le pagine più importanti. La traduzione automatica trasmette il significato;
la revisione umana la rende naturale da leggere.

### Come la pipeline decide cosa tradurre {#how-the-web-pipeline-decides}

Ogni unità traducibile del testo sorgente in inglese viene sottoposta ad hashing, e l'hash viene memorizzato accanto
alla sua traduzione. A ogni esecuzione la pipeline:

- traduce qualsiasi unità che non ha ancora una traduzione,
- salta qualsiasi unità il cui hash memorizzato corrisponde ancora al testo sorgente inglese,
- ritraduce un'unità **machine** quando il suo testo sorgente inglese cambia,
- e contrassegna un'unità perfezionata da un **human** come `stale` (da revisionare) quando il suo testo
  sorgente inglese cambia, invece di sovrascrivere il tuo lavoro.

### Perfezionare una traduzione web tramite PR {#refining-a-web-translation-by-pr}

Migliori la traduzione di un sito web, della documentazione o del riferimento API nello stesso modo in cui
migliori un locale dell'app: modificando il file generato e aprendo una PR.

1. Trova la traduzione generata per la tua lingua:
   - stringhe dell'interfaccia del sito web: `apps/landing/src/i18n/<locale>.json`
   - una pagina di documentazione: `apps/docs/<locale>/**.md`
   - il riferimento API: `apps/api/src/openapi.<locale>.yaml`
2. Modifica il testo. Mantieni il codice, i link, `{placeholders}` e qualsiasi marcatore `⸤I18N…⸥`
   esattamente come sono; il validatore della pipeline rifiuta una traduzione che li elimina
   o li riordina.
3. Apri una PR. La modifica di un'unità cambia la sua provenienza da `machine` a `human`, così che
   la pipeline **non la sovrascriverà mai** in un'esecuzione successiva. Se in seguito il testo sorgente inglese
   cambia, la tua unità viene contrassegnata come `stale` per la revisione anziché essere
   sostituita silenziosamente.

Per segnalare una traduzione errata senza inviare codice, apri una
[GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) indicando l'URL della pagina,
la lingua, il testo errato e la tua correzione suggerita.

::: tip 
I maintainer eseguono la pipeline di traduzione; non hai bisogno di una chiave API per
contribuire. Basta modificare il file generato e aprire una PR. Consulta
[`scripts/i18n/README.md`](https://github.com/snapotter-hq/SnapOtter/blob/main/scripts/i18n/README.md)
per sapere come viene eseguita la pipeline.
:::