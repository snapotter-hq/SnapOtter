---
description: Convert a PDF to archival PDF/A-2 format for long-term preservation.
---

# PDF/A Convert

Convert a PDF to the PDF/A-2 archival format, suitable for long-term preservation and regulatory compliance.

## API Endpoint

`POST /api/v1/tools/pdf/pdfa-convert`

Accepts multipart form data with a PDF file. No `settings` field is required.

## Parameters

This tool has no settings parameters. Upload the PDF file directly.

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdfa-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2600000
}
```

## Notes

- The output conforms to the PDF/A-2 standard.
- PDF/A embeds all fonts and disallows external references, so the output file may be larger than the original.
- Encryption and JavaScript are stripped during conversion, as they are not permitted by the PDF/A standard.
