---
description: 21 unterstützte Sprachen und wie man Übersetzungen für SnapOtter mit dem TypeScript-erzwungenen i18n-System erstellt oder verbessert.
i18n_source_hash: 0fdac8be0c98
i18n_provenance: machine
i18n_output_hash: 74e39371fe09
---

# Übersetzungsleitfaden {#translation-guide}

SnapOtter wird standardmäßig mit 21 Sprachen ausgeliefert. Das i18n-System verwendet eine leichtgewichtige, individuelle Laufzeitumgebung mit TypeScript-erzwungener Vollständigkeit der Locales und dynamischem Code-Splitting.

## Unterstützte Sprachen {#supported-languages}

| Code | Sprache | Eigenbezeichnung | Richtung |
|------|----------|-------------|-----------|
| `en` | Englisch | English | LTR |
| `zh-CN` | Chinesisch (vereinfacht) | 简体中文 | LTR |
| `zh-TW` | Chinesisch (traditionell) | 繁體中文 | LTR |
| `ja` | Japanisch | 日本語 | LTR |
| `ko` | Koreanisch | 한국어 | LTR |
| `es` | Spanisch | Español | LTR |
| `fr` | Französisch | Français | LTR |
| `it` | Italienisch | Italiano | LTR |
| `pt-BR` | Portugiesisch (Brasilien) | Português (Brasil) | LTR |
| `de` | Deutsch | Deutsch | LTR |
| `nl` | Niederländisch | Nederlands | LTR |
| `sv` | Schwedisch | Svenska | LTR |
| `ru` | Russisch | Русский | LTR |
| `pl` | Polnisch | Polski | LTR |
| `uk` | Ukrainisch | Українська | LTR |
| `ar` | Arabisch | العربية | RTL |
| `tr` | Türkisch | Türkçe | LTR |
| `hi` | Hindi | हिन्दी | LTR |
| `vi` | Vietnamesisch | Tiếng Việt | LTR |
| `id` | Indonesisch | Bahasa Indonesia | LTR |
| `th` | Thai | ไทย | LTR |

## Wie die Spracherkennung funktioniert {#how-language-detection-works}

SnapOtter verwendet eine dreistufige Auflösungsreihenfolge:

1. **Benutzereinstellung** - gespeichert in `localStorage("snapotter-locale")` und bei Anmeldung mit den Benutzereinstellungen synchronisiert
2. **Automatische Browsererkennung** - durchläuft das `navigator.languages`-Array mit BCP-47-Präfix-Abgleich
3. **Instanzstandard** - die `DEFAULT_LOCALE`-Umgebungsvariable des Administrators (abgerufen von `GET /api/v1/config/locale`)
4. **Englischer Fallback** - immer verfügbar

Benutzer können die Sprache ändern über:
- Den **Globus-Auswähler in der Fußzeile** (Desktop, immer sichtbar)
- Den Sprachauswähler auf der **Anmeldeseite** (vor der Authentifizierung)
- Den Bereich **Einstellungen > Allgemein** (Einstellung pro Benutzer)
- Das Sprach-Dropdown in der **mobilen Seitenleiste**
- Der Bereich **Einstellungen > System** legt den instanzweiten Standard fest (nur Administrator)

## Wie Übersetzungen funktionieren {#how-translations-work}

Alle UI-Zeichenketten befinden sich in `packages/shared/src/i18n/`. Die Referenzdatei ist `en.ts`, die ein typisiertes Objekt mit jeder von der App verwendeten Zeichenkette exportiert (~1500 Schlüssel). Andere Sprachen sind separate Dateien (z. B. `de.ts`, `fr.ts`), die dieselbe Struktur exportieren.

Der Typ `TranslationKeys` verwendet `DeepStringRecord`, um jeden Zeichenkettenwert zu akzeptieren und gleichzeitig die Schlüsselstruktur zu erzwingen. TypeScript erkennt fehlende Schlüssel in jeder Übersetzungsdatei zur Kompilierzeit.

Zur Laufzeit wird nur die aktive Locale über dynamisches `import()` geladen, wodurch das Haupt-Bundle klein bleibt.

