---
description: "Erfasst Webseiten oder HTML-Snippets als hochwertige Bilder mit Geräteemulation."
i18n_source_hash: 307493f63631
i18n_provenance: machine
i18n_output_hash: 5a0e557af1c8
i18n_hash_version: 2
---

# HTML zu Bild {#html-to-image}

Erfasst eine Webseiten-URL oder rohen HTML-Inhalt als Screenshot-Bild. Unterstützt Geräteemulation (Desktop, Tablet, Mobil), Erfassung der gesamten Seite und mehrere Ausgabeformate.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/html-to-image`

Akzeptiert einen **JSON-Body** (kein Multipart). Es ist kein Datei-Upload erforderlich.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| url | string | Bedingt | - | Zu erfassende URL (muss eine gültige URL sein) |
| html | string | Bedingt | - | Zu rendernder roher HTML-Inhalt (1 bis 5.000.000 Zeichen) |
| format | string | Nein | `"png"` | Ausgabeformat: `jpg`, `png`, `webp` |
| quality | number | Nein | `90` | Ausgabequalität für verlustbehaftete Formate (1 bis 100) |
| fullPage | boolean | Nein | `false` | Die gesamte scrollbare Seite erfassen, nicht nur den sichtbaren Bereich |
| devicePreset | string | Nein | `"desktop"` | Geräteemulation: `desktop`, `tablet`, `mobile`, `custom` |
| viewportWidth | number | Nein | `1280` | Benutzerdefinierte Viewport-Breite in Pixeln (320 bis 3840, verwendet, wenn devicePreset `custom` ist) |
| viewportHeight | number | Nein | `720` | Benutzerdefinierte Viewport-Höhe in Pixeln (320 bis 2160, verwendet, wenn devicePreset `custom` ist) |
| clientJobId | string | Nein | - | Deine eigene Job-ID, damit du den Fortschrittsstream öffnen kannst, bevor die Antwort eintrifft |

Entweder `url` oder `html` muss angegeben werden, aber nicht beides.

### Geräte-Voreinstellungen {#device-presets}

| Voreinstellung | Breite | Höhe | Mobile UA |
|--------|-------|--------|-----------|
| `desktop` | 1280 | 720 | Nein |
| `tablet` | 768 | 1024 | Nein |
| `mobile` | 375 | 812 | Ja |
| `custom` | (benutzerdefiniert) | (benutzerdefiniert) | Nein |

## Beispielanfrage {#example-request}

Eine Webseite erfassen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "format": "png", "fullPage": true, "devicePreset": "desktop"}'
```

HTML-Inhalt rendern:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"html": "<div style=\"padding: 20px; background: #f0f0f0;\"><h1>Hello</h1></div>", "format": "png"}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 0,
  "processedSize": 145000
}
```

### Langsame Seiten {#slow-pages}

Die Erfassung läuft als Job in einer Warteschlange. Eine Erfassung, die innerhalb des synchronen Wartefensters fertig wird, antwortet mit `200` und dem obigen Ergebnis. Eine langsamere antwortet mit `202` und einer Job-ID:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true,
  "statusUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "progressUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890/progress"
}
```

Folge `progressUrl` (Server-Sent Events), bis der Job abgeschlossen ist. Das Abschluss-Ereignis enthält dasselbe Ergebnisobjekt wie die Antwort `200`. Du kannst den Job mit `POST /api/v1/jobs/{jobId}/cancel` abbrechen.

::: warning Geändert nach 2.3.0
Bis 2.3.0 hielt dieser Endpunkt die Anfrage immer offen, bis die Erfassung fertig war, und antwortete mit `200`. Skripte, die nur `200` behandeln, sollten auch `202` behandeln.
:::

## Hinweise {#notes}

- Erfordert, dass Chromium auf dem Server installiert ist. Gibt HTTP 503 zurück, wenn der Browser-Dienst nicht verfügbar ist.
- URLs werden gegen SSRF-Angriffe validiert (private/interne Netzwerkadressen werden blockiert).
- Dieser Endpunkt ist auf 120 Anfragen pro Stunde begrenzt.
- `originalSize` ist immer 0, da dieses Werkzeug Bilder aus URLs/HTML generiert.
- Der Ausgabedateiname lautet `screenshot.<format>`.
- Wenn das Laden der Seite zu lange dauert, schlägt die Erfassung mit HTTP 504 (Gateway-Timeout) fehl.
- Wenn der Browser-Dienst wiederholt abstürzt, wird er vorübergehend deaktiviert, und die Erfassung schlägt mit HTTP 503 und dem Code `BROWSER_CRASHED` fehl.
- Ein Browser-Absturz (HTTP 503) wird einmal wiederholt, bevor der Fehler gemeldet wird, wie bei anderen Bild-Jobs in der Warteschlange. Ein Timeout beim Laden der Seite wird nicht wiederholt.
- Eine Erfassung, die bereits mit `202` geantwortet hat, meldet einen Fehler auf ihrem Fortschrittsstream statt im HTTP-Status.
