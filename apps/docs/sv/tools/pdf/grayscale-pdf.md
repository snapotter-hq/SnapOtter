---
description: "Konvertera alla färger i en PDF till gråskala."
i18n_source_hash: f327addb32d6
i18n_provenance: human
i18n_output_hash: 76bace77335e
---

# Grayscale PDF {#grayscale-pdf}

Konvertera alla färger i en PDF till gråskala och skapa en svartvit version av dokumentet.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/grayscale-pdf`

Tar emot multipart-formulärdata med en PDF-fil. Inget fält `settings` krävs.

## Parameters {#parameters}

Detta verktyg har inga inställningsparametrar. Ladda upp PDF-filen direkt.

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

- Alla färgrymder (RGB, CMYK) konverteras till gråskala, inklusive inbäddade bilder, vektorgrafik och text.
- Utdatafilen är ofta mindre än originalet eftersom gråskaledata kräver färre byte per pixel.
