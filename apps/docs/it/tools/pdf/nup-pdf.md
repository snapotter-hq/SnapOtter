---
description: "Disponi più pagine PDF per foglio (2-up, 4-up, ecc.)."
i18n_source_hash: 9dd82737cb72
i18n_provenance: human
i18n_output_hash: 82856ec4f5a3
---

# PDF N-up {#n-up-pdf}

Disponi più pagine per foglio per risparmiare carta in fase di stampa, ad esempio con layout 2-up o 4-up.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/nup-pdf`

Accetta dati di form multipart con un file PDF e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| perSheet | integer | No | `2` | Pagine per foglio: `2`, `3`, `4`, `8`, `9`, `12`, o `16` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/nup-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2300000
}
```

## Notes {#notes}

- Le pagine sono disposte in ordine di lettura (da sinistra a destra, dall'alto verso il basso).
- La dimensione della pagina di output corrisponde a quella originale; le singole pagine vengono ridimensionate per adattarsi alla griglia.
- Un documento di 20 pagine con `perSheet: 4` produce un output di 5 pagine.
