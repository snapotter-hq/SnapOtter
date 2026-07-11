---
description: "Converteer een PDF naar het archief-PDF/A-2-formaat voor langdurige bewaring."
i18n_source_hash: 4c6bf7a12e84
i18n_provenance: human
i18n_output_hash: 75010fc5a155
---

# PDF/A Convert {#pdf-a-convert}

Converteer een PDF naar het PDF/A-2-archiefformaat, geschikt voor langdurige bewaring en naleving van regelgeving.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdfa-convert`

Accepteert multipart-formuliergegevens met een PDF-bestand. Er is geen veld `settings` vereist.

## Parameters {#parameters}

Dit hulpmiddel heeft geen instellingsparameters. Upload het PDF-bestand direct.

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

- De uitvoer voldoet aan de PDF/A-2-standaard.
- PDF/A bedt alle lettertypen in en staat geen externe verwijzingen toe, dus het uitvoerbestand kan groter zijn dan het origineel.
- Versleuteling en JavaScript worden tijdens de conversie verwijderd, aangezien ze niet zijn toegestaan door de PDF/A-standaard.
