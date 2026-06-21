---
description: Extract plain text from a PDF.
---

# PDF to Text

Extract all readable plain text from a PDF document into a text file.

## API Endpoint

`POST /api/v1/tools/pdf/pdf-to-text`

Accepts multipart form data with a PDF file.

## Parameters

This tool has no configurable parameters. Upload a PDF and its text content will be extracted.

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.txt",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

## Notes

- Accepted input format: `.pdf`.
- This is a fast (synchronous) tool that returns the result directly.
- The `chars` field in the response indicates the number of characters extracted.
- Only digitally embedded text is extracted. For scanned documents or image-based PDFs, use the [PDF OCR](./ocr-pdf) tool instead.
