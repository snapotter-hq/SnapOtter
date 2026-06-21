---
description: Convert a PDF to a Word document (DOCX).
---

# PDF to Word

Convert a text-based PDF to a Word document (DOCX). Best suited for PDFs with selectable text; scanned pages will need OCR first.

## API Endpoint

`POST /api/v1/tools/pdf/pdf-to-word`

Accepts multipart form data with a PDF file.

## Parameters

This tool has no configurable parameters. Upload a PDF and it will be converted to DOCX.

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-word \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response

Returns `202 Accepted`. Track progress via SSE at `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes

- Accepted input format: `.pdf`.
- Works best with text-based PDFs. Scanned or image-only pages will produce empty or minimal output; use [PDF OCR](./ocr-pdf) to add a text layer first.
- Conversion is handled by LibreOffice running headless on the server.
- Complex layouts (multi-column, overlapping elements) may not convert perfectly.
