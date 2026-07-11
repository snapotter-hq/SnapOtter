---
description: "Skala upp bilder 2x till 4x med Real-ESRGAN AI-superupplösning samtidigt som fina detaljer bevaras."
i18n_source_hash: 150032e99476
i18n_provenance: human
i18n_output_hash: de16014e5636
---

# Bilduppskalning {#image-upscaling}

AI-superupplösningsförbättring med Real-ESRGAN. Skalar upp bilder 2x-4x samtidigt som detaljer bevaras.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/upscale`

**Processing:** Asynkron (returnerar 202, avfråga `/api/v1/jobs/{jobId}/progress` för status via SSE)

**Model bundle:** `upscale-enhance` (5-6 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Bildfil (multipart) |
| scale | number | No | `2` | Uppskalningsfaktor (t.ex. 2, 3, 4) |
| model | string | No | `"auto"` | Modell att använda (t.ex. `auto`, specifika modellnamn) |
| faceEnhance | boolean | No | `false` | Tillämpa ansiktsförbättring under uppskalning |
| denoise | number | No | `0` | Brusreduceringsstyrka (0 = av) |
| format | string | No | `"auto"` | Utdataformat: `auto`, `png`, `jpg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | number | No | `95` | Utdatakvalitet (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/upscale \
  -F "file=@photo.jpg" \
  -F 'settings={"scale":4,"model":"auto","faceEnhance":true,"format":"png"}'
```

## Response {#response}

### Initial Response (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progress (SSE at `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Upscaling...","percent":60}
```

### Final Result (via SSE) {#final-result-via-sse}

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

## Notes {#notes}

- Kräver att modellpaketet `upscale-enhance` är installerat (5-6 GB).
- Använder Real-ESRGAN när det är tillgängligt; faller tillbaka till Lanczos-interpolation om AI-modellen inte är tillgänglig.
- Alternativet `faceEnhance` tillämpar GFPGAN-ansiktsåterställning under uppskalning för bättre ansiktskvalitet.
- För utdataformat som inte kan förhandsgranskas i webbläsare (HEIC, JXL, TIFF) genereras en WebP-förhandsvisning tillsammans med huvudutdatan.
- Stöder indataformaten HEIC/HEIF, RAW, TGA, PSD, EXR och HDR via automatisk avkodning.
