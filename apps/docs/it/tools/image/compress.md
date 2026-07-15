---
description: "Riduci la dimensione del file immagine per livello di qualità o verso una dimensione file di destinazione."
i18n_source_hash: 342c5cf1f864
i18n_provenance: human
i18n_output_hash: 5518fb5e2f68
---

# Comprimi Immagine {#compress}

Riduci la dimensione del file immagine specificando un livello di qualità o una dimensione file di destinazione in kilobyte. Lo strumento usa una ricerca binaria iterativa per raggiungere con precisione le dimensioni di destinazione.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/compress`

Accetta dati di form multipart con un file immagine e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"quality"` | Modalità di compressione: `quality` o `targetSize` |
| quality | number | No | `80` | Livello di qualità (1-100). Usato quando la modalità è `quality`. |
| targetSizeKb | number | No | - | Dimensione file di destinazione in kilobyte. Usata quando la modalità è `targetSize`. |

## Esempio di richiesta {#example-request}

Comprimi a qualità 60:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

Comprimi a una dimensione di destinazione di 200 KB:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 200}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 204800
}
```

## Note {#notes}

- In modalità `quality`, valori più bassi producono file più piccoli con più artefatti di compressione. Un valore di 80 è un buon predefinito per l'uso web.
- In modalità `targetSize`, il motore esegue una compressione iterativa per avvicinarsi il più possibile alla destinazione senza superarla.
- Il formato di output corrisponde al formato di input. La compressione si applica alla codifica nativa del formato (es. qualità JPEG per i file JPEG, qualità WebP per i file WebP).
- Se la qualità predefinita (80) è accettabile, puoi omettere completamente il parametro `quality`.
