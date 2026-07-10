---
description: "Extrahera vanlig text från en PDF."
i18n_source_hash: 15a7bc1cdf8f
i18n_provenance: human
i18n_output_hash: ea7a25764301
---

# PDF to Text {#pdf-to-text}

Extrahera all läsbar vanlig text från ett PDF-dokument till en textfil.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-text`

Tar emot multipart-formulärdata med en PDF-fil.

## Parameters {#parameters}

Detta verktyg har inga konfigurerbara parametrar. Ladda upp en PDF så extraheras dess textinnehåll.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.txt",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

## Notes {#notes}

- Godkänt indataformat: `.pdf`.
- Detta är ett snabbt (synkront) verktyg som returnerar resultatet direkt.
- Fältet `chars` i svaret anger antalet extraherade tecken.
- Endast digitalt inbäddad text extraheras. För skannade dokument eller bildbaserade PDF-filer, använd verktyget [PDF OCR](./ocr-pdf) istället.
