---
description: "Converte un file HTML in PDF."
i18n_source_hash: 20b9ae147db5
i18n_provenance: human
i18n_output_hash: b450c442bf2f
---

# HTML to PDF {#html-to-pdf}

Converte un file HTML in un documento PDF con stile. Le risorse remote (immagini, fogli di stile e script esterni) sono disabilitate per privacy.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/html-to-pdf`

Accetta dati form multipart con un file HTML.

## Parameters {#parameters}

Questo strumento non ha parametri configurabili. Carica un file HTML e verrà convertito in PDF.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/html-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page.html"
```

## Example Response {#example-response}

Restituisce `202 Accepted`. Monitora l'avanzamento tramite SSE su `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Formati di input accettati: `.html`, `.htm`.
- Le risorse remote (immagini, fogli di stile e script referenziati tramite URL) non vengono recuperate per privacy e sicurezza.
- Gli stili inline e le immagini incorporate (data URI) vengono preservati.
- La conversione è gestita da WeasyPrint sul server.
