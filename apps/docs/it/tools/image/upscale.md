---
description: "Ingrandisce le immagini da 2x a 4x con la super-risoluzione IA Real-ESRGAN preservando i dettagli fini."
i18n_source_hash: 150032e99476
i18n_provenance: human
i18n_output_hash: d6389ef7853e
---

# Ingrandimento immagine {#image-upscaling}

Miglioramento con super-risoluzione IA usando Real-ESRGAN. Ingrandisce le immagini da 2x a 4x preservando i dettagli.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/upscale`

**Elaborazione:** Asincrona (restituisce 202, interroga `/api/v1/jobs/{jobId}/progress` per lo stato tramite SSE)

**Bundle del modello:** `upscale-enhance` (5-6 GB)

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| file | file | Sì | - | File immagine (multipart) |
| scale | number | No | `2` | Fattore di ingrandimento (ad esempio 2, 3, 4) |
| model | string | No | `"auto"` | Modello da usare (ad esempio `auto`, nomi di modelli specifici) |
| faceEnhance | boolean | No | `false` | Applica il miglioramento dei volti durante l'ingrandimento |
| denoise | number | No | `0` | Intensità di riduzione del rumore (0 = disattivata) |
| format | string | No | `"auto"` | Formato di output: `auto`, `png`, `jpg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | number | No | `95` | Qualità dell'output (1-100) |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/upscale \
  -F "file=@photo.jpg" \
  -F 'settings={"scale":4,"model":"auto","faceEnhance":true,"format":"png"}'
```

## Risposta {#response}

### Risposta iniziale (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Avanzamento (SSE su `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Upscaling...","percent":60}
```

### Risultato finale (tramite SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_4x.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 120000,
    "processedSize": 2400000,
    "width": 4096,
    "height": 4096,
    "method": "realesrgan-x4plus"
  }
}
```

## Note {#notes}

- Richiede l'installazione del bundle del modello `upscale-enhance` (5-6 GB).
- Usa Real-ESRGAN quando disponibile; ripiega sull'interpolazione Lanczos se il modello IA non è disponibile.
- L'opzione `faceEnhance` applica il ripristino dei volti GFPGAN durante l'ingrandimento per una migliore qualità dei volti.
- Per i formati di output non visualizzabili in anteprima dal browser (HEIC, JXL, TIFF), viene generata un'anteprima WebP insieme all'output principale.
- Supporta i formati di input HEIC/HEIF, RAW, TGA, PSD, EXR e HDR tramite decodifica automatica.
