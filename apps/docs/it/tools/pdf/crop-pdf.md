---
description: "Ritaglia tutte le pagine di un PDF con un margine uniforme."
i18n_source_hash: ffa1a2cee08d
i18n_provenance: human
i18n_output_hash: 14d0d10f3c50
---

# Ritaglia PDF {#crop-pdf}

Ritaglia tutte le pagine di un PDF applicando un margine uniforme, rimuovendo il contenuto da ciascun bordo in modo uguale.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

Accetta dati di form multipart con un file PDF e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| margin | number | No | `20` | Margine di ritaglio uniforme in punti (0-2000) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- Il valore del margine è espresso in punti PDF (1 punto = 1/72 di pollice).
- Lo stesso margine viene applicato a tutti e quattro i bordi di ogni pagina.
- Un margine di `0` rimuove tutti i margini di ritaglio esistenti, mostrando l'intero media box.
