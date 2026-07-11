---
description: "AI-aangedreven detectie en correctie van rode ogen veroorzaakt door de flitser van de camera."
i18n_source_hash: 647c6ff1ef7c
i18n_provenance: human
i18n_output_hash: 36decd520df6
---

# Red Eye Removal {#red-eye-removal}

AI-aangedreven detectie en correctie van rode ogen veroorzaakt door de flitser van de camera.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/red-eye-removal`

**Verwerking:** Asynchroon (geeft 202 terug, poll `/api/v1/jobs/{jobId}/progress` voor status via SSE)

**Modelbundel:** `face-detection` (200-300 MB)

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Afbeeldingsbestand (multipart) |
| sensitivity | number | Nee | `50` | Gevoeligheid voor detectie van rode ogen (0-100). Hogere waarden detecteren subtielere rode ogen |
| strength | number | Nee | `70` | Correctiesterkte (0-100). Hoe agressief rood wordt geneutraliseerd |
| format | string | Nee | - | Uitvoerformaat (optionele override) |
| quality | number | Nee | `90` | Uitvoerkwaliteit (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/red-eye-removal \
  -F "file=@flash-photo.jpg" \
  -F 'settings={"sensitivity":60,"strength":80}'
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
data: {"phase":"processing","stage":"Detecting red eyes...","percent":40}
```

### Final Result (via SSE) {#final-result-via-sse}

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

## Notes {#notes}

- Vereist dat de modelbundel `face-detection` is geïnstalleerd (200-300 MB).
- Detecteert eerst gezichten, lokaliseert vervolgens de oogregio's binnen elk gezicht en identificeert en corrigeert ten slotte de pixels met rode ogen.
- Het aantal `facesDetected` geeft aan hoeveel gezichten er zijn gevonden; `eyesCorrected` is het totale aantal individuele ogen waarbij rode ogen zijn gecorrigeerd.
- De uitvoer is altijd PNG voor maximaal behoud van kwaliteit.
- Ondersteunt de invoerformaten HEIC/HEIF, RAW, TGA, PSD, EXR en HDR via automatische decodering.
