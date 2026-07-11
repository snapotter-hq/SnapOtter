---
description: "21 ondersteunde talen en hoe je vertalingen voor SnapOtter maakt of verbetert met het door TypeScript afgedwongen i18n-systeem."
i18n_source_hash: 55837d9fdaef
i18n_provenance: human
i18n_output_hash: d9f7dd1568a9
---

# Vertaalgids {#translation-guide}

SnapOtter wordt standaard geleverd met 21 talen. Het i18n-systeem gebruikt een lichtgewicht eigen runtime met door TypeScript afgedwongen volledigheid van locales en dynamische code-splitting.

## Ondersteunde talen {#supported-languages}

| Code | Taal | Native Name | Direction |
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
| `th` | Thai | ไทย | LTR |

## Hoe taaldetectie werkt {#how-language-detection-works}

SnapOtter gebruikt een resolutievolgorde met drie niveaus:

1. **Gebruikersvoorkeur** - opgeslagen in `localStorage("snapotter-locale")` en gesynchroniseerd met de gebruikersinstellingen bij authenticatie
2. **Automatische browserdetectie** - loopt door de `navigator.languages`-array met BCP 47-prefixmatching
3. **Standaard van de instantie** - de `DEFAULT_LOCALE` env-variabele van de beheerder (opgehaald uit `GET /api/v1/config/locale`)
4. **Engelse terugval** - altijd beschikbaar

Gebruikers kunnen de taal wijzigen via:
- De **Globe-selector in de footer** (desktop, altijd zichtbaar)
- De taalselector op de **loginpagina** (vóór authenticatie)
- De sectie **Instellingen > Algemeen** (voorkeur per gebruiker)
- De taalkeuzelijst in de **mobiele zijbalk**
- De sectie **Instellingen > Systeem** stelt de standaardtaal voor de hele instantie in (alleen beheerder)

## Hoe vertalingen werken {#how-translations-work}

Alle UI-strings staan in `packages/shared/src/i18n/`. Het referentiebestand is `en.ts`, dat een getypeerd object exporteert met elke string die de app gebruikt (~1500 sleutels). Andere talen zijn aparte bestanden (bijv. `de.ts`, `fr.ts`) die dezelfde vorm exporteren.

Het type `TranslationKeys` gebruikt `DeepStringRecord` om elke stringwaarde te accepteren terwijl de sleutelstructuur wordt afgedwongen. TypeScript vangt ontbrekende sleutels in elk vertaalbestand op tijdens het compileren.

Alleen de actieve locale wordt tijdens runtime geladen via een dynamische `import()`, zodat de hoofdbundel klein blijft.

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
Vertaal-PR's vereisen geen voorafgaande goedkeuring. Fork de repo, breng je wijzigingen aan en open een PR. Zie de [Contributing Guide](/nl/guide/contributing) voor het volledige PR-proces en de CLA-vereiste.
:::

## Een vertaling maken of bijwerken {#how-to-create-or-update-a-translation}

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

Open je nieuwe bestand en vertaal elke stringwaarde. Houd de objectstructuur en sleutels exact hetzelfde.

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
- Houd `{variable}`-placeholders exact zoals ze zijn
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
2. Voer `pnpm typecheck` uit - elk localebestand faalt als de nieuwe sleutel ontbreekt
3. Voeg de nieuwe sleutel toe aan alle localebestanden (gebruik Engels als tijdelijke terugval)

## Configuratie {#configuration}

Stel de standaardtaal van de instantie in via een omgevingsvariabele:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## Bestandsreferentie {#file-reference}

| File | Purpose |
|------|---------|
| `packages/shared/src/i18n/en.ts` | Engelse strings (referentielocale, ~1500 sleutels) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, type-exports |
| `packages/shared/src/i18n/<locale>.ts` | Vertaalbestanden per taal |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, `useTranslation()` hook |
| `apps/web/src/lib/format.ts` | `format()`, `plural()`, `formatFileSize()` helpers |
| `apps/api/src/routes/config.ts` | `GET /api/v1/config/locale` openbaar endpoint |

## De website, docs en API-referentie vertalen {#translating-the-web-surfaces}

De ondersteuning voor 21 talen hierboven geldt voor de **app**. De openbare website
(snapotter.com), deze documentatiesite en de REST API-referentie worden ook
in alle 21 talen vertaald, door een aparte hash-gated pipeline die dezelfde
toolnamen en beschrijvingen uit `packages/shared/src/i18n` hergebruikt, zodat
de terminologie overal consistent blijft.

### Standaard machinaal vertaald {#machine-translated-by-default}

Elke niet-Engelse pagina op de website en in de docs wordt in de eerste ronde
**machinaal vertaald** (door een Claude Code-sessie, niet door een externe dienst) en
draagt een kleine, wegklikbare banner die dat aangeeft, met een link terug naar hier. Dat is bewust:
het levert alle 21 talen snel en eerlijk, en nodigt de community vervolgens uit om
de belangrijkste pagina's te verfijnen. Machinevertaling brengt de betekenis over;
menselijke revisie zorgt dat het natuurlijk leest.

### Hoe de pipeline beslist wat er wordt vertaald {#how-the-web-pipeline-decides}

Elke vertaalbare eenheid Engelse bron wordt gehasht, en de hash wordt naast
de vertaling opgeslagen. Bij elke run doet de pipeline het volgende:

- vertaalt elke eenheid die nog geen vertaling heeft,
- slaat elke eenheid over waarvan de opgeslagen hash nog overeenkomt met de Engelse bron,
- hervertaalt een **machine**-eenheid wanneer de Engelse bron ervan verandert,
- en markeert een door een **mens** verfijnde eenheid als `stale` (moet worden gecontroleerd) wanneer de
  Engelse bron verandert, in plaats van je werk te overschrijven.

### Een webvertaling verfijnen via een PR {#refining-a-web-translation-by-pr}

Je verbetert een vertaling van de website, docs of API-referentie op dezelfde manier als
je een app-locale verbetert: door het gegenereerde bestand te bewerken en een PR te openen.

1. Vind de gegenereerde vertaling voor jouw taal:
   - UI-strings van de website: `apps/landing/src/i18n/<locale>.json`
   - een docs-pagina: `apps/docs/<locale>/**.md`
   - de API-referentie: `apps/api/src/openapi.<locale>.yaml`
2. Bewerk de tekst. Houd code, links, `{placeholders}` en eventuele `⸤I18N…⸥`-markeringen
   exact zoals ze zijn; de validator van de pipeline weigert een vertaling die ze weglaat
   of herordent.
3. Open een PR. Het bewerken van een eenheid wijzigt de herkomst van `machine` naar `human`, zodat
   de pipeline die **nooit zal overschrijven** bij een latere run. Als de Engelse bron
   daarna verandert, wordt je eenheid gemarkeerd als `stale` voor revisie in plaats van
   stilzwijgend vervangen.

Om een verkeerde vertaling te melden zonder code in te dienen, open je een
[GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) met de pagina-
URL, de taal, de onjuiste tekst en je voorgestelde correctie.

::: tip 
Beheerders draaien de vertaalpipeline; je hebt geen API-sleutel nodig om
bij te dragen. Bewerk gewoon het gegenereerde bestand en open een PR. Zie
[`scripts/i18n/README.md`](https://github.com/snapotter-hq/SnapOtter/blob/main/scripts/i18n/README.md)
voor hoe de pipeline draait.
:::