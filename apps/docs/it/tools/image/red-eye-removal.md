---
description: "Rilevamento e correzione degli occhi rossi causati dal flash della fotocamera basati sull'AI."
i18n_source_hash: 647c6ff1ef7c
i18n_provenance: human
i18n_output_hash: e0978efab8d1
---

# Red Eye Removal {#red-eye-removal}

Rilevamento e correzione degli occhi rossi causati dal flash della fotocamera basati sull'AI.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/red-eye-removal`

**Elaborazione:** Asincrona (restituisce 202, esegui il polling su `/api/v1/jobs/{jobId}/progress` per lo stato tramite SSE)

**Bundle del modello:** `face-detection` (200-300 MB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | File immagine (multipart) |
| sensitivity | number | No | `50` | Sensibilità del rilevamento degli occhi rossi (0-100). Valori più alti rilevano occhi rossi più sottili |
| strength | number | No | `70` | Intensità della correzione (0-100). Quanto aggressivamente neutralizzare il rosso |
| format | string | No | - | Formato di output (override opzionale) |
| quality | number | No | `90` | Qualità dell'output (1-100) |

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

- Richiede l'installazione del bundle del modello `face-detection` (200-300 MB).
- Prima rileva i volti, poi individua le regioni degli occhi all'interno di ogni volto e infine identifica e corregge i pixel degli occhi rossi.
- Il conteggio `facesDetected` indica quanti volti sono stati trovati; `eyesCorrected` è il numero totale di singoli occhi a cui sono stati corretti gli occhi rossi.
- L'output è sempre PNG per la massima preservazione della qualità.
- Supporta i formati di input HEIC/HEIF, RAW, TGA, PSD, EXR e HDR tramite decodifica automatica.
