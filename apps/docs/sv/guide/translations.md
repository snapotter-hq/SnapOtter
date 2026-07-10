---
description: "21 språk som stöds och hur du skapar eller förbättrar översättningar för SnapOtter med det TypeScript-tvingade i18n-systemet."
i18n_source_hash: 0fdac8be0c98
i18n_provenance: human
i18n_output_hash: fa5358ded6d3
---

# Översättningsguide {#translation-guide}

SnapOtter levereras med 21 språk direkt ur lådan. i18n-systemet använder en lättviktig anpassad körmiljö med TypeScript-tvingad locale-fullständighet och dynamisk koddelning.

## Språk som stöds {#supported-languages}

| Kod | Språk | Inhemskt namn | Riktning |
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

## Så fungerar språkidentifiering {#how-language-detection-works}

SnapOtter använder en resolutionsordning i tre nivåer:

1. **Användarinställning** - lagras i `localStorage("snapotter-locale")` och synkas till användarinställningarna när användaren är autentiserad
2. **Automatisk webbläsaridentifiering** - går igenom `navigator.languages`-arrayen med BCP 47-prefixmatchning
3. **Instansens standard** - administratörens `DEFAULT_LOCALE` miljövariabel (hämtas från `GET /api/v1/config/locale`)
4. **Engelsk reserv** - alltid tillgänglig

Användare kan byta språk från:
- **Jordglob-väljaren i sidfoten** (dator, alltid synlig)
- Språkväljaren på **inloggningssidan** (före autentisering)
- Avsnittet **Inställningar > Allmänt** (inställning per användare)
- Rullgardinsmenyn för språk i **mobilsidofältet**
- Avsnittet **Inställningar > System** ställer in standarden för hela instansen (endast administratör)

## Så fungerar översättningar {#how-translations-work}

Alla UI-strängar finns i `packages/shared/src/i18n/`. Referensfilen är `en.ts`, som exporterar ett typat objekt med varje sträng som appen använder (~1500 nycklar). Andra språk är separata filer (t.ex. `de.ts`, `fr.ts`) som exporterar samma form.

Typen `TranslationKeys` använder `DeepStringRecord` för att acceptera vilket strängvärde som helst samtidigt som nyckelstrukturen tvingas. TypeScript fångar upp saknade nycklar i valfri översättningsfil vid kompileringstid.

Endast den aktiva locale-inställningen laddas vid körning via dynamisk `import()`, vilket håller huvudbunten liten.

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

Vi välkomnar översättnings-PR:er direkt. Du kan förbättra en befintlig locale eller lägga till en ny.

För att rapportera en felöversättning utan att skicka in kod, öppna ett [GitHub-ärende](https://github.com/snapotter-hq/SnapOtter/issues) med språket, den felaktiga strängen och det föreslagna korrigeringen.

::: tip 
Översättnings-PR:er kräver inget föregående godkännande. Forka repot, gör dina ändringar och öppna en PR. Se [bidragsguiden](/sv/guide/contributing) för hela PR-processen och CLA-kravet.
:::

## Så skapar eller uppdaterar du en översättning {#how-to-create-or-update-a-translation}

### 1. Forka och klona {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. Kopiera referensfilen (endast nytt språk) {#_2-copy-the-reference-file-new-language-only}

Hoppa över detta steg om du förbättrar en befintlig översättning.

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
- Översätt inte objektnycklar, endast strängvärden
- Behåll `as const` i slutet
- Importera `TranslationKeys` från `./en.js` och typa din export
- Behåll `{variable}`-platshållare exakt som de är
- Arrayer (`rotatingPhrases`, `progressMessages`) måste ha samma antal poster
- Översätt inte: SnapOtter, JPEG, PNG, WebP, EXIF, API och andra tekniska termer

### 4. Registrera localen (endast nytt språk) {#_4-register-the-locale-new-language-only}

Lägg till din locale i `SUPPORTED_LOCALES` i `packages/shared/src/i18n/index.ts`:

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

Öppna en PR mot `main` med en titel som `feat(i18n): add Swedish translation` eller `fix(i18n): correct German typos`. CLA-boten kommer att be dig signera vid ditt första bidrag.

## Lägga till nya översättningsnycklar {#adding-new-translation-keys}

När du lägger till en ny funktion som behöver nya UI-strängar:

1. Lägg först till de nya nycklarna i `en.ts` (referensfilen)
2. Kör `pnpm typecheck` - varje locale-fil kommer att misslyckas om den saknar den nya nyckeln
3. Lägg till den nya nyckeln i alla locale-filer (använd engelska som en tillfällig reserv)

## Konfiguration {#configuration}

Ange instansens standardspråk via miljövariabel:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## Filreferens {#file-reference}

| Fil | Syfte |
|------|---------|
| `packages/shared/src/i18n/en.ts` | Engelska strängar (referens-locale, ~1500 nycklar) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, typexporter |
| `packages/shared/src/i18n/<locale>.ts` | Översättningsfiler per språk |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, `useTranslation()`-hook |
| `apps/web/src/lib/format.ts` | `format()`, `plural()`, `formatFileSize()`-hjälpfunktioner |
| `apps/api/src/routes/config.ts` | `GET /api/v1/config/locale` offentlig slutpunkt |
