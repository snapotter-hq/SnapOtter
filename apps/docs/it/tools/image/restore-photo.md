---
description: "Ripara graffi, strappi e danni sulle vecchie foto con una pipeline AI per restauro, miglioramento dei volti e colore."
i18n_source_hash: 3de13284216c
i18n_provenance: human
i18n_output_hash: e8d0a6e10925
---

# Photo Restoration {#photo-restoration}

Ripara graffi, strappi e danni sulle vecchie foto usando una pipeline AI multi-passaggio. Combina riparazione dei graffi, miglioramento dei volti, riduzione del rumore e colorizzazione opzionale.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/restore-photo`

**Elaborazione:** Asincrona (restituisce 202, esegui il polling su `/api/v1/jobs/{jobId}/progress` per lo stato tramite SSE)

**Bundle del modello:** `photo-restoration` (4-5 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | File immagine (multipart) |
| scratchRemoval | boolean | No | `true` | Rimuovi graffi e danni superficiali |
| faceEnhancement | boolean | No | `true` | Migliora i volti nella foto restaurata |
| fidelity | number | No | `0.7` | Fedeltà del miglioramento dei volti (0-1). Valori più alti preservano di più le caratteristiche originali |
| denoise | boolean | No | `true` | Applica la riduzione del rumore al risultato restaurato |
| denoiseStrength | number | No | `25` | Intensità della riduzione del rumore (0-100) |
| colorize | boolean | No | `false` | Colorizza la foto restaurata (per immagini in scala di grigi) |
| colorizeStrength | number | No | `85` | Intensità della colorizzazione (0-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/restore-photo \
  -F "file=@damaged-old-photo.jpg" \
  -F 'settings={"scratchRemoval":true,"faceEnhancement":true,"fidelity":0.6,"colorize":true}'
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
data: {"phase":"processing","stage":"Removing scratches...","percent":30}
```

```
event: progress
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/damaged-old-photo_restored.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 200000,
    "processedSize": 350000,
    "width": 1200,
    "height": 900,
    "steps": ["scratch_removal", "face_enhancement", "denoise", "colorize"],
    "scratchCoverage": 12.5,
    "facesEnhanced": 2,
    "isGrayscale": true,
    "colorized": true
  }
}
```

## Notes {#notes}

- Richiede l'installazione del bundle del modello `photo-restoration` (4-5 GB).
- La pipeline esegue più passaggi AI in sequenza: riparazione dei graffi, miglioramento dei volti (GFPGAN), riduzione del rumore e facoltativamente colorizzazione.
- L'array `steps` nel risultato mostra quali passaggi di elaborazione sono stati effettivamente eseguiti.
- `scratchCoverage` è una percentuale stimata dell'area dell'immagine che presentava danni da graffi.
- `fidelity` controlla quanto fortemente vengono migliorati i volti rispetto alla conservazione dell'aspetto originale. Valori più bassi producono un miglioramento più aggressivo; valori più alti sono più conservativi.
- L'opzione `colorize` rileva automaticamente se l'immagine è in scala di grigi. Il flag `isGrayscale` nel risultato conferma questo rilevamento.
- Il formato di output corrisponde automaticamente al formato di input.
- Supporta i formati di input HEIC/HEIF, RAW, TGA, PSD, EXR, HDR e AVIF tramite decodifica automatica.
