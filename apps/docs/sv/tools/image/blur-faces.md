---
description: "Upptäck och gör ansikten suddiga automatiskt i bilder med AI-ansiktsigenkänning för integritet och GDPR-kompatibel anonymisering."
i18n_source_hash: 314e3e16a422
i18n_provenance: human
i18n_output_hash: 6b12ac5945fa
---

# Gör ansikten & PII oskarpa {#face-pii-blur}

Upptäck och gör ansikten suddiga automatiskt i bilder med AI-driven ansiktsigenkänning (MediaPipe).

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/blur-faces`

**Bearbetning:** Asynkron (returnerar 202, hämta status genom att polla `/api/v1/jobs/{jobId}/progress` via SSE)

**Modellpaket:** `face-detection` (200-300 MB)

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| file | fil | Ja | - | Bildfil (multipart) |
| blurRadius | tal | Nej | `30` | Oskärperadie som tillämpas på upptäckta ansikten (1-100) |
| sensitivity | tal | Nej | `0.5` | Känslighet för ansiktsigenkänning (0-1). Lägre värden upptäcker färre ansikten med högre säkerhet |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-faces \
  -F "file=@group-photo.jpg" \
  -F 'settings={"blurRadius":40,"sensitivity":0.3}'
```

## Svar {#response}

### Första svaret (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Förlopp (SSE på `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Detecting faces...","percent":40}
```

### Slutresultat (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/group-photo_blurred.jpg",
    "originalSize": 450000,
    "processedSize": 420000,
    "facesDetected": 3,
    "faces": [
      {"x": 100, "y": 50, "w": 80, "h": 80},
      {"x": 300, "y": 60, "w": 75, "h": 75},
      {"x": 500, "y": 55, "w": 85, "h": 85}
    ]
  }
}
```

### Inga ansikten upptäckta {#no-faces-detected}

Om inga ansikten hittas innehåller resultatet en varning:

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "facesDetected": 0,
    "warning": "No faces detected in this image. Try increasing detection sensitivity."
  }
}
```

## Anteckningar {#notes}

- Kräver att modellpaketet `face-detection` är installerat (200-300 MB).
- Utdataformatet matchar indataformatet automatiskt.
- Arrayen `faces` innehåller begränsningsrutans koordinater (x, y, bredd, höjd) för varje upptäckt ansikte.
- Öka `sensitivity` (närmare 1,0) för att upptäcka fler ansikten, inklusive delvis skymda.
- Stöder indataformaten HEIC/HEIF, RAW, TGA, PSD, EXR och HDR via automatisk avkodning.
