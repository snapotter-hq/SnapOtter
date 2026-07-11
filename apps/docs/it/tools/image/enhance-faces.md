---
description: "Ripristina e nitidizza i volti sfocati o di bassa qualità nelle immagini con i modelli di IA GFPGAN e CodeFormer."
i18n_source_hash: 7f9f6af8ebda
i18n_provenance: human
i18n_output_hash: 54c3c08941c0
---

# Miglioramento dei volti {#face-enhancement}

Ripristina e migliora i volti nelle immagini usando modelli di IA (GFPGAN/CodeFormer).

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/enhance-faces`

**Elaborazione:** Asincrona (restituisce 202, esegui il polling di `/api/v1/jobs/{jobId}/progress` per lo stato tramite SSE)

**Bundle dei modelli:** `upscale-enhance` (5-6 GB) e `face-detection` (200-300 MB)

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| file | file | Sì | - | File immagine (multipart) |
| model | string | No | `"auto"` | Modello da usare: `auto`, `gfpgan`, `codeformer` |
| strength | number | No | `0.8` | Intensità del miglioramento (0-1). Valori più alti producono un miglioramento più forte |
| onlyCenterFace | boolean | No | `false` | Migliora solo il volto più centrale/prominente |
| sensitivity | number | No | `0.5` | Sensibilità del rilevamento dei volti (0-1) |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/enhance-faces \
  -F "file=@portrait.jpg" \
  -F 'settings={"model":"codeformer","strength":0.7,"onlyCenterFace":false}'
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
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Risultato finale (tramite SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_enhanced.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 350000,
    "processedSize": 600000,
    "facesDetected": 2,
    "faces": [
      {"x": 120, "y": 80, "w": 100, "h": 100},
      {"x": 350, "y": 90, "w": 95, "h": 95}
    ],
    "model": "codeformer"
  }
}
```

## Note {#notes}

- Richiede sia il bundle del modello `upscale-enhance` (5-6 GB) sia il bundle del modello `face-detection` (200-300 MB).
- GFPGAN produce un miglioramento più aggressivo; CodeFormer preserva meglio l'identità. `auto` seleziona il modello migliore per l'input.
- L'output è sempre in formato PNG per la massima qualità.
- Un'anteprima WebP viene generata insieme all'output a piena risoluzione per una visualizzazione più rapida nel frontend.
- Il parametro `strength` miscela il volto migliorato con l'originale. Usa valori più bassi (0.3-0.5) per miglioramenti tenui, valori più alti (0.7-1.0) per un ripristino più forte.
- Supporta i formati di input HEIC/HEIF, RAW, TGA, PSD, EXR e HDR tramite decodifica automatica.
