---
description: "Elimina pagine specifiche da un PDF."
i18n_source_hash: 003e460a047c
i18n_provenance: human
i18n_output_hash: 123cb1735e5b
---

# Rimuovi pagine {#remove-pages}

Elimina pagine specifiche da un PDF, mantenendo intatte tutte le pagine rimanenti.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/remove-pages`

Accetta dati di form multipart con un file PDF e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pages | string | Yes | - | Intervallo di pagine da rimuovere nella sintassi qpdf, es. `"3,5-7"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/remove-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"pages": "3,5-7"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- Non è possibile rimuovere tutte le pagine da un documento; deve rimanere almeno una pagina.
- Gli intervalli di pagine usano la sintassi qpdf: `3` per una singola pagina, `5-7` per un intervallo, e le virgole per combinare (es. `1,3,5-7`).
