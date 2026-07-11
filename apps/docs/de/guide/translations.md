---
description: "21 unterstützte Sprachen und wie man Übersetzungen für SnapOtter mit dem TypeScript-erzwungenen i18n-System erstellt oder verbessert."
i18n_source_hash: 55837d9fdaef
i18n_provenance: human
i18n_output_hash: f48a6892b5fc
---

# Übersetzungsleitfaden {#translation-guide}

SnapOtter wird von Haus aus mit 21 Sprachen ausgeliefert. Das i18n-System verwendet eine leichtgewichtige, eigene Laufzeitumgebung mit TypeScript-erzwungener Vollständigkeit der Locales und dynamischem Code-Splitting.

## Unterstützte Sprachen {#supported-languages}

| Code | Sprache | Native Name | Direction |
|------|----------|-------------|-----------|
| `en` | Englisch | English | LTR |
| `zh-CN` | Chinesisch (Vereinfacht) | 简体中文 | LTR |
| `zh-TW` | Chinesisch (Traditionell) | 繁體中文 | LTR |
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
| `th` | Thailändisch | ไทย | LTR |

## Wie die Spracherkennung funktioniert {#how-language-detection-works}

SnapOtter verwendet eine dreistufige Auflösungsreihenfolge:

1. **Benutzereinstellung** - gespeichert in `localStorage("snapotter-locale")` und mit den Benutzereinstellungen synchronisiert, sobald angemeldet
2. **Automatische Browsererkennung** - durchläuft das `navigator.languages`-Array mit BCP 47-Präfixabgleich
3. **Instanzstandard** - die `DEFAULT_LOCALE`-Umgebungsvariable des Admins (abgerufen von `GET /api/v1/config/locale`)
4. **Englischer Fallback** - immer verfügbar

Benutzer können die Sprache ändern über:
- Den **Globus-Auswähler in der Fußzeile** (Desktop, immer sichtbar)
- Den Sprachauswähler auf der **Anmeldeseite** (vor der Anmeldung)
- Den Abschnitt **Einstellungen > Allgemein** (Einstellung pro Benutzer)
- Das Sprach-Dropdown in der **mobilen Seitenleiste**
- Der Abschnitt **Einstellungen > System** legt den instanzweiten Standard fest (nur Admin)

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

Um eine Fehlübersetzung zu melden, ohne Code einzureichen, öffne ein [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) mit der Sprache, der fehlerhaften Zeichenkette und dem vorgeschlagenen Fix.

::: tip 
Übersetzungs-PRs erfordern keine vorherige Genehmigung. Forke das Repository, nimm deine Änderungen vor und öffne einen PR. Siehe den [Contributing Guide](/de/guide/contributing) für den vollständigen PR-Prozess und die CLA-Anforderung.
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

Öffne deine neue Datei und übersetze jeden Zeichenkettenwert. Behalte die Objektstruktur und die Schlüssel exakt gleich bei.

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
- Behalte `{variable}`-Platzhalter exakt so bei, wie sie sind
- Arrays (`rotatingPhrases`, `progressMessages`) müssen dieselbe Anzahl von Einträgen haben
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

Öffne einen PR gegen `main` mit einem Titel wie `feat(i18n): add Swedish translation` oder `fix(i18n): correct German typos`. Der CLA-Bot wird dich bei deinem ersten Beitrag um eine Unterschrift bitten.

## Neue Übersetzungsschlüssel hinzufügen {#adding-new-translation-keys}

Wenn du ein neues Feature hinzufügst, das neue UI-Zeichenketten benötigt:

1. Füge die neuen Schlüssel zuerst zu `en.ts` hinzu (der Referenzdatei)
2. Führe `pnpm typecheck` aus - jede Locale-Datei schlägt fehl, wenn der neue Schlüssel fehlt
3. Füge den neuen Schlüssel zu allen Locale-Dateien hinzu (verwende Englisch als vorübergehenden Fallback)

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
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, `useTranslation()`-Hook |
| `apps/web/src/lib/format.ts` | `format()`-, `plural()`-, `formatFileSize()`-Helfer |
| `apps/api/src/routes/config.ts` | Öffentlicher `GET /api/v1/config/locale`-Endpunkt |

