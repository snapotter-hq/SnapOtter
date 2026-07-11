---
description: "Konvertiert Bilder in Base64-Data-URIs zum Einbetten in HTML, CSS und mehr."
i18n_source_hash: ba4b8f3b4ece
i18n_provenance: human
i18n_output_hash: bd26bbb0b923
---

# Bild zu Base64 {#image-to-base64}

Konvertiert ein oder mehrere Bilder in Base64-codierte Zeichenketten und Data-URIs. Unterstützt optionale Formatkonvertierung, Qualitätssteuerung und Größenänderung. Nützlich zum direkten Einbetten von Bildern in HTML, CSS, JSON oder E-Mail-Vorlagen.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/image-to-base64`

Akzeptiert Multipart-Formulardaten mit einer oder mehreren Bilddateien und einem optionalen JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| outputFormat | string | Nein | `"original"` | Vor der Codierung konvertieren: `original`, `jpeg`, `png`, `webp`, `avif`, `jxl` |
| quality | number | Nein | `80` | Ausgabequalität für verlustbehaftete Formate (1 bis 100) |
| maxWidth | number | Nein | `0` | Maximale Breite in Pixeln (0 = keine Größenänderung, vergrößert nicht) |
| maxHeight | number | Nein | `0` | Maximale Höhe in Pixeln (0 = keine Größenänderung, vergrößert nicht) |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon.png" \
  -F 'settings={"outputFormat": "webp", "quality": 80, "maxWidth": 200}'
```

Mehrere Dateien:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon1.png" \
  -F "file=@icon2.png" \
  -F "file=@icon3.png" \
  -F 'settings={"outputFormat": "original"}'
```

## Beispielantwort {#example-response}

```json
{
  "results": [
    {
      "filename": "icon.png",
      "mimeType": "image/webp",
      "width": 200,
      "height": 200,
      "originalSize": 45000,
      "encodedSize": 28800,
      "overheadPercent": -36.0,
      "base64": "UklGRlYAAABXRUJQ...",
      "dataUri": "data:image/webp;base64,UklGRlYAAABXRUJQ..."
    }
  ],
  "errors": []
}
```

## Antwortfelder {#response-fields}

| Feld | Typ | Beschreibung |
|-------|------|-------------|
| results | array | Erfolgreich konvertierte Bilder |
| errors | array | Bilder, die nicht verarbeitet werden konnten (mit Dateiname und Fehlermeldung) |

### Ergebnis-Objekt {#result-object}

| Feld | Typ | Beschreibung |
|-------|------|-------------|
| filename | string | Ursprünglicher Dateiname |
| mimeType | string | MIME-Typ der codierten Ausgabe |
| width | number | Endgültige Breite in Pixeln (nach etwaiger Größenänderung) |
| height | number | Endgültige Höhe in Pixeln (nach etwaiger Größenänderung) |
| originalSize | number | Ursprüngliche Dateigröße in Bytes |
| encodedSize | number | Größe der Base64-Zeichenkette in Bytes |
| overheadPercent | number | Prozentuale Größendifferenz gegenüber dem Original (positiv = größer, negativ = kleiner) |
| base64 | string | Rohe Base64-codierte Bilddaten |
| dataUri | string | Vollständiger Data-URI, bereit zur Verwendung in `src`-Attributen |

## Hinweise {#notes}

- Die Base64-Codierung vergrößert die Größe typischerweise um etwa 33 % im Vergleich zur Binärdatei. Das Feld `overheadPercent` zeigt die tatsächliche Differenz.
- Wenn `outputFormat` auf `"original"` steht, werden HEIC/HEIF-Dateien in JPEG konvertiert (da Browser HEIC nicht in Data-URIs anzeigen können).
- Die Optionen `maxWidth` und `maxHeight` ändern die Größe mit `fit: inside` und `withoutEnlargement`, sodass Bilder, die kleiner als die angegebenen Abmessungen sind, nicht hochskaliert werden.
- Mehrere Dateien können in einer einzigen Anfrage verarbeitet werden. Jede Datei wird unabhängig verarbeitet, und Fehler verhindern nicht, dass andere Dateien erfolgreich sind.
- SVG-Dateien werden als `image/svg+xml` ohne Neucodierung durchgereicht (es sei denn, es wird eine Formatkonvertierung angefordert).
- Dies ist ein schreibgeschützter Endpunkt. Er erzeugt keine herunterladbare Datei und keine `jobId`. Die Base64-Daten werden direkt im Antworttext zurückgegeben.
