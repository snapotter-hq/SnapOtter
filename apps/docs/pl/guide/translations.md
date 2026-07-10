---
description: "21 obsługiwanych języków oraz sposób tworzenia i ulepszania tłumaczeń SnapOtter przy użyciu systemu i18n wymuszanego przez TypeScript."
i18n_source_hash: 0fdac8be0c98
i18n_provenance: human
i18n_output_hash: 565aec70d23f
---

# Przewodnik po tłumaczeniach {#translation-guide}

SnapOtter jest dostarczany z 21 językami od razu po instalacji. System i18n używa lekkiego, niestandardowego środowiska uruchomieniowego z kompletnością lokalizacji wymuszaną przez TypeScript oraz dynamicznym dzieleniem kodu.

## Obsługiwane języki {#supported-languages}

| Kod | Język | Nazwa własna | Kierunek |
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

1. **Preferencja użytkownika** - przechowywana w `localStorage("snapotter-locale")` i synchronizowana z ustawieniami użytkownika po uwierzytelnieniu
2. **Automatyczne wykrywanie przeglądarki** - przechodzi przez tablicę `navigator.languages` z dopasowywaniem prefiksów BCP 47
3. **Domyślna wartość instancji** - zmienna środowiskowa administratora `DEFAULT_LOCALE` (pobierana z `GET /api/v1/config/locale`)
4. **Rezerwowy angielski** - zawsze dostępny

Użytkownicy mogą zmienić język w:
- **Selektorze globusa w stopce** (na komputerach, zawsze widoczny)
- Selektorze języka na **stronie logowania** (przed uwierzytelnieniem)
- Sekcji **Ustawienia > Ogólne** (preferencja per użytkownik)
- Rozwijanym menu języka w **panelu bocznym na urządzeniach mobilnych**
- Sekcji **Ustawienia > System**, która ustawia domyślny język dla całej instancji (tylko administrator)

## Jak działają tłumaczenia {#how-translations-work}

Wszystkie ciągi UI znajdują się w `packages/shared/src/i18n/`. Plikiem referencyjnym jest `en.ts`, który eksportuje typowany obiekt zawierający każdy ciąg używany przez aplikację (~1500 kluczy). Pozostałe języki to osobne pliki (np. `de.ts`, `fr.ts`), które eksportują ten sam kształt.

Typ `TranslationKeys` używa `DeepStringRecord`, aby akceptować dowolną wartość ciągu, jednocześnie wymuszając strukturę kluczy. TypeScript wychwytuje brakujące klucze w dowolnym pliku tłumaczenia w czasie kompilacji.

W czasie uruchomienia ładowana jest tylko aktywna lokalizacja, poprzez dynamiczne `import()`, dzięki czemu główny pakiet pozostaje mały.

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

## Wkład w tłumaczenie {#contributing-a-translation}

Z radością przyjmujemy PR-y z tłumaczeniami bezpośrednio. Możesz ulepszyć istniejącą lokalizację lub dodać nową.

Aby zgłosić błąd tłumaczenia bez przesyłania kodu, otwórz [zgłoszenie na GitHub](https://github.com/snapotter-hq/SnapOtter/issues) z językiem, nieprawidłowym ciągiem i sugerowaną poprawką.

::: tip 
PR-y z tłumaczeniami nie wymagają wcześniejszej akceptacji. Rozwidl repozytorium, wprowadź swoje zmiany i otwórz PR. Zobacz [Przewodnik dla współtwórców](/pl/guide/contributing), aby zapoznać się z pełnym procesem PR i wymogiem CLA.
:::

## Jak utworzyć lub zaktualizować tłumaczenie {#how-to-create-or-update-a-translation}

### 1. Rozwidl i sklonuj {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. Skopiuj plik referencyjny (tylko dla nowego języka) {#_2-copy-the-reference-file-new-language-only}

Pomiń ten krok, jeśli ulepszasz istniejące tłumaczenie.

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. Przetłumacz ciągi {#_3-translate-the-strings}

Otwórz nowy plik i przetłumacz każdą wartość ciągu. Zachowaj strukturę obiektu i klucze dokładnie takie same.

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
- Nie tłumacz kluczy obiektu, tylko wartości ciągów
- Zachowaj `as const` na końcu
- Zaimportuj `TranslationKeys` z `./en.js` i otypuj swój eksport
- Zachowaj symbole zastępcze `{variable}` dokładnie w niezmienionej formie
- Tablice (`rotatingPhrases`, `progressMessages`) muszą mieć tę samą liczbę wpisów
- Nie tłumacz: SnapOtter, JPEG, PNG, WebP, EXIF, API i innych terminów technicznych

### 4. Zarejestruj lokalizację (tylko dla nowego języka) {#_4-register-the-locale-new-language-only}

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

## Dodawanie nowych kluczy tłumaczenia {#adding-new-translation-keys}

Gdy dodajesz nową funkcję, która wymaga nowych ciągów UI:

1. Najpierw dodaj nowe klucze do `en.ts` (plik referencyjny)
2. Uruchom `pnpm typecheck` - każdy plik lokalizacji zakończy się niepowodzeniem, jeśli brakuje w nim nowego klucza
3. Dodaj nowy klucz do wszystkich plików lokalizacji (użyj angielskiego jako tymczasowej wartości rezerwowej)

## Konfiguracja {#configuration}

Ustaw domyślny język instancji za pomocą zmiennej środowiskowej:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## Wykaz plików {#file-reference}

| Plik | Przeznaczenie |
|------|---------|
| `packages/shared/src/i18n/en.ts` | Ciągi angielskie (lokalizacja referencyjna, ~1500 kluczy) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, eksporty typów |
| `packages/shared/src/i18n/<locale>.ts` | Pliki tłumaczeń per język |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, hook `useTranslation()` |
| `apps/web/src/lib/format.ts` | Pomocnicy `format()`, `plural()`, `formatFileSize()` |
| `apps/api/src/routes/config.ts` | Publiczny punkt końcowy `GET /api/v1/config/locale` |
