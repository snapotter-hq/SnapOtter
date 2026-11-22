---
description: "Ridimensionamento con seam carving che aggiunge o rimuove pixel lungo i percorsi di minore importanza per preservare i contenuti chiave e i volti."
i18n_source_hash: a4adf011b2bd
i18n_provenance: human
i18n_output_hash: 81ab6ede5596
---

# Ridimensionamento consapevole del contenuto {#content-aware-resize}

Ridimensionamento con seam carving che rimuove o aggiunge in modo intelligente pixel lungo i percorsi di minore importanza visiva, preservando i contenuti importanti e, opzionalmente, proteggendo i volti.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/content-aware-resize`

**Elaborazione:** Asincrona (restituisce 202, esegui il polling su `/api/v1/jobs/{jobId}/progress` per lo stato tramite SSE)

**Bundle del modello:** Nessuno richiesto per il funzionamento di base. La protezione dei volti usa il bundle `face-detection` (200-300 MB) se abilitata.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| file | file | Sì | - | File immagine (multipart) |
| width | number | No | - | Larghezza di destinazione in pixel |
| height | number | No | - | Altezza di destinazione in pixel |
| protectFaces | boolean | No | `false` | Rileva e proteggi i volti dalla rimozione delle seam |
| blurRadius | number | No | `4` | Raggio di sfocatura di pre-elaborazione per il calcolo dell'energia (0-20) |
| sobelThreshold | number | No | `2` | Soglia di rilevamento dei bordi Sobel (1-20). Valori più alti rendono l'algoritmo più aggressivo |
| square | boolean | No | `false` | Ridimensiona a un quadrato (usa la dimensione minore) |

È necessario specificare almeno uno tra `width`, `height` o `square`.

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/content-aware-resize \
  -F "file=@landscape.jpg" \
  -F 'settings={"width":800,"protectFaces":true}'
```

## Risposta {#response}

### Risposta iniziale (202 Accepted) {#initial-response-202-accepted}

```json
{
  "statusUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "progressUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890/progress",
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Risultato finale (tramite SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/landscape_seam.png",
    "originalSize": 450000,
    "processedSize": 380000,
    "width": 800,
    "height": 600
  }
}
```

## Note {#notes}

- Usa la libreria di seam carving `caire` per il ridimensionamento consapevole del contenuto.
- Riduce rimuovendo le seam o ingrandisce inserendole. Ogni lato può crescere al massimo fino al doppio della sua dimensione originale.
- L'opzione `protectFaces` usa il rilevamento dei volti con IA per contrassegnare le regioni dei volti come ad alta energia, impedendo alle seam di attraversare i volti.
- `blurRadius` controlla lo smoothing prima del calcolo della mappa di energia. Valori più alti rendono la mappa di energia più uniforme, il che può aiutare con le immagini rumorose.
- `sobelThreshold` influisce su quanto aggressivamente vengono rilevati i bordi. Valori più bassi preservano bordi più sottili.
- L'output è sempre in formato PNG.
- Supporta i formati di input HEIC/HEIF, RAW, TGA, PSD, EXR e HDR tramite decodifica automatica.
