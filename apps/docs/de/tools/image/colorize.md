---
description: "Koloriert Schwarzweiß- oder Graustufenfotos automatisch mit dem KI-Modell DDColor."
i18n_source_hash: 688aa3abbdae
i18n_provenance: human
i18n_output_hash: bf0737dde699
---

# KI-Kolorierung {#ai-colorization}

Wandelt Schwarzweiß- oder Graustufenfotos mit KI in Vollfarbe um (DDColor-Modell mit OpenCV-DNN-Fallback).

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/colorize`

**Verarbeitung:** Asynchron (gibt 202 zurück, Status per SSE über `/api/v1/jobs/{jobId}/progress` abfragen)

**Modell-Bundle:** `object-eraser-colorize` (1-2 GB)

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bilddatei (Multipart) |
| intensity | number | Nein | `1.0` | Farbintensität (0-1). Niedrigere Werte erzeugen eine dezentere Kolorierung |
| model | string | Nein | `"auto"` | Zu verwendendes Modell: `auto`, `ddcolor`, `opencv` |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/colorize \
  -F "file=@old-bw-photo.jpg" \
  -F 'settings={"intensity":0.9,"model":"auto"}'
```

## Antwort {#response}

### Erste Antwort (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Fortschritt (SSE unter `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Colorizing...","percent":55}
```

### Endergebnis (per SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/old-bw-photo_colorized.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 180000,
    "processedSize": 210000,
    "width": 1920,
    "height": 1080,
    "method": "ddcolor"
  }
}
```

## Hinweise {#notes}

- Erfordert die Installation des Modell-Bundles `object-eraser-colorize` (1-2 GB).
- DDColor liefert Ergebnisse in höherer Qualität, ist aber langsamer; OpenCV DNN ist schneller bei etwas geringerer Qualität. `auto` verwendet DDColor, sofern verfügbar, mit OpenCV als Fallback.
- Der Parameter `intensity` blendet zwischen dem ursprünglichen Graustufenbild und dem KI-kolorierten Ergebnis über. Verwenden Sie 1.0 für volle Farbe, niedrigere Werte für einen teils entsättigten Vintage-Look.
- Das Ausgabeformat entspricht automatisch dem Eingabeformat.
- Für Ausgabeformate, die nicht im Browser vorschaubar sind, wird neben der Hauptausgabe eine WebP-Vorschau erzeugt.
- Unterstützt die Eingabeformate HEIC/HEIF, RAW, TGA, PSD, EXR und HDR durch automatische Dekodierung.
