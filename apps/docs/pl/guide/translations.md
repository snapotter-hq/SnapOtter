---
description: "21 obsługiwanych języków oraz sposób tworzenia i ulepszania tłumaczeń dla SnapOtter za pomocą systemu i18n wymuszanego przez TypeScript."
i18n_source_hash: 55837d9fdaef
i18n_provenance: human
i18n_output_hash: 2f2ee690b721
---

# Przewodnik po tłumaczeniach {#translation-guide}

SnapOtter dostarczany jest z 21 językami od razu po instalacji. System i18n korzysta z lekkiego, własnego środowiska uruchomieniowego z wymuszaną przez TypeScript kompletnością lokalizacji oraz dynamicznym dzieleniem kodu.

## Obsługiwane języki {#supported-languages}

| Code | Language | Native Name | Direction |
|------|----------|-------------|-----------|
| `en` | angielski | English | LTR |
| `zh-CN` | chiński (uproszczony) | 简体中文 | LTR |
| `zh-TW` | chiński (tradycyjny) | 繁體中文 | LTR |
| `ja` | japoński | 日本語 | LTR |
| `ko` | koreański | 한국어 | LTR |
| `es` | hiszpański | Español | LTR |
| `fr` | francuski | Français | LTR |
| `it` | włoski | Italiano | LTR |
| `pt-BR` | portugalski (Brazylia) | Português (Brasil) | LTR |
| `de` | niemiecki | Deutsch | LTR |
| `nl` | niderlandzki | Nederlands | LTR |
| `sv` | szwedzki | Svenska | LTR |
| `ru` | rosyjski | Русский | LTR |
| `pl` | polski | Polski | LTR |
| `uk` | ukraiński | Українська | LTR |
| `ar` | arabski | العربية | RTL |
| `tr` | turecki | Türkçe | LTR |
| `hi` | hindi | हिन्दी | LTR |
| `vi` | wietnamski | Tiếng Việt | LTR |
| `id` | indonezyjski | Bahasa Indonesia | LTR |
| `th` | tajski | ไทย | LTR |

## Jak działa wykrywanie języka {#how-language-detection-works}

SnapOtter stosuje trzypoziomową kolejność rozstrzygania:

1. **Preferencja użytkownika** - przechowywana w `localStorage("snapotter-locale")` i synchronizowana z ustawieniami użytkownika po zalogowaniu
2. **Automatyczne wykrywanie przeglądarki** - przechodzi przez tablicę `navigator.languages` z dopasowywaniem prefiksów BCP 47
3. **Domyślny język instancji** - zmienna środowiskowa administratora `DEFAULT_LOCALE` (pobierana z `GET /api/v1/config/locale`)
4. **Awaryjny język angielski** - zawsze dostępny

Użytkownicy mogą zmienić język w:
- **selektorze Globe w stopce** (na komputerze, zawsze widoczny)
- selektorze języka na **stronie logowania** (przed uwierzytelnieniem)
- sekcji **Ustawienia > Ogólne** (preferencja dla danego użytkownika)
- rozwijanej liście języków w **mobilnym pasku bocznym**
- sekcji **Ustawienia > System**, która ustawia domyślny język dla całej instancji (tylko administrator)

## Jak działają tłumaczenia {#how-translations-work}

Wszystkie napisy interfejsu znajdują się w `packages/shared/src/i18n/`. Plikiem referencyjnym jest `en.ts`, który eksportuje typowany obiekt zawierający każdy napis używany przez aplikację (~1500 kluczy). Pozostałe języki to osobne pliki (np. `de.ts`, `fr.ts`), które eksportują ten sam kształt.

Typ `TranslationKeys` wykorzystuje `DeepStringRecord`, aby przyjmować dowolną wartość tekstową, wymuszając jednocześnie strukturę kluczy. TypeScript wychwytuje brakujące klucze w dowolnym pliku tłumaczenia na etapie kompilacji.

W czasie działania ładowana jest tylko aktywna lokalizacja poprzez dynamiczny `import()`, dzięki czemu główny pakiet pozostaje niewielki.

