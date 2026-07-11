---
description: Convert all colors in a PDF to grayscale.
---

# Grayscale PDF {#grayscale-pdf}

Convert all colors in a PDF to grayscale, producing a black-and-white version of the document.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/grayscale-pdf`

Accepts multipart form data with a PDF file. No `settings` field is required.

## Parameters {#parameters}

This tool has no settings parameters. Upload the PDF file directly.

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

- All color spaces (RGB, CMYK) are converted to grayscale, including embedded images, vector graphics, and text.
- The output file is often smaller than the original because grayscale data requires fewer bytes per pixel.
