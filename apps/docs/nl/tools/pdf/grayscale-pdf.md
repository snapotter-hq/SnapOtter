---
description: "Zet alle kleuren in een PDF om naar grijstinten."
i18n_source_hash: f327addb32d6
i18n_provenance: human
i18n_output_hash: 43d9bcfd65d9
---

# Grayscale PDF {#grayscale-pdf}

Zet alle kleuren in een PDF om naar grijstinten en produceer een zwart-witversie van het document.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/grayscale-pdf`

Accepteert multipart-formuliergegevens met een PDF-bestand. Er is geen veld `settings` vereist.

## Parameters {#parameters}

Dit hulpmiddel heeft geen instellingsparameters. Upload het PDF-bestand direct.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/grayscale-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- Alle kleurruimten (RGB, CMYK) worden omgezet naar grijstinten, inclusief ingebedde afbeeldingen, vectorafbeeldingen en tekst.
- Het uitvoerbestand is vaak kleiner dan het origineel omdat grijstintgegevens minder bytes per pixel vereisen.