## Übersetzungen in Komponenten verwenden {#using-translations-in-components}

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

## Eine Übersetzung beitragen {#contributing-a-translation}

Wir begrüßen Übersetzungs-PRs direkt. Du kannst eine bestehende Locale verbessern oder eine neue hinzufügen.

Um eine Fehlübersetzung zu melden, ohne Code einzureichen, öffne ein [GitHub-Issue](https://github.com/snapotter-hq/SnapOtter/issues) mit der Sprache, der falschen Zeichenkette und dem Korrekturvorschlag.

::: tip 
Übersetzungs-PRs erfordern keine vorherige Genehmigung. Forke das Repo, nimm deine Änderungen vor und öffne einen PR. Siehe den [Beitragsleitfaden](/de/guide/contributing) für den vollständigen PR-Prozess und die CLA-Anforderung.
:::

## Wie man eine Übersetzung erstellt oder aktualisiert {#how-to-create-or-update-a-translation}

### 1. Forken und klonen {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. Die Referenzdatei kopieren (nur bei neuer Sprache) {#_2-copy-the-reference-file-new-language-only}

Überspringe diesen Schritt, wenn du eine bestehende Übersetzung verbesserst.

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. Die Zeichenketten übersetzen {#_3-translate-the-strings}

Öffne deine neue Datei und übersetze jeden Zeichenkettenwert. Halte die Objektstruktur und die Schlüssel exakt gleich.

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

Regeln:
- Übersetze keine Objektschlüssel, nur Zeichenkettenwerte
- Behalte `as const` am Ende bei
- Importiere `TranslationKeys` aus `./en.js` und typisiere deinen Export
- Behalte `{variable}`-Platzhalter exakt bei
- Arrays (`rotatingPhrases`, `progressMessages`) müssen die gleiche Anzahl an Einträgen haben
- Nicht übersetzen: SnapOtter, JPEG, PNG, WebP, EXIF, API und andere Fachbegriffe

### 4. Die Locale registrieren (nur bei neuer Sprache) {#_4-register-the-locale-new-language-only}

Füge deine Locale zu `SUPPORTED_LOCALES` in `packages/shared/src/i18n/index.ts` hinzu:

```ts
{ code: "xx", name: "Language Name", nativeName: "Native Name", dir: "ltr" },
```

### 5. Überprüfen {#_5-verify}

```bash
pnpm typecheck    # catches missing or mistyped keys
pnpm lint         # formatting check
pnpm dev          # manually verify strings appear correctly
```

### 6. Einreichen {#_6-submit}

Öffne einen PR gegen `main` mit einem Titel wie `feat(i18n): add Swedish translation` oder `fix(i18n): correct German typos`. Der CLA-Bot bittet dich bei deinem ersten Beitrag um deine Unterschrift.

## Neue Übersetzungsschlüssel hinzufügen {#adding-new-translation-keys}

Wenn du eine neue Funktion hinzufügst, die neue UI-Zeichenketten benötigt:

1. Füge die neuen Schlüssel zuerst zu `en.ts` hinzu (der Referenzdatei)
2. Führe `pnpm typecheck` aus - jede Locale-Datei schlägt fehl, wenn der neue Schlüssel fehlt
3. Füge den neuen Schlüssel zu allen Locale-Dateien hinzu (verwende Englisch als temporären Fallback)

## Konfiguration {#configuration}

Lege die Standardsprache der Instanz über eine Umgebungsvariable fest:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## Dateireferenz {#file-reference}

| Datei | Zweck |
|------|---------|
| `packages/shared/src/i18n/en.ts` | Englische Zeichenketten (Referenz-Locale, ~1500 Schlüssel) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, Typ-Exporte |
| `packages/shared/src/i18n/<locale>.ts` | Übersetzungsdateien pro Sprache |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, `useTranslation()` Hook |
| `apps/web/src/lib/format.ts` | `format()`, `plural()`, `formatFileSize()` Hilfsfunktionen |
| `apps/api/src/routes/config.ts` | `GET /api/v1/config/locale` öffentlicher Endpunkt |
