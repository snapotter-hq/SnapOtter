---
description: "21 ondersteunde talen en hoe je vertalingen voor SnapOtter maakt of verbetert met het door TypeScript afgedwongen i18n-systeem."
i18n_source_hash: 0fdac8be0c98
i18n_provenance: machine
i18n_output_hash: 0c770d6f8bfa
---

# Vertaalgids {#translation-guide}

SnapOtter wordt standaard geleverd met 21 talen. Het i18n-systeem gebruikt een lichte, op maat gemaakte runtime met door TypeScript afgedwongen volledigheid van locales en dynamische code-splitting.

## Ondersteunde talen {#supported-languages}

| Code | Taal | Eigen naam | Richting |
|------|----------|-------------|-----------|
| `en` | Engels | English | LTR |
| `zh-CN` | Chinees (vereenvoudigd) | 简体中文 | LTR |
| `zh-TW` | Chinees (traditioneel) | 繁體中文 | LTR |
| `ja` | Japans | 日本語 | LTR |
| `ko` | Koreaans | 한국어 | LTR |
| `es` | Spaans | Español | LTR |
| `fr` | Frans | Français | LTR |
| `it` | Italiaans | Italiano | LTR |
| `pt-BR` | Portugees (Brazilië) | Português (Brasil) | LTR |
| `de` | Duits | Deutsch | LTR |
| `nl` | Nederlands | Nederlands | LTR |
| `sv` | Zweeds | Svenska | LTR |
| `ru` | Russisch | Русский | LTR |
| `pl` | Pools | Polski | LTR |
| `uk` | Oekraïens | Українська | LTR |
| `ar` | Arabisch | العربية | RTL |
| `tr` | Turks | Türkçe | LTR |
| `hi` | Hindi | हिन्दी | LTR |
| `vi` | Vietnamees | Tiếng Việt | LTR |
| `id` | Indonesisch | Bahasa Indonesia | LTR |
| `th` | Thais | ไทย | LTR |

## Hoe taalherkenning werkt {#how-language-detection-works}

SnapOtter gebruikt een resolutievolgorde in drie lagen:

1. **Gebruikersvoorkeur** - opgeslagen in `localStorage("snapotter-locale")` en gesynchroniseerd met gebruikersinstellingen wanneer je bent aangemeld
2. **Automatische browserdetectie** - loopt de `navigator.languages`-array af met BCP 47-prefixmatching
3. **Instantiestandaard** - de `DEFAULT_LOCALE`-env-variabele van de beheerder (opgehaald uit `GET /api/v1/config/locale`)
4. **Engelse terugval** - altijd beschikbaar

Gebruikers kunnen de taal wijzigen via:
- De **wereldbol-selector in de voettekst** (desktop, altijd zichtbaar)
- De taalkiezer op de **aanmeldpagina** (voor aanmelding)
- De sectie **Instellingen > Algemeen** (voorkeur per gebruiker)
- De taal-dropdown in de **mobiele zijbalk**
- De sectie **Instellingen > Systeem** stelt de standaard voor de hele instantie in (alleen beheerder)

## Hoe vertalingen werken {#how-translations-work}

Alle UI-strings staan in `packages/shared/src/i18n/`. Het referentiebestand is `en.ts`, dat een getypeerd object exporteert met elke string die de app gebruikt (~1500 sleutels). Andere talen zijn aparte bestanden (bijv. `de.ts`, `fr.ts`) die dezelfde vorm exporteren.

Het type `TranslationKeys` gebruikt `DeepStringRecord` om elke stringwaarde te accepteren terwijl de sleutelstructuur wordt afgedwongen. TypeScript vangt ontbrekende sleutels in elk vertaalbestand op tijdens het compileren.

Alleen de actieve locale wordt tijdens runtime geladen via dynamische `import()`, waardoor de hoofdbundel klein blijft.

## Vertalingen gebruiken in componenten {#using-translations-in-components}

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

## Een vertaling bijdragen {#contributing-a-translation}

We verwelkomen vertaal-PR's rechtstreeks. Je kunt een bestaande locale verbeteren of een nieuwe toevoegen.

Om een verkeerde vertaling te melden zonder code in te dienen, open je een [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) met de taal, de onjuiste string en de voorgestelde correctie.

::: tip 
Vertaal-PR's vereisen geen voorafgaande goedkeuring. Fork de repo, breng je wijzigingen aan en open een PR. Zie de [Bijdraaggids](/nl/guide/contributing) voor het volledige PR-proces en de CLA-vereiste.
:::

## Hoe je een vertaling maakt of bijwerkt {#how-to-create-or-update-a-translation}

### 1. Fork en clone {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. Kopieer het referentiebestand (alleen nieuwe taal) {#_2-copy-the-reference-file-new-language-only}

Sla deze stap over als je een bestaande vertaling verbetert.

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. Vertaal de strings {#_3-translate-the-strings}

Open je nieuwe bestand en vertaal elke stringwaarde. Houd de objectstructuur en sleutels precies hetzelfde.

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

Regels:
- Vertaal geen objectsleutels, alleen stringwaarden
- Houd `as const` aan het einde
- Importeer `TranslationKeys` uit `./en.js` en typeer je export
- Houd `{variable}`-placeholders precies zoals ze zijn
- Arrays (`rotatingPhrases`, `progressMessages`) moeten hetzelfde aantal items hebben
- Vertaal niet: SnapOtter, JPEG, PNG, WebP, EXIF, API en andere technische termen

### 4. Registreer de locale (alleen nieuwe taal) {#_4-register-the-locale-new-language-only}

Voeg je locale toe aan `SUPPORTED_LOCALES` in `packages/shared/src/i18n/index.ts`:

```ts
{ code: "xx", name: "Language Name", nativeName: "Native Name", dir: "ltr" },
```

### 5. Verifieer {#_5-verify}

```bash
pnpm typecheck    # catches missing or mistyped keys
pnpm lint         # formatting check
pnpm dev          # manually verify strings appear correctly
```

### 6. Dien in {#_6-submit}

Open een PR tegen `main` met een titel zoals `feat(i18n): add Swedish translation` of `fix(i18n): correct German typos`. De CLA-bot vraagt je om te ondertekenen bij je eerste bijdrage.

## Nieuwe vertaalsleutels toevoegen {#adding-new-translation-keys}

Wanneer je een nieuwe functie toevoegt die nieuwe UI-strings nodig heeft:

1. Voeg de nieuwe sleutels eerst toe aan `en.ts` (het referentiebestand)
2. Voer `pnpm typecheck` uit - elk locale-bestand faalt als het de nieuwe sleutel mist
3. Voeg de nieuwe sleutel toe aan alle locale-bestanden (gebruik Engels als tijdelijke terugval)

## Configuratie {#configuration}

Stel de standaardtaal van de instantie in via een omgevingsvariabele:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## Bestandsreferentie {#file-reference}

| Bestand | Doel |
|------|---------|
| `packages/shared/src/i18n/en.ts` | Engelse strings (referentie-locale, ~1500 sleutels) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, type-exports |
| `packages/shared/src/i18n/<locale>.ts` | Vertaalbestanden per taal |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, `useTranslation()`-hook |
| `apps/web/src/lib/format.ts` | `format()`, `plural()`, `formatFileSize()`-helpers |
| `apps/api/src/routes/config.ts` | `GET /api/v1/config/locale` publiek endpoint |
