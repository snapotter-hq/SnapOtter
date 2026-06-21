---
description: Convert Word documents to PDF.
---

# Word to PDF

Convert Word documents, OpenDocument text, RTF, or plain text files to PDF.

## API Endpoint

`POST /api/v1/tools/files/word-to-pdf`

Accepts multipart form data with a Word/ODT/RTF/TXT file.

## Parameters

This tool has no configurable parameters. Upload a document and it will be converted to PDF.

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/word-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx"
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

- Accepted input formats: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- Conversion is handled by LibreOffice running headless on the server.
- Fonts embedded in the document are used when available; otherwise system fonts are substituted.
- Headers, footers, tables, and images are preserved in the PDF output.
