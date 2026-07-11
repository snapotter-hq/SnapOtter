---
description: "Combina più PDF in un unico documento."
i18n_source_hash: e82e389cb8b6
i18n_provenance: human
i18n_output_hash: 5308873ba0e9
---

# Unisci PDF {#merge-pdfs}

Combina due o più file PDF in un unico documento, preservando l'ordine delle pagine di ciascun file di input.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/merge-pdf`

Accetta dati di form multipart con due o più file PDF. Non è richiesto alcun campo `settings`.

## Parameters {#parameters}

Questo strumento non ha parametri di configurazione. Basta caricare due o più file PDF.

| Constraint | Value |
|------------|-------|
| File minimi | 2 |
| File massimi | 20 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/merge-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document1.pdf" \
  -F "file=@document2.pdf" \
  -F "file=@document3.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.pdf",
  "originalSize": 4500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- I file vengono uniti nell'ordine in cui vengono caricati.
- Sono richiesti almeno due file PDF; la richiesta fallirà con un errore 400 se ne vengono forniti meno.
- Il numero massimo di file di input è 20.
- I PDF crittografati devono essere sbloccati prima dell'unione.
