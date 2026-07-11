---
description: "Rimuovi in modo permanente le occorrenze di testo da un PDF (redazione reale verificata)."
i18n_source_hash: 296ad2a701b2
i18n_provenance: human
i18n_output_hash: ef9a5ce301c4
---

# Redigi PDF {#redact-pdf}

Rimuovi in modo permanente le occorrenze di testo specificate da un PDF usando una redazione reale verificata. Il testo redatto viene rimosso completamente dal file, non semplicemente coperto con un riquadro nero.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/redact-pdf`

Accetta dati di form multipart con un file PDF e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| terms | string[] | Yes | - | Stringhe di testo da redigere (1-50 termini, ciascuno fino a 200 caratteri) |
| caseSensitive | boolean | No | `false` | Se la corrispondenza distingue tra maiuscole e minuscole |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/redact-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F 'settings={"terms": ["John Doe", "555-0123"], "caseSensitive": false}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract.pdf",
  "originalSize": 245000,
  "processedSize": 243000,
  "found": 7
}
```

## Notes {#notes}

- Formato di input accettato: `.pdf`.
- Questo è uno strumento veloce (sincrono) che restituisce direttamente il risultato.
- Questo esegue una redazione reale: il testo corrispondente viene rimosso dal flusso di contenuti del PDF, non semplicemente oscurato visivamente.
- Il campo `found` nella risposta indica quante occorrenze sono state redatte.
- Puoi redigere fino a 50 termini in una singola richiesta.