## Website, Docs und API-Referenz übersetzen {#translating-the-web-surfaces}

Die 21-Sprachen-Unterstützung oben deckt die **App** ab. Die öffentliche Website
(snapotter.com), diese Dokumentationsseite und die REST-API-Referenz werden ebenfalls
in alle 21 Sprachen übersetzt, durch eine separate, hash-gesteuerte Pipeline, die
dieselben Tool-Namen und Beschreibungen aus `packages/shared/src/i18n` wiederverwendet, sodass die
Terminologie überall konsistent bleibt.

### Standardmäßig maschinell übersetzt {#machine-translated-by-default}

Jede nicht-englische Seite auf der Website und in den Docs wird im ersten Durchlauf
**maschinell übersetzt** (durch eine Claude-Code-Sitzung, nicht durch einen Drittanbieterdienst)
und trägt ein kleines, ausblendbares Banner, das darauf hinweist, mit einem Link zurück
hierher. Das ist Absicht: So werden alle 21 Sprachen schnell und ehrlich ausgeliefert, und
die Community wird eingeladen, die Seiten zu verfeinern, die am wichtigsten sind. Maschinelle
Übersetzung vermittelt die Bedeutung; menschliche Überprüfung sorgt dafür, dass sie sich
natürlich liest.

### Wie die Pipeline entscheidet, was übersetzt wird {#how-the-web-pipeline-decides}

Jede übersetzbare Einheit des englischen Quelltexts wird gehasht, und der Hash wird neben
ihrer Übersetzung gespeichert. Bei jedem Durchlauf:

- übersetzt die Pipeline jede Einheit, die noch keine Übersetzung hat,
- überspringt jede Einheit, deren gespeicherter Hash noch mit dem englischen Quelltext übereinstimmt,
- übersetzt eine **maschinelle** Einheit neu, wenn sich ihr englischer Quelltext ändert,
- und markiert eine von einem **Menschen** verfeinerte Einheit als `stale` (benötigt Überprüfung),
  wenn sich ihr englischer Quelltext ändert, anstatt deine Arbeit zu überschreiben.

### Eine Web-Übersetzung per PR verfeinern {#refining-a-web-translation-by-pr}

Du verbesserst eine Übersetzung der Website, der Docs oder der API-Referenz auf dieselbe Weise,
wie du eine App-Locale verbesserst: indem du die generierte Datei bearbeitest und einen PR öffnest.

1. Finde die generierte Übersetzung für deine Sprache:
   - Website-UI-Zeichenketten: `apps/landing/src/i18n/<locale>.json`
   - eine Docs-Seite: `apps/docs/<locale>/**.md`
   - die API-Referenz: `apps/api/src/openapi.<locale>.yaml`
2. Bearbeite den Text. Behalte Code, Links, `{placeholders}` und alle `⸤I18N…⸥`-Markierungen
   exakt so bei, wie sie sind; der Validator der Pipeline weist eine Übersetzung zurück, die sie
   auslässt oder umsortiert.
3. Öffne einen PR. Das Bearbeiten einer Einheit ändert ihre Herkunft von `machine` zu `human`, sodass
   die Pipeline sie bei einem späteren Durchlauf **niemals überschreibt**. Wenn sich der englische
   Quelltext danach ändert, wird deine Einheit als `stale` zur Überprüfung markiert, anstatt
   stillschweigend ersetzt zu werden.

Um eine Fehlübersetzung zu melden, ohne Code einzureichen, öffne ein
[GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) mit der
Seiten-URL, der Sprache, dem fehlerhaften Text und deinem vorgeschlagenen Fix.

::: tip 
Maintainer führen die Übersetzungs-Pipeline aus; du benötigst keinen API-Schlüssel, um
beizutragen. Bearbeite einfach die generierte Datei und öffne einen PR. Siehe
[`scripts/i18n/README.md`](https://github.com/snapotter-hq/SnapOtter/blob/main/scripts/i18n/README.md)
für Informationen dazu, wie die Pipeline läuft.
:::