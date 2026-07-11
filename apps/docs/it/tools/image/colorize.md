---
description: "Colora automaticamente foto in bianco e nero o in scala di grigi con il modello di IA DDColor."
i18n_source_hash: 688aa3abbdae
i18n_provenance: human
i18n_output_hash: 489459e4e69e
---

# Colorizzazione con IA {#ai-colorization}

Converti foto in bianco e nero o in scala di grigi a colori pieni usando l'IA (modello DDColor con fallback OpenCV DNN).

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/colorize`

**Elaborazione:** Asincrona (restituisce 202, esegui il polling di `/api/v1/jobs/{jobId}/progress` per lo stato tramite SSE)

**Bundle del modello:** `object-eraser-colorize` (1-2 GB)

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| file | file | Sì | - | File immagine (multipart) |
| intensity | number | No | `1.0` | Intensità del colore (0-1). Valori più bassi producono una colorizzazione più tenue |
| model | string | No | `"auto"` | Modello da usare: `auto`, `ddcolor`, `opencv` |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/colorize \
  -F "file=@old-bw-photo.jpg" \
  -F 'settings={"intensity":0.9,"model":"auto"}'
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
data: {"phase":"processing","stage":"Colorizing...","percent":55}
```

### Risultato finale (tramite SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/old-bw-photo_colorized.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 180000,
    "processedSize": 210000,
    "width": 1920,
    "height": 1080,
    "method": "ddcolor"
  }
}
```

## Note {#notes}

- Richiede l'installazione del bundle del modello `object-eraser-colorize` (1-2 GB).
- DDColor produce risultati di qualità superiore ma è più lento; OpenCV DNN è più veloce con qualità leggermente inferiore. `auto` usa DDColor quando disponibile con fallback su OpenCV.
- Il parametro `intensity` miscela tra la scala di grigi originale e il risultato colorizzato dall'IA. Usa 1.0 per il colore pieno, valori più bassi per un aspetto vintage parzialmente desaturato.
- Il formato di output corrisponde automaticamente al formato di input.
- Per i formati di output non visualizzabili in anteprima nel browser, viene generata un'anteprima WebP insieme all'output principale.
- Supporta i formati di input HEIC/HEIF, RAW, TGA, PSD, EXR e HDR tramite decodifica automatica.
