---
description: "Converti un PDF nel formato di archiviazione PDF/A-2 per la conservazione a lungo termine."
i18n_source_hash: 9c568a340b6f
i18n_provenance: human
i18n_output_hash: 0c278573d75d
---

# Convertitore PDF/A {#pdf-a-convert}

Converti un PDF nel formato di archiviazione PDF/A-2, adatto alla conservazione a lungo termine e alla conformità normativa.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdfa-convert`

Accetta dati di form multipart con un file PDF. Non è richiesto alcun campo `settings`.

## Parameters {#parameters}

Questo strumento non ha parametri di configurazione. Carica direttamente il file PDF.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdfa-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2600000
}
```

## Notes {#notes}

- L'output è conforme allo standard PDF/A-2.
- PDF/A incorpora tutti i caratteri e non consente riferimenti esterni, quindi il file di output potrebbe essere più grande dell'originale.
- La crittografia e JavaScript vengono rimossi durante la conversione, poiché non sono consentiti dallo standard PDF/A.
