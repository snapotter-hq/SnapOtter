---
description: "Bilder mit Real-ESRGAN-KI-Superauflösung 2x bis 4x hochskalieren und dabei feine Details bewahren."
i18n_source_hash: 150032e99476
i18n_provenance: human
i18n_output_hash: b951e30a9313
---

# Bild hochskalieren {#image-upscaling}

KI-Superauflösungsverbesserung mit Real-ESRGAN. Skaliert Bilder 2x-4x hoch und bewahrt dabei Details.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/upscale`

**Verarbeitung:** Asynchron (liefert 202 zurück, Status über SSE per `/api/v1/jobs/{jobId}/progress` abrufen)

**Modell-Bundle:** `upscale-enhance` (5-6 GB)

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bilddatei (Multipart) |
| scale | number | Nein | `2` | Hochskalierungsfaktor (z. B. 2, 3, 4) |
| model | string | Nein | `"auto"` | Zu verwendendes Modell (z. B. `auto`, spezifische Modellnamen) |
| faceEnhance | boolean | Nein | `false` | Gesichtsverbesserung während der Hochskalierung anwenden |
| denoise | number | Nein | `0` | Rauschreduzierungsstärke (0 = aus) |
| format | string | Nein | `"auto"` | Ausgabeformat: `auto`, `png`, `jpg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | number | Nein | `95` | Ausgabequalität (1-100) |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/upscale \
  -F "file=@photo.jpg" \
  -F 'settings={"scale":4,"model":"auto","faceEnhance":true,"format":"png"}'
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
data: {"phase":"processing","stage":"Upscaling...","percent":60}
```

### Endergebnis (über SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_4x.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 120000,
    "processedSize": 2400000,
    "width": 4096,
    "height": 4096,
    "method": "realesrgan-x4plus"
  }
}
```

## Hinweise {#notes}

- Erfordert die Installation des Modell-Bundles `upscale-enhance` (5-6 GB).
- Verwendet Real-ESRGAN, sofern verfügbar; fällt auf Lanczos-Interpolation zurück, wenn das KI-Modell nicht verfügbar ist.
- Die Option `faceEnhance` wendet während der Hochskalierung eine GFPGAN-Gesichtsrestaurierung für bessere Gesichtsqualität an.
- Für nicht im Browser vorschaubare Ausgabeformate (HEIC, JXL, TIFF) wird neben der Hauptausgabe eine WebP-Vorschau erzeugt.
- Unterstützt HEIC/HEIF-, RAW-, TGA-, PSD-, EXR- und HDR-Eingabeformate durch automatische Dekodierung.
