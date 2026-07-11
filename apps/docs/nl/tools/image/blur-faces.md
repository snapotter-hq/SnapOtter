---
description: "Detecteer en vervaag gezichten in afbeeldingen automatisch met AI-gezichtsdetectie voor privacy en AVG-conforme anonimisering."
i18n_source_hash: fb861c12aea5
i18n_provenance: human
i18n_output_hash: 47020ab1bcc1
---

# Gezichts- / PII-vervaging {#face-pii-blur}

Detecteer en vervaag gezichten in afbeeldingen automatisch met AI-gestuurde gezichtsdetectie (MediaPipe).

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/image/blur-faces`

**Verwerking:** Asynchroon (retourneert 202, poll `/api/v1/jobs/{jobId}/progress` voor de status via SSE)

**Modelbundel:** `face-detection` (200-300 MB)

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Afbeeldingsbestand (multipart) |
| blurRadius | number | Nee | `30` | Vervagingsstraal toegepast op gedetecteerde gezichten (1-100) |
| sensitivity | number | Nee | `0.5` | Gevoeligheid van gezichtsdetectie (0-1). Lagere waarden detecteren minder gezichten met hogere betrouwbaarheid |

## Voorbeeldaanvraag {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-faces \
  -F "file=@group-photo.jpg" \
  -F 'settings={"blurRadius":40,"sensitivity":0.3}'
```

## Antwoord {#response}

### Initieel antwoord (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Voortgang (SSE op `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Detecting faces...","percent":40}
```

### Eindresultaat (via SSE) {#final-result-via-sse}

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

### Geen gezichten gedetecteerd {#no-faces-detected}

Als er geen gezichten worden gevonden, bevat het resultaat een waarschuwing:

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

## Opmerkingen {#notes}

- Vereist dat de modelbundel `face-detection` is geïnstalleerd (200-300 MB).
- Het uitvoerformaat komt automatisch overeen met het invoerformaat.
- De array `faces` bevat de coördinaten van de omkadering (x, y, breedte, hoogte) voor elk gedetecteerd gezicht.
- Verhoog `sensitivity` (dichter bij 1.0) om meer gezichten te detecteren, waaronder gedeeltelijk bedekte.
- Ondersteunt de invoerformaten HEIC/HEIF, RAW, TGA, PSD, EXR en HDR via automatische decodering.
