---
description: "Corregge i PNG con falsa trasparenza usando il matting con IA (BiRefNet) per produrre un vero canale alfa, con pulizia dei bordi tramite defringe."
i18n_source_hash: 7eb748b80f93
i18n_provenance: human
i18n_output_hash: b19550da1f33
---

# Correzione trasparenza PNG {#png-transparency-fixer}

Corregge i PNG con falsa trasparenza in un clic. Usa il matting con IA (modello BiRefNet HR Matting) per produrre una vera trasparenza alfa, con post-elaborazione defringe per ripulire i bordi.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/transparency-fixer`

**Elaborazione:** Asincrona (restituisce 202, interroga `/api/v1/jobs/{jobId}/progress` per lo stato tramite SSE)

**Bundle del modello:** `background-removal` (4-5 GB)

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| file | file | Sì | - | File immagine (multipart) |
| defringe | number | No | `30` | Intensità del defringe (0-100). Rimuove i pixel di frangia semitrasparenti attorno ai bordi |
| outputFormat | string | No | `"png"` | Formato di output: `png` o `webp` |
| removeWatermark | boolean | No | `false` | Applica la pre-elaborazione di rimozione della filigrana (filtro mediano) |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":40,"outputFormat":"png"}'
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
data: {"phase":"processing","stage":"Processing transparency...","percent":50}
```

### Risultato finale (tramite SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/fake-transparent_fixed.png",
    "originalSize": 180000,
    "processedSize": 150000,
    "filename": "fake-transparent.png"
  }
}
```

## Note {#notes}

- Richiede l'installazione del bundle del modello `background-removal` (4-5 GB).
- Usa `birefnet-hr-matting` come modello principale per un matting alfa di alta qualità. Ripiega su `birefnet-general` se il modello HR esaurisce la memoria.
- L'opzione `defringe` rimuove i pixel di frangia semitrasparenti che il matting con IA a volte lascia attorno a capelli, pelo e bordi fini. Funziona sfocando il canale alfa e azzerando i pixel a bassa confidenza.
- L'opzione `removeWatermark` applica una fase di pre-elaborazione con filtro mediano. È una riduzione di base della filigrana, non uno strumento dedicato alla rimozione della filigrana.
- Produce in output solo PNG o WebP lossless (entrambi supportano la trasparenza alfa).
- Supporta i formati di input HEIC/HEIF, RAW, TGA, PSD, EXR e HDR tramite decodifica automatica.
