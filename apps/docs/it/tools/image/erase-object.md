---
description: "Rimuovi oggetti indesiderati dalle immagini con l'inpainting IA (LaMa), guidato da una maschera della regione da cancellare."
i18n_source_hash: 8e2e42a5e4f9
i18n_provenance: human
i18n_output_hash: 0d2755e07356
---

# Gomma per oggetti {#object-eraser}

Rimuovi oggetti indesiderati dalle immagini usando l'inpainting IA (modello LaMa). Accetta un'immagine e una maschera che indica la regione da cancellare.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/erase-object`

**Elaborazione:** Asincrona (restituisce 202, esegui il polling di `/api/v1/jobs/{jobId}/progress` per lo stato tramite SSE)

**Bundle del modello:** `object-eraser-colorize` (1-2 GB)

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| file | file | Sì | - | File immagine di origine (multipart) |
| mask | file | Sì | - | Immagine maschera (bianco = area da cancellare, nero = mantieni). Deve essere caricata con il fieldname `mask` |
| format | string | No | `"auto"` | Formato di output: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | No | `95` | Qualità di output (1-100) |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/erase-object \
  -F "file=@photo.jpg" \
  -F "mask=@mask.png" \
  -F "format=png" \
  -F "quality=95"
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
data: {"phase":"processing","stage":"Inpainting...","percent":70}
```

### Risultato finale (tramite SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_erased.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 245000,
    "processedSize": 230000
  }
}
```

## Note {#notes}

- Richiede l'installazione del bundle del modello `object-eraser-colorize` (1-2 GB).
- La maschera deve avere le stesse dimensioni dell'immagine di origine. I pixel bianchi indicano le aree da cancellare; l'IA le riempie con contenuto plausibile.
- Usa LaMa (Large Mask Inpainting) per una rimozione degli oggetti di alta qualità.
- Per i formati di output non visualizzabili in anteprima nel browser, viene generata un'anteprima WebP insieme all'output principale.
- Supporta i formati di input HEIC/HEIF, RAW, TGA, PSD, EXR e HDR tramite decodifica automatica.
