---
description: "AI-driven detektering och korrigering av röda ögon orsakade av kamerablixt."
i18n_source_hash: 647c6ff1ef7c
i18n_provenance: human
i18n_output_hash: 9f0c06ecb2d1
---

# Borttagning av röda ögon {#red-eye-removal}

AI-driven detektering och korrigering av röda ögon orsakade av kamerablixt.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/red-eye-removal`

**Bearbetning:** Asynkron (returnerar 202, polla `/api/v1/jobs/{jobId}/progress` för status via SSE)

**Modellpaket:** `face-detection` (200-300 MB)

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bildfil (multipart) |
| sensitivity | number | Nej | `50` | Detekteringskänslighet för röda ögon (0-100). Högre värden detekterar mer subtila röda ögon |
| strength | number | Nej | `70` | Korrigeringsstyrka (0-100). Hur aggressivt rött ska neutraliseras |
| format | string | Nej | - | Utdataformat (valfri åsidosättning) |
| quality | number | Nej | `90` | Utdatakvalitet (1-100) |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/red-eye-removal \
  -F "file=@flash-photo.jpg" \
  -F 'settings={"sensitivity":60,"strength":80}'
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
data: {"phase":"processing","stage":"Detecting red eyes...","percent":40}
```

### Slutresultat (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/flash-photo_redeye_fixed.png",
    "originalSize": 280000,
    "processedSize": 290000,
    "facesDetected": 2,
    "eyesCorrected": 4
  }
}
```

## Anteckningar {#notes}

- Kräver att modellpaketet `face-detection` är installerat (200-300 MB).
- Detekterar först ansikten, lokaliserar sedan ögonregioner inom varje ansikte och identifierar och korrigerar slutligen pixlar med röda ögon.
- Antalet `facesDetected` anger hur många ansikten som hittades; `eyesCorrected` är det totala antalet enskilda ögon som fick röda ögon korrigerade.
- Utdata är alltid PNG för maximalt bevarande av kvaliteten.
- Stöder HEIC/HEIF-, RAW-, TGA-, PSD-, EXR- och HDR-indataformat via automatisk avkodning.
