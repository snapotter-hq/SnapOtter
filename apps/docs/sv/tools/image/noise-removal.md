---
description: "AI-driven brus- och kornborttagning med kvalitetsalternativ i flera nivåer."
i18n_source_hash: f0dfc876e0e0
i18n_provenance: human
i18n_output_hash: 1cc4427a5ea0
---

# Brusborttagning {#noise-removal}

AI-driven brus- och kornborttagning med kvalitetsalternativ i flera nivåer, med Python-sidovagnen (SCUNet-modellen).

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/noise-removal`

**Bearbetning:** Asynkron (returnerar 202, polla `/api/v1/jobs/{jobId}/progress` för status via SSE)

**Modellpaket:** `upscale-enhance` (5-6 GB)

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bildfil (multipart) |
| tier | string | Nej | `"balanced"` | Kvalitetsnivå: `quick`, `balanced`, `quality`, `maximum` |
| strength | number | Nej | `50` | Brusreduceringsstyrka (0-100) |
| detailPreservation | number | Nej | `50` | Hur mycket detaljer som ska bevaras (0-100). Högre värden behåller mer textur |
| colorNoise | number | Nej | `30` | Reduceringsstyrka för färgbrus (0-100) |
| format | string | Nej | `"original"` | Utdataformat: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | Nej | `90` | Kodningskvalitet för utdata (1-100) |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/noise-removal \
  -F "file=@noisy-photo.jpg" \
  -F 'settings={"tier":"quality","strength":60,"detailPreservation":70,"colorNoise":40}'
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
data: {"phase":"processing","stage":"Denoising...","percent":65}
```

### Slutresultat (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/noisy-photo_denoised.jpg",
    "originalSize": 500000,
    "processedSize": 380000
  }
}
```

## Anteckningar {#notes}

- Kräver att modellpaketet `upscale-enhance` är installerat (5-6 GB).
- Kvalitetsnivåer byter hastighet mot kvalitet: `quick` är snabbast med grundläggande brusreducering, `maximum` använder den mest grundliga metoden i flera pass.
- Parametern `detailPreservation` är avgörande för texturerade motiv (tyg, hår, lövverk). Högre värden hindrar brusreduceraren från att jämna ut fina detaljer.
- När `format` är satt till `"original"` matchar utdataformatet indatafilens format.
- Stöder HEIC/HEIF-, RAW-, TGA-, PSD-, EXR- och HDR-indataformat via automatisk avkodning.
