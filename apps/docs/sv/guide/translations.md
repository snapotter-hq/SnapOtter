---
description: "21 språk som stöds och hur du skapar eller förbättrar översättningar för SnapOtter med det TypeScript-genomdrivna i18n-systemet."
i18n_source_hash: 55837d9fdaef
i18n_provenance: human
i18n_output_hash: 640b973cf4bc
---

# Översättningsguide {#translation-guide}

SnapOtter levereras med 21 språk direkt ur lådan. i18n-systemet använder en lättviktig egen körmiljö med TypeScript-genomdriven fullständighet för språkversioner och dynamisk koddelning.

## Språk som stöds {#supported-languages}

| Code | Language | Native Name | Direction |
|------|----------|-------------|-----------|
| `en` | Engelska | English | LTR |
| `zh-CN` | Kinesiska (förenklad) | 简体中文 | LTR |
| `zh-TW` | Kinesiska (traditionell) | 繁體中文 | LTR |
| `ja` | Japanska | 日本語 | LTR |
| `ko` | Koreanska | 한국어 | LTR |
| `es` | Spanska | Español | LTR |
| `fr` | Franska | Français | LTR |
| `it` | Italienska | Italiano | LTR |
| `pt-BR` | Portugisiska (Brasilien) | Português (Brasil) | LTR |
| `de` | Tyska | Deutsch | LTR |
| `nl` | Nederländska | Nederlands | LTR |
| `sv` | Svenska | Svenska | LTR |
| `ru` | Ryska | Русский | LTR |
| `pl` | Polska | Polski | LTR |
| `uk` | Ukrainska | Українська | LTR |
| `ar` | Arabiska | العربية | RTL |
| `tr` | Turkiska | Türkçe | LTR |
| `hi` | Hindi | हिन्दी | LTR |
| `vi` | Vietnamesiska | Tiếng Việt | LTR |
| `id` | Indonesiska | Bahasa Indonesia | LTR |
| `th` | Thailändska | ไทย | LTR |

## Så fungerar språkigenkänning {#how-language-detection-works}

SnapOtter använder en upplösningsordning i tre nivåer:

1. **Användarinställning** - lagras i `localStorage("snapotter-locale")` och synkas till användarinställningarna när du är inloggad
2. **Automatisk webbläsardetektering** - går igenom `navigator.languages`-arrayen med BCP 47-prefixmatchning
3. **Standard för instansen** - administratörens miljövariabel `DEFAULT_LOCALE` (hämtad från `GET /api/v1/config/locale`)
4. **Reservspråk engelska** - alltid tillgängligt

Användare kan byta språk från:
- **Jordglobsväljaren i sidfoten** (desktop, alltid synlig)
- Språkväljaren på **inloggningssidan** (före inloggning)
- Avsnittet **Inställningar > Allmänt** (inställning per användare)
- Språkrullgardinen i **mobilens sidopanel**
- Avsnittet **Inställningar > System** anger standardvärdet för hela instansen (endast administratör)

## Så fungerar översättningar {#how-translations-work}

Alla UI-strängar finns i `packages/shared/src/i18n/`. Referensfilen är `en.ts`, som exporterar ett typat objekt med varje sträng appen använder (~1500 nycklar). Övriga språk är separata filer (t.ex. `de.ts`, `fr.ts`) som exporterar samma form.

Typen `TranslationKeys` använder `DeepStringRecord` för att acceptera vilket strängvärde som helst samtidigt som nyckelstrukturen genomdrivs. TypeScript upptäcker saknade nycklar i vilken översättningsfil som helst vid kompileringstillfället.

Endast den aktiva språkversionen laddas vid körning via dynamisk `import()`, vilket håller huvudbunten liten.

## Använda översättningar i komponenter {#using-translations-in-components}

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

## Bidra med en översättning {#contributing-a-translation}

Vi tar gärna emot översättnings-PR:er direkt. Du kan förbättra en befintlig språkversion eller lägga till en ny.

För att rapportera en felöversättning utan att skicka in kod kan du öppna ett [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) med språket, den felaktiga strängen och det föreslagna rättelsen.

::: tip 
Översättnings-PR:er kräver inget godkännande i förväg. Forka repot, gör dina ändringar och öppna en PR. Se [Contributing Guide](/sv/guide/contributing) för hela PR-processen och CLA-kravet.
:::

## Så skapar eller uppdaterar du en översättning {#how-to-create-or-update-a-translation}

### 1. Forka och klona {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. Kopiera referensfilen (endast nytt språk) {#_2-copy-the-reference-file-new-language-only}

