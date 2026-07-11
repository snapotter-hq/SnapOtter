---
description: "Estrai pagine selezionate da un PDF in un nuovo documento."
i18n_source_hash: e4a8fad31e0f
i18n_provenance: human
i18n_output_hash: 920d2f470fbd
---

# Estrai pagine {#extract-pages}

Estrai pagine selezionate da un PDF in un documento nuovo e più piccolo.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/extract-pages`

Accetta dati di form multipart con un file PDF e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| range | string | Yes | - | Intervallo di pagine nella sintassi qpdf, es. `"1-5,8,10-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/extract-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"range": "1-5,8,10-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 1100000
}
```

## Notes {#notes}

- Gli intervalli di pagine usano la sintassi qpdf: `1-5` per le pagine da 1 a 5, `z` per l'ultima pagina, e le virgole per combinare gli intervalli (es. `1-3,7,10-z`).
- Le pagine estratte mantengono la formattazione, le annotazioni e i collegamenti originali.
