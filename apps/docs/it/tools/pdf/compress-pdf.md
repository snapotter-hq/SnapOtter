---
description: "Riduci la dimensione del file PDF comprimendo le immagini incorporate."
i18n_source_hash: a8bb0baaca25
i18n_provenance: human
i18n_output_hash: 5e36dc29ec6b
---

# Comprimi PDF {#compress-pdf}

Riduci la dimensione del file PDF sottocampionando le immagini incorporate. Scegli tra un cursore di qualità o una dimensione file di destinazione.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/compress-pdf`

Accetta dati di form multipart con un file PDF e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"quality"` | Modalità di compressione: `quality` o `targetSize` |
| quality | integer | No | `75` | Qualità di compressione, 1-100 (più alto = meno compressione). Usato in modalità `quality` |
| targetSizeKb | number | No | - | Dimensione file di destinazione in kilobyte. Usato in modalità `targetSize` |

## Example Request {#example-request}

Comprimi per qualità:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

Comprimi a una dimensione di destinazione:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 500}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 5200000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- In modalità `quality`, i valori più bassi producono file più piccoli con maggiore degrado delle immagini.
- In modalità `targetSize`, una ricerca binaria trova il DPI più alto che rientra nella dimensione richiesta.
- Se la compressione ingrandirebbe il file, i byte originali vengono restituiti invariati.
- Il testo e i contenuti vettoriali non sono influenzati; vengono sottocampionate solo le immagini raster incorporate.
