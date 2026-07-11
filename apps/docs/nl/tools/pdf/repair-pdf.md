---
description: "Probeer een beschadigde of corrupte PDF te repareren."
i18n_source_hash: 864073a2f09f
i18n_provenance: human
i18n_output_hash: 085995aa0a81
---

# Repair PDF {#repair-pdf}

Probeer een beschadigde of corrupte PDF te repareren door de interne structuur ervan te reconstrueren.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/repair-pdf`

Accepteert multipart-formuliergegevens met een PDF-bestand. Er is geen veld `settings` vereist.

## Parameters {#parameters}

Dit hulpmiddel heeft geen instellingsparameters. Upload het beschadigde PDF-bestand direct.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/repair-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@damaged.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/damaged.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notes {#notes}

- Structurele validatie wordt bij invoer overgeslagen om misvormde bestanden door te laten.
- Reparatie is een best-effort; ernstig corrupte bestanden zijn mogelijk niet volledig te herstellen.
- De gerepareerde PDF kan qua grootte iets afwijken van het origineel vanwege gereconstrueerde kruisverwijzingstabellen.
