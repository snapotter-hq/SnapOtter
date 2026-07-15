---
description: "Konvertera en PDF till arkivformatet PDF/A-2 för långtidsbevarande."
i18n_source_hash: 9c568a340b6f
i18n_provenance: human
i18n_output_hash: b40ae095488f
---

# PDF/A-konverterare {#pdf-a-convert}

Konvertera en PDF till arkivformatet PDF/A-2, lämpligt för långtidsbevarande och regelefterlevnad.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdfa-convert`

Tar emot multipart-formulärdata med en PDF-fil. Inget fält `settings` krävs.

## Parameters {#parameters}

Detta verktyg har inga inställningsparametrar. Ladda upp PDF-filen direkt.

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

- Utdata följer standarden PDF/A-2.
- PDF/A bäddar in alla teckensnitt och tillåter inte externa referenser, så utdatafilen kan bli större än originalet.
- Kryptering och JavaScript tas bort under konverteringen, eftersom de inte är tillåtna enligt PDF/A-standarden.
