---
description: "Leggi e scrivi i metadati di un documento PDF."
i18n_source_hash: b2eaebf7467f
i18n_provenance: human
i18n_output_hash: d159f5e78a41
---

# Metadati PDF {#pdf-metadata}

Leggi e aggiorna i campi dei metadati di un documento PDF come titolo, autore, oggetto e parole chiave. Quando non vengono fornite impostazioni, i metadati esistenti vengono restituiti senza modifiche.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

Accetta dati di form multipart con un file PDF e un campo JSON opzionale `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| title | string | No | - | Titolo del documento (max 500 caratteri) |
| author | string | No | - | Autore del documento (max 500 caratteri) |
| subject | string | No | - | Oggetto del documento (max 500 caratteri) |
| keywords | string | No | - | Parole chiave del documento (max 500 caratteri) |

Tutti i parametri sono opzionali. I campi omessi restano invariati.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## Notes {#notes}

- Formato di input accettato: `.pdf`.
- Questo è uno strumento veloce (sincrono) che restituisce direttamente il risultato.
- Il campo `metadata` nella risposta contiene i metadati risultanti dopo eventuali aggiornamenti.
- Per leggere i metadati senza modificarli, ometti il campo `settings` o invia un oggetto vuoto.
- Ogni campo dei metadati è limitato a 500 caratteri.
