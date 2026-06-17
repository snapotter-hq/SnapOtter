---
description: Convert an HTML file to PDF.
---

# HTML to PDF

Convert an HTML file to a styled PDF document. Remote resources (external images, stylesheets, scripts) are disabled for privacy.

## API Endpoint

`POST /api/v1/tools/html-to-pdf`

Accepts multipart form data with an HTML file.

## Parameters

This tool has no configurable parameters. Upload an HTML file and it will be converted to PDF.

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/html-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page.html"
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

- Accepted input formats: `.html`, `.htm`.
- Remote resources (images, stylesheets, scripts referenced via URLs) are not fetched for privacy and security.
- Inline styles and embedded images (data URIs) are preserved.
- Conversion is handled by WeasyPrint on the server.
