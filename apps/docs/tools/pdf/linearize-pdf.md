---
description: Linearize a PDF for fast web viewing (progressive download).
---

# Web-Optimize PDF {#web-optimize-pdf}

Linearize a PDF so it can be progressively downloaded and displayed in web browsers without waiting for the full file.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/linearize-pdf`

Accepts multipart form data with a PDF file. No `settings` field is required.

## Parameters {#parameters}

This tool has no settings parameters. Upload the PDF file directly.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/linearize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2460000
}
```

## Notes {#notes}

- Linearization rearranges the PDF's internal structure so the first page can render before the full file has downloaded.
- The output file may be slightly larger than the input due to the added linearization data.
- Already-linearized PDFs are re-linearized without issue.
