---
description: "Färglägg svartvita foton eller gråskalefoton automatiskt med AI-modellen DDColor."
i18n_source_hash: 688aa3abbdae
i18n_provenance: human
i18n_output_hash: b3594c13c5b3
---

# AI-färgläggning {#ai-colorization}

Omvandla svartvita foton eller gråskalefoton till fullfärg med AI (DDColor-modellen med OpenCV DNN som reserv).

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/colorize`

**Bearbetning:** Asynkron (returnerar 202, hämta status via SSE på `/api/v1/jobs/{jobId}/progress`)

**Modellpaket:** `object-eraser-colorize` (1-2 GB)

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bildfil (multipart) |
| intensity | number | Nej | `1.0` | Färgintensitet (0-1). Lägre värden ger mer subtil färgläggning |
| model | string | Nej | `"auto"` | Modell att använda: `auto`, `ddcolor`, `opencv` |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/colorize \
  -F "file=@old-bw-photo.jpg" \
  -F 'settings={"intensity":0.9,"model":"auto"}'
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
data: {"phase":"processing","stage":"Colorizing...","percent":55}
```

### Slutresultat (via SSE) {#final-result-via-sse}

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

## Anteckningar {#notes}

- Kräver att modellpaketet `object-eraser-colorize` är installerat (1-2 GB).
- DDColor ger resultat av högre kvalitet men är långsammare; OpenCV DNN är snabbare med något lägre kvalitet. `auto` använder DDColor när det är tillgängligt med OpenCV som reserv.
- Parametern `intensity` blandar mellan den ursprungliga gråskalan och det AI-färglagda resultatet. Använd 1.0 för fullfärg, lägre värden för ett delvis avmättat vintageutseende.
- Utdataformatet matchar indataformatet automatiskt.
- För utdataformat som inte kan förhandsgranskas i webbläsaren genereras en WebP-förhandsgranskning vid sidan av huvudutdatan.
- Stöder indataformaten HEIC/HEIF, RAW, TGA, PSD, EXR och HDR via automatisk avkodning.
