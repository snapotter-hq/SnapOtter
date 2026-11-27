---
description: "Wandelt Text in GROSSBUCHSTABEN, Kleinbuchstaben, Titel- und Satzschreibung und mehr um."
i18n_source_hash: e15ff31ec4d6
i18n_provenance: machine
i18n_output_hash: 72ee39eb67a8
i18n_hash_version: 2
---

# Groß-/Kleinschreibung ändern {#convert-case}

Füge Text ein, wähle eine Schreibweise und kopiere das Ergebnis. Der Text geht an deinen eigenen SnapOtter-Server und sonst nirgendwohin.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-case`

Akzeptiert einen JSON-Body statt Multipart-Formulardaten und antwortet mit dem konvertierten Text statt mit einer herunterladbaren Datei.

## Parameters {#parameters}

| Name | Typ | Standard | Beschreibung |
|------|------|---------|-------------|
| `text` | string | (erforderlich) | Zu konvertierender Text. Bis zu 1.000.000 Zeichen. |
| `mode` | string | (erforderlich) | Einer der unten aufgeführten Modi. |
| `locale` | string | (keine) | BCP-47-Sprachtag, etwa `tr` oder `de`, für Buchstaben, deren Groß-/Kleinschreibung von der Sprache abhängt. Ohne Angabe ist die Schreibung für alle Sprachen gleich. |

| Modus | Eingabe | Ausgabe |
|------|-------|--------|
| `upper` | `The quick brown fox` | `THE QUICK BROWN FOX` |
| `lower` | `The Quick Brown Fox` | `the quick brown fox` |
| `sentence` | `the quick BROWN fox. it jumps.` | `The quick brown fox. It jumps.` |
| `title` | `the lord of the rings` | `The Lord of the Rings` |
| `capitalized` | `the lord of the rings` | `The Lord Of The Rings` |
| `inverse` | `The Quick Brown Fox` | `tHE qUICK bROWN fOX` |
| `alternating` | `the quick brown fox` | `tHe QuIcK bRoWn FoX` |
| `camel` | `The quick brown fox` | `theQuickBrownFox` |
| `pascal` | `the quick brown fox` | `TheQuickBrownFox` |
| `snake` | `The quick brown fox` | `the_quick_brown_fox` |
| `kebab` | `The quick brown fox` | `the-quick-brown-fox` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-case \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "the lord of the rings", "mode": "title"}'
```

## Example Response {#example-response}

```json
{
  "mode": "title",
  "result": "The Lord of the Rings"
}
```

## Notes {#notes}

- `title` lässt kurze englische Wörter (a, an, and, of, the, to und ähnliche) klein, außer sie stehen am Anfang oder Ende der Zeile. `capitalized` schreibt jedes Wort groß.
- `sentence` beginnt einen neuen Satz am Textanfang, nach einem Zeilenumbruch und nach `.`, `!`, `?` oder `…` gefolgt von einem Leerzeichen, sodass der Punkt in `snapotter.com` oder `3.5` nicht zählt.
- `camel`, `pascal`, `snake` und `kebab` trennen an Leerzeichen, Satzzeichen und vorhandenen Groß-/Kleinschreibungswechseln (`XMLHttpRequest` wird zu `xml_http_request`) und konvertieren jede Zeile für sich.
- Ist `locale` auf `tr` gesetzt, wird `i` zu `İ` großgeschrieben und `I` zu `ı` kleingeschrieben. Das deutsche `ß` wird in jeder Locale zu `SS` großgeschrieben.
- Die Web-App sendet ihre aktuelle Oberflächensprache als `locale`.
