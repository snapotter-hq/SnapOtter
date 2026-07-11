---
description: "Incorpora moduli e annotazioni nel contenuto della pagina."
i18n_source_hash: b25c2a2b6f40
i18n_provenance: human
i18n_output_hash: 27ceab164538
---

# Appiattisci PDF {#flatten-pdf}

Incorpora i campi modulo interattivi e le annotazioni nel contenuto della pagina, producendo un PDF statico che appare identico ovunque.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/flatten-pdf`

Accetta dati di form multipart con un file PDF.

## Parameters {#parameters}

Questo strumento non ha parametri configurabili. Carica un PDF e tutti i moduli e le annotazioni verranno appiattiti.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/flatten-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@form.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/form.pdf",
  "originalSize": 185000,
  "processedSize": 172000
}
```

## Notes {#notes}

- Formato di input accettato: `.pdf`.
- Questo è uno strumento veloce (sincrono) che restituisce direttamente il risultato.
- I valori dei campi modulo vengono conservati come testo statico nell'output.
- Le annotazioni (commenti, evidenziazioni, note adesive) diventano parte del contenuto della pagina e non possono più essere modificate.