Hoppa över det här steget om du förbättrar en befintlig översättning.

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. Översätt strängarna {#_3-translate-the-strings}

Öppna din nya fil och översätt varje strängvärde. Behåll objektstrukturen och nycklarna exakt likadana.

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

Regler:
- Översätt inte objektnycklar, bara strängvärden
- Behåll `as const` i slutet
- Importera `TranslationKeys` från `./en.js` och typa din export
- Behåll `{variable}`-platshållare exakt som de är
- Arrayer (`rotatingPhrases`, `progressMessages`) måste ha samma antal poster
- Översätt inte: SnapOtter, JPEG, PNG, WebP, EXIF, API och andra tekniska termer

### 4. Registrera språkversionen (endast nytt språk) {#_4-register-the-locale-new-language-only}

Lägg till din språkversion i `SUPPORTED_LOCALES` i `packages/shared/src/i18n/index.ts`:

```ts
{ code: "xx", name: "Language Name", nativeName: "Native Name", dir: "ltr" },
```

### 5. Verifiera {#_5-verify}

```bash
pnpm typecheck    # catches missing or mistyped keys
pnpm lint         # formatting check
pnpm dev          # manually verify strings appear correctly
```

### 6. Skicka in {#_6-submit}

Öppna en PR mot `main` med en titel som `feat(i18n): add Swedish translation` eller `fix(i18n): correct German typos`. CLA-boten ber dig signera vid ditt första bidrag.

## Lägga till nya översättningsnycklar {#adding-new-translation-keys}

När du lägger till en ny funktion som behöver nya UI-strängar:

1. Lägg till de nya nycklarna i `en.ts` först (referensfilen)
2. Kör `pnpm typecheck` - varje språkfil misslyckas om den nya nyckeln saknas
3. Lägg till den nya nyckeln i alla språkfiler (använd engelska som tillfälligt reservspråk)

## Konfiguration {#configuration}

Ange instansens standardspråk via en miljövariabel:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## Filreferens {#file-reference}

| File | Purpose |
|------|---------|
| `packages/shared/src/i18n/en.ts` | Engelska strängar (referensspråk, ~1500 nycklar) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, typexporter |
| `packages/shared/src/i18n/<locale>.ts` | Översättningsfiler per språk |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, `useTranslation()`-hook |
| `apps/web/src/lib/format.ts` | `format()`-, `plural()`-, `formatFileSize()`-hjälpfunktioner |
| `apps/api/src/routes/config.ts` | `GET /api/v1/config/locale` publik ändpunkt |

## Översätta webbplatsen, dokumentationen och API-referensen {#translating-the-web-surfaces}

De 21 språk som stöds ovan gäller **appen**. Den publika webbplatsen
(snapotter.com), den här dokumentationssidan och REST-API-referensen är också
översatta till alla 21 språk, av en separat hash-styrd pipeline som återanvänder
samma verktygsnamn och beskrivningar från `packages/shared/src/i18n`, så att
terminologin förblir konsekvent överallt.

### Maskinöversatt som standard {#machine-translated-by-default}

Varje icke-engelsk sida på webbplatsen och i dokumentationen är **maskinöversatt** i
första omgången (av en Claude Code-session, inte en tredjepartstjänst) och bär
en liten, avfärdbar banner som talar om det, med en länk tillbaka hit. Det är ett
medvetet val: det levererar alla 21 språk snabbt och ärligt, och bjuder sedan in
gemenskapen att förfina de sidor som betyder mest. Maskinöversättning för fram
betydelsen; mänsklig granskning gör att den läses naturligt.

### Så avgör pipelinen vad som ska översättas {#how-the-web-pipeline-decides}

Varje översättningsbar enhet av den engelska källan hashas, och hashen lagras
intill sin översättning. Vid varje körning gör pipelinen följande:

- översätter varje enhet som ännu inte har någon översättning,
- hoppar över varje enhet vars lagrade hash fortfarande matchar den engelska källan,
- återöversätter en **maskin**-enhet när dess engelska källa ändras,
- och flaggar en **mänskligt** förfinad enhet som `stale` (behöver granskning) när dess
  engelska källa ändras, i stället för att skriva över ditt arbete.

### Förfina en webböversättning via PR {#refining-a-web-translation-by-pr}

Du förbättrar en översättning av webbplatsen, dokumentationen eller API-referensen på samma sätt som du
förbättrar en språkversion i appen: genom att redigera den genererade filen och öppna en PR.

1. Hitta den genererade översättningen för ditt språk:
   - UI-strängar för webbplatsen: `apps/landing/src/i18n/<locale>.json`
   - en dokumentationssida: `apps/docs/<locale>/**.md`
   - API-referensen: `apps/api/src/openapi.<locale>.yaml`
2. Redigera texten. Behåll kod, länkar, `{placeholders}` och alla `⸤I18N…⸥`-markeringar
   exakt som de är; pipelinens validator avvisar en översättning som tar bort
   eller kastar om dem.
3. Öppna en PR. Att redigera en enhet flippar dess ursprung från `machine` till `human`, så att
   pipelinen **aldrig skriver över den** vid en senare körning. Om den engelska källan
   ändras därefter flaggas din enhet som `stale` för granskning i stället för att
   tyst ersättas.

För att rapportera en felöversättning utan att skicka in kod kan du öppna ett
[GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) med sidans
URL, språket, den felaktiga texten och ditt föreslagna rättelse.

::: tip 
Underhållarna kör översättningspipelinen; du behöver ingen API-nyckel för att
bidra. Redigera bara den genererade filen och öppna en PR. Se
[`scripts/i18n/README.md`](https://github.com/snapotter-hq/SnapOtter/blob/main/scripts/i18n/README.md)
för hur pipelinen körs.
:::
