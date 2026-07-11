---
description: "Ritaglio intelligente basato su soggetto, volti ed entropia che inquadra le immagini in modo intelligente usando Sharp e il rilevamento dei volti con IA."
i18n_source_hash: acbe1439c6d8
i18n_provenance: human
i18n_output_hash: f83f7a8ae90e
---

# Ritaglio intelligente {#smart-crop}

Ritaglio intelligente basato su soggetto, volti o rifilatura. Usa le strategie attention/entropy di Sharp e il rilevamento dei volti con IA per un'inquadratura intelligente.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/smart-crop`

**Elaborazione:** Asincrona (restituisce 202, interroga `/api/v1/jobs/{jobId}/progress` per lo stato tramite SSE)

**Bundle del modello:** `face-detection` (200-300 MB) - richiesto solo per la modalità `face`

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| file | file | Sì | - | File immagine (multipart) |
| mode | string | No | `"subject"` | Modalità di ritaglio: `subject`, `face`, `trim`. (I valori legacy `attention` e `content` corrispondono a `subject` e `trim`) |
| strategy | string | No | `"attention"` | Strategia per la modalità soggetto: `attention` o `entropy` |
| width | integer | No | - | Larghezza target in pixel |
| height | integer | No | - | Altezza target in pixel |
| padding | integer | No | `0` | Percentuale di margine attorno al soggetto (0-50) |
| facePreset | string | No | `"head-shoulders"` | Preset di inquadratura del volto: `closeup`, `head-shoulders`, `upper-body`, `half-body` |
| sensitivity | number | No | `0.5` | Sensibilità del rilevamento dei volti (0-1) |
| threshold | integer | No | `30` | Soglia della modalità rifilatura per il rilevamento dello sfondo (0-255) |
| padToSquare | boolean | No | `false` | Aggiunge margine al risultato rifilato per renderlo quadrato |
| padColor | string | No | `"#ffffff"` | Colore di sfondo per il margine |
| targetSize | integer | No | - | Dimensione target per l'output con margine (pixel) |
| quality | integer | No | - | Qualità dell'output (1-100) |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/smart-crop \
  -F "file=@portrait.jpg" \
  -F 'settings={"mode":"face","width":1080,"height":1080,"facePreset":"head-shoulders"}'
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
data: {"phase":"processing","percent":50}
```

### Risultato finale (tramite SSE) {#final-result-via-sse}

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

## Modalità {#modes}

### Modalità soggetto {#subject-mode}
Usa la strategia attention o entropy di Sharp per individuare la regione visivamente più interessante e ritaglia attorno ad essa.

### Modalità volto {#face-mode}
Rileva i volti con l'IA, poi inquadra il ritaglio attorno ai volti rilevati usando il `facePreset` specificato. Se non viene rilevato alcun volto, ripiega sulla modalità soggetto (strategia attention).

### Modalità rifilatura {#trim-mode}
Rimuove i bordi/lo sfondo uniformi dall'immagine. Facoltativamente aggiunge un margine al risultato per renderlo quadrato con un colore di sfondo e una dimensione target specificati.

## Note {#notes}

- Questo strumento usa la factory `createToolRoute` con `executionHint: "long"`, quindi restituisce 202 con avanzamento tramite SSE.
- La modalità volto richiede il bundle del modello `face-detection` (200-300 MB).
- Le modalità soggetto e rifilatura funzionano senza alcun bundle di modello IA.
- Il `facePreset` determina quanto strettamente il ritaglio inquadra i volti rilevati: `closeup` è il più stretto, `half-body` è il più ampio.
- Se non vengono specificate larghezza/altezza, il valore predefinito è 1080x1080.
