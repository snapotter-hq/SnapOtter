---
description: Convert a Markdown file to a standalone HTML page.
---

# Markdown to HTML

Convert a Markdown file to a standalone HTML page. Remote images referenced in the source are left as-is in the output.

## API Endpoint

`POST /api/v1/tools/markdown-to-html`

Accepts multipart form data with a Markdown file.

## Parameters

This tool has no configurable parameters. Upload a Markdown file and it will be converted to HTML.

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/markdown-to-html \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@notes.md"
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/notes.html",
  "originalSize": 3200,
  "processedSize": 5800
}
```

## Notes

- Accepted input formats: `.md`, `.markdown`.
- This is a fast (synchronous) tool that returns the result directly.
- The output is a self-contained HTML page with inline styles.
- Remote image URLs in the Markdown source are preserved as-is and not fetched.
