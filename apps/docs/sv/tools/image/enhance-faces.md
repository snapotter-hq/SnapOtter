---
description: "Återställ och skärp suddiga eller lågkvalitativa ansikten i bilder med AI-modellerna GFPGAN och CodeFormer."
i18n_source_hash: 7f9f6af8ebda
i18n_provenance: human
i18n_output_hash: 4bd242dad04e
---

# Ansiktsförbättring {#face-enhancement}

Återställ och förbättra ansikten i bilder med AI-modeller (GFPGAN/CodeFormer).

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/enhance-faces`

**Bearbetning:** Asynkron (returnerar 202, hämta status via SSE på `/api/v1/jobs/{jobId}/progress`)

**Modellpaket:** `upscale-enhance` (5-6 GB) och `face-detection` (200-300 MB)

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bildfil (multipart) |
| model | string | Nej | `"auto"` | Modell att använda: `auto`, `gfpgan`, `codeformer` |
| strength | number | Nej | `0.8` | Förbättringsstyrka (0-1). Högre värden ger starkare förbättring |
| onlyCenterFace | boolean | Nej | `false` | Förbättra endast det mest centrala/framträdande ansiktet |
| sensitivity | number | Nej | `0.5` | Känslighet för ansiktsdetektering (0-1) |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/enhance-faces \
  -F "file=@portrait.jpg" \
  -F 'settings={"model":"codeformer","strength":0.7,"onlyCenterFace":false}'
```

## Svar {#response}

### Inledande svar (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Förlopp (SSE på `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Slutresultat (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_enhanced.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 350000,
    "processedSize": 600000,
    "facesDetected": 2,
    "faces": [
      {"x": 120, "y": 80, "w": 100, "h": 100},
      {"x": 350, "y": 90, "w": 95, "h": 95}
    ],
    "model": "codeformer"
  }
}
```

## Anteckningar {#notes}

- Kräver både modellpaketet `upscale-enhance` (5-6 GB) och modellpaketet `face-detection` (200-300 MB).
- GFPGAN ger mer aggressiv förbättring; CodeFormer bevarar identiteten bättre. `auto` väljer den bästa modellen för indatan.
- Utdatan är alltid i PNG-format för maximal kvalitet.
- En WebP-förhandsgranskning genereras vid sidan av utdatan i full upplösning för snabbare visning i frontend.
- Parametern `strength` blandar det förbättrade ansiktet med originalet. Använd lägre värden (0.3-0.5) för subtila förbättringar, högre värden (0.7-1.0) för starkare återställning.
- Stöder indataformaten HEIC/HEIF, RAW, TGA, PSD, EXR och HDR via automatisk avkodning.
