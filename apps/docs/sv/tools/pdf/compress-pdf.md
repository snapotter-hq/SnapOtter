---
description: "Krymp PDF-filstorleken genom att komprimera inbäddade bilder."
i18n_source_hash: a8bb0baaca25
i18n_provenance: human
i18n_output_hash: 59ac5b7a87b8
---

# Compress PDF {#compress-pdf}

Minska PDF-filstorleken genom att nedsampla inbäddade bilder. Välj mellan ett kvalitetsreglage eller en målfilstorlek.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/compress-pdf`

Tar emot multipart-formulärdata med en PDF-fil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| mode | string | Nej | `"quality"` | Komprimeringsläge: `quality` eller `targetSize` |
| quality | integer | Nej | `75` | Komprimeringskvalitet, 1-100 (högre = mindre komprimering). Används i läget `quality` |
| targetSizeKb | number | Nej | - | Målfilstorlek i kilobyte. Används i läget `targetSize` |

## Example Request {#example-request}

Komprimera efter kvalitet:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

Komprimera till en målstorlek:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 500}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 5200000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- I läget `quality` ger lägre värden mindre filer med mer bildförsämring.
- I läget `targetSize` hittar en binärsökning den högsta DPI som får plats inom den begärda storleken.
- Om komprimeringen skulle förstora filen returneras originalbyten oförändrade.
- Text och vektorinnehåll påverkas inte; endast inbäddade rasterbilder nedsamplas.
