---
description: "Ridimensionamento con seam carving che aggiunge o rimuove pixel lungo i percorsi di minore importanza per preservare i contenuti chiave e i volti."
i18n_source_hash: f383b28ab62a
i18n_provenance: human
i18n_output_hash: 1872983e96e1
---

# Ridimensionamento consapevole del contenuto {#content-aware-resize}

Ridimensionamento con seam carving che rimuove o aggiunge in modo intelligente pixel lungo i percorsi di minore importanza visiva, preservando i contenuti importanti e, opzionalmente, proteggendo i volti.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/content-aware-resize`

**Elaborazione:** Sincrona (restituisce il risultato direttamente)

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

## Risposta (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/landscape_seam.png",
  "originalSize": 450000,
  "processedSize": 380000,
  "width": 800,
  "height": 600
}
```

## Note {#notes}

- Questa route personalizzata attualmente restituisce una risposta sincrona 200.
- Usa la libreria di seam carving `caire` per il ridimensionamento consapevole del contenuto.
- Riduce solo le dimensioni (rimuove le seam). Non può espandere un'immagine oltre la sua dimensione originale.
- L'opzione `protectFaces` usa il rilevamento dei volti con IA per contrassegnare le regioni dei volti come ad alta energia, impedendo alle seam di attraversare i volti.
- `blurRadius` controlla lo smoothing prima del calcolo della mappa di energia. Valori più alti rendono la mappa di energia più uniforme, il che può aiutare con le immagini rumorose.
- `sobelThreshold` influisce su quanto aggressivamente vengono rilevati i bordi. Valori più bassi preservano bordi più sottili.
- L'output è sempre in formato PNG.
- Supporta i formati di input HEIC/HEIF, RAW, TGA, PSD, EXR e HDR tramite decodifica automatica.