## Używanie tłumaczeń w komponentach {#using-translations-in-components}

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

## Współtworzenie tłumaczenia {#contributing-a-translation}

Chętnie przyjmujemy PR-y z tłumaczeniami bezpośrednio. Możesz ulepszyć istniejącą lokalizację lub dodać nową.

Aby zgłosić błędne tłumaczenie bez przesyłania kodu, otwórz [zgłoszenie na GitHubie](https://github.com/snapotter-hq/SnapOtter/issues) z podaniem języka, nieprawidłowego napisu oraz proponowanej poprawki.

::: tip 
PR-y z tłumaczeniami nie wymagają wcześniejszej akceptacji. Rozgałęź repozytorium, wprowadź zmiany i otwórz PR. Zajrzyj do [przewodnika dla współtwórców](/pl/guide/contributing), aby poznać pełny proces PR oraz wymóg CLA.
:::

## Jak utworzyć lub zaktualizować tłumaczenie {#how-to-create-or-update-a-translation}

### 1. Rozgałęź i sklonuj {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. Skopiuj plik referencyjny (tylko nowy język) {#_2-copy-the-reference-file-new-language-only}

Pomiń ten krok, jeśli ulepszasz istniejące tłumaczenie.

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. Przetłumacz napisy {#_3-translate-the-strings}

Otwórz swój nowy plik i przetłumacz każdą wartość tekstową. Zachowaj strukturę obiektu i klucze dokładnie takie same.

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

Zasady:
- Nie tłumacz kluczy obiektu, tylko wartości tekstowe
- Zachowaj `as const` na końcu
- Zaimportuj `TranslationKeys` z `./en.js` i otypuj swój eksport
- Zachowaj symbole zastępcze `{variable}` dokładnie w takiej samej postaci
- Tablice (`rotatingPhrases`, `progressMessages`) muszą mieć tę samą liczbę wpisów
- Nie tłumacz: SnapOtter, JPEG, PNG, WebP, EXIF, API oraz innych terminów technicznych

### 4. Zarejestruj lokalizację (tylko nowy język) {#_4-register-the-locale-new-language-only}

Dodaj swoją lokalizację do `SUPPORTED_LOCALES` w `packages/shared/src/i18n/index.ts`:

```ts
{ code: "xx", name: "Language Name", nativeName: "Native Name", dir: "ltr" },
```

### 5. Zweryfikuj {#_5-verify}

```bash
pnpm typecheck    # catches missing or mistyped keys
pnpm lint         # formatting check
pnpm dev          # manually verify strings appear correctly
```

### 6. Prześlij {#_6-submit}

Otwórz PR wobec `main` z tytułem w rodzaju `feat(i18n): add Swedish translation` lub `fix(i18n): correct German typos`. Bot CLA poprosi Cię o podpis przy pierwszym wkładzie.

## Dodawanie nowych kluczy tłumaczeń {#adding-new-translation-keys}

Dodając nową funkcję, która wymaga nowych napisów interfejsu:

1. Najpierw dodaj nowe klucze do `en.ts` (plik referencyjny)
2. Uruchom `pnpm typecheck` - każdy plik lokalizacji zgłosi błąd, jeśli brakuje w nim nowego klucza
3. Dodaj nowy klucz do wszystkich plików lokalizacji (jako tymczasowego zastępstwa użyj języka angielskiego)

## Konfiguracja {#configuration}

Ustaw domyślny język instancji za pomocą zmiennej środowiskowej:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## Zestawienie plików {#file-reference}

| File | Purpose |
|------|---------|
| `packages/shared/src/i18n/en.ts` | napisy angielskie (lokalizacja referencyjna, ~1500 kluczy) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, eksporty typów |
| `packages/shared/src/i18n/<locale>.ts` | pliki tłumaczeń dla poszczególnych języków |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, hook `useTranslation()` |
| `apps/web/src/lib/format.ts` | pomocnicze `format()`, `plural()`, `formatFileSize()` |
| `apps/api/src/routes/config.ts` | publiczny punkt końcowy `GET /api/v1/config/locale` |

## Tłumaczenie witryny, dokumentacji i dokumentacji API {#translating-the-web-surfaces}

Opisane powyżej wsparcie dla 21 języków obejmuje **aplikację**. Publiczna witryna
(snapotter.com), ta strona z dokumentacją oraz dokumentacja REST API również są
tłumaczone na wszystkie 21 języków przez osobny, sterowany hashem potok, który ponownie wykorzystuje
te same nazwy i opisy narzędzi z `packages/shared/src/i18n`, dzięki czemu
terminologia pozostaje spójna wszędzie.

### Domyślnie tłumaczone maszynowo {#machine-translated-by-default}

Każda nieanglojęzyczna strona witryny i dokumentacji jest **tłumaczona maszynowo** przy
pierwszym przejściu (przez sesję Claude Code, a nie usługę firm trzecich) i zawiera
niewielki, możliwy do zamknięcia baner informujący o tym, wraz z odnośnikiem z powrotem tutaj. Jest to celowe:
pozwala szybko i uczciwie dostarczyć wszystkie 21 języków, a następnie zaprasza społeczność do
dopracowania stron, które mają największe znaczenie. Tłumaczenie maszynowe przekazuje sens;
dopiero weryfikacja przez człowieka sprawia, że tekst czyta się naturalnie.

### Jak potok decyduje, co przetłumaczyć {#how-the-web-pipeline-decides}

Każda tłumaczalna jednostka źródła angielskiego jest hashowana, a hash przechowywany jest obok
jej tłumaczenia. Przy każdym uruchomieniu potok:

- tłumaczy każdą jednostkę, która nie ma jeszcze tłumaczenia,
- pomija każdą jednostkę, której przechowywany hash wciąż zgadza się ze źródłem angielskim,
- ponownie tłumaczy jednostkę **maszynową**, gdy zmieni się jej źródło angielskie,
- oraz oznacza jednostkę dopracowaną przez **człowieka** jako `stale` (wymaga weryfikacji), gdy jej
  źródło angielskie ulegnie zmianie, zamiast nadpisywać Twoją pracę.

### Dopracowanie tłumaczenia strony internetowej przez PR {#refining-a-web-translation-by-pr}

Tłumaczenie witryny, dokumentacji lub dokumentacji API ulepszasz w ten sam sposób, w jaki
ulepszasz lokalizację aplikacji: edytując wygenerowany plik i otwierając PR.

1. Znajdź wygenerowane tłumaczenie dla swojego języka:
   - napisy interfejsu witryny: `apps/landing/src/i18n/<locale>.json`
   - strona dokumentacji: `apps/docs/<locale>/**.md`
   - dokumentacja API: `apps/api/src/openapi.<locale>.yaml`
2. Zredaguj tekst. Zachowaj kod, odnośniki, `{placeholders}` oraz wszelkie znaczniki `⸤I18N…⸥`
   dokładnie w takiej postaci, w jakiej są; walidator potoku odrzuca tłumaczenie, które pomija
   lub zmienia ich kolejność.
3. Otwórz PR. Edycja jednostki zmienia jej pochodzenie z `machine` na `human`, dzięki czemu
   potok **nigdy jej nie nadpisze** przy późniejszym uruchomieniu. Jeśli źródło angielskie
   zmieni się później, Twoja jednostka zostanie oznaczona jako `stale` do weryfikacji, zamiast zostać
   po cichu zastąpiona.

Aby zgłosić błędne tłumaczenie bez przesyłania kodu, otwórz
[zgłoszenie na GitHubie](https://github.com/snapotter-hq/SnapOtter/issues) z podaniem
adresu URL strony, języka, nieprawidłowego tekstu oraz proponowanej poprawki.

::: tip 
Potok tłumaczeń uruchamiają opiekunowie projektu; do wniesienia wkładu nie potrzebujesz klucza API.
Wystarczy, że zredagujesz wygenerowany plik i otworzysz PR. Zajrzyj do
[`scripts/i18n/README.md`](https://github.com/snapotter-hq/SnapOtter/blob/main/scripts/i18n/README.md),
aby dowiedzieć się, jak działa potok.
:::