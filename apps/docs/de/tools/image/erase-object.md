---
description: "Entfernt unerwünschte Objekte aus Bildern mit KI-Inpainting (LaMa), geführt durch eine Maske des zu löschenden Bereichs."
i18n_source_hash: 8e2e42a5e4f9
i18n_provenance: human
i18n_output_hash: ce26cf5d6b89
---

# Objektradierer {#object-eraser}

Entfernt unerwünschte Objekte aus Bildern mit KI-Inpainting (LaMa-Modell). Akzeptiert ein Bild und eine Maske, die den zu löschenden Bereich angibt.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/erase-object`

**Verarbeitung:** Asynchron (gibt 202 zurück, Status per SSE über `/api/v1/jobs/{jobId}/progress` abfragen)

**Modell-Bundle:** `object-eraser-colorize` (1-2 GB)

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Quellbilddatei (Multipart) |
| mask | file | Ja | - | Maskenbild (weiß = zu löschender Bereich, schwarz = behalten). Muss mit dem Feldnamen `mask` hochgeladen werden |
| format | string | Nein | `"auto"` | Ausgabeformat: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | Nein | `95` | Ausgabequalität (1-100) |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/erase-object \
  -F "file=@photo.jpg" \
  -F "mask=@mask.png" \
  -F "format=png" \
  -F "quality=95"
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
data: {"phase":"processing","stage":"Inpainting...","percent":70}
```

### Endergebnis (per SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_erased.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 245000,
    "processedSize": 230000
  }
}
```

## Hinweise {#notes}

- Erfordert die Installation des Modell-Bundles `object-eraser-colorize` (1-2 GB).
- Die Maske muss dieselben Abmessungen wie das Quellbild haben. Weiße Pixel kennzeichnen zu löschende Bereiche; die KI füllt sie mit plausiblem Inhalt.
- Verwendet LaMa (Large Mask Inpainting) für die hochwertige Objektentfernung.
- Für Ausgabeformate, die nicht im Browser vorschaubar sind, wird neben der Hauptausgabe eine WebP-Vorschau erzeugt.
- Unterstützt die Eingabeformate HEIC/HEIF, RAW, TGA, PSD, EXR und HDR durch automatische Dekodierung.
