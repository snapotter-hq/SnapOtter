---
description: "Espande la tela di un'immagine con outpainting basato su IA, estendendola in qualsiasi direzione e riempiendo le nuove aree in modo coerente con l'originale."
i18n_source_hash: 1b00db4ed40d
i18n_provenance: human
i18n_output_hash: c90a990016d1
---

# Espansione tela con IA {#ai-canvas-expand}

Espande la tela di un'immagine con riempimento basato su IA (outpainting). Estende l'immagine in qualsiasi direzione e riempie le nuove aree con contenuto generato dall'IA in modo coerente con l'immagine esistente.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/ai-canvas-expand`

**Elaborazione:** asincrona (restituisce 202, interroga `/api/v1/jobs/{jobId}/progress` per lo stato tramite SSE)

**Bundle del modello:** `object-eraser-colorize` (1-2 GB)

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| file | file | Sì | - | File immagine (multipart) |
| extendTop | integer | No | `0` | Pixel di estensione in alto |
| extendRight | integer | No | `0` | Pixel di estensione a destra |
| extendBottom | integer | No | `0` | Pixel di estensione in basso |
| extendLeft | integer | No | `0` | Pixel di estensione a sinistra |
| tier | string | No | `"balanced"` | Livello di qualità: `fast`, `balanced`, `high` |
| format | string | No | `"auto"` | Formato di output: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | No | `95` | Qualità di output (1-100) |

Almeno una direzione di estensione deve essere maggiore di 0.

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ai-canvas-expand \
  -F "file=@photo.jpg" \
  -F 'settings={"extendTop":200,"extendBottom":200,"extendLeft":100,"extendRight":100,"tier":"balanced"}'
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
data: {"phase":"processing","stage":"Expanding canvas...","percent":50}
```

### Risultato finale (tramite SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_extended.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 300000,
    "processedSize": 520000
  }
}
```

## Note {#notes}

- Richiede l'installazione del bundle del modello `object-eraser-colorize` (1-2 GB).
- Usa l'outpainting basato su LaMa per generare contenuto per le regioni espanse.
- Il parametro `tier` bilancia velocità e qualità: `fast` produce risultati rapidamente con possibili artefatti, `high` impiega più tempo ma produce riempimenti più uniformi e coerenti.
- I valori di estensione sono in pixel. Le dimensioni finali dell'immagine saranno: larghezza originale + extendLeft + extendRight per altezza originale + extendTop + extendBottom.
- Per i formati di output non visualizzabili in anteprima nel browser (HEIC, JXL, TIFF), viene generata un'anteprima WebP insieme all'output principale.
- Supporta i formati di input HEIC/HEIF, RAW, TGA, PSD, EXR e HDR tramite decodifica automatica.
