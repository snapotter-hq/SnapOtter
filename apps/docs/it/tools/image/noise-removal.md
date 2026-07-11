---
description: "Rimozione di rumore e grana basata sull'AI con opzioni di qualità a più livelli."
i18n_source_hash: f0dfc876e0e0
i18n_provenance: human
i18n_output_hash: 535eedd06cac
---

# Noise Removal {#noise-removal}

Rimozione di rumore e grana basata sull'AI con opzioni di qualità a più livelli, che usa il sidecar Python (modello SCUNet).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/noise-removal`

**Elaborazione:** Asincrona (restituisce 202, esegui il polling su `/api/v1/jobs/{jobId}/progress` per lo stato tramite SSE)

**Bundle del modello:** `upscale-enhance` (5-6 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | File immagine (multipart) |
| tier | string | No | `"balanced"` | Livello di qualità: `quick`, `balanced`, `quality`, `maximum` |
| strength | number | No | `50` | Intensità della riduzione del rumore (0-100) |
| detailPreservation | number | No | `50` | Quanto dettaglio preservare (0-100). Valori più alti mantengono più texture |
| colorNoise | number | No | `30` | Intensità della riduzione del rumore di colore (0-100) |
| format | string | No | `"original"` | Formato di output: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | No | `90` | Qualità di codifica dell'output (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/noise-removal \
  -F "file=@noisy-photo.jpg" \
  -F 'settings={"tier":"quality","strength":60,"detailPreservation":70,"colorNoise":40}'
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
data: {"phase":"processing","stage":"Denoising...","percent":65}
```

### Final Result (via SSE) {#final-result-via-sse}

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

## Notes {#notes}

- Richiede l'installazione del bundle del modello `upscale-enhance` (5-6 GB).
- I livelli di qualità bilanciano velocità e qualità: `quick` è il più veloce con una riduzione del rumore di base, `maximum` usa l'approccio multi-passaggio più accurato.
- Il parametro `detailPreservation` è cruciale per i soggetti con texture (tessuti, capelli, fogliame). Valori più alti impediscono al denoiser di attenuare i dettagli fini.
- Quando `format` è impostato su `"original"`, il formato di output corrisponde al formato del file di input.
- Supporta i formati di input HEIC/HEIF, RAW, TGA, PSD, EXR e HDR tramite decodifica automatica.
