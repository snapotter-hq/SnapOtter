---
description: "Motiv-, ansikts- och entropimedveten beskärning som ramar in bilder intelligent med hjälp av Sharp och AI-ansiktsdetektering."
i18n_source_hash: acbe1439c6d8
i18n_provenance: human
i18n_output_hash: 34495f017691
---

# Smart Crop {#smart-crop}

Smart motiv-, ansikts- eller trimningsbaserad beskärning. Använder Sharps strategier för uppmärksamhet/entropi och AI-ansiktsdetektering för intelligent inramning.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/smart-crop`

**Processing:** Asynkron (returnerar 202, avfråga `/api/v1/jobs/{jobId}/progress` för status via SSE)

**Model bundle:** `face-detection` (200-300 MB) - krävs endast för läget `face`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Bildfil (multipart) |
| mode | string | No | `"subject"` | Beskärningsläge: `subject`, `face`, `trim`. (Äldre värden `attention` och `content` mappas till `subject` och `trim`) |
| strategy | string | No | `"attention"` | Strategi för motivläge: `attention` eller `entropy` |
| width | integer | No | - | Målbredd i pixlar |
| height | integer | No | - | Målhöjd i pixlar |
| padding | integer | No | `0` | Utfyllnadsprocent runt motivet (0-50) |
| facePreset | string | No | `"head-shoulders"` | Förinställning för ansiktsinramning: `closeup`, `head-shoulders`, `upper-body`, `half-body` |
| sensitivity | number | No | `0.5` | Känslighet för ansiktsdetektering (0-1) |
| threshold | integer | No | `30` | Tröskel för trimningsläge vid bakgrundsdetektering (0-255) |
| padToSquare | boolean | No | `false` | Fyll ut det trimmade resultatet till en kvadrat |
| padColor | string | No | `"#ffffff"` | Bakgrundsfärg för utfyllnad |
| targetSize | integer | No | - | Målstorlek för utfylld utdata (pixlar) |
| quality | integer | No | - | Utdatakvalitet (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/smart-crop \
  -F "file=@portrait.jpg" \
  -F 'settings={"mode":"face","width":1080,"height":1080,"facePreset":"head-shoulders"}'
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
data: {"phase":"processing","percent":50}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_smartcrop.jpg",
    "originalSize": 500000,
    "processedSize": 320000
  }
}
```

## Modes {#modes}

### Subject Mode {#subject-mode}
Använder Sharps strategi för uppmärksamhet eller entropi för att hitta det visuellt mest intressanta området och beskär runt det.

### Face Mode {#face-mode}
Detekterar ansikten med AI och ramar sedan in beskärningen runt de detekterade ansiktena med den angivna `facePreset`. Faller tillbaka till motivläge (uppmärksamhetsstrategi) om inga ansikten detekteras.

### Trim Mode {#trim-mode}
Tar bort enhetliga ramar/bakgrund från bilden. Fyller valfritt ut resultatet till en kvadrat med angiven bakgrundsfärg och målstorlek.

## Notes {#notes}

- Detta verktyg använder fabriken `createToolRoute` med `executionHint: "long"`, så det returnerar 202 med SSE-förlopp.
- Ansiktsläge kräver modellpaketet `face-detection` (200-300 MB).
- Motiv- och trimningslägen fungerar utan något AI-modellpaket.
- `facePreset` avgör hur tätt beskärningen ramar in detekterade ansikten: `closeup` är den tätaste, `half-body` är den vidaste.
- Om ingen bredd/höjd anges är standardvärdet 1080x1080.
