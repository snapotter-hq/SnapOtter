---
description: "Riordina le pagine di un PDF con un ordine di pagina esplicito."
i18n_source_hash: e961fc895b4b
i18n_provenance: human
i18n_output_hash: c7678cecdae6
---

# Organizza PDF {#organize-pdf}

Riordina le pagine di un PDF specificando la sequenza di pagine desiderata.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/organize-pdf`

Accetta dati di form multipart con un file PDF e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| order | string | Yes | - | Ordine di pagina desiderato nella sintassi qpdf, es. `"3,1,2,5-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/organize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"order": "3,1,2,5-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- Gli intervalli di pagine usano la sintassi qpdf: `3,1,2` riordina le prime tre pagine, e `5-z` aggiunge le pagine da 5 fino all'ultima.
- Le pagine possono essere duplicate elencandole più di una volta (es. `"1,1,2,3"` duplica la pagina 1).
- Le pagine non elencate nella stringa dell'ordine vengono omesse dall'output.
