---
description: "Extraheer platte tekst uit een PDF."
i18n_source_hash: 15a7bc1cdf8f
i18n_provenance: human
i18n_output_hash: ffbc8e1471fd
---

# PDF to Text {#pdf-to-text}

Extraheer alle leesbare platte tekst uit een PDF-document naar een tekstbestand.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-text`

Accepteert multipart-formuliergegevens met een PDF-bestand.

## Parameters {#parameters}

Dit hulpmiddel heeft geen configureerbare parameters. Upload een PDF en de tekstinhoud wordt geëxtraheerd.

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

- Geaccepteerd invoerformaat: `.pdf`.
- Dit is een snel (synchroon) hulpmiddel dat het resultaat direct teruggeeft.
- Het veld `chars` in het antwoord geeft het aantal geëxtraheerde tekens aan.
- Alleen digitaal ingebedde tekst wordt geëxtraheerd. Gebruik voor gescande documenten of op afbeeldingen gebaseerde PDF's het hulpmiddel [PDF OCR](./ocr-pdf).
