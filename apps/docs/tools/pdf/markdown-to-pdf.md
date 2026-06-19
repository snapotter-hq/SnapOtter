---
description: Convert a Markdown file to a styled PDF.
---

# Markdown to PDF

Convert a Markdown file to a styled PDF document. Remote resources are disabled for privacy.

## API Endpoint

`POST /api/v1/tools/markdown-to-pdf`

Accepts multipart form data with a Markdown file.

## Parameters

This tool has no configurable parameters. Upload a Markdown file and it will be converted to PDF.

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/markdown-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.md"
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

- Accepted input formats: `.md`, `.markdown`.
- Remote resources (images, stylesheets referenced via URLs) are not fetched for privacy and security.
- The Markdown is first rendered to HTML, then converted to PDF via WeasyPrint.
- Code blocks, tables, and other Markdown elements are styled in the PDF output.
