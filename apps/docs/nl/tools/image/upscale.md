---
description: "Afbeeldingen 2x tot 4x opschalen met Real-ESRGAN AI-superresolutie met behoud van fijne details."
i18n_source_hash: 150032e99476
i18n_provenance: human
i18n_output_hash: f795cf5f2bc2
---

# Afbeelding Opschalen {#image-upscaling}

AI-superresolutieverbetering met Real-ESRGAN. Schaalt afbeeldingen 2x-4x op met behoud van details.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/upscale`

**Verwerking:** Asynchroon (retourneert 202, poll `/api/v1/jobs/{jobId}/progress` voor de status via SSE)

**Modelbundel:** `upscale-enhance` (5-6 GB)

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Afbeeldingsbestand (multipart) |
| scale | number | Nee | `2` | Opschaalfactor (bijv. 2, 3, 4) |
| model | string | Nee | `"auto"` | Te gebruiken model (bijv. `auto`, specifieke modelnamen) |
| faceEnhance | boolean | Nee | `false` | Pas gezichtsverbetering toe tijdens het opschalen |
| denoise | number | Nee | `0` | Sterkte van ruisonderdrukking (0 = uit) |
| format | string | Nee | `"auto"` | Uitvoerformaat: `auto`, `png`, `jpg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | number | Nee | `95` | Uitvoerkwaliteit (1-100) |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/upscale \
  -F "file=@photo.jpg" \
  -F 'settings={"scale":4,"model":"auto","faceEnhance":true,"format":"png"}'
```

## Respons {#response}

### Eerste respons (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Voortgang (SSE op `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Upscaling...","percent":60}
```

### Eindresultaat (via SSE) {#final-result-via-sse}

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

## Opmerkingen {#notes}

- Vereist dat de modelbundel `upscale-enhance` is geïnstalleerd (5-6 GB).
- Gebruikt Real-ESRGAN indien beschikbaar; valt terug op Lanczos-interpolatie als het AI-model niet beschikbaar is.
- De optie `faceEnhance` past GFPGAN-gezichtsherstel toe tijdens het opschalen voor een betere gezichtskwaliteit.
- Voor uitvoerformaten die niet in de browser kunnen worden bekeken (HEIC, JXL, TIFF) wordt naast de hoofduitvoer een WebP-voorbeeld gegenereerd.
- Ondersteunt HEIC-/HEIF-, RAW-, TGA-, PSD-, EXR- en HDR-invoerformaten via automatische decodering.
