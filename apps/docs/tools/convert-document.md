---
description: Convert between Word, OpenDocument, RTF, and plain text formats.
---

# Convert Document

Convert documents between Word (DOCX), OpenDocument (ODT), RTF, and plain text formats using LibreOffice.

## API Endpoint

`POST /api/v1/tools/convert-document`

Accepts multipart form data with a Word/ODT/RTF/TXT file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Output format: `docx`, `odt`, `rtf`, `txt` |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/convert-document \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx" \
  -F 'settings={"format": "odt"}'
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
- Complex formatting (macros, embedded objects) may not survive conversion between formats.
- The output format must differ from the input format.
